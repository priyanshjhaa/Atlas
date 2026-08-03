import { describe, expect, it } from "vitest";
import {
  requestIdFromHeader,
  safeRequestPath,
} from "../src/observability/http-logging";

describe("HTTP logging safeguards", () => {
  it("keeps an accepted request identifier", () => {
    expect(requestIdFromHeader("trace_123:child-4")).toBe(
      "trace_123:child-4",
    );
  });

  it("replaces malformed request identifiers", () => {
    expect(requestIdFromHeader("unsafe request id\nforged")).toMatch(
      /^[a-f0-9-]{36}$/,
    );
  });

  it("removes query values from logged request paths", () => {
    expect(
      safeRequestPath("/v1/oauth/callback?code=secret&state=sensitive"),
    ).toBe("/v1/oauth/callback");
  });
});
