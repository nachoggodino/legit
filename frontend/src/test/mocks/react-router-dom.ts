// Mock for react-router-dom used in tests
import React from "react";
import { vi } from "vitest";

export const useLocation = vi.fn(() => ({ pathname: "/docs/intro" }));
export const useHistory = vi.fn(() => ({ push: vi.fn(), listen: vi.fn(() => () => {}), block: vi.fn(() => () => {}) }));
export const useBlocker = vi.fn(() => ({ state: "unblocked", proceed: vi.fn(), reset: vi.fn() }));
export const Link = ({ children, to }: { children: React.ReactNode; to: string }) =>
  ({ type: "a", props: { href: to, children } } as unknown as JSX.Element);

// Prompt: renders nothing to the DOM; the when/message props are tested by
// inspecting history.block() calls in integration, not via DOM assertions.
export const Prompt = (_props: { when: boolean; message: string }) => null;

// MemoryRouter: lightweight wrapper for tests that mount components using <Prompt>
export const MemoryRouter = ({ children }: { children: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);
