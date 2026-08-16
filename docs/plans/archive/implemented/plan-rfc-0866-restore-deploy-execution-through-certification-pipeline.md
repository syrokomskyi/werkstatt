---
rfcId: RFC-0866
planId: PLAN-RFC-0866-01
status: draft
owner: architecture
createdAt: 2026-08-15
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
  services: []
  docs:
    - docs/verification-plan.xml
    - docs/development-plan.xml
    - packages/werkstatt/AGENTS.md
---

# Implementation Plan: RFC-0866

## 1. Objectives

- [ ] Objective 1 — Implement `leitstand.certify` command producing `GateDecisionV1` at `systems-cache/{id}/gate-decisions/{releaseId}-{gate}.json` — maps to acceptance criteria 1, 2, 9, 10
- [ ] Objective 2 — Restore `leitstand.dev-deploy` to full 13-phase deploy execution after authorization — maps to acceptance criteria 3-9, 14
- [ ] Objective 3 — Restore `leitstand.propagate` to full alt deploy execution with durable sync + Axiom evidence gate — maps to acceptance criteria 15-17
- [ ] Objective 4 — Restore `leitstand.promote` to full main deploy execution with alt health + main verification — maps to acceptance criteria 18-20
- [ ] Objective 5 — Restore `leitstand.rollback`, `leitstand.status`, `leitstand.health`, `leitstand.pipeline.check` — maps to acceptance criteria 21-24
- [ ] Objective 6 — Fix module flag declarations for `leitstand.propagate` and `leitstand.promote` — maps to acceptance criteria 25-26
- [ ] Objective 7 — Synchronize Compass docs and AGENTS.md — maps to acceptance criteria 30, 33

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/leitstand/certify.ts` — **New file** — `leitstand.certify` command handler
- `packages/werkstatt/src/leitstand/deploy-execution.ts` — **New file** — shared `executeDeployPhases()` function
- `packages/werkstatt/src/leitstand/leitstand-commands.ts` — Restore deploy execution in `runLeitstandDevDeploy`, `runLeitstandPropagate`, `runLeitstandPromote`, `runLeitstandRollback`, `runLeitstandStatus`, `runLeitstandHealth`, `runLeitstandPipelineCheck`
- `packages/werkstatt/src/leitstand/leitstand.module.ts` — Register `leitstand.certify`; add `--gate-decision` flag to `leitstand.propagate`; add `--gate-decision` + `--main-verification-decision` flags to `leitstand.promote`
- `packages/werkstatt/src/leitstand/deploy-helpers.ts` — No changes (authorization helpers reused as-is)
- `packages/werkstatt/src/leitstand/cache-purge.ts` — No changes (purge helpers reused)
- `packages/werkstatt/src/leitstand/adapters/cloudflare-workers.ts` — No changes (adapter reused)
- `packages/werkstatt/src/certification/orchestration/orchestrator.ts` — No changes (orchestration primitives reused)
- `packages/werkstatt/src/certification/profile/astro-profile.ts` — No changes (profile reused)

### 2.2 Configuration and data

- `systems-cache/{id}/gate-decisions/{releaseId}-{gate}.json` — **New conventional path** for gate decision output
- `systems-cache/{id}/deployment-operations/` — Effect records read by `pipeline.check` and `certify` (URL verification)

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0866-*.md` — Read-only reference
- `packages/werkstatt/AGENTS.md` — Add `leitstand.certify` command, update deploy pipeline description
- `docs/verification-plan.xml` — Add deploy execution verification steps
- `docs/development-plan.xml` — Add deploy execution development milestones

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/werkstatt run test` — Unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0866` — RFC validation

## 3. Step sequence

### Step 1. TypeScript contracts and types

**Goal:** Define the TypeScript interfaces for `CertifyInput`, `CertifyResult`, `DeployExecutionContext`, `DeployExecutionResult`, and the `executeDeployPhases` function signature.

**Agent actions:**

