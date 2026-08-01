import { describe, expect, it } from "vitest";
import type {
  GitHubCommitHistoryItem,
  GitHubHistoryFile,
  GitHubRepositoryHistory,
} from "../src/connectors/github-app.service";
import {
  boundRepositoryHistory,
  MAX_PERSISTED_HISTORY_COMMITS,
  MAX_PERSISTED_HISTORY_FILES,
} from "../src/intelligence/repository-history";

function commit(index: number): GitHubCommitHistoryItem {
  return {
    sha: `sha-${index}`,
    message: `Commit ${index}`,
    htmlUrl: `https://github.com/atlas/api/commit/sha-${index}`,
    authorName: "Atlas Engineer",
    authorLogin: "atlas-engineer",
    authoredAt: "2026-08-01T00:00:00.000Z",
    committedAt: "2026-08-01T00:00:00.000Z",
    parentShas: [`parent-${index}`],
  };
}

function file(index: number): GitHubHistoryFile {
  return {
    path: `src/file-${index}.ts`,
    previousPath: null,
    status: "modified",
    additions: 1,
    deletions: 1,
    changes: 2,
  };
}

describe("boundRepositoryHistory", () => {
  it("deduplicates and bounds persisted commits and file changes", () => {
    const history: GitHubRepositoryHistory = {
      baseRevision: "base",
      headRevision: "head",
      status: "ahead",
      aheadBy: 400,
      behindBy: 0,
      totalCommits: 400,
      commits: [
        ...Array.from({ length: 350 }, (_, index) => commit(index)),
        commit(1),
      ],
      files: [
        ...Array.from({ length: 325 }, (_, index) => file(index)),
        file(1),
      ],
      commitsTruncated: false,
      filesTruncated: false,
    };

    const bounded = boundRepositoryHistory(history);

    expect(bounded.commits).toHaveLength(MAX_PERSISTED_HISTORY_COMMITS);
    expect(bounded.files).toHaveLength(MAX_PERSISTED_HISTORY_FILES);
    expect(new Set(bounded.commits.map((item) => item.sha)).size).toBe(
      bounded.commits.length,
    );
    expect(new Set(bounded.files.map((item) => item.path)).size).toBe(
      bounded.files.length,
    );
    expect(bounded.commitsTruncated).toBe(true);
    expect(bounded.filesTruncated).toBe(true);
  });

  it("preserves provider truncation signals within the persistence limits", () => {
    const bounded = boundRepositoryHistory({
      baseRevision: null,
      headRevision: "head",
      status: "recent",
      aheadBy: 1,
      behindBy: 0,
      totalCommits: 1,
      commits: [commit(1)],
      files: [file(1)],
      commitsTruncated: true,
      filesTruncated: true,
    });

    expect(bounded.commitsTruncated).toBe(true);
    expect(bounded.filesTruncated).toBe(true);
  });
});
