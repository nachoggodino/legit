# Copisaurus

AI-powered documentation wiki backed by Git. The backend is a FastAPI service that exposes AI-assisted search, editing, and Git commit endpoints with Server-Sent Events streaming. All content lives in a Git repository (GitLab or GitHub) — no database.

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) ≥ 24
- [Docker Compose](https://docs.docker.com/compose/) ≥ 2.20 (bundled with Docker Desktop)
- Node.js ≥ 18 (only needed to run the `npm` convenience scripts)

---

## Quick Start

### 1. Copy and fill in environment variables

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

| Variable | Description |
|---|---|
| `GIT_PROVIDER` | `gitlab` or `github` |
| `GIT_REPO_URL` | Full URL of the docs repository |
| `GIT_TOKEN` | Personal access token with read/write access |
| `GIT_DEFAULT_BRANCH` | Branch to commit to (e.g. `main` or `master`) |
| `GITLAB_URL` + `GITLAB_PROJECT_ID` | Required when `GIT_PROVIDER=gitlab` |
| `GITHUB_OWNER` + `GITHUB_REPO` | Required when `GIT_PROVIDER=github` |
| `AI_BASE_URL` | OpenAI-compatible API base URL |
| `AI_API_KEY` | LLM API key |
| `AI_MODEL` | Model identifier (e.g. `gpt-4o`) |

> `.env` is git-ignored. Never commit it. Use `.env.example` as the canonical reference.

### 2. Build and start

```bash
npm run build
npm start
```

The API is available at **http://localhost:8021**.

---

## npm Scripts Reference

| Command | Docker equivalent | Description |
|---|---|---|
| `npm run build` | `docker compose build` | Build the Docker image |
| `npm start` | `docker compose up -d` | Start the backend in detached mode |
| `npm run stop` | `docker compose down` | Stop and remove containers |
| `npm run restart` | `docker compose restart backend` | Restart the backend container |
| `npm run logs` | `docker compose logs -f backend` | Tail backend logs |
| `npm run status` | `docker compose ps` | Show container status and health |
| `npm test` | `docker compose run --rm backend python -m pytest` | Run the test suite inside Docker |
| `npm run test:verbose` | `docker compose run --rm backend python -m pytest -v` | Run tests with verbose output |
| `npm run test:local` | `cd backend && python -m pytest` | Run tests locally (requires a venv) |
| `npm run clean` | `docker compose down --volumes --remove-orphans` | Stop containers **and delete volumes** |
| `npm run shell` | `docker compose exec backend /bin/bash` | Open a shell inside the running container |

---

## API Endpoints

| Method | Path | Streaming | Description |
|---|---|---|---|
| `GET` | `/health` | No | Health check — returns `{"status": "ok"}` |
| `GET` | `/file?path=<path>` | No | Returns raw Markdown of a single file |
| `POST` | `/chat` | SSE | AI search with tool-use. Events: `reading_file`, `token`, `done`, `error` |
| `POST` | `/edit` | SSE | AI-assisted editing. Events: `status`, `done`, `error` |
| `POST` | `/commit` | SSE | Commit to Git + update index. Events: `status`, `done`, `error` |

---

## Health Check

Docker Compose runs a health check against `GET /health` every **5 minutes** (10 s timeout, 3 retries, 30 s start period). Check current health:

```bash
npm run status
# or
docker compose ps
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `GIT_PROVIDER` | Yes | — | `gitlab` or `github` |
| `GIT_REPO_URL` | Yes | — | Full repository URL (without token; token is injected at runtime) |
| `GIT_TOKEN` | Yes | — | Personal access token (injected into URL by backend) |
| `GIT_DEFAULT_BRANCH` | Yes | — | Target branch for commits |
| `GITLAB_URL` | GitLab only | — | GitLab base URL |
| `GITLAB_PROJECT_ID` | GitLab only | — | Numeric project ID |
| `GITHUB_OWNER` | GitHub only | — | Repository owner or organisation |
| `GITHUB_REPO` | GitHub only | — | Repository name |
| `AI_BASE_URL` | Yes | — | OpenAI-compatible API base URL |
| `AI_API_KEY` | Yes | — | LLM API key |
| `AI_MODEL` | Yes | — | Model identifier |
| `MAX_CONTEXT_TOKENS` | No | `150000` | Token budget for LLM context |
| `DOCS_LOCAL_PATH` | No | `/app/docs-repo` | Clone path inside container |

---

## Running Tests Locally

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m pytest
```

---

## Project Structure

```
/
├── backend/
│   ├── Dockerfile
│   ├── main.py            # FastAPI app factory + lifespan
│   ├── routers/           # chat, edit, commit, files
│   ├── services/          # ai, git, index
│   ├── models/            # Pydantic schemas
│   ├── tests/             # pytest suite
│   └── requirements.txt
├── docker-compose.yml
├── package.json           # npm convenience scripts
├── .env.example           # Environment variable template
└── SPEC.md
```
