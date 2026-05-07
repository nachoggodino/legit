import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from tests.conftest import make_llm_response, parse_sse_events


# ---------------------------------------------------------------------------
# Tests: normal edit flow
# ---------------------------------------------------------------------------


class TestEditNormalFlow:
    def test_returns_200_with_event_stream(
        self,
        app_client: TestClient,
    ) -> None:
        mock_llm = MagicMock(return_value=make_llm_response("# Modified"))

        with patch("routers.edit.call_llm_full", mock_llm):
            response = app_client.post(
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
        app_client: TestClient,
    ) -> None:
        modified = "# Modified Doc\n\n## Summary\nThis is a summary."
        mock_llm = MagicMock(return_value=make_llm_response(modified))

        with patch("routers.edit.call_llm_full", mock_llm):
            response = app_client.post(
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
        app_client: TestClient,
    ) -> None:
        mock_llm = MagicMock(return_value=make_llm_response("# Result"))

        with patch("routers.edit.call_llm_full", mock_llm):
            response = app_client.post(
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
        app_client: TestClient,
    ) -> None:
        mock_llm = MagicMock(return_value=make_llm_response("# Result"))

        with patch("routers.edit.call_llm_full", mock_llm):
            response = app_client.post(
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
        app_client: TestClient,
    ) -> None:
        mock_llm = MagicMock(return_value=make_llm_response("# Result"))

        with patch("routers.edit.call_llm_full", mock_llm):
            response = app_client.post(
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
        app_client: TestClient,
    ) -> None:
        captured: list[Any] = []

        def capture(messages: Any, **kwargs: Any) -> dict[str, Any]:
            captured.append(messages)
            return make_llm_response("result")

        with patch("routers.edit.call_llm_full", side_effect=capture):
            app_client.post(
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
        app_client: TestClient,
    ) -> None:
        mock_llm = MagicMock(return_value=make_llm_response("unchanged"))

        with patch("routers.edit.call_llm_full", mock_llm):
            response = app_client.post(
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
        app_client: TestClient,
    ) -> None:
        mock_llm = MagicMock(side_effect=RuntimeError("LLM unavailable"))

        with patch("routers.edit.call_llm_full", mock_llm):
            response = app_client.post(
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
        app_client: TestClient,
    ) -> None:
        llm_resp: dict[str, Any] = {
            "choices": [{"message": {"role": "assistant", "content": None}}]
        }
        mock_llm = MagicMock(return_value=llm_resp)

        with patch("routers.edit.call_llm_full", mock_llm):
            response = app_client.post(
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
        app_client: TestClient,
    ) -> None:
        response = app_client.post("/edit", json={"path": "docs/page.md"})
        assert response.status_code == 422
