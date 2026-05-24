import { AppShell } from "@/components/AppShell";
import { loadConfigForShell } from "@/server/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  const config = loadConfigForShell();
  const user = config ? await import("@/server/auth").then(({ getCurrentUser }) => getCurrentUser()) : null;

  return <AppShell config={config} user={user} />;
}
