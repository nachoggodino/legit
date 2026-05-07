import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CommitForm from "./CommitForm";
import * as client from "../api/client";

vi.mock("../api/client");

describe("CommitForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders branch input with default value 'master'", () => {
    render(<CommitForm path="docs/x.md" content="# Hello" />);
    expect(screen.getByLabelText(/branch name/i)).toHaveValue("master");
  });

  it("uses provided defaultBranch", () => {
    render(<CommitForm path="docs/x.md" content="# Hello" defaultBranch="develop" />);
    expect(screen.getByLabelText(/branch name/i)).toHaveValue("develop");
  });

  it("Commit button is disabled when branch is empty", async () => {
    render(<CommitForm path="docs/x.md" content="# Hello" />);
    const input = screen.getByLabelText(/branch name/i);
    await userEvent.clear(input);
    expect(screen.getByRole("button", { name: /commit/i })).toBeDisabled();
  });

  it("calls streamCommit with correct args on confirm", async () => {
    vi.mocked(client.streamCommit).mockImplementation((_p, _c, _b, handlers) => {
      handlers.onDone?.("https://gitlab.example.com/commit/abc");
      return Promise.resolve();
    });

    render(<CommitForm path="docs/x.md" content="# Content" defaultBranch="main" />);
    await userEvent.click(screen.getByRole("button", { name: /^commit$/i }));

    expect(client.streamCommit).toHaveBeenCalledWith(
      "docs/x.md",
      "# Content",
      "main",
      expect.any(Object),
      expect.any(AbortSignal)
    );
  });

  it("displays status messages during commit", async () => {
    vi.mocked(client.streamCommit).mockImplementation((_p, _c, _b, handlers) => {
      handlers.onStatus?.("Updating index…");
      handlers.onStatus?.("Preparing commit…");
      return new Promise(() => {}); // stays loading
    });

    render(<CommitForm path="docs/x.md" content="" />);
    await userEvent.click(screen.getByRole("button", { name: /^commit$/i }));

    expect(screen.getByText("Updating index…")).toBeInTheDocument();
    expect(screen.getByText("Preparing commit…")).toBeInTheDocument();
  });

  it("shows commit URL link on success", async () => {
    vi.mocked(client.streamCommit).mockImplementation((_p, _c, _b, handlers) => {
      handlers.onDone?.("https://gitlab.example.com/commit/abc");
      return Promise.resolve();
    });

    render(<CommitForm path="docs/x.md" content="" />);
    await userEvent.click(screen.getByRole("button", { name: /^commit$/i }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /view commit/i })).toHaveAttribute(
        "href",
        "https://gitlab.example.com/commit/abc"
      );
    });
  });

  it("shows error message on failure", async () => {
    vi.mocked(client.streamCommit).mockImplementation((_p, _c, _b, handlers) => {
      handlers.onError?.("Git push failed");
      return Promise.resolve();
    });

    render(<CommitForm path="docs/x.md" content="" />);
    await userEvent.click(screen.getByRole("button", { name: /^commit$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Git push failed");
    });
  });
});
