import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetRuntimeDatabaseForTests } from "@/server/db/client";
import { auditEvents, getRuntimeDatabase, users } from "@/server/db";
import { grantUserRoleByEmail, updateUserRole } from "@/server/admin/users";

describe("admin users", () => {
  let originalPath: string | undefined;
  let dbPath: string;

  beforeEach(() => {
    resetRuntimeDatabaseForTests();
    originalPath = process.env.LEGIT_DATABASE_PATH;
    dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "legit-admin-users-")), "legit.db");
    process.env.LEGIT_DATABASE_PATH = dbPath;
  });

  afterEach(() => {
    resetRuntimeDatabaseForTests();
    if (originalPath === undefined) {
      delete process.env.LEGIT_DATABASE_PATH;
    } else {
      process.env.LEGIT_DATABASE_PATH = originalPath;
    }
  });

  it("updates a user role and records an audit event", async () => {
    const { db } = getRuntimeDatabase();
    db.insert(users).values({
      id: "u1",
      email: "editor@example.com",
      role: "viewer",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).run();

    await updateUserRole("u1", "editor", "admin-1");
    const updated = db.select({ role: users.role }).from(users).where(eq(users.id, "u1")).get();
    const event = db.select().from(auditEvents).where(eq(auditEvents.operation, "admin.user.role.update")).get();

    expect(updated?.role).toBe("editor");
    expect(event?.actorId).toBe("admin-1");
  });

  it("grants a role by email before first sign-in", async () => {
    const { db } = getRuntimeDatabase();
    const result = await grantUserRoleByEmail("new.user@example.com", "editor", "admin-1");
    const created = db.select().from(users).where(eq(users.id, result.userId)).get();

    expect(result.created).toBe(true);
    expect(created?.email).toBe("new.user@example.com");
    expect(created?.role).toBe("editor");
  });

  it("updates an existing user when granting by email", async () => {
    const { db } = getRuntimeDatabase();
    db.insert(users).values({
      id: "u2",
      email: "existing@example.com",
      role: "viewer",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).run();

    const result = await grantUserRoleByEmail(" Existing@Example.com ", "admin", "admin-1");
    const updated = db.select({ role: users.role }).from(users).where(eq(users.id, "u2")).get();
    const event = db.select().from(auditEvents).where(eq(auditEvents.operation, "admin.user.role.grant-email")).get();

    expect(result).toEqual({ userId: "u2", created: false });
    expect(updated?.role).toBe("admin");
    expect(event?.metadata).toMatchObject({
      previousRole: "viewer",
      nextRole: "admin",
      created: false,
    });
  });

  it("rejects invalid roles, missing users, and invalid email grants", async () => {
    await expect(updateUserRole("missing", "owner", "admin-1")).rejects.toThrow("Invalid role.");
    await expect(updateUserRole("missing", "viewer", "admin-1")).rejects.toThrow("User not found.");
    await expect(grantUserRoleByEmail("not-an-email", "viewer", "admin-1")).rejects.toThrow("Invalid email.");
    await expect(grantUserRoleByEmail("valid@example.com", "owner", "admin-1")).rejects.toThrow("Invalid role.");
  });
});
