# Cookooi Local Workspace

Task 13 establishes one human-facing local workspace and separates it from generated automation artifacts.

## Canonical Human Workspace

Use this path for manual Cookooi testing:

```text
C:\Users\Creaboo_human\Documents\Cookooi
```

This path matches the product name. The GitHub repository is still `Creaboobot/CookMVP`; the local workspace name does not change the repository name.

Keep this workspace on `main` and aligned with GitHub before using it for testing:

```powershell
git status --short --branch
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
```

`git status --short --branch` should be clean, and `HEAD` should match `origin/main`.

## Automation Workspaces

The execution and review agents use generated task clones under:

```text
C:\Users\Creaboo_human\Documents\CookooiAutomation\runs
C:\Users\Creaboo_human\Documents\CookooiAutomation\review-runs
```

These folders are task artifacts. Do not use them as the long-lived human testing checkout, even when one of them is currently serving the public route.

## Retired Local Paths

Do not use these paths for human testing or new edits:

```text
C:\Users\Creaboo_human\Documents\CookMVP
C:\Users\Creaboo_human\Documents\CookooiAutomation\CookMVP
C:\Users\Creaboo_human\Documents\CookooiAutomation\infra-ci-worktree
```

Task 13 inspection found:

- `C:\Users\Creaboo_human\Documents\Cookooi` was seven commits behind `origin/main` and had uncommitted local changes.
- `C:\Users\Creaboo_human\Documents\CookMVP` was clean but still at Task 2 commit `c8230f527aaad5a9005f6859f59ec50461573cbb`.
- `C:\Users\Creaboo_human\Documents\CookooiAutomation\CookMVP` was clean but still at Task 2 commit `c8230f527aaad5a9005f6859f59ec50461573cbb`.
- `C:\Users\Creaboo_human\Documents\CookooiAutomation\infra-ci-worktree` was on the old `codex/add-ci-workflow` branch at `badfa223d508cf65019512cada32f7375c53678c`.

## Non-Destructive Normalization

Do not delete or reset local files until uncommitted work has been reviewed.

Use this safe sequence when normalizing the canonical workspace:

1. Run `git status --short --branch` in `C:\Users\Creaboo_human\Documents\Cookooi`.
2. Review uncommitted changes with `git diff` and `git diff --stat`.
3. Preserve any useful local-only files outside the repository or in a clearly named backup branch.
4. After preservation is confirmed, update the canonical workspace to `origin/main`.
5. Run `npm ci`, `npm test`, and a Wrangler dry-run before using the workspace for public route testing.

Generated automation run folders can be archived later, but they should not be treated as the canonical workspace.
