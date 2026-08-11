import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DashboardPage,
  greetingForHour,
} from "@/components/features/dashboard";
import type { AtlasRepository, AtlasWorkspace } from "@/lib/api-types";

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
        jobs={[]}
        graph={null}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Good afternoon, Priyansh.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Atlas Engineering has 1 connected repository, with 1 synchronized for architecture exploration, indexed search, dependency tracing, and source-backed change analysis.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Northstar Labs/i)).not.toBeInTheDocument();
    expect(screen.getByText("atlas/web")).toBeInTheDocument();
  });
});
