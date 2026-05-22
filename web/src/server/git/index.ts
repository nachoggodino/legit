import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RepositoryConfig } from "@/server/config";
import { getGitAuthConfig } from "./providers";

export type GitProvider = "github" | "gitlab";
export type SecretEnv = Record<string, string | undefined>;

export const DEFAULT_REPOS_ROOT = "/data/repos";

export class GitConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitConfigError";
  }
}

export class RepoPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepoPathError";
  }
}

export type GitRunnerEnv = Record<string, string | undefined>;
export type GitRunner = (args: string[], options?: { cwd?: string; env?: GitRunnerEnv }) => Promise<string>;

export function resolveRepoPath(repoId: string, reposRoot = process.env.COPISAURUS_REPOS_ROOT ?? DEFAULT_REPOS_ROOT): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(repoId)) {
    throw new RepoPathError("Repository id contains unsafe path characters.");
  }

  const root = path.resolve(reposRoot);
  const repoPath = path.resolve(root, repoId);
  const relative = path.relative(root, repoPath);

  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new RepoPathError("Repository path must resolve under the repository cache root.");
  }

  return repoPath;
}

export function defaultGitRunner(args: string[], options: { cwd?: string; env?: GitRunnerEnv } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(redactGitUrl(stderr.trim() || `git exited with code ${code}`)));
      }
    });
  });
}

export function getGitTokenEnvName(provider: GitProvider): string {
  return getGitAuthConfig(provider).tokenEnvName;
}

export function buildGitAuthEnv(
  repo: Pick<RepositoryConfig, "provider" | "repoUrl">,
  env: SecretEnv = process.env,
): GitRunnerEnv {
  const authConfig = getGitAuthConfig(repo.provider);
  const token = env[authConfig.tokenEnvName];

  if (!token) {
    throw new GitConfigError(`Missing ${authConfig.tokenEnvName} for ${repo.provider} repository sync.`);
  }

  const url = new URL(repo.repoUrl);

  if (url.protocol !== "https:") {
    throw new GitConfigError("Repository URLs that use service credentials must be HTTPS URLs.");
  }

  return {
    GIT_ASKPASS: getAskPassScriptPath(),
    GIT_TERMINAL_PROMPT: "0",
    COPISAURUS_GIT_USERNAME: authConfig.username,
    COPISAURUS_GIT_PASSWORD: token,
  };
}

export function redactGitUrl(value: string): string {
  return value.replace(/(https:\/\/)([^:\s/@]+):([^@\s]+)@/g, "$1$2:***@");
}

let askPassScriptPath: string | null = null;

function getAskPassScriptPath(): string {
  if (askPassScriptPath) {
    return askPassScriptPath;
  }

  const scriptPath = path.join(os.tmpdir(), `copisaurus-git-askpass-${process.pid}.sh`);
  fs.writeFileSync(
    scriptPath,
    [
      "#!/bin/sh",
      "case \"$1\" in",
      "*Username*) printf '%s\\n' \"$COPISAURUS_GIT_USERNAME\" ;;",
      "*) printf '%s\\n' \"$COPISAURUS_GIT_PASSWORD\" ;;",
      "esac",
      "",
    ].join("\n"),
    { mode: 0o700 },
  );
  askPassScriptPath = scriptPath;
  return scriptPath;
}

export async function cloneOrPullRepository(
  repo: RepositoryConfig,
  options: {
    reposRoot?: string;
    runner?: GitRunner;
    env?: SecretEnv;
  } = {},
): Promise<{ repoPath: string; commit: string }> {
  const runner = options.runner ?? defaultGitRunner;
  const repoPath = resolveRepoPath(repo.id, options.reposRoot);
  const gitAuthEnv = buildGitAuthEnv(repo, options.env);

  fs.mkdirSync(path.dirname(repoPath), { recursive: true });

  if (!fs.existsSync(path.join(repoPath, ".git"))) {
    await runner(["clone", "--branch", repo.defaultBranch, "--single-branch", repo.repoUrl, repoPath], { env: gitAuthEnv });
  } else {
    await runner(["remote", "set-url", "origin", repo.repoUrl], { cwd: repoPath });
    await runner(["fetch", "origin", repo.defaultBranch], { cwd: repoPath, env: gitAuthEnv });
    await runner(["checkout", repo.defaultBranch], { cwd: repoPath });
    await runner(["pull", "--ff-only", "origin", repo.defaultBranch], { cwd: repoPath, env: gitAuthEnv });
  }

  const commit = await runner(["rev-parse", "HEAD"], { cwd: repoPath });
  return { repoPath, commit };
}
