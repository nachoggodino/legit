# Copisaurus Next.js Migration Plan

Status: implementation plan with Phases 7-9 partially implemented  
Date: 2026-05-22

This document captures the agreed migration direction for moving Copisaurus from the current Docusaurus + FastAPI prototype into a production-oriented, self-hosted-first Next.js application.

The goal is a clean production architecture, even if the migration takes time. The current app is not in production, so the migration can be a full replacement rather than a compatibility-preserving refactor.

## 1. Locked Product Direction

Copisaurus will become a single-tenant, self-hosted documentation platform for exposing Git-backed Markdown document trees with AI assistance.

The production target is:

- Single tenant per deployment.
- Multiple documentation repositories per deployment.
- Each repository appears as a separate site/workspace.
- Private by default.
- Optional public read access per repository.
- Instance-owner BYOK for AI.
- Markdown-first content model.
- No arbitrary MDX/React execution in v1.
- Git remains the source of truth for documents.
- Copisaurus owns runtime metadata, auth state, audit logs, indexing state, and operational state.

## 2. Target Architecture

The target architecture is a single long-running Next.js application deployed in Docker.

```text
Browser
  -> Next.js standalone Node server
      -> Auth.js sessions
      -> app routes and server actions/route handlers
      -> server modules for Git, AI, Markdown, indexing, DB, audit
      -> local persistent /data volume
```

The app must not assume serverless or edge deployment. Core routes run in the Node.js runtime.

Persistent paths:

```text
/data/copisaurus.db
/data/repos/<repo-id>
/data/cache
/config/copisaurus.yaml
```

Final architecture removes the current `backend/` FastAPI app and `frontend/` Docusaurus app after parity is reached.

## 3. Migration Strategy

Migration should happen through coexistence during development, followed by a hard cutover.

During migration:

```text
backend/       existing FastAPI reference implementation
frontend/      existing Docusaurus reference implementation
web/           new Next.js app
```

At cutover:

```text
src/
public/
drizzle/
package.json
next.config.ts
AGENTS.md
.agents/
MIGRATION_NEXTJS.md
```

The old implementation remains available as reference until the Next.js app reaches functional parity.

## 4. Technology Stack

Preferred stack:

- Next.js App Router
- TypeScript
- pnpm
- Auth.js
- SQLite via `better-sqlite3`
- Drizzle
- Zod
- Vitest
- Playwright
- unified / remark / rehype for Markdown
- ripgrep for v1 full-text search
- OpenAI-compatible AI API

This stack is not meant to create hard coupling. The codebase should be organized so database, auth, Git, AI, Markdown, and search modules are replaceable without route-level rewrites.

Use lightweight modularity. Avoid heavy ports/adapters boilerplate unless a boundary is genuinely useful.

## 5. Code Organization

Routes should stay thin. Business logic should live in feature and server modules.

Recommended structure:

```text
src/
  app/
    (auth)/
    admin/
    api/
    [repoSlug]/
  components/
  features/
    docs/
    search/
    editor/
    admin/
    auth/
  server/
    ai/
    audit/
    auth/
    config/
    db/
    git/
    indexing/
    markdown/
    search/
    sync/
  styles/
```

Architectural rules:

- Next.js route handlers orchestrate only.
- No route file should contain raw SQL, raw Git commands, LLM prompt construction, or Markdown parsing.
- `server/db` hides Drizzle details from app routes.
- `server/git` hides Git CLI/provider API details.
- `server/ai` hides OpenAI-compatible HTTP details.
- `server/auth` wraps Auth.js/session helpers.
- `server/markdown` owns render parity between document pages and editor preview.
- `server/search` owns ripgrep execution and result shaping.

## 6. Multi-Repo Model

One deployment can expose multiple repositories.

Each repository has:

- stable id
- public slug
- display name
- Git provider
- repo URL
- default branch
- docs path
- visibility
- commit mode
- sync/index status

URL model:

```text
/:repoSlug
/:repoSlug/:docPath*
```

