"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getPreferredTheme(): Theme {
  if (typeof window === "undefined") {
    return "dark";
  }

  const stored = window.localStorage.getItem("legit-theme");
  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M4.93 4.93 6.7 6.7M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07 6.7 17.3M17.3 6.7l1.77-1.77" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M20.1 14.2A7.7 7.7 0 0 1 9.8 3.9 8.7 8.7 0 1 0 20.1 14.2Z" />
    </svg>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getPreferredTheme);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function chooseTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    window.localStorage.setItem("legit-theme", nextTheme);
  }

  function toggleTheme() {
    chooseTheme(theme === "light" ? "dark" : "light");
  }

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      onClick={toggleTheme}
      suppressHydrationWarning
    >
      <span
        className="theme-toggle-option"
        aria-label="Use light theme"
        data-active={theme === "light"}
        suppressHydrationWarning
      >
        <SunIcon />
      </span>
      <span
        className="theme-toggle-option"
        aria-label="Use dark theme"
        data-active={theme === "dark"}
        suppressHydrationWarning
      >
        <MoonIcon />
      </span>
    </button>
  );
}
