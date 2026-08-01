import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Environment } from "../config/environment";

const NOTION_API_VERSION = "2026-03-11";
const MAX_ACCESSIBLE_RESOURCES = 500;
const MAX_MARKDOWN_CHARACTERS = 200_000;
const MAX_UNKNOWN_SUBTREES = 25;

export class NotionApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "NotionApiRequestError";
  }
}

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

interface NotionMarkdownResponse {
  markdown: string;
  truncated: boolean;
  unknown_block_ids: string[];
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

export interface NotionPageContent {
  markdown: string;
  truncated: boolean;
  unknownBlockIdsVisited: number;
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

  async retrievePageMarkdown(
    accessToken: string,
    pageId: string,
  ): Promise<NotionPageContent> {
    const root = await this.retrieveMarkdownFragment(accessToken, pageId);
    const fragments = [root.markdown];
    const queue = [...root.unknown_block_ids];
    const visited = new Set<string>();
    let truncated = root.truncated;
    let characters = root.markdown.length;

    while (
      queue.length &&
      visited.size < MAX_UNKNOWN_SUBTREES &&
      characters < MAX_MARKDOWN_CHARACTERS
    ) {
      const blockId = queue.shift();
      if (!blockId || visited.has(blockId)) continue;
      visited.add(blockId);
      try {
        const fragment = await this.retrieveMarkdownFragment(
          accessToken,
          blockId,
        );
        const remaining = MAX_MARKDOWN_CHARACTERS - characters;
        const selected = fragment.markdown.slice(0, remaining);
        if (selected) fragments.push(selected);
        characters += selected.length;
        truncated ||= fragment.truncated || selected.length < fragment.markdown.length;
        queue.push(...fragment.unknown_block_ids);
      } catch (error) {
        if (
          error instanceof NotionApiRequestError &&
          error.status === 404
        ) {
          truncated = true;
          continue;
        }
        throw error;
      }
    }

    if (queue.length || characters >= MAX_MARKDOWN_CHARACTERS) truncated = true;
    return {
      markdown: fragments.join("\n\n").slice(0, MAX_MARKDOWN_CHARACTERS),
      truncated,
      unknownBlockIdsVisited: visited.size,
    };
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
      code?: string;
      message?: string;
    };
    if (!response.ok) {
      throw new NotionApiRequestError(
        body.message ??
          `Notion API request failed with status ${response.status}.`,
        response.status,
        body.code ?? null,
      );
    }
    return body;
  }

  private async retrieveMarkdownFragment(
    accessToken: string,
    pageOrBlockId: string,
  ): Promise<NotionMarkdownResponse> {
    const response = await fetch(
      `https://api.notion.com/v1/pages/${encodeURIComponent(pageOrBlockId)}/markdown`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": NOTION_API_VERSION,
        },
        signal: AbortSignal.timeout(20_000),
      },
    );
    return this.readJson<NotionMarkdownResponse>(response);
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
