# Legit Agent Instructions

## Target Architecture

Work at the repository root for the production app. It is a Next.js App Router application with TypeScript, Auth.js, SQLite/Drizzle, server modules, and Git-backed Markdown repositories.

## Boundaries

- Keep route handlers thin.
- Put Git sync/write/provider API logic in `src/server/git`.
- Put commit workflow orchestration in `src/server/git` or `src/server/commit`.
- Put admin logic in `src/server/admin` or focused server modules.
- Put audit logic in `src/server/audit`.
- Put config file editing in `src/server/config`.
- Keep Drizzle queries behind server/db or focused server modules.

## Security

- Admin APIs require `admin`.
- Write APIs require `editor` or `admin`.
- Public/private repo read rules must remain intact.
- Use service/bot Git credentials only.
- Never expose or store Git, AI, OAuth, or session secrets in client responses, logs, examples, audits, commit messages, or PR/MR descriptions.
- Validate all Markdown operation paths under repo `docsPath`.
- Use argument arrays for Git and search commands; never shell-concatenate user/config input.

## Testing

Use Vitest, React Testing Library, and Playwright from the repository root. Mock GitHub, GitLab, OAuth, and AI providers. Do not call real external providers from tests.
