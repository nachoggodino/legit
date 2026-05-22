import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

export const DEFAULT_DATABASE_PATH = "/data/copisaurus.db";
const DEFAULT_MIGRATIONS_FOLDER = path.resolve(process.cwd(), "drizzle");

export type DbClient = BetterSQLite3Database<typeof schema>;
export type SqliteDatabaseHandle = ReturnType<typeof createSqliteDatabase>;

let runtimeDatabase: SqliteDatabaseHandle | null = null;

function isProductionBuild(): boolean {
  return process.env.COPISAURUS_BUILD_PHASE === "1" || process.env.NEXT_PHASE === "phase-production-build";
}

export function resolveDatabasePath(): string {
  if (process.env.COPISAURUS_DATABASE_PATH) {
    return process.env.COPISAURUS_DATABASE_PATH;
  }

  if (isProductionBuild()) {
    return path.join(os.tmpdir(), "copisaurus-build.db");
  }

  return DEFAULT_DATABASE_PATH;
}

export function createSqliteDatabase(databasePath = resolveDatabasePath()) {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  initializeSchema(db);

  return {
    sqlite,
    db,
  };
}

export function initializeSchema(db: DbClient, migrationsFolder = DEFAULT_MIGRATIONS_FOLDER): void {
  migrate(db, { migrationsFolder });
  db.run(sql`
    CREATE TABLE IF NOT EXISTS document_metadata (
      repo_id text NOT NULL REFERENCES repositories(id) ON DELETE cascade,
      path text NOT NULL,
      title text,
      headings text NOT NULL,
      frontmatter text NOT NULL,
      summary text,
      content_hash text NOT NULL,
      last_indexed_commit text,
      updated_at integer NOT NULL,
      PRIMARY KEY (repo_id, path)
    )
  `);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS audit_events (
      id text PRIMARY KEY NOT NULL,
      actor_id text,
      repo_id text,
      operation text NOT NULL,
      document_path text,
      metadata text,
      created_at integer NOT NULL
    )
  `);
}

export function getRuntimeDatabase(): SqliteDatabaseHandle {
  runtimeDatabase ??= createSqliteDatabase();
  return runtimeDatabase;
}

export function resetRuntimeDatabaseForTests(): void {
  runtimeDatabase?.sqlite.close();
  runtimeDatabase = null;
}
