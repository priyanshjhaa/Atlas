import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import {
  auditEvents,
  repositories,
  users,
  workspaceMembers,
  workspaces,
} from "./schema";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://atlas:atlas@localhost:5432/atlas";

const pool = new Pool({ connectionString: databaseUrl });
const database = drizzle(pool);

const developmentUser = {
  id: "local-atlas-user",
  name: "Atlas Developer",
  email: "developer@atlas.local",
  emailVerified: true,
};

async function seed(): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction
      .insert(users)
      .values(developmentUser)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          name: developmentUser.name,
          email: developmentUser.email,
          emailVerified: true,
          updatedAt: new Date(),
        },
      });

    const [workspace] = await transaction
      .insert(workspaces)
      .values({
        name: "Northstar Workspace",
        slug: "northstar",
        createdByUserId: developmentUser.id,
      })
      .onConflictDoUpdate({
        target: workspaces.slug,
        set: { name: "Northstar Workspace", updatedAt: new Date() },
      })
      .returning({ id: workspaces.id });

    if (!workspace) {
      throw new Error("Unable to create the development workspace");
    }

    await transaction
      .insert(workspaceMembers)
      .values({
        workspaceId: workspace.id,
        userId: developmentUser.id,
        role: "owner",
      })
      .onConflictDoUpdate({
        target: [workspaceMembers.workspaceId, workspaceMembers.userId],
        set: { role: "owner", updatedAt: new Date() },
      });

    await transaction
      .insert(repositories)
      .values({
        workspaceId: workspace.id,
        providerRepositoryId: "local/atlas",
        owner: "local",
        name: "atlas",
        defaultBranch: "main",
        isPrivate: true,
      })
      .onConflictDoUpdate({
        target: [
          repositories.workspaceId,
          repositories.providerRepositoryId,
        ],
        set: { isActive: true, updatedAt: new Date() },
      });

    const [existingSeedEvent] = await transaction
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.workspaceId, workspace.id),
          eq(auditEvents.action, "workspace.seeded"),
        ),
      )
      .limit(1);

    if (!existingSeedEvent) {
      await transaction.insert(auditEvents).values({
        workspaceId: workspace.id,
        actorUserId: developmentUser.id,
        action: "workspace.seeded",
        targetType: "workspace",
        targetId: workspace.id,
        metadata: { source: "development-seed" },
      });
    }
  });
}

seed()
  .then(() => {
    console.log("Seeded the Northstar development workspace.");
  })
  .catch((error: unknown) => {
    console.error("Database seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
