# Copisaurus — Project Instructions

## Overview

Copisaurus is a documentation/wiki system for an AI research project, built with Docosaurus 3.x frontend and FastAPI backend. All content lives in a Git repository as Markdown files. The application has no own database — the Git provider (GitLab or GitHub) is the single source of truth. The backend provides AI-assisted search and editing with Server-Sent Events (SSE) streaming.

There is no authentication in the MVP. The platform supports both self-hosted GitLab and GitHub.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Docusaurus 3.x (React + MDX) |
| Styles | Docusaurus CSS + custom CSS modules |
| Markdown rendering | Built-in Docusaurus MDX rendering |
| Backend | Python 3.11+ + FastAPI |
| Database | None (Git is source of truth, `_index.json` is in-memory) |
| LLM integration | Direct HTTP calls via `requests` to OpenAI-compatible API |
| Async | `asyncio` + FastAPI for SSE streaming |
| Containers | Docker + Docker Compose |
| Version Control | GitLab (self-hosted) or GitHub (abstracted via `GitProvider`) |

## Project Structure

```
/
├── backend/
│   ├── Dockerfile
│   ├── main.py                # FastAPI app factory, router registration
│   ├── routers/
│   │   ├── chat.py            # POST /chat (SSE, AI search with tool-use)
│   │   ├── edit.py            # POST /edit (SSE, AI editing)
│   │   ├── commit.py          # POST /commit (SSE, Git commit + index update)
│   │   └── files.py           # GET /file (fetch raw MD)
│   ├── services/
│   │   ├── git.py             # GitProvider ABC, GitLabProvider, GitHubProvider
│   │   ├── ai.py              # LLM calls + context budget logic
│   │   └── index.py           # _index.json in-memory management
│   ├── models/                # Pydantic request/response schemas
│   ├── tests/                 # pytest suite
│   └── requirements.txt
│
├── frontend/
│   ├── Dockerfile
│   ├── docusaurus.config.js   # Docusaurus configuration
│   ├── src/
│   │   ├── components/
│   │   │   ├── AiSearchBar.jsx        # Navbar search + AI button + inline result
│   │   │   ├── EditFab.jsx            # Floating action button (pencil+spark)
│   │   │   ├── EditModal.jsx          # Split-pane editor/preview modal
│   │   │   ├── MarkdownPreview.jsx    # Live MD preview
│   │   │   ├── CommitForm.jsx         # Branch selection + confirm
│   │   │   └── NavigationGuard.jsx    # Page-change confirmation
│   │   ├── theme/
│   │   │   └── Navbar/
│   │   │       └── index.jsx          # Swizzled custom navbar
│   │   └── api/
│   │       └── client.ts              # Fetch helpers for SSE streams
│   └── package.json
│
├── docker-compose.yml
├── .env.example
└── SPEC.md
```

## Core Concepts

### Git Provider Abstraction
The backend implements a `GitProvider` abstract interface with two implementations:
- **GitLabProvider**: uses GitLab API v4
- **GitHubProvider**: uses GitHub REST API

Provider is selected via `GIT_PROVIDER` env var. Both providers implement:
- `get_file(path: str) → str` — fetch raw file content
- `commit_files(files: list[dict], branch: str, message: str) → str` — returns commit URL

### Document Index (`_index.json`)
- JSON file at repository root listing all docs with metadata
- Loaded into memory on backend startup
- Updated automatically on each commit (included in the same commit)
- Structure: `[{ "path": "docs/x.md", "title": "...", "summary": "...", "updated": "..." }, ...]`

### SSE Streaming
All AI endpoints (`/chat`, `/edit`, `/commit`) stream responses via Server-Sent Events. No request/response bodies for long-running operations — events arrive incrementally.

### No File Truncation
Context management is done via token budget estimation. If approaching the model's limit, the system injects a warning into the prompt instructing the LLM to stop requesting additional files. Files are never truncated.

## Backend Endpoints

