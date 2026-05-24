import { describe, expect, it } from "vitest";
import { canUseAi } from "@/server/auth/roles";
import type { LegitConfig } from "@/server/config";
import {
  makeDocsChatMessages,
  makeDocsEditMessages,
  requestOpenAiCompatibleEdit,
  resolveContextLimits,
  streamOpenAiCompatibleChat,
} from "@/server/ai";

const ai = {
  enabled: true,
  allowAnonymous: false,
  baseUrlEnv: "AI_BASE_URL",
  apiKeyEnv: "AI_API_KEY",
  defaultModel: "gpt-4o",
  maxContextTokens: 150000,
};

const config: LegitConfig = {
  ai,
  app: { name: "Legit" },
  auth: { defaultRole: "viewer", admins: { emails: [], domains: [] } },
  repos: [],
  sync: { intervalSeconds: 1, pullOnStartup: false, reindexOnChange: false },
};

describe("AI chat access", () => {
  it("rejects anonymous users by default", () => {
    expect(canUseAi({ ai }, null)).toBe(false);
  });

  it("allows authenticated users when AI is enabled", () => {
    expect(canUseAi({ ai }, { role: "viewer" })).toBe(true);
    expect(canUseAi({ ai }, { role: "viewer" }, { ai: { enabled: false } })).toBe(false);
  });

  it("streams provider chunks with a mocked OpenAI-compatible provider", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: hello\n\n"));
        controller.close();
      },
    });
    const response = await streamOpenAiCompatibleChat(
      { ai, app: { name: "Legit" }, auth: { defaultRole: "viewer", admins: { emails: [], domains: [] } }, repos: [], sync: { intervalSeconds: 1, pullOnStartup: false, reindexOnChange: false } },
      [{ role: "user", content: "hello" }],
      {
        env: { AI_BASE_URL: "https://ai.example.test/v1", AI_API_KEY: "secret" } as unknown as NodeJS.ProcessEnv,
        fetchImpl: async () => new Response(stream, { headers: { "content-type": "text/event-stream" } }),
      },
    );

    expect(await response.text()).toBe("data: hello\n\n");
  });

  it("requires enabled and complete AI provider configuration", async () => {
    await expect(
      streamOpenAiCompatibleChat({ ...config, ai: { ...ai, enabled: false } }, [{ role: "user", content: "hello" }], {
        env: { AI_BASE_URL: "https://ai.example.test/v1", AI_API_KEY: "secret" } as unknown as NodeJS.ProcessEnv,
      }),
    ).rejects.toThrow("AI is disabled");

    await expect(
      streamOpenAiCompatibleChat(config, [{ role: "user", content: "hello" }], {
        env: { AI_BASE_URL: "https://ai.example.test/v1" } as unknown as NodeJS.ProcessEnv,
      }),
    ).rejects.toThrow("incomplete");
  });

  it("resolves context limits from configured token budget", () => {
    expect(resolveContextLimits(4000)).toEqual({ maxResults: 3, maxFiles: 1, maxFileBytes: 16000 });
    expect(resolveContextLimits(150000).maxFileBytes).toBeLessThanOrEqual(80000);
  });

  it("requests a non-streaming edit from the configured provider", async () => {
    const edited = await requestOpenAiCompatibleEdit(
      { ai, app: { name: "Legit" }, auth: { defaultRole: "viewer", admins: { emails: [], domains: [] } }, repos: [], sync: { intervalSeconds: 1, pullOnStartup: false, reindexOnChange: false } },
      [{ role: "user", content: "edit" }],
      {
        env: { AI_BASE_URL: "https://ai.example.test/v1", AI_API_KEY: "secret" } as unknown as NodeJS.ProcessEnv,
        fetchImpl: async (_input, init) => {
          expect(JSON.parse(String(init?.body)).stream).toBe(false);
          return Response.json({ choices: [{ message: { content: "# Edited" } }] });
        },
      },
    );

    expect(edited).toBe("# Edited");
  });

  it("uses AI_MODEL override and trims base URLs", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    await streamOpenAiCompatibleChat(
      { ai, app: { name: "Legit" }, auth: { defaultRole: "viewer", admins: { emails: [], domains: [] } }, repos: [], sync: { intervalSeconds: 1, pullOnStartup: false, reindexOnChange: false } },
      [{ role: "user", content: "hello" }],
      {
        env: { AI_BASE_URL: "https://ai.example.test/v1///", AI_API_KEY: "secret", AI_MODEL: "gpt-test" } as unknown as NodeJS.ProcessEnv,
        fetchImpl: async (input, init) => {
          calls.push({ input, init });
          return new Response("ok");
        },
      },
    );

    expect(String(calls[0].input)).toBe("https://ai.example.test/v1/chat/completions");
    expect(JSON.parse(String(calls[0].init?.body)).model).toBe("gpt-test");
  });

  it("reports bad edit provider responses", async () => {
    await expect(
      requestOpenAiCompatibleEdit(config, [{ role: "user", content: "edit" }], {
        env: { AI_BASE_URL: "https://ai.example.test/v1", AI_API_KEY: "secret" } as unknown as NodeJS.ProcessEnv,
        fetchImpl: async () => new Response("nope", { status: 502 }),
      }),
    ).rejects.toThrow("502");

    await expect(
      requestOpenAiCompatibleEdit(config, [{ role: "user", content: "edit" }], {
        env: { AI_BASE_URL: "https://ai.example.test/v1", AI_API_KEY: "secret" } as unknown as NodeJS.ProcessEnv,
        fetchImpl: async () => Response.json({ choices: [{ message: { content: "   " } }] }),
      }),
    ).rejects.toThrow("empty edit");
  });

  it("builds chat and edit prompts from supplied context", () => {
    const chat = makeDocsChatMessages("How?", {
      results: [{ repoId: "repo", path: "index.md", line: 2, snippet: "Answer" }],
      files: [{ path: "index.md", source: "# Title\n\nAnswer" }],
    });
    const edit = makeDocsEditMessages("Shorten", "# Long", "index.md");

    expect(chat[1].content).toContain("index.md:2: Answer");
    expect(chat[1].content).toContain("--- index.md ---");
    expect(edit[1].content).toContain("Instruction: Shorten");
    expect(edit[1].content).toContain("Path: index.md");
  });
});
