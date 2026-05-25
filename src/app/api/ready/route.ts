import fs from "node:fs";
import { NextResponse } from "next/server";
import { resolveConfigPath } from "@/server/config";
import { getRuntimeDatabase } from "@/server/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const configPath = resolveConfigPath();
    fs.accessSync(configPath, fs.constants.R_OK);
    getRuntimeDatabase().db.run("select 1");

    return NextResponse.json({ ok: true, status: "ready", timestamp: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "not-ready",
        error: error instanceof Error ? error.message : "readiness check failed",
      },
      { status: 503 },
    );
  }
}
