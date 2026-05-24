import { describe, expect, it } from "vitest";
import { generateTableOfContents, renderMarkdown } from "@/server/markdown";

describe("Markdown renderer", () => {
  it("renders frontmatter, headings, anchors, toc, GFM tables and task lists", () => {
    const rendered = renderMarkdown(
      [
        "---",
        "title: Custom Title",
        "---",
        "# Main",
        "## Details",
        "- [x] Done",
        "- [ ] Later",
        "| A | B |",
        "| --- | --- |",
        "| 1 | 2 |",
      ].join("\n"),
      { currentPath: "index.md", repoSlug: "docs" },
    );

    expect(rendered.title).toBe("Custom Title");
    expect(rendered.html).toContain('id="main"');
    expect(rendered.html).toContain('href="#details"');
    expect(rendered.html).toContain('type="checkbox" disabled checked');
    expect(rendered.html).toContain("<table>");
    expect(generateTableOfContents(rendered.headings)).toEqual([{ id: "details", text: "Details", level: 2 }]);
  });

  it("resolves relative markdown links", () => {
    const rendered = renderMarkdown("[Next](../next.md)", { currentPath: "guide/intro.md", repoSlug: "repo" });
    expect(rendered.html).toContain('href="/repo/next"');
  });

  it("neutralizes unsafe link and image URL schemes", () => {
    const rendered = renderMarkdown("[Bad](javascript:alert(1)) ![Bad](data:text/html,evil)", {
      currentPath: "index.md",
      repoSlug: "repo",
    });

    expect(rendered.html).toContain('href="#"');
    expect(rendered.html).toContain('src="#"');
    expect(rendered.html).not.toContain("javascript:");
    expect(rendered.html).not.toContain("data:text/html");
  });

  it("does not emit raw HTML from markdown input", () => {
    const rendered = renderMarkdown('<script>alert("x")</script>');

    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).not.toContain("alert");
  });

  it("adds server-side token spans for supported code blocks", () => {
    const rendered = renderMarkdown(["```ts", "const answer = 42", "```"].join("\n"));

    expect(rendered.html).toContain('class="language-ts"');
    expect(rendered.html).toContain('class="token keyword"');
  });
});
