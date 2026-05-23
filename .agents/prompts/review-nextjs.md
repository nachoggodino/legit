# Review Next.js Migration Prompt

Review Copisaurus Next.js migration changes with a bug-focused stance.

Prioritize:

- Auth, role, and repository visibility regressions.
- Git checkout, branch, pull request, merge request, and rollback safety.
- Markdown path validation under `docsPath`.
- Secret exposure in responses, logs, audits, commits, and PR/MR descriptions.
- Route handlers that bypass focused server modules.
- Missing tests for changed behavior.

Report findings first, ordered by severity, with file and line references.
