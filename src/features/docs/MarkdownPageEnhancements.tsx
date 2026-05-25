"use client";

import { useEffect } from "react";

function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value);
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  return Promise.resolve();
}

function renderCopyIcon(copied = false) {
  return copied
    ? '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>'
    : '<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" /></svg>';
}

export function MarkdownPageEnhancements() {
  useEffect(() => {
    const cleanup: Array<() => void> = [];

    document.querySelectorAll<HTMLElement>(".markdown-body pre").forEach((pre) => {
      if (pre.closest(".code-block-shell")) {
        return;
      }

      const shell = document.createElement("div");
      shell.className = "code-block-shell";
      pre.before(shell);
      shell.append(pre);

      const button = document.createElement("button");
      button.className = "code-copy-button";
      button.type = "button";
      button.innerHTML = renderCopyIcon();
      button.setAttribute("aria-label", "Copy code");
      button.title = "Copy code";
      shell.append(button);

      const handleClick = () => {
        void copyText(pre.textContent ?? "").then(() => {
          button.innerHTML = renderCopyIcon(true);
          button.setAttribute("aria-label", "Copied");
          button.title = "Copied";
          window.setTimeout(() => {
            button.innerHTML = renderCopyIcon();
            button.setAttribute("aria-label", "Copy code");
            button.title = "Copy code";
          }, 1200);
        });
      };
      button.addEventListener("click", handleClick);
      cleanup.push(() => button.removeEventListener("click", handleClick));
    });

    document.querySelectorAll<HTMLAnchorElement>(".heading-anchor").forEach((anchor) => {
      anchor.title = "Copy link";
      const handleClick = (event: MouseEvent) => {
        event.preventDefault();
        const url = new URL(window.location.href);
        url.hash = anchor.hash;
        void copyText(url.toString());
      };
      anchor.addEventListener("click", handleClick);
      cleanup.push(() => anchor.removeEventListener("click", handleClick));
    });

    return () => {
      cleanup.forEach((item) => item());
    };
  }, []);

  return null;
}
