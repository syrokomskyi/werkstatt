---
rfcId: RFC-0726
planId: PLAN-RFC-0726-01
status: draft
owner: architecture
createdAt: 2026-08-06
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
    - docs/COMMANDS.md
---

# Implementation Plan: RFC-0726

## 1. Objectives

- [ ] Objective 1 — Rename `--system` to `--site` in `leitstand.dev-deploy` (maps to acceptance criterion 1)
- [ ] Objective 2 — Rename `--system` to `--site` in `leitstand.status`, `leitstand.rollback`, `leitstand.health` (maps to acceptance criteria 2-4)
- [ ] Objective 3 — Rename `--system` to `--site` in `release.list`, `release.state.validate` (maps to acceptance criteria 5-6)
- [ ] Objective 4 — Update all test fixtures passing `system:` to `site:` (maps to acceptance criterion 10)
- [ ] Objective 5 — Update AGENTS.md and docs/COMMANDS.md documentation (maps to acceptance criteria 7-8)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — `runLeitstandDevDeploy` (line 595), `runLeitstandStatus` (line 2225), `runLeitstandRollback` (line 2313), `runLeitstandHealth` (line 2513): change `flagString(input, "system")` to `flagString(input, "site")` and update error messages
- `packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts` — Flag schema definitions for `leitstand.dev-deploy` (line 40), `leitstand.status`, `leitstand.rollback`, `leitstand.health`: rename `system` flag key to `site`
- `packages/os/site-kernel-handoff/src/release/release-commands.ts` — `runReleaseList`, `runReleaseStateValidate`: change `flagString(input, "system")` to `flagString(input, "site")`
- `packages/os/site-kernel-handoff/src/release/release.module.ts` — Flag schema for `release.list` (line 84), `release.state.validate` (line 113): rename `system` flag key to `site`
- `packages/os/site-kernel-handoff/src/release/index.ts` — Flag schema for `release.list`, `release.state.validate` (duplicate registration): rename `system` flag key to `site`

### 2.2 Configuration and data

No configuration or data files affected. The `--system` flag is a CLI surface only; no stored state references the flag name.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — Lines 47, 56, 57: replace `--system` references with `--site` for leitstand commands
- `docs/COMMANDS.md` — Lines 387-390: update flag documentation for `leitstand.dev-deploy`, `leitstand.health`, and other affected commands

### 2.4 Validation and pipelines

- Unit tests in `packages/os/site-kernel-handoff/src/tests/` — All test fixtures passing `system:` in synthetic `input.flags` must be updated to `site:`:
  - `leitstand-0628-dev-deploy.test.ts` (10 occurrences)
  - `leitstand-0700-release-dev-deploy.test.ts` (8 occurrences)
  - `leitstand-0649-freshness.test.ts` (9 occurrences)
  - `leitstand-0689-cache-snapshot.test.ts` (8 occurrences)
  - `rfc-0698-dev-deploy-auto-commit.test.ts` (5 occurrences)
  - `rfc-0652-leitstand-dev-deploy-evidence-sync.test.ts` (4 occurrences)
  - `leitstand-0608-rollback-state.test.ts` (2 occurrences)
  - `leitstand-0628-dev-deploy.test.ts` — rollback tests within (3 occurrences)
  - `adr-0030-mission-open-bordbuch-push.test.ts` (3 occurrences — `mission.open` also uses `--system`)
  - `mission-open-bordbuch-gate.test.ts` (2 occurrences — `mission.open` also uses `--system`)

