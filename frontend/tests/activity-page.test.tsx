import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityPage } from "@/components/features/workspace";
import type { AtlasSyncJob, AtlasWorkspace } from "@/lib/api-types";

const workspace: AtlasWorkspace = {
  id: "workspace-1",
  name: "Atlas Engineering",
  slug: "atlas-engineering",
  role: "owner",
  repositoryCount: 1,
  onboardingCompletedAt: "2026-08-01T00:00:00.000Z",
};

const queuedJob: AtlasSyncJob = {
  id: "job-1",
  repositoryId: "repository-1",
  repositoryOwner: "atlas",
  repositoryName: "web",
  status: "queued",
  attempt: 0,
  progress: 0,
  stage: "queued",
  result: null,
  errorCode: null,
  errorMessage: null,
  cancelRequestedAt: null,
  startedAt: null,
  completedAt: null,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
};

const completedJob: AtlasSyncJob = {
  ...queuedJob,
  status: "completed",
  attempt: 1,
  progress: 100,
  stage: "no_change",
  result: { outcome: "no_change" },
  startedAt: "2026-08-01T10:00:00.000Z",
  completedAt: "2026-08-01T10:00:01.000Z",
  updatedAt: "2026-08-01T10:00:01.000Z",
};

describe("ActivityPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders an explicit idle state instead of zero-percent progress", () => {
    render(
      <ActivityPage
        initialJobs={[completedJob]}
        initialNotionJobs={[]}
        workspace={workspace}
      />,
    );

    expect(screen.getByRole("heading", { name: "No active jobs" })).toBeVisible();
    expect(screen.getByText("Idle")).toBeVisible();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("clears the submission notice when refreshed jobs are idle", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      if (init?.method === "POST") {
        return new Response(
          JSON.stringify(url === "/api/sync-jobs" ? [queuedJob] : []),
          { status: 202, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify(url.startsWith("/api/sync-jobs?") ? [completedJob] : []),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ActivityPage
        initialJobs={[completedJob]}
        initialNotionJobs={[]}
        workspace={workspace}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sync all" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    await waitFor(() =>
      expect(
        screen.queryByText("1 source synchronization request submitted."),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Idle")).toBeVisible();
  });
});
