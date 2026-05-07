---
name: testing-practices
description: "Use when writing, generating, or reviewing tests for Copisaurus. Covers pytest for the Python/FastAPI backend and Vitest + React Testing Library for the React frontend. Includes fixture patterns, mocking strategies, and file placement conventions."
---

# Testing Practices — Copisaurus

## Stack by Layer

| Layer | Framework | Test file pattern |
|---|---|---|
| Python backend | pytest | `backend/tests/test_<module>.py` |
| React frontend | Vitest + React Testing Library | `frontend/src/**/*.test.tsx` or `__tests__/` |

---

## Python Backend — pytest

### File Layout

```
backend/
└── tests/
    ├── conftest.py          # Shared fixtures
    ├── test_chat.py         # Tests for chat router + ai service
    ├── test_edit.py         # Tests for edit router + ai service
    ├── test_commit.py       # Tests for commit router + git/index services
    ├── test_files.py        # Tests for files router
    ├── test_git.py          # Tests for GitProvider implementations
    ├── test_ai.py           # Tests for LLM calls + context budget
    └── test_index.py        # Tests for _index.json management
```

Mirror the `backend/` structure: one `test_<module>.py` per router or service file.

### Git Provider Fixture

All data access goes through the `GitProvider` abstraction. Mock it consistently with `AsyncMock` for async methods. Inject the mock via `monkeypatch.setattr()` in tests. Always use `TestClient(app)` with context manager so lifespan events fire.

### Mocking LLM HTTP Calls

**Always patch at the service boundary** (`call_llm` in `services/ai.py`), not at the HTTP client level. This ensures env var initialization happens. To test error handling, raise an exception from the `call_llm` mock.

### Mocking Git Provider Methods

Patch `GitProvider.get_file` and `commit_files` methods to return expected values and assert they were called with correct arguments.

### SSE Stream Testing

Test that SSE endpoints return events in proper format (`event:` line, `data:` line with JSON). Extract event types and data, then verify expected events were emitted.

### Parametrize for Edge Cases

Use `@pytest.mark.parametrize` to test the same behavior across multiple valid inputs (different branches, file paths, etc.).

### What to Test per Module

| Module | What to cover |
|---|---|
| `routers/chat.py` | POST /chat streams events; SSE error event on LLM failure |
| `routers/edit.py` | POST /edit streams events; instruction applied to content |
| `routers/commit.py` | POST /commit calls provider; updates _index.json; returns commit URL |
| `routers/files.py` | GET /file returns raw content; 404 when not found |
| `services/git.py` | GitLabProvider and GitHubProvider implement interface; env vars loaded |
| `services/ai.py` | `call_llm` makes correct API call; context budget respected |
| `services/index.py` | Index loaded from Git; updated on commit; handles missing index |

### Assertions

- Assert status codes explicitly: `assert res.status_code == 200`.
- For streaming: assert SSE event format (`event:`, `data:` fields).
- Assert Git provider methods are called with correct args.
- Assert environment variables are read correctly (or raise on missing).
- Assert system prompts contain context budget warnings when appropriate.

---

## React Frontend — Vitest + React Testing Library

### Setup

```ts
// vite.config.ts — add test config
test: {
  environment: "jsdom",
  setupFiles: "./src/test/setup.ts",
}
```

```ts
// src/test/setup.ts
import "@testing-library/jest-dom";
```

### File Layout

Co-locate test files next to the component:

```
frontend/src/
└── components/
    ├── AiSearchBar.tsx
    ├── AiSearchBar.module.css
    └── AiSearchBar.test.tsx
```

### Mocking `fetch` and SSE Streams

Never call the real backend. For SSE endpoints, mock `fetch` to return a `ReadableStream` with fake SSE events.

### Test Behavior, Not Implementation

Test what the user **sees and does**, not internal state or function calls. Query by accessible roles (`getByRole`, `getByLabelText`), not test IDs or class names.

### What to Test per Component

| Component | What to cover |
|---|---|
| `AiSearchBar` | Typing and clicking "Search with AI" triggers fetch; streaming response renders |
| `EditModal` | Opens when FAB clicked; textarea editable; live preview updates; Save triggers POST |
| `EditFab` | Shows pencil icon normally; spinner while loading; toggles modal |
| `MarkdownPreview` | Renders Markdown correctly; updates on textarea change |
| `CommitForm` | Branch input has default value; clicking Commit triggers POST |
| `NavigationGuard` | Prompts on unsaved edits; prompts on active request; allows navigation when safe |
| `api/client.ts` | `fetchFile` calls correct URL; stream consumers parse events correctly |

### Testing SSE Stream Consumption

For components that consume SSE streams, test that events are parsed correctly and the UI updates appropriately. Mock `fetch` to return test events, then verify the component renders the expected output.

### Avoid

- Testing styles or CSS Module class names
- Asserting on component internal state
- `act()` warnings — use `waitFor` + `findBy*` for async updates
- Snapshot tests for complex components (brittle, low value)
- Mocking Docosaurus core components unnecessarily
