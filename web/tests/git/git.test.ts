import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildGitAuthEnv, cloneOrPullRepository, redactGitUrl, resolveRepoPath } from "@/server/git";
import { commitDocumentChange } from "@/server/git/commit";
import { createGitHubProvider } from "@/server/git/providers/github";
import { createGitLabProvider } from "@/server/git/providers/gitlab";
import { makeTestRepo } from "../fixtures/config";

const repo = makeTestRepo();

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

  it("runs branch workflow with service credentials and returns URLs", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "copisaurus-commit-"));
    fs.mkdirSync(path.join(root, repo.id, "docs"), { recursive: true });
    fs.writeFileSync(path.join(root, repo.id, "docs", "index.md"), "# Commit", "utf8");
    const calls: string[][] = [];

    const result = await commitDocumentChange(repo, "edit", ["index.md"], {
      reposRoot: root,
      env: { COPISAURUS_GITHUB_TOKEN: "secret-token" },
      provider: {
        getCommitUrl: (_repo, commit) => `https://github.test/commit/${commit}`,
        getBranchUrl: (_repo, branch) => `https://github.test/tree/${branch}`,
        createMergeRequest: async () => ({ url: "https://github.test/pull/1" }),
      },
      runner: async (args) => {
        calls.push(args);
        if (args[0] === "status") return "M docs/index.md";
        if (args[0] === "rev-parse") return "abc123";
        return "";
      },
    });

    expect(calls[0]).toEqual(["fetch", "origin", "main"]);
    expect(calls[1]).toEqual(["checkout", "-B", expect.stringMatching(/^copisaurus\/edit-index-/), "origin/main"]);
    expect(calls).toContainEqual(["push", "-u", "origin", expect.stringMatching(/^copisaurus\/edit-index-/)]);
    expect(calls.slice(-2)).toEqual([
      ["checkout", "main"],
      ["pull", "--ff-only", "origin", "main"],
    ]);
    expect(result).toEqual({
      committed: true,
      commit: "abc123",
      commitUrl: "https://github.test/commit/abc123",
      mode: "merge-request",
      branch: expect.stringMatching(/^copisaurus\/edit-index-/),
      branchUrl: expect.stringMatching(/^https:\/\/github.test\/tree\/copisaurus\/edit-index-/),
      pullRequestUrl: "https://github.test/pull/1",
    });
  });

  it("creates GitHub pull requests through the provider API without exposing tokens", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const provider = createGitHubProvider({
      env: { COPISAURUS_GITHUB_TOKEN: "secret-token" } as unknown as NodeJS.ProcessEnv,
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return Response.json({ html_url: "https://github.com/example/research/pull/7" });
      },
    });

    const result = await provider.createMergeRequest(repo, {
      sourceBranch: "copisaurus/edit-index-abc",
      targetBranch: "main",
      title: "Update docs",
      description: "No secrets here.",
    });

    expect(result.url).toBe("https://github.com/example/research/pull/7");
    expect(calls[0].url).toBe("https://api.github.com/repos/example/research/pulls");
    expect(JSON.stringify(calls[0].init.body)).not.toContain("secret-token");
  });

  it("creates GitLab merge requests through the provider API", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const provider = createGitLabProvider({
      env: { COPISAURUS_GITLAB_TOKEN: "secret-token" } as unknown as NodeJS.ProcessEnv,
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return Response.json({ web_url: "https://gitlab.example.com/group/research/-/merge_requests/7" });
      },
    });
    const gitlabRepo = makeTestRepo({ provider: "gitlab", repoUrl: "https://gitlab.example.com/group/research.git" });

    const result = await provider.createMergeRequest(gitlabRepo, {
      sourceBranch: "copisaurus/edit-index-abc",
      targetBranch: "main",
      title: "Update docs",
      description: "No secrets here.",
    });

    expect(result.url).toBe("https://gitlab.example.com/group/research/-/merge_requests/7");
    expect(calls[0].url).toBe("https://gitlab.example.com/api/v4/projects/group%2Fresearch/merge_requests");
    expect(JSON.stringify(calls[0].init.body)).not.toContain("secret-token");
  });

  it("classifies provider API failures in merge-request mode", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "copisaurus-provider-fail-"));
    fs.mkdirSync(path.join(root, repo.id, "docs"), { recursive: true });
    fs.writeFileSync(path.join(root, repo.id, "docs", "index.md"), "# Commit", "utf8");

    const calls: string[][] = [];

    await expect(
      commitDocumentChange(repo, "edit", ["index.md"], {
        reposRoot: root,
        env: { COPISAURUS_GITHUB_TOKEN: "secret-token" },
        provider: {
          getCommitUrl: () => "https://git.example/commit/abc",
          getBranchUrl: () => "https://git.example/branch",
          createMergeRequest: async () => {
            throw new Error("GitHub pull request creation failed: validation failed");
          },
        },
        runner: async (args) => {
          calls.push(args);
          if (args[0] === "status") return "M docs/index.md";
          if (args[0] === "rev-parse") return "abc123";
          return "";
        },
      }),
    ).rejects.toMatchObject({ code: "provider-api" });
    expect(calls.slice(-2)).toEqual([
      ["checkout", "main"],
      ["pull", "--ff-only", "origin", "main"],
    ]);
  });
});
