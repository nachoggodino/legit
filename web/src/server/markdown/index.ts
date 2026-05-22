import crypto from "node:crypto";
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

const htmlEscapes: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => htmlEscapes[char]);
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[`*_~[\]()#]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "section";
}

function uniqueSlug(base: string, used: Map<string, number>): string {
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

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

  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    const trimmed = rawValue.trim().replace(/^["']|["']$/g, "");
    if (trimmed === "true" || trimmed === "false") {
      frontmatter[key] = trimmed === "true";
    } else if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      frontmatter[key] = Number(trimmed);
    } else {
      frontmatter[key] = trimmed;
    }
  }

  return { frontmatter, body };
}

function renderInline(value: string, options: { currentPath: string; repoSlug?: string }): string {
  let html = escapeHtml(value);

  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, href: string) => {
    const safeHref = normalizeRenderedHref(href, options, { asset: true });
    return `<img src="${escapeHtml(safeHref)}" alt="${escapeHtml(alt)}">`;
  });

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
    const safeHref = normalizeRenderedHref(href, options);
    return `<a href="${escapeHtml(safeHref)}">${label}</a>`;
  });

  html = html
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return html;
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

function isTable(lines: string[], index: number): boolean {
  return Boolean(lines[index]?.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] ?? ""));
}

function renderTable(lines: string[], start: number, options: { currentPath: string; repoSlug?: string }): { html: string; next: number } {
  const rows: string[][] = [];
  let index = start;

  while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
    if (index !== start + 1) {
      rows.push(
        lines[index]
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((cell) => renderInline(cell.trim(), options)),
      );
    }
    index += 1;
  }

  const [head = [], ...body] = rows;
  const thead = `<thead><tr>${head.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return { html: `<table>${thead}${tbody}</table>`, next: index };
}

function renderCodeBlock(language: string, source: string): string {
  if (language.toLowerCase() === "mermaid") {
    return `<pre class="mermaid-todo"><code class="language-mermaid">${escapeHtml(source)}</code></pre><p class="muted">TODO: Mermaid rendering is intentionally disabled until a sanitized renderer and browser test boundary are added.</p>`;
  }

  const className = language ? ` class="language-${escapeHtml(language)}"` : "";
  return `<pre><code${className}>${highlightCode(source, language)}</code></pre>`;
}

function highlightCode(source: string, language: string): string {
  const escaped = escapeHtml(source);
  const normalized = language.toLowerCase();

  if (["js", "jsx", "ts", "tsx", "javascript", "typescript"].includes(normalized)) {
    return escaped.replace(
      /\b(const|let|var|function|return|import|export|from|type|interface|class|new|async|await|if|else)\b/g,
      '<span class="token keyword">$1</span>',
    );
  }

  if (["json", "jsonc"].includes(normalized)) {
    return escaped.replace(/(&quot;[^&]+&quot;)(\s*:)/g, '<span class="token string">$1</span>$2');
  }

  if (["sh", "bash", "shell"].includes(normalized)) {
    return escaped.replace(/(^|\n)(\s*#.*)/g, '$1<span class="token comment">$2</span>');
  }

  return escaped;
}

export function renderMarkdown(
  source: string,
  options: { currentPath?: string; repoSlug?: string } = {},
): MarkdownRenderResult {
  const currentPath = options.currentPath ?? "index.md";
  const { frontmatter, body } = parseFrontmatter(source);
  const contentHash = crypto.createHash("sha256").update(body).digest("hex");
  const headings: MarkdownHeading[] = [];
  const usedSlugs = new Map<string, number>();
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let inCode: { language: string; lines: string[] } | null = null;

  function flushParagraph() {
    if (paragraph.length > 0) {
      html.push(`<p>${renderInline(paragraph.join(" "), { currentPath, repoSlug: options.repoSlug })}</p>`);
      paragraph = [];
    }
  }

  function flushList() {
    if (listItems.length > 0) {
      html.push(`<ul>${listItems.join("")}</ul>`);
      listItems = [];
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (inCode) {
      if (line.startsWith("```")) {
        html.push(renderCodeBlock(inCode.language, inCode.lines.join("\n")));
        inCode = null;
      } else {
        inCode.lines.push(line);
      }
      continue;
    }

    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      inCode = { language: line.slice(3).trim().split(/\s+/)[0] ?? "", lines: [] };
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    if (isTable(lines, index)) {
      flushParagraph();
      flushList();
      const table = renderTable(lines, index, { currentPath, repoSlug: options.repoSlug });
      html.push(table.html);
      index = table.next - 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const text = heading[2].replace(/\s+#*$/, "");
      const id = uniqueSlug(slugify(text), usedSlugs);
      headings.push({ id, text, level });
      html.push(`<h${level} id="${id}"><a class="heading-anchor" href="#${id}" aria-label="Link to ${escapeHtml(text)}">#</a>${renderInline(text, { currentPath, repoSlug: options.repoSlug })}</h${level}>`);
      continue;
    }

    const list = /^\s*[-*]\s+(\[[ xX]\]\s+)?(.+)$/.exec(line);
    if (list) {
      flushParagraph();
      const checked = list[1]?.toLowerCase().includes("x") ?? false;
      const checkbox = list[1] ? `<input type="checkbox" disabled${checked ? " checked" : ""}> ` : "";
      listItems.push(`<li>${checkbox}${renderInline(list[2], { currentPath, repoSlug: options.repoSlug })}</li>`);
      continue;
    }

    if (/^>\s+/.test(line)) {
      flushParagraph();
      flushList();
      html.push(`<blockquote>${renderInline(line.replace(/^>\s+/, ""), { currentPath, repoSlug: options.repoSlug })}</blockquote>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();

  if (inCode) {
    html.push(renderCodeBlock(inCode.language, inCode.lines.join("\n")));
  }

  return {
    html: html.join("\n"),
    title: typeof frontmatter.title === "string" ? frontmatter.title : headings[0]?.text ?? null,
    headings,
    frontmatter,
    contentHash,
  };
}

export function generateTableOfContents(headings: MarkdownHeading[]): MarkdownHeading[] {
  return headings.filter((heading) => heading.level >= 2 && heading.level <= 3);
}
