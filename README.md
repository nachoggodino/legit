# Legit

Legit is a self-hosted, Git-backed documentation platform for Markdown repositories with authenticated reading, editor/admin workflows, audit logging, and optional OpenAI-compatible AI assistance.

The production app now lives at the repository root.

## Architecture

- Next.js App Router running as a long-lived Node server.
- Auth.js sessions with global `admin`, `editor`, and `viewer` roles.
- SQLite + Drizzle for runtime metadata, users, sync state, document metadata, and audit events.
- Git repositories cloned under `LEGIT_REPOS_ROOT`; Markdown content remains source-of-truth in Git.
- GitHub and GitLab service or bot credentials for sync and write workflows.
- Config file at `LEGIT_CONFIG_PATH`, normally `/config/legit.yaml`.

Persistent deployment paths:

```text
/data/legit.db
/data/repos/<repo-id>
/data/cache
/config/legit.yaml
```

## Local Development

```bash
corepack pnpm install
npm run dev
```

`npm run dev` starts the Next.js app on `http://localhost:3000`, uses writable local paths under `.codex-dev/`, and loads `config/legit.mock-doc.yaml`.

Local testing uses [`.env.local.example`](/home/slenderai/PROJECTS/legit/.env.local.example) as the template for `.env.local`. The dev scripts now choose the config file themselves: `npm run dev` always uses the mock-doc repo, while `npm run dev:local` uses the placeholder local config. Container deployments can use [`.env.example`](/home/slenderai/PROJECTS/legit/.env.example) or [`.env.production.example`](/home/slenderai/PROJECTS/legit/.env.production.example).

For the private GitHub test repository, configure `.env.local`, then run:

```bash
cp .env.mock-doc.example .env.local
npm run dev
```

The checked-in mock config uses `https://github.com/nachoggodino/mock-doc` and stores runtime data under `.codex-dev/`. The mock-doc dev runner fails fast if GitHub OAuth or repository token settings are missing.

Create a GitHub OAuth app with callback URL `http://localhost:3000/api/auth/callback/github`, then set `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` in `.env.local`.

The `LEGIT_GITHUB_TOKEN` token must belong to a bot or service account, or to an account with explicit access to `nachoggodino/mock-doc`. If you want Legit to push branches or create pull requests from edits, also grant contents write and pull request write access. Set `LEGIT_BOOTSTRAP_ADMIN_EMAILS` to your GitHub account email if you want that account to become admin on sign-in.

For a short transition window, the local dev scripts still fall back to `web/.env.local` if you have not moved your ignored local file yet.

## Runtime Configuration

Copy `legit.example.yaml` to `/config/legit.yaml` or set `LEGIT_CONFIG_PATH` to another file. Repository config is file-first. The admin UI may edit only safe non-secret fields such as repo name, slug, visibility, docs path, AI enabled flag, and commit workflow settings.

Secrets stay outside YAML:

- `LEGIT_GITHUB_TOKEN`
- `LEGIT_GITLAB_TOKEN`
- `AI_API_KEY`
- Auth provider client secrets
- `AUTH_SECRET`

Do not include tokens in Git remote URLs, examples, audit metadata, commit messages, PR or MR descriptions, or client responses.

## Self-Hosted Docker Deployment

This repository includes a production-oriented `docker-compose.yml`.

Required files:

1. Environment secrets: `.env` (copy from `.env.production.example`).
2. App and repository config: `config/legit.yaml` (copy from `legit.example.yaml` or edit the committed template).

The main runtime config file is `config/legit.yaml` mounted at `/config/legit.yaml`.
Secrets must stay in `.env`.

### 1) Prepare configuration

```bash
cp .env.production.example .env
cp legit.example.yaml config/legit.yaml
```

Edit `.env`:

- Set `AUTH_SECRET` to a random secret value.
- Set `AUTH_URL` to your public URL (for example `https://legit.company.com`).
- Configure one auth provider (`AUTH_GITHUB_*`, `AUTH_GITLAB_*`, `AUTH_MICROSOFT_ENTRA_ID_*`, or `AUTH_OIDC_*`).
- Set Git service token(s): `LEGIT_GITHUB_TOKEN` and/or `LEGIT_GITLAB_TOKEN`.

Edit `config/legit.yaml`:

- Configure `auth.admins.emails` or `auth.admins.domains`.
- Set `repos[*].repoUrl`, `provider`, `defaultBranch`, `docsPath`, and commit workflow mode.

### 2) Start the stack

```bash
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f app
```

Health/readiness probes:

- `GET /api/health`
- `GET /api/ready`

### 3) First login and permissions

1. Sign in with an account that matches `auth.admins` or `LEGIT_BOOTSTRAP_ADMIN_EMAILS`.
2. Open `/admin`.
3. Use "Users and roles" to assign `viewer`, `editor`, or `admin`.
4. Use "Grant by email" to pre-provision permissions before a user signs in for the first time.

Role changes are recorded in the audit log.

### 4) Backup and restore

From repository root:

```bash
npm run ops:backup
npm run ops:restore -- ./backups/<archive>.tar.gz
```

Defaults:

- Data dir for scripts: `.codex-dev/data` (override with `LEGIT_DATA_DIR`).
- Backup dir for scripts: `backups/` (override with `LEGIT_BACKUP_DIR`).

For Docker deployments, always stop writes during restore (`docker compose stop app`), restore, then start again.

### 5) Multi-instance note

This app now uses filesystem leases under `LEGIT_LOCKS_ROOT` (`/data/locks` in Docker) for sync and commit coordination.
If you run multiple instances, they must share the same persistent `/data` volume to coordinate safely.

## Commit Workflows

Each repo config chooses one commit mode:

- `direct`: commit and push to the configured target branch.
- `branch`: create or update a Legit branch and return branch or commit links.
- `merge-request`: create a branch and open a GitHub PR or GitLab MR.

`merge-request` is the recommended production default because it works with protected branches and keeps review controls in the Git provider.

## Tests

Run from the repository root:

```bash
npm run typecheck
npm run test
npm run test:coverage
npm run test:e2e
npm run test:all
```

Tests must mock GitHub, GitLab, OAuth, and AI providers. Do not call real provider APIs from tests.

## Development Flow

For every feature or fix:

1. Make the smallest scoped code change in `src/`.
2. Add or update Vitest or React Testing Library coverage under `tests/`.
3. Run `npm run test:all`.
4. Start `npm run dev:mock-doc` and leave it running for browser review. It normally uses `http://localhost:3000`; Next.js will choose the next free port if 3000 is already occupied.
5. Capture screenshots for UI changes from the running dev server.

Use Docker Compose for a production-like smoke test:

```bash
cp .env.production.example .env
docker compose build
docker compose up -d
docker compose logs -f app
```

Before exposing Docker publicly, set production secrets, configure a real OAuth/OIDC provider, and verify repository provider permissions for your service account tokens.
