import { NotionContextPage } from "@/components/features/notion-context";
import {
  getAtlasNotionCatchUp,
  getAtlasNotionReviewDocuments,
  getAtlasWorkspaceData,
} from "@/lib/workspace-api";

export default async function Page() {
  const { activeWorkspace } = await getAtlasWorkspaceData();
  const [snapshot, reviewDocuments] = await Promise.all([
    getAtlasNotionCatchUp(activeWorkspace.id).catch(() => null),
    getAtlasNotionReviewDocuments(activeWorkspace.id).catch(() => null),
  ]);
  return (
    <NotionContextPage
      workspace={activeWorkspace}
      initialSnapshot={snapshot}
      initialReviewDocuments={reviewDocuments}
    />
  );
}
