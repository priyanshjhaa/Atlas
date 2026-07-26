import { ActivityPage } from "@/components/features/workspace";
import {
  getAtlasSyncJobs,
  getAtlasWorkspaceData,
} from "@/lib/workspace-api";

export default async function Page() {
  const { activeWorkspace } = await getAtlasWorkspaceData();
  const jobs = await getAtlasSyncJobs(activeWorkspace.id);
  return <ActivityPage initialJobs={jobs} workspace={activeWorkspace} />;
}
