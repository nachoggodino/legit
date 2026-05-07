import os
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


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
    app_client: TestClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))
    _write_file(str(tmp_path), "docs/example.md", "# Hello World\n")

    with patch("routers.files.maybe_pull", new_callable=AsyncMock):
        res = app_client.get("/file?path=docs/example.md")

    assert res.status_code == 200
    assert res.text == "# Hello World\n"
    assert "text/plain" in res.headers["content-type"]


def test_get_file_returns_404_when_missing(
    app_client: TestClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))

    with patch("routers.files.maybe_pull", new_callable=AsyncMock):
        res = app_client.get("/file?path=docs/nonexistent.md")

    assert res.status_code == 404


def test_get_file_calls_maybe_pull(
    app_client: TestClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))
    _write_file(str(tmp_path), "docs/page.md", "content")

    mock_pull = AsyncMock()
    with patch("routers.files.maybe_pull", mock_pull):
        app_client.get("/file?path=docs/page.md")

    mock_pull.assert_awaited_once()


def test_get_file_missing_path_query_param(
    app_client: TestClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))

    with patch("routers.files.maybe_pull", new_callable=AsyncMock):
        res = app_client.get("/file")

    assert res.status_code == 422


def test_get_file_rejects_path_traversal(
    app_client: TestClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))

    with patch("routers.files.maybe_pull", new_callable=AsyncMock):
        res = app_client.get("/file?path=../../etc/passwd")

    assert res.status_code == 400
