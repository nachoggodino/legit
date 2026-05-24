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

  it("returns JSON sync results for same-origin API posts", async () => {
    requestManualRepoSync.mockResolvedValue({ repoId: "research", commit: "abc123" });
    const { POST } = await import("@/app/api/admin/repos/[repoId]/sync/route");
    const request = new Request("https://docs.example.com/api/admin/repos/research/sync", {
      method: "POST",
      headers: {
        origin: "https://docs.example.com",
        accept: "application/json",
      },
    });

    const response = await POST(request, { params: Promise.resolve({ repoId: "research" }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ repoId: "research", commit: "abc123" });
  });

  it("maps manual sync auth failures to API responses", async () => {
    const { POST } = await import("@/app/api/admin/repos/[repoId]/sync/route");
    const { AuthenticationRequiredError, AuthorizationError } = await import("@/server/auth/types");
    const request = () =>
      new Request("https://docs.example.com/api/admin/repos/research/sync", {
        method: "POST",
        headers: {
          origin: "https://docs.example.com",
          accept: "application/json",
        },
      });

    requestManualRepoSync.mockRejectedValueOnce(new AuthenticationRequiredError("Authentication required."));
    const unauthenticated = await POST(request(), { params: Promise.resolve({ repoId: "research" }) });
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toEqual({ error: "Authentication required." });

    requestManualRepoSync.mockRejectedValueOnce(new AuthorizationError("Admin role required."));
    const unauthorized = await POST(request(), { params: Promise.resolve({ repoId: "research" }) });
    expect(unauthorized.status).toBe(403);
    expect(await unauthorized.json()).toEqual({ error: "Admin role required." });
  });

  it("returns request ids for unexpected API sync failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    requestManualRepoSync.mockRejectedValue(new Error("boom"));
    const { POST } = await import("@/app/api/admin/repos/[repoId]/sync/route");
    const request = new Request("https://docs.example.com/api/admin/repos/research/sync", {
      method: "POST",
      headers: {
        origin: "https://docs.example.com",
        accept: "application/json",
      },
    });

    const response = await POST(request, { params: Promise.resolve({ repoId: "research" }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Sync failed.");
    expect(body.requestId).toEqual(expect.any(String));
    expect(consoleError).toHaveBeenCalledWith("Manual repository sync failed", expect.objectContaining({ repoId: "research" }));
    consoleError.mockRestore();
  });
});
