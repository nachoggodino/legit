import { forbidden, unauthorized } from "next/navigation";
import { requireAdmin } from "@/server/auth";
import { AuthenticationRequiredError, AuthorizationError } from "@/server/auth";
import { buildAuthProviderStatuses } from "@/server/auth/providers";
import { loadConfig } from "@/server/config";
import { getRuntimeDatabase, importRepositoriesFromConfig, listRepositorySyncStatuses } from "@/server/db";
import { redactGitUrl } from "@/server/git";

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

  const config = loadConfig();
  const { db } = getRuntimeDatabase();
  importRepositoriesFromConfig(db, config.repos);
  const repos = listRepositorySyncStatuses(db);
  const authProviderStatuses = buildAuthProviderStatuses();

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
                    <td className="admin-error">{repo.lastError ? redactGitUrl(repo.lastError) : "None"}</td>
                    <td>
                      <form action={`/api/admin/repos/${encodeURIComponent(repo.id)}/sync`} method="post">
                        <button className="admin-action" type="submit">
                          Sync
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
      </section>
    </main>
  );
}
