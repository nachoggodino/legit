import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import EditModal from "./EditModal";
import * as client from "../api/client";

vi.mock("../api/client");

const DEFAULT_PROPS = {
  isOpen: true,
  onClose: vi.fn(),
  filePath: "docs/intro.md",
  defaultBranch: "master",
};

describe("EditModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.fetchFile).mockResolvedValue("# Hello\n\nContent here.");
  });

  it("fetches file content on first open", async () => {
    render(<EditModal {...DEFAULT_PROPS} />);
    await waitFor(() => {
      expect(client.fetchFile).toHaveBeenCalledWith("docs/intro.md");
    });
  });

  it("renders the textarea with fetched content", async () => {
    render(<EditModal {...DEFAULT_PROPS} />);
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /markdown content/i })).toHaveValue(
        "# Hello\n\nContent here."
      );
    });
  });

  it("does NOT fetch again when re-opened", async () => {
    const { rerender } = render(<EditModal {...DEFAULT_PROPS} isOpen={false} />);
    rerender(<EditModal {...DEFAULT_PROPS} isOpen={true} />);
    // opened once
    await waitFor(() => expect(client.fetchFile).toHaveBeenCalledTimes(1));

    rerender(<EditModal {...DEFAULT_PROPS} isOpen={false} />);
    rerender(<EditModal {...DEFAULT_PROPS} isOpen={true} />);
    // still only once
    expect(client.fetchFile).toHaveBeenCalledTimes(1);
  });

  it("updates textarea and live preview when user types", async () => {
    render(<EditModal {...DEFAULT_PROPS} />);
    const textarea = await screen.findByRole("textbox", { name: /markdown content/i });
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "# New Title");
    expect(textarea).toHaveValue("# New Title");
    // Preview should contain the heading
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "New Title" })).toBeInTheDocument();
    });
  });

  it("calls streamEdit when AI instruction is submitted", async () => {
    vi.mocked(client.streamEdit).mockResolvedValue(undefined);

    render(<EditModal {...DEFAULT_PROPS} />);
    await screen.findByRole("textbox", { name: /markdown content/i });

    const instructionInput = screen.getByRole("textbox", { name: /ai instruction/i });
    await userEvent.type(instructionInput, "Make it shorter");
    await userEvent.click(screen.getByRole("button", { name: /apply ai edit/i }));

    expect(client.streamEdit).toHaveBeenCalledWith(
      "docs/intro.md",
      "# Hello\n\nContent here.",
      "Make it shorter",
      expect.any(Object),
      expect.any(AbortSignal)
    );
  });

  it("replaces textarea content with AI result on done", async () => {
    vi.mocked(client.streamEdit).mockImplementation(
      (_path, _content, _instruction, handlers) => {
        handlers.onDone?.("# Shorter content");
        return Promise.resolve();
      }
    );

    render(<EditModal {...DEFAULT_PROPS} />);
    await screen.findByRole("textbox", { name: /markdown content/i });

    const instructionInput = screen.getByRole("textbox", { name: /ai instruction/i });
    await userEvent.type(instructionInput, "Make it shorter");
    await userEvent.click(screen.getByRole("button", { name: /apply ai edit/i }));

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /markdown content/i })).toHaveValue(
        "# Shorter content"
      );
    });
  });

  it("shows status messages during AI edit", async () => {
    vi.mocked(client.streamEdit).mockImplementation(
      (_path, _content, _instruction, handlers) => {
        handlers.onStatus?.("Reading document…");
        return new Promise(() => {});
      }
    );

    render(<EditModal {...DEFAULT_PROPS} />);
    await screen.findByRole("textbox", { name: /markdown content/i });

    const instructionInput = screen.getByRole("textbox", { name: /ai instruction/i });
    await userEvent.type(instructionInput, "Improve");
    await userEvent.click(screen.getByRole("button", { name: /apply ai edit/i }));

    await waitFor(() => {
      expect(screen.getByText("Reading document…")).toBeInTheDocument();
    });
  });

  it("shows Commit form when 'Commit…' button is clicked", async () => {
    vi.mocked(client.streamCommit).mockResolvedValue(undefined);

    render(<EditModal {...DEFAULT_PROPS} />);
    await screen.findByRole("textbox", { name: /markdown content/i });

    await userEvent.click(screen.getByRole("button", { name: /commit…/i }));
    expect(screen.getByLabelText(/branch name/i)).toBeInTheDocument();
  });

  it("calls onEditingChange(true) when AI edit starts and onEditingChange(false) when done", async () => {
    const onEditingChange = vi.fn();
    vi.mocked(client.streamEdit).mockImplementation(
      (_path, _content, _instruction, handlers) => {
        // Defer onDone so React renders with isEditing=true before resolving
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            handlers.onDone?.("# Result");
            resolve();
          }, 0);
        });
      }
    );

    render(<EditModal {...DEFAULT_PROPS} onEditingChange={onEditingChange} />);
    await screen.findByRole("textbox", { name: /markdown content/i });

    const instructionInput = screen.getByRole("textbox", { name: /ai instruction/i });
    await userEvent.type(instructionInput, "Improve");
    await userEvent.click(screen.getByRole("button", { name: /apply ai edit/i }));

    await waitFor(() => {
      expect(onEditingChange).toHaveBeenCalledWith(true);
    });
    await waitFor(() => {
      expect(onEditingChange).toHaveBeenCalledWith(false);
    });
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    render(<EditModal {...DEFAULT_PROPS} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /minimize edit modal/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders nothing when isOpen is false", () => {
    const { container } = render(<EditModal {...DEFAULT_PROPS} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows fetch error when fetchFile rejects", async () => {
    vi.mocked(client.fetchFile).mockRejectedValue(new Error("Network error"));
    render(<EditModal {...DEFAULT_PROPS} />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Network error");
    });
  });
});
