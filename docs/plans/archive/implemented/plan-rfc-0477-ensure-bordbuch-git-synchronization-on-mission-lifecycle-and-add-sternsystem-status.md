---
rfcId: RFC-0477
planId: PLAN-RFC-0477-01
status: draft
owner: architecture
createdAt: 2026-07-21
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0477

## 1. Objectives

- [ ] Objective 1 — Implement `commitAndPushBordbuch` shared helper (maps to acceptance criterion: helper in bordbuch-io.ts)
- [ ] Objective 2 — Add bordbuch commit+push to `mission.open`, `mission.close`, `mission.abort`, `sternsystem.sync` (maps to 4 acceptance criteria)
- [ ] Objective 3 — Add `reconciledAt` guard and `close-report.json` generation to `mission.close` (maps to 3 acceptance criteria)
- [ ] Objective 4 — Implement `sternsystem.status` read-only command with `--id` and `--all` flags (maps to 3 acceptance criteria)
- [ ] Objective 5 — Update AGENTS.md and validate (maps to acceptance criterion: rfc.validate passes)

## 2. Affected artifacts

### 2.1 Code and commands

| File | Change |
| --- | --- |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` | Add `commitAndPushBordbuch` helper + `CommitAndPushResult` interface |
| `packages/os/site-kernel-handoff/src/mission/mission-open.ts` | Call `commitAndPushBordbuch` after `appendBordbuchEntry` |
| `packages/os/site-kernel-handoff/src/mission/mission-close.ts` | Add `reconciledAt` guard, call `commitAndPushBordbuch`, generate `close-report.json`, extend `MissionCloseData` |
| `packages/os/site-kernel-handoff/src/mission/mission-abort.ts` | Call `commitAndPushBordbuch` after `appendBordbuchEntry` |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync.ts` | Call `commitAndPushBordbuch` after `appendBordbuchEntry` |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-status.ts` | New file: `sternsystem.status` command handler |
| `packages/os/site-kernel-handoff/src/sternsystem/index.ts` | Register `sternsystem.status` command with `mutatesState: false` |

### 2.2 Configuration and data

| File | Change |
| --- | --- |
| `missions/<mission>/evidence/close-report.json` | New evidence artifact written by `mission.close` |

### 2.3 Documentation and specs

| File | Change |
| --- | --- |
| `packages/os/site-kernel-handoff/AGENTS.md` | Document `sternsystem.status` command and commit+push behavior |

### 2.4 Validation and pipelines

No pipeline integration. All commands are operator-invoked.

## 3. Step sequence

### Step 1. Implement `commitAndPushBordbuch` helper

**Goal:** Create the shared git commit+push helper in bordbuch-io.ts.

**Agent actions:**

- Add `CommitAndPushResult` interface to `bordbuch-io.ts`
- Add `commitAndPushBordbuch(systemDir: string, message: string)` function:
  - `git add bordbuch/events.ndjson` (only bordbuch, not `git add -A`)
  - `git commit -m <message>`
  - `git push origin <branch>` (detect branch via `git rev-parse --abbrev-ref HEAD`)
  - Return `{ commitSha, pushed, error }` — non-fatal on push failure
  - Return `{ commitSha: null, pushed: false, error: null }` if no changes to commit

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes

**Completion criterion:** `commitAndPushBordbuch` function exists in bordbuch-io.ts and build:check passes.

**Human review:** no

---

### Step 2. Add bordbuch commit+push to `mission.open`

**Goal:** `mission.open` commits and pushes bordbuch after appending mission-open entry.

**Agent actions:**

- Import `commitAndPushBordbuch` in `mission-open.ts`
- After `appendBordbuchEntry` call (line 131), add:
  ```ts
  const systemDir = path.join(workspaceRoot, "systems", systemId);
  await commitAndPushBordbuch(systemDir, `Bordbuch: mission-open ${missionId}`);
  ```
- Log result (commit SHA, push status)

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes

**Completion criterion:** `mission.open` calls `commitAndPushBordbuch` after `appendBordbuchEntry`.

**Human review:** no

---

### Step 3. Add bordbuch commit+push to `mission.abort`

**Goal:** `mission.abort` commits and pushes bordbuch after appending mission-abort entry.

**Agent actions:**

- Import `commitAndPushBordbuch` in `mission-abort.ts`
- After `appendBordbuchEntry` call (line 106), add:
  ```ts
  const systemDir = path.join(workspaceRoot, "systems", manifest.systemId);
  await commitAndPushBordbuch(systemDir, `Bordbuch: mission-abort ${missionId}`);
  ```

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes

**Completion criterion:** `mission.abort` calls `commitAndPushBordbuch` after `appendBordbuchEntry`.

**Human review:** no

---

### Step 4. Add bordbuch commit+push to `sternsystem.sync`

**Goal:** `sternsystem.sync` commits and pushes bordbuch after appending mirror-sync entry.

**Agent actions:**

- Import `commitAndPushBordbuch` in `sternsystem-sync.ts`
- After `appendBordbuchEntry` call (line 205), add:
  ```ts
  const systemDir = path.join(workspaceRoot, "systems", id);
  await commitAndPushBordbuch(systemDir, `Bordbuch: mirror-sync ${id}`);
  ```

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes

**Completion criterion:** `sternsystem.sync` calls `commitAndPushBordbuch` after `appendBordbuchEntry`.

**Human review:** no

---

### Step 5. Add `reconciledAt` guard and `close-report.json` to `mission.close`

**Goal:** `mission.close` refuses closure without reconcile, commits bordbuch, and generates close-report.json.

**Agent actions:**

- Add `reconciledAt` guard after state check (line 53):
  ```ts
  if (!manifest.reconciledAt) {
    throw new Error(
      `[mission.close] mission '${missionId}' has not been reconciled — run mission.reconcile first`,
    );
  }
  ```
- Import `commitAndPushBordbuch` and call after `appendBordbuchEntry` (line 91)
- Extend `MissionCloseData` interface with `closeReport` field
- After bordbuch commit, generate `close-report.json` with 3 blocks:
  - **Git:** `commitSha`, `pushed`, `pushError`, `dirtyFiles` (from `git status --porcelain`)
  - **Mirror:** `originSha` (from bare repo `rev-parse`), `mirrorSha` (from bare repo `refs/mirror/<branch>`), `inSync`, `recommendation`
  - **Reconcile:** `reconciledAt` from manifest, `verified: true`
- Write report to `missions/<mission>/evidence/close-report.json`
- Include `closeReport` in return data

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes

**Completion criterion:** `mission.close` has `reconciledAt` guard, commits bordbuch, writes `close-report.json`, and returns `closeReport` in data.

**Human review:** no

---

### Step 6. Implement `sternsystem.status` command

**Goal:** New read-only command showing git sync state, bordbuch events, and last mission.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-status.ts`
- Implement `SternsystemStatusData` interface (per RFC TypeScript contracts)
- Implement `runSternsystemStatus` function:
  - Read registry, find system entry
  - Detect branch via `git symbolic-ref HEAD` in bare repo (not hardcoded `master`)
  - Get `headSha` from `systems/<id>/.git` via `git rev-parse HEAD`
  - Get `originSha` from bare repo `git rev-parse <branch>`
  - Get `mirrorSha` from bare repo `git rev-parse refs/mirror/<branch>` (non-fatal if missing)
  - Compare SHAs: `headVsOrigin`, `originVsMirror` (sync/behind/ahead/diverged/unknown)
  - Get `dirtyFiles` from `git status --porcelain` in system dir
  - Read last 6 bordbuch entries via `readBordbuch`
  - Find last mission from bordbuch entries (last `mission-open` or `mission-close`/`mission-abort`), read its manifest for `reconciledAt`
  - Support `--all` flag: iterate all systems from registry, aggregate results
