import path from "node:path";
import type { RepositoryConfig } from "@/server/config";
import { documentPathToRoutePath, resolveDocumentPath } from "@/server/docs/paths";
import { defaultGitRunner, resolveRepoPath, type GitRunner } from "./index";

export type DocumentCommitOperation = "create" | "edit" | "rename" | "delete";
export type DocumentCommitResult = {
  committed: boolean;
  commit: string | null;
  mode: RepositoryConfig["commit"]["mode"];
  branch: string | null;
  remoteUrl: null;
  phase7Pending: boolean;
};

function commitMessage(operation: DocumentCommitOperation, documentPath: string): string {
  const title = documentPathToRoutePath(documentPath) || "index";
  return `${operation} docs ${title}`;
}

export async function commitDocumentChange(
  repo: RepositoryConfig,
  operation: DocumentCommitOperation,
  documentPaths: string[],
  options: { reposRoot?: string; runner?: GitRunner } = {},
): Promise<DocumentCommitResult> {
  const runner = options.runner ?? defaultGitRunner;
  const repoPath = resolveRepoPath(repo.id, options.reposRoot);
  let branch: string | null = null;
  const relativePaths = documentPaths.map((documentPath) => {
    const resolved = resolveDocumentPath(repo, documentPath, { markdownOnly: true, reposRoot: options.reposRoot });
    return path.relative(repoPath, resolved.absolutePath).replace(/\\/g, "/");
  });

  if (repo.commit.mode !== "direct") {
    branch = `${repo.commit.branchPrefix}${crypto.randomUUID()}`;
    await runner(["checkout", "-B", branch, repo.commit.targetBranch], { cwd: repoPath });
  }

  await runner(["add", "--", ...relativePaths], { cwd: repoPath });
  const status = await runner(["status", "--porcelain", "--", ...relativePaths], { cwd: repoPath });
  if (!status.trim()) {
    return {
      committed: false,
      commit: null,
      mode: repo.commit.mode,
      branch,
      remoteUrl: null,
      phase7Pending: repo.commit.mode !== "direct",
    };
  }

  await runner(["commit", "-m", commitMessage(operation, documentPaths[documentPaths.length - 1] ?? documentPaths[0] ?? "document.md")], {
    cwd: repoPath,
  });
  const commit = await runner(["rev-parse", "HEAD"], { cwd: repoPath });
  return {
    committed: true,
    commit,
    mode: repo.commit.mode,
    branch,
    remoteUrl: null,
    phase7Pending: repo.commit.mode !== "direct",
  };
}
