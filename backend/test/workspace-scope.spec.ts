import { drizzle } from "drizzle-orm/node-postgres";
import { describe, expect, it } from "vitest";
import { repositories } from "../src/database/schema";
import {
  parseWorkspaceId,
  withinWorkspace,
} from "../src/database/workspace-scope";

describe("workspace scope", () => {
  it("rejects invalid workspace identifiers", () => {
    expect(() => parseWorkspaceId("not-a-workspace-id")).toThrow();
  });

  it("adds the workspace predicate to tenant-owned queries", () => {
    const database = drizzle.mock();
    const workspaceId = parseWorkspaceId(
      "01951ca1-2c72-7000-8000-000000000001",
    );

    const query = database
      .select()
      .from(repositories)
      .where(withinWorkspace(repositories.workspaceId, workspaceId))
      .toSQL();

    expect(query.sql).toContain('"repositories"."workspace_id" = $1');
    expect(query.params).toEqual([workspaceId]);
  });
});