- Create `packages/werkstatt/src/leitstand/deploy-execution.ts` with `DeployExecutionContext`, `DeployExecutionResult` interfaces and the `executeDeployPhases()` function signature (stub implementation returning empty result)
- Create `packages/werkstatt/src/leitstand/certify.ts` with `CertifyInput`, `CertifyResult` interfaces
- Export both from `packages/werkstatt/src/leitstand/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes

**Completion criterion:** New files exist, interfaces compile, barrel exports resolve.

**Human review:** no

---

### Step 2. Implement `leitstand.certify` command handler

**Goal:** Implement the full `leitstand.certify` command that produces `GateDecisionV1` JSON from certification orchestration.

**Agent actions:**

- In `certify.ts`, implement `runLeitstandCertify()`:
  - Parse `--site`, `--gate`, `--candidate-id`, `--artifact-hash`, `--release` flags
  - Load `astroCertificationProfile` from `packages/werkstatt/src/certification/profile/astro-profile.ts`
  - Register `astro-mission-check` producer handler (wraps `mission.check`) — skip when no open mission
  - Read dev deployment URL from `systems-cache/{id}/deployment-operations/` effect records for `--base-url` (URL verification, summit S1)
  - Call `planProducers()` with producer nodes
  - Call `executeProducers()` with handler and base input
  - Call `evaluateCertificationDecision()` with evidence
  - Write `GateDecisionV1` to `systems-cache/{systemId}/gate-decisions/{releaseId}-{gate}.json` (overwrite on retry — idempotent)
  - Return `CertifyResult` with `outputPath`, `status`, `decisionId`, `producerCount`, `evidenceCount`
- Register `leitstand.certify` in `leitstand.module.ts` with flags: `site`, `gate`, `candidate-id`, `artifact-hash`, `release`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes
- Unit test: mock `ProducerExecutionHandlerV1`, verify `evaluateCertificationDecision` produces expected `GateDecisionV1` status

**Completion criterion:** `leitstand.certify` command registered, produces `GateDecisionV1` at conventional path, works without open mission.

**Human review:** no

---

### Step 3. Implement shared `executeDeployPhases()` function

**Goal:** Implement the 13-phase deploy pipeline shared across dev/alt/main channels.

**Agent actions:**

- In `deploy-execution.ts`, implement `executeDeployPhases(ctx, channel)`:
  - Phase 1: Build with build-skip cache (reuse `computeBuildInputHash` from `handoff/build-pipeline-helpers.ts`)
  - Phase 2: `adapter.propagate()` via `createCloudflareWorkersAdapter()`
  - Phase 3: Build-identity finalization (reuse `fingerprintTree` from `@warpgogol/werkstatt/fingerprint/semantic`)
  - Phase 4: CDN cache purge — skip for dev channel (summit A1), `runPurgeStep()` for alt/main
  - Phase 5: Freshness verification — skip for dev channel, `verifyFreshness()` for alt/main
  - Phase 6: Health check — `adapter.health()` with retry loop
  - Phase 7: mission.check (channel === "dev" only) — `runMissionCheckWithResilience()`, skipped when no open mission
  - Phase 8: Axiom evidence gate (channel === "alt" only) — read evidence-metadata.json + study-run.json
  - Phase 9: Main verification (channel === "main" only) — `verifyMainPromotion()`
  - Phase 10: Evidence sync — best-effort to R2
  - Phase 11: Bordbuch event — `appendAndCommitBordbuch()`
  - Phase 12: System-state update — `writeSystemStateSmart()`
  - Phase 13: Effect record update — from `authorized` to `deployed` with `failingPhase` metadata on failure
- Import all helpers from existing locations in `leitstand-commands.ts` (they are already exported)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes
- Unit test: mock adapter, verify phase execution order and channel-specific skips

**Completion criterion:** `executeDeployPhases()` compiles, all 13 phases implemented, channel-specific conditionals work.

**Human review:** no

---

### Step 4. Restore `leitstand.dev-deploy`

**Goal:** Wire `runLeitstandDevDeploy` to call `executeDeployPhases()` after authorization.

**Agent actions:**

- In `leitstand-commands.ts`, modify `runLeitstandDevDeploy`:
  - After `authorizeAndDeploy()` returns `ok: true`, resolve gate decision from `systems-cache/{id}/gate-decisions/{releaseId}-dev.json` (or `--gate-decision` override)
  - Call `executeDeployPhases(ctx, "dev")`
  - Return real `deploymentUrl`, `buildSkipped`, `buildIdentity`, `freshness`, `evidenceSynced` in result
  - Remove stub `deploymentUrl: ""` and `state: "succeeded"` hardcode

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes
- Existing dev-deploy tests updated to expect real deploy execution (mocked adapter)

**Completion criterion:** `runLeitstandDevDeploy` calls `executeDeployPhases` and returns real deployment data.

**Human review:** no

---

### Step 5. Restore `leitstand.propagate`

**Goal:** Wire `runLeitstandPropagate` to call `executeDeployPhases()` with alt-specific phases.

**Agent actions:**

- In `leitstand-commands.ts`, modify `runLeitstandPropagate`:
  - After `authorizeAndDeploy()` returns `ok: true`, resolve gate decision from `systems-cache/{id}/gate-decisions/{releaseId}-alt.json`
  - Call `executeDeployPhases(ctx, "alt")`
  - Return real `deploymentUrl`, `devBuildIdentityVerified`, `axiomEvidenceVerified`, `testEvidenceVerified`
  - Remove stub returns
- In `leitstand.module.ts`, add `gate-decision` flag declaration to `leitstand.propagate` registration

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes
- Existing propagate tests updated

**Completion criterion:** `runLeitstandPropagate` calls `executeDeployPhases` with alt channel, module declares `--gate-decision` flag.

**Human review:** no

---

### Step 6. Restore `leitstand.promote`

**Goal:** Wire `runLeitstandPromote` to call `executeDeployPhases()` with main-specific phases.

**Agent actions:**

- In `leitstand-commands.ts`, modify `runLeitstandPromote`:
  - After `authorizeMainPromotion()` returns `ok: true`, resolve gate decision from `systems-cache/{id}/gate-decisions/{releaseId}-main.json`
  - Call `executeDeployPhases(ctx, "main")`
  - Return real `deploymentUrl`, `buildIdentityVerified`, `testEvidenceVerified`
  - Remove stub returns
- In `leitstand.module.ts`, add `gate-decision` and `main-verification-decision` flag declarations to `leitstand.promote` registration

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes
- Existing promote tests updated

**Completion criterion:** `runLeitstandPromote` calls `executeDeployPhases` with main channel, module declares both flags.

**Human review:** no

---

### Step 7. Restore `leitstand.rollback`, `leitstand.status`, `leitstand.health`, `leitstand.pipeline.check`

**Goal:** Restore read-only and rollback commands to real execution.

**Agent actions:**

- `runLeitstandRollback`: After `evaluateRollbackRequest()`, call `adapter.rollback()` with target release dist. Update system-state, bordbuch, effect record.
- `runLeitstandStatus`: Read `lastPropagated` from `system-state.yaml` via `readSystemStateSmart()`. Fall back to effect records.
- `runLeitstandHealth`: Call `adapter.health()` with channel's deployment URL from effect records.
- `runLeitstandPipelineCheck`: Read `DeploymentEffectRecordV1` entries from `systems-cache/{id}/deployment-operations/`. Remove hardcoded `releaseState: "ready"` and all-pending steps. Determine real state from effect records.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes
- Existing tests updated for all 4 commands

**Completion criterion:** All 4 commands execute real logic instead of returning stubs.

**Human review:** no

---

### Step 8. Unit tests

**Goal:** Write unit tests for new commands and shared pipeline, and update existing `src/tests-handoff/` tests to verify real deploy execution instead of stub behavior.

**Agent actions:**

- `certify.test.ts` — mock `ProducerExecutionHandlerV1`, verify gate decision production, conventional path, idempotent overwrite, no-mission skip
- `deploy-execution.test.ts` — mock adapter, verify 13-phase execution order, channel-specific skips (dev: no purge/freshness, alt: Axiom gate, main: main verification), `failingPhase` metadata on failure
- Update existing `src/tests-handoff/leitstand-*.test.ts` tests (0608, 0628, 0649, 0689, 0700, 0652, 0698, 0701) to expect `executeDeployPhases` calls instead of stub returns
- `pipeline-check.test.ts` — verify real effect record reading instead of hardcoded `"ready"`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test` passes

