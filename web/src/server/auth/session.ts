import { eq } from "drizzle-orm";
import { loadConfig } from "@/server/config";
import { getRuntimeDatabase, users } from "@/server/db";
import { auth } from "./next";
import { canEditRepo, canReadRepo, canUseAi, resolveRoleForAuthenticatedUser } from "./roles";
import { AuthenticationRequiredError, AuthorizationError, type AuthUser } from "./types";

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await auth();
  const sessionUser = session?.user;
  const email = sessionUser?.email;

  if (!sessionUser?.id || !email) {
    return null;
  }

  const { db } = getRuntimeDatabase();
  const persisted = db.select().from(users).where(eq(users.id, sessionUser.id)).get();

  return {
    id: sessionUser.id,
    email,
    name: sessionUser.name,
    image: sessionUser.image,
    role: persisted?.role ?? sessionUser.role ?? "viewer",
  };
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthenticationRequiredError();
  }

  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();

  if (user.role !== "admin") {
    throw new AuthorizationError("Admin role required.");
  }

  return user;
}

export async function syncUserRoleFromConfig(userId: string, email: string): Promise<void> {
  const { db } = getRuntimeDatabase();
  const role = resolveRoleForAuthenticatedUser(db, userId, email, loadConfig());

  db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId)).run();
}

export { canEditRepo, canReadRepo, canUseAi };
