import { beforeEach, describe, expect, it, vi } from "vitest";

const requestManualRepoSync = vi.fn();

vi.mock("@/server/sync", () => ({
  requestManualRepoSync,
}));

describe("admin manual sync route", () => {
  beforeEach(() => {
    vi.resetModules();
    requestManualRepoSync.mockReset();
  });

  it("rejects cross-origin POST requests before syncing", async () => {
    const { POST } = await import("@/app/api/admin/repos/[repoId]/sync/route");
    const request = new Request("https://docs.example.com/api/admin/repos/research/sync", {
      method: "POST",
      headers: {
        origin: "https://evil.example.com",
        accept: "application/json",
      },
    });

    const response = await POST(request, { params: Promise.resolve({ repoId: "research" }) });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Invalid request origin." });
    expect(requestManualRepoSync).not.toHaveBeenCalled();
  });

  it("redirects same-origin HTML form posts back to admin", async () => {
    requestManualRepoSync.mockResolvedValue({ repoId: "research", commit: "abc123" });
    const { POST } = await import("@/app/api/admin/repos/[repoId]/sync/route");
    const request = new Request("https://docs.example.com/api/admin/repos/research/sync", {
      method: "POST",
      headers: {
        origin: "https://docs.example.com",
        accept: "text/html",
      },
    });

    const response = await POST(request, { params: Promise.resolve({ repoId: "research" }) });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://docs.example.com/admin");
    expect(requestManualRepoSync).toHaveBeenCalledWith("research");
  });
});
