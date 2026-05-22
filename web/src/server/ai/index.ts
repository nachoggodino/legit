import type { CopisaurusConfig, RepositoryConfig } from "@/server/config";
import { readCandidateFiles, searchRepositoryDocs } from "@/server/search";

export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

export type AiChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

function resolveAiConfig(config: CopisaurusConfig, env: NodeJS.ProcessEnv = process.env) {
  const baseUrl = env[config.ai.baseUrlEnv];
  const apiKey = env[config.ai.apiKeyEnv];

  if (!config.ai.enabled) {
    throw new AiConfigError("AI is disabled for this instance.");
  }
  if (!baseUrl || !apiKey) {
    throw new AiConfigError("AI provider configuration is incomplete.");
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    model: config.ai.defaultModel,
  };
}

export function resolveContextLimits(maxContextTokens: number) {
  const budget = Math.max(1000, maxContextTokens);
  const maxResults = Math.min(20, Math.max(3, Math.floor(budget / 10_000)));
  const maxFiles = Math.min(8, Math.max(1, Math.floor(budget / 30_000)));
  const maxFileBytes = Math.min(80_000, Math.max(4_000, Math.floor((budget * 4) / Math.max(maxFiles, 1))));

  return { maxResults, maxFiles, maxFileBytes };
}

export async function buildDocsChatContext(
  repo: Pick<RepositoryConfig, "id" | "docsPath">,
  question: string,
  options: { reposRoot?: string; maxContextTokens?: number } = {},
) {
  const limits = resolveContextLimits(options.maxContextTokens ?? 150000);
  const results = await searchRepositoryDocs(repo, question, {
    maxResults: limits.maxResults,
    timeoutMs: 2500,
    reposRoot: options.reposRoot,
  });
  const uniquePaths = [...new Set(results.map((result) => result.path))].slice(0, limits.maxFiles);
  const files = readCandidateFiles(repo, uniquePaths, { reposRoot: options.reposRoot, maxBytes: limits.maxFileBytes });

  return { results, files };
}

export async function streamOpenAiCompatibleChat(
  config: CopisaurusConfig,
  messages: AiChatMessage[],
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<Response> {
  const ai = resolveAiConfig(config, options.env);
  const fetchImpl = options.fetchImpl ?? fetch;

  return fetchImpl(`${ai.baseUrl}/chat/completions`, {
    method: "POST",
    signal: options.signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ai.apiKey}`,
    },
    body: JSON.stringify({
      model: ai.model,
      stream: true,
      messages,
    }),
  });
}

export function makeDocsChatMessages(question: string, context: Awaited<ReturnType<typeof buildDocsChatContext>>): AiChatMessage[] {
  return [
    {
      role: "system",
      content:
        "You answer questions about this Markdown documentation repository. Use only provided excerpts and files. If the answer is not in the context, say what is missing.",
    },
    {
      role: "user",
      content: [
        `Question: ${question}`,
        "",
        "Search results:",
        ...context.results.map((result) => `- ${result.path}:${result.line}: ${result.snippet}`),
        "",
        "Candidate files:",
        ...context.files.map((file) => `--- ${file.path} ---\n${file.source}`),
      ].join("\n"),
    },
  ];
}

export function makeDocsEditMessages(instruction: string, source: string, documentPath: string): AiChatMessage[] {
  return [
    {
      role: "system",
      content:
        "You edit Markdown documentation. Return only the complete updated Markdown document. Do not wrap it in code fences and do not include commentary.",
    },
    {
      role: "user",
      content: [`Path: ${documentPath}`, `Instruction: ${instruction}`, "", "Current Markdown:", source].join("\n"),
    },
  ];
}

export async function requestOpenAiCompatibleEdit(
  config: CopisaurusConfig,
  messages: AiChatMessage[],
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<string> {
  const ai = resolveAiConfig(config, options.env);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${ai.baseUrl}/chat/completions`, {
    method: "POST",
    signal: options.signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ai.apiKey}`,
    },
    body: JSON.stringify({
      model: ai.model,
      stream: false,
      messages,
    }),
  });

  if (!response.ok) {
    throw new AiConfigError(`AI provider returned ${response.status}.`);
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const edited = payload.choices?.[0]?.message?.content?.trim();
  if (!edited) {
    throw new AiConfigError("AI provider returned an empty edit.");
  }

  return edited;
}
