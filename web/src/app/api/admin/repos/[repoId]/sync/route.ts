import { NextResponse } from "next/server";
import { requestManualRepoSync } from "@/server/sync";
import { AuthenticationRequiredError, AuthorizationError } from "@/server/auth/types";

export const runtime = "nodejs";

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function wantsHtml(request: Request): boolean {
  return request.headers.get("accept")?.includes("text/html") ?? false;
}

function adminRedirect(request: Request) {
  return NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
}

export async function POST(request: Request, context: { params: Promise<{ repoId: string }> }) {
  const { repoId } = await context.params;
  const requestId = crypto.randomUUID();
  const html = wantsHtml(request);

  if (!isSameOrigin(request)) {
    if (html) {
      return adminRedirect(request);
    }

    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const result = await requestManualRepoSync(repoId);
    if (html) {
      return adminRedirect(request);
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      if (html) {
        return NextResponse.redirect(new URL("/api/auth/signin", request.url), { status: 303 });
      }

      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (error instanceof AuthorizationError) {
      if (html) {
        return adminRedirect(request);
      }

      return NextResponse.json({ error: "Admin role required." }, { status: 403 });
    }

    console.error("Manual repository sync failed", {
      requestId,
      repoId,
      error: error instanceof Error ? error.message : String(error),
    });
    if (html) {
      return adminRedirect(request);
    }

    return NextResponse.json({ error: "Sync failed.", requestId }, { status: 500 });
  }
}
