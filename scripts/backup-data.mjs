import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const dataDir = process.env.LEGIT_DATA_DIR ?? path.resolve(process.cwd(), ".codex-dev/data");
const outputDir = process.env.LEGIT_BACKUP_DIR ?? path.resolve(process.cwd(), "backups");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const archivePath = path.join(outputDir, `legit-data-${stamp}.tar.gz`);

if (!fs.existsSync(dataDir)) {
  console.error(`Data directory does not exist: ${dataDir}`);
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });
const result = spawnSync("tar", ["-czf", archivePath, "-C", dataDir, "."], { stdio: "inherit" });

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Backup created at ${archivePath}`);
