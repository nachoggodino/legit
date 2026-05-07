import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import create_app
from tests.conftest import BASE_ENV, make_llm_response


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


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


def make_edit_llm_response(modified_content: str) -> dict[str, Any]:
    return make_llm_response(modified_content)


# ---------------------------------------------------------------------------
# Tests: normal edit flow
# ---------------------------------------------------------------------------


class TestEditNormalFlow:
    def test_returns_200_with_event_stream(
        self,
        gitlab_env: None,
    ) -> None:
        mock_llm = MagicMock(return_value=make_edit_llm_response("# Modified"))

        with (
            patch("main._clone_repo_if_needed"),
            patch("services.git.get_git_provider"),
            patch("services.index.load_index"),
            patch("routers.edit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post(
                    "/edit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Original",
                        "instruction": "Add a summary section",
                    },
                )

        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

    def test_done_event_contains_modified_content(
        self,
        gitlab_env: None,
    ) -> None:
        modified = "# Modified Doc\n\n## Summary\nThis is a summary."
        mock_llm = MagicMock(return_value=make_edit_llm_response(modified))

        with (
            patch("main._clone_repo_if_needed"),
            patch("services.git.get_git_provider"),
            patch("services.index.load_index"),
            patch("routers.edit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post(
                    "/edit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Original",
                        "instruction": "Add a summary section",
                    },
                )

        events = parse_sse_events(response.text)
        done_events = [e for e in events if e["event"] == "done"]
        assert len(done_events) == 1
        assert done_events[0]["data"]["content"] == modified

    def test_done_is_last_event(
        self,
        gitlab_env: None,
    ) -> None:
        mock_llm = MagicMock(return_value=make_edit_llm_response("# Result"))

        with (
            patch("main._clone_repo_if_needed"),
            patch("services.git.get_git_provider"),
            patch("services.index.load_index"),
            patch("routers.edit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post(
                    "/edit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Original",
                        "instruction": "Rewrite",
                    },
                )

        events = parse_sse_events(response.text)
        assert events[-1]["event"] == "done"

    def test_status_events_precede_done(
        self,
        gitlab_env: None,
    ) -> None:
        mock_llm = MagicMock(return_value=make_edit_llm_response("# Result"))

        with (
            patch("main._clone_repo_if_needed"),
            patch("services.git.get_git_provider"),
            patch("services.index.load_index"),
            patch("routers.edit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post(
                    "/edit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Original",
                        "instruction": "Rewrite",
                    },
                )

        events = parse_sse_events(response.text)
        event_types = [e["event"] for e in events]
        # There may be 0 or more status events before done
        assert "done" in event_types
        done_idx = event_types.index("done")
        for t in event_types[:done_idx]:
            assert t == "status"

    def test_status_event_has_message_field(
        self,
        gitlab_env: None,
    ) -> None:
        # Force at least one status event by making the future appear slow.
        # We simulate this by checking that if status events exist, they have a message.
        mock_llm = MagicMock(return_value=make_edit_llm_response("# Result"))

        with (
            patch("main._clone_repo_if_needed"),
            patch("services.git.get_git_provider"),
            patch("services.index.load_index"),
            patch("routers.edit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post(
                    "/edit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Original",
                        "instruction": "Rewrite",
                    },
                )

        events = parse_sse_events(response.text)
        for e in events:
            if e["event"] == "status":
                assert "message" in e["data"]
                assert isinstance(e["data"]["message"], str)

    def test_sends_instruction_and_content_to_llm(
        self,
        gitlab_env: None,
    ) -> None:
        captured: list[Any] = []

        def capture(messages: Any, **kwargs: Any) -> dict[str, Any]:
            captured.append(messages)
            return make_edit_llm_response("result")

        with (
            patch("main._clone_repo_if_needed"),
            patch("services.git.get_git_provider"),
            patch("services.index.load_index"),
            patch("routers.edit.call_llm_full", side_effect=capture),
        ):
            app = create_app()
            with TestClient(app) as client:
                client.post(
                    "/edit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Original content",
                        "instruction": "Make it shorter",
                    },
                )

        assert len(captured) == 1
        messages = captured[0]
        assert messages[0]["role"] == "system"
        user_msg = messages[1]["content"]
        assert "Make it shorter" in user_msg
        assert "# Original content" in user_msg

    def test_empty_instruction_still_calls_llm(
        self,
        gitlab_env: None,
    ) -> None:
        mock_llm = MagicMock(return_value=make_edit_llm_response("unchanged"))

        with (
            patch("main._clone_repo_if_needed"),
            patch("services.git.get_git_provider"),
            patch("services.index.load_index"),
            patch("routers.edit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post(
                    "/edit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Content",
                        "instruction": "",
                    },
                )

        assert response.status_code == 200
        mock_llm.assert_called_once()


# ---------------------------------------------------------------------------
# Tests: error handling
# ---------------------------------------------------------------------------


class TestEditErrors:
    def test_llm_failure_emits_error_event(
        self,
        gitlab_env: None,
    ) -> None:
        mock_llm = MagicMock(side_effect=RuntimeError("LLM unavailable"))

        with (
            patch("main._clone_repo_if_needed"),
            patch("services.git.get_git_provider"),
            patch("services.index.load_index"),
            patch("routers.edit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post(
                    "/edit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Content",
                        "instruction": "Edit this",
                    },
                )

        assert response.status_code == 200
        events = parse_sse_events(response.text)
        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) == 1
        assert "LLM unavailable" in error_events[0]["data"]["message"]

    def test_none_content_from_llm_returns_empty_string(
        self,
        gitlab_env: None,
    ) -> None:
        llm_resp: dict[str, Any] = {
            "choices": [{"message": {"role": "assistant", "content": None}}]
        }
        mock_llm = MagicMock(return_value=llm_resp)

        with (
            patch("main._clone_repo_if_needed"),
            patch("services.git.get_git_provider"),
            patch("services.index.load_index"),
            patch("routers.edit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post(
                    "/edit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Content",
                        "instruction": "Edit this",
                    },
                )

        events = parse_sse_events(response.text)
        done_events = [e for e in events if e["event"] == "done"]
        assert len(done_events) == 1
        assert done_events[0]["data"]["content"] == ""

    def test_missing_required_fields_returns_422(
        self,
        gitlab_env: None,
    ) -> None:
        with (
            patch("main._clone_repo_if_needed"),
            patch("services.git.get_git_provider"),
            patch("services.index.load_index"),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post("/edit", json={"path": "docs/page.md"})

        assert response.status_code == 422
