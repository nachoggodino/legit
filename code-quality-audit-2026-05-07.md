# Code Quality Audit Report

**Date**: 2026-05-07  
**Scope**: Backend (Python/FastAPI) — no frontend directory exists yet  
**Total Issues**: 20

---

## 1. Duplicated Logic (5 findings)

### Issue 1.1: `sse_event()` Defined in Every Router
- **Severity**: High
- **Found in**:
  - `backend/routers/chat.py` (lines 54–56)
  - `backend/routers/edit.py` (lines 32–34)
  - `backend/routers/commit.py` (lines 28–30)
- **Current**: All three files define an identical function:
  ```python
  def sse_event(event: str, data: dict[str, Any]) -> str:
      """Format a single SSE frame."""
      return f"event: {event}\ndata: {json.dumps(data)}\n\n"
  ```
  Only `chat.py` includes the docstring; the other two omit it.
- **Refactor to**: Extract to `routers/utils.py` (or `services/sse.py`) and import from all three routers.
- **Effort**: Low

---

### Issue 1.2: `parse_sse_events()` Defined in Three Test Files
- **Severity**: High
- **Found in**:
  - `backend/tests/test_chat.py` (lines 65–77)
  - `backend/tests/test_edit.py` (lines 17–27)
  - `backend/tests/test_commit.py` (lines 17–27)
- **Current**: The `test_edit.py` and `test_commit.py` versions are character-for-character identical. `test_chat.py` differs only in whitespace inside the slice.
- **Refactor to**: Move to `conftest.py` as a plain module-level function (not a fixture). All three files already import from `conftest`.
- **Effort**: Low

---

### Issue 1.3: `url` + `headers` Construction Duplicated in `ai.py`
- **Severity**: Medium
- **Found in**:
  - `backend/services/ai.py` lines 21–26 (`call_llm_full`)
  - `backend/services/ai.py` lines 39–45 (`call_llm_stream`)
- **Current**: Both functions independently build:
  ```python
  url = f"{os.environ['AI_BASE_URL'].rstrip('/')}/chat/completions"
  headers = {
      "Authorization": f"Bearer {os.environ['AI_API_KEY']}",
      "Content-Type": "application/json",
  }
  ```
- **Refactor to**: Extract two private helpers — `_get_completions_url() -> str` and `_build_headers() -> dict[str, str]` — called by both functions.
- **Effort**: Low

---

### Issue 1.4: Context Budget Exceeded Check Duplicated in Two Routers
- **Severity**: Low
- **Found in**:
  - `backend/routers/edit.py` (lines 43–47)
  - `backend/routers/commit.py` (lines 40–44)
- **Current**: Both routers contain the same guard:
  ```python
  if estimated_tokens > max_tokens:
      yield sse_event("error", {"message": f"Document exceeds context limit ({estimated_tokens} > {max_tokens} tokens)"})
      return
  ```
- **Refactor to**: Move to `services/ai.py` as a helper `check_context_budget(text: str) -> str | None` returning an error message or `None`. Callers handle the `yield`.
- **Effort**: Low

---

### Issue 1.5: `_set_env()` Helper Defined Twice in `test_ai.py`
- **Severity**: Low
- **Found in**:
  - `backend/tests/test_ai.py` lines 60–62 (`TestCallLlmFull._set_env`)
  - `backend/tests/test_ai.py` lines 153–155 (`TestCallLlmStream._set_env`)
- **Current**: Both test classes define an identical instance method that sets environment variables from `BASE_ENV`.
- **Refactor to**: Replace both with a module-level `pytest.fixture` (e.g., `ai_env`) in `test_ai.py` or promote to `conftest.py`.
- **Effort**: Low

---

## 2. Boilerplate & Unnecessary Code (4 findings)

### Issue 2.1: `get_file()` Duplicated in Both Git Providers
- **Severity**: High
- **Found in**:
  - `backend/services/git.py` lines 49–51 (`GitLabProvider.get_file`)
  - `backend/services/git.py` lines 112–114 (`GitHubProvider.get_file`)
- **Problem**: Both implementations are byte-for-byte identical:
  ```python
  async def get_file(self, path: str) -> str:
      full_path = self._docs_path / path
      return await asyncio.to_thread(full_path.read_text, encoding="utf-8")
  ```
  There is no provider-specific behaviour — both read the local clone. The abstract declaration in the base class forces each subclass to re-implement it pointlessly.
