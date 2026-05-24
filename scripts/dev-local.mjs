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
const env = {
  ...process.env,
  ...fileEnv,
  AUTH_SECRET: process.env.AUTH_SECRET ?? fileEnv.AUTH_SECRET ?? "legit-local-dev-secret",
  AUTH_URL: process.env.AUTH_URL ?? fileEnv.AUTH_URL ?? "http://localhost:3000",
  LEGIT_CONFIG_PATH: process.env.LEGIT_CONFIG_PATH ?? fileEnv.LEGIT_CONFIG_PATH ?? "./config/legit.local.yaml",
  LEGIT_DATABASE_PATH:
    process.env.LEGIT_DATABASE_PATH ?? fileEnv.LEGIT_DATABASE_PATH ?? "./.codex-dev/legit.db",
  LEGIT_REPOS_ROOT: process.env.LEGIT_REPOS_ROOT ?? fileEnv.LEGIT_REPOS_ROOT ?? "./.codex-dev/repos",
  LEGIT_DISABLE_SYNC_SCHEDULER:
    process.env.LEGIT_DISABLE_SYNC_SCHEDULER ?? fileEnv.LEGIT_DISABLE_SYNC_SCHEDULER ?? "true",
};

const databasePath = env.LEGIT_DATABASE_PATH;
if (databasePath && databasePath !== ":memory:") {
  fs.mkdirSync(path.resolve(root, path.dirname(databasePath)), { recursive: true });
}

const reposRoot = env.LEGIT_REPOS_ROOT;
if (reposRoot) {
  fs.mkdirSync(path.resolve(root, reposRoot), { recursive: true });
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
