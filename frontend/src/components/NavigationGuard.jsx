import { useEffect, useCallback } from "react";
import { useBlocker } from "react-router-dom";

/**
 * Guards against page navigation when there are unsaved edits or an active AI
 * request. Does NOT trigger on modal minimize/close — only on route changes.
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
  onCancelRequest,
}) {
  const shouldBlock = hasUnsavedEdits || isRequestActive;

  // Block in-app React Router navigation (v6.4+ useBlocker API)
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        shouldBlock && currentLocation.pathname !== nextLocation.pathname,
      [shouldBlock]
    )
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;

    const message = isRequestActive
      ? "An AI request is in progress. If you leave, it will be cancelled. Are you sure?"
      : "You have unsaved changes. If you leave, they will be lost. Are you sure?";

    if (window.confirm(message)) {
      if (isRequestActive) onCancelRequest?.();
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, isRequestActive, onCancelRequest]);

  // Block browser tab close / refresh when there is unsaved state
  useEffect(() => {
    if (!hasUnsavedEdits && !isRequestActive) return;

    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedEdits, isRequestActive]);

  return null;
}
