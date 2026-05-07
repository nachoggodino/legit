---
name: test-execution
description: "Skill that documents and automates safe, reproducible test execution for backend and frontend. Handles venv setup, dependency installation, and canonical test commands."
---

# Test Execution Skill — Copisaurus

This skill provides explicit, canonical commands and safe patterns to run backend and frontend tests for the repository. It is intended to be called by review agents and CI runners.

## Principles

- Always prefer the repository's canonical wrapper scripts (npm scripts) when present.
- Do not call external services (LLM, Git API, network) from tests — mocks should be used.
- Use isolated environments: Python virtualenv for backend, `node_modules` via `npm ci` for frontend.
- Prefer running a single test file during iterative reviews to reduce runtime.

## Backend (Python / pytest)

1. Ensure Python is available (3.11+ recommended).

2. Create or reuse a virtualenv in the repo root, then activate it. Automation MUST ensure the venv is active before running tests. Examples (platform-agnostic guidance):

- Create the venv if missing:

```bash
python -m venv .venv
```

- Activate the venv (shell-specific). Agents must perform one of:

	- Source the activation script for the current shell (e.g. `source .venv/bin/activate` on sh/bash), or
	- Use the venv Python binary directly (e.g. `.venv/bin/python -m pytest ...`) if activation is not possible.

- After activation, install dependencies:

```bash
pip install -r backend/requirements.txt
```

3. Preferred: run the npm wrapper if it exists:

```bash
npm run test:backend
```

4. To run a single pytest file directly:

```bash
python -m pytest backend/tests/test_chat.py -q
```

## Frontend (Vitest / Docosaurus)

1. Install node dependencies (use ci for reproducible installs):

```bash
npm ci
```

2. Run all frontend tests:

```bash
npm run test:frontend
```

3. Run a single test file:

```bash
npx vitest run frontend/src/components/AiSearchBar/AiSearchBar.test.tsx
```

## Automation guidance for review agents

- Agents MUST ensure the venv is activated before running Python tests. If activation is not possible in the agent runtime, the agent MUST use the venv Python binary explicitly (e.g. `.venv/bin/python -m pytest ...`).
- Check for `package.json` scripts: prefer `test:backend` / `test:frontend` if present and run them from the activated environment.
- If `npm` is missing or scripts absent, fall back to the explicit Python/pytest or `npx vitest` commands executed within the activated venv environment.
- For safety, tests should be run read-only where possible and avoid writing production files; use environment mocks as described in `testing-practices`.

## Example: run backend single file (generic)

Create venv (if missing), activate it in your shell, install deps and run a single pytest file. Agents should prefer activation but may call the venv Python directly:

```bash
python -m venv .venv
# Shell-specific activation, or use venv python directly
source .venv/bin/activate     # or .venv\Scripts\Activate.ps1 on Windows PowerShell
pip install -r backend/requirements.txt
python -m pytest backend/tests/test_chat.py -q
# OR, if activation isn't possible:
.venv/bin/python -m pytest backend/tests/test_chat.py -q
```
