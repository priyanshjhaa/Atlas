import { SourcesPage } from "@/components/features/workspace";
import {
  getAtlasGitHubConnectors,
  getAtlasNotionConnectors,
  getAtlasNotionResources,
  getAtlasWorkspaceData,
} from "@/lib/workspace-api";

export default async function Page() {
  const { activeWorkspace, repositories } = await getAtlasWorkspaceData();
  const githubConnectors = await getAtlasGitHubConnectors(activeWorkspace.id);
  const [notionConnectors, notionResources] = await Promise.all([
    getAtlasNotionConnectors(activeWorkspace.id),
    getAtlasNotionResources(activeWorkspace.id),
  ]);
  return (
    <SourcesPage
      githubConnectors={githubConnectors}
      notionConnectors={notionConnectors}
      notionResources={notionResources}
      repositories={repositories}
      workspace={activeWorkspace}
    />
  );
}