- **Recommendation**: Move `get_file` to `GitProvider` as a concrete method (not abstract). Since `_docs_path` would also move to the base `__init__` (see Issue 2.2), no subclass override is needed.
- **Effort**: Low

---

### Issue 2.2: `self._docs_path` Set Identically in Both Subclass `__init__`
- **Severity**: Medium
- **Found in**:
  - `backend/services/git.py` line 46 (`GitLabProvider.__init__`)
  - `backend/services/git.py` line 97 (`GitHubProvider.__init__`)
- **Problem**: Both set `self._docs_path = Path(os.environ["DOCS_LOCAL_PATH"])`. The base class `GitProvider` already has a `_write_files_locally` method that reads `DOCS_LOCAL_PATH` from `os.environ` *again* at call time instead of using the cached attribute — an inconsistency created by the duplication.
- **Recommendation**: Add `__init__` to `GitProvider` that sets `self._docs_path`, and update `_write_files_locally` to use `self._docs_path`. Subclasses call `super().__init__()`.
- **Effort**: Low

---

### Issue 2.3: `make_edit_llm_response()` Is a Pointless Alias in `test_edit.py`
- **Severity**: Low
- **Located in**: `backend/tests/test_edit.py` (lines 36–37)
- **Problem**:
  ```python
  def make_edit_llm_response(modified_content: str) -> dict[str, Any]:
      return make_llm_response(modified_content)
  ```
  This function wraps `make_llm_response` with no additional logic. Every call site could use `make_llm_response` directly.
- **Recommendation**: Delete `make_edit_llm_response` and replace all usages with the already-imported `make_llm_response`.
- **Effort**: Low

---

### Issue 2.4: `BASE_ENV` Imported but Never Directly Used in Three Test Files
- **Severity**: Low
- **Located in**:
  - `backend/tests/test_chat.py` line 10 — `BASE_ENV` imported, only `gitlab_env` fixture used in tests
  - `backend/tests/test_edit.py` line 9 — `BASE_ENV` imported alongside `make_llm_response`, but `BASE_ENV` never referenced
  - `backend/tests/test_commit.py` line 9 — same as `test_edit.py`
- **Problem**: Unused imports inflate apparent dependencies and mislead readers into thinking `BASE_ENV` is used directly.
- **Recommendation**: Remove `BASE_ENV` from the import lines in all three files.
- **Effort**: Low

---

## 3. Verbose or Unhelpful Comments (3 findings)

### Issue 3.1: SPEC Section References Without Context
- **Located in**:
  - `backend/routers/chat.py` line 36 — `# System prompt matches SPEC 9.2`
  - `backend/routers/edit.py` line 14 — `# System prompt from SPEC 9.3`
  - `backend/routers/commit.py` line 16 — `# System prompt from SPEC 9.1`
- **Issue**: These comments are only meaningful to a reader who has `SPEC.md` open simultaneously. They don't say *what* SPEC 9.x requires or *why* the prompt is structured that way.
- **Action**: Either remove or rewrite to capture intent, e.g.: `# Instructs the LLM to return only raw JSON with "summary" and "commit_message" fields.`

---

### Issue 3.2: `# noqa: B023` Without Explanation in `chat.py`
- **Located in**: `backend/routers/chat.py` (line 88)
- **Current Comment**: `lambda: call_llm_full(messages, tools=[_GET_FILE_TOOL]),  # noqa: B023`
- **Issue**: B023 is "Function definition does not bind loop variable." The suppression is valid here, but a reader must look up the rule number to understand the intent.
- **Action**: Replace with: `# noqa: B023 — messages is not a loop variable; lambda closure is intentional`

---

### Issue 3.3: Docstring on `sse_event()` Present in One File, Absent in Two
- **Located in**:
  - `backend/routers/chat.py` line 55 — has `"""Format a single SSE frame."""`
  - `backend/routers/edit.py` line 32 — no docstring
  - `backend/routers/commit.py` line 28 — no docstring
- **Issue**: Inconsistency caused by copy-paste without transferring the docstring. Best resolved by fixing Issue 1.1 (single shared definition with docstring).
- **Action**: Consolidate `sse_event()` into one place (Issue 1.1); the inconsistency disappears automatically.

---

