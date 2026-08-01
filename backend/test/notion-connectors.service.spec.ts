import { describe, expect, it, vi } from "vitest";
import { NotionConnectorsService } from "../src/connectors/notion-connectors.service";

const identity = {
  sessionId: "session",
  user: {
    id: "user-1",
    name: "Atlas Owner",
    email: "owner@atlas.test",
    image: null,
  },
};

describe("NotionConnectorsService", () => {
  it("encrypts OAuth credentials and persists discovered resources", async () => {
    const token = {
      access_token: "access-token",
      token_type: "bearer" as const,
      refresh_token: "refresh-token",
      bot_id: "bot-id",
      workspace_icon: null,
      workspace_name: "Atlas Docs",
      workspace_id: "notion-workspace",
      owner: {},
      duplicated_template_id: null,
    };
    const resources = [
      {
        providerResourceId: "page-1",
        kind: "page" as const,
        title: "Architecture",
        url: "https://notion.so/page-1",
        parentId: null,
        lastEditedAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ];
    const notion = {
      exchangeAuthorizationCode: vi.fn(async () => token),
      listAccessibleResources: vi.fn(async () => resources),
    };
    const encryption = { encrypt: vi.fn(() => "encrypted") };
    const repository = {
      install: vi.fn(async () => ({
        id: "connector-1",
        status: "active",
        configuration: { workspaceName: "Atlas Docs" },
      })),
      list: vi.fn(),
      listResources: vi.fn(),
      updateSelection: vi.fn(),
      revoke: vi.fn(),
    };
    const service = new NotionConnectorsService(
      notion as never,
      encryption as never,
      repository as never,
    );

    await expect(service.connect("workspace-1", "oauth-code", identity))
      .resolves.toMatchObject({ resourceCount: 1, status: "active" });
    expect(encryption.encrypt).toHaveBeenCalledWith({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      botId: "bot-id",
      notionWorkspaceId: "notion-workspace",
    });
    expect(repository.install).toHaveBeenCalledWith(
      "workspace-1",
      "user-1",
      token,
      "encrypted",
      resources,
    );
  });
});
