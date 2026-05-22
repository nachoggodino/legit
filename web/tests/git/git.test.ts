import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildGitAuthEnv, cloneOrPullRepository, redactGitUrl, resolveRepoPath } from "@/server/git";
import type { RepositoryConfig } from "@/server/config";

const repo: RepositoryConfig = {
  id: "research",
  slug: "research",
  name: "Research Wiki",
  provider: "github",
  repoUrl: "https://github.com/example/research.git",
  defaultBranch: "main",
  docsPath: "docs",
  visibility: "private",
  commit: { mode: "merge-request", targetBranch: "main", branchPrefix: "copisaurus/" },
};

describe("git helpers", () => {
  it("builds transient askpass auth env and redacts credentialed URLs", () => {
    const env = buildGitAuthEnv(repo, { COPISAURUS_GITHUB_TOKEN: "secret-token" });

    expect(env.COPISAURUS_GIT_USERNAME).toBe("x-access-token");
    expect(env.COPISAURUS_GIT_PASSWORD).toBe("secret-token");
    expect(env.GIT_ASKPASS).toMatch(/copisaurus-git-askpass/);
    const url = "https://x-access-token:secret-token@github.com/example/research.git";
    expect(redactGitUrl(`failed ${url}`)).toContain("x-access-token:***@github.com");
    expect(redactGitUrl(`failed ${url}`)).not.toContain("secret-token");
  });

  it("rejects repo path traversal", () => {
    const root = path.join(os.tmpdir(), "copisaurus-repos-test");

    expect(resolveRepoPath("safe_repo-1", root)).toBe(path.join(root, "safe_repo-1"));
    expect(() => resolveRepoPath("../escape", root)).toThrow(/unsafe/i);
    expect(() => resolveRepoPath("nested/repo", root)).toThrow(/unsafe/i);
  });

  it("runs clone for missing repositories and pull for existing repositories", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "copisaurus-git-"));
    const calls: Array<{ args: string[]; env?: Record<string, string | undefined> }> = [];
    const runner = async (args: string[], options?: { env?: Record<string, string | undefined> }) => {
      calls.push({ args, env: options?.env });
      return args[0] === "rev-parse" ? "abc123" : "";
    };

    await cloneOrPullRepository(repo, {
      reposRoot: root,
      env: { COPISAURUS_GITHUB_TOKEN: "secret-token" },
      runner,
    });

    expect(calls[0].args).toEqual([
      "clone",
      "--branch",
      "main",
      "--single-branch",
      "https://github.com/example/research.git",
      path.join(root, "research"),
    ]);
    expect(calls[0].env?.COPISAURUS_GIT_PASSWORD).toBe("secret-token");
    expect(calls.flatMap((call) => call.args).join(" ")).not.toContain("secret-token");

    fs.mkdirSync(path.join(root, "research", ".git"), { recursive: true });
    calls.length = 0;

    await cloneOrPullRepository(repo, {
      reposRoot: root,
      env: { COPISAURUS_GITHUB_TOKEN: "secret-token" },
      runner,
    });

    expect(calls.map((call) => call.args[0])).toEqual(["remote", "fetch", "checkout", "pull", "rev-parse"]);
    expect(calls[0].args).toEqual(["remote", "set-url", "origin", "https://github.com/example/research.git"]);
    expect(calls.flatMap((call) => call.args).join(" ")).not.toContain("secret-token");
  });

  it("does not persist service tokens in the cached repository remote config", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "copisaurus-git-config-"));
    const repoPath = path.join(root, repo.id);
    const gitConfigPath = path.join(repoPath, ".git", "config");

    const runner = async (args: string[]) => {
      if (args[0] === "clone") {
        fs.mkdirSync(path.dirname(gitConfigPath), { recursive: true });
        fs.writeFileSync(gitConfigPath, `[remote "origin"]\n\turl = ${args[4]}\n`, "utf8");
      }

      if (args[0] === "remote" && args[1] === "set-url") {
        fs.writeFileSync(gitConfigPath, `[remote "origin"]\n\turl = ${args[3]}\n`, "utf8");
      }

      return args[0] === "rev-parse" ? "abc123" : "";
    };

    await cloneOrPullRepository(repo, {
      reposRoot: root,
      env: { COPISAURUS_GITHUB_TOKEN: "secret-token" },
      runner,
    });

    expect(fs.readFileSync(gitConfigPath, "utf8")).toContain(repo.repoUrl);
    expect(fs.readFileSync(gitConfigPath, "utf8")).not.toContain("secret-token");

    await cloneOrPullRepository(repo, {
      reposRoot: root,
      env: { COPISAURUS_GITHUB_TOKEN: "secret-token" },
      runner,
    });

    expect(fs.readFileSync(gitConfigPath, "utf8")).toContain(repo.repoUrl);
    expect(fs.readFileSync(gitConfigPath, "utf8")).not.toContain("secret-token");
  });
});
