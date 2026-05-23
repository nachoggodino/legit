---
name: git-workflows
description: Use when changing Copisaurus Git sync, document commit, branch, pull request, or merge request behavior.
---

# Git Workflow Safety

## Commit Modes

- `direct` commits to `repo.commit.targetBranch` and pushes `HEAD:targetBranch`.
- `branch` commits to a generated branch and pushes it for later review.
- `merge-request` commits to a generated branch, pushes it, and opens a provider pull request or merge request.

## Invariants

- Served docs must come from the target branch unless a change has been merged or directly committed.
- Branch and merge-request workflows must restore the cached checkout to `repo.commit.targetBranch` after success, no-op, or failure.
- Provider API failures must not leave branch content visible from the working tree.
- Failed create, edit, rename, or delete workflows must roll back local filesystem mutations.
- Git commands must use argument arrays and must not include secrets in command arguments.

## Tests

- Prove branch/MR workflows check out the target branch after pushing or provider creation.
- Prove failed write, create, rename, and delete operations restore the original filesystem state.
- Mock provider APIs and Git runners; do not call real GitHub or GitLab from tests.
