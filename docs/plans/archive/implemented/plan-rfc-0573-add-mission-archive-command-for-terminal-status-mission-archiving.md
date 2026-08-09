---
rfcId: RFC-0573
planId: PLAN-RFC-0573-01
status: draft
owner: architecture
createdAt: 2026-07-28
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/forge"
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/forge/AGENTS.md
    - tools/kernel.config.ts
---

# Implementation Plan: RFC-0573

## 1. Objectives

- [ ] Objective 1 — Create `mission.archive` command that moves terminal-state mission directories to `missions/archive/<state>/` — maps to acceptance criteria 1–4
- [ ] Objective 2 — Integrate `mission.archive` into `docs.archive` umbrella as sixth sub-command — maps to acceptance criteria 5–6
- [ ] Objective 3 — Update `mission.list` to exclude archived missions — maps to acceptance criterion 7
- [ ] Objective 4 — Update `mission.status` to resolve archived missions — maps to acceptance criterion 8
- [ ] Objective 5 — Register `forgeMissionModule` in forge exports and kernel config — maps to acceptance criteria 2–3
- [ ] Objective 6 — Unit tests covering all archive scenarios — maps to acceptance criterion 10

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/os/mission/types.ts` — new file: `MISSIONS_DIR`, `MISSION_TERMINAL_STATES`, `MissionArchiveResult`, `MissionArchiveMove`, `MissionArchiveSkip`
- `packages/forge/os/mission/handlers/archive.ts` — new file: `runMissionArchive` handler
- `packages/forge/os/mission/mission.module.ts` — new file: `forgeMissionModule` registering `mission.archive`
- `packages/forge/os/mission/index.ts` — new file: barrel export for `forgeMissionModule`
- `packages/forge/os/core/core.module.ts` — modify: add `runMissionArchive` to `docs.archive` subCommands array, update description, add `missions/**` to writes/reads
- `packages/forge/src/index.ts` — modify: export `forgeMissionModule`
- `packages/os/site-kernel-handoff/src/mission/mission-io.ts` — modify: filter `archive/` in `listMissionDirs()`, add archive fallback in `resolveMissionDir()`
- `tools/kernel.config.ts` — modify: add `"forge-mission"` module loader entry

### 2.2 Configuration and data

- No YAML/JSON/NDJSON configuration changes.
- `missions/archive/` directory is created on demand by the command at runtime.

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — add `forgeMissionModule` row to OS modules table
- `docs/rfcs/rfc-0573-*.md` — read-only reference (acceptance criteria source of truth)
- `docs/architecture-dna.md` — no changes (DNA-46 is extended, not modified)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/forge build:check` — typecheck forge package
- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — typecheck handoff package
- `pnpm --filter @warpgogol/forge test` — unit tests for mission archive handler
- `pnpm exec werkstatt run rfc.validate --id RFC-0573` — RFC validation
- No pipeline integration (`mission.archive` is opt-in, not part of `build.check`)

## 3. Step sequence

### Step 1. Create mission archive types

**Goal:** Define the TypeScript types for the mission archive domain.

**Agent actions:**

- Create `packages/forge/os/mission/types.ts` with:
  - `MISSIONS_DIR = "missions"` constant
  - `MISSION_TERMINAL_STATES = ["closed", "aborted"] as const`
  - `MissionArchiveMove` interface: `{ missionId, state, from, to, direction }`
  - `MissionArchiveSkip` interface: `{ missionId, dir, reason }`
  - `MissionArchiveResult` interface: `{ command: "mission.archive", status: "ok", moved, skipped, dryRun }`
- Include MODULE_CONTRACT and CHANGE_SUMMARY scaffolding (DNA-42)
- Do NOT import from `@warpgogol/*` packages — types are self-contained

**Validation:**

- `pnpm --filter @warpgogol/forge build:check` passes with the new file

**Completion criterion:** `packages/forge/os/mission/types.ts` exists with all types defined and typecheck passes.

**Human review:** no

---

### Step 2. Create mission archive handler

**Goal:** Implement the `runMissionArchive` handler that moves terminal-state mission directories.

**Agent actions:**

- Create `packages/forge/os/mission/handlers/archive.ts` with `runMissionArchive` function
- Handler logic:
  1. Read `missions/` directory entries (excluding `archive/`)
  2. For each mission directory, read `mission.yaml` via `node:fs` and `yaml` package
  3. Extract `state` field from parsed YAML (no schema validation — read only `state`)
  4. If state is terminal (`closed`/`aborted`) and no `--status` filter or filter matches: move to `missions/archive/<state>/<missionId>/`
  5. Skip if destination already exists (reason: `"destination exists"`)
  6. Skip if `mission.yaml` unreadable (reason: `"unreadable manifest"`)
  7. Scan `missions/archive/<state>/` subdirectories for non-terminal missions to move back
  8. Support `--dry-run` (report without moving) and `--status` (filter to single terminal state)
  9. Throw on invalid `--status` value
- Use `fs.rename` for directory moves (atomic on same filesystem)
- Include MODULE_CONTRACT and CHANGE_SUMMARY scaffolding (DNA-42)
- Do NOT import from `@warpgogol/*` packages — use `node:fs`, `node:path`, and `yaml` only

**Validation:**

- `pnpm --filter @warpgogol/forge build:check` passes with the new handler

**Completion criterion:** `packages/forge/os/mission/handlers/archive.ts` exists, `runMissionArchive` is exported, typecheck passes.

**Human review:** no

---

### Step 3. Create forgeMissionModule

**Goal:** Register the `mission.archive` command in a new forge module.

**Agent actions:**

- Create `packages/forge/os/mission/mission.module.ts` with `forgeMissionModule`
  - Name: `"forge-mission"`, version: `"0.1.0"`
  - Register `mission.archive` command with `--dry-run` and `--status` flags
  - Scope: `workspace`, `mutatesState: true`, `cacheable: false`
  - Writes: `["missions/*", "missions/archive/**"]`
  - Reads: `["missions/**"]`
  - Description matching the pattern of `plan.archive` / `audit.archive`
- Create `packages/forge/os/mission/index.ts` barrel: `export { forgeMissionModule } from "./mission.module.ts"`
- Include MODULE_CONTRACT and CHANGE_SUMMARY scaffolding (DNA-42)

**Validation:**

- `pnpm --filter @warpgogol/forge build:check` passes with the new module

**Completion criterion:** `forgeMissionModule` is exported from `packages/forge/os/mission/mission.module.ts` and typecheck passes.

**Human review:** no

---

### Step 4. Export forgeMissionModule from package entrypoint

**Goal:** Make `forgeMissionModule` consumable via `@warpgogol/forge`.

**Agent actions:**

- Add `export { forgeMissionModule } from "../os/mission/mission.module.ts";` to `packages/forge/src/index.ts` (after the `forgeAuditModule` export, line ~139)

**Validation:**

- `pnpm --filter @warpgogol/forge build:check` passes

**Completion criterion:** `forgeMissionModule` is exported from `packages/forge/src/index.ts`.

**Human review:** no

---

### Step 5. Register forge-mission in kernel config

**Goal:** Load the new module in the workspace kernel configuration.

**Agent actions:**

- Add `"forge-mission": async () => (await import("@warpgogol/forge/os/mission-module")).forgeMissionModule,` to `tools/kernel.config.ts` `moduleLoaders` (after `"forge-session"` entry, line ~82)
- Add a CHANGE_SUMMARY entry: `<item>RFC-0573: Register forgeMissionModule for mission.archive.</item>`

**Validation:**

- `pnpm --filter @warpgogol/forge build:check` passes
- `pnpm exec werkstatt run mission.archive --dry-run --json` returns valid JSON (command is registered)

**Completion criterion:** `mission.archive` command is available via `site-kernel run`.

**Human review:** no

---

### Step 6. Integrate mission.archive into docs.archive umbrella

**Goal:** Add `mission.archive` as the sixth sub-command in `docs.archive`.

**Agent actions:**

- In `packages/forge/os/core/core.module.ts`:
  1. Add `const { runMissionArchive } = await import("../mission/handlers/archive.ts");` to the dynamic imports (after `runSessionArchive`, line ~319)
  2. Add `{ name: "mission.archive", fn: runMissionArchive as ArchiveHandler },` to `subCommands` array (after session.archive, line ~331)
  3. Add `"missions/*"` and `"missions/archive/**"` to `writes` array
  4. Add `"missions/**"` to `reads` array
  5. Update command description from "runs rfc.archive, adr.archive, plan.archive, audit.archive, and session.archive" to include "mission.archive"

**Validation:**

- `pnpm --filter @warpgogol/forge build:check` passes
- `pnpm exec werkstatt run docs.archive --dry-run --json` includes `mission.archive` in results

**Completion criterion:** `docs.archive` umbrella includes `mission.archive` as sixth sub-command and description mentions it.

**Human review:** no

---

### Step 7. Update mission.list to exclude archive directory

**Goal:** Prevent `mission.list` from showing archived missions.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-io.ts`:
  - Modify `listMissionDirs()` (line 62-73): filter out entries named `archive` from the `dirs` array
  - Add `.filter((d) => d !== "archive")` after the `.map((e) => e.name)` call

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- `mission.list` does not include `archive` as a mission entry

**Completion criterion:** `listMissionDirs()` excludes the `archive` directory from its scan.

**Human review:** no

---

### Step 8. Update mission.status to resolve archived missions

**Goal:** Allow `mission.status --mission <id>` to find missions in the archive.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-io.ts`:
  - Modify `resolveMissionDir()` (line 22-24): after checking `missions/<missionId>/`, check `missions/archive/closed/<missionId>/` and `missions/archive/aborted/<missionId>/` as fallbacks
  - Use `existsSync` to check each archive path
  - Return the first matching path

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- `mission.status --mission <archived-id>` resolves the mission directory

**Completion criterion:** `resolveMissionDir()` finds missions in both `missions/` and `missions/archive/<state>/`.

**Human review:** no

---

### Step 9. Write unit tests

**Goal:** Cover all archive scenarios with unit tests.

**Agent actions:**

- Create `packages/forge/os/mission/handlers/archive.test.ts` (colocated with handler, following `os/rfc/handlers/lifecycle.test.ts` pattern)
- Test cases:
  1. Terminal mission (closed) → moved to `missions/archive/closed/<id>/`
  2. Terminal mission (aborted) → moved to `missions/archive/aborted/<id>/`
  3. Open mission → skipped (non-terminal)
  4. `--status closed` filter → only closed missions moved, aborted skipped
  5. `--dry-run` → reports moves without touching filesystem
  6. Destination exists → skipped with "destination exists" reason
  7. Unreadable manifest → skipped with "unreadable manifest" reason
  8. Open mission in archive/ → moved back to `missions/` (bidirectional)
  9. Invalid `--status` value → throws error
  10. No `missions/` directory → empty result
- Use temp directories for filesystem tests, clean up after each test

**Validation:**

- `pnpm --filter @warpgogol/forge test` passes with all new tests green

**Completion criterion:** All 10 test cases pass.

**Human review:** no

---

### Step 10. Update packages/forge/AGENTS.md

**Goal:** Document the new forge module in the OS modules table.

**Agent actions:**

- In `packages/forge/AGENTS.md`, add a row to the OS modules table: `| forgeMissionModule | mission.archive | os/mission/ |`
- Place it after the `forgeSessionModule` row

**Validation:**

- Visual inspection: the table has the new row

**Completion criterion:** `packages/forge/AGENTS.md` OS modules table includes `forgeMissionModule` row.

**Human review:** no

---

### Step 11. Final validation and acceptance criteria verification

**Goal:** Run all validation checks and verify acceptance criteria.

**Agent actions:**

- Run `pnpm --filter @warpgogol/forge build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- Run `pnpm --filter @warpgogol/forge test`
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0573`
- Verify each acceptance criterion against the implemented code:
  1. `mission.archive` registered in `forgeMissionModule` with `--dry-run` and `--status` — check `mission.module.ts`
  2. `forgeMissionModule` exported from `packages/forge/src/index.ts` and registered in `tools/kernel.config.ts` — check both files
  3. `packages/forge/AGENTS.md` OS modules table includes `forgeMissionModule` — check the table
  4. `mission.archive --dry-run` reports without touching filesystem — run command, verify
  5. `mission.archive` moves terminal missions to `missions/archive/<state>/<missionId>/` — run command, verify
  6. Bidirectional — open missions in archive moved back — test case 8
  7. `docs.archive` includes `mission.archive` — run `docs.archive --dry-run`, verify
  8. `docs.archive` description mentions `mission.archive` — check `core.module.ts`
  9. `mission.list` excludes `archive/` — run `mission.list`, verify
  10. `mission.status` resolves archived missions — run `mission.status --mission <archived-id>`, verify
  11. `--json` output matches `MissionArchiveResult` — run with `--json`, verify shape
  12. Unit tests cover all scenarios — verify test count and cases
  13. `rfc.validate` passes — already verified

**Validation:**

- All build:check commands pass
- All tests pass
- `rfc.validate` passes

**Completion criterion:** All acceptance criteria verified with inline evidence annotations.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files: `packages/forge/AGENTS.md` (OS modules table — done in Step 10)
- Update affected `docs/*.xml` Compass files: no changes needed (no repository-wide semantic changes)
- Update `docs/architecture-dna.md`: no changes needed (DNA-46 is extended, not modified)
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed — run if needed
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0573 --implementation-commit <sha> --dry-run` first, then without `--dry-run`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0573`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0573`
- `pnpm --filter @warpgogol/forge build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/forge test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0573` in the subject line (RFC-0265 commit hygiene)
- No acceptance probes declared in the RFC frontmatter — `rfc.verification.emit` is not required

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Agent confusion about workflow order (cleanup vs archive) | Step 2: handler checks only `mission.yaml` state, not workpiece/distribution presence — works regardless of cleanup state |
| `mission.status` path resolution performance | Step 8: adds at most two `existsSync` calls — negligible |
| `mission.list` missing archived missions | Step 7: `mission.status` (Step 8) resolves archived missions as fallback |
| `docs.archive` runtime mismatch | Step 5 + Step 6: `forgeMissionModule` loaded via `kernel.config.ts`, `docs.archive` imports handler directly |
| TOCTOU race with concurrent lifecycle commands | Step 2: skip-on-unreadable-manifest mitigates impact; `fs.rename` is atomic on same filesystem |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0573 --reason "..." --invariant "DNA-46"` instead of working around it.
- If the forge autonomy guard fails on the new handler, ensure no `@warpgogol/*` imports are present — the handler must use only `node:fs`, `node:path`, and `yaml`.
