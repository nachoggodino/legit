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

  it("uses in-editor confirmation for rename instead of native dialogs", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockImplementation(() => "renamed.md");
    const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => true);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("/api/markdown/preview")) {
        return Response.json({ html: "<h1>Hello</h1>" });
      }
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        if (body.scanOnly) {
          return Response.json({ impacts: [{ path: "index.md", line: 2, snippet: "[Old](old.md)" }] });
        }
        return Response.json({ fromPath: "old.md", toPath: body.toPath });
      }
      return Response.json({ source: "# Hello" });
    });

    render(<MarkdownEditorLauncher repoSlug="repo" documentPath="old.md" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByLabelText("Raw Markdown");

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const newPathInput = await screen.findByLabelText("New Markdown path");
    fireEvent.change(newPathInput, { target: { value: "renamed.md" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(screen.getByText("Renamed and queued through commit workflow.")).toBeInTheDocument());
    expect(promptSpy).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
