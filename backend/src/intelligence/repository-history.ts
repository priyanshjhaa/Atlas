import type { GitHubRepositoryHistory } from "../connectors/github-app.service";

export const MAX_PERSISTED_HISTORY_COMMITS = 300;
export const MAX_PERSISTED_HISTORY_FILES = 300;

export function boundRepositoryHistory(
  history: GitHubRepositoryHistory,
): GitHubRepositoryHistory {
  const commits = [
    ...new Map(
      history.commits.map((commit) => [commit.sha, commit]),
    ).values(),
  ].slice(0, MAX_PERSISTED_HISTORY_COMMITS);
  const files = [
    ...new Map(history.files.map((file) => [file.path, file])).values(),
  ].slice(0, MAX_PERSISTED_HISTORY_FILES);

  return {
    ...history,
    commits,
    files,
    commitsTruncated:
      history.commitsTruncated || history.commits.length > commits.length,
    filesTruncated:
      history.filesTruncated || history.files.length > files.length,
  };
}
