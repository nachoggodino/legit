import { describe, expect, it } from "vitest";
import { canUseAi } from "@/server/auth/roles";
import { requestOpenAiCompatibleEdit, resolveContextLimits, streamOpenAiCompatibleChat } from "@/server/ai";

const ai = {
  enabled: true,
  allowAnonymous: false,
  baseUrlEnv: "AI_BASE_URL",
  apiKeyEnv: "AI_API_KEY",
  defaultModel: "gpt-4o",
  maxContextTokens: 150000,
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
});
