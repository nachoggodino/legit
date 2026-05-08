import React, { useState, useRef, useEffect, useCallback } from "react";
import { fetchFile, streamEdit } from "../api/client";
import MarkdownPreview from "./MarkdownPreview";
import CommitForm from "./CommitForm";
import NavigationGuard from "./NavigationGuard";
import StatusList from "./StatusList";
import SparkleIcon from "./icons/SparkleIcon";
import styles from "./EditModal.module.css";

/**
 * Near-fullscreen split-pane edit modal.
 *
 * Props:
 *   isOpen         {boolean}   Whether the modal overlay is visible
 *   onClose        {() => void}  Called when the user minimizes/closes
 *   filePath       {string}    Path of the current page's Markdown file (e.g. "docs/intro.md")
 *   defaultBranch  {string}    Default Git branch for CommitForm
 */
export default function EditModal({
  isOpen,
  onClose,
  filePath,
  defaultBranch = "master",
  onEditingChange,
}) {
  // Content state — fetched once per session; never re-fetched on re-open
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const hasFetchedRef = useRef(false);

  // AI edit state
  const [instruction, setInstruction] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editStatuses, setEditStatuses] = useState([]);
  const [editError, setEditError] = useState("");
  const editStatusIdRef = useRef(0);

  // Commit UI toggle
  const [showCommit, setShowCommit] = useState(false);

  // Autoscroll toggle
  const [enableAutoScroll, setEnableAutoScroll] = useState(true);

  // Split-pane divider drag state
  const [leftWidth, setLeftWidth] = useState(50); // percentage
  const isDragging = useRef(false);
  const containerRef = useRef(null);

  // Synchronized scroll refs
  const editorRef = useRef(null);
  const previewPanelRef = useRef(null);
  const isSyncingRef = useRef(false);

  // Abort controller for in-flight edit request
  const abortRef = useRef(null);

  // Notify parent when editing state changes (e.g. FAB spinner)
  useEffect(() => {
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);

  // ---------------------------------------------------------------------------
  // Reset fetch flag when filePath changes so we fetch the new file
  // ---------------------------------------------------------------------------
  useEffect(() => {
    hasFetchedRef.current = false;
  }, [filePath]);

  // ---------------------------------------------------------------------------
  // Fetch file content once per filePath
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || !filePath || hasFetchedRef.current) return;

    hasFetchedRef.current = true;
    setIsFetching(true);
    setFetchError("");

    fetchFile(filePath)
      .then((text) => {
        setContent(text);
        setOriginalContent(text);
      })
      .catch((err) => {
        setFetchError(err.message ?? "Failed to load file.");
      })
      .finally(() => setIsFetching(false));
  }, [isOpen, filePath]);

  // ---------------------------------------------------------------------------
  // Derived state: unsaved edits
  // ---------------------------------------------------------------------------
  const hasUnsavedEdits = content !== originalContent;

  // ---------------------------------------------------------------------------
  // Cancel in-flight edit request (called by NavigationGuard on confirmed nav)
  // ---------------------------------------------------------------------------
  const cancelRequest = useCallback(() => {
    abortRef.current?.abort();
    setIsEditing(false);
  }, []);

  // ---------------------------------------------------------------------------
  // AI edit submit
  // ---------------------------------------------------------------------------
  const handleEditSubmit = useCallback(() => {
    if (!instruction.trim() || isEditing) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsEditing(true);
    setEditStatuses([]);
    setEditError("");

    streamEdit(
      filePath,
      content,
      instruction.trim(),
      {
        onStatus: (msg) =>
          setEditStatuses((prev) => [
            ...prev,
            { id: editStatusIdRef.current++, text: msg },
          ]),
        onDone: (newContent) => {
          setContent(newContent);
          setIsEditing(false);
          setInstruction("");
          setEditStatuses([]);
          editStatusIdRef.current = 0;
        },
        onError: (msg) => {
          setEditError(msg);
          setIsEditing(false);
        },
      },
      controller.signal
    );
  }, [filePath, content, instruction, isEditing]);

  const handleInstructionKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleEditSubmit();
    }
  };

  // ---------------------------------------------------------------------------
  // Draggable divider
  // ---------------------------------------------------------------------------
  const handleDividerMouseDown = (e) => {
    e.preventDefault();
    isDragging.current = true;
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newLeft = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.min(Math.max(newLeft, 20), 80));
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Synchronized scroll between editor and preview panes
  // ---------------------------------------------------------------------------
  const handleEditorScroll = useCallback(() => {
    if (!enableAutoScroll || isSyncingRef.current || !editorRef.current || !previewPanelRef.current) return;
    
    const editor = editorRef.current;
    const preview = previewPanelRef.current;
    
    // Calculate scroll ratio (0 to 1)
    const scrollableHeight = editor.scrollHeight - editor.clientHeight;
    if (scrollableHeight === 0) return;
    
    const ratio = editor.scrollTop / scrollableHeight;
    
    // Sync preview pane
    isSyncingRef.current = true;
    const previewScrollableHeight = preview.scrollHeight - preview.clientHeight;
    preview.scrollTop = ratio * previewScrollableHeight;
    isSyncingRef.current = false;
  }, [enableAutoScroll]);

  const handlePreviewScroll = useCallback(() => {
    if (!enableAutoScroll || isSyncingRef.current || !editorRef.current || !previewPanelRef.current) return;
    
    const editor = editorRef.current;
    const preview = previewPanelRef.current;
    
    // Calculate scroll ratio (0 to 1)
    const scrollableHeight = preview.scrollHeight - preview.clientHeight;
    if (scrollableHeight === 0) return;
    
    const ratio = preview.scrollTop / scrollableHeight;
    
    // Sync editor pane
    isSyncingRef.current = true;
    const editorScrollableHeight = editor.scrollHeight - editor.clientHeight;
    editor.scrollTop = ratio * editorScrollableHeight;
    isSyncingRef.current = false;
  }, [enableAutoScroll]);

  useEffect(() => {
    const editor = editorRef.current;
    const preview = previewPanelRef.current;
    
    if (!editor || !preview) return;
    
    editor.addEventListener("scroll", handleEditorScroll);
    preview.addEventListener("scroll", handlePreviewScroll);
    
    return () => {
      editor.removeEventListener("scroll", handleEditorScroll);
      preview.removeEventListener("scroll", handlePreviewScroll);
    };
  }, [handleEditorScroll, handlePreviewScroll]);

  // ---------------------------------------------------------------------------
  // Handle overlay click (close when clicking outside modal content)
  // ---------------------------------------------------------------------------
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (!isOpen) return null;

  return (
    <>
      <NavigationGuard
        hasUnsavedEdits={hasUnsavedEdits}
        isRequestActive={isEditing}
      />

      <div 
        className={styles.overlay} 
        role="dialog" 
        aria-modal="true" 
        aria-label="Edit document"
        onClick={handleOverlayClick}
      >
        <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className={styles.header}>
            <span className={styles.filePath}>{filePath}</span>
            <div className={styles.headerActions}>
              {/* Autoscroll toggle */}
              <label className={styles.autoscrollToggle} title="Auto-scroll both panes together">
                <input
                  type="checkbox"
                  checked={enableAutoScroll}
                  onChange={(e) => setEnableAutoScroll(e.target.checked)}
                  aria-label="Toggle autoscroll"
                />
                <span className={styles.toggleSlider} />
                <span className={styles.toggleLabel}>Autoscroll</span>
              </label>
              {!showCommit && (
                <button
                  className={styles.commitToggle}
                  onClick={() => setShowCommit(true)}
                  disabled={isEditing || isFetching}
                >
                  Commit
                </button>
              )}
              <button
                className={styles.closeButton}
                onClick={onClose}
                aria-label="Minimize edit modal"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Split pane */}
          <div className={styles.splitPane} ref={containerRef}>
            {/* Left: Editor */}
            <div
              className={styles.editorPanel}
              style={{ width: `${leftWidth}%` }}
            >
              {isFetching && (
                <p className={styles.loadingText}>Loading file…</p>
              )}
              {fetchError && (
                <p className={styles.errorText} role="alert">{fetchError}</p>
              )}
              {!isFetching && !fetchError && (
                <>
                  <label htmlFor="markdown-editor" className={styles.srOnly}>
                    Markdown content
                  </label>
                  <textarea
                    id="markdown-editor"
                    ref={editorRef}
                    className={styles.textarea}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    disabled={isEditing}
                    spellCheck={false}
                  />
                </>
              )}

              {/* AI instruction input */}
              <div className={styles.instructionRow}>
                <label htmlFor="edit-instruction" className={styles.srOnly}>
                  AI instruction
                </label>
                <input
                  id="edit-instruction"
                  type="text"
                  className={styles.instructionInput}
                  placeholder="Describe the change you want…"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={handleInstructionKeyDown}
                  disabled={isEditing || isFetching}
                  aria-label="AI instruction"
                />
                <button
                  className={styles.sendButton}
                  onClick={handleEditSubmit}
                  disabled={isEditing || isFetching}
                  aria-label="Apply AI edit"
                >
                  {isEditing ? (
                    "…"
                  ) : (
                    <>
                      <SparkleIcon size={16} />
                      <span>Ask AI</span>
                    </>
                  )}
                </button>
              </div>

              {/* AI edit status messages */}
              <StatusList
                messages={editStatuses}
                listClassName={styles.statusList}
                itemClassName={styles.statusItem}
              />

              {editError && (
                <p className={styles.errorText} role="alert">{editError}</p>
              )}

              {/* Commit form */}
              {showCommit && (
                <CommitForm
                  path={filePath}
                  content={content}
                  defaultBranch={defaultBranch}
                />
              )}
            </div>

            {/* Divider */}
            <div
              className={styles.divider}
              onMouseDown={handleDividerMouseDown}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") setLeftWidth((w) => Math.max(w - 5, 20));
                if (e.key === "ArrowRight") setLeftWidth((w) => Math.min(w + 5, 80));
              }}
              role="separator"
              aria-label="Resize panels"
              aria-orientation="vertical"
              aria-valuenow={Math.round(leftWidth)}
              aria-valuemin={20}
              aria-valuemax={80}
              tabIndex={0}
            />

            {/* Right: Preview */}
            <div
              ref={previewPanelRef}
              className={styles.previewPanel}
              style={{ width: `${100 - leftWidth}%` }}
            >
              <MarkdownPreview content={content} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
