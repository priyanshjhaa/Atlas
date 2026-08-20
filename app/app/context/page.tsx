import { NotionContextPage } from "@/components/features/notion-context";
import {
  getAtlasNotionCatchUp,
  getAtlasWorkspaceData,
} from "@/lib/workspace-api";

export default async function Page() {
  const { activeWorkspace } = await getAtlasWorkspaceData();
  const snapshot = await getAtlasNotionCatchUp(activeWorkspace.id).catch(
    () => null,
  );
  return <NotionContextPage workspace={activeWorkspace} initialSnapshot={snapshot} />;
}
