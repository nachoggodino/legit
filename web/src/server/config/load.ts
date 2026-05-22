import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { copisaurusConfigSchema, type CopisaurusConfig } from "./schema";

const DEFAULT_CONFIG_PATH = "/config/copisaurus.yaml";

export class ConfigLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConfigLoadError";
  }
}

export function parseConfigText(source: string): CopisaurusConfig {
  const parsed = YAML.parse(source);
  return copisaurusConfigSchema.parse(parsed);
}

export function parseConfigFile(filePath: string): CopisaurusConfig {
  const source = fs.readFileSync(/* turbopackIgnore: true */ filePath, "utf8");
  return parseConfigText(source);
}

export function resolveConfigPath(): string {
  const configuredPath = process.env.COPISAURUS_CONFIG_PATH ?? DEFAULT_CONFIG_PATH;
  if (fs.existsSync(/* turbopackIgnore: true */ configuredPath)) {
    return configuredPath;
  }

  if (process.env.NODE_ENV !== "production") {
    return path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "copisaurus.example.yaml");
  }

  throw new ConfigLoadError(
    `Missing Copisaurus config at ${configuredPath}. Mount /config/copisaurus.yaml or set COPISAURUS_CONFIG_PATH.`,
  );
}

export function loadConfig(): CopisaurusConfig {
  return parseConfigFile(resolveConfigPath());
}

export function loadConfigForShell(): CopisaurusConfig | null {
  try {
    return loadConfig();
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      return null;
    }
    throw error;
  }
}
