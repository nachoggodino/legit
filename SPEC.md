# SPEC — AI Wiki Platform

> High-level specification document for development agents.
> Version: 0.3 — May 2026

---

## 1. Overview

Documentation/wiki platform for an AI research project, based on Docusaurus, with custom AI extensions for search, assisted editing, and Git version management. All content lives in a Git repository as Markdown files. The application has no own database — the Git provider is the single source of truth.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Docusaurus 3.x (React + MDX) |
| Markdown rendering | Docosaurus MDX (build-time); `react-markdown` (runtime live preview) |
| Backend | FastAPI (Python 3.11+) |
| Container | Docker + Docker Compose |
| Version control | GitLab or GitHub (abstracted via `GitProvider`) |
| AI model | OpenAI-compatible (URL and API key configurable via env vars) |
| Initial deployment | Local (Docker on developer machine) |

**Rendering clarification:**
- **Build-time:** Docosaurus processes `.md` and `.mdx` files at build time using its built-in MDX compiler and theme components.
- **Runtime preview:** The edit modal's `MarkdownPreview` component uses `react-markdown` to render user-edited Markdown strings dynamically in the browser (not supported by Docosaurus's build-time MDX pipeline).

---

## 3. Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Git Provider (GitLab self-hosted or GitHub)                    │
│  ┌──────────────────────────┐  ┌──────────────────────────┐   │
│  │  /docs/**/*.md           │  │  _index.json             │   │
│  │  Documentation tree      │  │  Index with summaries    │   │
│  └──────────────────────────┘  └──────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │ Git Provider API / clone
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  FastAPI Backend                                                │
│  ┌────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ POST /chat     │  │ POST /edit      │  │ POST /commit    │ │
│  │ Search (SSE)   │  │ Edit (SSE)      │  │ Commit (SSE)    │ │
│  └────────────────┘  └─────────────────┘  └─────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ GET /file?path=... — Returns raw MD of a single file      │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP (REST + SSE)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Docusaurus Frontend (Docker)                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Custom Navbar                                          │   │
│  │  [Logo] [Text search ______ ] [✨ AI] [GitLab ↗] [☀️🌙]│   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Content (standard Docusaurus)                          │   │
│  │  Auto sidebar from MD tree                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                          ┌───────────────────┐  │
│                                          │ FAB [✏️✨]        │  │
│                                          │ Edit assistant    │  │
│                                          └───────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Navbar

### 4.1 Text Search Bar

- Free-text input visible in the navbar at all times.
- Pressing `Enter` or the magnifying glass icon performs plain local text search over indexed MD files, showing a results panel with matching documents and context snippets.
- Next to the input, a **"Search with AI"** button (spark icon). Only triggers manually — never on `Enter`.
- **During AI search loading:** the search input is disabled. SSE status events (e.g. "Reading: docs/models/gpt4.md…") appear as inline status text below the search bar.
- **AI response:** rendered as a Markdown block that expands inline directly below the search bar, streaming word by word. It grows in height until a configurable maximum (e.g. 60vh), after which it becomes scrollable. No modal or chat interface — single-turn only.

### 4.2 Git Provider Link

- Icon + label (e.g. "GitLab" or "GitHub") in the top-right corner of the navbar, resolved from `GIT_PROVIDER` env var.
- Clicking opens a new tab pointing to the repository URL configured via `GIT_REPO_URL`.

### 4.3 Dark/Light Mode Switch

- Visual toggle with both icons always visible: ☀️ (left) and 🌙 (right).
- Active icon is highlighted; inactive is dimmed.
- Implemented via swizzle of Docusaurus `ColorModeToggle` component.
- Persists preference in `localStorage`.

---

## 5. Document Index (`_index.json`)

The index is a JSON file at the root of the repository, automatically maintained by the backend.

### Structure

```json
[
  {
    "path": "docs/models/gpt4.md",
    "title": "GPT-4 Comparison",
    "summary": "Comparative analysis of GPT-4 vs open-source models on reasoning tasks, cost, and inference speed.",
    "updated": "2026-05-01"
  }
]
```

### Lifecycle

- On backend startup, `_index.json` is loaded into memory.
- When the backend commits a file, it updates the corresponding entry in the index (or creates it if new).
- The index update is included in the **same commit** as the modified file.
- Summary and commit message are generated together in a single LLM call (see section 8.1).

---

## 6. AI Features

### 6.1 Search (navbar — single-turn)

**Goal:** answer a single question about the documentation using tool-use, without embeddings or semantic search. Single-turn only — no conversation history is maintained.

