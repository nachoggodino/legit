import { NextResponse } from "next/server";
import { renderMarkdown } from "@/server/markdown";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { source?: string; path?: string; repoSlug?: string };
  const rendered = renderMarkdown(body.source ?? "", {
    currentPath: body.path || "index.md",
    repoSlug: body.repoSlug,
  });
  return NextResponse.json({ html: rendered.html, headings: rendered.headings, frontmatter: rendered.frontmatter });
}
