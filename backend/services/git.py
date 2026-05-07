import asyncio
import os
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

import git
import requests

PULL_INTERVAL_SECONDS: int = 60

_last_pull_at: float = 0.0
_provider: "GitProvider | None" = None


class GitProvider(ABC):
    """Abstract base class for Git provider implementations."""

    def _write_files_locally(self, files: list[dict[str, Any]]) -> None:
        """Write committed files to the local clone so reads stay in sync."""
        docs_path = Path(os.environ["DOCS_LOCAL_PATH"])
        for f in files:
            local_path = docs_path / f["path"]
            local_path.parent.mkdir(parents=True, exist_ok=True)
            local_path.write_text(f["content"], encoding="utf-8")

    @abstractmethod
    async def get_file(self, path: str) -> str:
        """Return the raw content of a file from the local clone."""
        ...

    @abstractmethod
    async def commit_files(
        self, files: list[dict[str, Any]], branch: str, message: str
    ) -> str:
        """Commit files via the provider API and return the commit URL."""
        ...


class GitLabProvider(GitProvider):
    def __init__(self) -> None:
        self._url = os.environ["GITLAB_URL"].rstrip("/")
        self._project_id = os.environ["GITLAB_PROJECT_ID"]
        self._token = os.environ["GIT_TOKEN"]
        self._docs_path = Path(os.environ["DOCS_LOCAL_PATH"])

    async def get_file(self, path: str) -> str:
        full_path = self._docs_path / path
        return await asyncio.to_thread(full_path.read_text, encoding="utf-8")

    async def commit_files(
        self, files: list[dict[str, Any]], branch: str, message: str
    ) -> str:
        actions: list[dict[str, str]] = []
        for f in files:
            local_path = self._docs_path / f["path"]
            action = "update" if local_path.exists() else "create"
            actions.append(
                {
                    "action": action,
                    "file_path": f["path"],
                    "content": f["content"],
                }
            )

        api_url = (
            f"{self._url}/api/v4/projects/{self._project_id}/repository/commits"
        )
        headers = {
            "PRIVATE-TOKEN": self._token,
            "Content-Type": "application/json",
        }
        payload: dict[str, Any] = {
            "branch": branch,
            "commit_message": message,
            "actions": actions,
        }

        response = await asyncio.to_thread(
            requests.post, api_url, json=payload, headers=headers, timeout=30
        )
        response.raise_for_status()
        commit_id: str = response.json()["id"]

        await asyncio.to_thread(self._write_files_locally, files)

        repo_url = os.environ["GIT_REPO_URL"].rstrip("/")
        return f"{repo_url}/-/commit/{commit_id}"


class GitHubProvider(GitProvider):
    def __init__(self) -> None:
        self._owner = os.environ["GITHUB_OWNER"]
        self._repo = os.environ["GITHUB_REPO"]
        self._token = os.environ["GIT_TOKEN"]
        self._docs_path = Path(os.environ["DOCS_LOCAL_PATH"])

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    @property
    def _base_url(self) -> str:
        return f"https://api.github.com/repos/{self._owner}/{self._repo}"

    async def get_file(self, path: str) -> str:
        full_path = self._docs_path / path
        return await asyncio.to_thread(full_path.read_text, encoding="utf-8")

    async def commit_files(
        self, files: list[dict[str, Any]], branch: str, message: str
    ) -> str:
        headers = self._headers
        base_url = self._base_url

        # 1. Get the current branch ref to obtain the latest commit SHA
        ref_resp = await asyncio.to_thread(
            requests.get,
            f"{base_url}/git/ref/heads/{branch}",
            headers=headers,
            timeout=30,
        )
        ref_resp.raise_for_status()
        latest_commit_sha: str = ref_resp.json()["object"]["sha"]

        # 2. Get the tree SHA for the latest commit
        commit_resp = await asyncio.to_thread(
            requests.get,
            f"{base_url}/git/commits/{latest_commit_sha}",
            headers=headers,
            timeout=30,
        )
        commit_resp.raise_for_status()
        base_tree_sha: str = commit_resp.json()["tree"]["sha"]

        # 3. Create a new tree with the updated files
        tree_items = [
            {
                "path": f["path"],
                "mode": "100644",
                "type": "blob",
                "content": f["content"],
            }
            for f in files
        ]
        tree_resp = await asyncio.to_thread(
            requests.post,
            f"{base_url}/git/trees",
            json={"base_tree": base_tree_sha, "tree": tree_items},
            headers=headers,
            timeout=30,
        )
        tree_resp.raise_for_status()
        new_tree_sha: str = tree_resp.json()["sha"]

        # 4. Create the new commit
        new_commit_resp = await asyncio.to_thread(
            requests.post,
            f"{base_url}/git/commits",
            json={
                "message": message,
                "tree": new_tree_sha,
                "parents": [latest_commit_sha],
            },
            headers=headers,
            timeout=30,
        )
        new_commit_resp.raise_for_status()
        new_commit_sha: str = new_commit_resp.json()["sha"]

        # 5. Update the branch ref to point to the new commit
        patch_resp = await asyncio.to_thread(
            requests.patch,
            f"{base_url}/git/refs/heads/{branch}",
            json={"sha": new_commit_sha},
            headers=headers,
            timeout=30,
        )
        patch_resp.raise_for_status()

        await asyncio.to_thread(self._write_files_locally, files)

        repo_url = os.environ["GIT_REPO_URL"].rstrip("/")
        return f"{repo_url}/commit/{new_commit_sha}"


def get_git_provider() -> GitProvider:
    """Return the active GitProvider singleton, initialising it on first call."""
    global _provider
    if _provider is not None:
        return _provider

    provider_name = os.environ["GIT_PROVIDER"].lower()
    if provider_name == "gitlab":
        _provider = GitLabProvider()
    elif provider_name == "github":
        _provider = GitHubProvider()
    else:
        raise ValueError(f"Unknown GIT_PROVIDER: {provider_name!r}")

    return _provider


async def maybe_pull() -> None:
    """Pull the local clone from remote if the pull interval has elapsed."""
    global _last_pull_at
    now = time.monotonic()
    if now - _last_pull_at < PULL_INTERVAL_SECONDS:
        return

    docs_path = Path(os.environ["DOCS_LOCAL_PATH"])

    def _do_pull() -> None:
        repo = git.Repo(str(docs_path))
        repo.remotes.origin.pull()

    await asyncio.to_thread(_do_pull)
    _last_pull_at = time.monotonic()
