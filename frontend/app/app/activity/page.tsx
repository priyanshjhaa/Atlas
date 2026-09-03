import { ActivityPage } from "@/components/features/workspace";
import {
  getAtlasSyncJobs,
  getAtlasNotionSyncJobs,
  getAtlasWorkspaceData,
} from "@/lib/workspace-api";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const requestedSource = (await searchParams).source;
  const initialSource = requestedSource === "github" || requestedSource === "notion"
    ? requestedSource
    : "all";
  const { activeWorkspace } = await getAtlasWorkspaceData();
  const [jobs, notionJobs] = await Promise.all([
    getAtlasSyncJobs(activeWorkspace.id),
    getAtlasNotionSyncJobs(activeWorkspace.id),
  ]);
  return (
    <ActivityPage
      initialJobs={jobs}
      initialNotionJobs={notionJobs}
      workspace={activeWorkspace}
      initialSource={initialSource}
    />
  );
}
