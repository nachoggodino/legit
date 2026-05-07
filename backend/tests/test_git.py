import os
import time
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import services.git as git_module
from services.git import (
    GitHubProvider,
    GitLabProvider,
    GitProvider,
    get_git_provider,
    maybe_pull,
)

from tests.conftest import BASE_ENV, GITHUB_ENV


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _reset_provider() -> None:
    """Reset the module-level singleton so each test starts clean."""
    git_module._provider = None
    git_module._last_pull_at = 0.0


# ---------------------------------------------------------------------------
# GitProvider interface
# ---------------------------------------------------------------------------


def test_git_provider_is_abstract() -> None:
    with pytest.raises(TypeError):
        GitProvider()  # type: ignore[abstract]


# ---------------------------------------------------------------------------
# GitLabProvider
# ---------------------------------------------------------------------------


class TestGitLabProvider:
    def test_init_reads_env_vars(self, gitlab_env: None) -> None:
        provider = GitLabProvider()
        assert provider._url == "https://gitlab.example.com"
        assert provider._project_id == "42"
        assert provider._token == "glpat-test"

    def test_init_strips_trailing_slash(self, monkeypatch: pytest.MonkeyPatch) -> None:
        for key, value in BASE_ENV.items():
            monkeypatch.setenv(key, value)
        monkeypatch.setenv("GITLAB_URL", "https://gitlab.example.com/")
        provider = GitLabProvider()
        assert not provider._url.endswith("/")

    def test_get_file_reads_local_clone(
        self, gitlab_env: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))
        doc_dir = tmp_path / "docs"
        doc_dir.mkdir(parents=True, exist_ok=True)
        (doc_dir / "page.md").write_text("# Hello", encoding="utf-8")

        import asyncio

        provider = GitLabProvider()
        content = asyncio.run(provider.get_file("docs/page.md"))
        assert content == "# Hello"

    @pytest.mark.asyncio
    async def test_commit_files_calls_gitlab_api(
        self, gitlab_env: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))
        monkeypatch.setenv("GIT_REPO_URL", "https://gitlab.example.com/group/repo")

        mock_response = MagicMock()
        mock_response.json.return_value = {"id": "abc123"}
        mock_response.raise_for_status = MagicMock()

        with patch("services.git.requests.post", return_value=mock_response) as mock_post:
            provider = GitLabProvider()
            url = await provider.commit_files(
                files=[{"path": "docs/test.md", "content": "# Test"}],
                branch="master",
                message="Test commit",
            )

        mock_post.assert_called_once()
        # requests.post is called via asyncio.to_thread(requests.post, url, ...)
        # so the URL is always the first positional argument
        called_url: str = mock_post.call_args.args[0]
        assert "api/v4/projects/42/repository/commits" in called_url
        assert url == "https://gitlab.example.com/group/repo/-/commit/abc123"

    @pytest.mark.asyncio
    async def test_commit_files_payload_structure(
        self, gitlab_env: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))

        mock_response = MagicMock()
        mock_response.json.return_value = {"id": "def456"}
        mock_response.raise_for_status = MagicMock()

        with patch("services.git.requests.post", return_value=mock_response) as mock_post:
            provider = GitLabProvider()
            await provider.commit_files(
                files=[{"path": "new.md", "content": "new file"}],
                branch="feature",
                message="Add new doc",
            )

        payload = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1]["json"]
        assert payload["branch"] == "feature"
        assert payload["commit_message"] == "Add new doc"
        assert payload["actions"][0]["file_path"] == "new.md"

    @pytest.mark.asyncio
    async def test_commit_files_uses_update_action_for_existing_file(
        self, gitlab_env: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))
        (tmp_path / "existing.md").write_text("old", encoding="utf-8")

        mock_response = MagicMock()
        mock_response.json.return_value = {"id": "ghi789"}
        mock_response.raise_for_status = MagicMock()

        with patch("services.git.requests.post", return_value=mock_response) as mock_post:
            provider = GitLabProvider()
            await provider.commit_files(
                files=[{"path": "existing.md", "content": "new content"}],
                branch="master",
                message="Update",
            )

        payload = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1]["json"]
        assert payload["actions"][0]["action"] == "update"

    @pytest.mark.asyncio
    async def test_commit_files_uses_create_action_for_new_file(
        self, gitlab_env: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))

        mock_response = MagicMock()
        mock_response.json.return_value = {"id": "jkl012"}
        mock_response.raise_for_status = MagicMock()

        with patch("services.git.requests.post", return_value=mock_response) as mock_post:
            provider = GitLabProvider()
            await provider.commit_files(
                files=[{"path": "brand-new.md", "content": "new"}],
                branch="master",
                message="Create",
            )

        payload = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1]["json"]
        assert payload["actions"][0]["action"] == "create"


