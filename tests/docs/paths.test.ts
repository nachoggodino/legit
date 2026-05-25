import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDocsTree, documentPathToRoutePath, resolveDocumentPath, resolveRouteDocument, routeSegmentsToCandidates } from "@/server/docs";

const repo = { id: "repo", docsPath: "docs" };

describe("document route and path mapping", () => {
  it("maps route segments to index and nested markdown candidates", () => {
    expect(routeSegmentsToCandidates([])).toEqual(["index.md"]);
    expect(routeSegmentsToCandidates(["foo"])).toEqual(["foo.md", "foo/index.md"]);
    expect(routeSegmentsToCandidates(["foo", "bar"])).toEqual(["foo/bar.md", "foo/bar/index.md"]);
  });

  it("maps markdown files back to route paths", () => {
    expect(documentPathToRoutePath("index.md")).toBe("");
    expect(documentPathToRoutePath("foo.md")).toBe("foo");
    expect(documentPathToRoutePath("foo/index.md")).toBe("foo");
    expect(documentPathToRoutePath("foo/bar.md")).toBe("foo/bar");
  });

  it("resolves index.md and nested index.md", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "copi-docs-"));
    fs.mkdirSync(path.join(root, "repo", "docs", "foo"), { recursive: true });
    fs.writeFileSync(path.join(root, "repo", "docs", "index.md"), "# Home");
    fs.writeFileSync(path.join(root, "repo", "docs", "foo", "index.md"), "# Foo");

    expect(resolveRouteDocument(repo, [], { reposRoot: root })?.relativePath).toBe("index.md");
    expect(resolveRouteDocument(repo, ["foo"], { reposRoot: root })?.relativePath).toBe("foo/index.md");
    expect(resolveRouteDocument(repo, ["missing"], { reposRoot: root })).toBeNull();
  });

  it("prevents path traversal and non-markdown document operations", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "copi-docs-"));
    expect(() => resolveDocumentPath(repo, "../secret.md", { reposRoot: root, markdownOnly: true })).toThrow();
    expect(() => resolveDocumentPath(repo, "/secret.md", { reposRoot: root, markdownOnly: true })).toThrow();
    expect(() => resolveDocumentPath(repo, ".secret/file.md", { reposRoot: root, markdownOnly: true })).toThrow();
    expect(() => resolveDocumentPath(repo, "asset.png", { reposRoot: root, markdownOnly: true })).toThrow();
  });

  it("builds a collapsible directory tree with readable document titles", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "copi-docs-"));
    fs.mkdirSync(path.join(root, "repo", "docs", "api"), { recursive: true });
    fs.writeFileSync(path.join(root, "repo", "docs", "index.md"), "---\ntitle: Product Guide\n---\n# Ignored Heading");
    fs.writeFileSync(path.join(root, "repo", "docs", "api", "users.md"), "# Users Endpoint");
    fs.writeFileSync(path.join(root, "repo", "docs", "api", "billing-api.md"), "No heading");

    expect(buildDocsTree(repo, { reposRoot: root })).toEqual([
      {
        kind: "directory",
        title: "Api",
        path: "api",
        depth: 0,
        children: [
          {
            kind: "file",
            title: "Billing Api",
            markdownPath: "api/billing-api.md",
            routePath: "api/billing-api",
            depth: 1,
          },
          {
            kind: "file",
            title: "Users Endpoint",
            markdownPath: "api/users.md",
            routePath: "api/users",
            depth: 1,
          },
        ],
      },
      {
        kind: "file",
        title: "Product Guide",
        markdownPath: "index.md",
        routePath: "",
        depth: 0,
      },
    ]);
  });
});
