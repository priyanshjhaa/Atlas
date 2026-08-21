import { ArchitecturePage } from "@/components/features/explore";
import {
  getAtlasArchitecture,
  getAtlasWorkspaceData,
} from "@/lib/workspace-api";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { activeWorkspace, repositories } =
    await getAtlasWorkspaceData();
  const params = await searchParams;
  const availableRepositories = repositories.filter(
    (item) => item.isActive && item.lastSyncedAt,
  );
  const repository =
    availableRepositories.find((item) => item.id === first(params.repository)) ??
    availableRepositories[0];
  const architectureSnapshot = repository
    ? await getAtlasArchitecture(activeWorkspace.id, repository.id).catch(
        () => null,
      )
    : null;
  return (
    <ArchitecturePage
      key={`${repository?.id ?? "empty"}:${architectureSnapshot?.id ?? "snapshot"}`}
      workspace={activeWorkspace}
      repositories={repositories}
      selectedRepositoryId={repository?.id ?? ""}
      architectureSnapshot={architectureSnapshot}
    />
  );
}
