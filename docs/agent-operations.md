# Cookooi Agent Operations

Task 16 defines the operating mode for the next Cookooi task batch. The goal is to keep the execution and review automations useful without repeating the `CodexSandboxOffline` shell egress and mirror-cache failures from the first batch.

## Selected Operating Mode

Use a publish-capable Windows identity for normal implementation runs. On this machine, the proven identity is:

```text
creaboo\Creaboo_human
```

The execution agent may remain scheduled only when the scheduler runs it under an identity that passes the full publish health check. If scheduled runs still execute as `creaboo\CodexSandboxOffline`, keep implementation runs manual under `creaboo\Creaboo_human` or pause the execution automation until the scheduler identity is fixed.

The review agent remains the merge gate. The execution agent must never merge PRs and must stop at `Ready for review`.

## Required Preflight

Run this from `C:\Users\Creaboo_human\Documents\CookooiAutomation` before selecting or claiming implementation work:

```powershell
PowerShell -ExecutionPolicy Bypass -File "C:\Users\Creaboo_human\.codex\automations\cookooi-code-execution-agent\health-check.ps1" -AllowPushProbe -RequirePush
```

Normal implementation requires these lines:

```text
WINDOWS_USER=creaboo\Creaboo_human
CAN_REACH_GITHUB_HTTPS=True
CAN_REACH_NPM_REGISTRY_HTTPS=True
CAN_PUSH=True
CAN_PUBLISH=True
HEALTH_OK=True
```

Then verify the mirror cache:

```powershell
PowerShell -ExecutionPolicy Bypass -File "C:\Users\Creaboo_human\.codex\automations\cookooi-code-execution-agent\repair-mirror-cache.ps1"
```

Expected mirror success lines:

```text
MIRROR_DENY_COUNT=0
CAN_CLONE_FROM_MIRROR=true
CLONE_DENY_COUNT=0
CAN_WRITE_CLONE_GIT=true
MIRROR_OK=true
```

## Connector Fallback Rules

Connector publish mode is only a fallback when shell GitHub or npm HTTPS is blocked but the GitHub and Notion connectors work.

Before using connector mode:

1. Confirm the GitHub connector can fetch `Creaboobot/CookMVP` `main` and `package.json`.
2. Confirm connector publish tools are available: create branch, create file, update file, delete file when needed, and create draft PR.
3. Run mirror repair. If the shell cannot reach GitHub, offline mirror repair may prove ACL safety but cannot refresh the mirror.
4. Compare the clone helper `HEAD` with live GitHub `main`. If the mirror clone is behind live `main`, do not treat it as a clean current implementation base.

If connector mode is used with a stale mirror, sync touched UTF-8 files from live GitHub `main` before editing, validate locally, and publish the PR branch from live GitHub `main` through the connector. Record the stale-mirror condition in the Build brief.

## Current Task 16 Evidence

The Task 16 run executed as:

```text
WINDOWS_USER=creaboo\CodexSandboxOffline
CAN_REACH_GITHUB_HTTPS=False
CAN_REACH_NPM_REGISTRY_HTTPS=False
CAN_PUSH=False
CAN_PUBLISH=False
HEALTH_OK=False
```

Connector reads succeeded, but the offline mirror reported:

```text
MIRROR_HEAD=e06450e01949c10fbcae1f09437d2b00505d255b
MIRROR_OK=true
```

Live GitHub `main` was ahead at:

```text
aa74a1bfdbf5e41a85818519097033aa97af6bc5
```

That means the durable one-run fix is still to run the automation under `creaboo\Creaboo_human` or another identity that passes the full health check and can refresh the mirror from GitHub.

## Support Task Policy

Do not create duplicate support tasks for the known `CodexSandboxOffline` shell egress pattern. Reopen or update the existing runtime support task when the root cause is the same.

Create a task-specific support handoff only when the selected task cannot proceed after connector fallback and mirror repair have both been attempted, or when the active task requires a human decision outside the task scope.

## No-op Review Behavior

When no implementation task has `Status = Ready for review`, the review agent should do a quiet no-op and leave implementation tasks unchanged.

When an implementation task is `Ready for review`, the execution agent must not start another task. The review agent reviews one task, merges only when acceptable, updates Notion to `Done`, and then reports the next task signal.
