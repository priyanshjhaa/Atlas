import { Injectable } from "@nestjs/common";
import {
  dirname,
  join,
  matchesGlob,
  normalize,
} from "node:path/posix";
import type {
  ParsedFile,
  WorkspaceAnalysis,
  WorkspacePackage,
  WorkspacePackageDependency,
} from "./intelligence.types";

interface PackageManifest {
  name?: unknown;
  version?: unknown;
  private?: unknown;
  workspaces?: unknown;
  source?: unknown;
  main?: unknown;
  module?: unknown;
  types?: unknown;
  typings?: unknown;
  exports?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
  peerDependencies?: unknown;
  optionalDependencies?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(
  file: ParsedFile | undefined,
  warnings: string[],
): Record<string, unknown> | null {
  if (!file) return null;
  try {
    const parsed: unknown = JSON.parse(file.content);
    if (isRecord(parsed)) return parsed;
  } catch {
    warnings.push(`Could not parse ${file.path}.`);
    return null;
  }
  warnings.push(`${file.path} does not contain a JSON object.`);
  return null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function workspacePatternsFromManifest(manifest: PackageManifest | null) {
  if (!manifest) return [];
  if (Array.isArray(manifest.workspaces)) {
    return stringArray(manifest.workspaces);
  }
  if (isRecord(manifest.workspaces)) {
    return stringArray(manifest.workspaces.packages);
  }
  return [];
}

function pnpmWorkspacePatterns(file: ParsedFile | undefined) {
  if (!file) return [];
  const patterns: string[] = [];
  let insidePackages = false;
  for (const line of file.content.split(/\r?\n/)) {
    if (/^packages\s*:/.test(line)) {
      insidePackages = true;
      continue;
    }
    if (insidePackages && /^\S/.test(line) && !/^\s*-/.test(line)) break;
    const item = line.match(/^\s*-\s*["']?([^"'#]+?)["']?\s*$/);
    if (insidePackages && item?.[1]) patterns.push(item[1].trim());
  }
  return patterns;
}

function workspacePatternsFromLerna(
  file: ParsedFile | undefined,
  warnings: string[],
) {
  const manifest = parseJson(file, warnings);
  return stringArray(manifest?.packages);
}

function normalizePattern(pattern: string) {
  return pattern.replace(/^\.\//, "").replace(/\/+$/, "");
}

function packageMatchesWorkspace(
  manifestPath: string,
  patterns: string[],
) {
  return patterns.some((pattern) => {
    const normalizedPattern = normalizePattern(pattern);
    return (
      matchesGlob(manifestPath, `${normalizedPattern}/package.json`) ||
      matchesGlob(manifestPath, normalizedPattern)
    );
  });
}

function dependencies(manifest: PackageManifest) {
  const sections: Array<{
    value: unknown;
    kind: WorkspacePackageDependency["kind"];
  }> = [
    { value: manifest.dependencies, kind: "runtime" },
    { value: manifest.peerDependencies, kind: "peer" },
    { value: manifest.optionalDependencies, kind: "optional" },
    { value: manifest.devDependencies, kind: "development" },
  ];
  const dependenciesByName = new Map<string, WorkspacePackageDependency>();
  for (const section of sections) {
    if (!isRecord(section.value)) continue;
    for (const [name, range] of Object.entries(section.value)) {
      if (typeof range !== "string" || dependenciesByName.has(name)) continue;
      dependenciesByName.set(name, { name, range, kind: section.kind });
    }
  }
  return [...dependenciesByName.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function targetPath(packageRoot: string, target: string) {
  if (!target.startsWith(".")) return null;
  const path = normalize(join(packageRoot || ".", target));
  if (path === ".." || path.startsWith("../")) return null;
  return path.replace(/^\.\//, "");
}

function collectExportTargets(
  value: unknown,
  subpath: string,
  output: Map<string, string[]>,
  packageRoot: string,
): void {
  if (typeof value === "string") {
    const path = targetPath(packageRoot, value);
    if (!path) return;
    output.set(subpath, [...(output.get(subpath) ?? []), path]);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectExportTargets(item, subpath, output, packageRoot);
    }
    return;
  }
  if (!isRecord(value)) return;
  const entries = Object.entries(value);
  const subpathEntries = entries.filter(([key]) => key.startsWith("."));
  if (subpathEntries.length) {
    for (const [key, target] of subpathEntries) {
      collectExportTargets(target, key, output, packageRoot);
    }
    return;
  }
  for (const target of Object.values(value)) {
    collectExportTargets(target, subpath, output, packageRoot);
  }
}

function existingEntryPoints(
  manifest: PackageManifest,
  packageRoot: string,
  paths: Set<string>,
) {
  const candidates = [
    manifest.source,
    manifest.types,
    manifest.typings,
    manifest.module,
    manifest.main,
    "./src/index.ts",
    "./src/index.tsx",
    "./index.ts",
    "./index.tsx",
  ]
    .filter((item): item is string => typeof item === "string")
    .map((item) => targetPath(packageRoot, item))
    .filter((item): item is string => Boolean(item));
  return [...new Set(candidates.filter((candidate) => paths.has(candidate)))];
}

function packageAnalysis(
  manifestPath: string,
  manifest: PackageManifest,
  paths: Set<string>,
): {
  package: WorkspacePackage;
  mappings: Record<string, string[]>;
} | null {
  if (typeof manifest.name !== "string" || !manifest.name.trim()) return null;
  const packageRoot =
    dirname(manifestPath) === "." ? "" : dirname(manifestPath);
  const exports = new Map<string, string[]>();
  collectExportTargets(manifest.exports, ".", exports, packageRoot);
  const defaultEntryPoints = existingEntryPoints(
    manifest,
    packageRoot,
    paths,
  );
  const rootEntryPoints = [
    ...new Set([
      ...(exports.get(".") ?? []).filter((path) => paths.has(path)),
      ...defaultEntryPoints,
    ]),
  ];
  const entryPoints = [
    ...new Set([
      ...[...exports.values()]
        .flat()
        .filter((path) => !path.includes("*") && paths.has(path)),
      ...defaultEntryPoints,
    ]),
  ];
  const mappings: Record<string, string[]> = {};
  if (rootEntryPoints.length) mappings[manifest.name] = rootEntryPoints;
  for (const [subpath, targets] of exports) {
    if (subpath === ".") continue;
    const suffix = subpath.replace(/^\.\//, "");
    const usableTargets = targets.filter(
      (path) => path.includes("*") || paths.has(path),
    );
    if (usableTargets.length) {
      mappings[`${manifest.name}/${suffix}`] = usableTargets;
    }
  }
  const sourceRoot = packageRoot
    ? `${packageRoot}/src/*`
    : "src/*";
  const packageWildcard = packageRoot ? `${packageRoot}/*` : "*";
  mappings[`${manifest.name}/*`] = [
    ...(mappings[`${manifest.name}/*`] ?? []),
    sourceRoot,
    packageWildcard,
  ];

  const packageDependencies = dependencies(manifest);
  return {
    package: {
      name: manifest.name,
      version: typeof manifest.version === "string" ? manifest.version : null,
      rootPath: packageRoot,
      manifestPath,
      entryPoints,
      dependencyNames: packageDependencies.map((item) => item.name),
      dependencies: packageDependencies,
      exportMappings: mappings,
    },
    mappings,
  };
}

@Injectable()
export class WorkspaceAnalyzerService {
  analyze(files: ParsedFile[]): WorkspaceAnalysis {
    const warnings: string[] = [];
    const filesByPath = new Map(files.map((file) => [file.path, file]));
    const rootFile = filesByPath.get("package.json");
    const rootManifest = parseJson(
      rootFile,
      warnings,
    ) as PackageManifest | null;
    const patterns = [
      ...workspacePatternsFromManifest(rootManifest),
      ...pnpmWorkspacePatterns(filesByPath.get("pnpm-workspace.yaml")),
      ...workspacePatternsFromLerna(
        filesByPath.get("lerna.json"),
        warnings,
      ),
    ].map(normalizePattern);
    const workspacePatterns = [...new Set(patterns)].sort();
    const manifestFiles = files.filter(
      (file) =>
        file.path === "package.json" || file.path.endsWith("/package.json"),
    );
    const selectedManifests = manifestFiles.filter((file) => {
      if (file.path === "package.json") {
        return (
          !workspacePatterns.length ||
          rootManifest?.private !== true
        );
      }
      return workspacePatterns.length
        ? packageMatchesWorkspace(file.path, workspacePatterns)
        : !rootFile;
    });
    const paths = new Set(files.map((file) => file.path));
    const packages: WorkspacePackage[] = [];
    const pathMappings: Record<string, string[]> = {};

    for (const file of selectedManifests) {
      const manifest = parseJson(file, warnings) as PackageManifest | null;
      if (!manifest) continue;
      const analyzed = packageAnalysis(file.path, manifest, paths);
      if (!analyzed) {
        warnings.push(`${file.path} does not declare a package name.`);
        continue;
      }
      packages.push(analyzed.package);
      for (const [specifier, targets] of Object.entries(analyzed.mappings)) {
        pathMappings[specifier] = [
          ...new Set([...(pathMappings[specifier] ?? []), ...targets]),
        ];
      }
    }

    packages.sort((left, right) => left.name.localeCompare(right.name));
    return {
      rootManifestPath: rootFile?.path ?? null,
      workspacePatterns,
      packages,
      pathMappings,
      warnings: [...new Set(warnings)],
    };
  }
}
