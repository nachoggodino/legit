import React from "react";
import defaultStyles from "./StatusList.module.css";

/**
 * Renders a list of status messages with aria-live for accessibility.
 *
 * @param {{
 *   messages: Array<{ id: number, text: string }>,
 *   listClassName?: string,
 *   itemClassName?: string,
 * }} props
 */
export default function StatusList({ messages, listClassName, itemClassName }) {
  if (!messages.length) return null;
  return (
    <ul className={listClassName ?? defaultStyles.statusList} aria-live="polite">
      {messages.map(({ id, text }) => (
        <li key={id} className={itemClassName ?? defaultStyles.statusItem}>
          {text}
        </li>
      ))}
    </ul>
  );
}
