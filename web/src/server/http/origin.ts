import { NextResponse } from "next/server";

export function isSameOriginRequest(request: Request): boolean {
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

export function rejectCrossOriginMutation(request: Request): NextResponse | null {
  if (isSameOriginRequest(request)) {
    return null;
  }

  return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
}
