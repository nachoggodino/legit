import { useEffect } from "react";

/**
 * Guards against page navigation when there are unsaved edits or an active AI
 * request. Uses beforeunload to prevent losing work.
 *
 * @param {{
 *   hasUnsavedEdits: boolean,
 *   isRequestActive: boolean,
 *   onCancelRequest?: () => void,
 * }} props
 */
export default function NavigationGuard({
  hasUnsavedEdits,
  isRequestActive,
}) {
  // Block browser tab close / refresh when there is unsaved state
  useEffect(() => {
    if (!hasUnsavedEdits && !isRequestActive) return;

    const message = isRequestActive
      ? "An AI request is in progress. If you leave, it will be cancelled."
      : "You have unsaved changes. If you leave, they will be lost.";

    const handler = (e) => {
      e.preventDefault();
      e.returnValue = message;
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedEdits, isRequestActive]);

  return null;
}
