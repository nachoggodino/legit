import { NextResponse } from "next/server";
import { canEditRepo, canReadRepo, getCurrentUser } from "@/server/auth";
import { loadConfig } from "@/server/config";
import {
  deleteMarkdownDocument,
  readMarkdownDocument,
  renameMarkdownDocument,
  scanLinkImpact,
  writeMarkdownDocument,
} from "@/server/docs";

export const runtime = "nodejs";

async function resolveRequest(repoSlug: string) {
  const config = loadConfig();
  const repo = config.repos.find((candidate) => candidate.slug === repoSlug);
  const user = await getCurrentUser();
  return { repo, user };
}

function asBadRequest(error: unknown) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Request failed." }, { status: 400 });
}

export async function GET(request: Request, { params }: { params: Promise<{ repoSlug: string }> }) {
  const { repoSlug } = await params;
  const { repo, user } = await resolveRequest(repoSlug);
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
  const { repoSlug } = await params;
  const { repo, user } = await resolveRequest(repoSlug);
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
  const { repoSlug } = await params;
  const { repo, user } = await resolveRequest(repoSlug);
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
  const { repoSlug } = await params;
  const { repo, user } = await resolveRequest(repoSlug);
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
  const { repoSlug } = await params;
  const { repo, user } = await resolveRequest(repoSlug);
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
