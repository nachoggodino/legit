---
name: frontend-setup-patterns
description: "Use when working with Docosaurus 3.x frontend setup, implementing custom components, swizzling, and SSE streaming via fetch. Covers Docosaurus config, Docosaurus swizzling patterns, Vitest setup, and ReadableStream SSE parsing."
---

# Frontend Setup Patterns — Copisaurus

## Docosaurus 3.x Overview

The frontend is built on **Docosaurus 3.x**, a React-based static site generator for documentation. Key facts:

- **No SPA**: Docosaurus generates static HTML at build time; client-side navigation happens via React Router.
- **Custom components**: Add custom React components via swizzling or direct inclusion in `src/`.
- **No traditional routing config**: Pages are auto-generated from Markdown files in `docs/`.
- **Theme swizzling**: Customize Docosaurus theme components by creating files in `src/theme/`.

---

## Docosaurus Configuration

The main config file is `docusaurus.config.js` at the repository root. Key sections:

```js
const config = {
  title: "Copisaurus",
  url: "http://localhost:3000",
  baseUrl: "/",
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",
  
  presets: [
    [
      "@docusaurus/preset-classic",
      {
        docs: {
          sidebarPath: "./sidebars.js",
        },
        blog: false,
        theme: { customCss: "./src/custom.css" },
      },
    ],
  ],
  
  themeConfig: {
    navbar: {
      title: "Copisaurus",
      logo: { alt: "Logo", src: "img/logo.svg" },
      items: [
        // navbar items defined here; custom components injected in swizzled Navbar
      ],
    },
  },
};
```

---

## Swizzling Docosaurus Components

**Swizzling** is the official mechanism to customize Docosaurus theme components. All custom navbar components (AiSearchBar, EditFab, etc.) are integrated into a swizzled navbar.

### Step 1: Swizzle the Navbar

```bash
npx docusaurus swizzle @docusaurus/theme-classic Navbar --wrap
```

This creates `src/theme/Navbar/index.jsx` (the wrapper) and `src/theme/Navbar/Original.jsx` (the original component).

### Step 2: Structure the swizzled Navbar

```jsx
// src/theme/Navbar/index.jsx
import OriginalNavbar from "@theme-original/Navbar";
import AiSearchBar from "@site/src/components/AiSearchBar";
import EditFab from "@site/src/components/EditFab";

export default function Navbar(props) {
  return (
    <>
      {/* Original Docosaurus navbar */}
      <OriginalNavbar {...props} />
      
      {/* Custom components positioned absolutely or via Docosaurus slot hooks */}
      <AiSearchBar />
      <EditFab />
    </>
  );
}
```

### Docosaurus Conventions

- Use `@site/src/` to import from the `src/` folder (Docosaurus alias).
- Access `useLocation` from `react-router-dom` for navigation detection.
- Access `useColorMode` from `@docusaurus/theme-common` for dark/light mode.
- Never modify Docosaurus core files outside `src/theme/`.

---

## Custom Components Directory

Custom components live in `src/components/` and are imported directly into swizzled theme components.

```
frontend/src/
├── components/
│   ├── AiSearchBar.jsx       # Main search + AI button
│   ├── EditFab.jsx           # Floating action button
│   ├── EditModal.jsx         # Modal for editing
│   ├── MarkdownPreview.jsx   # Live Markdown preview
│   ├── CommitForm.jsx        # Commit branch form
│   ├── NavigationGuard.jsx   # Page navigation protection
│   └── *.module.css          # Co-located styles
├── theme/
│   └── Navbar/
│       ├── index.jsx         # Swizzled wrapper
│       └── Original.jsx      # Original Docosaurus component (auto-generated)
├── api/
│   └── client.ts             # All fetch calls
└── test/
    └── setup.ts              # Vitest setup
```

---

## SSE Streaming via `fetch` + `ReadableStream`

The backend endpoints `/chat`, `/edit`, and `/commit` return SSE streams. **`EventSource` cannot be used** — it only supports `GET` requests. Use `fetch` and consume `response.body` manually.

### SSE Event Format

```
event: reading_file
data: {"path": "docs/models.md"}

event: token
data: {"text": "Based on"}

event: done
data: {}

event: error
data: {"message": "..."}

```

Multi-line data (e.g. Markdown) may be encoded as **multiple `data:` lines**. The consumer must join them with `\n`.

For parsing implementation, see the canonical pattern in `src/api/client.ts`: use `ReadableStream.getReader()`, accumulate chunks in a buffer, split on `\n\n`, extract event/data pairs, and yield `{ event, data }` objects as an async generator.

---

## Vite Dev Server Proxy

If running a separate Vite dev server alongside Docosaurus, configure `/api` proxy to backend:

```ts
// vite.config.ts
server: {
  proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } }
}
```
