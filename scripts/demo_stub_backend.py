"""MycoGuard DEMO VISION BACKEND (record-time only -- not part of the app).

Why this exists: the published MycoGuard recording never ran the photo analysis
at all (the recorder clicked the "Photo ID" *tab* but never the analyse button),
so "vision-derived traits merged into the verdict" was never demonstrated. The
app's own vision path needs DASHSCOPE_API_KEY, which is not configured here.

This launcher builds the REAL app (`create_app`) with an `httpx.MockTransport`
injected through the app's own dependency-injection seam
(`create_app(vision_llm=...)`, the same seam its tests use). Everything
downstream of the model call is the real code path: the real PROMPT, the real
`_extract_json`, the real `_sanitize` whitelist, the real NON_VISUAL_TRAITS
guard, the real warning plumbing, and the real frontend normalise/merge/engine.

The canned model answer stands in for qwen-vl-plus, so the UI state shown is a
REAL render of the app driven by a STUBBED model output. It is a demo fixture,
not a measured model result -- stated as such in the manifest and the report.

Usage (from the repo root):
    .venv/Scripts/python.exe scripts/demo_stub_backend.py --port 8000 --latency 2.5
Then open http://127.0.0.1:8000/ — this process serves ../dist and the API together.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

import httpx

# Repo root is the parent of this script's directory.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.main import create_app  # noqa: E402
from app.services.llm_client import LLMClient  # noqa: E402

# A qwen-vl-plus-shaped answer for samples/amanita-test.jpg (fly agaric photographed
# in situ: red cap with white flecks, white gills, ringed white stipe, woodland).
# `odor` and `stalkRoot` are included DELIBERATELY: the prompt forbids them, so the
# real sanitizer must drop them and the UI must surface that as a warning chip.
CANNED_NOTES = {
    "en": "Red cap with white flecks on a white, ringed stipe; white gills; grows on the forest floor.",
    # Same observation, in the language a real qwen-vl-plus call would use when the
    # prompt is Chinese (the app's PROMPT is Chinese), so the zh recording does not
    # show an English sentence inside a Chinese UI.
    "zh": "红色菌盖上散布白色鳞片，菌柄白色且有菌环；菌褶白色；生于林地上。",
}

CANNED_VISION = {
    "species_guess": "Amanita muscaria",
    "confidence": 0.86,
    "traits": {
        "capColor": "r",
        "capSurface": "y",
        "capShape": "x",
        "gillColor": "w",
        "gillSize": "n",
        "ringNumber": "o",
        "ringType": "p",
        "habitat": "d",
        "population": "y",
        "odor": "n",       # -> must be dropped by the sanitizer
        "stalkRoot": "b",  # -> must be dropped by the sanitizer
    },
    "notes": CANNED_NOTES["en"],
}

# Chat: no key configured -> answer_question falls back to the built-in knowledge
# base (mode="rule"), which is the app's genuine offline path.

_vision_calls = 0
_LATENCY_S = 2.5
_NOTES_LANG = "en"


def handler(request: httpx.Request) -> httpx.Response:
    global _vision_calls
    _vision_calls += 1
    body = json.loads(request.content.decode("utf-8"))
    # Which language is the UI in? The app's PROMPT is Chinese, so the model has
    # no way to know; infer it from the page the request came from. A real
    # deployment would send the UI language explicitly (or use a zh prompt for a
    # zh UI); here we mirror the recording so neither take shows the other
    # language's sentence inside its UI.
    notes_lang = _NOTES_LANG
    if _NOTES_LANG == "auto":
        # The app's PROMPT is Chinese, so the real model cannot tell which UI
        # language is on screen. The recorder tags its /api/analyze call with the
        # take's language (X-Demo-Lang); we echo it back in `notes` so neither
        # recording shows the other language's sentence inside its own UI.
        notes_lang = (request.headers.get("x-demo-lang")
                      or os.environ.get("MYCO_DEMO_NOTES_LANG")
                      or "en").strip().lower()
        if notes_lang not in CANNED_NOTES:
            notes_lang = "en"
    # Configurable model latency. A local stub answers in ~1 ms, which makes the
    # app's genuine "analysing..." spinner flash for one frame. Real qwen-vl-plus
    # takes seconds; delaying by the observed real-world order of magnitude keeps
    # the recorded running state honest and readable rather than invisible.
    if _LATENCY_S > 0:
        time.sleep(_LATENCY_S)
    print(f"[demo-stub] vision call #{_vision_calls} model={body.get('model')} "
          f"(+{_LATENCY_S}s, notes={notes_lang}, referer={request.headers.get('referer', '-')})",
          flush=True)
    payload = dict(CANNED_VISION)
    payload["notes"] = CANNED_NOTES[notes_lang]
    return httpx.Response(
        200,
        json={"choices": [{"message": {"content": json.dumps(payload)}}]},
    )


def _normalise_warning_text(original):
    """Reduce each drop-warning to the bare trait name it names.

    The REAL `_sanitize` decides what is dropped and the REAL `analyze_image`
    emits one warning per dropped trait. That wrapper sentence is Chinese-only
    (it is not in `TRANSLATIONS`), so an English run would paint Chinese prose
    inside an otherwise-English chip. The frontend already labels the chip in
    both languages ("...已丢弃："/"...discarded: "), so echoing the sentence
    there duplicates it in one language only.

    What is unchanged: WHICH traits were dropped, and that they were dropped by
    the real guard. What changes: the wrapper prose. This wrapper is applied by
    the demo launcher only -- the app's own code is untouched.
    """
    def wrapped(llm, image_bytes, mime):
        result = original(llm, image_bytes, mime)
        names = []
        for warning in result.get("warnings", []):
            # the sanitizer formats: "模型报告了无法从照片观察的性状 <name>，已丢弃（...）"
            tail = warning.split("性状", 1)[-1].lstrip()
            names.append(tail.split("，", 1)[0].strip())
        result["warnings"] = [n for n in names if n]
        return result

    return wrapped


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--latency", type=float, default=2.5,
                    help="seconds to wait before answering the model call")
    ap.add_argument("--notes-lang", choices=["en", "zh", "auto"], default="auto",
                    help="language of the model's `notes` field; 'auto' reads the "
                         "MYCO_DEMO_NOTES_LANG env var per request (set by the recorder)")
    args = ap.parse_args()
    global _LATENCY_S, _NOTES_LANG
    _LATENCY_S = args.latency
    _NOTES_LANG = args.notes_lang

    vision_llm = LLMClient(
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        api_key="demo-stub-key",
        model="qwen-vl-plus",
        transport=httpx.MockTransport(handler),
    )
    # Apply the warning-text wrapper BEFORE create_app: the /api/analyze route
    # closes over the module-level `analyze_image` at decoration time, so the
    # patch has to be in place first.
    import app.main as main_mod

    main_mod.analyze_image = _normalise_warning_text(main_mod.analyze_image)

    # chat_llm=None -> real offline knowledge-base path.
    app = create_app(vision_llm=vision_llm, chat_llm=None)

    import uvicorn

    print(f"[demo-stub] serving dist + API on http://127.0.0.1:{args.port}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
