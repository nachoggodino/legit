import json
import os
from collections.abc import Iterator
from typing import Any

import requests

_DEFAULT_MAX_CONTEXT_TOKENS = 150_000


def estimate_tokens(text: str) -> int:
    """Rough token estimate: 1 token per 5 characters."""
    return len(text) // 5


def call_llm_full(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Make a blocking chat-completions call and return the full response dict."""
    url = f"{os.environ['AI_BASE_URL'].rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {os.environ['AI_API_KEY']}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {
        "model": os.environ["AI_MODEL"],
        "messages": messages,
    }
    if tools is not None:
        payload["tools"] = tools

    response = requests.post(url, json=payload, headers=headers, timeout=120)
    response.raise_for_status()
    return response.json()  # type: ignore[no-any-return]


def call_llm_stream(messages: list[dict[str, Any]]) -> Iterator[str]:
    """Make a blocking streaming chat-completions call, yielding text tokens."""
    url = f"{os.environ['AI_BASE_URL'].rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {os.environ['AI_API_KEY']}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {
        "model": os.environ["AI_MODEL"],
        "messages": messages,
        "stream": True,
    }

    with requests.post(
        url, json=payload, headers=headers, stream=True, timeout=120
    ) as response:
        response.raise_for_status()
        for raw_line in response.iter_lines():
            if not raw_line:
                continue
            line: str = (
                raw_line.decode("utf-8") if isinstance(raw_line, bytes) else raw_line
            )
            if not line.startswith("data: "):
                continue
            data = line[6:]
            if data == "[DONE]":
                break
            try:
                chunk = json.loads(data)
                delta: dict[str, Any] = chunk["choices"][0]["delta"]
                text: str = delta.get("content") or ""
                if text:
                    yield text
            except (json.JSONDecodeError, KeyError, IndexError):
                continue


def get_max_context_tokens() -> int:
    """Return the configured context token budget."""
    return int(os.environ.get("MAX_CONTEXT_TOKENS", str(_DEFAULT_MAX_CONTEXT_TOKENS)))
