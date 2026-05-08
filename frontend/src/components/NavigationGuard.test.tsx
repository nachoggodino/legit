import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import NavigationGuard from "./NavigationGuard";

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

  it("renders nothing", () => {
    const { container } = render(
      <NavigationGuard hasUnsavedEdits={false} isRequestActive={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("does NOT register beforeunload handler when no unsaved state", () => {
    addEventListenerSpy.mockClear();
    render(<NavigationGuard hasUnsavedEdits={false} isRequestActive={false} />);
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function)
    );
  });

  it("registers beforeunload handler when there is unsaved edits", () => {
    addEventListenerSpy.mockClear();
    render(<NavigationGuard hasUnsavedEdits={true} isRequestActive={false} />);
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function)
    );
  });

  it("registers beforeunload handler when there is active request", () => {
    addEventListenerSpy.mockClear();
    render(<NavigationGuard hasUnsavedEdits={false} isRequestActive={true} />);
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function)
    );
  });

  it("calls preventDefault on beforeunload event when unsaved edits exist", () => {
    let handler: ((event: Event) => void) | null = null;
    addEventListenerSpy.mockImplementation(
      (event: string, listener: EventListener) => {
        if (event === "beforeunload") {
          handler = listener as (event: Event) => void;
        }
      }
    );

    render(<NavigationGuard hasUnsavedEdits={true} isRequestActive={false} />);

    if (handler) {
      const event = new Event("beforeunload") as any;
      event.preventDefault = vi.fn();
      handler(event);
      expect(event.preventDefault).toHaveBeenCalled();
    }
  });

  it("calls preventDefault on beforeunload event when request is active", () => {
    let handler: ((event: Event) => void) | null = null;
    addEventListenerSpy.mockImplementation(
      (event: string, listener: EventListener) => {
        if (event === "beforeunload") {
          handler = listener as (event: Event) => void;
        }
      }
    );

    render(<NavigationGuard hasUnsavedEdits={false} isRequestActive={true} />);

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

    const { unmount } = render(
      <NavigationGuard hasUnsavedEdits={true} isRequestActive={false} />
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      handler
    );
  });
});
