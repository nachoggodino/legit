"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const PREVIEW_DEBOUNCE_MS = 120;
type LinkImpact = { path: string; line: number; snippet: string };
type PendingConfirmation =
  | { kind: "rename"; impacts: LinkImpact[]; fromPath: string; toPath: string }
  | { kind: "delete"; impacts: LinkImpact[] };
type CommitResult = {
  committed?: boolean;
  commitUrl?: string | null;
  branch?: string | null;
  branchUrl?: string | null;
  pullRequestUrl?: string | null;
  mode?: "direct" | "branch" | "merge-request";
};
type DocumentMutationResult = { commit?: CommitResult; error?: string; code?: string };

function IconX() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" style={{ width: 28, height: 28 }}>
      <path d="M4.5 4.5 19.5 19.5" strokeWidth="3.8" />
      <path d="M19.5 4.5 4.5 19.5" strokeWidth="3.8" />
    </svg>
  );
}

function IconSave() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 3h12l2 2v16H5V3Z" />
      <path d="M8 3v6h8V3" />
      <path d="M8 21v-7h8v7" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 20h4.6L19.3 9.3a2.1 2.1 0 0 0 0-3L17.7 4.7a2.1 2.1 0 0 0-3 0L4 15.4V20Z" />
      <path d="m13.5 5.9 4.6 4.6" />
    </svg>
  );
}

function EditorSpinner({ label }: { label: string }) {
  return (
    <span className="loading-line">
      <span className="spinner" aria-hidden="true" />
      {label}
    </span>
  );
}

