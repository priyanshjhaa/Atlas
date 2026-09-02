import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_ROLES_KEY,
} from "../src/auth/auth.decorators";
import type { WorkspaceRole } from "../src/auth/auth.types";
import type { AuthenticatedIdentity } from "../src/auth/auth.types";
import type { NotionContextService } from "../src/notion-context/notion-context.service";
import { NotionContextController } from "../src/notion-context/notion-context.controller";

function roles(method: keyof NotionContextController) {
  const target = Object.getOwnPropertyDescriptor(
    NotionContextController.prototype,
    method,
  )?.value as object | undefined;
  if (!target) return undefined;
  return Reflect.getMetadata(
    WORKSPACE_ROLES_KEY,
    target,
  ) as WorkspaceRole[] | undefined;
}

describe("NotionContextController authorization", () => {
  it("allows every workspace member role to read Notion context", () => {
    const expected = ["owner", "admin", "member", "viewer"];
    for (const method of [
      "catchUp",
      "briefing",
      "acknowledge",
      "questions",
      "documents",
      "savedReviews",
      "review",
    ] as const) {
      expect(roles(method)).toEqual(expected);
    }
  });

  it("prevents viewers from requesting a persisted document review", () => {
    expect(roles("reviews")).toEqual(["owner", "admin", "member"]);
  });

  it("returns revision editor attribution from the catch-up contract", async () => {
    const response = {
      documents: [
        {
          currentRevision: "revision-2",
          lastEditedBy: {
            providerUserId: "notion-user-2",
            displayName: "Maya Chen",
            avatarUrl: null,
            kind: "person",
          },
        },
      ],
    };
    const context = {
      catchUp: vi.fn().mockResolvedValue(response),
    } as unknown as NotionContextService;
    const controller = new NotionContextController(context);
    const identity = {
      user: { id: "user-1" },
    } as unknown as AuthenticatedIdentity;

    await expect(controller.catchUp("workspace-1", identity)).resolves.toEqual(
      response,
    );
  });
});
