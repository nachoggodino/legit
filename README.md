# Copisaurus

Copisaurus is a self-hosted, Git-backed documentation platform for Markdown repositories with authenticated reading, editor/admin workflows, audit logging, and optional OpenAI-compatible AI assistance.

The production target is the `web/` Next.js application. The older `backend/` FastAPI app and `frontend/` Docusaurus app remain in this repository only as legacy references until final cutover.

## Architecture

- Next.js App Router running as a long-lived Node server.
- Auth.js sessions with global `admin`, `editor`, and `viewer` roles.
- SQLite + Drizzle for runtime metadata, users, sync state, document metadata, and audit events.
- Git repositories cloned under `COPISAURUS_REPOS_ROOT`; Markdown content remains source-of-truth in Git.
- GitHub and GitLab service/bot credentials for sync and write workflows.
- Config file at `COPISAURUS_CONFIG_PATH`, normally `/config/copisaurus.yaml`.

Persistent deployment paths:

```text
/data/copisaurus.db
/data/repos/<repo-id>
/data/cache
/config/copisaurus.yaml
```

## Local Development

```bash
cd web
pnpm install
cp ../.env.example .env.local
pnpm dev
```

The app runs at `http://localhost:3000` by default.

## Runtime Configuration

Copy `copisaurus.example.yaml` to `/config/copisaurus.yaml` or set `COPISAURUS_CONFIG_PATH` to another file. Repository config is file-first. The admin UI may edit only safe non-secret fields such as repo name, slug, visibility, docs path, AI enabled flag, and commit workflow settings.

Secrets stay outside YAML:

- `COPISAURUS_GITHUB_TOKEN`
- `COPISAURUS_GITLAB_TOKEN`
- `AI_API_KEY`
- Auth provider client secrets
- `AUTH_SECRET`

Do not include tokens in Git remote URLs, examples, audit metadata, commit messages, PR/MR descriptions, or client responses.

## Commit Workflows

Each repo config chooses one commit mode:

- `direct`: commit and push to the configured target branch.
- `branch`: create/update a Copisaurus branch and return branch/commit links.
- `merge-request`: create a branch and open a GitHub PR or GitLab MR.

`merge-request` is the recommended production default because it works with protected branches and keeps review controls in the Git provider.

## Tests

Run from `web/`:

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
```

Tests must mock GitHub, GitLab, OAuth, and AI providers. Do not call real provider APIs from tests.