File path URL mapping:

```text
<docsPath>/index.md       -> /:repoSlug
<docsPath>/foo.md         -> /:repoSlug/foo
<docsPath>/foo/index.md   -> /:repoSlug/foo
<docsPath>/foo/bar.md     -> /:repoSlug/foo/bar
```

Reserved slugs:

```text
api
admin
login
logout
settings
assets
_next
```

## 7. Configuration

Repository configuration is file-first.

Primary config file:

```text
/config/copisaurus.yaml
```

Example:

```yaml
app:
  name: Copisaurus

auth:
  defaultRole: viewer
  admins:
    emails:
      - admin@example.com

ai:
  enabled: true
  baseUrlEnv: AI_BASE_URL
  apiKeyEnv: AI_API_KEY
  defaultModel: gpt-4o
  maxContextTokens: 150000
  allowAnonymous: false

sync:
  intervalSeconds: 120
  pullOnStartup: true
  reindexOnChange: true

repos:
  - id: research
    slug: research
    name: Research Wiki
    provider: gitlab
    repoUrl: https://gitlab.example.com/group/research
    defaultBranch: main
    docsPath: docs
    visibility: private
    commit:
      mode: merge-request
      targetBranch: main
      branchPrefix: copisaurus/
```

Secrets remain external in v1:

- Git tokens
- AI API keys
- Auth provider client secrets
- Auth/session/encryption secrets
- LDAP bind passwords, if direct LDAP is ever added

Secrets are supplied via env vars, Docker secrets, or Kubernetes secrets.

The admin UI may edit safe non-secret config fields in v1:

- repo name
- repo slug, with conflict checks
- visibility
- default branch
- docs path
- per-repo AI enabled/disabled
- commit mode/target branch/branch prefix

Config writes must be atomic:

- validate with Zod before write
- write temp file
- reread and validate
- rename into place
- create timestamped backup
- detect read-only config and disable editing

## 8. Database

SQLite is accepted for v1.

SQLite stores runtime state, not the canonical docs content.

Suggested tables:

- users
- auth accounts/sessions, via Auth.js adapter
- roles
- repositories imported from config
- repo sync state
- documents
- document headings/frontmatter
- document summaries
- audit events
- AI usage events
- background job status

Postgres support can come later. Keep DB usage behind `server/db` functions so the app is not littered with Drizzle calls.

## 9. Auth And Authorization

Use Auth.js. Avoid custom OAuth plumbing.

Supported auth providers in v1:

- Microsoft Entra ID / Azure AD
- GitHub
- GitLab
- Generic OIDC
- LDAP via OIDC bridge

Direct LDAP bind is not a v1 target. Recommended LDAP path is Keycloak, Authentik, Authelia, Dex, or another OIDC bridge.

Global roles in v1:

- `admin`
- `editor`
- `viewer`

Rules:

- Private repo read requires authenticated user.
- Public repo read may be anonymous.
- AI is authenticated-only by default, even for public repos.
- Edit/commit requires `editor` or `admin`.
- Admin UI requires `admin`.
- Per-repo RBAC is deferred.

Git credentials are not per-user in v1. Commits use configured bot/service credentials. Audit logs and commit messages should record the Copisaurus user responsible for the action.

## 10. Git Providers And Commit Workflows

Git providers in v1:

- GitLab
- GitHub

Azure Repos is out of v1 scope.

Commit modes:

- `direct`: commit to target branch
- `branch`: commit to generated branch and return branch URL
- `merge-request`: create branch and open GitLab MR or GitHub PR

Production recommended default: `merge-request`.

Audit every write operation:

- Copisaurus user
- repo id
- operation type
- source path
- target path, if rename
- source branch
- target branch
- commit URL
- PR/MR URL
- whether AI was involved

Phase 7 implementation note:

- Markdown create/edit/rename/delete flows now run commit workflows through `web/src/server/git/commit.ts`.
- GitHub PR and GitLab MR creation live behind provider modules in `web/src/server/git/providers`.
- Writes use service credentials from env vars only.
- Protected branch, auth, conflict, and provider API failures are surfaced as classified workflow errors.

