"use client";

import { useEffect, useState } from "react";

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
  const [path, setPath] = useState(documentPath);
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState("Loading");
  const [instruction, setInstruction] = useState("");

  useEffect(() => {
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
    }, 120);

    return () => clearTimeout(handle);
  }, [source, path, repoSlug]);

  async function save() {
    setStatus("Saving");
    const response = await fetch(`/api/repos/${repoSlug}/documents`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, source }),
    });
    setStatus(response.ok ? "Saved and queued through commit workflow." : "Save failed");
  }

  async function create() {
    setStatus("Creating");
    const response = await fetch(`/api/repos/${repoSlug}/documents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, source }),
    });
    setStatus(response.ok ? "Created and queued through commit workflow." : "Create failed");
  }

  async function fetchLinkImpact(kind: "rename" | "delete", targetPath: string) {
    const response = await fetch(`/api/repos/${repoSlug}/documents`, {
      method: kind === "rename" ? "PATCH" : "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(kind === "rename" ? { fromPath: targetPath, scanOnly: true } : { path: targetPath, scanOnly: true }),
    });
    const payload = (await response.json()) as { impacts?: Array<{ path: string; line: number; snippet: string }> };
    return payload.impacts ?? [];
  }

  function impactSummary(impacts: Array<{ path: string; line: number; snippet: string }>) {
    if (impacts.length === 0) {
      return "No inbound Markdown links were found.";
    }

    return [
      `${impacts.length} inbound link${impacts.length === 1 ? "" : "s"} may need updates:`,
      ...impacts.slice(0, 5).map((impact) => `${impact.path}:${impact.line} ${impact.snippet}`),
    ].join("\n");
  }

  async function rename() {
    const toPath = window.prompt("Rename Markdown file to:", path);
    if (!toPath) {
      return;
    }
    setStatus("Scanning links");
    const impacts = await fetchLinkImpact("rename", path);
    if (!window.confirm(`Rename ${path} to ${toPath}?\n\n${impactSummary(impacts)}`)) {
      setStatus("");
      return;
    }
    setStatus("Renaming");
    const response = await fetch(`/api/repos/${repoSlug}/documents`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromPath: path, toPath, confirmed: true }),
    });
    if (response.ok) {
      setPath(toPath);
    }
    setStatus(response.ok ? "Renamed and queued through commit workflow." : "Rename failed");
  }

  async function remove() {
    setStatus("Scanning links");
    const impacts = await fetchLinkImpact("delete", path);
    if (!window.confirm(`Delete ${path}?\n\n${impactSummary(impacts)}`)) {
      setStatus("");
      return;
    }
    setStatus("Deleting");
    const response = await fetch(`/api/repos/${repoSlug}/documents`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, confirmed: true }),
    });
    setStatus(response.ok ? "Deleted and queued through commit workflow." : "Delete failed");
  }

  async function applyAiEdit() {
    setStatus("Applying AI edit");
    const response = await fetch(`/api/repos/${repoSlug}/ai/edit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, source, instruction }),
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
        <div className="editor-panes">
          <textarea aria-label="Raw Markdown" value={source} onChange={(event) => setSource(event.target.value)} />
          <div className="editor-divider" aria-hidden="true" />
          <div className="markdown-body editor-preview" aria-label="Live preview" dangerouslySetInnerHTML={{ __html: preview }} />
        </div>
      </div>
    </div>
  );
}
