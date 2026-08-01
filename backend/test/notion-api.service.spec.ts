import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Environment } from "../src/config/environment";
import { NotionApiService } from "../src/connectors/notion-api.service";

function service() {
  return new NotionApiService(
    new ConfigService<Environment>({
      FRONTEND_ORIGIN: "http://localhost:3000",
      NOTION_CLIENT_ID: "notion-client",
      NOTION_CLIENT_SECRET: "notion-secret",
      NOTION_REDIRECT_URI: "http://localhost:3000/api/notion/callback",
    }) as unknown as ConfigService<Environment, true>,
  );
}

describe("NotionApiService", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("exchanges OAuth codes with Basic authentication and the pinned API version", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-token",
          token_type: "bearer",
          refresh_token: "refresh-token",
          bot_id: "bot-id",
          workspace_icon: null,
          workspace_name: "Atlas Docs",
          workspace_id: "workspace-id",
          owner: {},
          duplicated_template_id: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(service().exchangeAuthorizationCode("authorization-code"))
      .resolves.toMatchObject({ access_token: "access-token" });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.notion.com/v1/oauth/token");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      `Basic ${Buffer.from("notion-client:notion-secret").toString("base64")}`,
    );
    expect(new Headers(init?.headers).get("Notion-Version")).toBe(
      "2026-03-11",
    );
    expect(JSON.parse(init?.body as string)).toMatchObject({
      grant_type: "authorization_code",
      redirect_uri: "http://localhost:3000/api/notion/callback",
    });
  });

  it("paginates and normalizes accessible pages and data sources", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                object: "page",
                id: "page-1",
                url: "https://notion.so/page-1",
                last_edited_time: "2026-08-01T00:00:00.000Z",
                parent: { type: "workspace", workspace: true },
                properties: {
                  Name: {
                    type: "title",
                    title: [{ plain_text: "Architecture" }],
                  },
                },
              },
            ],
            has_more: true,
            next_cursor: "next-page",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                object: "data_source",
                id: "source-1",
                title: [{ plain_text: "Runbooks" }],
                parent: { type: "database_id", database_id: "database-1" },
              },
            ],
            has_more: false,
            next_cursor: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(service().listAccessibleResources("access-token")).resolves
      .toEqual([
        expect.objectContaining({
          providerResourceId: "page-1",
          kind: "page",
          title: "Architecture",
        }),
        expect.objectContaining({
          providerResourceId: "source-1",
          kind: "data_source",
          title: "Runbooks",
          parentId: "database-1",
        }),
      ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string),
    ).toMatchObject({ start_cursor: "next-page" });
  });
});