**Flow:**

1. User types a query and clicks "Search with AI".
2. The search input is disabled. SSE status events appear below the search bar.
3. The backend sends a single LLM call with:
   - System prompt including the full `_index.json`.
   - Available tool: `get_file(path: str) → str`.
4. The model calls `get_file` for relevant files (max 5 calls per query).
5. The backend resolves each tool call by reading the file from disk.
6. The model generates its response, streamed token by token via SSE.
7. The response renders as a growing Markdown block below the search bar (max height → scroll).
8. Once complete, the search input is re-enabled. The user can issue a new independent query.

**Context budget:**
No file content is truncated. Instead, before each LLM call the backend estimates the total token count (index + all file contents requested so far). If it exceeds a configurable threshold (default: `MAX_CONTEXT_TOKENS`, suggested 150,000), the model is instructed in the prompt to stop requesting additional files and answer with what it has. This prevents silent data loss while respecting model limits.

**SSE event types for `POST /chat`:**

```
event: reading_file
data: { "path": "docs/models/gpt4.md" }

event: token
data: { "text": "Based on the documentation..." }

event: done
data: {}

event: error
data: { "message": "..." }
```

**Endpoint:** `POST /chat`
```json
{
  "query": "What benchmarks does the project use for evaluation?"
}
```

---

### 6.2 Edit Assistant (floating FAB)

**Goal:** assist the user in editing the document currently on screen. AI proposes changes; the user reviews and commits.

**FAB appearance:**

- Floating action button in the bottom-right corner on all pages.
- Icon: combined pencil + spark (e.g. a pencil with a small spark/star on its tip). Both elements convey editing and AI assistance.
- While an AI edit request is in progress: the icon is replaced by a spinner.
- While the modal is minimized with unsaved changes or active state: the FAB remains visible with the pencil+spark icon (or spinner if a request is running), indicating there is pending work.

**Edit Modal:**

- Opens as a near-fullscreen overlay.
- Split-pane layout (horizontal):
  - **Left panel — Editor:** editable `<textarea>` with the raw MD of the current document. User can edit manually or via the AI chat input at the bottom of this panel.
  - **Right panel — Preview:** real-time Markdown render of the left panel content.
- Panel widths adjustable via drag-and-drop divider.
- Raw MD is fetched via `GET /file?path=...` **only on first open**. Subsequent minimizations and re-openings reuse the already-loaded content.

**AI edit chat (bottom of left panel):**

- Single text input + send button.
- User describes the desired change.
- Backend sends full document MD + instruction to the model.
- Model returns the complete modified MD.
- Textarea is replaced with the new content. User can continue editing manually.
- **During loading:** input is disabled. SSE `status` events appear as chat-style messages in the panel every ~5 seconds with varied text (e.g. "Reading document…", "Generating changes…", "Almost there…").

**SSE event types for `POST /edit`:**

```
event: status
data: { "message": "Reading document…" }

event: status
data: { "message": "Generating changes…" }

event: done
data: { "content": "# Full modified markdown..." }

event: error
data: { "message": "..." }
```

**Commit flow:**

1. User clicks "Commit".
2. A compact inline form appears: branch name input (default: `master`).
3. User confirms → request is sent immediately. No further review.
4. Backend streams SSE commit events while it: generates summary + commit message (single LLM call), updates `_index.json`, and commits both files to the Git provider.
5. On completion, the modal shows a success notice with a link to the commit.

**SSE event types for `POST /commit`:**

```
event: status
data: { "message": "Updating index…" }

event: status
data: { "message": "Preparing commit to branch: master" }

event: done
data: { "commit_url": "https://gitlab.example.com/..." }

event: error
data: { "message": "..." }
```

**Endpoint:** `POST /edit`
```json
{
  "path": "docs/models/gpt4.md",
  "content": "...",
  "instruction": "Reorganize sections by importance"
}
```

**Endpoint:** `POST /commit`
```json
{
  "path": "docs/models/gpt4.md",
  "content": "...",
  "branch": "master"
}
```

---

### 6.3 Modal State and Navigation Guard

**Minimization:**

- The modal can be freely closed/minimized at any time — even with an active AI request or unsaved edits.
- Minimizing does not cancel any in-flight request.
- The FAB remains visible with its current state icon (pencil+spark or spinner).
- Clicking the FAB re-opens the modal, restoring all state exactly as left.

**Navigation guard (page changes only):**

