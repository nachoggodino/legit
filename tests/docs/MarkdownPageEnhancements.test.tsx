/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownPageEnhancements } from "@/features/docs/MarkdownPageEnhancements";

describe("Markdown page enhancements", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds copy buttons to code blocks", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <div className="markdown-body">
        <pre>
          <code>const answer = 42;</code>
        </pre>
        <MarkdownPageEnhancements />
      </div>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Copy code" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("const answer = 42;"));
  });

  it("copies heading links instead of navigating to them", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <div className="markdown-body">
        <h2 id="details">
          <a className="heading-anchor" href="#details" aria-label="Link to Details">
            #
          </a>
          Details
        </h2>
        <MarkdownPageEnhancements />
      </div>,
    );

    fireEvent.click(screen.getByLabelText("Link to Details"));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("#details"));
  });
});
