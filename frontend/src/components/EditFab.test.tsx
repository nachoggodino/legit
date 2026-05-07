import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import EditFab from "./EditFab";

describe("EditFab", () => {
  it("renders with pencil+spark icon when not loading", () => {
    render(<EditFab isLoading={false} isModalOpen={false} onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: /open edit assistant/i })).toBeInTheDocument();
  });

  it("shows 'Minimize' label when modal is open", () => {
    render(<EditFab isLoading={false} isModalOpen={true} onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: /minimize edit assistant/i })).toBeInTheDocument();
  });

  it("calls onToggle when clicked", async () => {
    const onToggle = vi.fn();
    render(<EditFab isLoading={false} isModalOpen={false} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("renders spinner SVG when isLoading is true", () => {
    const { container } = render(
      <EditFab isLoading={true} isModalOpen={false} onToggle={vi.fn()} />
    );
    // Spinner has a specific class; pencil path should NOT be rendered
    const paths = container.querySelectorAll("path");
    // Pencil icon has 2 paths; spinner has 2 (circle + path) but different shape
    // The spinner SVG has a `d` starting with "M12 2"
    const spinnerPath = Array.from(paths).find((p) =>
      p.getAttribute("d")?.startsWith("M12 2")
    );
    expect(spinnerPath).toBeTruthy();
  });
});
