import React from "react";
import styles from "./EditFab.module.css";

/** Pencil icon */
function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

/** Sparkle icon */
function SparkleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" />
    </svg>
  );
}

/** Simple spinning loader */
function Spinner() {
  return (
    <svg
      className={styles.spinner}
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
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
      {isLoading ? (
        <Spinner />
      ) : (
        <>
          <SparkleIcon />
          <PencilIcon />
        </>
      )}
      <span className={styles.label}>Edit</span>
    </button>
  );
}
