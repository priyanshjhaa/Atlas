import { describe, expect, it } from "vitest";
import type { ParsedFile } from "../src/intelligence/intelligence.types";
import { ParserService } from "../src/intelligence/parser.service";
import { WorkspaceAnalyzerService } from "../src/intelligence/workspace-analyzer.service";

function source(
  path: string,
  content: string,
  language = path.endsWith(".json") ? "json" : "typescript",
) {
  return {
    path,
    language,
    content,
    checksum: path,
    sizeBytes: content.length,
  };
}

function parse(files: ReturnType<typeof source>[]): ParsedFile[] {
  return new ParserService().parseFiles(files);
}

describe("WorkspaceAnalyzerService", () => {
  it("discovers workspace packages, entry points, exports, and dependencies", () => {
    const analysis = new WorkspaceAnalyzerService().analyze(
      parse([
        source(
          "package.json",
          JSON.stringify({
            private: true,
            workspaces: ["packages/*"],
          }),
        ),
        source(
          "packages/core/package.json",
          JSON.stringify({
            name: "@atlas/core",
            version: "2.1.0",
            exports: {
              ".": "./src/index.ts",
              "./users": "./src/users.ts",
            },
            dependencies: { zod: "^4.0.0" },
            peerDependencies: { react: "^19.0.0" },
          }),
        ),
        source(
          "packages/ignored/package.json",
          JSON.stringify({ name: "@atlas/ignored" }),
        ),
        source(
          "examples/demo/package.json",
          JSON.stringify({ name: "@atlas/demo" }),
        ),
        source(
          "packages/core/src/index.ts",
          "export * from './users';\n",
        ),
        source(
          "packages/core/src/users.ts",
          "export const loadUser = () => ({ id: 1 });\n",
        ),
      ]),
    );

    expect(analysis).toMatchObject({
      rootManifestPath: "package.json",
      workspacePatterns: ["packages/*"],
      warnings: [],
      packages: [
        {
          name: "@atlas/core",
          version: "2.1.0",
          rootPath: "packages/core",
          manifestPath: "packages/core/package.json",
          entryPoints: ["packages/core/src/index.ts"],
          dependencyNames: ["react", "zod"],
        },
        {
          name: "@atlas/ignored",
          rootPath: "packages/ignored",
        },
      ],
    });
    expect(analysis.pathMappings).toMatchObject({
      "@atlas/core": ["packages/core/src/index.ts"],
      "@atlas/core/users": ["packages/core/src/users.ts"],
    });
    expect(analysis.pathMappings["@atlas/core/*"]).toContain(
      "packages/core/src/*",
    );
    expect(
      analysis.packages.some((item) => item.name === "@atlas/demo"),
    ).toBe(false);
  });

  it("supports pnpm workspace package patterns", () => {
    const analysis = new WorkspaceAnalyzerService().analyze(
      parse([
        source(
          "package.json",
          JSON.stringify({ private: true }),
        ),
        source(
          "pnpm-workspace.yaml",
          "packages:\n  - 'apps/*'\n",
          "yaml",
        ),
        source(
          "apps/web/package.json",
          JSON.stringify({
            name: "@atlas/web",
            source: "./src/index.ts",
          }),
        ),
        source(
          "apps/web/src/index.ts",
          "export const web = true;\n",
        ),
      ]),
    );

    expect(analysis.workspacePatterns).toEqual(["apps/*"]);
    expect(analysis.packages).toHaveLength(1);
    expect(analysis.packages[0]).toMatchObject({
      name: "@atlas/web",
      entryPoints: ["apps/web/src/index.ts"],
    });
  });
});