**Note:** `mission.open` also accepts `--system` but is not in scope of this RFC (it's a mission command, not leitstand/release). The test fixtures for `mission.open` that pass `system:` should NOT be changed unless `mission.open` is also updated. This plan does NOT update `mission.open`.

## 3. Step sequence

### Step 1. Update leitstand flag schemas and command handlers

**Goal:** Rename `--system` to `--site` in all four leitstand commands.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts`:
  - `leitstand.dev-deploy`: rename flag key `system` → `site` in `flags` object, update description from `Flags: --system` to `Flags: --site`
  - `leitstand.status`: rename flag key `system` → `site`, update description
  - `leitstand.rollback`: rename flag key `system` → `site`, update description
  - `leitstand.health`: rename flag key `system` → `site`, update description
- In `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`:
  - `runLeitstandDevDeploy` (line 595): `flagString(input, "system")` → `flagString(input, "site")`, error message `--system is required` → `--site is required`
  - `runLeitstandStatus` (line 2225): same pattern
  - `runLeitstandRollback` (line 2313): same pattern
  - `runLeitstandHealth` (line 2513): same pattern

**Validation:**

- `pnpm exec site-kernel run rfc.validate --id RFC-0726`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** All four leitstand commands accept `--site` and reject `--system`. TypeScript compiles without errors.

**Human review:** no

---

### Step 2. Update release flag schemas and command handlers

**Goal:** Rename `--system` to `--site` in `release.list` and `release.state.validate`.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/release/release.module.ts`:
  - `release.list` (line 84): rename flag key `system` → `site`, update description from `Flags: [--system]` to `Flags: [--site]`
  - `release.state.validate` (line 113): rename flag key `system` → `site`, update description
- In `packages/os/site-kernel-handoff/src/release/index.ts`:
  - Apply same renames to the duplicate flag schema definitions (if they exist separately)
- In `packages/os/site-kernel-handoff/src/release/release-commands.ts`:
  - `runReleaseList`: `flagString(input, "system")` → `flagString(input, "site")`
  - `runReleaseStateValidate`: `flagString(input, "system")` → `flagString(input, "site")`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** Both release commands accept `--site` and reject `--system`. TypeScript compiles without errors.

**Human review:** no

---

### Step 3. Update test fixtures

**Goal:** Update all unit test fixtures that pass `system:` in synthetic `input.flags` to use `site:` instead.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/tests/leitstand-0628-dev-deploy.test.ts`: replace all `system: systemId` with `site: systemId` in `makeInput()` calls (10 occurrences in dev-deploy tests, 3 in rollback tests within same file)
- In `packages/os/site-kernel-handoff/src/tests/leitstand-0700-release-dev-deploy.test.ts`: replace all `system: systemId` with `site: systemId` (8 occurrences)
- In `packages/os/site-kernel-handoff/src/tests/leitstand-0649-freshness.test.ts`: replace all `system: systemId` with `site: systemId` (9 occurrences)
- In `packages/os/site-kernel-handoff/src/tests/leitstand-0689-cache-snapshot.test.ts`: replace all `system: systemId` with `site: systemId` (8 occurrences)
- In `packages/os/site-kernel-handoff/src/tests/rfc-0698-dev-deploy-auto-commit.test.ts`: replace all `system: systemId` with `site: systemId` (5 occurrences)
- In `packages/os/site-kernel-handoff/src/tests/rfc-0652-leitstand-dev-deploy-evidence-sync.test.ts`: replace all `system: systemId` with `site: systemId` (4 occurrences)
- In `packages/os/site-kernel-handoff/src/tests/leitstand-0608-rollback-state.test.ts`: replace all `system: systemId` with `site: systemId` (2 occurrences)
- **Do NOT update** `adr-0030-mission-open-bordbuch-push.test.ts` or `mission-open-bordbuch-gate.test.ts` — these test `mission.open` which is not in scope

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test`

**Completion criterion:** All leitstand and release tests pass with `site:` flag. No test references `system:` for leitstand/release commands.

**Human review:** no

---

### Step 4. Update documentation

**Goal:** Update AGENTS.md and docs/COMMANDS.md to reflect `--site` as the canonical flag.

**Agent actions:**

- In `packages/os/site-kernel-handoff/AGENTS.md`:
  - Line 47: replace `--system` with `--site` in `leitstand.dev-deploy` description
  - Line 56: replace `--system` with `--site` in RFC-0700 section
  - Line 57: replace `--system` with `--site` in RFC-0700 section
  - Update any other `--system` references for leitstand commands (status, rollback, health)
- In `docs/COMMANDS.md`:
  - Line 387: update `leitstand.dev-deploy` flags from `--system` to `--site`
  - Line 388: update `leitstand.health` flags from `--system` to `--site`
  - Update `leitstand.status`, `leitstand.rollback` entries if present
  - Update `release.list`, `release.state.validate` entries if present

**Validation:**

- `pnpm exec site-kernel run rfc.validate --id RFC-0726`
- `git diff --stat` to confirm all scoped docs are modified

**Completion criterion:** No `--system` references remain in AGENTS.md or docs/COMMANDS.md for leitstand/release commands.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files with `--site` flag documentation.
- Verify every file listed in `scope.docs` is updated — check each path against `git diff`.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0726 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0726`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria are checked off; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0726`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0726` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ------------------------ |
| Existing scripts break | Clean break — no backward compat. Step 1-2 remove `--system` entirely. |
| Agent confusion during transition | Step 4 updates AGENTS.md in the same commit. |
| Test fixtures break | Step 3 updates all affected test fixtures in the same commit. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-51, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0726 --reason "..." --invariant "DNA-51"` instead of working around it.
