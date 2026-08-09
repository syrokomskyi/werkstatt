---
name: wg-mission-complete
description: Complete a mission end-to-end — validate, reconcile, release.prepare, close. Auto-resolves known runtime errors. Use when the user says "complete", "finish", "close", "wrap up" a mission.
invocation: user
category: fo
concerns: code-mutation
dependsOn: ['writing-great-skills']
knowledge:
  - qa-log.md
  - fix-patterns.md
  - learned-principles.md
languagePolicy: ref(PREFERENCES.md)
---

# wg-mission-complete

Before starting, read `PREFERENCES.md` at the repository root. If it is missing or `aiLanguage` is unset, ask the operator once and create the file using the `my-preferences` skill semantics.

Complete a mission end-to-end: validate → reconcile → release.prepare → close. The skill auto-resolves known runtime errors using the reactive error catalog (`fix-patterns.md`) and accumulates knowledge across runs.

## Process

### 1. Identify the mission

Determine the mission ID from the operator's request or the current workspace state. If no mission ID is provided, run `pnpm exec werkstatt run mission.status --mission <id>` for the most recent open mission, or check `systems/registry.yaml` for `currentMission`.

### 2. Stop dev server

Before running any kernel commands, stop any running dev server for the target system. A running dev server holds file handles and locks that can interfere with validation, reconciliation, and build steps.

1. Check for a running dev server: `ps aux | grep -E "(astro|vite).*dev" | grep -v grep`.
2. If found — kill it: `kill <pid>` (or `pkill -f "astro.*dev"`).
3. If no dev server is running — proceed.

**Completion criterion:** No dev server process is running for the target system.

### 3. Pre-flight checks

Before running any kernel commands, check for dirty state:

1. **Workpiece dirty?** — Run `git status --short` in `missions/<id>/workpiece/`. If dirty:
   - Check MC-01 and EC-04 in the error catalog.
   - If only generated files (`.generated.yaml`, `.generated.json`, `.env.example`) — commit via `pnpm exec werkstatt run mission.git.commit --mission <id> --message "chore: regenerate artifacts from build.prepare"`.
   - If operator edits are uncommitted — ask the operator for a commit message.
   - If the operator says "just commit everything" — commit with a descriptive message.

2. **Cache clone dirty?** — Run `git status --short` in `systems/<id>/`. If dirty:
   - Check EC-03 in the error catalog.
   - If only `bordbuch/events.ndjson` — commit it: `git add bordbuch/events.ndjson && git commit -m "chore: bordbuch entry from mission.open"`.
   - If other files are dirty — investigate before committing. Ask the operator if unsure.

**Completion criterion:** Both workpiece and cache clone are clean (no uncommitted changes).

### 4. Validate

Run `pnpm exec werkstatt run mission.validate --mission <id>`.

- If validation **passes** — proceed to step 5.
- If validation **fails** — examine the error. Check the error catalog (`fix-patterns.md`) for a matching entry. If found and `auto-resolvable: yes` with `confirmations >= 3` — apply the resolution automatically. Otherwise — present the error to the operator with a suggested resolution.
- If validation passes with **warnings** — log them in `qa-log.md`. Warnings do not block. Proceed to step 5.
- After fixing validation errors — commit the fix, then re-validate.

**Completion criterion:** `mission.validate` passes with 0 errors.

### 5. Reconcile

Run `pnpm exec werkstatt run mission.reconcile --mission <id>`.

- If reconcile **passes** — proceed to step 6.
- If reconcile **fails** — check the error catalog (`fix-patterns.md`):
  - **EC-01** (whitespace error) — already fixed in code (`--whitespace=fix`), should not recur. If it does — log it.
  - **EC-02** (add/add conflict on generated files) — already fixed in code (auto-resolve with `checkout --theirs`). If it does recur — log it.
  - **EC-03** (dirty cache clone) — return to step 3, pre-flight checks.
  - **EC-04** (dirty workpiece) — return to step 3, pre-flight checks.
  - **Unknown error** — present to operator. After resolution, add a new EC entry to `fix-patterns.md`.

**Completion criterion:** `mission.reconcile` succeeds, `reconciledAt` is set in `mission.yaml`.

### 6. Release prepare

Run `pnpm exec werkstatt run release.prepare --mission <id>`.

- If release.prepare **passes** — proceed to step 7.
- If release.prepare **fails** — check EC-05 (mission not validated). If the error is about C-surface regression — present to operator, this requires domain knowledge.
- After fixing — re-run release.prepare.

**Completion criterion:** `release.prepare` succeeds, `releaseId` is set in `mission.yaml`.

### 7. Close

Run `pnpm exec werkstatt run mission.close --mission <id>`.

- If close **passes** — mission is complete. Proceed to step 8.
- If close **fails** — check the error. `mission.close` refuses if `reconciledAt` is null — return to step 5.

**Completion criterion:** `mission.close` succeeds, mission state is `closed`.

### 8. Post-completion

1. Verify `git status` is clean in both the platform repo and the cache clone.
2. Commit any platform-level changes (e.g. `systems/registry.yaml` `currentMission: null`) if not already committed.
3. Log any Q&A in `qa-log.md`.
4. If new error patterns were encountered — add them to `fix-patterns.md` with `confirmations: 1`.
5. If new principles were distilled — add them to `learned-principles.md` with `confirmations: 1`.
6. Present a summary to the operator.

## Error catalog growth

When the skill encounters an error not in `fix-patterns.md`:

1. Resolve the error (with operator help if needed).
2. Add a new EC entry to `fix-patterns.md` with the error signature, root cause, resolution, and `confirmations: 1`.
3. On subsequent encounters of the same error — increment `confirmations`.
4. At `confirmations >= 3` — the skill auto-resolves without asking the operator.

## Principle growth

When the skill distills a reusable principle from a run:

1. Add it to `learned-principles.md` with `confirmations: 1`.
2. On subsequent runs where the principle applies — increment `confirmations`.
3. At `confirmations >= 3` — the skill applies the principle autonomously.

## Knowledge file mutation

- **Source-of-truth:** `packages/warpgogol-skills/skills/wg-mission-complete/` — the skill reads and writes here.
- **Runtime copy:** `.agents/skills/wg-mission-complete/` — synced by `forge.init`. Read-only.
- After mutating knowledge files — commit them alongside any code changes.
