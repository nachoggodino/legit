---
name: testing-practices
description: Use when writing, generating, or reviewing tests for Copisaurus.
---

# Testing Practices

## Next.js App

- Place tests under `web/tests/` and run from `web/`.
- Use Vitest for server modules and API behavior.
- Use React Testing Library for client components.
- Use Playwright for end-to-end browser coverage.
- Query UI by accessible roles, labels, and visible text.
- Avoid assertions on CSS class names or internal component state.

## Mocking

- Mock GitHub, GitLab, OAuth, and AI providers.
- Mock `fetch` with `vi.spyOn`, `vi.stubGlobal`, or a local fake.
- Test stream consumers with deterministic in-memory streams.
- Do not call real external services from tests.

## Coverage Priorities

- Auth and role gates.
- Public/private repository read behavior.
- Markdown path validation.
- Git commit modes and rollback behavior.
- Config editing validation.
- Admin actions and audit metadata redaction.
