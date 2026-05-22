# Copisaurus Web

This is the Phase 0/1 Next.js migration app. It coexists with the current `backend/` and `frontend/` reference implementations.

## Commands

```bash
pnpm install
pnpm dev
pnpm test
pnpm typecheck
pnpm build
```

Formatting is intentionally out of scope for the current migration phase because there are no external contributors yet. Use the existing lint, typecheck, and test commands as the canonical quality gates for now.

Development config falls back to `../copisaurus.example.yaml` when `/config/copisaurus.yaml` is not mounted.

## Runtime sync

The App Router `src/instrumentation.ts` file starts the repository sync scheduler once for each Node.js server process. This runs before the server accepts requests in `next start` and in the standalone `node .next/standalone/server.js` runtime. Startup sync honors `sync.pullOnStartup`; periodic sync uses `sync.intervalSeconds`.

## First admin bootstrap

Admin bootstrap is explicit. Prefer configuring `auth.admins.emails` or `auth.admins.domains` in `copisaurus.yaml` before exposing the app. If YAML admins are not configured yet, set `COPISAURUS_BOOTSTRAP_ADMIN_EMAILS` to a comma-separated list of trusted emails, let the intended admin sign in, then remove the environment variable.
