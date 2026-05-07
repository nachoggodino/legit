import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AiSearchBar from "./AiSearchBar";
import * as client from "../api/client";

vi.mock("../api/client");

describe("AiSearchBar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders search input and AI button", () => {
    render(<AiSearchBar />);
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search with ai/i })).toBeInTheDocument();
  });

  it("AI button is disabled when input is empty", () => {
    render(<AiSearchBar />);
    expect(screen.getByRole("button", { name: /search with ai/i })).toBeDisabled();
  });

  it("AI button becomes enabled when user types a query", async () => {
    render(<AiSearchBar />);
    await userEvent.type(screen.getByRole("searchbox"), "What is GPT-4?");
    expect(screen.getByRole("button", { name: /search with ai/i })).not.toBeDisabled();
  });

  it("disables input and shows status while loading", async () => {
    vi.mocked(client.streamChat).mockImplementation((_q, handlers) => {
      handlers.onReadingFile?.("docs/models.md");
      return new Promise(() => {}); // never resolves (simulates loading)
    });

    render(<AiSearchBar />);
    await userEvent.type(screen.getByRole("searchbox"), "query");
    await userEvent.click(screen.getByRole("button", { name: /search with ai/i }));

    expect(screen.getByRole("searchbox")).toBeDisabled();
    expect(screen.getByText(/Reading: docs\/models\.md/)).toBeInTheDocument();
  });

  it("renders streaming markdown result on token events", async () => {
    vi.mocked(client.streamChat).mockImplementation((_q, handlers) => {
      return Promise.resolve().then(() => {
        handlers.onToken?.("Hello ");
        handlers.onToken?.("world");
        handlers.onDone?.();
      });
    });

    render(<AiSearchBar />);
    await userEvent.type(screen.getByRole("searchbox"), "query");
    await userEvent.click(screen.getByRole("button", { name: /search with ai/i }));

    await waitFor(() => {
      expect(screen.getByText(/Hello/)).toBeInTheDocument();
    });
    expect(screen.getByRole("searchbox")).not.toBeDisabled();
  });

  it("shows error status on onError", async () => {
    vi.mocked(client.streamChat).mockImplementation((_q, handlers) => {
      return Promise.resolve().then(() => {
        handlers.onError?.("LLM failed");
      });
    });

    render(<AiSearchBar />);
    await userEvent.type(screen.getByRole("searchbox"), "query");
    await userEvent.click(screen.getByRole("button", { name: /search with ai/i }));

    await waitFor(() => {
      expect(screen.getByText(/Error: LLM failed/)).toBeInTheDocument();
    });
  });

  it("triggers search on Enter key", async () => {
    vi.mocked(client.streamChat).mockResolvedValue(undefined);

    render(<AiSearchBar />);
    const input = screen.getByRole("searchbox");
    await userEvent.type(input, "test query");
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(client.streamChat).toHaveBeenCalledWith(
        "test query",
        expect.any(Object),
        expect.any(AbortSignal)
      );
    });
  });
});
