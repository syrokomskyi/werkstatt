---
rfcId: RFC-0734
planId: PLAN-RFC-0734-01
status: draft
owner: architecture
createdAt: 2026-08-07
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel-checks
    - packages/os/site-kernel-handoff
  services: []
  docs:
    - docs/architecture-dna.md
    - packages/os/site-kernel-checks/AGENTS.md
    - docs/verification-plan.xml
    - docs/development-plan.xml
---

# Implementation Plan: RFC-0734

## 1. Objectives

- [ ] O1 — `content.regression.review.generate` command generates review.yaml with per-change golden/current values and `decision: pending` — maps to acceptance criteria 1, 3, 4
- [ ] O2 — `content.regression.apply` command reads review.yaml, updates golden for accepted changes, emits CREG-04 for unapplied reject/fix decisions — maps to acceptance criteria 2, 5, 6, 7
- [ ] O3 — `apply` detects stale review.yaml via currentSnapshotHash mismatch — maps to acceptance criterion 8
- [ ] O4 — `mission.close` blocks with CREG-05 when drift exists and no apply-result.json — maps to acceptance criteria 9, 10, 11
- [ ] O5 — `content.regression.check` fixHint updated to point to `review.generate` — maps to acceptance criterion 12
- [ ] O6 — CREG-04 and CREG-05 diagnostic rules registered — maps to acceptance criterion 13
- [ ] O7 — DNA-63 entry verified in docs/architecture-dna.md with reference to RFC-0734 — maps to acceptance criterion 14
- [ ] O8 — Unit tests covering review generation, apply with all decisions, stale review, mission.close CREG-05 — maps to acceptance criterion 15

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/content-regression.ts` — add `runContentRegressionReviewGenerate`, `runContentRegressionApply`, `reviewToYaml`, `parseReviewYaml`, `buildReviewChanges`, `applyReviewDecisions` functions; add `ContentRegressionReview`, `ContentRegressionReviewChange`, `ContentRegressionApplyResult` interfaces
- `packages/os/site-kernel-checks/src/command-tables/build-infra.ts` — register `content.regression.review.generate` and `content.regression.apply` commands
- `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts` — add CREG-04 and CREG-05 rules
- `packages/os/site-kernel-checks/src/content-regression.ts` — update `diffToDiagnostics` fixHint text to point to `review.generate`
- `packages/os/site-kernel-handoff/src/mission/mission-close.ts` — add CREG-05 check before golden snapshot copy; check for `apply-result.json`

### 2.2 Tests

- `packages/os/site-kernel-checks/src/tests/content-regression.test.ts` — add tests for `review.generate`, `apply` (accept/reject/fix), stale review detection
- `packages/os/site-kernel-handoff/src/tests/` — add test for `mission.close` CREG-05 block when drift exists without apply-result.json

### 2.3 Documentation

- `docs/architecture-dna.md` — verify DNA-63 entry references RFC-0734 (already added during drafting)
- `packages/os/site-kernel-checks/AGENTS.md` — update `content-regression.ts` module entry to document `review.generate` and `apply` commands
- Root `AGENTS.md` — add rule clarifying CREG-04 (workpiece mismatch) vs CREG-05 (unreviewed drift on close)
- `docs/verification-plan.xml` — add CREG-04, CREG-05 verification entries
- `docs/development-plan.xml` — add `content.regression.review.generate` and `content.regression.apply`

## 3. Implementation steps

### Step 1: TypeScript contracts and review YAML serialization

**Files:** `packages/os/site-kernel-checks/src/content-regression.ts`

- [ ] Add `ContentRegressionReviewChange` interface with `id`, `route`, `kind`, `blockId?`, `field?`, `golden`, `current`, `decision`, `fixValue`, `note`
- [ ] Add `ContentRegressionReview` interface with `schemaVersion`, `systemId`, `missionId`, `generatedAt`, `goldenSnapshotHash`, `currentSnapshotHash`, `summary`, `changes`
- [ ] Add `ContentRegressionApplyResult` interface with `accepted`, `rejected`, `fixed`, `pending`, `goldenUpdated`, `errors`
- [ ] Add `reviewToYaml(review, ownerCommand, filePath)` — serializes review to YAML with header comments (operator + agent instructions)
- [ ] Add `parseReviewYaml(raw)` — parses YAML back to `ContentRegressionReview` with validation

### Step 2: `content.regression.review.generate` handler

**Files:** `packages/os/site-kernel-checks/src/content-regression.ts`

- [ ] Add `buildReviewChanges(diff, currentSnapshot, goldenSnapshot)` — maps `ContentRegressionDiff` to `ContentRegressionReviewChange[]` with actual golden/current text values extracted from snapshot blocks
- [ ] Add `runContentRegressionReviewGenerate(input, context)` — builds current snapshot, loads golden, diffs, builds review changes, writes `review.yaml` to `missions/{missionId}/evidence/content-regression/review.yaml`, prints file path in output
- [ ] Support `--dry-run` flag (print to stdout without writing)
- [ ] Resolve missionId by reading `currentMission` from `systems/registry.yaml` for the matching `systemId`

### Step 3: `content.regression.apply` handler

**Files:** `packages/os/site-kernel-checks/src/content-regression.ts`

- [ ] Add `applyReviewDecisions(review, currentSnapshot, goldenSnapshot)` — processes each change:
  - `accept`: update golden route entry with current values
  - `reject`: verify current content matches golden (emit CREG-04 if not)
  - `fix`: verify current content matches fixValue (emit CREG-04 if not)
  - `pending`: count (error unless `--force`)
- [ ] Add `runContentRegressionApply(input, context)` — loads review.yaml, validates currentSnapshotHash, builds current snapshot, calls `applyReviewDecisions`, writes updated golden snapshot, writes `apply-result.json`
- [ ] Support `--review <path>` flag (required) and `--force` flag

### Step 4: Command registration

**Files:** `packages/os/site-kernel-checks/src/command-tables/build-infra.ts`

- [ ] Register `content.regression.review.generate` with `scope: app`, `cacheable: false`, `supportsAllSites: true`, flags: `--site`, `--dry-run`
- [ ] Register `content.regression.apply` with `scope: app`, `cacheable: false`, `supportsAllSites: true`, flags: `--site`, `--review`, `--force`

### Step 5: Diagnostic rules

**Files:** `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts`

- [ ] Add `CREG-04` rule: "Workpiece content does not match review decision (reject not reverted or fix not applied)", severity: error, command: `content.regression.apply`
- [ ] Add `CREG-05` rule: "Content drift exists but no review.yaml has been processed", severity: error, command: `mission.close`

### Step 6: `content.regression.check` fixHint update

**Files:** `packages/os/site-kernel-checks/src/content-regression.ts`

- [ ] Update CREG-01 fixHint to: "Review the content diff. Run: pnpm exec site-kernel run content.regression.review.generate --site <systemId>"
- [ ] Update CREG-02 fixHint to: "Route set mismatch. Run: pnpm exec site-kernel run content.regression.review.generate --site <systemId>"

### Step 7: `mission.close` CREG-05 enforcement and `--skip-content-regression` flag

**Files:** `packages/os/site-kernel-handoff/src/mission/mission-close.ts`, `packages/os/site-kernel-handoff/src/mission/index.ts`

- [ ] Add `--skip-content-regression` flag to `mission.close` command registration in `index.ts` (mirrors `mission.validate`)
- [ ] Before the existing golden snapshot copy (line 600-625), add CREG-05 enforcement:
  1. Load existing `current.snapshot.yaml` from workpiece `.cache/content-regression/` (do NOT rebuild from scratch)
  2. Load golden snapshot from cache clone
  3. If hashes match: proceed with copy (no drift)
  4. If hashes differ: check for `missions/{missionId}/evidence/content-regression/apply-result.json`
  5. If apply-result exists with `pending: 0` and no errors: proceed with copy
  6. If no apply-result: emit CREG-05 diagnostic and block (return error)
- [ ] Skip CREG-05 check if `--skip-content-regression` flag is passed to `mission.close`

### Step 8: Unit tests

**Files:** `packages/os/site-kernel-checks/src/tests/content-regression.test.ts`

- [ ] Test `review.generate`: produces correct review.yaml structure with golden/current values
- [ ] Test `apply` with all `accept`: golden snapshot updated
- [ ] Test `apply` with `reject` not reverted: CREG-04 emitted
- [ ] Test `apply` with `fix` not applied: CREG-04 emitted
- [ ] Test `apply` with `fix` applied: golden updated with fixValue
- [ ] Test `apply` with stale review (currentSnapshotHash mismatch): error emitted
- [ ] Test `apply` with `pending` decisions: error emitted (without `--force`)

**Files:** `packages/os/site-kernel-handoff/src/tests/` (new or existing mission-close test)

- [ ] Test `mission.close` with drift and no apply-result: CREG-05 block
- [ ] Test `mission.close` with drift and valid apply-result: proceeds
- [ ] Test `mission.close` with no drift: proceeds (backward compatible)

### Step 9: Documentation sync

- [ ] Verify DNA-63 entry in `docs/architecture-dna.md` references RFC-0734 (already added during drafting)
- [ ] Update `packages/os/site-kernel-checks/AGENTS.md` module entry for `content-regression.ts` to document `review.generate` and `apply`
- [ ] Update root `AGENTS.md` with rule clarifying CREG-04 vs CREG-05
- [ ] Update `docs/verification-plan.xml` — add CREG-04, CREG-05 verification entries
- [ ] Update `docs/development-plan.xml` — add `content.regression.review.generate` and `content.regression.apply`

### Final Step: Review, fix, evidence, and stamp

**Goal:** Run code review, fix findings, verify acceptance criteria, emit evidence, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check` (tsc --noEmit)
- Run `pnpm --filter @warpgogol/site-kernel-checks run test`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run test`
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0734`
- Run `pnpm exec site-kernel run rfc.acceptance.run --id RFC-0734`
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0734` and commit evidence file
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Max 3 iterations.
- Check off acceptance criteria: verify each criterion against implemented code. Mark `[x]` with inline `(evidence: ...)` annotation.
- Stamp: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0734 --implementation-commit <sha>`