## 4. Code Smells & Style Issues (5 findings)

### Issue 4.1: Base Class `_write_files_locally` Reads `os.environ` Instead of Using `self._docs_path`
- **Severity**: Medium
- **Found in**: `backend/services/git.py` (lines 22–27)
- **Smell**: The concrete `_write_files_locally` method in `GitProvider` reads `os.environ["DOCS_LOCAL_PATH"]` on every invocation, while both subclasses cache the same value in `self._docs_path`. The base class shared method is inconsistent with its own subclasses.
- **Refactor to**: Move `_docs_path` initialization to `GitProvider.__init__` (see Issue 2.2) and update `_write_files_locally` to use `self._docs_path`.
- **Effort**: Low

---

### Issue 4.2: `_provider` Type Annotation Uses Unnecessary Forward Reference String
- **Severity**: Low
- **Found in**: `backend/services/git.py` (line 14)
- **Smell**: `_provider: "GitProvider | None" = None` — `GitProvider` is defined later in the same file. Python 3.11 handles forward references without string literals when the variable is moved below the class definition, or via `from __future__ import annotations`.
- **Refactor to**: Move `_provider` and `_last_pull_at` declarations below the class definitions, removing the need for a string annotation.
- **Effort**: Low

---

### Issue 4.3: `GIT_REPO_URL` Fetching + `rstrip("/")` Duplicated in Both Providers
- **Severity**: Low
- **Found in**:
  - `backend/services/git.py` lines 84–85 (`GitLabProvider.commit_files`)
  - `backend/services/git.py` lines 186–187 (`GitHubProvider.commit_files`)
- **Smell**: Both methods end with:
  ```python
  repo_url = os.environ["GIT_REPO_URL"].rstrip("/")
  return f"{repo_url}/..."
  ```
  Only the URL path suffix differs between providers.
- **Refactor to**: Add a `@property _repo_url(self) -> str` to `GitProvider` that reads and strips `GIT_REPO_URL`. Each provider uses `self._repo_url` in the return statement.
- **Effort**: Low

---

### Issue 4.4: `_STATUS_MESSAGES` in `edit.py` Are Semantically Misleading
- **Severity**: Low
- **Found in**: `backend/routers/edit.py` (lines 26–31)
- **Smell**: The messages `["Reading document…", "Generating changes…", "Almost done…", "Finalizing…"]` imply sequential stages, but they cycle via `i % len(_STATUS_MESSAGES)` in a `while not future.done()` loop. "Reading document…" fires *after* the document has already been received in the request body — no file I/O happens at that point.
- **Refactor to**: Use messages that accurately reflect the async wait, e.g., `["Generating…", "Still working…", "Almost done…"]`, or a single `"Generating changes…"`.
- **Effort**: Low

---

### Issue 4.5: Defensive `call_args` Payload Extraction Repeated Across Test Files
- **Severity**: Low
- **Found in**:
  - `backend/tests/test_ai.py` (lines 92–93 and multiple other assertion sites)
  - `backend/tests/test_git.py` (lines 112–113 and similar)
- **Smell**: Each assertion on a mocked `requests.post` payload uses:
  ```python
  payload = mock_post.call_args.kwargs.get("json") or mock_post.call_args[1]["json"]
  ```
  Since production code consistently uses `json=payload` as a keyword argument, `call_args.kwargs["json"]` always works. The fallback adds noise without adding protection.
- **Refactor to**: Use `mock_post.call_args.kwargs["json"]` consistently. A failure here would correctly signal a production code change.
- **Effort**: Low

---

## 5. Testing Patterns (3 findings)

### Issue 5.1: App Setup Block Repeated 49 Times Across Test Files
- **Severity**: High
- **Test files affected**:
  - `backend/tests/test_chat.py` (~28 occurrences)
  - `backend/tests/test_commit.py` (~15 occurrences)
  - `backend/tests/test_edit.py` (~10 occurrences)
  - `backend/tests/test_files.py` (5 occurrences)
- **Problem**: Every test method contains a large patch context manager block:
  ```python
  with (
      patch("main._clone_repo_if_needed"),
      patch("services.git.get_git_provider"),
      patch("services.index.load_index"),
      ...additional router-specific patches...
  ):
      app = create_app()
      with TestClient(app) as client:
          response = client.post(...)
  ```
  This is 4–6 lines of identical infrastructure per test method, repeated 49 times.
