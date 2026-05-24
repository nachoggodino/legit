import { describe, expect, it } from "vitest";
import { isSameOriginRequest, rejectCrossOriginMutation } from "@/server/http/origin";

describe("request origin checks", () => {
  it("accepts same-origin mutation requests", () => {
    const request = new Request("https://docs.example.com/api/repos/research/documents", {
      headers: { origin: "https://docs.example.com" },
    });

    expect(isSameOriginRequest(request)).toBe(true);
    expect(rejectCrossOriginMutation(request)).toBeNull();
  });

  it("rejects missing, malformed, and cross-origin mutation requests", async () => {
    const missing = new Request("https://docs.example.com/api/repos/research/documents");
    const malformed = new Request("https://docs.example.com/api/repos/research/documents", {
      headers: { origin: "not a url" },
    });
    const crossOrigin = new Request("https://docs.example.com/api/repos/research/documents", {
      headers: { origin: "https://evil.example.com" },
    });

    expect(isSameOriginRequest(missing)).toBe(false);
    expect(isSameOriginRequest(malformed)).toBe(false);
    expect(isSameOriginRequest(crossOrigin)).toBe(false);
    const response = rejectCrossOriginMutation(crossOrigin);
    expect(response?.status).toBe(403);
    expect(await response?.json()).toEqual({ error: "Invalid request origin." });
  });
});
