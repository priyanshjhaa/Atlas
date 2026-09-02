import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type GitHubAppReturnTo = "sources" | "onboarding";

interface GitHubAppState {
  workspaceId: string;
  expiresAt: number;
  nonce: string;
  returnTo: GitHubAppReturnTo;
}

function stateSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required.");
  return secret;
}

export function createGitHubAppState(
  workspaceId: string,
  returnTo: GitHubAppReturnTo = "sources",
): string {
  const payload: GitHubAppState = {
    workspaceId,
    expiresAt: Date.now() + 10 * 60 * 1000,
    nonce: randomBytes(16).toString("base64url"),
    returnTo,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", stateSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyGitHubAppState(value: string): GitHubAppState | null {
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
    ) as Partial<GitHubAppState>;
    if (
      typeof state.workspaceId !== "string" ||
      typeof state.expiresAt !== "number" ||
      typeof state.nonce !== "string" ||
      (state.returnTo !== undefined &&
        state.returnTo !== "sources" &&
        state.returnTo !== "onboarding") ||
      state.expiresAt < Date.now()
    ) {
      return null;
    }
    return {
      workspaceId: state.workspaceId,
      expiresAt: state.expiresAt,
      nonce: state.nonce,
      returnTo: state.returnTo ?? "sources",
    };
  } catch {
    return null;
  }
}
