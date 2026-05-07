import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./MarkdownPreview.module.css";

/**
 * Renders a Markdown string as React elements.
 * Updates in real-time as `content` prop changes.
 *
 * @param {{ content: string }} props
 */
export default function MarkdownPreview({ content }) {
  return (
    <div className={styles.preview}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
