import path from "node:path";
import type { RepositoryConfig } from "@/server/config";
import { documentPathToRoutePath, resolveDocumentPath } from "@/server/docs/paths";
import { buildGitAuthEnv, defaultGitRunner, GitConfigError, resolveRepoPath, type GitRunner, type SecretEnv } from "./index";
import { createGitHostingProvider, type GitHostingProvider } from "./providers";

export type DocumentCommitOperation = "create" | "edit" | "rename" | "delete";
export type DocumentCommitResult = {
  committed: boolean;
  commit: string | null;
  commitUrl: string | null;
  mode: RepositoryConfig["commit"]["mode"];
  branch: string | null;
  branchUrl: string | null;
  pullRequestUrl: string | null;
};
export type CommitWorkflowErrorCode = "auth" | "protected-branch" | "conflict" | "provider-api" | "git";

export class CommitWorkflowError extends Error {
  constructor(
    message: string,
    public readonly code: CommitWorkflowErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CommitWorkflowError";
  }
}

export function isCommitWorkflowError(error: unknown): error is CommitWorkflowError {
  return error instanceof CommitWorkflowError;
}

function commitMessage(operation: DocumentCommitOperation, documentPath: string): string {
  const title = documentPathToRoutePath(documentPath) || "index";
  return `${operation} docs ${title}`;
}

function commitTitle(operation: DocumentCommitOperation, documentPath: string): string {
  return `Copisaurus: ${commitMessage(operation, documentPath)}`;
}

function commitDescription(operation: DocumentCommitOperation, documentPaths: string[]): string {
  return [
    `Copisaurus ${operation} operation for Markdown documentation.`,
    "",
    "Changed paths:",
    ...documentPaths.map((documentPath) => `- ${documentPath}`),
  ].join("\n");
}

