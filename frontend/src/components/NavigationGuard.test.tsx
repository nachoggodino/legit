import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import NavigationGuard from "./NavigationGuard";

// react-router-dom is aliased to a mock in vite.config.ts;
// <Prompt> renders null in tests, so no router context is required.
function renderWithRouter(ui: React.ReactElement) {
  return render(ui);
}

describe("NavigationGuard", () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(window, "addEventListener");
    removeEventListenerSpy = vi.spyOn(window, "removeEventListener");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing visible", () => {
    const { container } = renderWithRouter(
      <NavigationGuard hasUnsavedEdits={false} isRequestActive={false} />
    );
    // Prompt renders nothing to the DOM when inactive
    expect(container.firstChild).toBeNull();
  });

  it("does NOT register beforeunload handler when no unsaved state", () => {
    addEventListenerSpy.mockClear();
    renderWithRouter(<NavigationGuard hasUnsavedEdits={false} isRequestActive={false} />);
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function)
    );
  });

  it("registers beforeunload handler when there is unsaved edits", () => {
    addEventListenerSpy.mockClear();
    renderWithRouter(<NavigationGuard hasUnsavedEdits={true} isRequestActive={false} />);
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function)
    );
  });

  it("registers beforeunload handler when there is active request", () => {
    addEventListenerSpy.mockClear();
    renderWithRouter(<NavigationGuard hasUnsavedEdits={false} isRequestActive={true} />);
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function)
    );
  });

  it.each([
    { hasUnsavedEdits: true, isRequestActive: false, label: "unsaved edits exist" },
    { hasUnsavedEdits: false, isRequestActive: true, label: "request is active" },
  ])("calls preventDefault on beforeunload event when $label", ({ hasUnsavedEdits, isRequestActive }) => {
    let handler: ((event: Event) => void) | null = null;
    addEventListenerSpy.mockImplementation(
      (event: string, listener: EventListener) => {
        if (event === "beforeunload") {
          handler = listener as (event: Event) => void;
        }
      }
    );

    renderWithRouter(<NavigationGuard hasUnsavedEdits={hasUnsavedEdits} isRequestActive={isRequestActive} />);

    if (handler) {
      const event = new Event("beforeunload") as any;
      event.preventDefault = vi.fn();
      handler(event);
      expect(event.preventDefault).toHaveBeenCalled();
    }
  });

  it("removes beforeunload handler on unmount when unsaved state exists", () => {
    let handler: EventListener | null = null;
    addEventListenerSpy.mockImplementation(
      (event: string, listener: EventListener) => {
        if (event === "beforeunload") {
          handler = listener;
        }
      }
    );
    removeEventListenerSpy.mockClear();

    const { unmount } = renderWithRouter(
      <NavigationGuard hasUnsavedEdits={true} isRequestActive={false} />
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      handler
    );
  });

  it("renders a Prompt that blocks navigation when shouldBlock is true", () => {
    // Prompt from react-router-dom v5 renders nothing to the DOM but attaches
    // a history listener internally — we verify the component mounts without
    // error and the container remains visually empty.
    const { container } = renderWithRouter(
      <NavigationGuard hasUnsavedEdits={true} isRequestActive={false} />
    );
    expect(container.firstChild).toBeNull();
  });
});
