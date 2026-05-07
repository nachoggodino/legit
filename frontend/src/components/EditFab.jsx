import React from "react";
import styles from "./EditFab.module.css";

/** Pencil + spark combined SVG icon */
function PencilSparkIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      {/* Pencil body */}
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
      {/* Spark dot */}
      <circle cx="20" cy="4" r="2" fill="#facc15" />
    </svg>
  );
}

/** Simple spinning loader */
function Spinner() {
  return (
    <svg
      className={styles.spinner}
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" opacity="0.25" />
      <path d="M12 2a10 10 0 010 20" />
    </svg>
  );
}

/**
 * Floating action button for the edit assistant.
 *
 * @param {{ isLoading: boolean, isModalOpen: boolean, onToggle: () => void }} props
 */
export default function EditFab({ isLoading, isModalOpen, onToggle }) {
  return (
    <button
      className={styles.fab}
      onClick={onToggle}
      aria-label={isModalOpen ? "Minimize edit assistant" : "Open edit assistant"}
      title={isModalOpen ? "Minimize" : "Edit with AI"}
    >
      {isLoading ? <Spinner /> : <PencilSparkIcon />}
    </button>
  );
}
