"use client";

import { useEffect, useRef, useState } from "react";

type SearchResult = {
  path: string;
  line: number;
  snippet: string;
};

export function DocsSearch({ repoSlug, aiEnabled }: { repoSlug: string; aiEnabled: boolean }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  async function runSearch(nextQuery = query) {
    if (!nextQuery.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }

    setSearching(true);
    setStatus("");
    setOpen(true);
    try {
      const response = await fetch(`/api/repos/${repoSlug}/search?q=${encodeURIComponent(nextQuery)}`);
      const payload = await response.json();
      setResults(payload.results ?? []);
    } finally {
      setSearching(false);
    }
  }

  async function askAi() {
    setAnswer("");
    setStatus("Thinking");
    setOpen(true);
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
    <div className="search-box" role="search" ref={rootRef}>
      <input
        aria-label="Search docs"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => {
          if (results.length > 0 || answer || status || searching) {
            setOpen(true);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") void runSearch();
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder="Search docs and ask Legit"
      />
      <button type="button" onClick={() => void runSearch()}>Search</button>
      <button type="button" onClick={() => void askAi()} disabled={!aiEnabled || !query.trim()}>Ask AI</button>
      {open && (results.length > 0 || answer || status || searching) ? (
        <div className="search-popover">
          {searching ? (
            <p className="muted loading-line">
              <span className="spinner" aria-hidden="true" />
              Searching docs
            </p>
          ) : null}
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