## 11. Markdown And Rendering

v1 content model:

- `.md`
- GFM tables/task lists
- frontmatter
- syntax highlighting
- relative links
- local images/assets rendering
- heading anchors
- generated table of contents
- optional Mermaid rendering

Not v1:

- arbitrary MDX
- arbitrary React components inside docs

The same Markdown rendering stack should power:

- document pages
- editor live preview
- AI result preview where possible

This avoids the current mismatch between Docusaurus build-time MDX and runtime `react-markdown`.

## 12. Search And Indexing

Do not keep `_index.json` as a committed generated artifact in the docs repository.

Generated index state belongs to Copisaurus runtime state in SQLite/cache.

v1 search:

- use `ripgrep` for full-text search over the checked-out docs tree
- keep metadata/summaries/headings in SQLite
- enrich search results with metadata
- use AI to inspect top candidate files/snippets

Implementation notes:

- bundle `rg` in the Docker image
- run searches only within the resolved docs root
- use argument arrays, never shell-concatenated user input
- enforce timeout and max result limits
- filter to Markdown files
- return snippets and paths

Optional later:

- SQLite FTS5
- embeddings
- sqlite-vec
- LanceDB
- pgvector if Postgres is added

## 13. AI / BYOK

BYOK v1 means the instance owner supplies the key.

OpenAI-compatible API config:

```text
AI_BASE_URL
AI_API_KEY
AI_MODEL
MAX_CONTEXT_TOKENS
AI_ENABLED
```

Anonymous AI is disabled by default, even on public repos.

Later enhancements:

- per-repo model override
- per-user keys
- local OpenAI-compatible providers
- usage quotas
- usage dashboard
- embeddings

## 14. Sync And Background Jobs

v1 is single-node. In-process background jobs are acceptable.

Required behavior:

- sync repos on startup
- periodic pull per repo
- manual sync from admin UI
- reindex when synced commit changes
- manual reindex from admin UI
- per-repo lock to avoid concurrent pull/commit/index operations

Config:

```yaml
sync:
  intervalSeconds: 120
  pullOnStartup: true
  reindexOnChange: true
```

If multi-replica deployment is ever supported, jobs must move to DB-backed locks or a queue/worker model.

## 15. Editor And File Operations

v1 file operations are Markdown-only.

Supported:

- edit existing `.md`
- create new `.md`
- create folders implicitly by creating `.md` files under new directories
- rename `.md`
- delete `.md`
- preview before commit
- commit via direct/branch/MR mode

Not v1:

- binary asset upload
- image management
- multi-file AI refactors
- automatic link rewrites

Safety requirements:

- strict path validation under repo `docsPath`
- no `..`
- no absolute paths
- no hidden/system paths unless explicitly allowed
- explicit confirmation for rename/delete
- optional link-impact scan using ripgrep
- audit all file operations

## 16. UI Migration

The current visual style should be preserved closely.

Keep the overall design choices:

- color palette
- border treatments
- spacing rhythm
- restrained docs-app layout
- navbar/search style
- button styles
- modal/editor feel
- floating edit button
- light/dark mode tone

UI structure to preserve or rebuild:

- top navbar with logo/title
- centered search/AI bar
- right-side auth/theme/repo controls
- left docs sidebar
- document content area
- floating edit button
- near-fullscreen split editor/preview modal
- inline AI result display

New UI pieces:

- login/user menu
- repo switcher
- admin screens
- sync/index status
- config editing forms

Add a lightweight design-token layer using CSS variables:

- background
- surface
- text
- muted text
- border
- accent
- danger/success/warning
- navbar height
- radius
- shadow
- editor font
- content width

No heavy design system package is required.

## 17. Admin UI

Admin UI v1 should include:

- repo list and status
- sync/reindex actions
- users and roles
- audit log
- auth provider status
- AI provider/model status, without exposing secrets
- safe non-secret repo config editing
- read-only config detection

Admin UI should not edit secrets in v1.

Phase 8 implementation note:

- The admin page shows repo sync/index status, manual sync/reindex actions, users/roles, audit events, auth provider status, AI provider/model status, safe repo config forms, and read-only config detection.
- Safe config writes validate with Zod, create timestamped backups, write atomically, reread, and validate again.

## 18. Docs, Agents, Skills, And Prompts

Documentation and agent guidance are first-class migration deliverables.

The existing `.github` guidance is Copilot-specific and tied to the old Docusaurus/FastAPI/no-DB architecture. It should be replaced with Codex-native files.

Target:

```text
AGENTS.md
.agents/
  skills/
    nextjs-app-practices/SKILL.md
    nextjs-server-practices/SKILL.md
    auth-practices/SKILL.md
    git-docs-practices/SKILL.md
    ai-streaming-practices/SKILL.md
    markdown-rendering-practices/SKILL.md
    testing-practices/SKILL.md
    test-execution/SKILL.md
  prompts/
    review-app.md
    review-server.md
    generate-tests.md
    maintain-docs.md
    commit.md
```

Migration work:

- convert `.github/copilot-instructions.md` into root `AGENTS.md`
- convert useful `.github/skills/*` into `.agents/skills/*`
- convert useful `.github/prompts/*` into `.agents/prompts/*`
- remove old `.github/agents`, `.github/skills`, and `.github/prompts` after equivalents exist
- rewrite guidance for the target Next.js architecture
- remove stale rules:
  - no database
  - FastAPI/Pydantic
  - Docusaurus swizzling
  - `_index.json` in Git
  - Python-only backend testing

Phase 9 implementation note:

- Root `AGENTS.md`, README, SPEC, and `.env.example` have been updated for the Next.js target architecture.
- Obsolete `.github` agent, skill, prompt, and Copilot instruction files were removed.
- Creating nested `.agents/skills/**` and `.agents/prompts/**` files is blocked in the current Codex workspace because `.agents` is mounted read-only. Remount `.agents` writable, then add the Codex-native files listed above.

Docs to update/create:

- `README.md`
- `SPEC.md`
- `.env.example`
- `copisaurus.example.yaml`
- `AGENTS.md`
- `.agents/**`
- this migration plan

Later, once the migration is stable, move this file into a docs directory if desired.

## 19. Testing Strategy

Existing backend tests are useful behavioral contracts. Port their coverage into the new TypeScript test suite.

Test stack:

- Vitest for server modules and React components
- React Testing Library for UI behavior
- Playwright for core browser flows
- focused integration tests for Git/AI/search modules with mocks

Test areas:

- config parsing and validation
- auth role checks
- repo slug/path resolution
- path traversal prevention
- GitHub/GitLab commit flows
- direct/branch/PR/MR modes
- Markdown rendering
- ripgrep search wrapper
- AI streaming parser and route output
- editor create/edit/rename/delete flows
- admin sync/reindex actions
- audit logging

Do not call real external services in tests. Mock Git providers and AI HTTP calls.

## 20. Phased Plan

### Phase 0: Planning And Scaffolding

- Create `web/` Next.js app.
- Configure pnpm, TypeScript, linting, formatting, Vitest, Playwright.
- Add Dockerfile for long-running Next standalone server.
- Add `/data` and `/config` conventions.
- Add initial design tokens based on current UI.

### Phase 1: Config, DB, And App Shell

- Add `copisaurus.yaml` parser and Zod schema.
- Add SQLite/Drizzle setup.
- Add repo import/sync state tables.
- Build app shell:
  - navbar
  - repo switcher
  - docs layout
  - sidebar placeholder
  - theme toggle
  - login/user menu placeholder

### Phase 2: Auth

- Add Auth.js.
- Configure Microsoft Entra ID, GitHub, GitLab, generic OIDC.
- Document LDAP via OIDC bridge.
- Add global roles.
- Add first admin/bootstrap flow.
- Gate private repos and admin routes.