function makeWorkflowBranch(repo: RepositoryConfig, operation: DocumentCommitOperation, documentPath: string): string {
  const routePath = documentPathToRoutePath(documentPath) || "index";
  const slug = routePath
    .toLowerCase()
    .replace(/[^a-z0-9/-]+/g, "-")
    .replace(/\/+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${repo.commit.branchPrefix}${operation}-${slug || "document"}-${crypto.randomUUID().slice(0, 8)}`;
}

function classifyGitError(error: unknown): CommitWorkflowError {
  if (error instanceof GitConfigError) {
    return new CommitWorkflowError(error.message, "auth", { cause: error });
  }

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("protected branch") || lower.includes("pre-receive hook declined") || lower.includes("deny updating")) {
    return new CommitWorkflowError("Target branch is protected. Use the merge-request commit mode or change the target branch.", "protected-branch", {
      cause: error,
    });
  }
  if (lower.includes("conflict") || lower.includes("non-fast-forward") || lower.includes("fetch first")) {
    return new CommitWorkflowError("Git rejected the write because the branch has conflicting remote changes.", "conflict", {
      cause: error,
    });
  }
  if (lower.includes("authentication") || lower.includes("authorization") || lower.includes("permission denied")) {
    return new CommitWorkflowError("Git service credentials could not authorize this write.", "auth", { cause: error });
  }
  if (lower.includes("pull request") || lower.includes("merge request") || lower.includes("api")) {
    return new CommitWorkflowError(message, "provider-api", { cause: error });
  }

  return new CommitWorkflowError(message || "Git commit workflow failed.", "git", { cause: error });
}

export async function commitDocumentChange(
  repo: RepositoryConfig,
  operation: DocumentCommitOperation,
  documentPaths: string[],
  options: { reposRoot?: string; runner?: GitRunner; provider?: GitHostingProvider; env?: SecretEnv } = {},
): Promise<DocumentCommitResult> {
  const runner = options.runner ?? defaultGitRunner;
  const provider = options.provider ?? createGitHostingProvider(repo.provider);
  const repoPath = resolveRepoPath(repo.id, options.reposRoot);
  let branch: string | null = null;
  let branchUrl: string | null = null;
  let pullRequestUrl: string | null = null;
  let shouldResetTargetBranch = false;
  let shouldRestoreTargetBranch = false;
  let workflowError: unknown = null;
  const gitAuthEnv = buildGitAuthEnv(repo, options.env);
  const relativePaths = documentPaths.map((documentPath) => {
    const resolved = resolveDocumentPath(repo, documentPath, { markdownOnly: true, reposRoot: options.reposRoot });
    return path.relative(repoPath, resolved.absolutePath).replace(/\\/g, "/");
  });

  try {
    await runner(["fetch", "origin", repo.commit.targetBranch], { cwd: repoPath, env: gitAuthEnv });

    if (repo.commit.mode === "direct") {
      await runner(["checkout", repo.commit.targetBranch], { cwd: repoPath });
      shouldResetTargetBranch = true;
      await runner(["pull", "--ff-only", "origin", repo.commit.targetBranch], { cwd: repoPath, env: gitAuthEnv });
    } else {
      branch = makeWorkflowBranch(repo, operation, documentPaths[documentPaths.length - 1] ?? documentPaths[0] ?? "document.md");
      branchUrl = provider.getBranchUrl(repo, branch);
      await runner(["checkout", "-B", branch, `origin/${repo.commit.targetBranch}`], { cwd: repoPath });
      shouldRestoreTargetBranch = true;
    }

    await runner(["add", "--", ...relativePaths], { cwd: repoPath });
    const status = await runner(["status", "--porcelain", "--", ...relativePaths], { cwd: repoPath });
    if (!status.trim()) {
      return {
        committed: false,
        commit: null,
        commitUrl: null,
        mode: repo.commit.mode,
        branch,
        branchUrl,
        pullRequestUrl: null,
      };
    }

    const message = commitMessage(operation, documentPaths[documentPaths.length - 1] ?? documentPaths[0] ?? "document.md");
    await runner(["commit", "-m", message], { cwd: repoPath });
    const commit = await runner(["rev-parse", "HEAD"], { cwd: repoPath });

    if (repo.commit.mode === "direct") {
      await runner(["push", "origin", `HEAD:${repo.commit.targetBranch}`], { cwd: repoPath, env: gitAuthEnv });
    } else if (branch) {
      await runner(["push", "-u", "origin", branch], { cwd: repoPath, env: gitAuthEnv });
    }

    const commitUrl = provider.getCommitUrl(repo, commit);
    if (repo.commit.mode === "merge-request" && branch) {
      pullRequestUrl = (
        await provider.createMergeRequest(repo, {
          sourceBranch: branch,
          targetBranch: repo.commit.targetBranch,
          title: commitTitle(operation, documentPaths[documentPaths.length - 1] ?? documentPaths[0] ?? "document.md"),
          description: commitDescription(operation, documentPaths),
        })
      ).url;
    }

    return {
      committed: true,
      commit,
      commitUrl,
      mode: repo.commit.mode,
      branch,
      branchUrl,
      pullRequestUrl,
    };
  } catch (error) {
    workflowError = error;
    if (shouldResetTargetBranch) {
      try {
        await runner(["checkout", repo.commit.targetBranch], { cwd: repoPath });
        await runner(["reset", "--hard", `origin/${repo.commit.targetBranch}`], { cwd: repoPath });
      } catch {
        // Preserve the original workflow failure; callers also roll back touched document files.
      }
    }
    throw classifyGitError(error);
  } finally {
    if (shouldRestoreTargetBranch) {
      try {
        await runner(["checkout", repo.commit.targetBranch], { cwd: repoPath });
        await runner(["pull", "--ff-only", "origin", repo.commit.targetBranch], { cwd: repoPath, env: gitAuthEnv });
      } catch (restoreError) {
        if (!workflowError) {
          throw classifyGitError(restoreError);
        }
      }
    }
  }
}
