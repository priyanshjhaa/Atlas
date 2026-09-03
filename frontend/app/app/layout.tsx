import { AppShell } from "@/components/app/app-shell";
import { requireAtlasSession } from "@/lib/auth-session";
import { getAtlasWorkspaceData } from "@/lib/workspace-api";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  await requireAtlasSession();
  const workspaceData = await getAtlasWorkspaceData();
  return <AppShell workspaceData={workspaceData}>{children}</AppShell>;
}