- **Suggestion**: Add an `app_client` fixture to `conftest.py` that applies the common patches and yields a ready `TestClient`. Router-specific patches are applied per-test:
  ```python
  @pytest.fixture()
  def app_client(gitlab_env):
      with (
          patch("main._clone_repo_if_needed"),
          patch("services.git.get_git_provider"),
          patch("services.index.load_index"),
      ):
          with TestClient(create_app()) as client:
              yield client
  ```
- **Effort**: Medium

---

### Issue 5.2: `_reset_index()` / `_reset_provider()` in `setup_method()` Instead of Autouse Fixtures
- **Severity**: Medium
- **Test files affected**:
  - `backend/tests/test_index.py` — `setup_method` calls `_reset_index()`
  - `backend/tests/test_git.py` — `setup_method` and `teardown_method` call `_reset_provider()`
- **Problem**: `teardown_method` is not guaranteed to run if test collection itself errors. `pytest` fixtures with `autouse=True` and `yield` guarantee cleanup even on test failure or collection error.
- **Suggestion**: Convert to autouse fixtures at class scope:
  ```python
  @pytest.fixture(autouse=True)
  def _reset(self):
      index_module._INDEX = []
      yield
      index_module._INDEX = []
  ```
- **Effort**: Low

---

### Issue 5.3: Direct Mutation of `index_module._INDEX` Couples Tests to Implementation
- **Severity**: Low
- **Test files affected**:
  - `backend/tests/test_index.py` — multiple `index_module._INDEX = [...]` assignments
  - `backend/tests/test_commit.py` line 253 — `index_module._INDEX = []` before assertion
- **Problem**: Directly assigning to `index_module._INDEX` treats a private implementation detail as a test interface. If the storage mechanism changes, direct assignments silently produce wrong results rather than failing clearly.
- **Suggestion**: In `test_commit.py`, prefer setting up state via `load_index()` with a temporary `_index.json` written to `tmp_path`. Direct access in `test_index.py` is acceptable since the module internals are the explicit subject under test.
- **Effort**: Medium

---

## Summary & Recommendations

### Quick Wins (Low effort, High impact)
1. **Extract `sse_event()`** to a shared utility — eliminates 3 identical definitions (Issue 1.1)
2. **Move `parse_sse_events()` to `conftest.py`** — eliminates 3 identical test helpers (Issue 1.2)
3. **Remove unused `BASE_ENV` imports** in `test_chat.py`, `test_edit.py`, `test_commit.py` (Issue 2.4)
4. **Delete `make_edit_llm_response()`** and use `make_llm_response` directly (Issue 2.3)
5. **Merge `get_file()` and `_docs_path` into `GitProvider` base class** — removes ~16 lines of duplicated code (Issues 2.1, 2.2, 4.1)

### Medium Priority
6. **Add a shared `app_client` fixture in `conftest.py`** — removes ~200 lines of boilerplate across 49 test methods (Issue 5.1)
7. **Extract `_get_completions_url()` and `_build_headers()` in `ai.py`** (Issue 1.3)
8. **Convert `setup_method` teardown to autouse fixtures** in `test_index.py` and `test_git.py` (Issue 5.2)

### Refactoring Candidates
9. **`GitProvider` base class** needs a concrete `__init__`, a `_repo_url` property, and a concrete `get_file` — the abstract contract currently overstates provider variance (Issues 2.1, 2.2, 4.1, 4.3)
10. **`_STATUS_MESSAGES` in `edit.py`** should reflect actual async-wait semantics (Issue 4.4)

### Overall Code Health
The backend is well-structured with clean separation of concerns across routers, services, and models. Test coverage is thorough and edge cases are well-covered. The main health risks are **test maintainability** (the 49-repetition app setup block will grow increasingly costly as new endpoints are added) and **cross-router copy-paste** (`sse_event`, `parse_sse_events`) that should have been shared from the start. No architectural redesign is needed — the quick wins listed above can be applied incrementally without any risk of behaviour change.

---

**Next Steps**:
1. Address quick wins 1–5 (estimated 1–2 hours total, zero risk of behaviour change)
2. Add the shared `app_client` fixture (estimated 2 hours; reduces test file sizes by ~30%)
3. Refactor `GitProvider` base class to consolidate shared logic (estimated 1 hour)
