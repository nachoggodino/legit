---
description: "Run a full React/TypeScript code review on all staged frontend files. Applies react-vite-practices guidelines, runs related Vitest tests, and reports issues with severity. Use before committing frontend changes."
agent: React Reviewer
argument-hint: "Optional: specific frontend file or component to focus on (e.g. frontend/src/components/AiSearchBar)"
---

Review all staged frontend React/TypeScript files for Copisaurus.

{{#if input}}
Focus the review on: {{input}}
{{/if}}

Apply all [react-vite-practices](./../skills/react-vite-practices/SKILL.md) guidelines, run related Vitest tests, and produce a structured report with:

1. The list of files reviewed
2. All issues found, grouped by file and category (Docosaurus integration, swizzling patterns, hook rules, SSE stream consumption, TypeScript, CSS Modules, list keys, accessibility, modal state management)
3. Full Vitest output for related test files
4. A summary with overall pass/fail verdict
