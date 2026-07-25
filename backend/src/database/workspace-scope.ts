import { eq, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";

const workspaceIdSchema = z.uuid();

export type WorkspaceId = z.infer<typeof workspaceIdSchema>;

export function parseWorkspaceId(value: string): WorkspaceId {
  return workspaceIdSchema.parse(value);
}

export function withinWorkspace(
  column: PgColumn,
  workspaceId: WorkspaceId,
): SQL {
  return eq(column, workspaceId);
}
