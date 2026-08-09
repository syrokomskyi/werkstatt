---
rfcId: RFC-0629
planId: PLAN-RFC-0629-01
status: draft
owner: architecture
createdAt: 2026-07-31
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/site-kernel-handoff"
    - "@syrokomskyi/axiom-capture"
    - "@syrokomskyi/axiom-study"
    - "@syrokomskyi/axiom-methodology"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0629

## 1. Objectives

- [ ] O1 — Rewrite `mission-check.ts` to use `PlaywrightEvidenceDriver`, `CrawleeDiscoveryExecutor`, `createAutomatedWebAccessibilityMethodology`, `runAccessibilityInstrument`, `findingsForObservation`, `evaluateClosure` — maps to acceptance criteria 1–6
- [ ] O2 — Write native capsule files (`staged-capsule.json`, `observation-bundle.json`, `study-run.json`, `evidence-metadata.json`) — maps to acceptance criteria 7–9
- [ ] O3 — Preserve backward-compatible `findings` field in `MissionCheckResult` for `leitstand.dev-deploy` result parsing — maps to acceptance criterion 10
- [ ] O4 — Add `--commit-sha` flag, remove local mode, remove `mission-check-converter.ts` — maps to acceptance criteria 11–13
- [ ] O5 — Update `leitstand.dev-deploy` to pass `--commit-sha` and remove evidence post-processing — maps to acceptance criterion 14
- [ ] O6 — Update `leitstand.propagate` evidence gate to read `evidence-metadata.json` + `study-run.json` — maps to acceptance criterion 15
- [ ] O7 — Add `@syrokomskyi/axiom-methodology` dependency, bump Playwright, keep `check-runner-node` intact — maps to acceptance criteria 13, 16
- [ ] O8 — Update tests for new evidence format, result interface, and severity model — maps to acceptance criterion 19

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/mission-check.ts` — full rewrite of `runMissionCheck` handler
- `packages/os/site-kernel-checks/src/mission-check-converter.ts` — removed
- `packages/os/site-kernel-checks/package.json` — add `@syrokomskyi/axiom-methodology` dependency, bump `playwright`
- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — update `runLeitstandDevDeploy` (pass `--commit-sha`, remove Step 6 post-processing) and `runLeitstandPropagate` (evidence gate reads new format)
- `packages/os/site-kernel-checks/src/tests/mission-check.test.ts` — update for new interface, evidence files, remove local-mode tests
- `packages/os/site-kernel-handoff/src/tests/leitstand-0628-dev-deploy.test.ts` — update test helpers (`writeEvidenceCapsule`, `writeAxiomFindings`) to write JSON format

### 2.2 Configuration and data

- `packages/os/site-kernel-checks/package.json` — dependency additions
- Root `package.json` — Playwright version bump to `^1.62.1`

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — update evidence format description
- `packages/os/site-kernel-handoff/AGENTS.md` — update Leitstand evidence gate description (propagate reads `evidence-metadata.json` + `study-run.json`)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

## 3. Step sequence

### Step 1. Add `@syrokomskyi/axiom-methodology` dependency and bump Playwright

**Goal:** Ensure `site-kernel-checks` can import from `axiom-methodology` and Playwright versions are aligned with `axiom-capture`.

**Agent actions:**

- Add `"@syrokomskyi/axiom-methodology": "link:../../../../pipelines/packages/axiom/axiom-methodology"` to `packages/os/site-kernel-checks/package.json` dependencies
- Bump `playwright` to `^1.62.1` in the root `package.json` (or `packages/os/site-kernel-checks/package.json` if it has its own Playwright dependency)
- Run `pnpm install` to resolve the new dependency

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes
- `node -e "require('@syrokomskyi/axiom-methodology')"` resolves without error

**Completion criterion:** `@syrokomskyi/axiom-methodology` is importable from `site-kernel-checks` and Playwright version matches `axiom-capture`.

**Human review:** no

---

### Step 2. Rewrite `mission-check.ts` to use native Axiom components

**Goal:** Replace manual Playwright + CDN axe-core with `PlaywrightEvidenceDriver`, `CrawleeDiscoveryExecutor`, `createAutomatedWebAccessibilityMethodology`, `runAccessibilityInstrument`, `findingsForObservation`, `evaluateClosure`.

**Agent actions:**

- Remove imports: `PlaywrightCaptureAdapter` from `@syrokomskyi/axiom-capture`, `convertObservationsToFindings` from `./mission-check-converter.ts`, `stringify as stringifyYaml` from `yaml`, `createServer`/`Server` from `node:http`, `spawnSync` from `node:child_process`
- Add imports: `PlaywrightEvidenceDriver`, `CrawleeDiscoveryExecutor`, `StagedCapsule`, `LocalCaptureContract`, `evaluateClosure` from `@syrokomskyi/axiom-capture`; `runAccessibilityInstrument`, `ObservationBundle`, `StudyRun` from `@syrokomskyi/axiom-study`; `createAutomatedWebAccessibilityMethodology`, `findingsForObservation`, `MethodologyPackage` from `@syrokomskyi/axiom-methodology`
- Update `MissionCheckResult` interface: add `capsule`, `studyRun`, `findingsCount`, `closureDecision` fields; keep backward-compatible `findings: { errors, warnings, total }` field (errors = critical + high, warnings = medium + low + info)
- Add `commitSha?: string` to input flags parsing
- Remove local mode (build + static server) — `--external-preview` is required
- Remove `createStaticServer`, `discoverPagesFromSitemap`, `fetchSitemapXml`, `runAxeInBrowser`, `healthCheck`, `safeNameFromPath` functions
- Implement new handler flow:
  1. Construct `LocalCaptureContract` with `missionId`, `origins: [baseUrl]`, `locales`, `profiles`, `limits`, `closureThresholds`
  2. Create `PlaywrightEvidenceDriver` and `CrawleeDiscoveryExecutor` instances
  3. Discover pages via `CrawleeDiscoveryExecutor` within the origin
  4. Capture each page via `PlaywrightEvidenceDriver` (uses `bypassCSP: true`, local `@axe-core/playwright` bundle)
  5. Run `runAccessibilityInstrument` to produce `ObservationBundle`
  6. Bind methodology via `createAutomatedWebAccessibilityMethodology()`
  7. Project findings via `findingsForObservation()` for each observation
  8. Evaluate closure via `evaluateClosure()`
  9. Build `StagedCapsule` with contract, capability manifest, closure decision
  10. Build `StudyRun` with findings and assessments
  11. Write `staged-capsule.json`, `observation-bundle.json`, `study-run.json` to `evidence/axiom/`
  12. Write `evidence-metadata.json` with `{ missionId, commitSha }` (when `--commit-sha` provided)
  13. Write raw evidence artifacts to `evidence/axiom/raw/`
- Compute `findingsCount` from `StudyRun.findings` by severity
- Compute backward-compatible `findings: { errors, warnings, total }` from `findingsCount`
- Gate logic: `status = "fail"` if any finding has severity `high` or `critical`, or if `closureDecision.satisfied === false`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes
- No manual Playwright imports (`chromium.launch`, `browser.newPage`, `page.route`, `page.addScriptTag`) in `mission-check.ts`
- No CDN axe-core URL (`unpkg.com/axe-core`) in `mission-check.ts`
- No `stringifyYaml` import in `mission-check.ts`

**Completion criterion:** `mission-check.ts` uses only native Axiom components for browser capture, page discovery, methodology binding, observation generation, finding projection, and closure evaluation. No manual Playwright or CDN axe-core.

**Human review:** no

---

### Step 3. Remove `mission-check-converter.ts`

**Goal:** Delete the legacy converter that mapped observations to `findings.yaml` format.

**Agent actions:**

- Delete `packages/os/site-kernel-checks/src/mission-check-converter.ts`
- Remove any imports of `convertObservationsToFindings` or `FindingYaml` from other files
- Grep for `mission-check-converter` references and remove them

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes
- `grep -r "mission-check-converter" packages/` returns no results

**Completion criterion:** `mission-check-converter.ts` is deleted and no references remain.

**Human review:** no

---

### Step 4. Update `leitstand.dev-deploy` — pass `--commit-sha`, remove post-processing

**Goal:** Replace the evidence post-processing step with `--commit-sha` flag passed to `mission.check`.

**Agent actions:**

- In `runLeitstandDevDeploy` (`leitstand-commands.ts`):
  - Step 5: Add `--commit-sha=${commitSha}` to the `executeKernelCommand` argv for `mission.check` (line ~529)
  - Step 6: Remove the entire "Post-process evidence capsule with commitSha" block (lines ~555-574) — no more reading `evidence-capsule.yaml`, injecting `commitSha`, writing back
  - Keep the result parsing (`data.findings.errors` / `data.findings.warnings`) — the backward-compatible `findings` field in `MissionCheckResult` ensures this still works
- Remove `parseYaml` and `stringifyYaml` imports if no longer used in the file (check other usages first)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes
- No `evidence-capsule.yaml` references in `leitstand-commands.ts` dev-deploy section
- `--commit-sha` is passed in the `mission.check` argv

**Completion criterion:** `leitstand.dev-deploy` passes `--commit-sha` to `mission.check` and no longer post-processes evidence files.

**Human review:** no

---

### Step 5. Update `leitstand.propagate` evidence gate — read new format

**Goal:** Replace `evidence-capsule.yaml` + `findings.yaml` reading with `evidence-metadata.json` + `study-run.json` reading.

**Agent actions:**

- In `runLeitstandPropagate` (`leitstand-commands.ts`, lines ~645-710):
  - Replace `evidence-capsule.yaml` path with `evidence-metadata.json` path
  - Read `evidence-metadata.json` as JSON (not YAML) — extract `missionId` and `commitSha`
  - Verify `missionId` matches release manifest `missionId`
  - Verify `commitSha` matches release manifest `commitSha`
  - Replace `findings.yaml` path with `study-run.json` path
  - Read `study-run.json` as JSON — extract `findings` array
  - Check for findings with `severity === "high" || severity === "critical"` — fail if any exist
  - Remove `parseYaml` usage for evidence gate (use `JSON.parse` instead)
  - Update error messages to reference new file names

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes
- No `evidence-capsule.yaml` or `findings.yaml` references in `leitstand-commands.ts` propagate section
- Gate checks `study-run.json` findings for `high`/`critical` severity

**Completion criterion:** `leitstand.propagate` evidence gate reads `evidence-metadata.json` for missionId/commitSha verification and `study-run.json` for severity-based gate check.

**Human review:** no

---

### Step 6. Update tests

**Goal:** Update existing tests for the new evidence format, result interface, and severity model.

**Agent actions:**

- `packages/os/site-kernel-checks/src/tests/mission-check.test.ts`:
  - Remove local-mode tests (exit code 6 for missing dist, exit code 7 for missing sitemap) — local mode is removed
  - Keep `--mission` missing test and `--external-preview` without `--base-url` test
  - Add test for `--commit-sha` flag writing to `evidence-metadata.json`
  - Add test for `findingsCount` and backward-compatible `findings` field in result
  - Add test for gate fail when findings have `high` or `critical` severity
  - Mock `PlaywrightEvidenceDriver` and `CrawleeDiscoveryExecutor` to avoid real browser launches
  - Test files must live under `src/tests/` (per vitest config)
- `packages/os/site-kernel-handoff/src/tests/leitstand-0628-dev-deploy.test.ts`:
  - Replace `writeEvidenceCapsule` helper to write `evidence-metadata.json` (JSON, not YAML) with `{ missionId, commitSha }`
  - Replace `writeAxiomFindings` helper to write `study-run.json` (JSON, not YAML) with `{ findings: [], ... }`
  - Update propagate gate tests to verify new file format reading
  - Update mock `executeKernelCommand` to return `findings: { errors: 0, warnings: 0 }` (backward-compatible field)
  - Update test data to use `severity: "high"` / `severity: "critical"` instead of `errors: N`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test` passes
