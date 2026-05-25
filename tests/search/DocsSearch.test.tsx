/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocsSearch } from "@/features/search/DocsSearch";

describe("Docs search UI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a loading state and closes results on outside click", async () => {
    let resolveSearch: (response: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveSearch = resolve;
        }),
    );

    render(
      <div>
        <DocsSearch repoSlug="repo" aiEnabled={false} />
        <button type="button">Outside</button>
      </div>,
    );

    fireEvent.change(screen.getByLabelText("Search docs"), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("Searching docs")).toBeInTheDocument();

    resolveSearch(Response.json({ results: [{ path: "index.md", line: 1, snippet: "hello world" }] }));
    await waitFor(() => expect(screen.getByText("index.md:1")).toBeInTheDocument());

    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByText("index.md:1")).not.toBeInTheDocument();
  });
});
