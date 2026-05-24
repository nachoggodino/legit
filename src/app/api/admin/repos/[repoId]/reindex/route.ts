import { NextResponse } from "next/server";
import { AuthenticationRequiredError, AuthorizationError } from "@/server/auth/types";
import { rejectCrossOriginMutation } from "@/server/http/origin";
import { requestManualRepoReindex } from "@/server/sync";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ repoId: string }> }) {
  const invalidOrigin = rejectCrossOriginMutation(request);
  if (invalidOrigin) return invalidOrigin;

  const { repoId } = await context.params;
  try {
    const result = await requestManualRepoReindex(repoId);
    if (request.headers.get("accept")?.includes("text/html")) {
      return NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: "Admin role required." }, { status: 403 });
    }
    return NextResponse.json({ error: "Reindex failed." }, { status: 500 });
  }
}
