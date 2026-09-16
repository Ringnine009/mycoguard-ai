"""Tests for the vision proxy: image preparation + qwen-vl-plus parsing/sanitizing."""
import base64
import json

import httpx
import pytest

from app.services.llm_client import LLMClient, LLMError
from app.services.vision import analyze_image, prepare_image, VisionError

# A valid 1x1 transparent PNG.
PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


def make_llm(payload: str, assert_auth: bool = True) -> LLMClient:
    def handler(request: httpx.Request) -> httpx.Response:
        if assert_auth:
            assert request.headers.get("Authorization", "").startswith("Bearer sk-test")
        return httpx.Response(200, json={"choices": [{"message": {"content": payload}}]})

    return LLMClient(
        base_url="https://llm.example.com/compatible-mode/v1",
        api_key="sk-test",
        model="qwen-vl-plus",
        transport=httpx.MockTransport(handler),
    )


class TestPrepareImage:
    def test_rejects_unsupported_mime(self):
        with pytest.raises(VisionError):
            prepare_image(b"plain text", "text/plain")

    def test_rejects_garbage_bytes(self):
        with pytest.raises(VisionError):
            prepare_image(b"not an image at all", "image/png")

    def test_accepts_png_and_returns_jpeg(self):
        mime, b64 = prepare_image(PNG_1PX, "image/png")
        assert mime == "image/jpeg"
        raw = base64.b64decode(b64)
        assert raw[:2] == b"\xff\xd8"  # JPEG magic


class TestAnalyzeImage:
    def test_parses_model_json(self):
        llm = make_llm(
            json.dumps({
                "species_guess": "Amanita muscaria",
                "confidence": 0.9,
                "traits": {"capColor": "r", "capShape": "x"},
                "notes": "red cap with white spots",
            })
        )
        res = analyze_image(llm, PNG_1PX, "image/png")
        assert res["status"] == "ok"
        assert res["species_guess"] == "Amanita muscaria"
        assert res["traits"] == {"capColor": "r", "capShape": "x"}
        assert res["confidence"] == pytest.approx(0.9)

    def test_strips_markdown_fences(self):
        llm = make_llm("```json\n{\"species_guess\": \"Boletus edulis\", \"confidence\": 0.7, \"traits\": {}, \"notes\": \"n\"}\n```")
        res = analyze_image(llm, PNG_1PX, "image/png")
        assert res["status"] == "ok"
        assert res["species_guess"] == "Boletus edulis"

    def test_clamps_confidence_out_of_range(self):
        llm = make_llm(
            json.dumps({"species_guess": None, "confidence": 1.5, "traits": {}, "notes": ""})
        )
        res = analyze_image(llm, PNG_1PX, "image/png")
        assert res["confidence"] == 1.0

        llm = make_llm(
            json.dumps({"species_guess": None, "confidence": -0.3, "traits": {}, "notes": ""})
        )
        res = analyze_image(llm, PNG_1PX, "image/png")
        assert res["confidence"] == 0.0

    def test_drops_invalid_trait_values(self):
        # NOTE (modality fix): `odor` used to be used here as the "valid" code to
        # survive sanitizing. Odor is not observable in a photo, so it is now
        # dropped on purpose — see test_vision_modality.py. gillColor has a
        # "buff" code `b` that shares no letter with the invalid one.
        llm = make_llm(
            json.dumps({
                "species_guess": None,
                "confidence": 0.5,
                "traits": {"capColor": "zzz-not-a-code", "gillColor": "b"},
                "notes": "",
            })
        )
        res = analyze_image(llm, PNG_1PX, "image/png")
        assert res["traits"] == {"gillColor": "b"}

    def test_invalid_json_raises_llm_error(self):
        llm = make_llm("this is not json at all")
        with pytest.raises(LLMError):
            analyze_image(llm, PNG_1PX, "image/png")

    def test_upstream_http_error_raises_llm_error(self):
        def handler(request):
            return httpx.Response(500, json={"error": "boom"})

        llm = LLMClient(
            base_url="https://llm.example.com/v1",
            api_key="sk-test",
            model="qwen-vl-plus",
            transport=httpx.MockTransport(handler),
        )
        with pytest.raises(LLMError):
            analyze_image(llm, PNG_1PX, "image/png")
