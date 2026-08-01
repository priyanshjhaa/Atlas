import { SettingsPage } from "@/components/features/workspace";
import { getAtlasWorkspaceData } from "@/lib/workspace-api";

export default async function Page() {
  const { activeWorkspace } = await getAtlasWorkspaceData();
  return <SettingsPage workspace={activeWorkspace} />;
}
