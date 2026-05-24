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
    const renameBodies: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("/api/markdown/preview")) {
        return Response.json({ html: "<h1>Hello</h1>" });
      }
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        renameBodies.push(body);
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
    fireEvent.change(screen.getByLabelText("Markdown path"), { target: { value: "renamed.md" } });

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    await screen.findByLabelText("New Markdown path");
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(screen.getByText("Rename complete. No file changes to commit.")).toBeInTheDocument());
    expect(renameBodies).toEqual([
      { fromPath: "old.md", scanOnly: true },
      { fromPath: "old.md", toPath: "renamed.md", confirmed: true },
    ]);
    expect(promptSpy).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("shows commit, branch, and PR/MR success links", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("/api/markdown/preview")) {
        return Response.json({ html: "<h1>Hello</h1>" });
      }
      if (init?.method === "PUT") {
        return Response.json({
          path: "index.md",
          commit: {
            committed: true,
            commitUrl: "https://git.example/commit/abc",
            branch: "legit/edit-index-abc",
            branchUrl: "https://git.example/branch",
            pullRequestUrl: "https://git.example/pull/1",
            mode: "merge-request",
          },
        });
      }
      return Response.json({ source: "# Hello" });
    });

    render(<MarkdownEditorLauncher repoSlug="repo" documentPath="index.md" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await screen.findByLabelText("Raw Markdown");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByLabelText("Commit workflow result")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Commit" })).toHaveAttribute("href", "https://git.example/commit/abc");
    expect(screen.getByRole("link", { name: "Branch" })).toHaveAttribute("href", "https://git.example/branch");
    expect(screen.getByRole("link", { name: "PR/MR" })).toHaveAttribute("href", "https://git.example/pull/1");
  });
});
