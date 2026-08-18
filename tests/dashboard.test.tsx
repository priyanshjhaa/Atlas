import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DashboardPage,
  greetingForHour,
} from "@/components/features/dashboard";
import type { AtlasRepository, AtlasWorkspace, AtlasWorkspaceOverview } from "@/lib/api-types";

vi.mock("@/components/atlas-graph", () => ({
  AtlasGraph: () => <div data-testid="live-graph" />,
}));

const workspace: AtlasWorkspace = {
  id: "workspace-1",
  name: "Atlas Engineering",
  slug: "atlas-engineering",
  role: "owner",
  repositoryCount: 1,
  onboardingCompletedAt: new Date().toISOString(),
};

const repositories: AtlasRepository[] = [
  {
    id: "repository-1",
    owner: "atlas",
    name: "web",
    defaultBranch: "main",
    isPrivate: true,
    isActive: true,
    lastSyncedAt: "2026-08-01T09:00:00.000Z",
  },
];

const overview: AtlasWorkspaceOverview = {
  generatedAt: "2026-08-01T10:00:00.000Z",
  staleAfterHours: 24,
  readiness: {
    overall: "ready",
    github: { status: "ready", repositoriesConnected: 1, repositoriesReady: 1, lastSyncedAt: "2026-08-01T09:00:00.000Z" },
    notion: { status: "skipped", resourcesSelected: 0, documentsIndexed: 0, lastSyncedAt: null },
  },
  jobs: { active: 0, failed: 0 },
  intelligence: { repositoriesIndexed: 1, codeFiles: 14, codeChunks: 28, relationships: 7, notionDocuments: 0, notionChunks: 0 },
  recentReports: [],
  attention: [{ id: "connect-notion", severity: "info", title: "Add decisions and documentation", detail: "Connect Notion for richer context.", action: { label: "Connect Notion", href: "/app/sources" } }],
};

describe("DashboardPage", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("selects the greeting from the current local hour", () => {
    expect(greetingForHour(8)).toBe("Good morning");
    expect(greetingForHour(15)).toBe("Good afternoon");
    expect(greetingForHour(21)).toBe("Good evening");
  });

  it("renders authenticated workspace data instead of organization fixtures", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 1, 15, 0, 0));

    render(
      <DashboardPage
        userName="Priyansh Jha"
        workspace={workspace}
        repositories={repositories}
        overview={overview}
        graph={null}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Good afternoon, Priyansh.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Your current context is ready for a source-backed change analysis."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Northstar Labs/i)).not.toBeInTheDocument();
    expect(screen.getByText("atlas/web")).toBeInTheDocument();
    expect(screen.getByText("Ready for analysis")).toBeInTheDocument();
    expect(screen.getByText("Optional · not connected")).toBeInTheDocument();
  });
});
