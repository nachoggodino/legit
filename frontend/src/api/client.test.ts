import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchFile, streamChat, streamEdit, streamCommit } from "./client";

// ---------------------------------------------------------------------------
// Helpers to build a fake ReadableStream from SSE event strings
// ---------------------------------------------------------------------------
function makeSSEStream(...events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const body = events.join("\n\n") + "\n\n";
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
}

function sseBlock(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}`;
}

// ---------------------------------------------------------------------------
// fetchFile
// ---------------------------------------------------------------------------
describe("fetchFile", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns response text on success", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("# Hello", { status: 200 })
    );
    const result = await fetchFile("docs/intro.md");
    expect(result).toBe("# Hello");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("path=docs%2Fintro.md")
    );
  });

  it("throws on non-ok response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("Not Found", { status: 404 })
    );
    await expect(fetchFile("docs/missing.md")).rejects.toThrow("404");
  });
});

// ---------------------------------------------------------------------------
// streamChat
// ---------------------------------------------------------------------------
describe("streamChat", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("calls onReadingFile, onToken, and onDone in order", async () => {
    const stream = makeSSEStream(
      sseBlock("reading_file", { path: "docs/models.md" }),
      sseBlock("token", { text: "Hello" }),
      sseBlock("token", { text: " world" }),
      sseBlock("done", {})
    );
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(stream, { status: 200 })
    );

    const handlers = {
      onReadingFile: vi.fn(),
      onToken: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };

    await streamChat("What is GPT-4?", handlers);

    expect(handlers.onReadingFile).toHaveBeenCalledWith("docs/models.md");
    expect(handlers.onToken).toHaveBeenCalledWith("Hello");
    expect(handlers.onToken).toHaveBeenCalledWith(" world");
    expect(handlers.onDone).toHaveBeenCalledOnce();
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it("calls onError on SSE error event", async () => {
    const stream = makeSSEStream(
      sseBlock("error", { message: "LLM failed" })
    );
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(stream, { status: 200 })
    );

    const onError = vi.fn();
    await streamChat("query", { onError });
    expect(onError).toHaveBeenCalledWith("LLM failed");
  });

  it("calls onError when fetch returns non-ok", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("Server Error", { status: 500 })
    );
    const onError = vi.fn();
    await streamChat("query", { onError });
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("500"));
  });
});

// ---------------------------------------------------------------------------
// streamEdit
// ---------------------------------------------------------------------------
describe("streamEdit", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("calls onStatus and onDone with new content", async () => {
    const stream = makeSSEStream(
      sseBlock("status", { message: "Generating changes…" }),
      sseBlock("done", { content: "# Updated doc" })
    );
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(stream, { status: 200 })
    );

    const handlers = {
      onStatus: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };

    await streamEdit("docs/intro.md", "# Old", "Make it better", handlers);

    expect(handlers.onStatus).toHaveBeenCalledWith("Generating changes…");
    expect(handlers.onDone).toHaveBeenCalledWith("# Updated doc");
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it("calls onError on fetch failure", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("", { status: 503 })
    );
    const onError = vi.fn();
    await streamEdit("p", "c", "i", { onError });
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("503"));
  });
});

// ---------------------------------------------------------------------------
// streamCommit
// ---------------------------------------------------------------------------
describe("streamCommit", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("calls onStatus and onDone with commit URL", async () => {
    const stream = makeSSEStream(
      sseBlock("status", { message: "Updating index…" }),
      sseBlock("done", { commit_url: "https://gitlab.example.com/commit/abc" })
    );
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(stream, { status: 200 })
    );

    const handlers = {
      onStatus: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };

    await streamCommit("docs/intro.md", "# content", "master", handlers);

    expect(handlers.onStatus).toHaveBeenCalledWith("Updating index…");
    expect(handlers.onDone).toHaveBeenCalledWith(
      "https://gitlab.example.com/commit/abc"
    );
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it("sends correct JSON body", async () => {
    const stream = makeSSEStream(sseBlock("done", { commit_url: "" }));
    const spy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(stream, { status: 200 }));

    await streamCommit("docs/x.md", "body", "feature-branch", {});

    const call = spy.mock.calls[0];
    expect(call[1]?.body).toBe(
      JSON.stringify({
        path: "docs/x.md",
        content: "body",
        branch: "feature-branch",
      })
    );
  });
});
