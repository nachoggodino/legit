import React, { useState, useRef, useCallback } from "react";
import { streamChat } from "../api/client";
import MarkdownPreview from "./MarkdownPreview";
import styles from "./AiSearchBar.module.css";

/** Spark / sparkle icon for the AI button */
function SparkIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" />
    </svg>
  );
}

/**
 * AI-powered search bar for the Docusaurus navbar.
 *
 * - Text input: always visible; Enter key is a no-op (no plain-text search).
 * - "Search with AI" button: triggers an SSE stream from /chat.
 * - Status text appears below input while loading.
 * - Result renders as a streaming Markdown block (max 60vh, then scrollable).
 */
export default function AiSearchBar() {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [result, setResult] = useState("");
  const [hasResult, setHasResult] = useState(false);

  const abortRef = useRef(null);

  const handleSearch = useCallback(() => {
    if (!query.trim() || isLoading) return;

    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setStatusText("");
    setResult("");
    setHasResult(false);

    streamChat(
      query,
      {
        onReadingFile: (path) => setStatusText(`Reading: ${path}…`),
        onToken: (text) => setResult((prev) => prev + text),
        onDone: () => {
          setIsLoading(false);
          setStatusText("");
          setHasResult(true);
        },
        onError: (message) => {
          setIsLoading(false);
          setStatusText(`Error: ${message}`);
          setHasResult(false);
        },
      },
      controller.signal
    );
  }, [query, isLoading]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleQueryChange = (e) => {
    setQuery(e.target.value);
    // Clear result when the user starts a new query
    if (hasResult) {
      setHasResult(false);
      setResult("");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.inputRow}>
        <label htmlFor="ai-search-input" className={styles.srOnly}>
          Search documentation
        </label>
        <input
          id="ai-search-input"
          type="search"
          className={styles.input}
          placeholder="Search docs…"
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          aria-busy={isLoading}
        />
        <button
          className={styles.aiButton}
          onClick={handleSearch}
          disabled={isLoading || !query.trim()}
          aria-label="Search with AI"
          title="Search with AI"
        >
          <SparkIcon />
          <span className={styles.aiLabel}>AI</span>
        </button>
      </div>

      {statusText && (
        <p className={styles.status} role="status" aria-live="polite">
          {statusText}
        </p>
      )}

      {(result || isLoading) && (
        <div
          className={styles.resultContainer}
          style={{ maxHeight: "60vh", overflowY: "auto" }}
          aria-live="polite"
          aria-label="AI search result"
        >
          <MarkdownPreview content={result} />
          {isLoading && <span className={styles.cursor} aria-hidden="true" />}
        </div>
      )}
    </div>
  );
}
