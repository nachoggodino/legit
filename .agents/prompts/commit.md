# Commit Prompt

Inspect staged changes and propose a concise Conventional Commit message.

1. Run `git diff --staged --name-status` and `git diff --staged --shortstat`.
2. Derive a `type(scope): summary` subject under 72 characters.
3. Add a short body with the main behavioral changes and rationale.
4. Ask for user confirmation before running `git commit`.
5. Never include secrets, tokens, large payloads, or provider credentials.
6. Never push unless the user explicitly asks.
