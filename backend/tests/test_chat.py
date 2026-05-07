import json
from collections.abc import Iterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import create_app
from tests.conftest import BASE_ENV


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_tool_call_response(path: str, call_id: str = "call_abc123") -> dict[str, Any]:
    """Build an OpenAI-style response containing a single get_file tool call."""
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": call_id,
                            "type": "function",
                            "function": {
                                "name": "get_file",
                                "arguments": json.dumps({"path": path}),
                            },
                        }
                    ],
                },
                "finish_reason": "tool_calls",
            }
        ],
    }


def make_no_tool_call_response() -> dict[str, Any]:
    """Build an OpenAI-style response with no tool calls (breaks the loop)."""
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [],
                },
                "finish_reason": "stop",
            }
        ],
    }


def parse_sse_events(text: str) -> list[dict[str, Any]]:
    """Parse an SSE response body (string) into a list of {event, data} dicts."""
    events: list[dict[str, Any]] = []
    current: dict[str, Any] = {}
    for line in text.splitlines():
        if line.startswith("event:"):
            current["event"] = line[len("event:") :].strip()
        elif line.startswith("data:"):
            current["data"] = json.loads(line[len("data:") :].strip())
        elif not line and current:
            events.append(current)
            current = {}
    if current:
        events.append(current)
    return events



# ---------------------------------------------------------------------------
# Tests: no tool calls
# ---------------------------------------------------------------------------


