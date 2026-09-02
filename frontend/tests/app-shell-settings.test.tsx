import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app/app-shell";
import { SettingsPage } from "@/components/features/settings";
import type { AtlasWorkspaceData, AtlasWorkspaceMember } from "@/lib/api-types";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/settings",
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: vi.fn() },
}));

const workspaceData: AtlasWorkspaceData = {
  me: {
    user: {
      id: "user-1",
      name: "Priyansh Jha",
      email: "priyansh@example.com",
      image: null,
    },
    session: { id: "session-1" },
    workspaces: [
      {
        id: "workspace-1",
        name: "Priyansh Jha's engineering workspace",
        slug: "priyansh-engineering",
        role: "owner",
        repositoryCount: 1,
        onboardingCompletedAt: "2026-08-01T10:00:00.000Z",
      },
    ],
  },
  activeWorkspace: {
    id: "workspace-1",
    name: "Priyansh Jha's engineering workspace",
    slug: "priyansh-engineering",
    role: "owner",
    repositoryCount: 1,
    onboardingCompletedAt: "2026-08-01T10:00:00.000Z",
  },
  repositories: [
    {
      id: "repository-1",
      owner: "priyanshjhaa",
      name: "atlas",
      defaultBranch: "main",
      isPrivate: true,
      isActive: true,
      lastSyncedAt: "2026-08-21T10:00:00.000Z",
    },
  ],
};

const members: AtlasWorkspaceMember[] = [
  {
    id: "membership-1",
    userId: "user-1",
    name: "Priyansh Jha",
    email: "priyansh@example.com",
    image: null,
    role: "owner",
    createdAt: "2026-08-01T10:00:00.000Z",
  },
  {
    id: "membership-2",
    userId: "user-2",
    name: "Atlas Engineer",
    email: "engineer@example.com",
    image: null,
    role: "member",
    createdAt: "2026-08-02T10:00:00.000Z",
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
});

describe("workspace chrome", () => {
  it("keeps workspace, search, graph health, and activity as separate navigation targets", () => {
    render(
      <AppShell workspaceData={workspaceData}>
        <div>Settings content</div>
      </AppShell>,
    );

    expect(
      screen.getByRole("link", {
        name: "Atlas workspace: Priyansh Jha's engineering workspace",
      }),
    ).toHaveAttribute("href", "/app");
    expect(
      screen.getByRole("link", {
        name: "Search code, decisions, and history",
      }),
    ).toHaveAttribute("href", "/app/search");
    expect(
      screen.getByRole("link", { name: "Context graph ready" }),
    ).toHaveAttribute("href", "/app/activity");
    expect(
      screen.getByRole("link", { name: "Synchronization activity" }),
    ).toHaveAttribute("href", "/app/activity");
  });

  it("navigates every functional settings section", () => {
    render(
      <SettingsPage
        currentUser={workspaceData.me.user}
        initialMembers={members}
        workspace={workspaceData.activeWorkspace}
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "Settings sections" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Workspace" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("heading", { name: "Workspace details" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Members/ }));
    expect(screen.getByRole("heading", { name: "Workspace members" })).toBeVisible();
    expect(screen.getByText("Atlas Engineer")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Access & roles" }));
    expect(screen.getByRole("heading", { name: "Access and roles" })).toBeVisible();
    expect(screen.getByLabelText("Atlas Engineer role")).toHaveValue("member");
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByRole("heading", { name: "Notification channels" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Data & privacy" }));
    expect(screen.getByRole("heading", { name: "Data and privacy" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Manage sources" }),
    ).toHaveAttribute("href", "/app/sources");
  });

  it("saves an edited workspace name through the settings API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ name: "Atlas Engineering" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SettingsPage
        currentUser={workspaceData.me.user}
        initialMembers={members}
        workspace={workspaceData.activeWorkspace}
      />,
    );

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Atlas Engineering" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/workspace-settings",
      expect.objectContaining({ method: "PATCH" }),
    ));
    expect(await screen.findByText("Workspace details updated.")).toBeVisible();
    expect(refresh).toHaveBeenCalled();
  });
});
