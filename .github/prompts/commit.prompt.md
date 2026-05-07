---
description: "Commit staged changes with a generated conventional commit message for Copisaurus. The agent will inspect staged changes, generate a concise commit message following Conventional Commits style, and ask for user confirmation before committing."
argument-hint: "No arguments needed. Just run the command after staging your changes with `git add`."
agent: agent
model: GPT-4.1 (copilot)
---

# Generate and Commit

Generate a conventional commit message from staged changes and commit them with user confirmation.

## What to do

1. Inspect staged changes using:
   ```bash
   git diff --staged --name-status
   git diff --staged --shortstat
   ```

2. Analyze file paths to determine type and scope

3. Generate a concise, conventional commit message:
   - **Subject line**: `type(scope): short summary` (under 72 characters)
   - **Body**: Multi-line bullet points listing main changes and rationale

4. **Present the proposed message to the user and ask for confirmation before committing**

5. Only after user confirms, execute:
   ```bash
   git commit -m "<subject>" -m "<body>"
   ```

## Principles

- Inspect only **staged changes** (use `--staged` flag)
- Use **Conventional Commits** style: `type(scope): short summary`
- Keep subject line under 72 characters
- Do not include sensitive data (secrets, API keys, large payloads)
- Never auto-push—only commit locally

## Example

**Staged changes:** 5 files changed, 243 insertions

**Proposed message:**
```
feat(chat): implement SSE streaming for AI search with tool-use

- Add chat router with SSE event streaming
- Implement tool-use pattern for get_file action
- Add context budget estimation and warnings
- Add event types: reading_file, token, done, error
- Add comprehensive tests for stream parsing
```

**User action:** Confirm before running `git commit`
