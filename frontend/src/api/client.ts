const BACKEND_URL =
  (typeof window !== "undefined" &&
    (window as Window & { __BACKEND_URL__?: string }).__BACKEND_URL__) ||
  (typeof process !== "undefined" && process.env?.BACKEND_URL) ||
  "http://localhost:8000";

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
  const res = await fetch(
    `${BACKEND_URL}/file?path=${encodeURIComponent(path)}`
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch file "${path}": ${res.status}`);
  }
  return res.text();
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

export function streamChat(
  query: string,
  handlers: ChatHandlers,
  signal?: AbortSignal
): Promise<void> {
  return (async () => {
    const res = await fetch(`${BACKEND_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal,
    });

    if (!res.ok) {
      handlers.onError?.(`Chat request failed: ${res.status}`);
      return;
    }

    for await (const { event, data } of parseSSE(res.body!)) {
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
  })();
}

// ---------------------------------------------------------------------------
// POST /edit  — SSE: status | done | error
// ---------------------------------------------------------------------------
export interface EditHandlers {
  onStatus?: (message: string) => void;
  onDone?: (content: string) => void;
  onError?: (message: string) => void;
}

export function streamEdit(
  path: string,
  content: string,
  instruction: string,
  handlers: EditHandlers,
  signal?: AbortSignal
): Promise<void> {
  return (async () => {
    const res = await fetch(`${BACKEND_URL}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content, instruction }),
      signal,
    });

    if (!res.ok) {
      handlers.onError?.(`Edit request failed: ${res.status}`);
      return;
    }

    for await (const { event, data } of parseSSE(res.body!)) {
      if (event === "status") {
        handlers.onStatus?.((data as { message: string }).message);
      } else if (event === "done") {
        handlers.onDone?.((data as { content: string }).content);
      } else if (event === "error") {
        handlers.onError?.((data as { message: string }).message);
      }
    }
  })();
}

// ---------------------------------------------------------------------------
// POST /commit  — SSE: status | done | error
// ---------------------------------------------------------------------------
export interface CommitHandlers {
  onStatus?: (message: string) => void;
  onDone?: (commitUrl: string) => void;
  onError?: (message: string) => void;
}

export function streamCommit(
  path: string,
  content: string,
  branch: string,
  handlers: CommitHandlers,
  signal?: AbortSignal
): Promise<void> {
  return (async () => {
    const res = await fetch(`${BACKEND_URL}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content, branch }),
      signal,
    });

    if (!res.ok) {
      handlers.onError?.(`Commit request failed: ${res.status}`);
      return;
    }

    for await (const { event, data } of parseSSE(res.body!)) {
      if (event === "status") {
        handlers.onStatus?.((data as { message: string }).message);
      } else if (event === "done") {
        handlers.onDone?.((data as { commit_url: string }).commit_url);
      } else if (event === "error") {
        handlers.onError?.((data as { message: string }).message);
      }
    }
  })();
}
