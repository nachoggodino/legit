/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { DocsPage } from "@/features/docs/DocsPage";
import type { LegitConfig } from "@/server/config";
import { makeTestRepo } from "../fixtures/config";

vi.mock("@/components/ThemeToggle", () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

vi.mock("@/server/auth", () => ({
  canEditRepo: (user: { role?: string } | null) => user?.role === "editor" || user?.role === "admin",
}));

vi.mock("@/features/search/DocsSearch", () => ({
  DocsSearch: () => <div>Search</div>,
}));

vi.mock("@/features/editor/MarkdownEditor", () => ({
  MarkdownEditorLauncher: () => null,
  CreateMarkdownFileButton: () => <button type="button">New file</button>,
}));

const config: LegitConfig = {
  app: { name: "Legit" },
  auth: {
    defaultRole: "viewer",
    admins: { emails: [], domains: [] },
  },
  ai: {
    enabled: false,
    baseUrlEnv: "AI_BASE_URL",
    apiKeyEnv: "AI_API_KEY",
    defaultModel: "gpt-4o",
    maxContextTokens: 150000,
    allowAnonymous: false,
  },
  sync: { intervalSeconds: 120, pullOnStartup: true, reindexOnChange: true },
  repos: [
    makeTestRepo({
      id: "repo-1",
      name: "Private repo",
      slug: "private-repo",
      repoUrl: "https://github.com/acme/private-repo",
    }),
  ],
};

const repo = config.repos[0];

describe("auth links", () => {
  it("opens homepage login flows in a new tab", () => {
    render(<AppShell config={config} user={null} />);

    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/api/auth/signin?callbackUrl=%2F");
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("rel", "noopener noreferrer");

    expect(screen.getByRole("link", { name: "Open docs" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Open docs" })).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("opens repo login links in a new tab", () => {
    render(
      <DocsPage
        repo={repo}
        user={null}
        markdownPath="index.md"
        title="Title"
        html="<p>Body</p>"
        tree={[]}
        toc={[]}
        aiEnabled={false}
        hasDocumentTitleHeading={false}
      />,
    );

    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      "/api/auth/signin?callbackUrl=%2Fprivate-repo",
    );
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows account actions in a profile popup and exposes file creation to editors", () => {
    render(
      <DocsPage
        repo={repo}
        user={{ id: "admin", email: "admin@example.com", name: "Ada", role: "admin" }}
        markdownPath="index.md"
        title="Title"
        html="<p>Body</p>"
        tree={[]}
        toc={[]}
        aiEnabled={false}
        hasDocumentTitleHeading={false}
      />,
    );

    expect(screen.getByRole("button", { name: /New file/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Adaadmin/i }));

    expect(screen.getByRole("menuitem", { name: "Admin page" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("menuitem", { name: "Log out" })).toHaveAttribute("href", "/api/auth/signout");
  });
});
