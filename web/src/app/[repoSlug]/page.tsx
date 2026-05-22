import { notFound, unauthorized } from "next/navigation";
import { loadConfigForShell } from "@/server/config";
import { canReadRepo } from "@/server/auth/roles";

export const dynamic = "force-dynamic";

export default async function RepoPage({ params }: { params: Promise<{ repoSlug: string }> }) {
  const { repoSlug } = await params;
  const config = loadConfigForShell();

  if (!config) {
    notFound();
  }

  const repo = config.repos.find((candidate) => candidate.slug === repoSlug);

  if (!repo) {
    notFound();
  }

  const user = await import("@/server/auth/session").then(({ getCurrentUser }) => getCurrentUser());

  if (!canReadRepo(repo, user)) {
    unauthorized();
  }

  return (
    <main className="app-shell">
      <section className="doc-content repo-gate">
        <h1 className="page-title">{repo.name}</h1>
        <div className="placeholder-panel">
          <h2>Repository access ready</h2>
          <p>Public repositories can be read anonymously. Private repositories require viewer, editor, or admin access.</p>
        </div>
      </section>
    </main>
  );
}
