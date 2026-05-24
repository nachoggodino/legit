import { eq } from "drizzle-orm";
import { ROLES, type Role } from "@/server/auth/types";
import { getRuntimeDatabase, users } from "@/server/db";

export class AdminUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminUserError";
  }
}

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

export function updateUserRole(userId: string, role: unknown): void {
  if (!isRole(role)) {
    throw new AdminUserError("Invalid role.");
  }

  getRuntimeDatabase().db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId)).run();
}
