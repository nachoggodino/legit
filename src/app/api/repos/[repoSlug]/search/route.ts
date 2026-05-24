import { NextResponse } from "next/server";
import { canReadRepo } from "@/server/auth";
import { resolveRepoRequest } from "@/server/repos/request";
import { searchRepositoryDocs } from "@/server/search";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ repoSlug: string }> }) {
  const { repoSlug } = await params;
  const { repo, user } = await resolveRepoRequest(repoSlug);

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
