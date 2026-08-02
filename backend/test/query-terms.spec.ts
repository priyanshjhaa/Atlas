import { describe, expect, it } from "vitest";
import { expandedQueryTerms } from "../src/intelligence/query-terms";

describe("expandedQueryTerms", () => {
  it("expands authentication questions into indexed implementation concepts", () => {
    const terms = expandedQueryTerms(
      "Change BetterAuth authentication to local JWT authentication",
    );

    expect(terms).toEqual(
      expect.arrayContaining([
        "auth",
        "session",
        "identity",
        "jwt",
        "token",
        "bearer",
        "jose",
      ]),
    );
  });

  it("treats object prototype property names as ordinary query terms", () => {
    const terms = expandedQueryTerms("constructor toString __proto__");

    expect(terms).toEqual(["constructor", "string", "__proto__"]);
  });
});
