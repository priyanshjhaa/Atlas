import { ActivityPage } from "@/components/features/workspace";
import {
  getAtlasSyncJobs,
  getAtlasNotionSyncJobs,
  getAtlasWorkspaceData,
} from "@/lib/workspace-api";

export default async function Page() {
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
    />
  );
}
