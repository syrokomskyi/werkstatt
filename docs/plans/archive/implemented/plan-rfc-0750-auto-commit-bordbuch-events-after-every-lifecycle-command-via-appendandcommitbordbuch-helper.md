---
rfcId: RFC-0750
planId: PLAN-RFC-0750-01
status: complete
owner: architecture
createdAt: 2026-08-08
updatedAt: 2026-08-08
scope:
  apps: []
  packages:
    - site-kernel-handoff
    - site-kernel-checks
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0750

## 1. Objectives

- [x] O1 — Create `appendAndCommitBordbuch` and `appendBatchAndCommitBordbuch` helpers — maps to acceptance criterion "appendAndCommitBordbuch and appendBatchAndCommitBordbuch defined in bordbuch/bordbuch-commit-helper.ts"
- [x] O2 — Remove `commitAndPushBordbuch` from barrel exports — maps to acceptance criterion "commitAndPushBordbuch removed from bordbuch/index.ts barrel exports"
- [x] O3 — Migrate all 20 command call sites to use new helpers — maps to acceptance criterion "All 20 commands migrated"
- [x] O4 — Create `bordbuch.commit.parity.lint` command and integrate into `PACKAGES_CHECK_PIPELINE` — maps to acceptance criterion "bordbuch.commit.parity.lint command registered and integrated"
- [x] O5 — Add `bordbuch/events.ndjson` to `BORDBUCH_PROJECTION_PATHS` — maps to acceptance criterion "bordbuch/events.ndjson added to BORDBUCH_PROJECTION_PATHS"
- [x] O6 — Update `AGENTS.md` for `site-kernel-handoff` — maps to acceptance criterion "AGENTS.md updated with appendAndCommitBordbuch as canonical API"
- [x] O7 — Unit tests for helpers — maps to acceptance criteria "Unit tests verify helper appends + commits + pushes" and "Unit tests verify appendBatchAndCommitBordbuch commits once for multiple entries"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit-helper.ts` — **new file**: `appendAndCommitBordbuch`, `appendBatchAndCommitBordbuch`
- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` — `commitAndPushBordbuch` stays exported here (internal), removed from barrel
- `packages/os/site-kernel-handoff/src/bordbuch/index.ts` — remove `commitAndPushBordbuch` from barrel exports, add `appendAndCommitBordbuch`, `appendBatchAndCommitBordbuch`
- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts` — add `"bordbuch/events.ndjson"` to `BORDBUCH_PROJECTION_PATHS`
- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-append.ts` — whitelisted (no change needed, already uses `appendBordbuchEntry` directly)
- `packages/os/site-kernel-handoff/src/mission/mission-open.ts` — migrate to `appendAndCommitBordbuch`
- `packages/os/site-kernel-handoff/src/mission/mission-close.ts` — migrate both call sites (line 346 main + line 423 evidence-skipped) to `appendAndCommitBordbuch`
- `packages/os/site-kernel-handoff/src/mission/mission-abort.ts` — migrate to `appendAndCommitBordbuch`
- `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` — migrate to `appendAndCommitBordbuch`
- `packages/os/site-kernel-handoff/src/mission/mission-migrate.ts` — migrate to `appendAndCommitBordbuch`
- `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-extract.ts` — migrate to `appendAndCommitBordbuch`
- `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync.ts` — migrate to `appendAndCommitBordbuch`
- `packages/os/site-kernel-handoff/src/release/release-commands.ts` — migrate `release.ready` and `release.rollback` to `appendAndCommitBordbuch`
- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — migrate `leitstand.propagate`, `leitstand.promote`, `leitstand.rollback` to `appendAndCommitBordbuch`
- `packages/os/site-kernel-handoff/src/nachweis/nachweis-ingest.ts` — migrate to `appendAndCommitBordbuch`
- `packages/os/site-kernel-handoff/src/nachweis/nachweis-publish.ts` — migrate to `appendAndCommitBordbuch`
- `packages/os/site-kernel-handoff/src/nachweis/nachweis-withdraw.ts` — migrate to `appendBatchAndCommitBordbuch` (2 entries: consent + record)
- `packages/os/site-kernel-handoff/src/nachweis/nachweis-sign.ts` — migrate to `appendAndCommitBordbuch`
- `packages/os/site-kernel-handoff/src/nachweis/nachweis-approve.ts` — migrate to `appendAndCommitBordbuch`
- `packages/os/site-kernel-handoff/src/nachweis/nachweis-consent.ts` — migrate to `appendAndCommitBordbuch`
- `packages/os/site-kernel-handoff/src/nachweis/nachweis-public-derivative.ts` — migrate to `appendAndCommitBordbuch`
- `packages/os/site-kernel-handoff/src/nachweis/nachweis-timestamp.ts` — migrate to `appendAndCommitBordbuch`
- `packages/os/site-kernel-checks/src/bordbuch-commit-parity-lint.ts` — **new file**: `runBordbuchCommitParityLint`
- `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts` — register `bordbuch.commit.parity.lint` command entry
- `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` — add `{ command: "bordbuch.commit.parity.lint" }` to `PACKAGES_CHECK_PIPELINE`

