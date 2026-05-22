import Link from "next/link";
import type { CopisaurusConfig } from "@/server/config";
import type { AuthUser } from "@/server/auth";
import { ThemeToggle } from "./ThemeToggle";

type AppShellProps = {
  config: CopisaurusConfig | null;
  user: AuthUser | null;
};

export function AppShell({ config, user }: AppShellProps) {
  const repos = config?.repos ?? [];
  const appName = config?.app.name ?? "Copisaurus";

  return (
    <main className="app-shell">
      <nav className="top-navbar" aria-label="Primary">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            C
          </span>
          <span className="brand-text">{appName}</span>
        </Link>

        <div className="search-placeholder" role="search" aria-label="Search placeholder">
          <span aria-hidden="true">Search</span>
          <span>Search docs and ask Copisaurus</span>
        </div>

        <div className="navbar-actions">
          <select className="repo-switcher" aria-label="Repository">
            {repos.length > 0 ? (
              repos.map((repo) => (
                <option key={repo.id} value={repo.slug}>
                  {repo.name}
                </option>
              ))
            ) : (
              <option>No repositories</option>
            )}
          </select>
          {user?.role === "admin" ? (
            <Link className="nav-link" href="/admin">
              Admin
            </Link>
          ) : null}
          {user ? (
            <>
              <span className="nav-link user-menu" aria-label="User menu">
                {user.name ?? user.email}
                <span className="role-pill">{user.role}</span>
              </span>
              <Link className="nav-link" href="/api/auth/signout">
                Log out
              </Link>
            </>
          ) : (
            <Link className="nav-link" href="/api/auth/signin">
              Log in
            </Link>
          )}
          <ThemeToggle />
        </div>
      </nav>

      <div className="docs-frame">
        <aside className="docs-sidebar" aria-label="Docs navigation">
          <p className="sidebar-heading">Docs</p>
          <a className="sidebar-item active" href="#overview">
            Overview
          </a>
          <a className="sidebar-item" href="#navigation">
            Navigation placeholder
          </a>
          <a className="sidebar-item" href="#sync">
            Sync status placeholder
          </a>
        </aside>

        <section className="doc-content" id="overview">
          <h1 className="page-title">Migration foundation</h1>
          <p>
            This App Router shell is ready for the next migration phases while the existing FastAPI
            and Docusaurus apps remain available as references.
          </p>
          <div className="repo-grid" aria-label="Repositories">
            {repos.map((repo) => {
              const privateLocked = repo.visibility === "private" && !user;

              return (
                <Link
                  className={`repo-card${privateLocked ? " locked" : ""}`}
                  href={privateLocked ? "/api/auth/signin" : `/${repo.slug}`}
                  key={repo.id}
                >
                  <span className="repo-card-title">{repo.name}</span>
                  <span className="repo-card-meta">
                    {repo.provider} · {repo.visibility}
                  </span>
                  {privateLocked ? <span className="repo-card-warning">Sign in required</span> : null}
                </Link>
              );
            })}
          </div>
          <div className="placeholder-panel" id="navigation">
            <h2>Docs layout placeholder</h2>
            <p>Markdown rendering, generated navigation, search, sync, and editor features are deferred.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
