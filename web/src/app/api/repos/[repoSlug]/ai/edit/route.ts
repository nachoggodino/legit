import { NextResponse } from "next/server";
import { canEditRepo, canUseAi, getCurrentUser } from "@/server/auth";
import { makeDocsEditMessages, requestOpenAiCompatibleEdit } from "@/server/ai";
import { loadConfig } from "@/server/config";
import { validateRelativePath } from "@/server/docs";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ repoSlug: string }> }) {
  const { repoSlug } = await params;
  const config = loadConfig();
  const repo = config.repos.find((candidate) => candidate.slug === repoSlug);
  const user = await getCurrentUser();

  if (!repo) {
    return NextResponse.json({ error: "Repository not found." }, { status: 404 });
  }
  if (!canEditRepo(user)) {
    return NextResponse.json({ error: "Editor role required." }, { status: 403 });
  }
  if (!canUseAi(config, user)) {
    return NextResponse.json({ error: "AI requires an authenticated user." }, { status: 401 });
  }

  const body = (await request.json()) as { path?: string; source?: string; instruction?: string };
  const instruction = body.instruction?.trim();
  if (!instruction) {
    return NextResponse.json({ error: "Instruction is required." }, { status: 400 });
  }

  try {
    const documentPath = validateRelativePath(body.path ?? "", { markdownOnly: true });
    const source = body.source ?? "";
    const editedSource = await requestOpenAiCompatibleEdit(config, makeDocsEditMessages(instruction, source, documentPath), {
      signal: request.signal,
    });
    return NextResponse.json({ source: editedSource });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI edit failed." }, { status: 400 });
  }
}