### 2.2 Configuration and data

- No YAML/JSON/config changes. No schema changes. No ontology changes.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — update Bordbuch section: document `appendAndCommitBordbuch` as canonical API, note `commitAndPushBordbuch` is internal-only, update ADR-0030 reference to use new helper.
- No `docs/*.xml` Compass files need updates — no repository-wide semantics changed.
- No `docs/architecture-dna.md` changes — no new DNA invariant.

### 2.4 Validation and pipelines

- `PACKAGES_CHECK_PIPELINE` — new step `bordbuch.commit.parity.lint` added after `fingerprint.usage.lint`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm exec werkstatt run rfc.validate --id RFC-0750`

## 3. Step sequence

### Step 1. Create bordbuch-commit-helper.ts

**Goal:** Create the new helper file with `appendAndCommitBordbuch` and `appendBatchAndCommitBordbuch`.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit-helper.ts`
- Implement `appendAndCommitBordbuch(workspaceRoot, systemId, kind, summary, actor, options?)` — calls `appendBordbuchEntry` then `commitAndPushBordbuch`, returns `{ entry, commitResult }`
- Implement `appendBatchAndCommitBordbuch(workspaceRoot, systemId, entries, commitMessage)` — calls `appendBordbuchEntry` for each entry sequentially, then `commitAndPushBordbuch` once, returns `{ entries, commitResult }`
- Import `appendBordbuchEntry` and `commitAndPushBordbuch` from `./bordbuch-io.ts`
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` headers

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — TypeScript compiles

**Completion criterion:** File exists, types compile, helpers combine append + commit in one call.

**Human review:** no

---

### Step 2. Update barrel exports

**Goal:** Remove `commitAndPushBordbuch` from barrel, add new helpers.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/bordbuch/index.ts`: remove `commitAndPushBordbuch` from exports, add `appendAndCommitBordbuch` and `appendBatchAndCommitBordbuch` from `./bordbuch-commit-helper.ts`
- Grep for any external imports of `commitAndPushBordbuch` from the barrel — update them to import from `./bordbuch-io.ts` directly (internal) or switch to `appendAndCommitBordbuch`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `commitAndPushBordbuch` not exported from barrel; new helpers exported.

**Human review:** no

---

### Step 3. Add events.ndjson to BORDBUCH_PROJECTION_PATHS

