"""Tests for settings loading: env vars first, then .env files (never commit keys)."""
import pytest
from pathlib import Path

from app.config import Settings, load_settings


def test_env_vars_are_used(monkeypatch):
    monkeypatch.setenv("DASHSCOPE_API_KEY", "sk-env-key")
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    s = load_settings(env_files=[])
    assert s.dashscope_api_key == "sk-env-key"
    assert s.deepseek_api_key == ""


def test_env_file_is_parsed(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "DASHSCOPE_API_KEY=sk-from-file\nDEEPSEEK_API_KEY=sk-deepseek-file\n",
        encoding="utf-8",
    )
    s = load_settings(env_files=[env_file])
    assert s.dashscope_api_key == "sk-from-file"
    assert s.deepseek_api_key == "sk-deepseek-file"


def test_env_file_with_utf8_bom_is_parsed(tmp_path):
    """The shared parent .env starts with a UTF-8 BOM; the first key must still load."""
    env_file = tmp_path / ".env"
    env_file.write_bytes(b"\xef\xbb\xbfDEEPSEEK_API_KEY=sk-bom-file\nDASHSCOPE_API_KEY=sk-bom-dash\n")
    s = load_settings(env_files=[env_file])
    assert s.deepseek_api_key == "sk-bom-file"
    assert s.dashscope_api_key == "sk-bom-dash"


def test_env_var_overrides_env_file(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text("DEEPSEEK_API_KEY=sk-from-file\n", encoding="utf-8")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-from-env")
    s = load_settings(env_files=[env_file])
    assert s.deepseek_api_key == "sk-from-env"


def test_missing_env_files_yield_empty_settings():
    s = load_settings(env_files=[])
    assert s.dashscope_api_key == ""
    assert s.deepseek_api_key == ""
    assert s.vision_model == "qwen-vl-plus"
    assert s.chat_model == "deepseek-chat"


def test_settings_never_expose_keys_via_repr():
    s = Settings(dashscope_api_key="sk-secret-123", deepseek_api_key="sk-secret-456")
    text = repr(s)
    assert "sk-secret-123" not in text
    assert "sk-secret-456" not in text
