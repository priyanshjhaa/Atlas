import { SettingsPage } from "@/components/features/settings";
import {
  getAtlasWorkspaceData,
  getAtlasWorkspaceMembers,
} from "@/lib/workspace-api";

export default async function Page() {
  const { activeWorkspace, me } = await getAtlasWorkspaceData();
  const members = await getAtlasWorkspaceMembers(activeWorkspace.id);
  return (
    <SettingsPage
      currentUser={me.user}
      initialMembers={members}
      workspace={activeWorkspace}
    />
  );
}
