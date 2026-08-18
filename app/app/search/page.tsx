import { SearchPage } from "@/components/features/explore";
import { getAtlasWorkspaceData } from "@/lib/workspace-api";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const requestedSource = (await searchParams).source;
  const initialScope = requestedSource === "github" || requestedSource === "notion"
    ? requestedSource
    : "all";
  const { activeWorkspace, repositories } =
    await getAtlasWorkspaceData();
  return (
    <SearchPage
      workspace={activeWorkspace}
      repositories={repositories}
      initialScope={initialScope}
    />
  );
}
