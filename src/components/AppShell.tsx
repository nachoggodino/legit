import Link from "next/link";
import type { LegitConfig } from "@/server/config";
import type { AuthUser } from "@/server/auth";
import { buildSignInHref } from "@/server/auth/links";
import { ThemeToggle } from "./ThemeToggle";

type AppShellProps = {
  config: LegitConfig | null;
  user: AuthUser | null;
};

export function AppShell({ config, user }: AppShellProps) {
  const repos = config?.repos ?? [];
  const appName = config?.app.name ?? "Legit";
  const firstRepo = repos[0];
  const firstRepoLocked = firstRepo?.visibility === "private" && !user;
  const signInLinkProps = { target: "_blank", rel: "noopener noreferrer" } as const;

  return (
    <main className="app-shell">
      <nav className="top-navbar" aria-label="Primary">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            C
          </span>
          <span className="brand-text">{appName}</span>
        </Link>

        <div className="search-placeholder" role="search" aria-label="Repository search status">
          <span aria-hidden="true">Docs</span>
          <span>Open a repository to search, browse, edit, and ask AI.</span>
        </div>

        <div className="navbar-actions">
          {firstRepo ? (
            <Link
              className="nav-link primary-action"
              href={firstRepoLocked ? buildSignInHref(`/${firstRepo.slug}`) : `/${firstRepo.slug}`}
              {...(firstRepoLocked ? signInLinkProps : {})}
            >
              Open docs
            </Link>
          ) : null}
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
            <Link className="nav-link" href={buildSignInHref("/")} {...signInLinkProps}>
              Log in
            </Link>
          )}
          <ThemeToggle />
        </div>
      </nav>

      <div className="docs-frame">
        <aside className="docs-sidebar" aria-label="Docs navigation">
          <p className="sidebar-heading">Docs</p>
          <a className="sidebar-item active" href="#overview">Repositories</a>
          {repos.map((repo) => (
            <Link className="sidebar-item" href={`/${repo.slug}`} key={repo.id}>
              {repo.name}
            </Link>
          ))}
          {user?.role === "admin" ? <Link className="sidebar-item" href="/admin">Admin</Link> : null}
        </aside>

        <section className="doc-content" id="overview">
          <h1 className="page-title">Documentation repositories</h1>
          <p>Choose a repository to browse Markdown docs, use repository search, and edit content through the configured Git workflow.</p>
          <div className="repo-grid" aria-label="Repositories">
            {repos.map((repo) => {
              const privateLocked = repo.visibility === "private" && !user;

              return (
                <Link
                  className={`repo-card${privateLocked ? " locked" : ""}`}
                  href={privateLocked ? buildSignInHref(`/${repo.slug}`) : `/${repo.slug}`}
                  key={repo.id}
                  {...(privateLocked ? signInLinkProps : {})}
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
            <h2>Repository tools</h2>
            <p>Admins can review sync status, users, audit events, AI provider status, and safe repository configuration from the admin console.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
