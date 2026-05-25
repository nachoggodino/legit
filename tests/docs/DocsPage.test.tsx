/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocsPage } from "@/features/docs/DocsPage";
import type { AuthUser } from "@/server/auth/types";
import { makeTestRepo } from "../fixtures/config";

vi.mock("@/server/auth", () => ({
  canEditRepo: (user: AuthUser | null) => user?.role === "editor" || user?.role === "admin",
}));

const repo = makeTestRepo({
  slug: "research",
  name: "Research Wiki",
  visibility: "public",
});

const tree = [
  {
    kind: "directory" as const,
    title: "Guide",
    path: "guide",
    depth: 0,
    children: [
      {
        kind: "file" as const,
        title: "Intro",
        markdownPath: "guide/index.md",
        routePath: "guide",
        depth: 1,
      },
    ],
  },
  {
    kind: "file" as const,
    title: "Home",
    markdownPath: "index.md",
    routePath: "",
    depth: 0,
  },
];

describe("DocsPage", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  it("renders anonymous public docs with navigation, search, outline, and sign-in link", () => {
    render(
      <DocsPage
        repo={repo}
        user={null}
        markdownPath="index.md"
        title="Welcome"
        html="<p>Rendered markdown.</p>"
        tree={tree}
        toc={[{ id: "details", text: "Details", level: 2 }]}
        aiEnabled={false}
        hasDocumentTitleHeading={false}
      />,
    );

    expect(screen.getByRole("heading", { name: "Welcome" })).toBeInTheDocument();
    expect(screen.getByText("Rendered markdown.")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Docs navigation" })).toContainElement(screen.getByText("Guide"));
    expect(screen.getByRole("link", { name: "Details" })).toHaveAttribute("href", "#details");
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", expect.stringContaining("/api/auth/signin"));
    expect(screen.queryByRole("button", { name: "Edit page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New file" })).not.toBeInTheDocument();
  });

  it("shows editor affordances and admin menu for admins", () => {
    const admin: AuthUser = {
      id: "admin-1",
      email: "admin@example.com",
      name: "Admin User",
      role: "admin",
    };

    render(
      <DocsPage
        repo={repo}
        user={admin}
        markdownPath="guide/index.md"
        title="Intro"
        html="<p>Intro body.</p>"
        tree={tree}
        toc={[]}
        aiEnabled
        hasDocumentTitleHeading
      />,
    );

    expect(screen.queryByRole("heading", { name: "Intro" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Admin User/ })).toHaveTextContent("admin");
    expect(screen.getByRole("button", { name: "Edit page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New file" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Admin User/ }));

    expect(screen.getByRole("menuitem", { name: "Admin page" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("menuitem", { name: "Log out" })).toHaveAttribute("href", "/api/auth/signout");
  });
});
