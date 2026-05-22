import { NextResponse } from "next/server";
import { canReadRepo, getCurrentUser } from "@/server/auth";
import { loadConfig } from "@/server/config";
import { searchRepositoryDocs } from "@/server/search";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ repoSlug: string }> }) {
  const { repoSlug } = await params;
  const config = loadConfig();
  const repo = config.repos.find((candidate) => candidate.slug === repoSlug);
  const user = await getCurrentUser();

  if (!repo) {
    return NextResponse.json({ error: "Repository not found." }, { status: 404 });
  }
  if (!canReadRepo(repo, user)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const results = await searchRepositoryDocs(repo, query);
  return NextResponse.json({ results });
}
