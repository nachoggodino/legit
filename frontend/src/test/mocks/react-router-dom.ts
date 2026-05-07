// Mock for react-router-dom used in tests
import { vi } from "vitest";

export const useLocation = vi.fn(() => ({ pathname: "/docs/intro" }));
export const useHistory = vi.fn(() => ({ push: vi.fn(), listen: vi.fn(() => () => {}) }));
export const useBlocker = vi.fn(() => ({ state: "unblocked", proceed: vi.fn(), reset: vi.fn() }));
export const Link = ({ children, to }: { children: React.ReactNode; to: string }) =>
  ({ type: "a", props: { href: to, children } } as unknown as JSX.Element);
