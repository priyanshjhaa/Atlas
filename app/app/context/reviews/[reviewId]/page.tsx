import { notFound } from "next/navigation";
import { NotionContextPage } from "@/components/features/notion-context";
import {
  getAtlasNotionCatchUp,
  getAtlasNotionDocumentReview,
  getAtlasNotionDocumentReviews,
  getAtlasNotionReviewDocuments,
  getAtlasWorkspaceData,
} from "@/lib/workspace-api";

export default async function Page({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const { activeWorkspace } = await getAtlasWorkspaceData();
  const review = await getAtlasNotionDocumentReview(
    activeWorkspace.id,
    reviewId,
  ).catch(() => null);
  if (!review) notFound();
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
      initialReview={review}
      initialView="review"
    />
  );
}
