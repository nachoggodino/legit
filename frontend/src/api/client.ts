// ---------------------------------------------------------------------------
// Backend URL resolution — single source of truth
//
// In development (localhost), Docusaurus dev-server proxies /file, /chat, etc.
// to the FastAPI backend (configured via the backendProxyPlugin in
// docusaurus.config.js). So relative URLs are used — no port mismatch.
//
// In production the reverse-proxy (nginx/Docker) routes requests, and
// VITE_BACKEND_URL / window.__BACKEND_URL__ can override the default.
// ---------------------------------------------------------------------------
const BACKEND_URL: string =
  (typeof window !== "undefined" &&
    (window as Window & { __BACKEND_URL__?: string }).__BACKEND_URL__) ||
  (import.meta as { env?: Record<string, string> }).env?.VITE_BACKEND_URL ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "" // empty → relative URLs, proxied by Docusaurus dev server to localhost:8021
    : `${window.location.protocol}//${window.location.hostname}:8021`);

// ---------------------------------------------------------------------------
// SSE parser: yields { event, data } objects from a ReadableStream body
// ---------------------------------------------------------------------------
async function* parseSSE(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<{ event: string; data: Record<string, unknown> }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        if (!block.trim()) continue;

        const lines = block.split("\n");
        let eventType = "message";
        const dataLines: string[] = [];

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            dataLines.push(line.slice(6));
          }
        }

        if (dataLines.length > 0) {
          try {
            const rawData = dataLines.join("\n");
            const data =
              rawData.trim() === "{}" ? {} : JSON.parse(rawData);
            yield { event: eventType, data };
          } catch {
            // malformed JSON — skip
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// GET /file
// ---------------------------------------------------------------------------
export async function fetchFile(path: string): Promise<string> {
  const url = `${BACKEND_URL}/file?path=${encodeURIComponent(path)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch file "${path}": ${res.status}`);
  }
  return res.text();
}

// ---------------------------------------------------------------------------
// Private helper: POST to an endpoint and yield SSE events
// ---------------------------------------------------------------------------
async function* _postSSE(
  endpoint: string,
  body: unknown,
  signal?: AbortSignal
): AsyncGenerator<{ event: string; data: Record<string, unknown> }> {
  const url = `${BACKEND_URL}/${endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`${endpoint} request failed: ${res.status}`);
  yield* parseSSE(res.body!);
}

// ---------------------------------------------------------------------------
// POST /chat  — SSE: reading_file | token | done | error
// ---------------------------------------------------------------------------
export interface ChatHandlers {
  onReadingFile?: (path: string) => void;
  onToken?: (text: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

export async function streamChat(
  query: string,
  handlers: ChatHandlers,
  signal?: AbortSignal
): Promise<void> {
  try {
    for await (const { event, data } of _postSSE("chat", { query }, signal)) {
      if (event === "reading_file") {
        handlers.onReadingFile?.((data as { path: string }).path);
      } else if (event === "token") {
        handlers.onToken?.((data as { text: string }).text);
      } else if (event === "done") {
        handlers.onDone?.();
      } else if (event === "error") {
        handlers.onError?.((data as { message: string }).message);
      }
    }
  } catch (err) {
    handlers.onError?.((err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// POST /edit  — SSE: status | done | error
// ---------------------------------------------------------------------------
export interface EditHandlers {
  onStatus?: (message: string) => void;
  onDone?: (content: string) => void;
  onError?: (message: string) => void;
}

export async function streamEdit(
  path: string,
  content: string,
  instruction: string,
  handlers: EditHandlers,
  signal?: AbortSignal
): Promise<void> {
  try {
    for await (const { event, data } of _postSSE(
      "edit",
      { path, content, instruction },
      signal
    )) {
      if (event === "status") {
        handlers.onStatus?.((data as { message: string }).message);
      } else if (event === "done") {
        handlers.onDone?.((data as { content: string }).content);
      } else if (event === "error") {
        handlers.onError?.((data as { message: string }).message);
      }
    }
  } catch (err) {
    handlers.onError?.((err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// POST /commit  — SSE: status | done | error
// ---------------------------------------------------------------------------
export interface CommitHandlers {
  onStatus?: (message: string) => void;
  onDone?: (commitUrl: string) => void;
  onError?: (message: string) => void;
}

export async function streamCommit(
  path: string,
  content: string,
  branch: string,
  handlers: CommitHandlers,
  signal?: AbortSignal
): Promise<void> {
  try {
    for await (const { event, data } of _postSSE(
      "commit",
      { path, content, branch },
      signal
    )) {
      if (event === "status") {
        handlers.onStatus?.((data as { message: string }).message);
      } else if (event === "done") {
        handlers.onDone?.((data as { commit_url: string }).commit_url);
      } else if (event === "error") {
        handlers.onError?.((data as { message: string }).message);
      }
    }
  } catch (err) {
    handlers.onError?.((err as Error).message);
  }
}
