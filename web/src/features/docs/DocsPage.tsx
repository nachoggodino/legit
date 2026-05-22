import Link from "next/link";
import type { RepositoryConfig } from "@/server/config";
import type { AuthUser } from "@/server/auth";
import type { DocsTreeItem } from "@/server/docs";
import type { MarkdownHeading } from "@/server/markdown";
import { canEditRepo } from "@/server/auth";
import { DocsSearch } from "@/features/search/DocsSearch";
import { MarkdownEditorLauncher } from "@/features/editor/MarkdownEditor";

export type DocsPageProps = {
  repo: RepositoryConfig;
  user: AuthUser | null;
  markdownPath: string;
  title: string;
  html: string;
  tree: DocsTreeItem[];
  toc: MarkdownHeading[];
  hasDocumentTitleHeading: boolean;
};

export function DocsPage({ repo, user, markdownPath, title, html, tree, toc, hasDocumentTitleHeading }: DocsPageProps) {
  return (
    <main className="app-shell">
      <nav className="top-navbar" aria-label="Primary">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span className="brand-text">Copisaurus</span>
        </Link>
        <DocsSearch repoSlug={repo.slug} aiEnabled={Boolean(user)} />
        <div className="navbar-actions">
          <Link className="nav-link" href="/">Repos</Link>
          {user ? <span className="nav-link user-menu">{user.name ?? user.email}<span className="role-pill">{user.role}</span></span> : <Link className="nav-link" href="/api/auth/signin">Log in</Link>}
        </div>
      </nav>

      <div className="docs-frame">
        <nav className="docs-sidebar" aria-label="Docs navigation">
          <p className="sidebar-heading">{repo.name}</p>
          {tree.map((item) => (
            <Link
              className={`sidebar-item${item.markdownPath === markdownPath ? " active" : ""}`}
              href={`/${repo.slug}${item.routePath ? `/${item.routePath}` : ""}`}
              key={item.markdownPath}
              style={{ paddingLeft: `${0.6 + item.depth * 0.75}rem` }}
            >
              {item.title}
            </Link>
          ))}
        </nav>

        <article className="doc-content markdown-page">
          {hasDocumentTitleHeading ? null : <h1 className="page-title">{title}</h1>}
          {toc.length > 0 ? (
            <nav className="toc-panel" aria-label="Table of contents">
              {toc.map((heading) => <a key={heading.id} href={`#${heading.id}`}>{heading.text}</a>)}
            </nav>
          ) : null}
          <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      </div>

      {canEditRepo(user) ? <MarkdownEditorLauncher repoSlug={repo.slug} documentPath={markdownPath} /> : null}
    </main>
  );
}
