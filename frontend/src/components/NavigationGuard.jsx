import React, { useEffect } from "react";
import { Prompt } from "react-router-dom";

/**
 * Guards against page navigation when there are unsaved edits or an active AI
 * request.
 *
 * - `<Prompt>` intercepts in-app React Router navigation (sidebar links, etc.).
 * - `beforeunload` intercepts browser tab close / hard refresh.
 *
 * @param {{
 *   hasUnsavedEdits: boolean,
 *   isRequestActive: boolean,
 * }} props
 */
export default function NavigationGuard({
  hasUnsavedEdits,
  isRequestActive,
}) {
  const shouldBlock = hasUnsavedEdits || isRequestActive;

  const message = isRequestActive
    ? "An AI request is in progress. If you leave, it will be cancelled."
    : "You have unsaved changes. If you leave, they will be lost.";

  // Block browser tab close / refresh
  useEffect(() => {
    if (!shouldBlock) return;

    const handler = (e) => {
      e.preventDefault();
      e.returnValue = message;
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [shouldBlock, message]);

  // Block in-app React Router navigation
  return <Prompt when={shouldBlock} message={message} />;
}
