import fs from "node:fs";
import path from "node:path";
import type { RepositoryConfig } from "@/server/config";
import { recordAuditEvent } from "@/server/audit";
import { commitDocumentChange } from "@/server/git/commit";
import type { GitRunner } from "@/server/git";
import { buildRipgrepArgs, type RipgrepRunner, defaultRipgrepRunner } from "@/server/search";
import { withRepoLock } from "@/server/sync";
import { resolveDocsRoot, resolveDocumentPath, validateRelativePath } from "./paths";

export type DocumentFileOperation = "create" | "edit" | "rename" | "delete";
type CommitCapableRepo = Pick<RepositoryConfig, "id" | "docsPath"> & Partial<Pick<RepositoryConfig, "commit">>;
const LINK_IMPACT_SCAN_TIMEOUT_MS = 1500;

function atomicWriteFile(filePath: string, source: string): void {
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temporaryPath, source, "utf8");
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}

async function maybeRecordAudit(
  repo: Pick<RepositoryConfig, "id">,
  options: { actorId?: string | null },
  event: Omit<Parameters<typeof recordAuditEvent>[0], "actorId" | "repoId" | "createdAt">,
) {
  if (options.actorId === undefined) {
    return;
  }

  await recordAuditEvent({
    actorId: options.actorId,
    repoId: repo.id,
    ...event,
    createdAt: new Date(),
  });
}

async function maybeCommitChange(
  repo: CommitCapableRepo,
  operation: DocumentFileOperation,
  documentPaths: string[],
  options: { reposRoot?: string; commitRunner?: GitRunner },
) {
  if (!repo.commit) {
    return { committed: false, commit: null };
  }

  return commitDocumentChange(repo as RepositoryConfig, operation, documentPaths, {
    reposRoot: options.reposRoot,
    runner: options.commitRunner,
  });
}

export function readMarkdownDocument(repo: Pick<RepositoryConfig, "id" | "docsPath">, documentPath: string, options: { reposRoot?: string } = {}) {
  const resolved = resolveDocumentPath(repo, documentPath, { markdownOnly: true, reposRoot: options.reposRoot });
  return {
    path: resolved.relativePath,
    source: fs.readFileSync(resolved.absolutePath, "utf8"),
  };
}

export async function writeMarkdownDocument(
  repo: CommitCapableRepo,
  documentPath: string,
  source: string,
  options: { reposRoot?: string; create?: boolean; actorId?: string | null; commitRunner?: GitRunner } = {},
) {
  return withRepoLock(repo.id, async () => {
    const resolved = resolveDocumentPath(repo, documentPath, { markdownOnly: true, reposRoot: options.reposRoot });
    const exists = fs.existsSync(resolved.absolutePath);

    if (options.create && exists) {
      throw new Error("Document already exists.");
    }
    if (!options.create && !exists) {
      throw new Error("Document does not exist.");
    }

    fs.mkdirSync(path.dirname(resolved.absolutePath), { recursive: true });
    atomicWriteFile(resolved.absolutePath, source);
    await maybeRecordAudit(repo, options, {
      operation: options.create ? "document.create" : "document.edit",
      documentPath: resolved.relativePath,
    });
    const commit = await maybeCommitChange(repo, options.create ? "create" : "edit", [resolved.relativePath], options);

    return { path: resolved.relativePath, commit };
  });
}

export async function renameMarkdownDocument(
  repo: CommitCapableRepo,
  fromPath: string,
  toPath: string,
  options: { reposRoot?: string; actorId?: string | null; confirmed?: boolean; commitRunner?: GitRunner } = {},
) {
  if (!options.confirmed) {
    throw new Error("Rename requires explicit confirmation.");
  }

  return withRepoLock(repo.id, async () => {
    const from = resolveDocumentPath(repo, fromPath, { markdownOnly: true, reposRoot: options.reposRoot });
    const to = resolveDocumentPath(repo, toPath, { markdownOnly: true, reposRoot: options.reposRoot });

    if (!fs.existsSync(from.absolutePath)) {
      throw new Error("Source document does not exist.");
    }
    if (fs.existsSync(to.absolutePath)) {
      throw new Error("Destination document already exists.");
    }

    fs.mkdirSync(path.dirname(to.absolutePath), { recursive: true });
    fs.renameSync(from.absolutePath, to.absolutePath);
    await maybeRecordAudit(repo, options, {
      operation: "document.rename",
      documentPath: from.relativePath,
      metadata: { toPath: to.relativePath },
    });
    const commit = await maybeCommitChange(repo, "rename", [from.relativePath, to.relativePath], options);

    return { fromPath: from.relativePath, toPath: to.relativePath, commit };
  });
}

export async function deleteMarkdownDocument(
  repo: CommitCapableRepo,
  documentPath: string,
  options: { reposRoot?: string; actorId?: string | null; confirmed?: boolean; commitRunner?: GitRunner } = {},
) {
  if (!options.confirmed) {
    throw new Error("Delete requires explicit confirmation.");
  }

  return withRepoLock(repo.id, async () => {
    const resolved = resolveDocumentPath(repo, documentPath, { markdownOnly: true, reposRoot: options.reposRoot });
    if (!fs.existsSync(resolved.absolutePath)) {
      throw new Error("Document does not exist.");
    }

    fs.rmSync(resolved.absolutePath);
    await maybeRecordAudit(repo, options, {
      operation: "document.delete",
      documentPath: resolved.relativePath,
    });
    const commit = await maybeCommitChange(repo, "delete", [resolved.relativePath], options);

    return { path: resolved.relativePath, commit };
  });
}

export async function scanLinkImpact(
  repo: Pick<RepositoryConfig, "id" | "docsPath">,
  documentPath: string,
  options: { reposRoot?: string; runner?: RipgrepRunner; timeoutMs?: number } = {},
) {
  const safePath = validateRelativePath(documentPath, { markdownOnly: true });
  const docsRoot = resolveDocsRoot(repo, options.reposRoot);
  const query = path.basename(safePath);
  const runner = options.runner ?? defaultRipgrepRunner;
  const { stdout } = await runner(buildRipgrepArgs(query, { maxResults: 25 }), {
    cwd: docsRoot,
    timeoutMs: options.timeoutMs ?? LINK_IMPACT_SCAN_TIMEOUT_MS,
  });

  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string; data?: { path?: { text?: string }; lines?: { text?: string }; line_number?: number } })
    .filter((event) => event.type === "match" && event.data?.path?.text)
    .map((event) => ({
      path: event.data?.path?.text ?? "",
      line: event.data?.line_number ?? 1,
      snippet: event.data?.lines?.text?.trim() ?? "",
    }))
    .filter((result) => result.path !== safePath);
}
