import asyncio
import logging
import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

import git
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers.chat import chat_router
from routers.commit import commit_router
from routers.edit import edit_router
from routers.files import files_router
from services import git as git_service
from services.index import load_index

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

_REQUIRED_ENV_VARS: list[str] = [
    "GIT_PROVIDER",
    "GIT_REPO_URL",
    "GIT_TOKEN",
    "GIT_DEFAULT_BRANCH",
    "DOCS_LOCAL_PATH",
    "AI_BASE_URL",
    "AI_API_KEY",
    "AI_MODEL",
]

_PROVIDER_ENV_VARS: dict[str, list[str]] = {
    "gitlab": ["GITLAB_URL", "GITLAB_PROJECT_ID"],
    "github": ["GITHUB_OWNER", "GITHUB_REPO"],
}


def _validate_env_vars() -> None:
    missing = [v for v in _REQUIRED_ENV_VARS if v not in os.environ]
    if missing:
        raise RuntimeError(f"Missing required environment variables: {missing}")

    provider = os.environ["GIT_PROVIDER"].lower()
    provider_vars = _PROVIDER_ENV_VARS.get(provider, [])
    missing_provider = [v for v in provider_vars if v not in os.environ]
    if missing_provider:
        raise RuntimeError(
            f"Missing {provider!r} environment variables: {missing_provider}"
        )


def _clone_repo_if_needed() -> None:
    """Clone or reset the docs repo to match the remote origin."""
    docs_path = Path(os.environ["DOCS_LOCAL_PATH"])
    repo_url: str = os.environ["GIT_REPO_URL"]
    provider: str = os.environ["GIT_PROVIDER"].lower()
    token: str = os.environ["GIT_TOKEN"]
    default_branch: str = os.environ["GIT_DEFAULT_BRANCH"]

    logger.info(f"Ensuring repo at {docs_path}")
    logger.info(f"Provider: {provider}")
    logger.info(f"Repo URL: {repo_url}")
    logger.info(f"Default branch: {default_branch}")

    # If repo exists, do a hard reset to match origin
    if docs_path.exists() and (docs_path / ".git").exists():
        logger.info("Repo already exists, performing hard reset to origin...")
        try:
            repo = git.Repo(str(docs_path))
            repo.remotes.origin.fetch()
            repo.heads[default_branch].set_tracking_branch(
                repo.remotes.origin.refs[default_branch]
            )
            repo.heads[default_branch].checkout()
            repo.git.reset("--hard", f"origin/{default_branch}")
            logger.info(
                f"✓ Repo reset to origin/{default_branch} at {repo.head.commit.hexsha[:8]}"
            )
            return
        except Exception as e:
            logger.warning(
                f"Hard reset failed, will re-clone. Error: {e}"
            )
            import shutil
            shutil.rmtree(docs_path)

    # Fresh clone
    logger.info("Cloning repo from scratch...")
    docs_path.mkdir(parents=True, exist_ok=True)

    # Construct authenticated URL based on provider
    # For GitLab: https://oauth2:<token>@host/path
    # For GitHub: https://<token>@host/path
    if provider == "gitlab":
        # GitLab PAT auth: oauth2 is the username, token is the password
        parts = repo_url.split("://", 1)
        authenticated_url = f"{parts[0]}://oauth2:{token}@{parts[1]}"
    elif provider == "github":
        # GitHub PAT auth: token is the username, empty password
        parts = repo_url.split("://", 1)
        authenticated_url = f"{parts[0]}://{token}@{parts[1]}"
    else:
        raise ValueError(f"Unsupported GIT_PROVIDER: {provider}")

    clone_env = {
        **os.environ,
        "GIT_TERMINAL_PROMPT": "0",
    }
    logger.info(f"Cloning to {docs_path}...")
    repo = git.Repo.clone_from(authenticated_url, str(docs_path), env=clone_env)
    logger.info(f"✓ Cloned successfully at {repo.head.commit.hexsha[:8]}")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("=" * 60)
    logger.info("🚀 Copisaurus Backend Starting")
    logger.info("=" * 60)

    logger.info("[1/5] Validating environment variables...")
    _validate_env_vars()
    logger.info("[1/5] ✓ Environment variables valid")

    logger.info("[2/5] Cloning/resetting docs repository...")
    await asyncio.to_thread(_clone_repo_if_needed)
    logger.info("[2/5] ✓ Docs repository ready")

    logger.info("[3/5] Initializing Git provider...")
    provider = git_service.get_git_provider()
    logger.info(f"[3/5] ✓ Using {provider.__class__.__name__}")

    logger.info("[4/5] Loading document index...")
    load_index()
    logger.info("[4/5] ✓ Document index loaded")

    logger.info("[5/5] Starting periodic pull task...")
    pull_task = asyncio.create_task(git_service.periodic_pull())
    logger.info("[5/5] ✓ Periodic pull task started")

    logger.info("=" * 60)
    logger.info("✨ Backend ready and listening on 0.0.0.0:8000")
    logger.info("=" * 60)

    try:
        yield
    finally:
        logger.info("Shutting down...")
        pull_task.cancel()
        try:
            await pull_task
        except asyncio.CancelledError:
            pass
        logger.info("Shutdown complete")


def create_app() -> FastAPI:
    app = FastAPI(title="Copisaurus Backend", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(files_router)
    app.include_router(chat_router)
    app.include_router(edit_router)
    app.include_router(commit_router)

    @app.get("/health")
    async def health_check() -> JSONResponse:
        return JSONResponse(status_code=200, content={"status": "ok"})

    @app.exception_handler(404)
    async def not_found_handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": "Not found"})

    @app.exception_handler(500)
    async def server_error_handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    return app


app = create_app()
