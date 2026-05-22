"use client";

import { useState } from "react";

type SearchResult = {
  path: string;
  line: number;
  snippet: string;
};

export function DocsSearch({ repoSlug, aiEnabled }: { repoSlug: string; aiEnabled: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("");

  async function runSearch(nextQuery = query) {
    if (!nextQuery.trim()) {
      setResults([]);
      return;
    }

    const response = await fetch(`/api/repos/${repoSlug}/search?q=${encodeURIComponent(nextQuery)}`);
    const payload = await response.json();
    setResults(payload.results ?? []);
  }

  async function askAi() {
    setAnswer("");
    setStatus("Thinking");
    const response = await fetch(`/api/repos/${repoSlug}/ai/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: query }),
    });

    if (!response.ok || !response.body) {
      setStatus(response.status === 401 ? "Sign in to use AI" : "AI is unavailable");
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      setAnswer((current) => current + decoder.decode(value, { stream: true }));
    }
    setStatus("");
  }

  return (
    <div className="search-box" role="search">
      <input
        aria-label="Search docs"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void runSearch();
        }}
        placeholder="Search docs and ask Copisaurus"
      />
      <button type="button" onClick={() => void runSearch()}>Search</button>
      <button type="button" onClick={() => void askAi()} disabled={!aiEnabled || !query.trim()}>Ask AI</button>
      {(results.length > 0 || answer || status) ? (
        <div className="search-popover">
          {status ? <p className="muted">{status}</p> : null}
          {results.map((result) => (
            <a key={`${result.path}:${result.line}`} href={`/${repoSlug}/${result.path.replace(/\/index\.md$/, "").replace(/\.md$/, "")}`}>
              <strong>{result.path}:{result.line}</strong>
              <span>{result.snippet}</span>
            </a>
          ))}
          {answer ? <pre className="ai-answer">{answer}</pre> : null}
        </div>
      ) : null}
    </div>
  );
}
