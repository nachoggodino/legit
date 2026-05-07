import asyncio
import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

import git
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers.files import files_router
from services import git as git_service
from services.index import load_index

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
    docs_path = Path(os.environ["DOCS_LOCAL_PATH"])
    if docs_path.exists() and (docs_path / ".git").exists():
        return

    docs_path.mkdir(parents=True, exist_ok=True)

    repo_url: str = os.environ["GIT_REPO_URL"]
    token: str = os.environ["GIT_TOKEN"]

    # Pass credentials via HTTP header so the token never appears in the URL
    # (avoids token leakage in git error output, process listings, and logs).
    # GIT_CONFIG_COUNT / KEY / VALUE is supported by git ≥ 2.32.
    clone_env = {
        **os.environ,
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_CONFIG_COUNT": "1",
        "GIT_CONFIG_KEY_0": "http.extraHeader",
        "GIT_CONFIG_VALUE_0": f"Authorization: Bearer {token}",
    }
    git.Repo.clone_from(repo_url, str(docs_path), env=clone_env)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    _validate_env_vars()
    await asyncio.to_thread(_clone_repo_if_needed)
    git_service.get_git_provider()
    load_index()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Copisaurus Backend", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(files_router)

    @app.exception_handler(404)
    async def not_found_handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": "Not found"})

    @app.exception_handler(500)
    async def server_error_handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})

    return app


app = create_app()
