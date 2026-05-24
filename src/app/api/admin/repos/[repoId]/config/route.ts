import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireAdmin } from "@/server/auth";
import { AuthenticationRequiredError, AuthorizationError } from "@/server/auth/types";
import { updateSafeRepositoryConfig, ConfigEditError } from "@/server/config";
import { rejectCrossOriginMutation } from "@/server/http/origin";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ repoId: string }> }) {
  const invalidOrigin = rejectCrossOriginMutation(request);
  if (invalidOrigin) return invalidOrigin;

  try {
    await requireAdmin();
    const { repoId } = await context.params;
    const form = await request.formData();
    updateSafeRepositoryConfig({
      id: repoId,
      name: String(form.get("name") ?? ""),
      slug: String(form.get("slug") ?? ""),
      visibility: String(form.get("visibility") ?? "private"),
      defaultBranch: String(form.get("defaultBranch") ?? "main"),
      docsPath: String(form.get("docsPath") ?? "docs"),
      aiEnabled: form.get("aiEnabled") === "on",
      commit: {
        mode: String(form.get("commitMode") ?? "merge-request"),
        targetBranch: String(form.get("targetBranch") ?? "main"),
        branchPrefix: String(form.get("branchPrefix") ?? "legit/"),
      },
    });

    if (request.headers.get("accept")?.includes("text/html")) {
      return NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: "Admin role required." }, { status: 403 });
    }
    if (error instanceof ZodError || error instanceof ConfigEditError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Config update failed." }, { status: 500 });
  }
}
