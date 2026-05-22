import fs from "node:fs";
import { NextResponse } from "next/server";
import { canReadRepo } from "@/server/auth";
import { resolveDocumentPath } from "@/server/docs";
import { resolveRepoRequest } from "@/server/repos/request";

export const runtime = "nodejs";

const contentTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function GET(request: Request, { params }: { params: Promise<{ repoSlug: string }> }) {
  const { repoSlug } = await params;
  const { repo, user } = await resolveRepoRequest(repoSlug);

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
  const contentType = contentTypes[extension];
  if (!contentType) {
    return NextResponse.json({ error: "Unsupported asset type." }, { status: 415 });
  }

  return new Response(fs.readFileSync(resolved.absolutePath), {
    headers: {
      "content-type": contentType,
    },
  });
}
