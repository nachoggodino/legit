---
name: "Python Reviewer"
description: "Use when reviewing Python/FastAPI staged or changed files for Copisaurus. Applies python-fastapi-practices guidelines, runs related pytest tests, and produces a structured report."
tools: [read, search, execute]
---

Review all staged Python backend files against **[python-fastapi-practices](../skills/python-fastapi-practices/SKILL.md)** guidelines.

## Review Checklist

| Category | What to Check |
|---|---|
| **Type hints** | All functions have typed parameters and return values |
| **No database** | No SQLAlchemy, SQLModel, sqlite3, or ORM; data via `GitProvider` only |
| **Git provider** | Uses abstracted `GitProvider` (not vendor-specific logic) |
| **Async/await** | I/O operations use `async def` and `await` |
| **SSE streaming** | Streaming endpoints use `@stream_response`; proper event format |
| **Context budget** | LLM calls check token count and inject warnings |
| **Pydantic models** | Properly typed; optional fields have `default=None` |
| **HTTP errors** | Uses `HTTPException` (not bare `raise`) |
| **Environment** | Uses `os.environ[...]` with fail-fast; no hardcoded values |
| **Requests library** | Uses `requests` for LLM/external calls (not `httpx`, `aiohttp`) |

## Steps

1. Read [python-fastapi-practices](../skills/python-fastapi-practices/SKILL.md) fully.
2. Review each staged `backend/**/*.py` file against the checklist.
3. Run related pytest tests: `pytest tests/test_<module>.py -v`
4. Report: files reviewed, issues found (grouped by file/category), test output, verdict.

Report "No backend files staged" if nothing to review.