- If the user attempts to navigate to a different page (including browser back button) while the modal has:
  - **An active AI request:** show confirmation — *"An AI request is in progress. If you leave, it will be cancelled. Are you sure?"* If confirmed, cancel the SSE stream and allow navigation. Modal state is discarded.
  - **Unsaved edits** (textarea differs from originally loaded MD, no active request): show confirmation — *"You have unsaved changes. If you leave, they will be lost. Are you sure?"* If confirmed, discard and allow navigation.
  - **Neither condition:** allow navigation silently.
- Closing the modal (✕ or minimizing) does **not** trigger the guard — only actual page navigation does.

---

## 7. Git Provider Abstraction

The backend implements a `GitProvider` abstract interface, allowing the application to work with GitLab or GitHub without changes to the rest of the codebase.

### Interface (`services/git.py`)

```python
class GitProvider(ABC):
    def get_file(self, path: str) -> str: ...
    def commit_files(self, files: list[dict], branch: str, message: str) -> str: ...
    # returns commit URL
```

### Implementations

- `GitLabProvider` — uses GitLab API v4 (`/projects/:id/repository/files`)
- `GitHubProvider` — uses GitHub REST API (`/repos/:owner/:repo/contents/:path`)

### Configuration

The active provider is selected via the `GIT_PROVIDER` env var. All provider-specific config uses a shared prefix for discoverability.

| Variable | Description |
|---|---|
| `GIT_PROVIDER` | `gitlab` or `github` |
| `GIT_REPO_URL` | Full URL of the repo (used for navbar link) |
| `GIT_TOKEN` | Personal access token for the chosen provider |
| `GIT_DEFAULT_BRANCH` | Default branch name (default: `master`) |
| `GITLAB_URL` | Base URL of self-hosted GitLab (GitLab only) |
| `GITLAB_PROJECT_ID` | Numeric project ID (GitLab only) |
| `GITHUB_OWNER` | Repository owner/org (GitHub only) |
| `GITHUB_REPO` | Repository name (GitHub only) |

---

## 8. Backend Endpoints Summary

| Method | Path | Description |
|---|---|---|
| `GET` | `/file` | Returns raw MD of a single file. Query param: `path`. Called once per modal open. |
| `POST` | `/chat` | Single-turn AI search with tool-use. Streams SSE: `reading_file`, `token`, `done`, `error`. |
| `POST` | `/edit` | AI-assisted editing. Streams SSE: `status`, `done`, `error`. |
| `POST` | `/commit` | Commit to Git provider + update index. Streams SSE: `status`, `done`, `error`. |

---

## 9. System Prompts

### 9.1 Summary + Commit Message (single LLM call, on commit)

```
You are a technical assistant specialized in AI research documentation.
Read the following Markdown document and return a JSON object with two fields:
- "summary": a single sentence (max 30 words) describing the content, key concepts,
  and purpose of the document. It must be useful for another AI model to decide
  whether to read this file when answering a question.
- "commit_message": a concise conventional commit message (max 72 characters)
  describing the changes made to this file
  (e.g. "docs: update benchmarks section in GPT-4 comparison").

Respond ONLY with the raw JSON object. No explanations, no markdown fences.

FILE PATH: {path}
DOCUMENT CONTENT:
{content}
```

### 9.2 Search (system prompt)

```
You are an expert assistant on the AI research project documented in this wiki.
You have access to an index of all available documents.
To answer the user's question, request relevant files using the get_file tool.
Reason first about which files you need before requesting them.
Do not invent information not present in the documents.
When you have sufficient context, respond clearly and in a structured way.
If the information is not available in the documentation, say so explicitly.

{context_budget_warning}

DOCUMENT INDEX:
{index_json}
```

`context_budget_warning` is injected by the backend when the estimated token count is approaching the model's limit:
```
IMPORTANT: The context is nearly full. Do not request any more files. Answer with the information already retrieved.
```

### 9.3 Edit Assistant (system prompt)

```
You are a technical writing assistant specialized in AI research documentation.
The user will provide a Markdown document and an editing instruction.
Return the complete modified document according to the instruction,
preserving Markdown formatting.
Do not add any explanation before or after the document.
Respond only with the Markdown content of the modified document.
```

---

## 10. Environment Variables

