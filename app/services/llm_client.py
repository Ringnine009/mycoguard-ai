"""Minimal OpenAI-compatible chat-completion client (httpx based).

`transport` is injectable so tests can run against httpx.MockTransport
without any network access.
"""
from __future__ import annotations

import httpx


class LLMError(Exception):
    """Raised when the upstream LLM API fails or returns unusable output."""


class LLMClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        timeout: float = 60.0,
        transport: httpx.BaseTransport | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self._client = httpx.Client(timeout=timeout, transport=transport)

    def chat_completion(
        self,
        messages: list[dict],
        temperature: float = 0.2,
        response_format: dict | None = None,
    ) -> str:
        payload: dict = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        if response_format:
            payload["response_format"] = response_format

        try:
            resp = self._client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
        except Exception as exc:  # network / HTTP errors
            raise LLMError(f"upstream LLM request failed: {exc}") from exc

        try:
            data = resp.json()
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as exc:
            raise LLMError(f"unexpected upstream response shape: {exc}") from exc
