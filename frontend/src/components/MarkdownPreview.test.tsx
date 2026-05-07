import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import MarkdownPreview from "./MarkdownPreview";

describe("MarkdownPreview", () => {
  it("renders plain text content", () => {
    render(<MarkdownPreview content="Hello world" />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders markdown headings", () => {
    render(<MarkdownPreview content="# My Title" />);
    expect(screen.getByRole("heading", { level: 1, name: "My Title" })).toBeInTheDocument();
  });

  it("renders bold text", () => {
    render(<MarkdownPreview content="**bold text**" />);
    expect(screen.getByText("bold text").tagName).toBe("STRONG");
  });

  it("renders a markdown link", () => {
    render(<MarkdownPreview content="[Click here](https://example.com)" />);
    const link = screen.getByRole("link", { name: "Click here" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("renders a GFM table", () => {
    const content = `| A | B |\n|---|---|\n| 1 | 2 |`;
    render(<MarkdownPreview content={content} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("renders empty content without crashing", () => {
    const { container } = render(<MarkdownPreview content="" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it("updates when content prop changes", () => {
    const { rerender } = render(<MarkdownPreview content="# First" />);
    expect(screen.getByRole("heading", { name: "First" })).toBeInTheDocument();

    rerender(<MarkdownPreview content="# Second" />);
    expect(screen.getByRole("heading", { name: "Second" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "First" })).not.toBeInTheDocument();
  });
});
