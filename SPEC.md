# SPEC - Copisaurus

Version: 0.4 - May 2026

## Overview

Copisaurus is a single-tenant, self-hosted documentation platform for exposing one or more Git-backed Markdown document trees. The canonical document content remains in Git; Copisaurus owns runtime metadata, authentication state, audit logs, sync/index status, Markdown rendering, and optional AI assistance.

The target app is `web/`, a Next.js App Router application deployed as a long-running Node server. `backend/` and `frontend/` are legacy reference implementations until cutover.

## Core Stack

| Layer | Technology |
|---|---|
| App | Next.js App Router, React, TypeScript |
| Auth | Auth.js |
| Runtime DB | SQLite, Drizzle |
| Markdown | unified, remark, rehype |
| Search | ripgrep over checked-out Markdown |
| AI | OpenAI-compatible HTTP API |
| Tests | Vitest, React Testing Library, Playwright |

## Repository Model

Each configured repository has an id, slug, name, provider, repo URL, default branch, docs path, visibility, sync state, and commit workflow config. Public repos can be read anonymously; private repos require authentication. Editing requires `editor` or `admin`. Admin screens and APIs require `admin`.

Routes:

```text
/:repoSlug
/:repoSlug/:docPath*
/admin
/api/repos/:repoSlug/*
/api/admin/*
```

All document operations validate paths under the configured `docsPath` and support Markdown files only.

## Git Write Workflows

Supported providers are GitHub and GitLab. Writes use configured service credentials only, never per-user Git credentials.

Commit modes:

- `direct`: commit selected Markdown operation directly to `commit.targetBranch`.
- `branch`: commit to a branch named with `commit.branchPrefix`.
- `merge-request`: commit to a branch and create a GitHub PR or GitLab MR.

Audits record actor, repo id, operation, source path, rename target path, source branch, target branch, commit URL, PR/MR URL, and whether AI was involved. Audit payloads must not contain secrets.

## Admin UI

The admin UI includes:

- repo list and sync/reindex state
- manual sync/reindex actions
- users and global roles
- audit log
- auth provider status
- AI provider/model status without secret values
- safe non-secret repo config editing
- read-only config detection

Safe config writes are Zod validated, written atomically, backed up with a timestamp, reread, and validated again. Duplicate ids/slugs and reserved slugs are rejected.

## Non-Goals For v1

- Azure Repos
- per-user Git credentials
- per-user BYOK
- direct LDAP bind
- embeddings/vector search
- asset uploads
- fine-grained per-repo RBAC
- multi-replica job workers
