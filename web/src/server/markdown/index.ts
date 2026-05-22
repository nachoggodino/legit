import crypto from "node:crypto";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { parse as parseYaml } from "yaml";
import { resolveRelativeMarkdownLink, validateRelativePath } from "@/server/docs";

export type MarkdownDocument = {
  path: string;
  source: string;
};

export type MarkdownHeading = {
  id: string;
  text: string;
  level: number;
};

export type MarkdownRenderResult = {
  html: string;
  title: string | null;
  headings: MarkdownHeading[];
  frontmatter: Record<string, string | boolean | number>;
  contentHash: string;
};

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

type RenderContext = {
  currentPath: string;
  repoSlug?: string;
  headings: MarkdownHeading[];
};

const allowedFrontmatterValue = (value: unknown): value is string | boolean | number =>
  typeof value === "string" || typeof value === "boolean" || typeof value === "number";

function parseFrontmatter(source: string): { frontmatter: MarkdownRenderResult["frontmatter"]; body: string } {
  if (!source.startsWith("---\n")) {
    return { frontmatter: {}, body: source };
  }

  const end = source.indexOf("\n---", 4);
  if (end === -1) {
    return { frontmatter: {}, body: source };
  }

  const raw = source.slice(4, end).trim();
  const body = source.slice(end + 4).replace(/^\r?\n/, "");
  const frontmatter: MarkdownRenderResult["frontmatter"] = {};
  let parsed: unknown;

  try {
    parsed = parseYaml(raw);
  } catch {
    return { frontmatter, body };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { frontmatter, body };
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (allowedFrontmatterValue(value)) {
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

function textContent(node: HastNode): string {
  if (node.type === "text") {
    return node.value ?? "";
  }

  return node.children?.map(textContent).join("") ?? "";
}

function hasClass(node: HastNode, className: string): boolean {
  const classNames = node.properties?.className;
  return Array.isArray(classNames) && classNames.includes(className);
}

function normalizeRenderedHref(
  href: string,
  options: { currentPath: string; repoSlug?: string },
  linkOptions: { asset?: boolean } = {},
): string {
  const trimmed = href.trim();
  if (!trimmed) {
    return "#";
  }

  if (trimmed.startsWith("#")) {
    return trimmed;
  }

  const scheme = /^([a-zA-Z][a-zA-Z\d+.-]*):/.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme) {
    return scheme === "http" || scheme === "https" || scheme === "mailto" ? trimmed : "#";
  }

  if (trimmed.startsWith("//")) {
    return "#";
  }

  if (linkOptions.asset && options.repoSlug) {
    const baseDirectory = options.currentPath.includes("/") ? options.currentPath.slice(0, options.currentPath.lastIndexOf("/")) : "";
    const normalized = validateRelativePath(`${baseDirectory ? `${baseDirectory}/` : ""}${trimmed}`);
    return `/api/repos/${encodeURIComponent(options.repoSlug)}/assets?path=${encodeURIComponent(normalized)}`;
  }

  const resolved = resolveRelativeMarkdownLink(options.currentPath, trimmed);
  if (resolved === trimmed) {
    return trimmed;
  }

  return options.repoSlug ? `/${options.repoSlug}${resolved ? `/${resolved}` : ""}` : resolved;
}

function isTableStart(lines: string[], index: number): boolean {
  return Boolean(lines[index]?.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] ?? ""));
}

function preserveLegacyListTableBreaks(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const nextLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const previous = nextLines[nextLines.length - 1] ?? "";
    if (isTableStart(lines, index) && /^\s*[-*]\s+/.test(previous)) {
      nextLines.push("");
    }
    nextLines.push(lines[index]);
  }

  return nextLines.join("\n");
}

function rewriteLinksAndImages(context: RenderContext) {
  return (tree: HastNode) => {
    visit(tree, "element", (node: HastNode) => {
      if (node.tagName === "a" && typeof node.properties?.href === "string") {
        node.properties.href = normalizeRenderedHref(node.properties.href, context);
      }

      if (node.tagName === "img" && typeof node.properties?.src === "string") {
        node.properties.src = normalizeRenderedHref(node.properties.src, context, { asset: true });
      }
    });
  };
}