### Phase 3: Git And Repo Sync

- Implement Git clone/pull/cache under `/data/repos`.
- Add GitHub and GitLab provider modules.
- Add startup sync.
- Add periodic sync.
- Add manual sync.
- Add per-repo locks.
- Add sync status in admin.

### Phase 4: Markdown Rendering And Navigation

- Implement file-path-derived routing.
- Render Markdown pages.
- Generate sidebar/navigation from Git tree.
- Support frontmatter, headings, TOC, code highlighting, links, images.
- Match editor preview and page renderer.

### Phase 5: Search And AI Chat

- Add ripgrep wrapper.
- Add metadata index tables.
- Add summaries/headings storage.
- Implement text search.
- Implement AI chat with candidate file retrieval.
- Stream responses from route handlers.
- Disable anonymous AI by default.

### Phase 6: Editor And File Operations

- Port current edit modal style and behavior.
- Implement fetch raw Markdown.
- Implement live preview.
- Implement AI edit.
- Implement create/edit/rename/delete Markdown operations.
- Add link-impact scan for rename/delete.
- Add commit workflow integration.

### Phase 7: Commit Workflows

- Implement direct commit.
- Implement branch mode.
- Implement GitHub PR creation.
- Implement GitLab MR creation.
- Add audit logs.
- Add commit/PR/MR success UI.

### Phase 8: Admin UI

- Repo status.
- Manual sync/reindex.
- User/role management.
- Audit log.
- Auth/AI status.
- Safe config editing.
- Read-only config mode.

### Phase 9: Docs And Agent Migration

- Rewrite `README.md`.
- Rewrite `SPEC.md`.
- Add `copisaurus.example.yaml`.
- Update `.env.example`.
- Create `AGENTS.md`.
- Create `.agents/skills/*`.
- Create `.agents/prompts/*`.
- Remove obsolete `.github` agent/skill/prompt files.

### Phase 10: Cutover

- Verify parity against the old app.
- Run full unit/integration/e2e suite.
- Remove `backend/`.
- Remove `frontend/`.
- Replace root scripts and Docker Compose.
- Keep migration document at root until final docs organization pass.

## 21. Risks And Mitigations

### Auth Complexity

Risk: supporting many providers plus roles can grow quickly.

Mitigation: use Auth.js, keep role model global, defer per-repo RBAC.

### Git Write Safety

Risk: direct writes can damage protected branches or delete content.

Mitigation: default production mode to PR/MR, add confirmations, audit logs, strict path validation.

### Search Scaling

Risk: ripgrep is simple but may become less flexible than indexed search.

Mitigation: keep search wrapper modular; add SQLite FTS or embeddings later.

### Config Editing

Risk: admin UI could corrupt config or lock out users.

Mitigation: validate before write, atomic writes, backups, read-only mode, do not edit secrets.

### Markdown Rendering Differences

Risk: migrated renderer may not match Docusaurus output.

Mitigation: Markdown-first v1, no arbitrary MDX, browser screenshots against representative docs.

### Full Backend Rewrite

Risk: porting FastAPI logic to TypeScript may regress behavior.

Mitigation: use existing tests as contracts and port them early.

## 22. Explicit Non-Goals For V1

- SaaS multi-tenancy.
- Azure Repos.
- Direct LDAP bind.
- Per-user Git credentials.
- Per-user BYOK.
- Asset uploads.
- Arbitrary MDX/React docs content.
- Embeddings/vector search.
- Multi-replica background workers.
- Serverless/edge deployment.
- Fine-grained per-repo RBAC.

## 23. Open Decisions

No major architecture blockers remain. Minor decisions can be made during implementation:

- exact package versions
- `web/` vs immediate root Next.js placement during migration
- exact Drizzle migration layout
- exact Auth.js session strategy
- Mermaid support in v1 or phase 2
- exact admin bootstrap mechanism
