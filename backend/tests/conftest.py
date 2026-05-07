import json
import os
from collections.abc import Generator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import create_app

# ---------------------------------------------------------------------------
# Environment variable helpers
# ---------------------------------------------------------------------------

BASE_ENV: dict[str, str] = {
    "GIT_PROVIDER": "gitlab",
    "GIT_REPO_URL": "https://gitlab.example.com/group/repo",
    "GIT_TOKEN": "glpat-test",
    "GIT_DEFAULT_BRANCH": "master",
    "DOCS_LOCAL_PATH": "/tmp/test-docs",
    "AI_BASE_URL": "https://api.openai.com/v1",
    "AI_API_KEY": "sk-test",
    "AI_MODEL": "gpt-4o",
    "GITLAB_URL": "https://gitlab.example.com",
    "GITLAB_PROJECT_ID": "42",
    "MAX_CONTEXT_TOKENS": "150000",
}

GITHUB_ENV: dict[str, str] = {
    **{k: v for k, v in BASE_ENV.items() if k not in ("GITLAB_URL", "GITLAB_PROJECT_ID")},
    "GIT_PROVIDER": "github",
    "GITHUB_OWNER": "my-org",
    "GITHUB_REPO": "ai-research",
}


@pytest.fixture()
def gitlab_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Set all GitLab-related environment variables."""
    for key, value in BASE_ENV.items():
        monkeypatch.setenv(key, value)


@pytest.fixture()
def github_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Set all GitHub-related environment variables."""
    for key, value in GITHUB_ENV.items():
        monkeypatch.setenv(key, value)


# ---------------------------------------------------------------------------
# Git provider mock
# ---------------------------------------------------------------------------


@pytest.fixture()
def mock_git_provider() -> MagicMock:
    """Return a MagicMock that satisfies the GitProvider interface."""
    provider = MagicMock()
    provider.get_file = AsyncMock(return_value="# Mock Content")
    provider.commit_files = AsyncMock(
        return_value="https://gitlab.example.com/group/repo/-/commit/abc123"
    )
    return provider


# ---------------------------------------------------------------------------
# LLM mock helpers
# ---------------------------------------------------------------------------


def make_llm_response(content: str) -> dict[str, Any]:
    """Build a minimal OpenAI-style chat completion response."""
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    }


def parse_sse_events(text: str) -> list[dict[str, Any]]:
    """Parse an SSE response body into a list of {event, data} dicts."""
    events: list[dict[str, Any]] = []
    current: dict[str, Any] = {}
    for line in text.splitlines():
        if line.startswith("event:"):
            current["event"] = line[len("event:"):].strip()
        elif line.startswith("data:"):
            current["data"] = json.loads(line[len("data:"):].strip())
        elif not line and current:
            events.append(current)
            current = {}
    if current:
        events.append(current)
    return events


# ---------------------------------------------------------------------------
# Shared test client fixture
# ---------------------------------------------------------------------------


@pytest.fixture()
def app_client(gitlab_env: None) -> Generator[TestClient, None, None]:
    """Yield a TestClient with common startup patches applied."""
    with (
        patch("main._clone_repo_if_needed"),
        patch("services.git.get_git_provider"),
        patch("services.index.load_index"),
    ):
        with TestClient(create_app()) as client:
            yield client
