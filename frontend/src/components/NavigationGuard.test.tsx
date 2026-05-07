import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import NavigationGuard from "./NavigationGuard";
import { useBlocker } from "react-router-dom";

// react-router-dom is mocked in vite.config.ts alias via src/test/mocks/react-router-dom.ts

describe("NavigationGuard", () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    confirmSpy = vi.spyOn(window, "confirm");
    // Default: router is not blocked
    vi.mocked(useBlocker).mockReturnValue({
      state: "unblocked",
      proceed: vi.fn(),
      reset: vi.fn(),
    });
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

  it("does NOT prompt when blocker is unblocked", () => {
    render(<NavigationGuard hasUnsavedEdits={false} isRequestActive={false} />);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("does NOT prompt when blocker is unblocked even with unsaved edits", () => {
    render(<NavigationGuard hasUnsavedEdits={true} isRequestActive={false} />);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("prompts with unsaved-edits message when blocker is blocked", () => {
    const proceed = vi.fn();
    const reset = vi.fn();
    vi.mocked(useBlocker).mockReturnValue({ state: "blocked", proceed, reset });
    confirmSpy.mockReturnValue(true);

    render(<NavigationGuard hasUnsavedEdits={true} isRequestActive={false} />);

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("unsaved changes")
    );
    expect(proceed).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
  });

  it("prompts with active-request message when blocker is blocked and isRequestActive", () => {
    const proceed = vi.fn();
    const reset = vi.fn();
    vi.mocked(useBlocker).mockReturnValue({ state: "blocked", proceed, reset });
    confirmSpy.mockReturnValue(true);

    render(
      <NavigationGuard
        hasUnsavedEdits={false}
        isRequestActive={true}
        onCancelRequest={vi.fn()}
      />
    );

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("AI request is in progress")
    );
    expect(proceed).toHaveBeenCalledOnce();
  });

  it("calls reset and does NOT call proceed when user cancels navigation", () => {
    const proceed = vi.fn();
    const reset = vi.fn();
    vi.mocked(useBlocker).mockReturnValue({ state: "blocked", proceed, reset });
    confirmSpy.mockReturnValue(false);

    render(<NavigationGuard hasUnsavedEdits={true} isRequestActive={false} />);

    expect(reset).toHaveBeenCalledOnce();
    expect(proceed).not.toHaveBeenCalled();
  });

  it("calls onCancelRequest when user confirms navigation with active request", () => {
    const proceed = vi.fn();
    const reset = vi.fn();
    const onCancelRequest = vi.fn();
    vi.mocked(useBlocker).mockReturnValue({ state: "blocked", proceed, reset });
    confirmSpy.mockReturnValue(true);

    render(
      <NavigationGuard
        hasUnsavedEdits={false}
        isRequestActive={true}
        onCancelRequest={onCancelRequest}
      />
    );

    expect(onCancelRequest).toHaveBeenCalledOnce();
    expect(proceed).toHaveBeenCalledOnce();
  });

  it("does NOT call onCancelRequest when user cancels navigation", () => {
    const proceed = vi.fn();
    const reset = vi.fn();
    const onCancelRequest = vi.fn();
    vi.mocked(useBlocker).mockReturnValue({ state: "blocked", proceed, reset });
    confirmSpy.mockReturnValue(false);

    render(
      <NavigationGuard
        hasUnsavedEdits={false}
        isRequestActive={true}
        onCancelRequest={onCancelRequest}
      />
    );

    expect(onCancelRequest).not.toHaveBeenCalled();
    expect(reset).toHaveBeenCalledOnce();
  });

  it("registers beforeunload handler when there is unsaved state", () => {
    const addSpy = vi.spyOn(window, "addEventListener");

    render(<NavigationGuard hasUnsavedEdits={true} isRequestActive={false} />);

    expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });

  it("does NOT register beforeunload handler when no unsaved state", () => {
    const addSpy = vi.spyOn(window, "addEventListener");

    render(<NavigationGuard hasUnsavedEdits={false} isRequestActive={false} />);

    expect(addSpy).not.toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });
});
