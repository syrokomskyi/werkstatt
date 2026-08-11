---
rfcId: RFC-0804
planId: PLAN-RFC-0804-01
status: draft
owner: architecture
createdAt: 2026-08-11
updatedAt:
scope:
  apps: []
  packages:
    - packages/forge
  services: []
  docs:
    - packages/forge/os/mission/handlers/archive.ts
    - packages/forge/os/mission/handlers/archive.test.ts
---

# Implementation Plan: RFC-0804

## 1. Objectives

- [ ] Objective 1 — `mission.archive` runs `pnpm install` after directory moves → maps to acceptance criterion "mission.archive runs pnpm install at workspace root after all directory moves"
- [ ] Objective 2 — `pnpm install` failure is non-fatal → maps to acceptance criterion "pnpm install step is non-fatal (warning on failure, archive proceeds)"
- [ ] Objective 3 — Lockfile + moved dirs committed atomically → maps to acceptance criterion "If pnpm-lock.yaml changed, it is committed together with moved directories"
- [ ] Objective 4 — Dry-run and no-moves cases skip refresh → maps to acceptance criteria "Dry-run mode skips the lockfile refresh entirely" and "No-moves case skips the lockfile refresh"
- [ ] Objective 5 — Unit tests cover all paths → maps to acceptance criteria for unit tests

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/os/mission/handlers/archive.ts` — add `execSync` import from `node:child_process`, add post-move lockfile refresh block at end of `runMissionArchive` before return
- `packages/forge/os/mission/handlers/archive.test.ts` — add 3 new test cases

### 2.2 Configuration and data

None.

### 2.3 Documentation and specs

- `packages/forge/os/mission/handlers/archive.ts` MODULE_CONTRACT non-goals — update "uses node:fs and yaml only" to "uses node:fs, node:child_process, and yaml"
- `packages/forge/os/mission/handlers/archive.ts` CHANGE_SUMMARY — add `RFC-0804: auto-refresh pnpm-lock.yaml after directory moves` entry

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/forge run build:check` — typecheck
- `pnpm --filter @warpgogol/forge run test` — unit tests (vitest)

## 3. Step sequence

### Step 1. Update MODULE_CONTRACT and CHANGE_SUMMARY

**Goal:** Update the module contract to allow `node:child_process` and record the RFC entry.

**Agent actions:**

- Edit `packages/forge/os/mission/handlers/archive.ts` MODULE_CONTRACT non-goals: change `<item>Does not import from @warpgogol/* packages — uses node:fs and yaml only.</item>` to `<item>Does not import from @warpgogol/* packages — uses node:fs, node:child_process, and yaml only.</item>`
- Add CHANGE_SUMMARY entry: `<item>RFC-0804: auto-refresh pnpm-lock.yaml after directory moves.</item>`

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes (typecheck only, no logic change yet)

**Completion criterion:** MODULE_CONTRACT non-goals include `node:child_process`; CHANGE_SUMMARY has RFC-0804 entry.

**Human review:** no

---

### Step 2. Add execSync import and post-move lockfile refresh

**Goal:** Implement the core logic — `pnpm install` + conditional git commit after all directory moves.

**Agent actions:**

- Add `import { execSync } from "node:child_process";` to the imports at the top of `archive.ts`
- At the end of `runMissionArchive`, after the pretty-print block and before the `return` statement, add the post-move lockfile refresh block:
  - Guard: `if (!dryRun && moved.length > 0)`
  - Run `execSync("pnpm install", { cwd: workspaceRoot, stdio: ["pipe", "pipe", "pipe"], timeout: 120_000 })`
  - Check `git status --porcelain pnpm-lock.yaml` — if dirty, stage each moved mission's paths (`git add -A <m.from> <m.to>` per mission) + `git add pnpm-lock.yaml` + `git commit`. Targeted staging avoids picking up unrelated changes from other agents under `missions/`.
  - Wrap in try/catch — non-fatal, log warning on failure

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes

**Completion criterion:** `archive.ts` imports `execSync` from `node:child_process`; post-move lockfile refresh block is present before the return statement; typecheck passes.

**Human review:** no

---

### Step 3. Add unit tests

**Goal:** Cover all paths: pnpm install called, lockfile committed, non-fatal on failure, dry-run skip, no-moves skip.

**Agent actions:**

- Add test: "RFC-0804: pnpm install called after moves" — mock `execSync` to track calls, verify `pnpm install` is called with `cwd: workspaceRoot` after moves
- Add test: "RFC-0804: lockfile committed when dirty after install" — mock `execSync` so `git status --porcelain` returns non-empty, verify `git commit` is called
- Add test: "RFC-0804: pnpm install failure is non-fatal" — mock `execSync` to throw on `pnpm install`, verify `runMissionArchive` returns successfully with `moved` data
- Add test: "RFC-0804: dry-run skips lockfile refresh" — verify `execSync` is NOT called when `dryRun: true`
- Add test: "RFC-0804: no moves skips lockfile refresh" — verify `execSync` is NOT called when `moved.length === 0`

**Validation:**

- `pnpm --filter @warpgogol/forge run test` — all tests pass (existing + 5 new)

**Completion criterion:** 5 new tests pass; all existing tests still pass.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- No `AGENTS.md` updates needed — the change is internal to `mission.archive` and doesn't change agent-facing rules
- No `docs/*.xml` Compass files need updates — no repository-wide semantics changed
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0804`
- Run `pnpm --filter @warpgogol/forge run build:check`
- Run `pnpm --filter @warpgogol/forge run test`
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` with inline `(evidence: ...)` annotations
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0804 --dry-run` first, then without `--dry-run`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0804`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with inline evidence; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0804`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0804` in the subject line
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| `pnpm install` latency | Step 2 — 120s timeout, non-fatal |
| Concurrent execution | Step 2 — acceptable risk, noted in RFC. No lock added. |
| `pnpm install` side effects | Step 2 — benign, dependencies no longer needed |
| Forge autonomy guard | Step 1 — MODULE_CONTRACT updated, `node:child_process` is a built-in |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0804 --reason "..." --invariant "DNA-N"` instead of working around it.