| Variable | Description | Example |
|---|---|---|
| `GIT_PROVIDER` | Git provider to use | `gitlab` / `github` |
| `GIT_REPO_URL` | Full repo URL for navbar link | `https://gitlab.example.com/group/repo` |
| `GIT_TOKEN` | Personal access token | `glpat-xxxx` / `ghp_xxxx` |
| `GIT_DEFAULT_BRANCH` | Default commit branch | `master` |
| `GITLAB_URL` | GitLab base URL (GitLab only) | `https://gitlab.example.com` |
| `GITLAB_PROJECT_ID` | Numeric project ID (GitLab only) | `42` |
| `GITHUB_OWNER` | Repo owner or org (GitHub only) | `my-org` |
| `GITHUB_REPO` | Repo name (GitHub only) | `ai-research` |
| `AI_BASE_URL` | OpenAI-compatible endpoint base URL | `https://my-model.example.com/v1` |
| `AI_API_KEY` | API key for the model | `sk-xxxx` |
| `AI_MODEL` | Model name | `gpt-4o` |
| `DOCS_LOCAL_PATH` | Local clone path inside container | `/app/docs-repo` |
| `MAX_CONTEXT_TOKENS` | Context budget threshold (tokens) | `150000` |

---

## 11. Docker Compose

```yaml
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file: .env
    volumes:
      - docs-repo:/app/docs-repo

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - BACKEND_URL=http://backend:8000
    depends_on:
      - backend

volumes:
  docs-repo:
```

The backend clones the repository on startup if the volume is empty, and pulls with a 60-second in-memory cache on requests that need fresh content.

---

## 12. Project Directory Structure

```
/
├── backend/
│   ├── Dockerfile
│   ├── main.py
│   ├── routers/
│   │   ├── chat.py              # POST /chat (SSE, single-turn)
│   │   ├── edit.py              # POST /edit (SSE)
│   │   ├── commit.py            # POST /commit (SSE)
│   │   └── files.py             # GET /file
│   ├── services/
│   │   ├── git.py               # GitProvider ABC + GitLabProvider + GitHubProvider
│   │   ├── ai.py                # LLM calls + context budget logic
│   │   └── index.py             # _index.json in-memory management
│   └── requirements.txt
│
├── frontend/
│   ├── Dockerfile
│   ├── docusaurus.config.js
│   ├── src/
│   │   ├── components/
│   │   │   ├── AiSearchBar.jsx          # Search input + AI button + inline MD result
│   │   │   ├── EditFab.jsx              # FAB with pencil+spark / spinner states
│   │   │   ├── EditModal.jsx            # Near-fullscreen split-pane modal
│   │   │   ├── MarkdownPreview.jsx      # Real-time MD renderer (preview panel)
│   │   │   ├── CommitForm.jsx           # Branch input + confirm button
│   │   │   └── NavigationGuard.jsx      # Page-change guard (active request / unsaved edits)
│   │   └── theme/
│   │       └── Navbar/
│   │           └── index.jsx            # Swizzled navbar with custom components
│   └── package.json
│
├── docker-compose.yml
├── .env.example
└── SPEC.md
```

---

## 13. Design Decisions and Constraints

- **No own database.** The Git provider is the single source of truth. `_index.json` is the only persisted state outside the MD files.
- **No embeddings or semantic search.** The model reasons over the index and requests files by path.
- **No file truncation.** Files are always sent complete. Context is managed via a token budget warning injected into the system prompt when approaching the model's limit (configurable via `MAX_CONTEXT_TOKENS`).
- **Search is single-turn.** No conversation history is maintained between queries. Each "Search with AI" click is a fresh, independent call.
- **AI response renders inline below the search bar.** No modal, no separate page — the result expands as a Markdown block, streams word by word, and scrolls when it exceeds max height.
- **Modal minimization preserves full state.** Closing the modal does not discard work. Only page navigation triggers the guard and can discard state (with confirmation).
- **`GET /file` is called only once per modal session.** Subsequent minimize/restore cycles reuse the cached content.
- **Single LLM call for summary + commit message.** Returns JSON with both fields. No user review of commit message — branch selection is the only user input before committing.
- **Git provider is abstracted.** GitLab and GitHub are supported via a shared interface. Adding a new provider requires only a new implementation class and env var values.
- **All AI endpoints stream via SSE.**
- **Docusaurus runs in development mode** inside the container (dynamic content, no static build).

---

## 14. Future Work (out of scope for v1)

- Multi-turn search conversations.
- SSO authentication (SAML / OAuth).
- Persistent conversation history per user.
- Change notifications via Git webhooks.
- Multi-repository support.
- WYSIWYG MD editor (instead of raw textarea).
- Diff view before committing.
- Gitea / Bitbucket provider implementations.