function collectHeadingsAndAddAnchors(context: RenderContext) {
  return (tree: HastNode) => {
    visit(tree, "element", (node: HastNode) => {
      const match = /^h([1-6])$/.exec(node.tagName ?? "");
      if (!match) {
        return;
      }

      const level = Number(match[1]);
      const id = typeof node.properties?.id === "string" ? node.properties.id : undefined;
      const text = textContent(node).replace(/\s+#*$/, "");

      if (!id) {
        return;
      }

      context.headings.push({ id, text, level });
      node.children = [
        {
          type: "element",
          tagName: "a",
          properties: { className: ["heading-anchor"], href: `#${id}`, ariaLabel: `Link to ${text}` },
          children: [{ type: "text", value: "#" }],
        },
        ...(node.children ?? []),
      ];
    });
  };
}

function splitTextByPattern(source: string, pattern: RegExp, className: string): HastNode[] {
  const nodes: HastNode[] = [];
  let cursor = 0;

  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push({ type: "text", value: source.slice(cursor, index) });
    }
    nodes.push({
      type: "element",
      tagName: "span",
      properties: { className: [className] },
      children: [{ type: "text", value: match[0] }],
    });
    cursor = index + match[0].length;
  }

  if (cursor < source.length) {
    nodes.push({ type: "text", value: source.slice(cursor) });
  }

  return nodes.length > 0 ? nodes : [{ type: "text", value: source }];
}

function highlightText(source: string, language: string): HastNode[] {
  const normalized = language.toLowerCase();

  if (["js", "jsx", "ts", "tsx", "javascript", "typescript"].includes(normalized)) {
    return splitTextByPattern(
      source,
      /\b(const|let|var|function|return|import|export|from|type|interface|class|new|async|await|if|else)\b/g,
      "token keyword",
    );
  }

  if (["json", "jsonc"].includes(normalized)) {
    return splitTextByPattern(source, /"[^"\n]+(?="\s*:)/g, "token string");
  }

  if (["sh", "bash", "shell"].includes(normalized)) {
    return splitTextByPattern(source, /(^|\n)\s*#.*/g, "token comment");
  }

  return [{ type: "text", value: source }];
}

function codeLanguage(node: HastNode): string {
  const classNames = node.properties?.className;
  if (!Array.isArray(classNames)) {
    return "";
  }

  const languageClass = classNames.find((className) => typeof className === "string" && className.startsWith("language-"));
  return typeof languageClass === "string" ? languageClass.slice("language-".length) : "";
}

function enhanceCodeBlocks() {
  return (tree: HastNode) => {
    visit(tree, "element", (node: HastNode) => {
      if (node.tagName === "input" && node.properties?.type === "checkbox") {
        node.properties = node.properties.checked
          ? { type: "checkbox", disabled: true, checked: true }
          : { type: "checkbox", disabled: true };
        return;
      }

      if (node.tagName !== "pre") {
        return;
      }

      const code = node.children?.find((child) => child.tagName === "code");
      if (!code) {
        return;
      }

      const language = codeLanguage(code);
      const source = textContent(code);

      if (language.toLowerCase() === "mermaid") {
        node.properties = { ...(node.properties ?? {}), className: ["mermaid-todo"] };
        return;
      }

      code.children = highlightText(source, language);
    });
  };
}

function disableMermaidRenderingNotice() {
  return (tree: HastNode) => {
    const children = tree.children;
    if (!children) {
      return;
    }

    for (let index = children.length - 1; index >= 0; index -= 1) {
      const node = children[index];
      if (node.tagName !== "pre" || !hasClass(node, "mermaid-todo")) {
        continue;
      }

      children.splice(index + 1, 0, {
        type: "element",
        tagName: "p",
        properties: { className: ["muted"] },
        children: [
          {
            type: "text",
            value: "TODO: Mermaid rendering is intentionally disabled until a sanitized renderer and browser test boundary are added.",
          },
        ],
      });
    }
  };
}

function createMarkdownProcessor(context: RenderContext) {
  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rewriteLinksAndImages, context)
    .use(collectHeadingsAndAddAnchors, context)
    .use(enhanceCodeBlocks)
    .use(disableMermaidRenderingNotice)
    .use(rehypeStringify);
}

export function renderMarkdown(
  source: string,
  options: { currentPath?: string; repoSlug?: string } = {},
): MarkdownRenderResult {
  const currentPath = options.currentPath ?? "index.md";
  const { frontmatter, body } = parseFrontmatter(source);
  const contentHash = crypto.createHash("sha256").update(body).digest("hex");
  const headings: MarkdownHeading[] = [];
  const context: RenderContext = { currentPath, repoSlug: options.repoSlug, headings };
  const html = String(createMarkdownProcessor(context).processSync(preserveLegacyListTableBreaks(source)));

  return {
    html,
    title: typeof frontmatter.title === "string" ? frontmatter.title : headings[0]?.text ?? null,
    headings,
    frontmatter,
    contentHash,
  };
}

export function generateTableOfContents(headings: MarkdownHeading[]): MarkdownHeading[] {
  return headings.filter((heading) => heading.level >= 2 && heading.level <= 3);
}
