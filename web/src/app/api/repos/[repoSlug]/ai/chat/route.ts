import { NextResponse } from "next/server";
import { canReadRepo, canUseAi } from "@/server/auth";
import { buildDocsChatContext, makeDocsChatMessages, streamOpenAiCompatibleChat } from "@/server/ai";
import { resolveRepoRequest } from "@/server/repos/request";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ repoSlug: string }> }) {
  const { repoSlug } = await params;
  const { config, repo, user } = await resolveRepoRequest(repoSlug);

  if (!repo) {
    return NextResponse.json({ error: "Repository not found." }, { status: 404 });
  }
  if (!canReadRepo(repo, user)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!canUseAi(config, user)) {
    return NextResponse.json({ error: "AI requires an authenticated user." }, { status: 401 });
  }

  const body = (await request.json()) as { question?: string };
  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ error: "Question is required." }, { status: 400 });
  }

  const context = await buildDocsChatContext(repo, question, { maxContextTokens: config.ai.maxContextTokens });
  const upstream = await streamOpenAiCompatibleChat(config, makeDocsChatMessages(question, context), {
    signal: request.signal,
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
