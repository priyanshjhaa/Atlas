import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "./db";
import {
  auditEvents,
  authSchema,
  workspaceMembers,
  workspaces,
} from "./db/auth-schema";

const authBaseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:4000";

function workspaceSlug(name: string, userId: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "workspace";

  return `${base}-${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}`;
}

export const auth = betterAuth({
  appName: "Atlas",
  baseURL: authBaseUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      scope: ["read:user", "user:email"],
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const workspaceId = crypto.randomUUID();

          await db.transaction(async (transaction) => {
            await transaction.insert(workspaces).values({
              id: workspaceId,
              name: `${user.name}'s Workspace`,
              slug: workspaceSlug(user.name, user.id),
              createdByUserId: user.id,
            });
            await transaction.insert(workspaceMembers).values({
              workspaceId,
              userId: user.id,
              role: "owner",
            });
            await transaction.insert(auditEvents).values({
              workspaceId,
              actorUserId: user.id,
              action: "workspace.provisioned",
              targetType: "workspace",
              targetId: workspaceId,
              metadata: { source: "github-sign-in" },
            });
          });
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          const [membership] = await db
            .select({ workspaceId: workspaceMembers.workspaceId })
            .from(workspaceMembers)
            .where(eq(workspaceMembers.userId, session.userId))
            .limit(1);

          if (membership) {
            await db.insert(auditEvents).values({
              workspaceId: membership.workspaceId,
              actorUserId: session.userId,
              action: "auth.session.created",
              targetType: "session",
              targetId: session.id,
            });
          }
        },
      },
      delete: {
        after: async (session) => {
          const [membership] = await db
            .select({ workspaceId: workspaceMembers.workspaceId })
            .from(workspaceMembers)
            .where(eq(workspaceMembers.userId, session.userId))
            .limit(1);

          if (membership) {
            await db.insert(auditEvents).values({
              workspaceId: membership.workspaceId,
              actorUserId: session.userId,
              action: "auth.session.revoked",
              targetType: "session",
              targetId: session.id,
            });
          }
        },
      },
    },
  },
  plugins: [
    jwt({
      jwt: {
        issuer: authBaseUrl,
        audience: backendUrl,
        expirationTime: "5m",
        definePayload: ({ user, session }) => ({
          sub: user.id,
          sid: session.id,
        }),
      },
    }),
  ],
});

export type AtlasSession = typeof auth.$Infer.Session;
