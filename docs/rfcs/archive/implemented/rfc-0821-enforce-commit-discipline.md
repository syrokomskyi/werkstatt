---
id: RFC-0821
title: "Enforce commit discipline — block raw git commit in workpieces"
status: implemented
scope: package
kind: fix
createdAt: 2026-08-12
updatedAt: 2026-08-12
implementedAt: 2026-08-12
satisfies: []
versionBump: patch
related:
  - RFC-0480
  - RFC-0820
reviewers: []
---

# RFC-0821: Enforce commit discipline — block raw git commit in workpieces

## Problem

Agents and operators can bypass the canonical commit commands (`mission.git.commit`, `ecosystem.commit`) by running raw `git commit` directly in workpiece repositories. This bypasses:

- Pre-commit content validators
- Bordbuch event recording
- Signed-commit support (Ed25519)
- Mission lifecycle enforcement (open state check, workpiece existence)

The workspace-level `hooks/pre-commit` already blocks raw `git commit` for platform-scope files (`packages/**`, `integrations/**`, `services/**`), but workpiece repos have their own `.git` and are not covered by this hook.

## Solution

Three-layer enforcement:

### Layer 1: Documentation (AGENTS.md)

New "Commit discipline (RFC-0821)" section in root `AGENTS.md` mandating:
- Workpiece changes: `mission.git.commit`
- Platform changes: `ecosystem.commit`
- Raw `git commit` is prohibited everywhere

### Layer 2: Workpiece pre-commit hook

New `workpiece-commit-hook.ts` installs a `.git/hooks/pre-commit` script in workpiece repos that rejects any `git commit` without the `MISSION_GIT_COMMIT=1` environment variable.

The hook is installed during `mission.materialize` after git init/clone.

### Layer 3: Env var propagation

`mission.git.commit` and `signed-commit.ts` set `MISSION_GIT_COMMIT=1` in the `execSync` env when running `git commit`, allowing them to pass through the hook.

`mission.materialize` also sets `MISSION_GIT_COMMIT=1` for its initial materialize commit.

Internal helpers (`commitWorkpieceIfDirty`, `commitCacheCloneIfDirty`) use `--no-verify` which bypasses hooks entirely — this is intentional for platform-internal auto-commits.

## Files changed

- `AGENTS.md` — new Commit discipline section
- `packages/werkstatt/src/mission/workpiece-commit-hook.ts` — new hook installer
- `packages/werkstatt/src/mission/mission-git-commit.ts` — set `MISSION_GIT_COMMIT=1` in `git()` helper
- `packages/werkstatt/src/mission/signed-commit.ts` — set `MISSION_GIT_COMMIT=1` in `git()` helper
- `packages/werkstatt/src/mission/mission-materialize.ts` — set `MISSION_GIT_COMMIT=1` in commit calls, install hook after git init
