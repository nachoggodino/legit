import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { legitConfigSchema, type LegitConfig } from "./schema";

const DEFAULT_CONFIG_PATH = "/config/legit.yaml";

export class ConfigLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConfigLoadError";
  }
}

export function parseConfigText(source: string): LegitConfig {
  const parsed = YAML.parse(source);
  return legitConfigSchema.parse(parsed);
}

export function parseConfigFile(filePath: string): LegitConfig {
  const source = fs.readFileSync(/* turbopackIgnore: true */ filePath, "utf8");
  return parseConfigText(source);
}

export function resolveConfigPath(): string {
  const configuredPath = process.env.LEGIT_CONFIG_PATH ?? DEFAULT_CONFIG_PATH;
  if (fs.existsSync(/* turbopackIgnore: true */ configuredPath)) {
    return configuredPath;
  }

  if (process.env.NODE_ENV !== "production") {
    return path.resolve(/* turbopackIgnore: true */ process.cwd(), "legit.example.yaml");
  }

  throw new ConfigLoadError(
    `Missing Legit config at ${configuredPath}. Mount /config/legit.yaml or set LEGIT_CONFIG_PATH.`,
  );
}

export function loadConfig(): LegitConfig {
  return parseConfigFile(resolveConfigPath());
}

export function loadConfigForShell(): LegitConfig | null {
  try {
    return loadConfig();
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      return null;
    }
    throw error;
  }
}
