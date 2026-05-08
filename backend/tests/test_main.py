"""Tests for main.py — app factory, env var validation, and repo cloning."""
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import _clone_repo_if_needed, _validate_env_vars, create_app
from tests.conftest import BASE_ENV


# ---------------------------------------------------------------------------
# _validate_env_vars
# ---------------------------------------------------------------------------


class TestValidateEnvVars:
    def test_passes_when_all_gitlab_vars_present(
        self, gitlab_env: None
    ) -> None:
        # Should not raise
        _validate_env_vars()

    def test_passes_when_all_github_vars_present(
        self, github_env: None
    ) -> None:
        _validate_env_vars()

    def test_raises_on_missing_required_var(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        for key, value in BASE_ENV.items():
            monkeypatch.setenv(key, value)
        monkeypatch.delenv("AI_API_KEY")

        with pytest.raises(RuntimeError, match="Missing required environment variables"):
            _validate_env_vars()

    def test_raises_on_missing_gitlab_var(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        for key, value in BASE_ENV.items():
            monkeypatch.setenv(key, value)
        monkeypatch.delenv("GITLAB_PROJECT_ID")

        with pytest.raises(RuntimeError, match="Missing 'gitlab' environment variables"):
            _validate_env_vars()

    def test_raises_listing_all_missing_vars(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        for key, value in BASE_ENV.items():
            monkeypatch.setenv(key, value)
        monkeypatch.delenv("AI_API_KEY")
        monkeypatch.delenv("AI_MODEL")

        with pytest.raises(RuntimeError) as exc_info:
            _validate_env_vars()

        assert "AI_API_KEY" in str(exc_info.value)


# ---------------------------------------------------------------------------
# _clone_repo_if_needed
# ---------------------------------------------------------------------------


class TestCloneRepoIfNeeded:
    def test_skips_clone_when_git_dir_exists(
        self, gitlab_env: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))
        (tmp_path / ".git").mkdir()

        mock_repo_instance = MagicMock()
        with (
            patch("main.git.Repo", return_value=mock_repo_instance),
            patch("main.git.Repo.clone_from") as mock_clone,
        ):
            _clone_repo_if_needed()

        mock_clone.assert_not_called()

    def test_clones_when_directory_missing(
        self, gitlab_env: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        docs_path = tmp_path / "new-repo"
        monkeypatch.setenv("DOCS_LOCAL_PATH", str(docs_path))

        with patch("main.git.Repo.clone_from") as mock_clone:
            _clone_repo_if_needed()

        mock_clone.assert_called_once()
        call_args = mock_clone.call_args
        assert call_args.args[0] == "https://gitlab.example.com/group/repo"
        assert call_args.args[1] == str(docs_path)

    def test_clones_when_no_git_dir(
        self, gitlab_env: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Directory exists but has no .git subdirectory
        monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))

        with patch("main.git.Repo.clone_from") as mock_clone:
            _clone_repo_if_needed()

        mock_clone.assert_called_once()

    def test_passes_auth_header_not_url(
        self, gitlab_env: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Token must be passed via http.extraHeader, never embedded in the URL."""
        docs_path = tmp_path / "repo"
        monkeypatch.setenv("DOCS_LOCAL_PATH", str(docs_path))

        captured_args: dict[str, object] = {}

        def capture_clone(url: str, path: str, env: dict[str, str]) -> MagicMock:
            captured_args["url"] = url
            captured_args["env"] = env
            return MagicMock()

        with patch("main.git.Repo.clone_from", side_effect=capture_clone):
            _clone_repo_if_needed()

        # Token should be in the Authorization header config, not in the URL
        captured_env = captured_args.get("env", {})
        assert captured_env.get("GIT_CONFIG_KEY_0") == "http.extraHeader"
        assert "glpat-test" in captured_env.get("GIT_CONFIG_VALUE_0", "")
        # Repo URL passed to clone_from must not contain the token
        captured_url = captured_args.get("url", "")
        assert "glpat-test" not in captured_url


# ---------------------------------------------------------------------------
# 500 error handler
# ---------------------------------------------------------------------------


class TestServerErrorHandler:
    def test_500_handler_returns_json_error(
        self, gitlab_env: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))

        from fastapi.responses import JSONResponse

        with (
            patch("main._clone_repo_if_needed"),
            patch("services.git.get_git_provider"),
            patch("services.index.load_index"),
        ):
            app = create_app()

            # Register a route that always raises an unhandled exception
            @app.get("/explode")
            async def explode() -> JSONResponse:
                raise RuntimeError("boom")

            with TestClient(app, raise_server_exceptions=False) as client:
                response = client.get("/explode")

        assert response.status_code == 500
        assert response.json() == {"detail": "Internal server error"}
