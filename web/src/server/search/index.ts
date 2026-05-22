import { spawn } from "node:child_process";
import fs from "node:fs";
import { and, eq } from "drizzle-orm";
import type { RepositoryConfig } from "@/server/config";
import { documentMetadata, getRuntimeDatabase, repoSyncState, type DbClient } from "@/server/db";
import { buildDocsTree, resolveDocsRoot, resolveDocumentPath } from "@/server/docs";
import { renderMarkdown } from "@/server/markdown";

export type SearchResult = {
  repoId: string;
  path: string;
  line: number;
  snippet: string;
  title?: string | null;
};

export type RipgrepRunner = (
  args: string[],
  options: { cwd: string; timeoutMs: number },
) => Promise<{ stdout: string; timedOut?: boolean }>;

export class SearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchError";
  }
}

export const SEARCH_TIMEOUT_MS = 3000;
export const AI_CONTEXT_SEARCH_TIMEOUT_MS = 2500;

export function buildRipgrepArgs(query: string, options: { maxResults: number }): string[] {
  return [
    "--json",
    "--line-number",
    "--with-filename",
    "--context",
    "1",
    "--glob",
    "*.md",
    "--max-count",
    String(Math.max(1, options.maxResults)),
    "--",
    query,
    ".",
  ];
}

export function defaultRipgrepRunner(
  args: string[],
  options: { cwd: string; timeoutMs: number },
): Promise<{ stdout: string; timedOut?: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn("rg", args, {
      cwd: options.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({ stdout, timedOut: true });
      } else if (code === 0 || code === 1) {
        resolve({ stdout });
      } else {
        reject(new SearchError(stderr.trim() || `ripgrep exited with code ${code}`));
      }
    });
  });
}

function parseRipgrepJson(repoId: string, output: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    let event: {
      type: string;
      data?: { path?: { text?: string }; lines?: { text?: string }; line_number?: number };
    };

    try {
      event = JSON.parse(line) as typeof event;
    } catch (error) {
      throw new SearchError(`ripgrep returned malformed JSON: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (event.type !== "match" || !event.data?.path?.text || !event.data.lines?.text) {
      continue;
    }

    const relativePath = event.data.path.text.replace(/\\/g, "/");
    if (!relativePath.toLowerCase().endsWith(".md")) {
      continue;
    }

    results.push({
      repoId,
      path: relativePath,
      line: event.data.line_number ?? 1,
      snippet: event.data.lines.text.trim(),
    });

    if (results.length >= maxResults) {
      break;
    }
  }

  return results;
}

function enrichSearchResults(results: SearchResult[], options: { db?: DbClient } = {}): SearchResult[] {
  if (results.length === 0) {
    return results;
  }

  let db = options.db;
  if (!db) {
    try {
      db = getRuntimeDatabase().db;
    } catch {
      return results;
    }
  }

  return results.map((result) => {
    const metadata = db
      .select({ title: documentMetadata.title })
      .from(documentMetadata)
      .where(and(eq(documentMetadata.repoId, result.repoId), eq(documentMetadata.path, result.path)))
      .get();

    return { ...result, title: metadata?.title ?? result.title ?? null };
  });
}

export async function searchRepositoryDocs(
  repo: Pick<RepositoryConfig, "id" | "docsPath">,
  query: string,
  options: {
    maxResults?: number;
    timeoutMs?: number;
    runner?: RipgrepRunner;
    reposRoot?: string;
    db?: DbClient;
  } = {},
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const maxResults = Math.min(Math.max(options.maxResults ?? 20, 1), 50);
  const docsRoot = resolveDocsRoot(repo, options.reposRoot);
  const runner = options.runner ?? defaultRipgrepRunner;
  const { stdout } = await runner(buildRipgrepArgs(trimmed, { maxResults }), {
    cwd: docsRoot,
    timeoutMs: options.timeoutMs ?? SEARCH_TIMEOUT_MS,
  });

  return enrichSearchResults(parseRipgrepJson(repo.id, stdout, maxResults), { db: options.db });
}

function summarizeMarkdown(source: string): string | null {
  const frontmatterEnd = source.startsWith("---\n") ? source.indexOf("\n---", 4) : -1;
  const withoutFrontmatter = frontmatterEnd >= 0 ? source.slice(frontmatterEnd + 4) : source;
  const paragraph = withoutFrontmatter
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .find((block) => block && !block.startsWith("#") && !block.startsWith("```"));

  return paragraph ? paragraph.replace(/\s+/g, " ").slice(0, 300) : null;
}

export function upsertDocumentMetadata(
  db: DbClient,
  repoId: string,
  markdownPath: string,
  source: string,
  lastIndexedCommit?: string | null,
) {
  const rendered = renderMarkdown(source, { currentPath: markdownPath });
  const now = new Date();

  db.insert(documentMetadata)
    .values({
      repoId,
      path: markdownPath,
      title: rendered.title,
      headings: rendered.headings,
      frontmatter: rendered.frontmatter,
      summary: summarizeMarkdown(source),
      contentHash: rendered.contentHash,
      lastIndexedCommit: lastIndexedCommit ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [documentMetadata.repoId, documentMetadata.path],
      set: {
        title: rendered.title,
        headings: rendered.headings,
        frontmatter: rendered.frontmatter,
        summary: summarizeMarkdown(source),
        contentHash: rendered.contentHash,
        lastIndexedCommit: lastIndexedCommit ?? null,
        updatedAt: now,
      },
    })
    .run();

  return rendered;
}

export function reindexRepositoryDocuments(
  db: DbClient,
  repo: Pick<RepositoryConfig, "id" | "docsPath">,
  options: { reposRoot?: string; commit?: string | null } = {},
): number {
  const docsRoot = resolveDocsRoot(repo, options.reposRoot);
  if (!fs.existsSync(docsRoot)) {
    return 0;
  }

  const commit =
    options.commit ??
    db.select({ commit: repoSyncState.lastSyncedCommit }).from(repoSyncState).where(eq(repoSyncState.repoId, repo.id)).get()
      ?.commit ??
    null;
  let count = 0;

  for (const item of buildDocsTree(repo, { reposRoot: options.reposRoot })) {
    const resolved = resolveDocumentPath(repo, item.markdownPath, { markdownOnly: true, reposRoot: options.reposRoot });
    upsertDocumentMetadata(db, repo.id, item.markdownPath, fs.readFileSync(resolved.absolutePath, "utf8"), commit);
    count += 1;
  }

  return count;
}

export function readCandidateFiles(
  repo: Pick<RepositoryConfig, "id" | "docsPath">,
  paths: string[],
  options: { reposRoot?: string; maxBytes?: number } = {},
) {
  const maxBytes = options.maxBytes ?? 80_000;
  return paths.map((candidatePath) => {
    const resolved = resolveDocumentPath(repo, candidatePath, { markdownOnly: true, reposRoot: options.reposRoot });
    const source = fs.readFileSync(resolved.absolutePath, "utf8").slice(0, maxBytes);
    return { path: candidatePath, source };
  });
}
