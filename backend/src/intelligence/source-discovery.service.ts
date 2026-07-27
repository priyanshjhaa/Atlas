import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import type { RepositorySourceFile } from "./intelligence.types";

const maxEligibleFiles = 2_000;
const maxTotalTextBytes = 25 * 1024 * 1024;
const maxFileBytes = 1024 * 1024;

const ignoredDirectories = new Set([
  ".git",
  ".next",
  "__generated__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "tmp",
  "vendor",
]);

const ignoredFiles = new Set([
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

const languages = new Map([
  [".ts", "typescript"],
  [".tsx", "tsx"],
  [".js", "javascript"],
  [".jsx", "jsx"],
  [".mjs", "mjs"],
  [".cjs", "cjs"],
  [".md", "markdown"],
  [".mdx", "mdx"],
  [".json", "json"],
  [".yml", "yaml"],
  [".yaml", "yaml"],
  [".toml", "toml"],
  [".prisma", "prisma"],
]);

@Injectable()
export class SourceDiscoveryService {
  async collect(rootPath: string): Promise<RepositorySourceFile[]> {
    const files: RepositorySourceFile[] = [];
    let totalBytes = 0;

    const visit = async (directory: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!ignoredDirectories.has(entry.name)) {
            await visit(join(directory, entry.name));
          }
          continue;
        }
        if (!entry.isFile() || ignoredFiles.has(entry.name)) continue;

        const absolutePath = join(directory, entry.name);
        const path = relative(rootPath, absolutePath).split(sep).join("/");
        const language = path.endsWith(".env.example")
          ? "dotenv"
          : languages.get(extname(path));
        if (!language) continue;

        const buffer = await readFile(absolutePath);
        if (buffer.byteLength > maxFileBytes) continue;
        if (files.length >= maxEligibleFiles) {
          throw new Error(
            `Repository exceeds the ${maxEligibleFiles}-file ingestion limit.`,
          );
        }
        if (totalBytes + buffer.byteLength > maxTotalTextBytes) {
          throw new Error("Repository exceeds the 25 MB source-text limit.");
        }

        const content = buffer.toString("utf8");
        totalBytes += buffer.byteLength;
        files.push({
          path,
          language,
          content,
          checksum: createHash("sha256").update(content).digest("hex"),
          sizeBytes: buffer.byteLength,
        });
      }
    };

    await visit(rootPath);
    if (!files.length) {
      throw new Error("No supported source files were found.");
    }
    return files.sort((left, right) => left.path.localeCompare(right.path));
  }
}
