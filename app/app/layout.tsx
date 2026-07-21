import { AppShell } from "@/components/app/app-shell";
import { requireAtlasSession } from "@/lib/auth-session";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAtlasSession();
  return <AppShell user={session.user}>{children}</AppShell>;
}
