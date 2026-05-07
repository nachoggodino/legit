---
description: "Run a full Python/FastAPI code review on all staged backend files. Applies python-fastapi-practices guidelines, runs related pytest tests, and reports issues with severity. Use before committing backend changes."
agent: Python Reviewer
argument-hint: "Optional: specific backend file or folder to focus on (e.g. backend/routers/chat.py)"
---

Review all staged backend Python files for Copisaurus.

{{#if input}}
Focus the review on: {{input}}
{{/if}}

Apply all [python-fastapi-practices](./../skills/python-fastapi-practices/SKILL.md) guidelines. For running tests, require the `test-execution` skill: it MUST ensure a virtualenv is present and activated (or use the venv Python binary) before executing tests, and it exposes the repository's canonical commands (e.g. `npm run test:backend`). Use it to run related tests and produce a structured report with:

1. The list of files reviewed
2. All issues found, grouped by file and category (type hints, Git provider usage, Pydantic models, SSE streaming, context budget, HTTP errors, async correctness, no-database enforcement)
3. Full pytest output for related test files
4. A summary with overall pass/fail verdict
