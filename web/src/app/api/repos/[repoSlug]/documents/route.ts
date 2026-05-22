import { NextResponse } from "next/server";
import { canEditRepo, canReadRepo } from "@/server/auth";
import {
  deleteMarkdownDocument,
  readMarkdownDocument,
  renameMarkdownDocument,
  scanLinkImpact,
  writeMarkdownDocument,
} from "@/server/docs";
import { rejectCrossOriginMutation } from "@/server/http/origin";
import { resolveRepoRequest } from "@/server/repos/request";

export const runtime = "nodejs";

function asBadRequest(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed." }, { status: 400 });
}

export async function GET(request: Request, { params }: { params: Promise<{ repoSlug: string }> }) {
  const { repoSlug } = await params;
  const { repo, user } = await resolveRepoRequest(repoSlug);
  if (!repo) return NextResponse.json({ error: "Repository not found." }, { status: 404 });
  if (!canReadRepo(repo, user)) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const documentPath = new URL(request.url).searchParams.get("path") ?? "";
  try {
    const document = readMarkdownDocument(repo, documentPath);
    return NextResponse.json(document);
  } catch (error) {
    return asBadRequest(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ repoSlug: string }> }) {
  const invalidOrigin = rejectCrossOriginMutation(request);
  if (invalidOrigin) return invalidOrigin;

  const { repoSlug } = await params;
  const { repo, user } = await resolveRepoRequest(repoSlug);
  if (!repo) return NextResponse.json({ error: "Repository not found." }, { status: 404 });
  if (!canEditRepo(user)) return NextResponse.json({ error: "Editor role required." }, { status: 403 });
  const actorId = user?.id ?? null;

  const body = (await request.json()) as { path?: string; source?: string };
  try {
    const result = await writeMarkdownDocument(repo, body.path ?? "", body.source ?? "", {
      create: true,
      actorId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return asBadRequest(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ repoSlug: string }> }) {
  const invalidOrigin = rejectCrossOriginMutation(request);
  if (invalidOrigin) return invalidOrigin;

  const { repoSlug } = await params;
  const { repo, user } = await resolveRepoRequest(repoSlug);
  if (!repo) return NextResponse.json({ error: "Repository not found." }, { status: 404 });
  if (!canEditRepo(user)) return NextResponse.json({ error: "Editor role required." }, { status: 403 });
  const actorId = user?.id ?? null;

  const body = (await request.json()) as { path?: string; source?: string };
  try {
    const result = await writeMarkdownDocument(repo, body.path ?? "", body.source ?? "", { actorId });
    return NextResponse.json(result);
  } catch (error) {
    return asBadRequest(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ repoSlug: string }> }) {
  const invalidOrigin = rejectCrossOriginMutation(request);
  if (invalidOrigin) return invalidOrigin;

  const { repoSlug } = await params;
  const { repo, user } = await resolveRepoRequest(repoSlug);
  if (!repo) return NextResponse.json({ error: "Repository not found." }, { status: 404 });
  if (!canEditRepo(user)) return NextResponse.json({ error: "Editor role required." }, { status: 403 });
  const actorId = user?.id ?? null;

  const body = (await request.json()) as { fromPath?: string; toPath?: string; confirmed?: boolean; scanOnly?: boolean };
  if (body.scanOnly) {
    try {
      return NextResponse.json({ impacts: await scanLinkImpact(repo, body.fromPath ?? "") });
    } catch (error) {
      return asBadRequest(error);
    }
  }
  try {
    const result = await renameMarkdownDocument(repo, body.fromPath ?? "", body.toPath ?? "", {
      actorId,
      confirmed: body.confirmed,
    });
    return NextResponse.json(result);
  } catch (error) {
    return asBadRequest(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ repoSlug: string }> }) {
  const invalidOrigin = rejectCrossOriginMutation(request);
  if (invalidOrigin) return invalidOrigin;

  const { repoSlug } = await params;
  const { repo, user } = await resolveRepoRequest(repoSlug);
  if (!repo) return NextResponse.json({ error: "Repository not found." }, { status: 404 });
  if (!canEditRepo(user)) return NextResponse.json({ error: "Editor role required." }, { status: 403 });
  const actorId = user?.id ?? null;

  const body = (await request.json()) as { path?: string; confirmed?: boolean; scanOnly?: boolean };
  if (body.scanOnly) {
    try {
      return NextResponse.json({ impacts: await scanLinkImpact(repo, body.path ?? "") });
    } catch (error) {
      return asBadRequest(error);
    }
  }
  try {
    const result = await deleteMarkdownDocument(repo, body.path ?? "", { actorId, confirmed: body.confirmed });
    return NextResponse.json(result);
  } catch (error) {
    return asBadRequest(error);
  }
}
