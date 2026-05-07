---
name: python-fastapi-practices
description: "Use when writing, reviewing, or generating Python/FastAPI code for Copisaurus. Covers FastAPI best practices, async patterns, Git provider abstraction, SSE streaming, type hints, Pydantic models, and project structure."
---

# Python / FastAPI Best Practices — Copisaurus

## Project Structure

```
backend/
├── main.py              # App factory, router registration, startup/shutdown
├── routers/             # One file per endpoint (chat.py, edit.py, commit.py, files.py)
├── services/            # Business logic (git.py, ai.py, index.py)
├── models/              # Pydantic request/response models
├── tests/               # pytest suite
└── requirements.txt
```

## Type Hints

- Every function must have type hints on **all parameters and return value**.
- Use `Optional[str]` (or `str | None`) for nullable fields.
- Never use bare `dict` or `list` — use typed generics: `dict[str, Any]`, `list[str]`.

## Pydantic Models

- Separate `*Request` (input) and `*Response` (output) models for the API surface.
- All models are plain `BaseModel` — no ORM or database.
- Nullable optional fields must have `default=None`.
- Use `Optional[str]` for nullable fields.

## No Database Layer

This project has **no database**. All data lives in Git.

- **No SQLAlchemy, no SQLModel, no sqlite3.**
- All file access goes through the `GitProvider` abstraction (see `services/git.py`).
- The only in-memory state is the `_index.json` index and cached file content.
- No `db.py`, no schema creation, no migrations.

## Git Provider Abstraction

All Git interactions go through the `GitProvider` abstract class in `services/git.py`. Two implementations exist: `GitLabProvider` and `GitHubProvider`.

Each provider must implement:
- `async get_file(path: str) -> str` — fetch raw file content
- `async commit_files(files: list[dict], branch: str, message: str) -> str` — commit and return URL

**Always use the injected provider** — never check `GIT_PROVIDER` directly in routers. Use `get_git_provider()` helper to get the active implementation.

## Routers

- One router per endpoint group: `chat.py`, `edit.py`, `commit.py`, `files.py`.
- Register all routers in `main.py` via `app.include_router(...)`.
- Return typed Pydantic response models for non-streaming endpoints.
- Streaming endpoints return `StreamingResponse` with SSE events (see SSE Streaming section).

## Async / Await

All route handlers must be `async def`. I/O operations (Git API calls, file reads, LLM calls) must use `await`.

## SSE Streaming

Long-running operations (`/chat`, `/edit`, `/commit`) stream responses via Server-Sent Events using a `@stream_response` decorator.

**Event format:** Each event is `event: <name>`, `data: <json>`, then a blank line. Never truncate responses; stream all data.

## LLM HTTP Calls

Use `requests` library only. Keep all LLM interaction isolated in `services/ai.py`. Call OpenAI-compatible API at `AI_BASE_URL` with Bearer token auth.

## Context Budget Management

Before LLM calls, estimate token count (rough: 5 chars ≈ 1 token). If approaching `MAX_CONTEXT_TOKENS` (default 150000), inject a warning into the system prompt telling the LLM not to request more files.

## Environment Variables

Access via `os.environ["VAR_NAME"]` (raises `KeyError` if missing — fail fast on misconfiguration). Git config uses `GIT_` prefix: `GIT_PROVIDER`, `GIT_REPO_URL`, `GIT_TOKEN`, `GIT_DEFAULT_BRANCH`, plus provider-specific vars.

## HTTP Errors

Use `HTTPException` — never `raise Exception(...)` or bare `return`.

## Anti-patterns to Avoid

| Anti-pattern | Correct alternative |
|---|---|
| `sqlalchemy`, `sqlmodel`, `sqlite3` imports | Use `GitProvider` abstraction only |
| f-string URLs to Git API | Use provider methods with parameterized calls |
| `axios` / `httpx` for LLM or Git calls | Use `requests` library |
| Synchronous route handlers (`def` instead of `async def`) | All routes must be `async def` |
| Truncating file content or context | Use token budget warning; stream responses |
| Hardcoded Git provider logic in routers | Abstract via `GitProvider` interface |
| Returning raw `dict` from streaming endpoints | Return proper SSE event format via `StreamingResponse` |
