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
  streams: {
    github: [{ id: "github-job-1", status: "completed", title: "atlas/web", summary: "14 files and 7 relationships indexed", occurredAt: "2026-08-01T09:00:00.000Z" }],
    notion: [],
  },
  recentReports: [],
  recentPullRequests: [
    {
      id: "pull-request-42",
      repository: "atlas/web",
      number: 42,
      title: "Add provenance",
      url: "https://github.com/atlas/web/pull/42",
      state: "MERGED",
      isDraft: false,
      author: {
        providerUserId: "U_author",
        login: "engineer",
        displayName: "Atlas Engineer",
        avatarUrl: null,
        profileUrl: "https://github.com/engineer",
        kind: "person",
      },
      reviewers: [
        {
          actor: {
            providerUserId: "U_reviewer",
            login: "reviewer",
            displayName: null,
            avatarUrl: null,
            profileUrl: "https://github.com/reviewer",
            kind: "person",
          },
          state: "APPROVED",
          url: "https://github.com/atlas/web/pull/42#pullrequestreview-1",
        },
      ],
      mergedBy: {
        providerUserId: "U_maintainer",
        login: "maintainer",
        displayName: null,
        avatarUrl: null,
        profileUrl: "https://github.com/maintainer",
        kind: "person",
      },
      reviewsTruncated: false,
      updatedAt: "2026-08-01T09:30:00.000Z",
    },
  ],
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
    expect(screen.getAllByText("atlas/web")).not.toHaveLength(0);
    expect(screen.getAllByText("Ready for analysis")).not.toHaveLength(0);
    expect(screen.getAllByText("Optional · not connected")).not.toHaveLength(0);
    expect(screen.getByRole("heading", { name: "GitHub changes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /PR #42 — Add provenance/ })).toHaveAttribute("href", "https://github.com/atlas/web/pull/42");
    expect(screen.getByText(/opened by Atlas Engineer · reviewed by reviewer · merged by maintainer/i)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Notion changes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Review GitHub activity/ })).toHaveAttribute("href", "/app/activity?source=github");
    expect(screen.getByRole("link", { name: /Review Notion activity/ })).toHaveAttribute("href", "/app/activity?source=notion");
    expect(screen.getByRole("link", { name: /Search documentation/ })).toHaveAttribute("href", "/app/search?source=notion");
  });

  it("puts corrective source actions ahead of secondary graph exploration", () => {
    render(
      <DashboardPage
        userName="Priyansh Jha"
        workspace={workspace}
        repositories={[]}
        overview={{
          ...overview,
          readiness: {
            overall: "needs_setup",
            github: { status: "disconnected", repositoriesConnected: 0, repositoriesReady: 0, lastSyncedAt: null },
            notion: { status: "skipped", resourcesSelected: 0, documentsIndexed: 0, lastSyncedAt: null },
          },
          intelligence: { repositoriesIndexed: 0, codeFiles: 0, codeChunks: 0, relationships: 0, notionDocuments: 0, notionChunks: 0 },
          attention: [
            { id: "connect-github", severity: "warning", title: "Connect a GitHub repository", detail: "Atlas needs synchronized code.", action: { label: "Connect GitHub", href: "/app/sources" } },
            { id: "connect-notion", severity: "info", title: "Add decisions and documentation", detail: "Connect Notion for cited context.", action: { label: "Connect Notion", href: "/app/sources" } },
          ],
        }}
        graph={null}
      />,
    );

    expect(screen.getByText("Connect a GitHub repository")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Connect GitHub/ })).toHaveAttribute("href", "/app/sources");
    expect(screen.getByText("No impact reports yet")).toBeInTheDocument();
    expect(screen.getByText("Connected architecture graph")).toBeInTheDocument();
  });

  it("shows recent report risk and unknowns with direct report links", () => {
    render(
      <DashboardPage
        userName="Priyansh Jha"
        workspace={workspace}
        repositories={repositories}
        overview={{
          ...overview,
          attention: [],
          recentReports: [
            {
              id: "report-1",
              title: "Replace persistent session tokens",
              status: "complete",
              riskLevel: "high",
              riskScore: 84,
              unknownCount: 2,
              repository: { id: "repository-1", owner: "atlas", name: "web" },
              createdAt: "2026-08-01T09:30:00.000Z",
            },
          ],
        }}
        graph={null}
      />,
    );

    expect(screen.getByText("No source issues detected")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Replace persistent session tokens/ })).toHaveAttribute("href", "/app/impact/report-1");
    expect(screen.getByText("atlas/web · 2 unknowns")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
  });
});