**Goal:** Defense-in-depth — `bordbuch.commit` pipeline step also stages `events.ndjson`.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts`: add `"bordbuch/events.ndjson"` to `BORDBUCH_PROJECTION_PATHS` array

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `BORDBUCH_PROJECTION_PATHS` includes `bordbuch/events.ndjson`.

**Human review:** no

---

### Step 4. Migrate mission commands (open, close, abort, materialize, migrate)

**Goal:** Replace `appendBordbuchEntry` + `commitAndPushBordbuch` with `appendAndCommitBordbuch` in mission commands.

**Agent actions:**

- `mission-open.ts`: replace `appendBordbuchEntry` + `commitAndPushBordbuch` pair with `appendAndCommitBordbuch`. Keep ADR-0030 push verification: check `result.commitResult.commitSha === null` and `!result.commitResult.pushed`, throw distinct errors.
- `mission-close.ts` line 346: replace with `appendAndCommitBordbuch`. Keep push verification (same as mission.open per ADR-0030).
- `mission-close.ts` line 423 (evidence-skipped escape hatch): replace with `appendAndCommitBordbuch`. No push verification needed (escape hatch).
- `mission-abort.ts`: replace with `appendAndCommitBordbuch`. No push verification (per ADR-0030).
- `mission-materialize.ts`: replace with `appendAndCommitBordbuch`. No push verification.
- `mission-migrate.ts`: replace with `appendAndCommitBordbuch`. No push verification.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** No direct `appendBordbuchEntry` calls in mission command files outside whitelist.

**Human review:** no

---

### Step 5. Migrate sternsystem commands (extract, sync)

**Goal:** Replace append + commit with helper in sternsystem commands.

**Agent actions:**

- `sternsystem-extract.ts`: replace with `appendAndCommitBordbuch`. No push verification.
- `sternsystem-sync.ts`: replace with `appendAndCommitBordbuch`. No push verification.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** No direct `appendBordbuchEntry` calls in sternsystem command files.

**Human review:** no

---

### Step 6. Migrate release commands (ready, rollback)

**Goal:** Replace append + commit with helper in release commands.

**Agent actions:**

- `release-commands.ts` `release.ready`: replace with `appendAndCommitBordbuch`. No push verification.
- `release-commands.ts` `release.rollback`: replace with `appendAndCommitBordbuch`. No push verification.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** No direct `appendBordbuchEntry` calls in release-commands.ts.

**Human review:** no

---

### Step 7. Migrate leitstand commands (propagate, promote, rollback)

**Goal:** Replace append + commit with helper in leitstand commands.

**Agent actions:**

- `leitstand-commands.ts` `leitstand.propagate`: replace with `appendAndCommitBordbuch`. No push verification.
- `leitstand-commands.ts` `leitstand.promote`: replace with `appendAndCommitBordbuch`. No push verification.
- `leitstand-commands.ts` `leitstand.rollback`: replace with `appendAndCommitBordbuch`. No push verification.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** No direct `appendBordbuchEntry` calls in leitstand-commands.ts.

**Human review:** no

---

### Step 8. Migrate nachweis commands (8 commands)

**Goal:** Replace append + commit with helper in all nachweis commands. Use `appendBatchAndCommitBordbuch` for `nachweis.withdraw`.

**Agent actions:**

- `nachweis-ingest.ts`: replace with `appendAndCommitBordbuch`
- `nachweis-publish.ts`: replace with `appendAndCommitBordbuch`
- `nachweis-withdraw.ts`: replace 2 sequential `appendBordbuchEntry` calls with `appendBatchAndCommitBordbuch` (consent + record entries, single commit)
- `nachweis-sign.ts`: replace with `appendAndCommitBordbuch`
- `nachweis-approve.ts`: replace with `appendAndCommitBordbuch`
- `nachweis-consent.ts`: replace with `appendAndCommitBordbuch`
- `nachweis-public-derivative.ts`: replace with `appendAndCommitBordbuch`
- `nachweis-timestamp.ts`: replace with `appendAndCommitBordbuch`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** No direct `appendBordbuchEntry` calls in nachweis command files.

**Human review:** no

---

### Step 9. Create bordbuch.commit.parity.lint command

**Goal:** Create lint that flags direct `appendBordbuchEntry` calls outside the 3-file whitelist.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/bordbuch-commit-parity-lint.ts`
- Implement `runBordbuchCommitParityLint(input, context)` following the `runFingerprintUsageLint` pattern:
  - Scan `packages/os/site-kernel-handoff/src/**/*.ts` for `appendBordbuchEntry` calls
  - Whitelist: `bordbuch/bordbuch-io.ts`, `bordbuch/bordbuch-append.ts`, `bordbuch/bordbuch-commit-helper.ts`
  - Report `BCP-01` diagnostic for each violation: "Direct appendBordbuchEntry call in <file> — use appendAndCommitBordbuch instead"
  - Return `diagnosticsResult` or `passResult`
- Register in `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts`:
  ```
  {
    name: "bordbuch.commit.parity.lint",
    description: "Scan site-kernel-handoff for direct appendBordbuchEntry calls outside the whitelist (RFC-0750, DNA-51).",
    scope: "workspace",
    flags: {},
    reads: ["packages/os/site-kernel-handoff/src/**/*.ts"],
    execute: runBordbuchCommitParityLint,
  }
  ```
