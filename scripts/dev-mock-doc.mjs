import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function resolveEnvPath() {
  for (const relativePath of [".env.local", "web/.env.local"]) {
    const candidate = path.join(root, relativePath);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(root, ".env.local");
}

const envPath = resolveEnvPath();

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        if (index === -1) return [line, ""];
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
        return [key, value];
      }),
  );
}

function resolveCommand(base) {
  return process.platform === "win32" ? `${base}.cmd` : base;
}

function ensureFlag(args, names, fallback) {
  if (names.some((name) => args.includes(name))) return args;
  return [...args, ...fallback];
}

const fileEnv = parseEnvFile(envPath);
const defaultMockDocConfigPath = path.resolve(root, "./config/legit.mock-doc.yaml");
const env = {
  ...process.env,
  ...fileEnv,
  AUTH_SECRET: process.env.AUTH_SECRET ?? fileEnv.AUTH_SECRET ?? "legit-local-dev-secret",
  AUTH_URL: process.env.AUTH_URL ?? fileEnv.AUTH_URL ?? "http://localhost:3000",
  // Keep the selected dev mode deterministic. `.env.local` may provide shared
  // secrets and writable paths, but it should not silently switch the repo config.
  LEGIT_CONFIG_PATH: process.env.LEGIT_CONFIG_PATH ?? "./config/legit.mock-doc.yaml",
  LEGIT_DATABASE_PATH: process.env.LEGIT_DATABASE_PATH ?? fileEnv.LEGIT_DATABASE_PATH ?? "./.codex-dev/legit.db",
  LEGIT_REPOS_ROOT: process.env.LEGIT_REPOS_ROOT ?? fileEnv.LEGIT_REPOS_ROOT ?? "./.codex-dev/repos",
};

const selectedConfigPath = path.resolve(root, env.LEGIT_CONFIG_PATH);
const usingDefaultMockDocConfig = selectedConfigPath === defaultMockDocConfigPath;
const required = ["LEGIT_GITHUB_TOKEN", "AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"];
const missing = usingDefaultMockDocConfig ? required.filter((name) => !env[name]) : [];

if (missing.length > 0) {
  console.error("mock-doc dev server is not configured.");
  console.error("");
  console.error(`Missing: ${missing.join(", ")}`);
  console.error("");
  console.error("Create .env.local with:");
  console.error("");
  console.error("AUTH_GITHUB_ID=your-github-oauth-client-id");
  console.error("AUTH_GITHUB_SECRET=your-github-oauth-client-secret");
  console.error("LEGIT_GITHUB_TOKEN=your-service-token-with-access-to-nachoggodino/mock-doc");
  console.error("LEGIT_BOOTSTRAP_ADMIN_EMAILS=your-github-account-email@example.com");
  console.error("");
  console.error("GitHub OAuth callback URL: http://localhost:3000/api/auth/callback/github");
  process.exit(1);
}

const nextArgs = ensureFlag(
  ensureFlag(process.argv.slice(2), ["--port", "-p"], ["--port", "3000"]),
  ["--hostname", "-H"],
  ["--hostname", "localhost"],
);

const child = spawn(resolveCommand("corepack"), ["pnpm", "exec", "next", "dev", ...nextArgs], {
  cwd: root,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 0);
});