function renderHighlightedMarkdown(source: string) {
  return source.split("\n").map((line, lineIndex) => {
    const pieces: ReactNode[] = [];
    const heading = /^(#{1,6})(\s.*)?$/.exec(line);
    const fence = /^(```|~~~).*$/.exec(line);
    const tableRow = /^\s*\|.*\|\s*$/.exec(line);

    if (heading) {
      pieces.push(
        <span className="md-token md-heading-marker" key="heading-marker">
          {heading[1]}
        </span>,
      );
      pieces.push(
        <span className="md-token md-heading-text" key="heading-text">
          {heading[2] ?? ""}
        </span>,
      );
    } else if (fence) {
      pieces.push(
        <span className="md-token md-code-fence" key="code-fence">
          {line}
        </span>,
      );
    } else {
      const parts = line.split(/(`[^`]*`|<u>.*?<\/u>|~~[^~]+~~|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^)]+\)|^>\s?|^[-*+]\s|^\d+\.\s|\|)/g);
      parts.forEach((part, partIndex) => {
        if (!part) return;
        let className = "";
        if (/^`[^`]*`$/.test(part)) className = "md-inline-code";
        else if (/^(\*\*[^*]+\*\*|__[^_]+__)$/.test(part)) className = "md-strong";
        else if (/^(\*[^*\n]+\*|_[^_\n]+_)$/.test(part)) className = "md-emphasis";
        else if (/^~~[^~]+~~$/.test(part)) className = "md-strike";
        else if (/^<u>.*<\/u>$/.test(part)) className = "md-underline";
        else if (/^\[[^\]]+\]\([^)]+\)$/.test(part)) className = "md-link";
        else if (/^>\s?$/.test(part)) className = "md-blockquote-marker";
        else if (/^([-*+]\s|\d+\.\s)$/.test(part)) className = "md-list-marker";
        else if (part === "|" && tableRow) className = "md-table-marker";

        pieces.push(
          <span className={className ? `md-token ${className}` : undefined} key={`${lineIndex}:${partIndex}`}>
            {part}
          </span>,
        );
      });
    }

    return (
      <Fragment key={lineIndex}>
        {pieces.length > 0 ? pieces : " "}
        {"\n"}
      </Fragment>
    );
  });
}

export function MarkdownEditorLauncher({ repoSlug, documentPath }: { repoSlug: string; documentPath: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="floating-edit-button" type="button" aria-label="Edit page" title="Edit page" onClick={() => setOpen(true)}>
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M4 20h4.6L19.3 9.3a2.1 2.1 0 0 0 0-3L17.7 4.7a2.1 2.1 0 0 0-3 0L4 15.4V20Z" />
          <path d="m13.5 5.9 4.6 4.6" />
        </svg>
        <span>Edit page</span>
      </button>
      {open ? (
        <MarkdownEditorModal
          key={`${repoSlug}:${documentPath}`}
          repoSlug={repoSlug}
          documentPath={documentPath}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function CreateMarkdownFileButton({ repoSlug }: { repoSlug: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="sidebar-create-button" type="button" onClick={() => setOpen(true)}>
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
        <span>New file</span>
      </button>
      {open ? (
        <MarkdownEditorModal
          key={`${repoSlug}:new`}
          repoSlug={repoSlug}
          documentPath=""
          create
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function MarkdownEditorModal({
  repoSlug,
  documentPath,
  create = false,
  onClose,
}: {
  repoSlug: string;
  documentPath: string;
  create?: boolean;
  onClose: () => void;
}) {
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const sourceRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const scrollSyncRef = useRef<"source" | "preview" | null>(null);
  const [currentPath, setCurrentPath] = useState(documentPath);
  const [path, setPath] = useState(documentPath);
  const [source, setSource] = useState("");
  const [savedSource, setSavedSource] = useState("");
  const [savedPath, setSavedPath] = useState(documentPath);
  const [isCreateMode, setIsCreateMode] = useState(create);
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState("Loading");
  const [workflowResult, setWorkflowResult] = useState<CommitResult | null>(null);
  const [instruction, setInstruction] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [showUnsavedConfirmation, setShowUnsavedConfirmation] = useState(false);
  const highlightedSource = useMemo(() => renderHighlightedMarkdown(source), [source]);
  const isDirty = source !== savedSource || path !== savedPath;
  const isBusy = ["Loading", "Saving", "Creating", "Scanning links", "Renaming", "Deleting", "Applying AI edit"].includes(status);

  useEffect(() => {
    if (create) {
      setStatus("");
      return;
    }

    void fetch(`/api/repos/${repoSlug}/documents?path=${encodeURIComponent(documentPath)}`)
      .then((response) => response.json())
      .then((payload) => {
        setSource(payload.source ?? "");
        setSavedSource(payload.source ?? "");
        setSavedPath(documentPath);
        setStatus("");
      })
      .catch(() => setStatus("Could not load document"));
  }, [repoSlug, documentPath, create]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void fetch("/api/markdown/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, path, repoSlug }),
      })
        .then((response) => response.json())
        .then((payload) => setPreview(payload.html ?? ""))
        .catch(() => setPreview("<p>Preview failed.</p>"));
    }, PREVIEW_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [source, path, repoSlug]);

  function statusFromResult(action: string, payload: DocumentMutationResult, ok: boolean): string {
    if (!ok) {
      const label = payload.code === "protected-branch" ? "Protected branch" : payload.code === "conflict" ? "Conflict" : payload.code === "auth" ? "Auth failure" : payload.code === "provider-api" ? "Provider API failure" : `${action} failed`;
      return `${label}: ${payload.error ?? "Request failed"}`;
    }

    setWorkflowResult(payload.commit ?? null);
    if (payload.commit?.pullRequestUrl) return `${action} complete. Pull request is ready.`;
    if (payload.commit?.branchUrl) return `${action} complete on branch ${payload.commit.branch}.`;
    if (payload.commit?.commitUrl) return `${action} committed directly.`;
    return `${action} complete. No file changes to commit.`;
  }

  async function save() {
    const targetPath = isCreateMode ? path.trim() : currentPath;
    if (!targetPath) {
      setStatus("Markdown path is required.");
      return;
    }

    setStatus(isCreateMode ? "Creating" : "Saving");
    const response = await fetch(`/api/repos/${repoSlug}/documents`, {
      method: isCreateMode ? "POST" : "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: targetPath, source }),
    });
    const payload = (await response.json()) as DocumentMutationResult;
    if (response.ok) {
      setCurrentPath(targetPath);
      setPath(targetPath);
      setSavedSource(source);
      setSavedPath(targetPath);
      setIsCreateMode(false);
    }
    setStatus(statusFromResult(isCreateMode ? "Create" : "Save", payload, response.ok));
  }

  function syncScroll(from: "source" | "preview", element: HTMLElement) {
    if (scrollSyncRef.current && scrollSyncRef.current !== from) {
      return;
    }

    scrollSyncRef.current = from;
    const target = from === "source" ? previewRef.current : sourceRef.current;
    const highlight = highlightRef.current;
    const scrollable = element.scrollHeight - element.clientHeight;
    const ratio = scrollable > 0 ? element.scrollTop / scrollable : 0;

    if (target) {
      const targetScrollable = target.scrollHeight - target.clientHeight;
      target.scrollTop = targetScrollable > 0 ? ratio * targetScrollable : 0;
    }
    if (highlight) {
      highlight.scrollTop = from === "source" ? element.scrollTop : sourceRef.current?.scrollTop ?? 0;
      highlight.scrollLeft = sourceRef.current?.scrollLeft ?? 0;
    }

    window.setTimeout(() => {
      scrollSyncRef.current = null;
    }, 0);
  }

  async function fetchLinkImpact(kind: "rename" | "delete", targetPath: string) {
    const response = await fetch(`/api/repos/${repoSlug}/documents`, {
      method: kind === "rename" ? "PATCH" : "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(kind === "rename" ? { fromPath: targetPath, scanOnly: true } : { path: targetPath, scanOnly: true }),
    });
    const payload = (await response.json()) as { impacts?: LinkImpact[] };
    return payload.impacts ?? [];
  }

  async function rename() {
    setStatus("Scanning links");
    const impacts = await fetchLinkImpact("rename", currentPath);
    setPendingConfirmation({ kind: "rename", impacts, fromPath: currentPath, toPath: path });
    setStatus("");
  }

  async function confirmRename() {
    if (pendingConfirmation?.kind !== "rename" || !pendingConfirmation.toPath.trim()) {
      return;
    }
    const toPath = pendingConfirmation.toPath.trim();
    setStatus("Renaming");
    const response = await fetch(`/api/repos/${repoSlug}/documents`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromPath: pendingConfirmation.fromPath, toPath, confirmed: true }),
    });
    if (response.ok) {
      setCurrentPath(toPath);
      setPath(toPath);
      setSavedPath(toPath);
      setPendingConfirmation(null);
    }
    const payload = (await response.json()) as DocumentMutationResult;
    setStatus(statusFromResult("Rename", payload, response.ok));
  }

  async function remove() {
    setStatus("Scanning links");
    const impacts = await fetchLinkImpact("delete", currentPath);
    setPendingConfirmation({ kind: "delete", impacts });
    setStatus("");
  }

  async function confirmDelete() {
    if (pendingConfirmation?.kind !== "delete") {
      return;
    }
    setStatus("Deleting");
    const response = await fetch(`/api/repos/${repoSlug}/documents`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: currentPath, confirmed: true }),
    });
    if (response.ok) {
      setPendingConfirmation(null);
    }
    const payload = (await response.json()) as DocumentMutationResult;
    setStatus(statusFromResult("Delete", payload, response.ok));
  }

  async function applyAiEdit() {
    setStatus("Applying AI edit");
    const response = await fetch(`/api/repos/${repoSlug}/ai/edit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: currentPath, source, instruction }),
    });
    const payload = (await response.json()) as { source?: string; error?: string };
    if (!response.ok || typeof payload.source !== "string") {
      setStatus(payload.error ?? "AI edit failed");
      return;
    }
    setSource(payload.source);
    setStatus("AI edit applied. Review and save to commit.");
  }

  function requestClose() {
    if (isDirty) {
      setShowUnsavedConfirmation(true);
      return;
    }
    onClose();
  }

  return (
    <div
      className="editor-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Markdown editor"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          requestClose();
        }
      }}
    >
      <div className="editor-modal">
        <header className="editor-toolbar">
          <div className="editor-path-field">
            <button
              type="button"
              aria-label="Rename file"
              title="Rename file"
              onClick={() => void rename()}
              disabled={isCreateMode || path === currentPath || !path.trim()}
            >
              <IconPencil />
            </button>
            <input aria-label="Markdown path" value={path} onChange={(event) => setPath(event.target.value)} />
          </div>
          <button
            className="primary-action editor-icon-button"
            type="button"
            aria-label={isCreateMode ? "Create" : "Save"}
            title={isCreateMode ? "Create" : "Save"}
            onClick={() => void save()}
            disabled={status === "Saving" || status === "Creating"}
          >
            <IconSave />
          </button>
          <button
            className="danger-action editor-icon-button"
            type="button"
            aria-label="Delete page"
            title="Delete page"
            onClick={() => void remove()}
            disabled={isCreateMode || status === "Deleting"}
          >
            <IconTrash />
          </button>
          <button className="editor-close-button" type="button" aria-label="Close" title="Close" onClick={requestClose}>
            <IconX />
          </button>
        </header>
        {workflowResult ? (
          <section className="editor-workflow-result" aria-label="Commit workflow result">
            <strong>{workflowResult.mode === "merge-request" ? "Review request created" : workflowResult.mode === "branch" ? "Branch committed" : "Direct commit"}</strong>
            {workflowResult.commitUrl ? <a href={workflowResult.commitUrl}>Commit</a> : null}
            {workflowResult.branchUrl ? <a href={workflowResult.branchUrl}>Branch</a> : null}
            {workflowResult.pullRequestUrl ? <a href={workflowResult.pullRequestUrl}>PR/MR</a> : null}
          </section>
        ) : null}
        {pendingConfirmation ? (
          <section className="editor-confirmation" aria-label={`${pendingConfirmation.kind} confirmation`}>
            <div>
              <strong>{pendingConfirmation.kind === "rename" ? "Confirm rename" : "Confirm delete"}</strong>
              <span>{pendingConfirmation.kind === "rename" ? pendingConfirmation.fromPath : currentPath}</span>
            </div>
            {pendingConfirmation.kind === "rename" ? (
              <input
                aria-label="New Markdown path"
                value={pendingConfirmation.toPath}
                onChange={(event) => setPendingConfirmation({ ...pendingConfirmation, toPath: event.target.value })}
              />
            ) : null}
            <div className="editor-impact-list">
              {pendingConfirmation.impacts.length === 0 ? (
                <span>No inbound Markdown links were found.</span>
              ) : (
                pendingConfirmation.impacts.slice(0, 5).map((impact) => (
                  <span key={`${impact.path}:${impact.line}`}>
                    {impact.path}:{impact.line} {impact.snippet}
                  </span>
                ))
              )}
            </div>
            <div className="editor-confirmation-actions">
              <button
                type="button"
                onClick={() =>
                  pendingConfirmation.kind === "rename" ? void confirmRename() : void confirmDelete()
                }
              >
                Confirm
              </button>
              <button type="button" onClick={() => setPendingConfirmation(null)}>Cancel</button>
            </div>
          </section>
        ) : null}
        <div className="editor-panes">
          <div className="editor-source-shell">
            <pre className="editor-highlight" aria-hidden="true" ref={highlightRef}>{highlightedSource}</pre>
            <textarea
              ref={sourceRef}
              aria-label="Raw Markdown"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              onScroll={(event) => {
                if (highlightRef.current) {
                  highlightRef.current.scrollTop = event.currentTarget.scrollTop;
                  highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
                }
                syncScroll("source", event.currentTarget);
              }}
              spellCheck={false}
            />
            {status === "Loading" ? (
              <div className="editor-loading">
                <EditorSpinner label="Loading editor" />
              </div>
            ) : null}
          </div>
          <div className="editor-divider" aria-hidden="true" />
          <div
            className="markdown-body editor-preview"
            aria-label="Live preview"
            ref={previewRef}
            onScroll={(event) => syncScroll("preview", event.currentTarget)}
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        </div>
        <footer className="editor-ai-row">
          <div className="editor-ai-input">
            <input
              aria-label="AI edit instruction"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="Describe the AI edit for this document"
            />
          </div>
          <button type="button" disabled={!instruction.trim() || status === "Applying AI edit"} onClick={() => void applyAiEdit()}>Edit with AI</button>
          <span className="editor-status" aria-live="polite">{isBusy ? <EditorSpinner label={status} /> : status}</span>
        </footer>
        {showUnsavedConfirmation ? (
          <div className="editor-unsaved-dialog" role="alertdialog" aria-modal="true" aria-label="Unsaved changes">
            <div className="editor-unsaved-card">
              <strong>Unsaved changes</strong>
              <p>Close the editor without saving this page?</p>
              <div className="editor-confirmation-actions">
                <button className="danger-action" type="button" onClick={onClose}>Discard changes</button>
                <button type="button" onClick={() => setShowUnsavedConfirmation(false)}>Keep editing</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
