---
name: react-vite-practices
description: "Use when writing, reviewing, or generating React or TypeScript code for Copisaurus. Covers functional components, hooks, CSS Modules, Docosaurus swizzling, SSE streaming, fetch usage, and component structure."
---

# React / TypeScript Best Practices — Copisaurus

## Project Structure

```
frontend/src/
├── components/
│   ├── AiSearchBar.jsx         # Navbar search input + AI button
│   ├── EditFab.jsx             # Floating action button (pencil+spark)
│   ├── EditModal.jsx           # Split-pane editor/preview modal
│   ├── MarkdownPreview.jsx     # Live Markdown renderer
│   ├── CommitForm.jsx          # Branch selection + confirm button
│   ├── NavigationGuard.jsx     # Page-change confirmation prompt
│   └── *.module.css            # Co-located styles
├── theme/
│   └── Navbar/
│       └── index.jsx           # Swizzled Docosaurus navbar
├── api/
│   └── client.ts               # All fetch calls for SSE + regular requests
├── App.tsx
└── main.tsx
```

## Docosaurus Swizzling

The frontend is built on Docosaurus 3.x. Custom components are added via **swizzling** — replacing or wrapping Docosaurus core components.

- Swizzled components live in `src/theme/`.
- The swizzled navbar (`src/theme/Navbar/index.jsx`) renders the original Docosaurus navbar items plus custom components (AiSearchBar, Git provider link).
- Do **not** modify Docosaurus core files outside the swizzle folder.
- Use `useLocation` from `react-router-dom` to detect page changes for the NavigationGuard.

```jsx
import { useLocation } from "react-router-dom";

export function EditFab() {
  const location = useLocation();
  // Use location.pathname to trigger guards on navigation
}
```

## Components

- Use **functional components only**. No class components.
- Each component is its own file. If it has styles, place a co-located `.module.css`.
- Extract sub-components when JSX exceeds ~100 lines or a logical sub-section repeats.

```tsx
// Good
export function EditFab({ isLoading, onClick }: EditFabProps) {
  return <button className={styles.fab}>{isLoading ? <Spinner /> : <PencilSpark />}</button>;
}

// Bad
class EditFab extends React.Component { ... }
```

## TypeScript

- All component props must have an explicit interface or type.
- Use `interface` for object shapes; `type` for unions/aliases.
- No `any` — use `unknown` and narrow, or define proper types.
- Keep shared types in `src/types/` or co-located if component-specific.

```tsx
interface AiSearchBarProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
}
```

## Hooks

- Only call hooks at the **top level** of a function component — never inside conditions, loops, or nested functions.
- `useState` / `useEffect` / `useCallback` / `useRef` for local state and side effects.
- Do **not** introduce external state managers (`redux`, `zustand`, `jotai`, etc.).
- Extract repeated stateful logic into a custom `use*` hook.

```tsx
// Good — hook at top level
const [isOpen, setIsOpen] = useState(false);
const [markdown, setMarkdown] = useState("");
useEffect(() => { /* ... */ }, []);

// Bad — hook inside condition
if (shouldRender) {
  const [state, setState] = useState(null); // rules of hooks violation
}
```

## HTTP / API Calls

- Use the native `fetch` API. **Never introduce `axios` or any other HTTP library.**
- All fetch calls live in `src/api/client.ts`. Components do not call `fetch` directly.
- Always handle errors: check `response.ok` and throw/set error state.

```ts
// src/api/client.ts
export async function fetchFile(path: string): Promise<string> {
  const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
  return res.text();
}
```

## SSE Streaming

For long-running operations (`/chat`, `/edit`, `/commit`), consume Server-Sent Events via `ReadableStream`.

```ts
export async function* streamChat(query: string) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Chat failed: ${res.status}`);
  
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        const eventType = line.slice(7);
        const dataLine = lines.shift();
        if (dataLine?.startsWith("data: ")) {
          const data = JSON.parse(dataLine.slice(6));
          yield { event: eventType, data };
        }
      }
    }
  }
}
```

Then consume in a component:

```tsx
useEffect(() => {
  (async () => {
    for await (const { event, data } of streamChat(query)) {
      if (event === "token") {
        setResult(prev => prev + data.text);
      } else if (event === "error") {
        setError(data.message);
      }
    }
  })();
}, [query]);
```

## CSS / Styling

- Use CSS Modules exclusively. File must be co-located and named `Component.module.css`.
- No inline `style={{}}` except for truly dynamic values (e.g., max-height for expandable result).
- No global class name collisions — CSS Modules scope automatically.
- Class names in CSS files: `camelCase` (`.splitPane`, not `.split-pane`), accessed as `styles.splitPane`.

```tsx
import styles from "./EditModal.module.css";

<div className={styles.splitPane}>...</div>
```

## Modal State Management

- Modal state (open/minimized, unsaved edits, current file) lives in the `EditModal` component.
- Pass state down to children (FAB, textarea, preview) via props.
- Use `useRef` to detect changes in textarea without triggering excessive re-renders.

```tsx
const textareaRef = useRef<HTMLTextAreaElement>(null);
const originalContent = useRef(initialContent);
const hasChanges = textareaRef.current?.value !== originalContent.current;
```

## Navigation Guard

The `NavigationGuard` component prompts users when they attempt to navigate away with:

1. **An active AI request** (e.g., streaming `/chat` or `/edit`)
2. **Unsaved edits** (textarea differs from original content, and no active request)

Use the `beforeunload` event for same-page navigation and `useBlocker` (React Router v6.4+) for in-app routing.

## Accessibility (a11y)

- Use semantic HTML elements (`<nav>`, `<main>`, `<section>`, `<button>`, `<label>`, etc.).
- Every `<input>` and `<textarea>` must have an associated `<label>` (via `htmlFor` + `id`).
- Interactive elements must be focusable and operable by keyboard.
- Avoid `onClick` on `<div>` — use `<button>` instead.

## Anti-patterns to Avoid

| Anti-pattern | Correct alternative |
|---|---|
| Class components | Functional components |
| `axios` or other HTTP clients | Native `fetch` in `src/api/client.ts` |
| `redux`, `zustand`, etc. | `useState` / `useEffect` |
| Inline `fetch` in components | Functions in `src/api/client.ts` |
| Global CSS classes | CSS Modules (`.module.css`) |
| Hooks inside conditions | Hooks at top level only |
| `<div onClick={...}>` | `<button>` |
| Manual Markdown parsing | Docosaurus MDX rendering (built-in) |
| Modifying Docosaurus core files | Use swizzle mechanism only |
| Blocking SSE reads with synchronous code | Use `for await` loops properly |
