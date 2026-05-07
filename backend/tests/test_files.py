import os
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from main import create_app


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_file(docs_path: str, rel_path: str, content: str) -> None:
    full_path = Path(docs_path) / rel_path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_text(content, encoding="utf-8")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_get_file_returns_content(
    gitlab_env: None,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))
    _write_file(str(tmp_path), "docs/example.md", "# Hello World\n")

    with patch("main._clone_repo_if_needed"), patch(
        "services.git.get_git_provider"
    ), patch("services.index.load_index"), patch(
        "routers.files.maybe_pull", new_callable=AsyncMock
    ):
        app = create_app()
        with TestClient(app) as client:
            res = client.get("/file?path=docs/example.md")

    assert res.status_code == 200
    assert res.text == "# Hello World\n"
    assert "text/plain" in res.headers["content-type"]


def test_get_file_returns_404_when_missing(
    gitlab_env: None,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))

    with patch("main._clone_repo_if_needed"), patch(
        "services.git.get_git_provider"
    ), patch("services.index.load_index"), patch(
        "routers.files.maybe_pull", new_callable=AsyncMock
    ):
        app = create_app()
        with TestClient(app) as client:
            res = client.get("/file?path=docs/nonexistent.md")

    assert res.status_code == 404


def test_get_file_calls_maybe_pull(
    gitlab_env: None,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))
    _write_file(str(tmp_path), "docs/page.md", "content")

    mock_pull = AsyncMock()

    with patch("main._clone_repo_if_needed"), patch(
        "services.git.get_git_provider"
    ), patch("services.index.load_index"), patch(
        "routers.files.maybe_pull", mock_pull
    ):
        app = create_app()
        with TestClient(app) as client:
            client.get("/file?path=docs/page.md")

    mock_pull.assert_awaited_once()


def test_get_file_missing_path_query_param(
    gitlab_env: None,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))

    with patch("main._clone_repo_if_needed"), patch(
        "services.git.get_git_provider"
    ), patch("services.index.load_index"), patch(
        "routers.files.maybe_pull", new_callable=AsyncMock
    ):
        app = create_app()
        with TestClient(app) as client:
            res = client.get("/file")

    assert res.status_code == 422


def test_get_file_rejects_path_traversal(
    gitlab_env: None,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))

    with patch("main._clone_repo_if_needed"), patch(
        "services.git.get_git_provider"
    ), patch("services.index.load_index"), patch(
        "routers.files.maybe_pull", new_callable=AsyncMock
    ):
        app = create_app()
        with TestClient(app) as client:
            res = client.get("/file?path=../../etc/passwd")

    assert res.status_code == 400
