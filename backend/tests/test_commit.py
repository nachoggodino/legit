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


def make_commit_llm_response(
    summary: str = "A test document about AI research.",
    commit_message: str = "docs: update test document",
) -> dict[str, Any]:
    payload = json.dumps({"summary": summary, "commit_message": commit_message})
    return make_llm_response(payload)


# ---------------------------------------------------------------------------
# Tests: normal commit flow
# ---------------------------------------------------------------------------


class TestCommitNormalFlow:
    def test_returns_200_with_event_stream(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        mock_llm = MagicMock(return_value=make_commit_llm_response())

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.commit.get_git_provider", return_value=mock_git_provider),
            patch("services.git.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.commit.maybe_pull", new_callable=AsyncMock),
            patch("routers.commit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post(
                    "/commit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Content",
                        "branch": "master",
                    },
                )

        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

    def test_done_event_contains_commit_url(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        expected_url = "https://gitlab.example.com/group/repo/-/commit/abc123"
        mock_git_provider.commit_files = AsyncMock(return_value=expected_url)
        mock_llm = MagicMock(return_value=make_commit_llm_response())

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.commit.get_git_provider", return_value=mock_git_provider),
            patch("services.git.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.commit.maybe_pull", new_callable=AsyncMock),
            patch("routers.commit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post(
                    "/commit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Content",
                        "branch": "master",
                    },
                )

        events = parse_sse_events(response.text)
        done_events = [e for e in events if e["event"] == "done"]
        assert len(done_events) == 1
        assert done_events[0]["data"]["commit_url"] == expected_url

    def test_status_events_emitted_before_done(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        mock_llm = MagicMock(return_value=make_commit_llm_response())

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.commit.get_git_provider", return_value=mock_git_provider),
            patch("services.git.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.commit.maybe_pull", new_callable=AsyncMock),
            patch("routers.commit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post(
                    "/commit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Content",
                        "branch": "master",
                    },
                )

        events = parse_sse_events(response.text)
        event_types = [e["event"] for e in events]
        assert "status" in event_types
        assert "done" in event_types
        assert event_types.index("done") > event_types.index("status")
        assert event_types[-1] == "done"

    def test_commit_files_called_with_doc_and_index(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        mock_llm = MagicMock(
            return_value=make_commit_llm_response(
                commit_message="docs: update page"
            )
        )

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.commit.get_git_provider", return_value=mock_git_provider),
            patch("services.git.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.commit.maybe_pull", new_callable=AsyncMock),
            patch("routers.commit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                client.post(
                    "/commit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Page content",
                        "branch": "master",
                    },
                )

        mock_git_provider.commit_files.assert_awaited_once()
        call_args = mock_git_provider.commit_files.call_args
        files: list[dict[str, Any]] = call_args.args[0] if call_args.args else call_args.kwargs["files"]
        paths = [f["path"] for f in files]
        assert "docs/page.md" in paths
        assert "_index.json" in paths

    def test_commit_files_called_with_correct_branch(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        mock_llm = MagicMock(return_value=make_commit_llm_response())

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.commit.get_git_provider", return_value=mock_git_provider),
            patch("services.git.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.commit.maybe_pull", new_callable=AsyncMock),
            patch("routers.commit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                client.post(
                    "/commit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Content",
                        "branch": "feature/new-branch",
                    },
                )

        call_args = mock_git_provider.commit_files.call_args
        branch = call_args.args[1] if len(call_args.args) > 1 else call_args.kwargs["branch"]
        assert branch == "feature/new-branch"

    def test_commit_message_from_llm_is_used(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        mock_llm = MagicMock(
            return_value=make_commit_llm_response(commit_message="fix: correct typos in AI doc")
        )

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.commit.get_git_provider", return_value=mock_git_provider),
            patch("services.git.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.commit.maybe_pull", new_callable=AsyncMock),
            patch("routers.commit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                client.post(
                    "/commit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Content",
                        "branch": "master",
                    },
                )

        call_args = mock_git_provider.commit_files.call_args
        message = call_args.args[2] if len(call_args.args) > 2 else call_args.kwargs["message"]
        assert message == "fix: correct typos in AI doc"

    def test_index_updated_with_summary(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        import services.index as index_module

        index_module._INDEX = []
        mock_llm = MagicMock(
            return_value=make_commit_llm_response(summary="Describes GPT-4 benchmarks.")
        )

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.commit.get_git_provider", return_value=mock_git_provider),
            patch("services.git.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.commit.maybe_pull", new_callable=AsyncMock),
            patch("routers.commit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                client.post(
                    "/commit",
                    json={
                        "path": "docs/gpt4.md",
                        "content": "# GPT-4\nBenchmarks...",
                        "branch": "master",
                    },
                )

        entry = next(
            (e for e in index_module._INDEX if e["path"] == "docs/gpt4.md"), None
        )
        assert entry is not None
        assert entry["summary"] == "Describes GPT-4 benchmarks."

    def test_maybe_pull_called(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        mock_pull = AsyncMock()
        mock_llm = MagicMock(return_value=make_commit_llm_response())

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.commit.get_git_provider", return_value=mock_git_provider),
            patch("services.git.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.commit.maybe_pull", mock_pull),
            patch("routers.commit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                client.post(
                    "/commit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Content",
                        "branch": "master",
                    },
                )

        mock_pull.assert_awaited_once()


# ---------------------------------------------------------------------------
# Tests: error handling
# ---------------------------------------------------------------------------


class TestCommitErrors:
    def test_llm_failure_emits_error_event(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        mock_llm = MagicMock(side_effect=RuntimeError("LLM timeout"))

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.commit.get_git_provider", return_value=mock_git_provider),
            patch("services.git.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.commit.maybe_pull", new_callable=AsyncMock),
            patch("routers.commit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post(
                    "/commit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Content",
                        "branch": "master",
                    },
                )

        events = parse_sse_events(response.text)
        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) == 1
        assert "LLM timeout" in error_events[0]["data"]["message"]

    def test_invalid_json_from_llm_emits_error_event(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        mock_llm = MagicMock(return_value=make_llm_response("not valid json"))

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.commit.get_git_provider", return_value=mock_git_provider),
            patch("services.git.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.commit.maybe_pull", new_callable=AsyncMock),
            patch("routers.commit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post(
                    "/commit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Content",
                        "branch": "master",
                    },
                )

        events = parse_sse_events(response.text)
        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) == 1
        assert "Failed to parse LLM response" in error_events[0]["data"]["message"]

    def test_missing_key_in_json_from_llm_emits_error_event(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        # JSON valid but missing "commit_message" key
        mock_llm = MagicMock(
            return_value=make_llm_response(json.dumps({"summary": "Only summary"}))
        )

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.commit.get_git_provider", return_value=mock_git_provider),
            patch("services.git.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.commit.maybe_pull", new_callable=AsyncMock),
            patch("routers.commit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post(
                    "/commit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Content",
                        "branch": "master",
                    },
                )

        events = parse_sse_events(response.text)
        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) == 1

    def test_git_provider_failure_emits_error_event(
        self,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        mock_git_provider.commit_files = AsyncMock(side_effect=RuntimeError("Git push failed"))
        mock_llm = MagicMock(return_value=make_commit_llm_response())

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.commit.get_git_provider", return_value=mock_git_provider),
            patch("services.git.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.commit.maybe_pull", new_callable=AsyncMock),
            patch("routers.commit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post(
                    "/commit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Content",
                        "branch": "master",
                    },
                )

        events = parse_sse_events(response.text)
        error_events = [e for e in events if e["event"] == "error"]
        assert len(error_events) == 1
        assert "Git push failed" in error_events[0]["data"]["message"]

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
                # Missing "branch"
                response = client.post(
                    "/commit",
                    json={"path": "docs/page.md", "content": "# Content"},
                )

        assert response.status_code == 422

    @pytest.mark.parametrize(
        "branch",
        ["master", "main", "develop", "feature/my-feature", "release/v1.0"],
    )
    def test_various_branch_names_are_forwarded(
        self,
        branch: str,
        gitlab_env: None,
        mock_git_provider: MagicMock,
    ) -> None:
        mock_llm = MagicMock(return_value=make_commit_llm_response())

        with (
            patch("main._clone_repo_if_needed"),
            patch("routers.commit.get_git_provider", return_value=mock_git_provider),
            patch("services.git.get_git_provider", return_value=mock_git_provider),
            patch("services.index.load_index"),
            patch("routers.commit.maybe_pull", new_callable=AsyncMock),
            patch("routers.commit.call_llm_full", mock_llm),
        ):
            app = create_app()
            with TestClient(app) as client:
                response = client.post(
                    "/commit",
                    json={
                        "path": "docs/page.md",
                        "content": "# Content",
                        "branch": branch,
                    },
                )

        assert response.status_code == 200
        call_args = mock_git_provider.commit_files.call_args
        used_branch = call_args.args[1] if len(call_args.args) > 1 else call_args.kwargs["branch"]
        assert used_branch == branch
