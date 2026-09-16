"""Vision analysis: validate/prepare an uploaded image, call qwen-vl-plus
through the OpenAI-compatible endpoint, then parse and sanitize its output.

MODALITY CONTRACT (safety-critical): the model may only report traits that a
photograph of an intact specimen can actually show. Olfaction and excavation
are different modalities, so `odor` and `stalk-root` are excluded from the
prompt AND from the whitelist, and `_sanitize` drops them even when the model
returns them anyway. Both are heavily weighted in the rule engine (`odor` is a
6.0 critical risk rule and a 3.5 safety anchor), so a hallucinated "almond
odor" read off a still image could have pushed a verdict towards low risk.

The rest of the output is strictly whitelisted: only known trait codes survive,
confidence is clamped to [0, 1], and any malformed JSON raises LLMError so the
API layer can return a clean 502 instead of crashing.
"""
from __future__ import annotations

import base64
import io
import json
import re

from PIL import Image

from .llm_client import LLMError

ALLOWED_MIMES = {"image/jpeg", "image/png", "image/webp"}
MAX_EDGE = 1024

# Traits the engine scores that CANNOT be established from a photo:
#   odor      — olfaction, a different modality entirely;
#   stalkRoot — underground; exposing it requires uprooting the specimen, so a
#               photo of the mushroom in place cannot show it.
# Kept as an explicit denylist (not just "absent from the whitelist") so the
# reason is reviewable and the sanitizer can report what it dropped.
NON_VISUAL_TRAITS = frozenset({"odor", "stalkRoot"})

# Whitelist of valid trait codes, mirroring src/types.ts in the frontend.
TRAIT_VOCAB: dict[str, set[str]] = {
    "capShape": {"b", "c", "x", "f", "k", "s"},
    "capSurface": {"f", "g", "y", "s"},
    "capColor": {"n", "b", "c", "g", "r", "p", "u", "e", "w", "y"},
    "bruises": {"t", "f"},
    "gillSize": {"b", "n"},
    "gillSpacing": {"c", "w", "d"},
    "gillColor": {"k", "n", "b", "h", "g", "r", "o", "p", "u", "e", "w", "y"},
    "stalkShape": {"e", "t"},
    "stalkSurfaceAbove": {"f", "y", "k", "s"},
    "stalkSurfaceBelow": {"f", "y", "k", "s"},
    "stalkColorAbove": {"n", "b", "c", "o", "p", "e", "w", "y"},
    "stalkColorBelow": {"n", "b", "c", "o", "p", "e", "w", "y"},
    "veilType": {"p", "u"},
    "veilColor": {"n", "o", "w", "y"},
    "ringNumber": {"n", "o", "t"},
    "ringType": {"c", "e", "f", "l", "n", "p", "s", "z"},
    "sporePrintColor": {"k", "n", "b", "h", "r", "o", "u", "w", "y"},
    "population": {"a", "c", "n", "s", "v", "y"},
    "habitat": {"g", "l", "m", "p", "u", "w", "d"},
    "gillAttachment": {"a", "d", "f", "n"},
}
assert NON_VISUAL_TRAITS.isdisjoint(TRAIT_VOCAB), "non-visual traits must not be reportable"

