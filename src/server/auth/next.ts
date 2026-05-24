import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import { loadConfig } from "@/server/config";
import { accounts, authenticators, getRuntimeDatabase, sessions, users, verificationTokens } from "@/server/db";
import { isRole, resolveRoleForAuthenticatedUser } from "./roles";
import { buildAuthProviders } from "./providers";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(getRuntimeDatabase().db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
    authenticatorsTable: authenticators,
  }),
  session: {
    strategy: "database",
  },
  providers: buildAuthProviders(),
  callbacks: {
    async signIn({ user }) {
      if (user.id && user.email) {
        const db = getRuntimeDatabase().db;
        const role = resolveRoleForAuthenticatedUser(db, user.id, user.email, loadConfig());
        db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, user.id)).run();
      }

      return true;
    },
    async session({ session, user }) {
      if (session.user && user) {
        session.user.id = user.id;
        session.user.role = isRole(user.role) ? user.role : "viewer";
      }

      return session;
    },
  },
});