# ---------------------------------------------------------------------------
# GitHubProvider
# ---------------------------------------------------------------------------


class TestGitHubProvider:
    def test_init_reads_env_vars(self, github_env: None) -> None:
        provider = GitHubProvider()
        assert provider._owner == "my-org"
        assert provider._repo == "ai-research"
        assert provider._token == "glpat-test"

    def test_headers_contain_auth(self, github_env: None) -> None:
        provider = GitHubProvider()
        headers = provider._headers
        assert headers["Authorization"] == "Bearer glpat-test"
        assert "application/vnd.github+json" in headers["Accept"]

    def test_base_url(self, github_env: None) -> None:
        provider = GitHubProvider()
        assert provider._base_url == "https://api.github.com/repos/my-org/ai-research"

    @pytest.mark.asyncio
    async def test_commit_files_calls_github_api(
        self, github_env: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))
        monkeypatch.setenv("GIT_REPO_URL", "https://github.com/my-org/ai-research")

        ref_resp = MagicMock()
        ref_resp.json.return_value = {"object": {"sha": "commit-sha"}}
        ref_resp.raise_for_status = MagicMock()

        commit_resp = MagicMock()
        commit_resp.json.return_value = {"tree": {"sha": "tree-sha"}}
        commit_resp.raise_for_status = MagicMock()

        new_tree_resp = MagicMock()
        new_tree_resp.json.return_value = {"sha": "new-tree-sha"}
        new_tree_resp.raise_for_status = MagicMock()

        new_commit_resp = MagicMock()
        new_commit_resp.json.return_value = {"sha": "new-commit-sha"}
        new_commit_resp.raise_for_status = MagicMock()

        patch_resp = MagicMock()
        patch_resp.raise_for_status = MagicMock()

        with patch("services.git.requests.get", side_effect=[ref_resp, commit_resp]), \
             patch("services.git.requests.post", side_effect=[new_tree_resp, new_commit_resp]), \
             patch("services.git.requests.patch", return_value=patch_resp):
            provider = GitHubProvider()
            url = await provider.commit_files(
                files=[{"path": "docs/test.md", "content": "# Test"}],
                branch="main",
                message="Test commit",
            )

        assert url == "https://github.com/my-org/ai-research/commit/new-commit-sha"


# ---------------------------------------------------------------------------
# get_git_provider factory
# ---------------------------------------------------------------------------


class TestGetGitProvider:
    def setup_method(self) -> None:
        _reset_provider()

    def teardown_method(self) -> None:
        _reset_provider()

    def test_returns_gitlab_provider(self, gitlab_env: None) -> None:
        provider = get_git_provider()
        assert isinstance(provider, GitLabProvider)

    def test_returns_github_provider(self, github_env: None) -> None:
        provider = get_git_provider()
        assert isinstance(provider, GitHubProvider)

    def test_returns_singleton(self, gitlab_env: None) -> None:
        p1 = get_git_provider()
        p2 = get_git_provider()
        assert p1 is p2

    def test_raises_on_unknown_provider(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        for key, value in BASE_ENV.items():
            monkeypatch.setenv(key, value)
        monkeypatch.setenv("GIT_PROVIDER", "bitbucket")
        with pytest.raises(ValueError, match="Unknown GIT_PROVIDER"):
            get_git_provider()


# ---------------------------------------------------------------------------
# maybe_pull
# ---------------------------------------------------------------------------


class TestMaybePull:
    def setup_method(self) -> None:
        _reset_provider()

    @pytest.mark.asyncio
    async def test_skips_pull_within_interval(
        self, gitlab_env: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))
        git_module._last_pull_at = time.monotonic()  # pretend we just pulled

        with patch("services.git.git.Repo") as mock_repo:
            await maybe_pull()
            mock_repo.assert_not_called()

    @pytest.mark.asyncio
    async def test_pulls_when_interval_elapsed(
        self, gitlab_env: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DOCS_LOCAL_PATH", str(tmp_path))
        git_module._last_pull_at = 0.0  # force a pull

        mock_origin = MagicMock()
        mock_repo_instance = MagicMock()
        mock_repo_instance.remotes.origin = mock_origin

        with patch("services.git.git.Repo", return_value=mock_repo_instance):
            await maybe_pull()

        mock_origin.pull.assert_called_once()
        assert git_module._last_pull_at > 0.0