class TestChatNoToolCalls:
    def test_streams_tokens_and_done(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        mock_call_llm_full = MagicMock(return_value=make_no_tool_call_response())
        mock_call_llm_stream = MagicMock(return_value=iter(["Hello", " world"]))

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.chat.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.chat.maybe_pull", new_callable=AsyncMock),
            patch("routers.chat.call_llm_full", mock_call_llm_full),
            patch("routers.chat.call_llm_stream", mock_call_llm_stream),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post("/chat", json={"query": "test"})

        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

        events = parse_sse_events(response.text)
        event_types = [e["event"] for e in events]
        assert event_types == ["token", "token", "done"]
        assert events[0]["data"] == {"text": "Hello"}
        assert events[1]["data"] == {"text": " world"}
        assert events[2]["data"] == {}

    def test_sends_correct_messages_to_llm(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        captured: list[Any] = []

        def capture_full(messages: Any, **kwargs: Any) -> dict[str, Any]:
            captured.append(messages)
            return make_no_tool_call_response()

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.chat.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.chat.maybe_pull", new_callable=AsyncMock),
            patch("routers.chat.call_llm_full", side_effect=capture_full),
            patch("routers.chat.call_llm_stream", return_value=iter([])),
        ):
            app = create_app()
            with TestClient(app) as client:
                client.post("/chat", json={"query": "what is X?"})

        assert len(captured) == 1
        messages = captured[0]
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"
        assert messages[1]["content"] == "what is X?"


# ---------------------------------------------------------------------------
# Tests: tool-use flow
# ---------------------------------------------------------------------------


class TestChatWithToolCalls:
    def test_emits_reading_file_event_and_fetches_content(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        mock_git_provider.get_file = AsyncMock(return_value="# Benchmarks\nContent here.")
        mock_call_llm_full = MagicMock(
            side_effect=[
                make_tool_call_response("docs/benchmarks.md"),
                make_no_tool_call_response(),
            ]
        )
        mock_call_llm_stream = MagicMock(return_value=iter(["Based on the docs..."]))

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.chat.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.chat.maybe_pull", new_callable=AsyncMock),
            patch("routers.chat.call_llm_full", mock_call_llm_full),
            patch("routers.chat.call_llm_stream", mock_call_llm_stream),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post(
                    "/chat", json={"query": "benchmarks?"}
                )

        events = parse_sse_events(response.text)
        event_types = [e["event"] for e in events]
        assert "reading_file" in event_types
        assert "token" in event_types
        assert event_types[-1] == "done"

        reading_event = next(e for e in events if e["event"] == "reading_file")
        assert reading_event["data"] == {"path": "docs/benchmarks.md"}

        mock_git_provider.get_file.assert_awaited_once_with("docs/benchmarks.md")

    def test_file_content_appended_to_messages(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        file_content = "# Doc\nSome content."
        mock_git_provider.get_file = AsyncMock(return_value=file_content)

        stream_messages: list[Any] = []

        def capture_stream(messages: Any) -> Iterator[str]:
            stream_messages.append(messages)
            return iter(["answer"])

        mock_call_llm_full = MagicMock(
            side_effect=[
                make_tool_call_response("docs/page.md"),
                make_no_tool_call_response(),
            ]
        )

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.chat.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.chat.maybe_pull", new_callable=AsyncMock),
            patch("routers.chat.call_llm_full", mock_call_llm_full),
            patch("routers.chat.call_llm_stream", side_effect=capture_stream),
        ):
            app = create_app()
            with TestClient(app) as client:
                client.post("/chat", json={"query": "q"})

        assert len(stream_messages) == 1
        final_messages: list[dict[str, Any]] = stream_messages[0]
        tool_result = next(
            m for m in final_messages if m.get("role") == "tool"
        )
        assert tool_result["content"] == file_content


# ---------------------------------------------------------------------------
# Tests: multiple file reads
# ---------------------------------------------------------------------------


class TestChatMultipleFileReads:
    def test_reads_up_to_max_iterations(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        """Five tool-call rounds → 5 reading_file events, then stream answer."""
        paths = [f"docs/file{i}.md" for i in range(5)]
        mock_git_provider.get_file = AsyncMock(return_value="content")

        side_effects: list[dict[str, Any]] = [
            make_tool_call_response(p, call_id=f"call_{i}")
            for i, p in enumerate(paths)
        ]
        # 6th call would go past the max — the loop should stop at iteration 5
        mock_call_llm_full = MagicMock(side_effect=side_effects)
        mock_call_llm_stream = MagicMock(return_value=iter(["done answer"]))

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.chat.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.chat.maybe_pull", new_callable=AsyncMock),
            patch("routers.chat.call_llm_full", mock_call_llm_full),
            patch("routers.chat.call_llm_stream", mock_call_llm_stream),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post("/chat", json={"query": "all docs"})

        events = parse_sse_events(response.text)
        reading_events = [e for e in events if e["event"] == "reading_file"]
        assert len(reading_events) == 5
        assert events[-1]["event"] == "done"
        # LLM was called exactly 5 times (the loop max), not a 6th time
        assert mock_call_llm_full.call_count == 5

    def test_multiple_files_result_in_sequential_reading_events(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        mock_git_provider.get_file = AsyncMock(return_value="content")
        mock_call_llm_full = MagicMock(
            side_effect=[
                make_tool_call_response("docs/a.md", "call_1"),
                make_tool_call_response("docs/b.md", "call_2"),
                make_no_tool_call_response(),
            ]
        )

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.chat.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.chat.maybe_pull", new_callable=AsyncMock),
            patch("routers.chat.call_llm_full", mock_call_llm_full),
            patch("routers.chat.call_llm_stream", return_value=iter(["answer"])),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post("/chat", json={"query": "q"})

        events = parse_sse_events(response.text)
        reading_paths = [
            e["data"]["path"] for e in events if e["event"] == "reading_file"
        ]
        assert reading_paths == ["docs/a.md", "docs/b.md"]


# ---------------------------------------------------------------------------
# Tests: context budget warning
# ---------------------------------------------------------------------------


class TestChatContextBudgetWarning:
    def test_warning_injected_when_tokens_exceed_budget(
        self,
        monkeypatch: pytest.MonkeyPatch,
        mock_git_provider: MagicMock,
    ) -> None:
        for key, value in BASE_ENV.items():
            monkeypatch.setenv(key, value)
        # Very small budget so the index alone exceeds it
        monkeypatch.setenv("MAX_CONTEXT_TOKENS", "10")

        captured: list[Any] = []

        def capture_full(messages: Any, **kwargs: Any) -> dict[str, Any]:
            captured.append(messages)
            return make_no_tool_call_response()

        # index of 60 chars → 12 tokens, threshold = 0.8 * 10 = 8 → warning triggered
        long_index = json.dumps([{"path": "docs/a.md", "title": "Long title here"}])

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.chat.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.chat.maybe_pull", new_callable=AsyncMock),
            patch("routers.chat.call_llm_full", side_effect=capture_full),
            patch("routers.chat.call_llm_stream", return_value=iter([])),
            patch("routers.chat.serialise_index", return_value=long_index),
        ):
            app = create_app()
            with TestClient(app) as client:
                client.post("/chat", json={"query": "q"})

        assert len(captured) == 1
        system_prompt: str = captured[0][0]["content"]
        assert "IMPORTANT: The context is nearly full" in system_prompt

    def test_warning_injected_during_loop_after_large_file(
        self,
        monkeypatch: pytest.MonkeyPatch,
        mock_git_provider: MagicMock,
    ) -> None:
        for key, value in BASE_ENV.items():
            monkeypatch.setenv(key, value)
        # Budget = 100 tokens; initial load is small but file content tips it over
        monkeypatch.setenv("MAX_CONTEXT_TOKENS", "100")

        # Large file: 500 chars → 100 tokens (meets the threshold of 80)
        large_content = "x" * 500
        mock_git_provider.get_file = AsyncMock(return_value=large_content)

        stream_messages: list[Any] = []

        def capture_stream(messages: Any) -> Iterator[str]:
            stream_messages.append(messages)
            return iter([])

        mock_call_llm_full = MagicMock(
            side_effect=[
                make_tool_call_response("docs/large.md"),
                make_no_tool_call_response(),
            ]
        )

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.chat.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.chat.maybe_pull", new_callable=AsyncMock),
            patch("routers.chat.call_llm_full", mock_call_llm_full),
            patch("routers.chat.call_llm_stream", side_effect=capture_stream),
            patch("routers.chat.serialise_index", return_value="[]"),
        ):
            app = create_app()
            with TestClient(app) as client:
                client.post("/chat", json={"query": "q"})

        assert len(stream_messages) == 1
        final_system: str = stream_messages[0][0]["content"]
        assert "IMPORTANT: The context is nearly full" in final_system

    def test_no_warning_when_within_budget(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        captured: list[Any] = []

        def capture_full(messages: Any, **kwargs: Any) -> dict[str, Any]:
            captured.append(messages)
            return make_no_tool_call_response()

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.chat.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.chat.maybe_pull", new_callable=AsyncMock),
            patch("routers.chat.call_llm_full", side_effect=capture_full),
            patch("routers.chat.call_llm_stream", return_value=iter([])),
            patch("routers.chat.serialise_index", return_value="[]"),
        ):
            app = create_app()
            with TestClient(app) as client:
                client.post("/chat", json={"query": "q"})

        system_prompt: str = captured[0][0]["content"]
        assert "IMPORTANT" not in system_prompt


# ---------------------------------------------------------------------------
# Tests: error handling
# ---------------------------------------------------------------------------


class TestChatErrorHandling:
    def test_error_event_on_file_not_found(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        mock_git_provider.get_file = AsyncMock(
            side_effect=FileNotFoundError("not found")
        )
        mock_call_llm_full = MagicMock(
            return_value=make_tool_call_response("docs/missing.md")
        )

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.chat.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.chat.maybe_pull", new_callable=AsyncMock),
            patch("routers.chat.call_llm_full", mock_call_llm_full),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post(
                    "/chat", json={"query": "q"}
                )

        events = parse_sse_events(response.text)
        assert response.status_code == 200
        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) == 1
        assert "missing.md" in error_events[0]["data"]["message"]

    def test_error_event_on_llm_failure(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        mock_call_llm_full = MagicMock(side_effect=RuntimeError("LLM unreachable"))

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.chat.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.chat.maybe_pull", new_callable=AsyncMock),
            patch("routers.chat.call_llm_full", mock_call_llm_full),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post("/chat", json={"query": "q"})

        events = parse_sse_events(response.text)
        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) == 1
        assert "LLM unreachable" in error_events[0]["data"]["message"]

    def test_error_event_on_invalid_tool_arguments(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        bad_response: dict[str, Any] = {
            "id": "chatcmpl-test",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_bad",
                                "type": "function",
                                "function": {
                                    "name": "get_file",
                                    "arguments": "not-valid-json{{{",
                                },
                            }
                        ],
                    },
                    "finish_reason": "tool_calls",
                }
            ],
        }
        mock_call_llm_full = MagicMock(return_value=bad_response)

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.chat.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.chat.maybe_pull", new_callable=AsyncMock),
            patch("routers.chat.call_llm_full", mock_call_llm_full),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post("/chat", json={"query": "q"})

        events = parse_sse_events(response.text)
        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) == 1
        assert "Invalid tool call arguments" in error_events[0]["data"]["message"]

    def test_error_event_on_maybe_pull_failure(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.chat.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch(
                "routers.chat.maybe_pull",
                new_callable=AsyncMock,
                side_effect=RuntimeError("pull failed"),
            ),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post("/chat", json={"query": "q"})

        events = parse_sse_events(response.text)
        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) == 1
        assert "pull failed" in error_events[0]["data"]["message"]

    def test_no_done_event_after_error(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        mock_git_provider.get_file = AsyncMock(side_effect=OSError("disk error"))
        mock_call_llm_full = MagicMock(
            return_value=make_tool_call_response("docs/file.md")
        )

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.chat.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.chat.maybe_pull", new_callable=AsyncMock),
            patch("routers.chat.call_llm_full", mock_call_llm_full),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post("/chat", json={"query": "q"})

        events = parse_sse_events(response.text)
        event_types = [e["event"] for e in events]
        assert "error" in event_types
        assert "done" not in event_types


# ---------------------------------------------------------------------------
# Tests: SSE format
# ---------------------------------------------------------------------------


class TestChatSSEFormat:
    def test_response_content_type_is_event_stream(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.chat.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.chat.maybe_pull", new_callable=AsyncMock),
            patch("routers.chat.call_llm_full", return_value=make_no_tool_call_response()),
            patch("routers.chat.call_llm_stream", return_value=iter([])),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post("/chat", json={"query": "q"})

        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

    def test_token_events_carry_text_field(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.chat.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.chat.maybe_pull", new_callable=AsyncMock),
            patch("routers.chat.call_llm_full", return_value=make_no_tool_call_response()),
            patch("routers.chat.call_llm_stream", return_value=iter(["tok1", "tok2"])),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post("/chat", json={"query": "q"})

        events = parse_sse_events(response.text)
        token_events = [e for e in events if e["event"] == "token"]
        assert all("text" in e["data"] for e in token_events)
        assert [e["data"]["text"] for e in token_events] == ["tok1", "tok2"]

    def test_done_event_has_empty_data(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.chat.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.chat.maybe_pull", new_callable=AsyncMock),
            patch("routers.chat.call_llm_full", return_value=make_no_tool_call_response()),
            patch("routers.chat.call_llm_stream", return_value=iter([])),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post("/chat", json={"query": "q"})

        events = parse_sse_events(response.text)
        done_events = [e for e in events if e["event"] == "done"]
        assert len(done_events) == 1
        assert done_events[0]["data"] == {}

    def test_event_ordering_reading_file_before_token_before_done(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        mock_git_provider.get_file = AsyncMock(return_value="content")
        mock_call_llm_full = MagicMock(
            side_effect=[
                make_tool_call_response("docs/a.md"),
                make_no_tool_call_response(),
            ]
        )

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.chat.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.chat.maybe_pull", new_callable=AsyncMock),
            patch("routers.chat.call_llm_full", mock_call_llm_full),
            patch("routers.chat.call_llm_stream", return_value=iter(["answer"])),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post("/chat", json={"query": "q"})

        events = parse_sse_events(response.text)
        event_types = [e["event"] for e in events]
        assert event_types.index("reading_file") < event_types.index("token")
        assert event_types.index("token") < event_types.index("done")

    def test_missing_query_returns_422(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.chat.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post("/chat", json={})

        assert response.status_code == 422
