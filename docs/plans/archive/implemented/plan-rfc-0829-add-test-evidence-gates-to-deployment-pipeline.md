---
rfcId: RFC-0829
planId: PLAN-RFC-0829-01
status: draft
owner: architecture
createdAt: 2026-08-13
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
    - "@warpgogol/werkstatt-site"
  services: []
  docs:
    - AGENTS.md
    - services/AGENTS.md
---

# Implementation Plan: RFC-0829

## 1. Objectives

- [ ] O1 — `test.evidence.verify` command registered and functional (maps to acceptance criterion 1)
- [ ] O2 — `test.evidence.list` command registered and functional (maps to acceptance criterion 2)
- [ ] O3 — Test evidence recording integrated into test commands (maps to acceptance criterion 3)
- [ ] O4 — `leitstand.propagate` verifies L4+L5 evidence before deploying to alt (maps to acceptance criterion 4)
- [ ] O5 — `leitstand.promote` verifies L4+L5 evidence before deploying to main (maps to acceptance criterion 5)
- [ ] O6 — `leitstand.service.promote` verifies L1+L2+L5 evidence before promoting to prod (maps to acceptance criterion 6)
- [ ] O7 — Gate failures produce clear error messages with remediation instructions (maps to acceptance criterion 7)
- [ ] O8 — Grace period documented in `AGENTS.md` and `services/AGENTS.md` (maps to acceptance criterion 9)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/testing/test-evidence.ts` — new file: `test.evidence.verify` and `test.evidence.list` command handlers, `recordTestEvidence` helper, `resolveEvidenceDir` helper, `GRACE_PERIOD_END` date constant
- `packages/werkstatt-site/src/checks/command-tables/20-ecosystem.ts` — register `test.evidence.verify` and `test.evidence.list` commands
- `packages/werkstatt/src/leitstand/leitstand-commands.ts` — add test evidence gate calls in `runLeitstandPropagate` (before Axiom evidence gate) and `runLeitstandPromote` (before build-identity verification)
- `packages/werkstatt/src/leitstand/service-promote.ts` — add test evidence gate call in `runLeitstandServicePromote` (after pre-deploy gates, before wrangler deploy); capture `commitSha` via `git rev-parse HEAD`
- `packages/werkstatt-site/src/testing/smoke/` — `recordTestEvidence` calls in `service.smoke.run` and `site.smoke.run` (RFC-0825 commands)
- `packages/werkstatt-site/src/testing/e2e/` — `recordTestEvidence` calls in `site.e2e.run` (RFC-0828 command)
- `packages/werkstatt-site/src/testing/integration/` — `recordTestEvidence` calls in `service.integration.run` (RFC-0826 command)
- `packages/werkstatt-site/src/testing/unit/` — `recordTestEvidence` calls in `service.test.run` (RFC-0824 command)

### 2.2 Configuration and data

- `releases/<release-id>/.test-evidence/*.json` — site test evidence files (generated, committed with release)
- `services/<service-id>/.test-evidence/*.json` — service test evidence files (generated, gitignored)
- `services/<service-id>/.gitignore` — ensure `.test-evidence/` is ignored (if not already)

### 2.3 Documentation and specs

- `AGENTS.md` — add grace period end date and test evidence gate documentation
- `services/AGENTS.md` — add grace period end date and service test evidence gate documentation
- `docs/summits/summit-rfc-0829.md` — summit report (already committed)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — engine typecheck
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — plugin typecheck
- `pnpm --filter @warpgogol/werkstatt run test` — engine unit tests
- `pnpm --filter @warpgogol/werkstatt-site run test` — plugin unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0829`

## 3. Step sequence

### Step 1. Define test evidence types and storage helpers

**Goal:** Create the `test-evidence.ts` module with TypeScript contracts, evidence directory resolution, and recording helper.

**Agent actions:**

- Create `packages/werkstatt-site/src/testing/test-evidence.ts`
- Define `TestEvidence` interface (matching RFC-0823 structure: `testRunId`, `level`, `targetId`, `commitSha`, `passed`, `durationMs`, `timestamp`, `failures`)
- Define `TestEvidenceVerifyInput`, `TestEvidenceVerifyResult`, `TestEvidenceListInput`, `TestEvidenceListResult` interfaces (matching RFC-0829 TypeScript contracts)
- Implement `resolveEvidenceDir(workspaceRoot, target?)` — returns `releases/<release-id>/.test-evidence/` for sites, `services/<service-id>/.test-evidence/` for services
- Implement `recordTestEvidence(workspaceRoot, target, evidence)` — atomic write (temp file + rename) to `resolveEvidenceDir/<level>.json`
- Define `GRACE_PERIOD_END` date constant (2 weeks from implementation date)
- Implement `isWithinGracePeriod()` helper

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** `test-evidence.ts` exists with all types and helpers, typecheck passes.

**Human review:** no

---

### Step 2. Implement `test.evidence.verify` command handler

**Goal:** Create the verify command that checks evidence exists, passed, and commitSha matches.

**Agent actions:**

- Implement `runTestEvidenceVerify(input, context)` in `test-evidence.ts`
- Parse `--target`, `--service`, `--levels` (comma-separated), `--commit-sha` flags
- For each level: read `<level>.json`, check `found`, `passed`, `commitShaMatch`, `timestamp`
- Apply grace period logic: before `GRACE_PERIOD_END`, return exit code 0 with warnings for missing/failed evidence; after, return exit code 1
- Apply staleness check (GATE-04): evidence older than 24h is a warning, not fatal
- Return `TestEvidenceVerifyResult` with per-level status and summary

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** `runTestEvidenceVerify` implemented, typecheck passes.

**Human review:** no

---

### Step 3. Implement `test.evidence.list` command handler

**Goal:** Create the list command that enumerates all evidence for a target.

**Agent actions:**

- Implement `runTestEvidenceList(input, context)` in `test-evidence.ts`
- Parse `--target`, `--service` flags
- Read all `.json` files in the evidence directory
- Return `TestEvidenceListResult` with per-level summary

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** `runTestEvidenceList` implemented, typecheck passes.

**Human review:** no

---

### Step 4. Register commands in command table

**Goal:** Register `test.evidence.verify` and `test.evidence.list` in the ecosystem command table.

**Agent actions:**

- Add entries to `ECOSYSTEM_COMMANDS` in `packages/werkstatt-site/src/checks/command-tables/20-ecosystem.ts`
- Import `runTestEvidenceVerify` and `runTestEvidenceList` from `../../testing/test-evidence.ts`
- `test.evidence.verify`: flags `--target` (string, optional), `--service` (string, optional), `--levels` (string, required), `--commit-sha` (string, required), `scope: workspace`, `cacheable: false`
- `test.evidence.list`: flags `--target` (string, optional), `--service` (string, optional), `scope: workspace`, `cacheable: false`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm exec werkstatt run command.manifest.validate`

**Completion criterion:** Both commands registered, typecheck and manifest validation pass.

**Human review:** no

---

### Step 5. Integrate evidence recording into test commands

**Goal:** Add `recordTestEvidence` calls to existing test commands (RFC-0824–0828).

**Agent actions:**

- In `service.test.run` (RFC-0824): after tests complete, call `recordTestEvidence` with level `L1`, commitSha from `git rev-parse HEAD`
- In `service.smoke.run` and `site.smoke.run` (RFC-0825): after smoke tests, call `recordTestEvidence` with level `L5`
- In `service.integration.run` (RFC-0826): after integration tests, call `recordTestEvidence` with level `L2`
- In `site.e2e.run` (RFC-0828): after E2E tests, call `recordTestEvidence` with level `L4`
- Each call writes to the appropriate evidence directory (`services/<service-id>/.test-evidence/` or `releases/<release-id>/.test-evidence/`)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** All test commands call `recordTestEvidence`, typecheck passes.

**Human review:** no

---

### Step 6. Add test evidence gate to `leitstand.propagate`

**Goal:** Verify L4+L5 evidence before deploying to alt channel.

**Agent actions:**

- In `runLeitstandPropagate` (`packages/werkstatt/src/leitstand/leitstand-commands.ts`), add gate call after Axiom evidence verification (line ~1801) and before lock acquisition
- Call `executeKernelCommand({ workspaceRoot, commandName: "test.evidence.verify", argv: ["--target", systemId, "--levels", "L4,L5", "--commit-sha", releaseCommitSha] })`
- If `exitCode !== 0`, throw `Error` with `TEST-EVIDENCE-GATE` prefix and remediation message
- Add `testEvidenceVerified: boolean` to `LeitstandPropagateData` interface
- Set `testEvidenceVerified: true` on success

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** Gate call added, typecheck passes, `LeitstandPropagateData` extended.

**Human review:** no

---

### Step 7. Add test evidence gate to `leitstand.promote`

**Goal:** Verify L4+L5 evidence before deploying to main channel.

**Agent actions:**

- In `runLeitstandPromote` (`packages/werkstatt/src/leitstand/leitstand-commands.ts`), add gate call after CDN freshness verification (line ~2141) and before build-identity fetch
- Call `executeKernelCommand({ workspaceRoot, commandName: "test.evidence.verify", argv: ["--target", systemId, "--levels", "L4,L5", "--commit-sha", releaseManifest.commitSha] })`
- If `exitCode !== 0`, throw `Error` with `TEST-EVIDENCE-GATE` prefix and remediation message
- Add `testEvidenceVerified: boolean` to `LeitstandPromoteData` interface
- Set `testEvidenceVerified: true` on success

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** Gate call added, typecheck passes, `LeitstandPromoteData` extended.

**Human review:** no

---

### Step 8. Add test evidence gate to `leitstand.service.promote`

**Goal:** Verify L1+L2+L5 evidence before promoting service to production.

**Agent actions:**

- In `runLeitstandServicePromote` (`packages/werkstatt/src/leitstand/service-promote.ts`), add gate call after pre-deploy gates (line ~108) and before subdomain validation
- Capture `commitSha` via `execSync("git rev-parse HEAD", { cwd: workspaceRoot })`
- Call `executeKernelCommand({ workspaceRoot, commandName: "test.evidence.verify", argv: ["--service", serviceId, "--levels", "L1,L2,L5", "--commit-sha", commitSha] })`
- If `exitCode !== 0`, return failed `ServicePromoteData` with `deployState: "failed"` and `TEST-EVIDENCE-GATE` summary
- Add `testEvidenceVerified: boolean` to `ServicePromoteData` interface
- Set `testEvidenceVerified: true` on success

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** Gate call added, typecheck passes, `ServicePromoteData` extended.

**Human review:** no

---

### Step 9. Write unit tests

**Goal:** Test `test.evidence.verify`, `test.evidence.list`, and gate behavior.

**Agent actions:**

- Write `packages/werkstatt-site/src/testing/tests/test-evidence.test.ts`:
  - `test.evidence.verify` returns pass when all evidence exists and passes
  - `test.evidence.verify` returns fail when evidence missing (GATE-01)
  - `test.evidence.verify` returns fail when tests failed (GATE-02)
  - `test.evidence.verify` returns fail when commitSha mismatch (GATE-03)
  - `test.evidence.verify` returns warning for stale evidence (GATE-04)
  - `test.evidence.verify` returns pass during grace period even with missing evidence
  - `test.evidence.verify` returns fail after grace period with missing evidence
  - `test.evidence.list` returns all evidence files
  - `test.evidence.list` returns empty array when no evidence directory exists
  - `recordTestEvidence` writes atomic file
- Write `packages/werkstatt/src/tests-handoff/leitstand-test-evidence-gate.test.ts`:
  - `leitstand.propagate` blocks when test evidence missing (after grace period)
  - `leitstand.promote` blocks when test evidence missing (after grace period)
  - `leitstand.service.promote` blocks when test evidence missing (after grace period)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm --filter @warpgogol/werkstatt run test`

**Completion criterion:** All tests pass.

**Human review:** no

---

### Step 10. Document grace period in AGENTS.md files

**Goal:** Record the grace period end date and test evidence gate policy in AGENTS.md files.

**Agent actions:**

- Add section to root `AGENTS.md` under deployment pipeline rules: "Test evidence gates (RFC-0829): `leitstand.propagate`, `leitstand.promote`, and `leitstand.service.promote` verify test evidence before deployment. Grace period ends `<date>` — after this date, missing or failed evidence is fatal."
- Add section to `services/AGENTS.md`: "Service test evidence gates (RFC-0829): `leitstand.service.promote` verifies L1+L2+L5 evidence. Grace period ends `<date>`."

**Validation:**

- `git diff` shows only AGENTS.md changes

**Completion criterion:** Both AGENTS.md files updated with grace period end date and gate documentation.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed.
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0829 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0829`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0829`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm --filter @warpgogol/werkstatt-site run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0829` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Evidence staleness | Step 2: GATE-04 staleness check (warning, not fatal); commitSha match (GATE-03) is primary freshness guarantee |
| Evidence directory bloat | Evidence files in release directories are archived with releases; service evidence is gitignored and ephemeral |
| False negatives | Step 9: unit tests verify evidence recording; Step 5: all test commands call `recordTestEvidence` |
| Circular dependency | Steps 5-8: pipeline ordering is dev-deploy (record) → propagate (verify) → promote (verify) |
| Concurrent test runs (summit A1+Q1) | Step 1: atomic writes prevent corruption; `testRunId` in evidence files allows future deduplication |
| Implementing before dependencies (summit A2+D1) | `dependsOn` frontmatter enforces ordering via `rfc.implement.stamp` (RFC-IMP-07); implementer must verify RFC-0824–0828 are implemented first |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-64 (engine/plugin boundary), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0829 --reason "..." --invariant "DNA-64"` instead of working around it.
- If the grace period mechanism proves insufficient (e.g., deployments break unexpectedly), extend the grace period by updating `GRACE_PERIOD_END` in `test-evidence.ts` and the AGENTS.md files.

## 7. Implementation notes (from summit)

- **Summit A2+D1:** Implementing RFC-0829 before RFC-0824–0828 produces a pipeline that blocks all deployments (no evidence files exist). The `dependsOn` frontmatter enforces ordering via `rfc.implement.stamp` (RFC-IMP-07). Verify all dependencies are `implemented` before starting.
- **Summit A1+Q1:** Concurrent test runs writing to the same evidence file — last writer wins semantically. Atomic writes prevent corruption but not semantic races. A future RFC could add `testRunId`-based deduplication.