- Add to `PACKAGES_CHECK_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` after `fingerprint.usage.lint`:
  ```
  // RFC-0750: bordbuch commit parity — no direct appendBordbuchEntry outside whitelist
  { command: "bordbuch.commit.parity.lint" },
  ```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm exec werkstatt run bordbuch.commit.parity.lint` — passes with 0 violations

**Completion criterion:** Lint command registered, passes with zero violations after migration.

**Human review:** no

---

### Step 10. Update AGENTS.md

**Goal:** Document `appendAndCommitBordbuch` as canonical API in `site-kernel-handoff` AGENTS.md.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/AGENTS.md`:
  - Add rule: `appendAndCommitBordbuch` is the canonical API for appending bordbuch entries from lifecycle commands. Direct `appendBordbuchEntry` calls are only permitted in `bordbuch-io.ts`, `bordbuch-append.ts`, and `bordbuch-commit-helper.ts` (enforced by `bordbuch.commit.parity.lint`).
  - Update ADR-0030 section: `mission.open` checks `result.commitResult.commitSha` and `result.commitResult.pushed` on the `appendAndCommitBordbuch` return value.
  - Note: `commitAndPushBordbuch` is internal to `bordbuch-io.ts`, not exported from barrel.

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0750`

**Completion criterion:** AGENTS.md updated with canonical API rule and ADR-0030 update.

**Human review:** no

---

### Step 11. Unit tests

**Goal:** Verify helper behavior with unit tests.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/bordbuch/tests/bordbuch-commit-helper.test.ts`
- Test 1: `appendAndCommitBordbuch` appends entry + commits + pushes in one call — mock `appendBordbuchEntry` and `commitAndPushBordbuch`, verify both called, return value has `entry` and `commitResult`
- Test 2: `appendBatchAndCommitBordbuch` appends multiple entries + commits once — mock `appendBordbuchEntry` (called N times) and `commitAndPushBordbuch` (called once), verify return has `entries[]` and single `commitResult`
- Test 3: `appendAndCommitBordbuch` propagates `commitResult` with `commitSha: null` when commit fails — verify caller can check result

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test`

**Completion criterion:** All 3 tests pass.

**Human review:** no

---

### Step 12. Final validation, review, fix, and stamp

**Goal:** Run all validation, code review, verify acceptance criteria, stamp as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0750`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- Run `pnpm exec werkstatt run bordbuch.commit.parity.lint` — zero violations
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review`. Max 3 iterations.
- Check off acceptance criteria in RFC: mark `[x]` for verified criteria
- Stamp: `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0750 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- `rfc.validate` passes
- `bordbuch.commit.parity.lint` passes with 0 violations
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All acceptance criteria checked off; RFC stamped as `implemented`.

**Human review:** no — `accepted → implemented` is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0750`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm exec werkstatt run bordbuch.commit.parity.lint`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0750` in the subject line (RFC-0265 commit hygiene)
- `rfc.implement.stamp` produces the status transition atomically

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Lock reentrancy | Step 1: helper acquires same `bordbuch:${systemId}` lock as `appendBordbuchEntry` — reentrant for same PID (verified in existing tests) |
| Push failure on new Sternsystems | Step 4-8: `sternsystem.extract` and other commands don't check `pushed` — helper returns `{ pushed: false }`, non-fatal |
| Lint false positives | Step 9: whitelist is file-path-based, covers 3 files; intentional friction for new files |
| Agent misinterpretation | Step 10: AGENTS.md documents canonical API; lint catches violations at build time |
| Batch helper partial failure | Step 1: helper does NOT roll back appended entries; caller receives error. Only `nachweis.withdraw` uses batch (2 entries). |
| Concurrent execution | Steps 4-8: lock serializes append; `git add` after lock release stages all dirty lines — safe, idempotent push. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46, DNA-48, DNA-49, or DNA-51, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0750 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `commitAndPushBordbuch` is imported from the barrel by external consumers outside `site-kernel-handoff`, do not break them silently — add a subpath export or direct file import before removing from barrel.
