/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/ThemeToggle";

function mockSystemTheme(matchesLight: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-color-scheme: light)" ? matchesLight : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe("ThemeToggle", () => {
  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    vi.restoreAllMocks();
  });

  it("defaults to the system theme and persists explicit choices", async () => {
    mockSystemTheme(false);

    render(<ThemeToggle />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument());
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");

    fireEvent.click(screen.getByRole("button", { name: "Switch to light theme" }));

    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem("legit-theme")).toBe("light");
  });

  it("toggles when clicking the active half of the switch", async () => {
    mockSystemTheme(true);

    render(<ThemeToggle />);

    const toggle = await screen.findByRole("button", { name: "Switch to dark theme" });
    fireEvent.click(toggle.querySelector('[aria-label="Use light theme"]') ?? toggle);

    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("legit-theme")).toBe("dark");
  });
});
