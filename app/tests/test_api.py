"""API-level tests using FastAPI TestClient with injected fakes (no network)."""
import base64

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)

VISION_PAYLOAD = '{"species_guess": "Amanita muscaria", "confidence": 0.85, "traits": {"capColor": "r", "capShape": "x"}, "notes": "red cap"}'


class FakeVisionLLM:
    api_key = "sk-fake-vision"

    def chat_completion(self, messages, temperature=0.2, response_format=None):
        # Messages contain the image as data URL; assert it was attached.
        assert any("data:image/jpeg;base64," in str(m) for m in messages)
        return VISION_PAYLOAD


class FakeChatLLM:
    api_key = "sk-fake-chat"

    def chat_completion(self, messages, temperature=0.4, response_format=None):
        return "AI 增强回答：鸡油菌的菌褶是分叉的。"


@pytest.fixture()
def full_app():
    settings = Settings(
        dashscope_api_key="sk-vision",
        dashscope_openai_compat_url="https://llm.example.com/compatible-mode/v1",
        deepseek_api_key="sk-chat",
    )
    return create_app(settings=settings, vision_llm=FakeVisionLLM(), chat_llm=FakeChatLLM())


@pytest.fixture()
def offline_app():
    settings = Settings()
    return create_app(settings=settings, vision_llm=None, chat_llm=None)


def test_health_online(full_app):
    client = TestClient(full_app)
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["vision"] is True
    assert body["chat"] is True


def test_health_offline(offline_app):
    client = TestClient(offline_app)
    res = client.get("/api/health")
    assert res.json()["vision"] is False
    assert res.json()["chat"] is False


def test_analyze_requires_file(full_app):
    client = TestClient(full_app)
    res = client.post("/api/analyze")
    assert res.status_code == 422


def test_analyze_rejects_non_image(full_app):
    client = TestClient(full_app)
    res = client.post(
        "/api/analyze",
        files={"file": ("x.txt", b"hello", "text/plain")},
    )
    assert res.status_code == 415


def test_analyze_returns_vision_result(full_app):
    client = TestClient(full_app)
    res = client.post(
        "/api/analyze",
        files={"file": ("mushroom.png", PNG_1PX, "image/png")},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["species_guess"] == "Amanita muscaria"
    assert body["traits"]["capColor"] == "r"


def test_analyze_offline_returns_503(offline_app):
    client = TestClient(offline_app)
    res = client.post(
        "/api/analyze",
        files={"file": ("mushroom.png", PNG_1PX, "image/png")},
    )
    assert res.status_code == 503
    assert res.json()["offline"] is True


def test_analyze_upstream_failure_returns_502(full_app):
    class BrokenVisionLLM:
        api_key = "sk-fake-vision"

        def chat_completion(self, messages, temperature=0.2, response_format=None):
            raise RuntimeError("upstream exploded")

    settings = Settings(dashscope_api_key="sk-vision")
    app = create_app(settings=settings, vision_llm=BrokenVisionLLM())
    client = TestClient(app)
    res = client.post(
        "/api/analyze",
        files={"file": ("mushroom.png", PNG_1PX, "image/png")},
    )
    assert res.status_code == 502


def test_chat_rule_mode(full_app):
    client = TestClient(full_app)
    res = client.post("/api/chat", json={"question": "银器试毒有用吗"})
    assert res.status_code == 200
    body = res.json()
    assert body["matched"] is True
    assert body["mode"] == "llm"  # FakeChatLLM is configured


def test_chat_fallback_mode(offline_app):
    client = TestClient(offline_app)
    res = client.post("/api/chat", json={"question": "银器试毒有用吗"})
    assert res.status_code == 200
    body = res.json()
    assert body["matched"] is True
    assert body["mode"] == "rule"


def test_chat_unknown_question(offline_app):
    client = TestClient(offline_app)
    res = client.post("/api/chat", json={"question": "今天天气怎么样"})
    assert res.status_code == 200
    body = res.json()
    assert body["matched"] is False
    assert body["mode"] == "fallback"


def test_chat_requires_question(full_app):
    client = TestClient(full_app)
    res = client.post("/api/chat", json={})
    assert res.status_code == 422


def test_health_does_not_leak_keys(full_app):
    client = TestClient(full_app)
    body = client.get("/api/health").json()
    assert "sk-" not in json_dumps(body)


def json_dumps(obj) -> str:
    import json
    return json.dumps(obj)