**Completion criterion:** All new and updated tests pass.

**Human review:** no

---

### Step 9. Documentation sync

**Goal:** Synchronize AGENTS.md and Compass docs with restored deploy execution.

**Agent actions:**

- Update `packages/werkstatt/AGENTS.md` — add `leitstand.certify` command to entry points, update deploy pipeline description
- Update `docs/verification-plan.xml` — add deploy execution verification steps (build, wrangler, purge, freshness, health, mission.check, evidence sync, bordbuch, system-state)
- Update `docs/development-plan.xml` — add deploy execution development milestones
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surface changed

**Validation:**

- `git diff` shows all scope.docs files updated
- `pnpm exec werkstatt run rfc.validate --id RFC-0866` passes

**Completion criterion:** All documentation artifacts in scope are updated.

**Human review:** no

---

### Final Step. Code review, fix, acceptance criteria verification, and stamp

**Goal:** Run code review, fix findings, verify all acceptance criteria, stamp RFC as implemented.

**Agent actions:**

- Run `fo-review` via skill tool on all session code changes
- Run `fo-fix` if findings (max 3 iterations)
- Check off all acceptance criteria with inline `(evidence: <file:line>)` annotations
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0866 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- `pnpm exec werkstatt run rfc.validate --id RFC-0866` passes
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All acceptance criteria checked with evidence; RFC stamped as `implemented`.

**Human review:** no — `accepted → implemented` is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0866`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0866` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| 13-phase pipeline complexity | Step 3 extracts shared logic into `deploy-execution.ts` with clear phase boundaries |
| R2 credentials required for alt/main | Step 5-6 reuse existing `verifyDurableSync()` which fails clearly without R2 env vars |
| mission.check timeout (5+ min) | Step 3 reuses `runMissionCheckWithResilience()` with timeout + retry (RFC-0668) |
| Agent confusion (certify before deploy) | Step 9 updates AGENTS.md with new workflow; `--gate-decision` error message guides agents |
| Gate-decision path conflicts with DNA-52 | Step 2 writes to `systems-cache/` not `releases/` (summit A2 fix) |
| Partial failure after wrangler deploy | Step 3 records `failingPhase` in effect record; summit Q1 recovery documented in RFC |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49, DNA-73, or DNA-59, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0866 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `astroCertificationProfile` lacks a producer needed for gate decision production, do not create a new profile — extend the existing profile via a separate RFC.
