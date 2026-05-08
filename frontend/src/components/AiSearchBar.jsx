import React, { useState, useRef, useCallback } from "react";
import { streamChat } from "../api/client";
import MarkdownPreview from "./MarkdownPreview";
import SparkleIcon from "./icons/SparkleIcon";
import styles from "./AiSearchBar.module.css";

/** Search icon */
function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

/**
 * AI-powered search bar for the Docusaurus navbar.
 *
 * - Text input: always visible
 * - Search icon button + Enter: triggers AI search (no separate search plugin is configured)
 * - "AI" button: also triggers AI search
 */
export default function AiSearchBar() {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [result, setResult] = useState("");
  const [hasResult, setHasResult] = useState(false);

  const abortRef = useRef(null);

  const handleAiSearch = useCallback(() => {
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
      handleAiSearch();
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
        <button
          className={styles.searchButton}
          onClick={handleAiSearch}
          disabled={isLoading}
          aria-label="Search"
          title="Search"
        >
          <SearchIcon />
        </button>
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
          onClick={handleAiSearch}
          disabled={isLoading}
          aria-label="Search with AI"
          title="Search with AI"
        >
          <SparkleIcon size={16} />
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
