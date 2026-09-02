import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingPage } from "@/components/features/onboarding";
import type {
  AtlasNotionConnector,
  AtlasNotionResource,
  AtlasWorkspace,
} from "@/lib/api-types";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const workspace: AtlasWorkspace = {
  id: "01951ca1-2c72-7000-8000-000000000001",
  name: "Atlas Engineering",
  slug: "atlas-engineering",
  role: "owner",
  repositoryCount: 0,
  onboardingCompletedAt: null,
};

const notionConnector: AtlasNotionConnector = {
  id: "connector-1",
  status: "active",
  configuration: { workspaceName: "Atlas Decisions" },
  createdAt: "2026-08-11T12:00:00.000Z",
  updatedAt: "2026-08-11T12:00:00.000Z",
};

const notionResource: AtlasNotionResource = {
  id: "resource-1",
  connectorId: notionConnector.id,
  providerResourceId: "notion-page-1",
  kind: "page",
  title: "Authentication ADR",
  url: "https://notion.so/authentication-adr",
  parentId: null,
  isSelected: true,
  isActive: true,
  lastEditedAt: "2026-08-11T10:00:00.000Z",
  lastEditor: null,
  lastSyncedAt: null,
};

function renderOnboarding(options: {
  notionConnectors?: AtlasNotionConnector[];
  notionResources?: AtlasNotionResource[];
  result?: { github?: string; notion?: string };
} = {}) {
  return render(
    <OnboardingPage
      workspace={workspace}
      repositories={[]}
      githubConnectors={[]}
      notionConnectors={options.notionConnectors ?? []}
      notionResources={options.notionResources ?? []}
      githubJobs={[]}
      notionJobs={[]}
      githubConfigured
      notionConfigured
      result={options.result ?? {}}
    />,
  );
}

describe("OnboardingPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    push.mockReset();
    refresh.mockReset();
  });

  it("presents GitHub identity separately from optional Notion context", () => {
    renderOnboarding();

    expect(
      screen.getByRole("heading", {
        name: "Bring code and decisions into one living map.",
      }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "GitHub repositories" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Notion workspace" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Connect Notion/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Skip for now/ })).toBeEnabled();
  });

  it("shows connected Notion resources and a successful callback state", () => {
    renderOnboarding({
      notionConnectors: [notionConnector],
      notionResources: [notionResource],
      result: { notion: "connected" },
    });

    expect(screen.getByText(/Notion is connected/)).toBeVisible();
    expect(screen.getByText("1", { selector: "dd" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Review Notion access/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Finish setup/ })).toBeEnabled();
  });

  it("completes setup before entering the dashboard", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    renderOnboarding();

    fireEvent.click(screen.getByRole("button", { name: /Skip for now/ }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id }),
      });
      expect(push).toHaveBeenCalledWith("/app");
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("keeps users in setup when completion fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: "Completion unavailable." }),
      }),
    );
    renderOnboarding();

    fireEvent.click(screen.getByRole("button", { name: /Skip for now/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Completion unavailable.",
    );
    expect(push).not.toHaveBeenCalled();
  });
});