PROMPT = (
    "你是一名真菌学野外助手。请分析这张蘑菇照片，并只输出一个 JSON 对象"
    "（不要任何额外文字或 Markdown 代码块），格式如下：\n"
    '{"species_guess": "物种名称或 null", "confidence": 0到1的小数, '
    '"traits": {...}, "notes": "1-2句可见特征描述"}\n'
    "traits 只能包含你能在照片中明确看到的性状，键值必须来自以下代码表：\n"
    "capShape: b|c|x|f|k|s；capSurface: f|g|y|s；"
    "capColor: n|b|c|g|r|p|u|e|w|y；bruises: t|f；gillSize: b|n；"
    "gillSpacing: c|w|d；gillColor: k|n|b|h|g|r|o|p|u|e|w|y；"
    "gillAttachment: a|d|f|n；stalkShape: e|t；"
    "stalkSurfaceAbove: f|y|k|s；stalkSurfaceBelow: f|y|k|s；"
    "stalkColorAbove: n|b|c|o|p|e|w|y；stalkColorBelow: n|b|c|o|p|e|w|y；"
    "veilType: p|u；veilColor: n|o|w|y；ringNumber: n|o|t；ringType: c|e|f|l|n|p|s|z；"
    "sporePrintColor(仅当照片中可见): k|n|b|h|r|o|u|w|y；"
    "population: a|c|n|s|v|y；habitat: g|l|m|p|u|w|d。\n"
    "规则：只记录照片中实际可见的性状，看不到的绝不猜测；"
    "气味（odor）无法从照片判断，绝不能报告；菌柄根部（stalkRoot）埋在土里，"
    "照片无法显示，也绝不能报告；任何需要闻、摸、尝或挖掘才能确定的性状都不要报告。"
    "若无法识别物种，species_guess 设为 null 且 confidence 设为 0。"
)


class VisionError(Exception):
    """Raised for invalid image input (bad mime / unreadable bytes)."""


def prepare_image(image_bytes: bytes, mime: str) -> tuple[str, str]:
    """Validate, downscale and re-encode an image; returns (mime, base64 data URL body).

    Re-encoding with Pillow also strips EXIF / metadata for privacy.
    """
    if mime not in ALLOWED_MIMES:
        raise VisionError(f"不支持的图片类型: {mime}（仅支持 jpeg/png/webp）")
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.load()
    except Exception as exc:
        raise VisionError("无法解析图片文件，请上传清晰的 jpeg/png/webp 图片") from exc

    img = img.convert("RGB")
    if max(img.size) > MAX_EDGE:
        img.thumbnail((MAX_EDGE, MAX_EDGE))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return "image/jpeg", b64


def _extract_json(raw: str) -> dict:
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text).strip()
    text = re.sub(r"\s*```$", "", text).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise LLMError("模型输出中未找到 JSON 对象")
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise LLMError(f"模型输出不是合法 JSON: {exc}") from exc


def _sanitize(data: dict) -> dict:
    species = data.get("species_guess")
    if not isinstance(species, str) or not species.strip():
        species = None
    else:
        species = species.strip()[:80]

    try:
        conf = float(data.get("confidence") or 0)
    except (TypeError, ValueError):
        conf = 0.0
    conf = min(1.0, max(0.0, conf))

    traits: dict[str, str] = {}
    dropped: list[str] = []
    raw_traits = data.get("traits")
    if isinstance(raw_traits, dict):
        for key, value in raw_traits.items():
            if key in NON_VISUAL_TRAITS:
                # Defence in depth: the prompt forbids these, but a model that
                # returns them anyway must not reach the rule engine.
                dropped.append(key)
                continue
            if key in TRAIT_VOCAB and isinstance(value, str) and value in TRAIT_VOCAB[key]:
                traits[key] = value

    notes = data.get("notes")
    if not isinstance(notes, str):
        notes = ""
    notes = notes.strip()[:300]

    return {
        "species_guess": species,
        "confidence": conf,
        "traits": traits,
        "notes": notes,
        "dropped_traits": dropped,
    }


def analyze_image(llm, image_bytes: bytes, mime: str) -> dict:
    out_mime, b64 = prepare_image(image_bytes, mime)
    content = [
        {"type": "text", "text": PROMPT},
        {"type": "image_url", "image_url": {"url": f"data:{out_mime};base64,{b64}"}},
    ]
    raw = llm.chat_completion(
        messages=[{"role": "user", "content": content}],
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    result = _sanitize(_extract_json(raw))
    # Surface the drops instead of hiding them: a model that "smelled" the
    # mushroom is a hallucination signal the user deserves to see.
    warnings = [
        f"模型报告了无法从照片观察的性状 {name}，已丢弃（不同模态，不可由图像推断）"
        for name in result.pop("dropped_traits")
    ]
    result["status"] = "ok"
    result["warnings"] = warnings
    return result