- `pnpm --filter @warpgogol/site-kernel-handoff run test` passes

**Completion criterion:** All tests pass with the new evidence format, result interface, and severity model.

**Human review:** no

---

### Step 7. Update AGENTS.md files

**Goal:** Synchronize documentation with the new evidence format and gate logic.

**Agent actions:**

- `packages/os/site-kernel-checks/AGENTS.md`: Update evidence format description from YAML (`evidence-capsule.yaml`, `findings.yaml`) to JSON (`staged-capsule.json`, `observation-bundle.json`, `study-run.json`, `evidence-metadata.json`). Update `mission.check` description to mention native Axiom components.
- `packages/os/site-kernel-handoff/AGENTS.md`: Update Leitstand evidence gate description — `leitstand.dev-deploy` passes `--commit-sha` (no post-processing), `leitstand.propagate` reads `evidence-metadata.json` + `study-run.json` (not `evidence-capsule.yaml` + `findings.yaml`).

**Validation:**

- `grep -r "evidence-capsule.yaml" packages/os/site-kernel-checks/AGENTS.md packages/os/site-kernel-handoff/AGENTS.md` returns no results (or only historical references)
- `grep -r "findings.yaml" packages/os/site-kernel-checks/AGENTS.md packages/os/site-kernel-handoff/AGENTS.md` returns no results (or only historical references)