- Register command in `sternsystem/index.ts`:
  - `name: "sternsystem.status"`
  - `mutatesState: false`
  - `flags: { id: { kind: "string", description: "..." }, all: { kind: "boolean", description: "..." } }`
  - `writes: []`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- `pnpm exec site-kernel run sternsystem.status --id warpgogol-com --json` returns valid JSON

**Completion criterion:** `sternsystem.status` registered, returns HEAD/origin/mirror SHAs, dirty files, last 6 bordbuch events, last reconciledAt.

**Human review:** no

---

### Step 7. Update AGENTS.md

**Goal:** Document new command and behavioral changes.

**Agent actions:**

- In `packages/os/site-kernel-handoff/AGENTS.md`, add section documenting:
  - `sternsystem.status` command (read-only, flags, output)
  - Bordbuch commit+push behavior in lifecycle commands
  - `reconciledAt` guard in `mission.close`
  - `close-report.json` evidence artifact

**Validation:**

- AGENTS.md review for accuracy

**Completion criterion:** AGENTS.md updated with `sternsystem.status` and commit+push behavior.

**Human review:** no

---

### Step 8. Final validation

**Goal:** All acceptance criteria verified.

**Agent actions:**

- Run `pnpm --filter @gogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @gogol/site-kernel-handoff run test`
- Run `pnpm exec site-kernel run rfc.validate RFC-0477 --json`
- Verify all acceptance criteria checkboxes are met

**Validation:**

- build:check passes
- tests pass
- rfc.validate passes

**Completion criterion:** All validation green, all acceptance criteria met.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0477 --json`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0477` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Git push latency | Step 1: `commitAndPushBordbuch` is non-fatal on push failure |
| Agent confusion on push failures | Step 1: helper returns `{ pushed: false, error }` — callers log but don't throw |
| Bare repo ref drift | Step 6: `sternsystem.status` detects branch via `symbolic-ref HEAD`, not hardcoded |
| Dirty file noise | Step 5: `close-report.json` reports dirty files but `commitAndPushBordbuch` only stages `bordbuch/events.ndjson` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 or DNA-44, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0477 --reason "..." --invariant "DNA-N"` instead of working around it.
