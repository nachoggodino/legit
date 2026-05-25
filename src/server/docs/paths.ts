import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { RepositoryConfig } from "@/server/config";
import { resolveRepoPath } from "@/server/git";

export class DocumentPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentPathError";
  }
}

export type ResolvedDocumentPath = {
  docsRoot: string;
  relativePath: string;
  absolutePath: string;
};

export function normalizeRelativePath(input: string): string {
  return input.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/g, "");
}

export function validateRelativePath(input: string, options: { markdownOnly?: boolean } = {}): string {
  const normalized = normalizeRelativePath(input);

  if (!normalized) {
    throw new DocumentPathError("Path cannot be empty.");
  }

  if (path.isAbsolute(input) || /^[a-zA-Z]:[\\/]/.test(input)) {
    throw new DocumentPathError("Path must be relative.");
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new DocumentPathError("Path must not contain traversal segments.");
  }

  if (segments.some((segment) => segment.startsWith("."))) {
    throw new DocumentPathError("Hidden or system paths are not allowed.");
  }

  if (options.markdownOnly && !normalized.toLowerCase().endsWith(".md")) {
    throw new DocumentPathError("Only Markdown .md documents are supported.");
  }

  return normalized;
}

export function resolveDocsRoot(repo: Pick<RepositoryConfig, "id" | "docsPath">, reposRoot?: string): string {
  const repoRoot = resolveRepoPath(repo.id, reposRoot);
  const docsPath = validateRelativePath(repo.docsPath);
  const docsRoot = path.resolve(repoRoot, docsPath);
  const relative = path.relative(repoRoot, docsRoot);

  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new DocumentPathError("Docs path must resolve under the repository root.");
  }

  return docsRoot;
}

export function resolveDocumentPath(
  repo: Pick<RepositoryConfig, "id" | "docsPath">,
  relativePath: string,
  options: { markdownOnly?: boolean; reposRoot?: string } = {},
): ResolvedDocumentPath {
  const docsRoot = resolveDocsRoot(repo, options.reposRoot);
  const safePath = validateRelativePath(relativePath, { markdownOnly: options.markdownOnly });
  const absolutePath = path.resolve(docsRoot, safePath);
  const relative = path.relative(docsRoot, absolutePath);

  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new DocumentPathError("Path must resolve under the repository docs root.");
  }

  return { docsRoot, relativePath: safePath, absolutePath };
}

export function routeSegmentsToCandidates(segments: string[] = []): string[] {
  const cleanSegments = segments.map((segment) => validateRelativePath(segment));
  if (cleanSegments.length === 0) {
    return ["index.md"];
  }

  const base = cleanSegments.join("/");
  return [`${base}.md`, `${base}/index.md`];
}

export function documentPathToRoutePath(markdownPath: string): string {
  const safePath = validateRelativePath(markdownPath, { markdownOnly: true });
  if (safePath === "index.md") {
    return "";
  }
  if (safePath.endsWith("/index.md")) {
    return safePath.slice(0, -"/index.md".length);
  }
  return safePath.slice(0, -".md".length);
}

export function resolveRouteDocument(
  repo: Pick<RepositoryConfig, "id" | "docsPath">,
  segments: string[] = [],
  options: { reposRoot?: string } = {},
): ResolvedDocumentPath | null {
  for (const candidate of routeSegmentsToCandidates(segments)) {
    const resolved = resolveDocumentPath(repo, candidate, { markdownOnly: true, reposRoot: options.reposRoot });
    if (fs.existsSync(resolved.absolutePath) && fs.statSync(resolved.absolutePath).isFile()) {
      return resolved;
    }
  }

  return null;
}

export type DocsTreeItem = {
  kind: "file";
  title: string;
  markdownPath: string;
  routePath: string;
  depth: number;
};

export type DocsTreeDirectory = {
  kind: "directory";
  title: string;
  path: string;
  depth: number;
  children: DocsTreeNode[];
};

export type DocsTreeNode = DocsTreeDirectory | DocsTreeItem;

function humanizePathSegment(segment: string): string {
  return segment
    .replace(/\.md$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function titleFromFrontmatter(source: string): string | null {
  if (!source.startsWith("---\n")) {
    return null;
  }

  const end = source.indexOf("\n---", 4);
  if (end === -1) {
    return null;
  }

  try {
    const parsed: unknown = parseYaml(source.slice(4, end).trim());
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const title = (parsed as Record<string, unknown>).title;
      return typeof title === "string" && title.trim() ? title.trim() : null;
    }
  } catch {
    return null;
  }

  return null;
}

function titleFromFirstHeading(source: string): string | null {
  const frontmatterEnd = source.startsWith("---\n") ? source.indexOf("\n---", 4) : -1;
  const body = frontmatterEnd >= 0 ? source.slice(frontmatterEnd + 4).replace(/^\r?\n/, "") : source;
  const heading = /^#\s+(.+)$/m.exec(body);
  return heading?.[1]?.replace(/\s+#*$/, "").trim() || null;
}

function titleFromMarkdownFile(absolutePath: string, markdownPath: string): string {
  const source = fs.readFileSync(absolutePath, "utf8");
  const basename = path.basename(markdownPath, ".md");
  const fallback = basename === "index" ? humanizePathSegment(path.basename(path.dirname(markdownPath)) || "Overview") : humanizePathSegment(basename);
  return titleFromFrontmatter(source) ?? titleFromFirstHeading(source) ?? fallback;
}

export function buildDocsTree(repo: Pick<RepositoryConfig, "id" | "docsPath">, options: { reposRoot?: string } = {}): DocsTreeNode[] {
  const docsRoot = resolveDocsRoot(repo, options.reposRoot);
  if (!fs.existsSync(docsRoot)) {
    return [];
  }

  function walk(directory: string, depth: number): DocsTreeNode[] {
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith("."))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

    const items: DocsTreeNode[] = [];

    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const children = walk(absolute, depth + 1);
        if (children.length > 0) {
          items.push({
            kind: "directory",
            title: humanizePathSegment(entry.name),
            path: path.relative(docsRoot, absolute).replace(/\\/g, "/"),
            depth,
            children,
          });
        }
        continue;
      }

      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
        continue;
      }

      const markdownPath = path.relative(docsRoot, absolute).replace(/\\/g, "/");
      const routePath = documentPathToRoutePath(markdownPath);
      const title = titleFromMarkdownFile(absolute, markdownPath);

      items.push({ kind: "file", title, markdownPath, routePath, depth });
    }

    return items;
  }

  return walk(docsRoot, 0);
}

export function resolveRelativeMarkdownLink(currentMarkdownPath: string, href: string): string {
  if (!href || href.startsWith("#") || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(href) || href.startsWith("//")) {
    return href;
  }

  const [rawPath, suffix = ""] = href.split(/(?=[#?])/);
  if (!rawPath || !rawPath.toLowerCase().endsWith(".md")) {
    return href;
  }

  const baseDirectory = path.dirname(validateRelativePath(currentMarkdownPath, { markdownOnly: true }));
  const resolved = normalizeRelativePath(path.posix.normalize(path.posix.join(baseDirectory === "." ? "" : baseDirectory, rawPath)));
  return `${documentPathToRoutePath(resolved)}${suffix}`;
}
