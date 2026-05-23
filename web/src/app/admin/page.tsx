import { forbidden, unauthorized } from "next/navigation";
import { requireAdmin } from "@/server/auth";
import { AuthenticationRequiredError, AuthorizationError } from "@/server/auth";
import { getAdminDashboardData } from "@/server/admin/dashboard";

export const dynamic = "force-dynamic";

function isProductionBuild(): boolean {
  return process.env.COPISAURUS_BUILD_PHASE === "1";
}

function formatDate(value: Date | null): string {
  return value ? value.toISOString() : "Never";
}

function formatCommit(value: string | null): string {
  return value ? value.slice(0, 12) : "None";
}

export default async function AdminPage() {
  if (isProductionBuild()) {
    return (
      <main className="app-shell">
        <section className="admin-content">
          <h1 className="page-title">Admin</h1>
        </section>
      </main>
    );
  }

  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      unauthorized();
    }

    if (error instanceof AuthorizationError) {
      forbidden();
    }

    throw error;
  }

  const { repos, configuredRepos, users, auditEvents, authProviderStatuses, aiProviderStatus, configWritable, configPath } =
    getAdminDashboardData();

  return (
    <main className="app-shell">
      <section className="admin-content">
        <h1 className="page-title">Admin</h1>
        <section className="admin-panel" aria-labelledby="sync-status-heading">
          <div className="admin-panel-heading">
            <div>
              <h2 id="sync-status-heading">Repository sync</h2>
              <p>Startup, periodic, and manual Git sync state for configured repositories.</p>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Repository</th>
                  <th scope="col">Status</th>
                  <th scope="col">Commit</th>
                  <th scope="col">Started</th>
                  <th scope="col">Finished</th>
                  <th scope="col">Last error</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {repos.map((repo) => (
                  <tr key={repo.id}>
                    <th scope="row">
                      <span className="admin-repo-name">{repo.name}</span>
                      <span className="admin-repo-meta">
                        {repo.provider} · {repo.defaultBranch} · {repo.visibility}
                      </span>
                    </th>
                    <td>
                      <span className={`status-pill status-${repo.status ?? "idle"}`}>{repo.status ?? "idle"}</span>
                    </td>
                    <td>{formatCommit(repo.lastSyncedCommit)}</td>
                    <td>{formatDate(repo.lastSyncStartedAt)}</td>
                    <td>{formatDate(repo.lastSyncFinishedAt)}</td>
                    <td className="admin-error">{repo.lastError ?? "None"}</td>
                    <td>
                      <form action={`/api/admin/repos/${encodeURIComponent(repo.id)}/sync`} method="post">
                        <button className="admin-action" type="submit">
                          Sync
                        </button>
                      </form>
                      <form action={`/api/admin/repos/${encodeURIComponent(repo.id)}/reindex`} method="post">
                        <button className="admin-action" type="submit">
                          Reindex
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="admin-panel" aria-labelledby="config-heading">
          <div className="admin-panel-heading">
            <div>
              <h2 id="config-heading">Repository config</h2>
              <p>
                Safe non-secret fields from {configPath}. Editing is {configWritable ? "enabled" : "disabled because the config is read-only"}.
              </p>
            </div>
          </div>
          <div className="admin-config-grid">
            {configuredRepos.map((repo) => (
              <form className="admin-config-form" action={`/api/admin/repos/${encodeURIComponent(repo.id)}/config`} method="post" key={repo.id}>
                <h3>{repo.name}</h3>
                <label>
                  Name
                  <input name="name" defaultValue={repo.name} disabled={!configWritable} />
                </label>
                <label>
                  Slug
                  <input name="slug" defaultValue={repo.slug} disabled={!configWritable} />
                </label>
                <label>
                  Visibility
                  <select name="visibility" defaultValue={repo.visibility} disabled={!configWritable}>
                    <option value="private">private</option>
                    <option value="public">public</option>
                  </select>
                </label>
                <label>
                  Default branch
                  <input name="defaultBranch" defaultValue={repo.defaultBranch} disabled={!configWritable} />
                </label>
                <label>
                  Docs path
                  <input name="docsPath" defaultValue={repo.docsPath} disabled={!configWritable} />
                </label>
                <label className="admin-checkbox">
                  <input name="aiEnabled" type="checkbox" defaultChecked={repo.ai.enabled} disabled={!configWritable} />
                  AI enabled for this repo
                </label>
                <label>
                  Commit mode
                  <select name="commitMode" defaultValue={repo.commit.mode} disabled={!configWritable}>
                    <option value="merge-request">merge-request</option>
                    <option value="branch">branch</option>
                    <option value="direct">direct</option>
                  </select>
                </label>
                <label>
                  Target branch
                  <input name="targetBranch" defaultValue={repo.commit.targetBranch} disabled={!configWritable} />
                </label>
                <label>
                  Branch prefix
                  <input name="branchPrefix" defaultValue={repo.commit.branchPrefix} disabled={!configWritable} />
                </label>
                <button className="admin-action" type="submit" disabled={!configWritable}>
                  Save config
                </button>
              </form>
            ))}
          </div>
        </section>
        <section className="admin-panel" aria-labelledby="users-heading">
          <div className="admin-panel-heading">
            <div>
              <h2 id="users-heading">Users and roles</h2>
              <p>Global v1 roles. Per-repo RBAC is intentionally deferred.</p>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Role</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <th scope="row">
                      <span className="admin-repo-name">{user.email ?? user.name ?? user.id}</span>
                      <span className="admin-repo-meta">{user.id}</span>
                    </th>
                    <td>{user.role}</td>
                    <td>{formatDate(user.updatedAt)}</td>
                    <td>
                      <form action={`/api/admin/users/${encodeURIComponent(user.id)}/role`} method="post" className="admin-inline-form">
                        <select name="role" defaultValue={user.role}>
                          <option value="viewer">viewer</option>
                          <option value="editor">editor</option>
                          <option value="admin">admin</option>
                        </select>
                        <button className="admin-action" type="submit">
                          Update
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="admin-panel" aria-labelledby="auth-status-heading">
          <div className="admin-panel-heading">
            <div>
              <h2 id="auth-status-heading">Auth providers</h2>
              <p>Configuration status for login providers. Missing values list environment variable names only.</p>
            </div>
          </div>
          <div className="auth-status-grid">
            {authProviderStatuses.map((provider) => (
              <div className="auth-status-item" key={provider.id}>
                <span className="admin-repo-name">{provider.name}</span>
                <span className={`status-pill ${provider.configured ? "status-succeeded" : "status-failed"}`}>
                  {provider.configured ? "configured" : "missing"}
                </span>
                <span className="admin-repo-meta">
                  {provider.configured ? "Ready for sign-in" : provider.missingEnv.join(", ")}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="admin-panel" aria-labelledby="ai-status-heading">
          <div className="admin-panel-heading">
            <div>
              <h2 id="ai-status-heading">AI provider</h2>
              <p>Model and environment status only. Secrets are never displayed.</p>
            </div>
          </div>
          <div className="auth-status-grid">
            <div className="auth-status-item">
              <span className="admin-repo-name">{aiProviderStatus.model}</span>
              <span className={`status-pill ${aiProviderStatus.enabled ? "status-succeeded" : "status-failed"}`}>
                {aiProviderStatus.enabled ? "enabled" : "disabled"}
              </span>
              <span className="admin-repo-meta">
                {aiProviderStatus.baseUrlEnv}: {aiProviderStatus.baseUrlConfigured ? "set" : "missing"} · {aiProviderStatus.apiKeyEnv}:{" "}
                {aiProviderStatus.apiKeyConfigured ? "set" : "missing"}
              </span>
            </div>
          </div>
        </section>
        <section className="admin-panel" aria-labelledby="audit-heading">
          <div className="admin-panel-heading">
            <div>
              <h2 id="audit-heading">Audit log</h2>
              <p>Recent write, sync, and admin events with secret-safe metadata.</p>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Repo</th>
                  <th scope="col">Operation</th>
                  <th scope="col">Path</th>
                  <th scope="col">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDate(event.createdAt)}</td>
                    <td>{event.actorId ?? "system"}</td>
                    <td>{event.repoId ?? "none"}</td>
                    <td>{event.operation}</td>
                    <td>{event.documentPath ?? "none"}</td>
                    <td className="admin-error">{event.metadata}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
