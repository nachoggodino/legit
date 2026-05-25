import { eq } from "drizzle-orm";
import { ROLES, type Role } from "@/server/auth/types";
import { getRuntimeDatabase, users } from "@/server/db";
import { recordAuditEvent } from "@/server/audit";
import { normalizeEmail } from "@/server/auth/roles";

export class AdminUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminUserError";
  }
}

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

export async function updateUserRole(userId: string, role: unknown, actorId?: string | null): Promise<void> {
  if (!isRole(role)) {
    throw new AdminUserError("Invalid role.");
  }

  const { db } = getRuntimeDatabase();
  const existing = db.select({ role: users.role, email: users.email }).from(users).where(eq(users.id, userId)).get();
  if (!existing) {
    throw new AdminUserError("User not found.");
  }

  db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId)).run();
  await recordAuditEvent({
    actorId: actorId ?? null,
    repoId: null,
    operation: "admin.user.role.update",
    metadata: {
      userId,
      userEmail: existing.email,
      previousRole: existing.role,
      nextRole: role,
    },
    createdAt: new Date(),
  });
}

export async function grantUserRoleByEmail(email: string, role: unknown, actorId?: string | null): Promise<{ userId: string; created: boolean }> {
  if (!isRole(role)) {
    throw new AdminUserError("Invalid role.");
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new AdminUserError("Invalid email.");
  }

  const { db } = getRuntimeDatabase();
  const existing = db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, normalizedEmail)).get();
  const now = new Date();

  if (existing) {
    db.update(users).set({ role, updatedAt: now }).where(eq(users.id, existing.id)).run();
    await recordAuditEvent({
      actorId: actorId ?? null,
      repoId: null,
      operation: "admin.user.role.grant-email",
      metadata: {
        userId: existing.id,
        userEmail: normalizedEmail,
        previousRole: existing.role,
        nextRole: role,
        created: false,
      },
      createdAt: now,
    });
    return { userId: existing.id, created: false };
  }

  const userId = crypto.randomUUID();
  db.insert(users).values({
    id: userId,
    email: normalizedEmail,
    role,
    createdAt: now,
    updatedAt: now,
  }).run();

  await recordAuditEvent({
    actorId: actorId ?? null,
    repoId: null,
    operation: "admin.user.role.grant-email",
    metadata: {
      userId,
      userEmail: normalizedEmail,
      previousRole: null,
      nextRole: role,
      created: true,
    },
    createdAt: now,
  });

  return { userId, created: true };
}
