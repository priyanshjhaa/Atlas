import { NotionContextPage } from "@/components/features/notion-context";
import {
  getAtlasNotionCatchUp,
  getAtlasNotionReviewDocuments,
  getAtlasNotionDocumentReviews,
  getAtlasWorkspaceData,
} from "@/lib/workspace-api";

export default async function Page() {
  const { activeWorkspace } = await getAtlasWorkspaceData();
  const [snapshot, reviewDocuments, savedReviews] = await Promise.all([
    getAtlasNotionCatchUp(activeWorkspace.id).catch(() => null),
    getAtlasNotionReviewDocuments(activeWorkspace.id).catch(() => null),
    getAtlasNotionDocumentReviews(activeWorkspace.id).catch(() => []),
  ]);
  return (
    <NotionContextPage
      workspace={activeWorkspace}
      initialSnapshot={snapshot}
      initialReviewDocuments={reviewDocuments}
      initialSavedReviews={savedReviews}
    />
  );
}
