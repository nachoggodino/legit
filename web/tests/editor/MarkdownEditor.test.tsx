/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownEditorLauncher } from "@/features/editor/MarkdownEditor";

describe("Markdown editor UI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads markdown content and updates live preview", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("/api/markdown/preview")) {
        const body = JSON.parse(String(init?.body));
        return Response.json({ html: `<h1>${body.source.replace("# ", "")}</h1>` });
      }
      return Response.json({ source: "# Hello" });
    });

    render(<MarkdownEditorLauncher repoSlug="repo" documentPath="index.md" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const textarea = await screen.findByLabelText("Raw Markdown");
    await waitFor(() => expect(textarea).toHaveValue("# Hello"));
    fireEvent.change(textarea, { target: { value: "# Updated" } });

    await waitFor(() => expect(screen.getByLabelText("Live preview")).toHaveTextContent("Updated"));
    expect(fetchMock).toHaveBeenCalled();
  });
});
