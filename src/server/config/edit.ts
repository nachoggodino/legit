import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { loadConfig, parseConfigFile, resolveConfigPath } from "./load";
import { legitConfigSchema, repositoryConfigSchema, type LegitConfig } from "./schema";

export class ConfigEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigEditError";
  }
}

const safeRepoEditSchema = z.object({
  id: z.string().min(1),
  name: repositoryConfigSchema.shape.name,
  slug: repositoryConfigSchema.shape.slug,
  visibility: repositoryConfigSchema.shape.visibility,
  defaultBranch: repositoryConfigSchema.shape.defaultBranch,
  docsPath: repositoryConfigSchema.shape.docsPath,
  aiEnabled: z.boolean(),
  commit: repositoryConfigSchema.shape.commit,
});

export type SafeRepoEditInput = z.input<typeof safeRepoEditSchema>;

export function isConfigWritable(filePath = resolveConfigPath()): boolean {
  try {
    fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK);
    fs.accessSync(path.dirname(filePath), fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function updateSafeRepositoryConfig(input: unknown, filePath = resolveConfigPath()) {
  if (!isConfigWritable(filePath)) {
    throw new ConfigEditError("Config file is read-only. Editing is disabled for this deployment.");
  }

  const parsedInput = safeRepoEditSchema.parse(input);
  const current = loadConfig();
  const repoIndex = current.repos.findIndex((repo) => repo.id === parsedInput.id);
  if (repoIndex === -1) {
    throw new ConfigEditError("Repository not found.");
  }

  const next: LegitConfig = {
    ...current,
    repos: current.repos.map((repo, index) =>
      index === repoIndex
        ? {
            ...repo,
            name: parsedInput.name,
            slug: parsedInput.slug,
            visibility: parsedInput.visibility,
            defaultBranch: parsedInput.defaultBranch,
            docsPath: parsedInput.docsPath,
            ai: { ...repo.ai, enabled: parsedInput.aiEnabled },
            commit: parsedInput.commit,
          }
        : repo,
    ),
  };
  const validated = legitConfigSchema.parse(next);

  const backupPath = `${filePath}.${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);

  fs.copyFileSync(filePath, backupPath);
  fs.writeFileSync(temporaryPath, YAML.stringify(validated), { encoding: "utf8", mode: 0o600 });
  parseConfigFile(temporaryPath);
  fs.renameSync(temporaryPath, filePath);
  const reread = parseConfigFile(filePath);

  return { config: reread, backupPath };
}