**Completion criterion:** Both AGENTS.md files reflect the new evidence format and gate logic.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)`. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0629 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0629`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0629`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0629` in the subject line (RFC-0265 commit hygiene)
- `docs/rfcs/verification/rfc-0629.generated.json` — verification evidence (if acceptance probes declared)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Playwright version mismatch causes browser binary conflicts | Step 1 bumps Playwright to `^1.62.1` aligned with `axiom-capture` |
| Crawlee discovery slower than sitemap for large sites | Step 2 uses `LocalCaptureContract.limits.maxUrls` (default 100) to cap discovery |
| `StagedCapsule` digest invalidation from post-hoc modification | Step 2 writes `commitSha` to separate `evidence-metadata.json`, not to the capsule |
| `leitstand.propagate` gate breaks on new format | Step 5 updates gate to read `evidence-metadata.json` + `study-run.json` |
| `leitstand.dev-deploy` result parsing breaks | Step 2 keeps backward-compatible `findings` field; Step 4 preserves result parsing |
| `check-runner-node` consumers break | Steps 2–7 do NOT modify `check-runner-node` files |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-48 or DNA-49, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0629 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `PlaywrightEvidenceDriver` or `CrawleeDiscoveryExecutor` APIs do not match the RFC's TypeScript contracts, stop and report the discrepancy — the axiom packages may need updates before this RFC can be implemented.
- If `evaluateClosure` or `findingsForObservation` signatures have changed since the RFC was written, stop and report — the RFC contracts may need amendment.
