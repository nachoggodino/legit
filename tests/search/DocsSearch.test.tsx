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

  it("does not search blank queries and closes stale results", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ results: [{ path: "index.md", line: 1, snippet: "hello world" }] }),
    );

    render(<DocsSearch repoSlug="repo" aiEnabled={false} />);

    fireEvent.change(screen.getByLabelText("Search docs"), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.getByText("index.md:1")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Search docs"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(screen.queryByText("index.md:1")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows auth failures from AI chat", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: "auth" }, { status: 401 }));

    render(<DocsSearch repoSlug="repo" aiEnabled />);

    fireEvent.change(screen.getByLabelText("Search docs"), { target: { value: "summarize" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

    expect(await screen.findByText("Thinking")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Sign in to use AI")).toBeInTheDocument());
  });

  it("streams AI answers into the search popover", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("First "));
            controller.enqueue(new TextEncoder().encode("second"));
            controller.close();
          },
        }),
      ),
    );

    render(<DocsSearch repoSlug="repo" aiEnabled />);

    fireEvent.change(screen.getByLabelText("Search docs"), { target: { value: "explain" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));

    await waitFor(() => expect(screen.getByText("First second")).toBeInTheDocument());
    expect(screen.queryByText("Thinking")).not.toBeInTheDocument();
  });
});
