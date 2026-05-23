"use client";

import { useEffect, useState } from "react";

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

export function MarkdownEditorLauncher({ repoSlug, documentPath }: { repoSlug: string; documentPath: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="floating-edit-button" type="button" onClick={() => setOpen(true)}>Edit</button>
      {open ? <MarkdownEditorModal repoSlug={repoSlug} documentPath={documentPath} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function MarkdownEditorModal({ repoSlug, documentPath, onClose }: { repoSlug: string; documentPath: string; onClose: () => void }) {
  const [currentPath, setCurrentPath] = useState(documentPath);
  const [path, setPath] = useState(documentPath);
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState("Loading");
  const [workflowResult, setWorkflowResult] = useState<CommitResult | null>(null);
  const [instruction, setInstruction] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  useEffect(() => {
    setCurrentPath(documentPath);
    setPath(documentPath);
    void fetch(`/api/repos/${repoSlug}/documents?path=${encodeURIComponent(documentPath)}`)
      .then((response) => response.json())
      .then((payload) => {
        setSource(payload.source ?? "");
        setStatus("");
      })
      .catch(() => setStatus("Could not load document"));
  }, [repoSlug, documentPath]);

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
    setStatus("Saving");
    const response = await fetch(`/api/repos/${repoSlug}/documents`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: currentPath, source }),
    });
    const payload = (await response.json()) as DocumentMutationResult;
    setStatus(statusFromResult("Save", payload, response.ok));
  }

  async function create() {
    setStatus("Creating");
    const response = await fetch(`/api/repos/${repoSlug}/documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, source }),
    });
    if (response.ok) {
      setCurrentPath(path);
    }
    const payload = (await response.json()) as DocumentMutationResult;
    setStatus(statusFromResult("Create", payload, response.ok));
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

  return (
    <div className="editor-backdrop" role="dialog" aria-modal="true" aria-label="Markdown editor">
      <div className="editor-modal">
        <header className="editor-toolbar">
          <input aria-label="Markdown path" value={path} onChange={(event) => setPath(event.target.value)} />
          <button type="button" onClick={() => void save()}>Save</button>
          <button type="button" onClick={() => void create()}>Create</button>
          <button type="button" onClick={() => void rename()}>Rename</button>
          <button type="button" onClick={() => void remove()}>Delete</button>
          <button type="button" onClick={onClose}>Close</button>
        </header>
        <div className="editor-ai-row">
          <input aria-label="AI edit instruction" value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="AI edit instruction" />
          <button type="button" disabled={!instruction.trim()} onClick={() => void applyAiEdit()}>Apply AI Edit</button>
          <span>{status}</span>
        </div>
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
          <textarea aria-label="Raw Markdown" value={source} onChange={(event) => setSource(event.target.value)} />
          <div className="editor-divider" aria-hidden="true" />
          <div className="markdown-body editor-preview" aria-label="Live preview" dangerouslySetInnerHTML={{ __html: preview }} />
        </div>
      </div>
    </div>
  );
}
