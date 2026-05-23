import { NextResponse } from "next/server";
import { AdminUserError, updateUserRole } from "@/server/admin/users";
import { requireAdmin } from "@/server/auth";
import { AuthenticationRequiredError, AuthorizationError } from "@/server/auth/types";
import { rejectCrossOriginMutation } from "@/server/http/origin";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  const invalidOrigin = rejectCrossOriginMutation(request);
  if (invalidOrigin) return invalidOrigin;

  try {
    await requireAdmin();
    const { userId } = await context.params;
    const form = await request.formData();
    const role = String(form.get("role") ?? "");
    updateUserRole(userId, role);
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
    if (error instanceof AdminUserError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Role update failed." }, { status: 500 });
  }
}
