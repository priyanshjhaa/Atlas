import "reflect-metadata";
import { describe, expect, it } from "vitest";
import {
  WORKSPACE_ROLES_KEY,
} from "../src/auth/auth.decorators";
import type { WorkspaceRole } from "../src/auth/auth.types";
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
});