| Method | Path | Streaming | Description |
|---|---|---|---|
| `GET` | `/file?path=...` | No | Returns raw Markdown of a single file |
| `POST` | `/chat` | SSE | AI search with tool-use (get_file). Events: `reading_file`, `token`, `done`, `error` |
| `POST` | `/edit` | SSE | AI-assisted editing. Events: `status`, `done`, `error` |
| `POST` | `/commit` | SSE | Commit to Git + update index. Events: `status`, `done`, `error` |

## Environment Variables

All Git provider variables use a shared `GIT_` prefix for discoverability.

| Variable | Description | Example |
|---|---|---|
| `GIT_PROVIDER` | Provider to use | `gitlab` or `github` |
| `GIT_REPO_URL` | Full repo URL (for navbar link) | `https://gitlab.example.com/group/repo` |
| `GIT_TOKEN` | Personal access token | `glpat-xxxx` / `ghp_xxxx` |
| `GIT_DEFAULT_BRANCH` | Default commit branch | `master` |
| `GITLAB_URL` | GitLab base URL (GitLab only) | `https://gitlab.example.com` |
| `GITLAB_PROJECT_ID` | Numeric project ID (GitLab only) | `42` |
| `GITHUB_OWNER` | Repo owner/org (GitHub only) | `my-org` |
| `GITHUB_REPO` | Repo name (GitHub only) | `ai-research` |
| `AI_BASE_URL` | OpenAI-compatible API base URL | `https://api.openai.com/v1` |
| `AI_API_KEY` | LLM API key | `sk-xxxx` |
| `AI_MODEL` | Model identifier | `gpt-4o` |
| `DOCS_LOCAL_PATH` | Local clone path inside container | `/app/docs-repo` |
| `MAX_CONTEXT_TOKENS` | Context budget (default: 150000) | `150000` |

## Rules for Copilot

- **Always propose a corresponding test file** when implementing any source file.
- **No database layer.** Data lives in Git. The only in-memory state is the `_index.json` index and the current cached repo clone.
- **No SQL.** Use only Git API and file I/O. Services interact with files and the Git provider.
- Use async/await for I/O-heavy operations (Git API calls, file reads, LLM calls).
- **SSE streaming.** All AI endpoints must stream via `@stream_response`. Never return full responses in one go.
- **Context budget management.** Before LLM calls, estimate token count. If approaching `MAX_CONTEXT_TOKENS`, inject a warning into the system prompt.
- Use `requests` library for LLM API calls (not `httpx` or `aiohttp`).
- Return typed Pydantic `BaseModel` for non-streaming endpoints.
- Use `HTTPException` for all error responses.
- The frontend uses `fetch` for all HTTP calls. Do not introduce `axios` or other HTTP libraries.
- Git-related config is always accessed via `os.environ["GIT_*"]` with fail-fast on missing values.

## Per-Language Best Practices

Load the relevant skill before writing or reviewing code:

- Python/FastAPI → `python-fastapi-practices`
- React/TypeScript → `react-vite-practices`
- Docusaurus setup, SSE streaming, component patterns → `frontend-setup-patterns`
- Writing or reviewing tests → `testing-practices`
(Note: `sqlite-patterns` skill is not applicable — this project has no database.)
## Agents

| Agent | File | Purpose |
|---|---|---|
| `python-developer` | `.github/agents/python-developer.agent.md` | Implement backend routers, services, and tests |
| `python-reviewer` | `.github/agents/python-reviewer.agent.md` | Review staged Python/FastAPI files |
| `react-developer` | `.github/agents/react-developer.agent.md` | Implement Docusaurus frontend components, custom hooks, and tests |
| `react-reviewer` | `.github/agents/react-reviewer.agent.md` | Review staged React/TypeScript files |
| `unit-test-reviewer` | `.github/agents/unit-test-reviewer.agent.md` | Review all unit tests, identify missing coverage and poorly designed tests |
| `doc-maintainer` | `.github/agents/doc-maintainer.agent.md` | Maintain project documentation (README, doc/, specs); analyze staged changes and update relevant docs |
