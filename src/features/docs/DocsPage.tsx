import Link from "next/link";
import type { RepositoryConfig } from "@/server/config";
import type { AuthUser } from "@/server/auth";
import { buildSignInHref } from "@/server/auth/links";
import type { DocsTreeDirectory, DocsTreeNode } from "@/server/docs";
import type { MarkdownHeading } from "@/server/markdown";
import { canEditRepo } from "@/server/auth";
import { DocsSearch } from "@/features/search/DocsSearch";
import { CreateMarkdownFileButton, MarkdownEditorLauncher } from "@/features/editor/MarkdownEditor";
import { MarkdownPageEnhancements } from "@/features/docs/MarkdownPageEnhancements";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";

export type DocsPageProps = {
  repo: RepositoryConfig;
  user: AuthUser | null;
  markdownPath: string;
  title: string;
  html: string;
  tree: DocsTreeNode[];
  toc: MarkdownHeading[];
  aiEnabled: boolean;
  hasDocumentTitleHeading: boolean;
};

function hasActiveDocument(item: DocsTreeDirectory, markdownPath: string): boolean {
  return item.children.some((child) =>
    child.kind === "file" ? child.markdownPath === markdownPath : hasActiveDocument(child, markdownPath),
  );
}

function renderDocsTree(items: DocsTreeNode[], repoSlug: string, markdownPath: string) {
  return items.map((item) => {
    if (item.kind === "directory") {
      return (
        <details className="sidebar-directory" key={item.path} open={hasActiveDocument(item, markdownPath)}>
          <summary style={{ paddingLeft: `${0.6 + item.depth * 0.75}rem` }}>
            <span className="sidebar-disclosure" aria-hidden="true" />
            {item.title}
          </summary>
          <div className="sidebar-directory-children">{renderDocsTree(item.children, repoSlug, markdownPath)}</div>
        </details>
      );
    }

    return (
      <Link
        className={`sidebar-item${item.markdownPath === markdownPath ? " active" : ""}`}
        href={`/${repoSlug}${item.routePath ? `/${item.routePath}` : ""}`}
        key={item.markdownPath}
        style={{ paddingLeft: `${0.6 + item.depth * 0.75}rem` }}
      >
        {item.title}
      </Link>
    );
  });
}

export function DocsPage({ repo, user, markdownPath, title, html, tree, toc, aiEnabled, hasDocumentTitleHeading }: DocsPageProps) {
  return (
    <main className="app-shell">
      <nav className="top-navbar" aria-label="Primary">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span className="brand-text">Legit</span>
        </Link>
        <DocsSearch repoSlug={repo.slug} aiEnabled={aiEnabled} />
        <div className="navbar-actions">
          <Link className="nav-link" href="/">Repos</Link>
          {user ? (
            <UserMenu user={user} />
          ) : (
            <Link className="nav-link" href={buildSignInHref(`/${repo.slug}`)} rel="noopener noreferrer" target="_blank">
              Log in
            </Link>
          )}
          <ThemeToggle />
        </div>
      </nav>

      <div className="docs-frame">
        <nav className="docs-sidebar" aria-label="Docs navigation">
          <div className="sidebar-heading-row">
            <p className="sidebar-heading">{repo.name}</p>
            {canEditRepo(user) ? <CreateMarkdownFileButton repoSlug={repo.slug} /> : null}
          </div>
          {renderDocsTree(tree, repo.slug, markdownPath)}
        </nav>

        <article className="doc-content markdown-page">
          {hasDocumentTitleHeading ? null : <h1 className="page-title">{title}</h1>}
          <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
          <MarkdownPageEnhancements />
        </article>

        {toc.length > 0 ? (
          <aside className="doc-outline" aria-label="Page outline">
            <p className="sidebar-heading">On this page</p>
            <nav className="toc-panel" aria-label="Table of contents">
              {toc.map((heading) => (
                <a className={`toc-link toc-level-${heading.level}`} key={heading.id} href={`#${heading.id}`}>
                  {heading.text}
                </a>
              ))}
            </nav>
          </aside>
        ) : (
          <aside className="doc-outline" aria-hidden="true" />
        )}
      </div>

      {canEditRepo(user) ? <MarkdownEditorLauncher repoSlug={repo.slug} documentPath={markdownPath} /> : null}
    </main>
  );
}
