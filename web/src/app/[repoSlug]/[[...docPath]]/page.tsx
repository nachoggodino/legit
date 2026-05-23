import fs from "node:fs";
import { notFound, unauthorized } from "next/navigation";
import { canReadRepo, canUseAi, getCurrentUser } from "@/server/auth";
import { loadConfigForShell } from "@/server/config";
import { buildDocsTree, resolveRouteDocument } from "@/server/docs";
import { generateTableOfContents, renderMarkdown } from "@/server/markdown";
import { DocsPage } from "@/features/docs/DocsPage";

export const dynamic = "force-dynamic";

export default async function RepoDocPage({
  params,
}: {
  params: Promise<{ repoSlug: string; docPath?: string[] }>;
}) {
  const { repoSlug, docPath = [] } = await params;
  const config = loadConfigForShell();
  if (!config) {
    notFound();
  }

  const repo = config?.repos.find((candidate) => candidate.slug === repoSlug);

  if (!repo) {
    notFound();
  }

  const user = await getCurrentUser();
  if (!canReadRepo(repo, user)) {
    unauthorized();
  }

  const resolved = resolveRouteDocument(repo, docPath);
  if (!resolved) {
    notFound();
  }

  const source = fs.readFileSync(resolved.absolutePath, "utf8");
  const rendered = renderMarkdown(source, { currentPath: resolved.relativePath, repoSlug: repo.slug });

  return (
    <DocsPage
      repo={repo}
      user={user}
      markdownPath={resolved.relativePath}
      title={rendered.title ?? repo.name}
      html={rendered.html}
      tree={buildDocsTree(repo)}
      toc={generateTableOfContents(rendered.headings)}
      aiEnabled={canUseAi(config, user, repo)}
      hasDocumentTitleHeading={rendered.headings.some((heading) => heading.level === 1 && heading.text === rendered.title)}
    />
  );
}
