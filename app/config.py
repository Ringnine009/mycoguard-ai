"""Configuration: keys come ONLY from environment variables or a parent `.env` file.

Search order (first match wins):
  1. process environment variables
  2. `mycoguard/.env`
  3. parent `projects/.env` (the shared credential file kept out of git)

The frontend never sees these values; only the backend proxy reads them.
repr() of Settings redacts secrets so they can never leak into logs.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, fields
from pathlib import Path

DEFAULT_DASHSCOPE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
DEFAULT_DEEPSEEK_URL = "https://api.deepseek.com/v1"


def _parse_env_file(path: Path) -> dict[str, str]:
    """Tiny .env parser (no external dependency): KEY=VALUE lines, # comments, quoted values.

    Reads with `utf-8-sig` so a leading UTF-8 BOM on the first key is handled.
    """
    result: dict[str, str] = {}
    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError:
        return result
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            result[key] = value
    return result


@dataclass
class Settings:
    dashscope_api_key: str = ""
    dashscope_openai_compat_url: str = ""
    deepseek_api_key: str = ""
    deepseek_openai_compat_url: str = ""
    vision_model: str = "qwen-vl-plus"
    chat_model: str = "deepseek-chat"
    max_upload_bytes: int = 8 * 1024 * 1024

    def __repr__(self) -> str:
        pairs = []
        for f in fields(self):
            v = getattr(self, f.name)
            if any(tok in f.name for tok in ("key", "token", "secret")):
                v = "***redacted***"
            pairs.append(f"{f.name}={v!r}")
        return f"Settings({', '.join(pairs)})"


def default_env_files() -> list[Path]:
    here = Path(__file__).resolve().parent  # .../mycoguard/app
    return [here.parent / ".env", here.parent.parent / ".env"]


def load_settings(env_files: list[Path] | None = None) -> Settings:
    if env_files is None:
        env_files = default_env_files()

    file_vars: dict[str, str] = {}
    for path in env_files:
        file_vars.update(_parse_env_file(path))

    def get(name: str, default: str = "") -> str:
        return os.environ.get(name) or file_vars.get(name) or default

    return Settings(
        dashscope_api_key=get("DASHSCOPE_API_KEY"),
        dashscope_openai_compat_url=get("DASHSCOPE_OPENAI_COMPAT_URL") or DEFAULT_DASHSCOPE_URL,
        deepseek_api_key=get("DEEPSEEK_API_KEY"),
        deepseek_openai_compat_url=get("DEEPSEEK_OPENAI_COMPAT_URL") or DEFAULT_DEEPSEEK_URL,
        vision_model=get("MYCOGUARD_VISION_MODEL", "qwen-vl-plus"),
        chat_model=get("MYCOGUARD_CHAT_MODEL", "deepseek-chat"),
        max_upload_bytes=int(get("MYCOGUARD_MAX_UPLOAD_BYTES", str(8 * 1024 * 1024))),
    )
