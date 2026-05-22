import fs from "node:fs";
import { NextResponse } from "next/server";
import { canReadRepo, getCurrentUser } from "@/server/auth";
import { loadConfig } from "@/server/config";
import { resolveDocumentPath } from "@/server/docs";

export const runtime = "nodejs";

const contentTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export async function GET(request: Request, { params }: { params: Promise<{ repoSlug: string }> }) {
  const { repoSlug } = await params;
  const config = loadConfig();
  const repo = config.repos.find((candidate) => candidate.slug === repoSlug);
  const user = await getCurrentUser();

  if (!repo) return NextResponse.json({ error: "Repository not found." }, { status: 404 });
  if (!canReadRepo(repo, user)) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const assetPath = new URL(request.url).searchParams.get("path") ?? "";
  let resolved;
  try {
    resolved = resolveDocumentPath(repo, assetPath, { markdownOnly: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid asset path." }, { status: 400 });
  }
  if (!fs.existsSync(resolved.absolutePath) || !fs.statSync(resolved.absolutePath).isFile()) {
    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }

  const extension = resolved.absolutePath.slice(resolved.absolutePath.lastIndexOf(".")).toLowerCase();
  return new Response(fs.readFileSync(resolved.absolutePath), {
    headers: {
      "content-type": contentTypes[extension] ?? "application/octet-stream",
    },
  });
}
