import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment";

const NOTION_API_VERSION = "2026-03-11";
const MAX_ACCESSIBLE_RESOURCES = 500;

interface NotionRichText {
  plain_text?: string;
}

interface NotionSearchResult {
  object: "page" | "data_source" | "database";
  id: string;
  url?: string;
  last_edited_time?: string;
  parent?: {
    type?: string;
    page_id?: string;
    database_id?: string;
    data_source_id?: string;
    workspace?: boolean;
  };
  title?: NotionRichText[];
  properties?: Record<
    string,
    {
      type?: string;
      title?: NotionRichText[];
    }
  >;
}

interface NotionSearchResponse {
  results: NotionSearchResult[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface NotionOAuthToken {
  access_token: string;
  token_type: "bearer";
  refresh_token: string | null;
  bot_id: string;
  workspace_icon: string | null;
  workspace_name: string | null;
  workspace_id: string;
  owner: Record<string, unknown>;
  duplicated_template_id: string | null;
}

export interface AccessibleNotionResource {
  providerResourceId: string;
  kind: "page" | "data_source" | "database";
  title: string;
  url: string | null;
  parentId: string | null;
  lastEditedAt: Date | null;
}

@Injectable()
export class NotionApiService {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  async exchangeAuthorizationCode(code: string): Promise<NotionOAuthToken> {
    const credentials = this.oauthCredentials();
    const response = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(
          `${credentials.clientId}:${credentials.clientSecret}`,
        ).toString("base64")}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_API_VERSION,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.redirectUri(),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const body = await this.readJson<NotionOAuthToken>(response);
    if (
      !body.access_token ||
      !body.bot_id ||
      !body.workspace_id ||
      body.token_type !== "bearer"
    ) {
      throw new BadGatewayException(
        "Notion returned an incomplete authorization response.",
      );
    }
    return body;
  }

  async listAccessibleResources(
    accessToken: string,
  ): Promise<AccessibleNotionResource[]> {
    const resources: AccessibleNotionResource[] = [];
    let cursor: string | null = null;

    do {
      const response: Response = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Notion-Version": NOTION_API_VERSION,
        },
        body: JSON.stringify({
          page_size: Math.min(100, MAX_ACCESSIBLE_RESOURCES - resources.length),
          ...(cursor ? { start_cursor: cursor } : {}),
          sort: { direction: "descending", timestamp: "last_edited_time" },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const body: NotionSearchResponse =
        await this.readJson<NotionSearchResponse>(response);
      resources.push(
        ...body.results.map((resource: NotionSearchResult) =>
          this.normalizeResource(resource),
        ),
      );
      cursor = body.has_more ? body.next_cursor : null;
    } while (cursor && resources.length < MAX_ACCESSIBLE_RESOURCES);

    return resources.slice(0, MAX_ACCESSIBLE_RESOURCES);
  }

  redirectUri(): string {
    return (
      this.config.get("NOTION_REDIRECT_URI", { infer: true }) ??
      new URL(
        "/api/notion/callback",
        this.config.get("FRONTEND_ORIGIN", { infer: true }),
      ).toString()
    );
  }

  private oauthCredentials(): { clientId: string; clientSecret: string } {
    const clientId = this.config.get("NOTION_CLIENT_ID", { infer: true });
    const clientSecret = this.config.get("NOTION_CLIENT_SECRET", {
      infer: true,
    });
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        "The Notion connector is not configured.",
      );
    }
    return { clientId, clientSecret };
  }

  private async readJson<T>(response: Response): Promise<T> {
    const body = (await response.json().catch(() => ({}))) as T & {
      message?: string;
    };
    if (!response.ok) {
      throw new BadGatewayException(
        body.message ?? `Notion API request failed with status ${response.status}.`,
      );
    }
    return body;
  }

  private normalizeResource(
    resource: NotionSearchResult,
  ): AccessibleNotionResource {
    const title =
      resource.object === "page"
        ? Object.values(resource.properties ?? {}).find(
            (property) => property.type === "title",
          )?.title
        : resource.title;
    const parent = resource.parent;
    return {
      providerResourceId: resource.id,
      kind: resource.object,
      title:
        title?.map((part) => part.plain_text ?? "").join("").trim() ||
        "Untitled",
      url: resource.url ?? null,
      parentId:
        parent?.page_id ??
        parent?.data_source_id ??
        parent?.database_id ??
        null,
      lastEditedAt: resource.last_edited_time
        ? new Date(resource.last_edited_time)
        : null,
    };
  }
}
