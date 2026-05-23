---
name: nextjs-migration
description: Use when implementing or reviewing the Copisaurus Next.js App Router migration.
---

# Copisaurus Next.js Migration

## Architecture

- Work in `web/` for the production app.
- Treat `backend/` and `frontend/` as legacy references until cutover.
- Keep route handlers thin and move behavior into focused server modules.
- Put Git sync, write, and provider API logic in `web/src/server/git`.
- Put commit workflow orchestration in `web/src/server/git` or `web/src/server/commit`.
- Put admin behavior in `web/src/server/admin`.
- Put audit behavior in `web/src/server/audit`.
- Put config editing in `web/src/server/config`.
- Keep Drizzle access behind `web/src/server/db` or focused server modules.

## Security

- Admin APIs require `admin`.
- Write APIs require `editor` or `admin`.
- Preserve public and private repository read rules.
- Use service or bot Git credentials only.
- Never expose Git, AI, OAuth, or session secrets in client responses, logs, examples, audits, commit messages, or PR/MR descriptions.
- Validate Markdown operation paths under each repository `docsPath`.
- Use Git and search argument arrays. Do not shell-concatenate user or config input.

## Testing

- Run commands from `web/`.
- Use Vitest, React Testing Library, and Playwright.
- Mock GitHub, GitLab, OAuth, and AI providers.
- Do not call real external providers from tests.
