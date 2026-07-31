import { describe, expect, it } from "vitest";
import {
  PackageLinkerService,
  type PersistedCodePackage,
} from "../src/intelligence/package-linker.service";

function packageRecord(
  input: Partial<PersistedCodePackage> &
    Pick<PersistedCodePackage, "id" | "repositoryId" | "name">,
): PersistedCodePackage {
  return {
    workspaceId: "workspace-1",
    rootPath: "",
    manifestPath: "package.json",
    sourceRevision: "revision-1",
    dependencies: [],
    ...input,
  };
}

describe("PackageLinkerService", () => {
  it("links dependencies involving the synchronized repository", () => {
    const result = new PackageLinkerService().link(
      [
        packageRecord({
          id: "api",
          repositoryId: "repository-api",
          name: "@atlas/api",
          dependencies: [
            {
              name: "@atlas/core",
              range: "workspace:*",
              kind: "runtime",
            },
          ],
        }),
        packageRecord({
          id: "web",
          repositoryId: "repository-api",
          name: "@atlas/web",
          dependencies: [
            {
              name: "@atlas/api",
              range: "workspace:^",
              kind: "development",
            },
          ],
        }),
        packageRecord({
          id: "core",
          repositoryId: "repository-core",
          name: "@atlas/core",
        }),
        packageRecord({
          id: "consumer",
          repositoryId: "repository-consumer",
          name: "@atlas/consumer",
          sourceRevision: "revision-consumer",
          dependencies: [
            {
              name: "@atlas/api",
              range: "^1.0.0",
              kind: "peer",
            },
          ],
        }),
        packageRecord({
          id: "unrelated",
          repositoryId: "repository-unrelated",
          name: "@atlas/unrelated",
        }),
        packageRecord({
          id: "foreign-core",
          workspaceId: "workspace-2",
          repositoryId: "repository-foreign",
          name: "@atlas/core",
        }),
      ],
      "repository-api",
    );

    expect(result.ambiguousDependencies).toBe(0);
    expect(result.relationships).toHaveLength(3);
    const apiLink = result.relationships.find(
      (item) => item.sourcePackageId === "api",
    );
    const webLink = result.relationships.find(
      (item) => item.sourcePackageId === "web",
    );
    const consumerLink = result.relationships.find(
      (item) => item.sourcePackageId === "consumer",
    );
    expect(apiLink).toMatchObject({
      targetPackageId: "core",
      stableKey:
        "repository-api:@atlas/api:depends_on:repository-core:@atlas/core",
      provenance: "package_manifest_dependency",
      confidence: 1,
      evidence: {
        sourcePackageName: "@atlas/api",
        targetPackageName: "@atlas/core",
        dependencyRange: "workspace:*",
        dependencyKind: "runtime",
        scope: "cross_repository",
      },
    });
    expect(webLink).toMatchObject({
      targetPackageId: "api",
      evidence: {
        scope: "repository",
      },
    });
    expect(consumerLink).toMatchObject({
      targetPackageId: "api",
      sourceRevision: "revision-consumer",
    });
  });

  it("does not create a relationship for an ambiguous package name", () => {
    const result = new PackageLinkerService().link(
      [
        packageRecord({
          id: "api",
          repositoryId: "repository-api",
          name: "@atlas/api",
          dependencies: [
            {
              name: "@atlas/core",
              range: "*",
              kind: "runtime",
            },
          ],
        }),
        packageRecord({
          id: "core-a",
          repositoryId: "repository-core-a",
          name: "@atlas/core",
        }),
        packageRecord({
          id: "core-b",
          repositoryId: "repository-core-b",
          name: "@atlas/core",
        }),
      ],
      "repository-api",
    );

    expect(result.relationships).toEqual([]);
    expect(result.ambiguousDependencies).toBe(1);
  });
});
