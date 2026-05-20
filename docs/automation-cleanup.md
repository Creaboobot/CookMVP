# Cookooi Automation Cleanup

Task 15 cleaned up merged automation branches and a stale local worktree after the first Cookooi implementation batch.

## Remote Branch Policy

Remote `codex/*` branches can be deleted when all of these are true:

1. The branch is not the active implementation branch for the current task.
2. GitHub shows a closed pull request for the branch.
3. The pull request has a merge timestamp.
4. The task tracker records the related implementation task as reviewed or done.

Do not delete unreviewed branches, branches with open pull requests, or branches without a clear task or PR record.

## Local Worktree Policy

Generated automation clones under `C:\Users\Creaboo_human\Documents\CookooiAutomation\runs` and `C:\Users\Creaboo_human\Documents\CookooiAutomation\review-runs` are task artifacts. Keep them for traceability unless a later cleanup task explicitly archives or prunes them.

Before removing a local worktree:

1. Confirm the path is under `C:\Users\Creaboo_human\Documents\CookooiAutomation`.
2. Run `git status --short --branch` in the worktree and confirm it is clean.
3. Confirm the branch has a merged pull request or is otherwise explicitly obsolete.
4. Remove the worktree through `git worktree remove`, then delete only the matching local branch.

Do not remove the canonical human testing workspace:

```text
C:\Users\Creaboo_human\Documents\Cookooi
```

## Cleanup Performed

Task 15 confirmed these remote branches all had closed merged pull requests and deleted them from `Creaboobot/CookMVP`:

| Branch | PR |
| --- | --- |
| `codex/define-cookooi-recipe-contract` | #1 |
| `codex/cloudflare-local-runtime` | #2 |
| `codex/server-recipe-generation-endpoint` | #3 |
| `codex/connect-ui-server-generation` | #4 |
| `codex/user-constraints-preferences` | #5 |
| `codex/recipe-result-upgrade` | #6 |
| `codex/add-ci-workflow` | #7 |
| `codex/loading-error-fallback-cost-controls` | #8 |
| `codex/privacy-consent-ai-disclosure` | #9 |
| `codex/feedback-test-analytics` | #10 |
| `codex/saved-recipe-session-persistence` | #11 |
| `codex/final-user-testing-readiness` | #12 |
| `codex/normalize-canonical-local-workspace` | #13 |
| `codex/verify-openai-backed-generation-path` | #14 |

Task 15 also removed the clean stale local worktree:

```text
C:\Users\Creaboo_human\Documents\CookooiAutomation\infra-ci-worktree
```

The local branch `codex/add-ci-workflow` was deleted from the canonical workspace after the worktree was removed. Automation run folders, reports, memory, scripts, tool cache, and mirror cache were preserved.

## Verification

Task 15 verified:

```powershell
git ls-remote --heads origin "refs/heads/codex/*"
git -C "C:\Users\Creaboo_human\Documents\Cookooi" worktree list
PowerShell -ExecutionPolicy Bypass -File "C:\Users\Creaboo_human\.codex\automations\cookooi-code-execution-agent\repair-mirror-cache.ps1"
```

Expected results after cleanup:

- No stale remote `codex/*` branches are listed before the next task branch is pushed.
- `git worktree list` shows only `C:\Users\Creaboo_human\Documents\Cookooi`.
- `repair-mirror-cache.ps1` reports `MIRROR_OK=true`.
