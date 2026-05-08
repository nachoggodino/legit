import asyncio
import logging
import os
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Literal

import git
import requests

logger = logging.getLogger(__name__)

PULL_INTERVAL_SECONDS: int = 120  # Pull every 2 minutes


class GitProvider(ABC):
    """Abstract base class for Git provider implementations."""

    def __init__(self) -> None:
        self._docs_path = Path(os.environ["DOCS_LOCAL_PATH"])

    @property
    def _repo_url(self) -> str:
        return os.environ["GIT_REPO_URL"].rstrip("/")

    def _write_files_locally(self, files: list[dict[str, Any]]) -> None:
        """Write committed files to the local clone so reads stay in sync."""
        for f in files:
            local_path = self._docs_path / f["path"]
            local_path.parent.mkdir(parents=True, exist_ok=True)
            local_path.write_text(f["content"], encoding="utf-8")

    async def get_file(self, path: str) -> str:
        """Return the raw content of a file from the local clone."""
        full_path = self._docs_path / path
        logger.debug(f"Reading file: {path}")
        content = await asyncio.to_thread(full_path.read_text, encoding="utf-8")
        logger.debug(f"Read {len(content)} bytes from {path}")
        return content

    @abstractmethod
    async def commit_files(
        self, files: list[dict[str, Any]], branch: str, message: str
    ) -> str:
        """Commit files via the provider API and return the commit URL."""
        ...


class GitLabProvider(GitProvider):
    def __init__(self) -> None:
        super().__init__()
        self._url = os.environ["GITLAB_URL"].rstrip("/")
        self._project_id = os.environ["GITLAB_PROJECT_ID"]
        self._token = os.environ["GIT_TOKEN"]

    async def commit_files(
        self, files: list[dict[str, Any]], branch: str, message: str
    ) -> str:
        logger.info(f"Committing {len(files)} file(s) to {branch}")
        actions: list[dict[str, str]] = []
        for f in files:
            local_path = self._docs_path / f["path"]
            action = "update" if local_path.exists() else "create"
            logger.debug(f"  - {action}: {f['path']}")
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

        commit_url = f"{self._repo_url}/-/commit/{commit_id}"
        logger.info(f"✓ Committed {len(files)} file(s) to {branch}: {commit_id[:8]}")
        return commit_url


class GitHubProvider(GitProvider):
    def __init__(self) -> None:
        super().__init__()
        self._owner = os.environ["GITHUB_OWNER"]
        self._repo = os.environ["GITHUB_REPO"]
        self._token = os.environ["GIT_TOKEN"]

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

    async def _gh_request(self, method: Literal["get", "post", "patch"], url: str, *, body: Any = None) -> Any:
        fn = getattr(requests, method)
        resp = await asyncio.to_thread(fn, url, headers=self._headers, json=body, timeout=30)
        resp.raise_for_status()
        return resp.json()

    async def commit_files(
        self, files: list[dict[str, Any]], branch: str, message: str
    ) -> str:
        base_url = self._base_url

        ref_data = await self._gh_request("get", f"{base_url}/git/ref/heads/{branch}")
        latest_commit_sha: str = ref_data["object"]["sha"]

        commit_data = await self._gh_request("get", f"{base_url}/git/commits/{latest_commit_sha}")
        base_tree_sha: str = commit_data["tree"]["sha"]

        tree_items = [
            {
                "path": f["path"],
                "mode": "100644",
                "type": "blob",
                "content": f["content"],
            }
            for f in files
        ]
        tree_data = await self._gh_request(
            "post", f"{base_url}/git/trees",
            body={"base_tree": base_tree_sha, "tree": tree_items},
        )
        new_tree_sha: str = tree_data["sha"]

        new_commit_data = await self._gh_request(
            "post", f"{base_url}/git/commits",
            body={"message": message, "tree": new_tree_sha, "parents": [latest_commit_sha]},
        )
        new_commit_sha: str = new_commit_data["sha"]

        await self._gh_request(
            "patch", f"{base_url}/git/refs/heads/{branch}",
            body={"sha": new_commit_sha},
        )

        await asyncio.to_thread(self._write_files_locally, files)

        return f"{self._repo_url}/commit/{new_commit_sha}"


_last_pull_at: float = 0.0
_provider: GitProvider | None = None


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

    # Set eagerly before await to prevent concurrent pulls (TOCTOU race fix).
    _last_pull_at = time.monotonic()

    docs_path = Path(os.environ["DOCS_LOCAL_PATH"])

    def _do_pull() -> None:
        logger.info("Pulling docs repo from remote...")
        try:
            repo = git.Repo(str(docs_path))
            branch = repo.active_branch.name
            logger.debug(f"Current branch: {branch}")
            
            # Fetch and hard reset to match remote
            repo.remotes.origin.fetch()
            repo.git.reset("--hard", f"origin/{branch}")
            
            commit = repo.head.commit
            logger.info(
                f"✓ Docs repo pulled and reset to {commit.hexsha[:8]} "
                f"({commit.message.strip()[:60]})"
            )
        except Exception as e:
            logger.error(f"Pull failed: {e}", exc_info=True)

    await asyncio.to_thread(_do_pull)


async def periodic_pull() -> None:
    """Background task that pulls the repo every PULL_INTERVAL_SECONDS."""
    logger.info(
        f"Periodic pull task started (interval: {PULL_INTERVAL_SECONDS}s)"
    )
    try:
        while True:
            await asyncio.sleep(PULL_INTERVAL_SECONDS)
            await maybe_pull()
    except asyncio.CancelledError:
        logger.info("Periodic pull task cancelled")
        raise
