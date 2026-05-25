import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const archivePath = process.argv[2];
if (!archivePath) {
  console.error("Usage: node scripts/restore-data.mjs <backup.tar.gz>");
  process.exit(1);
}

const resolvedArchivePath = path.resolve(archivePath);
if (!fs.existsSync(resolvedArchivePath)) {
  console.error(`Backup archive does not exist: ${resolvedArchivePath}`);
  process.exit(1);
}

const dataDir = process.env.LEGIT_DATA_DIR ?? path.resolve(process.cwd(), ".codex-dev/data");
fs.mkdirSync(dataDir, { recursive: true });

const result = spawnSync("tar", ["-xzf", resolvedArchivePath, "-C", dataDir], { stdio: "inherit" });
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Data restored from ${resolvedArchivePath} into ${dataDir}`);
