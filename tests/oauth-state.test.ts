import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGitHubAppState,
  verifyGitHubAppState,
} from "@/lib/github-app-state";
import {
  createNotionOAuthState,
  verifyNotionOAuthState,
} from "@/lib/notion-oauth-state";

const connectors = [
  {
    name: "GitHub App",
    create: createGitHubAppState,
    verify: verifyGitHubAppState,
  },
  {
    name: "Notion OAuth",
    create: createNotionOAuthState,
    verify: verifyNotionOAuthState,
  },
];

describe.each(connectors)("$name state", ({ create, verify }) => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T12:00:00.000Z"));
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "test-only-state-secret-with-at-least-32-characters",
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("round-trips a signed, short-lived workspace state", () => {
    const state = verify(create("workspace-123"));

    expect(state).toMatchObject({
      workspaceId: "workspace-123",
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    expect(state?.nonce).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  });

  it("rejects payload tampering even when the original signature is retained", () => {
    const [encoded, signature] = create("workspace-123").split(".");
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as { workspaceId: string };
    payload.workspaceId = "workspace-attacker";
    const tampered = Buffer.from(JSON.stringify(payload)).toString("base64url");

    expect(verify(`${tampered}.${signature}`)).toBeNull();
  });

  it("rejects expired state", () => {
    const state = create("workspace-123");
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    expect(verify(state)).toBeNull();
  });

  it("rejects malformed state", () => {
    expect(verify("missing-signature")).toBeNull();
    expect(verify("one.two.three")).toBeNull();
    expect(verify("..")).toBeNull();
  });

  it("requires the server authentication secret", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");

    expect(() => create("workspace-123")).toThrow(
      "BETTER_AUTH_SECRET is required.",
    );
  });
});