**Completion criterion:** All build:check and test commands pass; rfc.validate passes; acceptance probes pass; review report exists in `docs/reviews/code/`; all acceptance criteria checked off with evidence annotations; RFC stamped as `implemented`.

**Human review:** no — automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0734`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- `pnpm exec site-kernel run rfc.acceptance.run --id RFC-0734`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0734`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0734.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0734` in the subject line (RFC-0265)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Operator skips review workflow | Step 7: CREG-05 blocks mission.close; --skip-content-regression is explicit escape hatch |
| Review.yaml becomes stale | Step 3: apply verifies currentSnapshotHash before processing |
| Large review.yaml for bulk changes | snapshot.update remains as bulk-accept escape hatch (not removed) |
| Agent cannot locate source files | Review.yaml contains route, blockId, field, golden/current values for resolution |
| mission.close performance regression | Step 7: loads existing current.snapshot.yaml, does not rebuild from scratch |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-63, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0734 --reason "..." --invariant "DNA-63"` instead of working around it.
- If CREG-05 enforcement breaks existing mission workflows in unexpected ways, do not weaken the check — create a new RFC to adjust the enforcement policy.

## 7. Sequencing

Steps 1-6 are in `site-kernel-checks` and can be done in one commit. Step 7 is in `site-kernel-handoff` and depends on steps 1-5 (CREG-05 rule, apply-result.json format). Step 8 (tests) should be written alongside the implementation steps. Step 9 (docs) is last.

Recommended commit sequence:

1. Steps 1-6 + tests (step 8 for site-kernel-checks) — one commit
2. Step 7 + tests (step 8 for site-kernel-handoff) — one commit
3. Step 9 (docs) — one commit
4. Final step (evidence + stamp) — one commit
