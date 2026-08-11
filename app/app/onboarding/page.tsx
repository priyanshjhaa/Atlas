import { redirect } from "next/navigation";
import { OnboardingPage } from "@/components/features/onboarding";
import {
  getAtlasGitHubConnectors,
  getAtlasNotionConnectors,
  getAtlasNotionResources,
  getAtlasNotionSyncJobs,
  getAtlasSyncJobs,
  getAtlasWorkspaceData,
} from "@/lib/workspace-api";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ github?: string; notion?: string }>;
}) {
  const { activeWorkspace, repositories } = await getAtlasWorkspaceData();
  if (
    activeWorkspace.onboardingCompletedAt ||
    !["owner", "admin"].includes(activeWorkspace.role)
  ) {
    redirect("/app");
  }

  const [
    githubConnectors,
    notionConnectors,
    notionResources,
    githubJobs,
    notionJobs,
    result,
  ] = await Promise.all([
    getAtlasGitHubConnectors(activeWorkspace.id).catch(() => []),
    getAtlasNotionConnectors(activeWorkspace.id).catch(() => []),
    getAtlasNotionResources(activeWorkspace.id).catch(() => []),
    getAtlasSyncJobs(activeWorkspace.id).catch(() => []),
    getAtlasNotionSyncJobs(activeWorkspace.id).catch(() => []),
    searchParams,
  ]);

  return (
    <OnboardingPage
      workspace={activeWorkspace}
      repositories={repositories}
      githubConnectors={githubConnectors}
      notionConnectors={notionConnectors}
      notionResources={notionResources}
      githubJobs={githubJobs}
      notionJobs={notionJobs}
      githubConfigured={Boolean(process.env.GITHUB_APP_SLUG)}
      notionConfigured={Boolean(process.env.NOTION_CLIENT_ID)}
      result={{ github: result.github, notion: result.notion }}
    />
  );
}
