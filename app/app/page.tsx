import { DashboardPage } from "@/components/features/dashboard";
import {
  getAtlasGraph,
  getAtlasSyncJobs,
  getAtlasWorkspaceData,
} from "@/lib/workspace-api";

export default async function Page() {
  const { me, activeWorkspace, repositories } =
    await getAtlasWorkspaceData();
  const graphRepository = repositories.find(
    (repository) => repository.isActive && repository.lastSyncedAt,
  );
  const [jobs, graph] = await Promise.all([
    getAtlasSyncJobs(activeWorkspace.id),
    graphRepository
      ? getAtlasGraph(activeWorkspace.id, graphRepository.id).catch(() => null)
      : Promise.resolve(null),
  ]);
  return (
    <DashboardPage
      userName={me.user.name}
      workspace={activeWorkspace}
      repositories={repositories}
      jobs={jobs}
      graph={graph}
    />
  );
}
