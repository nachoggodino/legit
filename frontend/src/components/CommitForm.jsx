import React, { useState, useRef } from "react";
import { streamCommit } from "../api/client";
import StatusList from "./StatusList";
import styles from "./CommitForm.module.css";

/**
 * Inline commit form: branch input + confirm → SSE commit stream.
 *
 * @param {{
 *   path: string,
 *   content: string,
 *   defaultBranch?: string,
 * }} props
 */
export default function CommitForm({ path, content, defaultBranch = "master" }) {
  const [branch, setBranch] = useState(defaultBranch);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessages, setStatusMessages] = useState([]);
  const [commitUrl, setCommitUrl] = useState("");
  const [error, setError] = useState("");

  const abortRef = useRef(null);
  const statusIdRef = useRef(0);

  const handleCommit = () => {
    if (!branch.trim() || isLoading) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setStatusMessages([]);
    setCommitUrl("");
    setError("");

    streamCommit(path, content, branch.trim(), {
      onStatus: (message) =>
        setStatusMessages((prev) => [
          ...prev,
          { id: statusIdRef.current++, text: message },
        ]),
      onDone: (url) => {
        setIsLoading(false);
        setCommitUrl(url);
        statusIdRef.current = 0;
      },
      onError: (message) => {
        setIsLoading(false);
        setError(message);
      },
    }, controller.signal);
  };

  return (
    <div className={styles.container}>
      {!commitUrl && (
        <div className={styles.form}>
          <label htmlFor="commit-branch" className={styles.label}>
            Branch
          </label>
          <input
            id="commit-branch"
            type="text"
            className={styles.input}
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            disabled={isLoading}
            placeholder="master"
            aria-label="Branch name"
          />
          <button
            className={styles.commitButton}
            onClick={handleCommit}
            disabled={isLoading || !branch.trim()}
          >
            {isLoading ? "Committing…" : "Commit"}
          </button>
        </div>
      )}

      <StatusList
        messages={statusMessages}
        listClassName={styles.statusList}
        itemClassName={styles.statusItem}
      />

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {commitUrl && (
        <p className={styles.success} role="status">
          Committed!{" "}
          <a href={commitUrl} target="_blank" rel="noreferrer">
            View commit ↗
          </a>
        </p>
      )}
    </div>
  );
}
