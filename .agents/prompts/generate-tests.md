# Generate Tests Prompt

Generate focused tests for the requested Copisaurus source file.

1. Read the source file in full.
2. Use `web/tests/` placement for the Next.js app.
3. Use Vitest for server modules and React Testing Library for client components.
4. Cover happy paths, edge cases, and error paths.
5. Mock GitHub, GitLab, OAuth, AI providers, and `fetch`.
6. Assert on user-visible behavior and module contracts rather than implementation details.
7. Run the relevant focused test command from `web/`.
