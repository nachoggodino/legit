---
description: "Generate a complete unit test suite for Copisaurus. Auto-detects Python (pytest) or TypeScript/React (Vitest + RTL) from the file extension. Covers happy path, edge cases, and error scenarios."
agent: "Unit Test Reviewer"
argument-hint: "Path to the source file to generate tests for (e.g. backend/routers/chat.py or frontend/src/components/AiSearchBar.jsx)"
---

Generate a complete unit test suite for the following file: **{{input}}**

## Instructions

1. Read the source file at `{{input}}` in full.

2. Detect the stack from the file extension:
   - `.py` → use **pytest** following [testing-practices](./../skills/testing-practices/SKILL.md) Python section
   - `.ts` / `.tsx` / `.jsx` → use **Vitest + React Testing Library** following [testing-practices](./../skills/testing-practices/SKILL.md) React section

3. Load [testing-practices](./../skills/testing-practices/SKILL.md) in full before writing any test code.

4. Generate tests covering:
   - **Happy path**: normal inputs, expected outputs
   - **Edge cases**: empty queries, missing files, special characters in paths
   - **Error scenarios**: 404s, failed fetch, LLM API errors, Git provider failures, SSE stream errors

5. Place the output file at the correct location:
   - Python: `backend/tests/test_<module>.py` (mirroring `backend/` structure)
   - React/TS: co-located `<ComponentName>.test.tsx` next to the source file

6. For Python tests (no database):
   - Mock the `GitProvider` with `AsyncMock` in the `mock_git_provider` fixture
   - Mock all `call_llm` calls with `unittest.mock.patch`
   - Test SSE event streams properly with event type and data validation
   - Use `@pytest.mark.parametrize` for inputs with multiple valid branches/paths

7. For React/TS tests:
   - Mock `fetch` with `vi.stubGlobal` or `vi.fn()`
   - For SSE tests, use the `buildSseStream` helper to create mock streams
   - Query by accessible roles and labels (`getByRole`, `getByLabelText`)
   - Use `userEvent` for interactions, `waitFor` / `findBy*` for async updates
   - Never assert on CSS class names or internal state

8. Create the test file with all generated tests.
