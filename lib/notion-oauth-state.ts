import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

interface NotionOAuthState {
  workspaceId: string;
  expiresAt: number;
  nonce: string;
}

function stateSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required.");
  return secret;
}

export function createNotionOAuthState(workspaceId: string): string {
  const payload: NotionOAuthState = {
    workspaceId,
    expiresAt: Date.now() + 10 * 60 * 1000,
    nonce: randomBytes(16).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", stateSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyNotionOAuthState(value: string): NotionOAuthState | null {
  const [encoded, providedSignature, extra] = value.split(".");
  if (!encoded || !providedSignature || extra) return null;
  const expectedSignature = createHmac("sha256", stateSecret())
    .update(encoded)
    .digest("base64url");
  const expected = Buffer.from(expectedSignature);
  const provided = Buffer.from(providedSignature);
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return null;
  }

  try {
    const state = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<NotionOAuthState>;
    if (
      typeof state.workspaceId !== "string" ||
      typeof state.expiresAt !== "number" ||
      typeof state.nonce !== "string" ||
      state.expiresAt < Date.now()
    ) {
      return null;
    }
    return state as NotionOAuthState;
  } catch {
    return null;
  }
}
