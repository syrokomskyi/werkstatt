---
rfcId: RFC-0865
planId: PLAN-RFC-0865-01
status: draft
owner: architecture
createdAt: 2026-08-15
updatedAt:
scope:
  apps: []
  packages:
    - werkstatt
    - werkstatt-site
  services: []
  docs:
    - docs/architecture-dna.md
    - docs/verification-plan.xml
    - docs/development-plan.xml
    - AGENTS.md
    - packages/werkstatt/AGENTS.md
---

# Implementation Plan: RFC-0865

## 1. Objectives

- [ ] O1 — R2 durable storage adapter implements `CertificationStorageAdapterV1` (maps to acceptance criterion: propagate with `durableSyncVerified: true`)
- [ ] O2 — Minimal Astro certification profile registered and validated (maps to acceptance criterion: profile validated via `validateCertificationProfileV1`)
- [ ] O3 — `leitstand.dev-deploy` calls `authorizeDeployment(gate: "dev-deploy")` and deploys only when authorized (maps to acceptance criterion: dev-deploy)
- [ ] O4 — `leitstand.propagate` calls `authorizeDeployment(gate: "propagate-alt")` with R2 durable sync (maps to acceptance criterion: propagate)
- [ ] O5 — `leitstand.promote` calls `authorizeDeployment(gate: "promote-main")` with `verifyMainPromotion()` (maps to acceptance criterion: promote)
- [ ] O6 — `leitstand.status`, `leitstand.health`, `leitstand.pipeline.check` read from `DeploymentOperationState` event chain (maps to acceptance criterion: read-only commands)
- [ ] O7 — `leitstand.rollback` and `release.rollback` use `evaluateRollback()` from `authority.ts` (maps to acceptance criterion: rollback)
- [ ] O8 — `CERT-TRANSITION-01` block removed from all 8 commands; legacy state functions deleted (maps to acceptance criterion: block removed + legacy cleanup)
- [ ] O9 — Documentation synchronized: DNA-49, DNA-73, AGENTS.md, packages/werkstatt/AGENTS.md, Compass XML (maps to acceptance criterion: documentation updates)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/certification/storage/r2-adapter.ts` — **NEW**: R2 durable storage adapter implementing `CertificationStorageAdapterV1`
- `packages/werkstatt/src/certification/profile/astro-profile.ts` — **NEW**: minimal Astro certification profile (`CertificationProfileV1` instance)
- `packages/werkstatt/src/leitstand/leitstand-commands.ts` — rewrite all 7 Leitstand handlers through `authorizeDeployment()`; delete `PIPELINE_STATE_ORDER`, `detectChannelFromState`, `autoStepReleaseState`, `determineNextStep`, `releaseStateIndex`; remove `buildCertificationTransitionBlock` import
- `packages/werkstatt/src/release/release-commands.ts` — rewrite `release.rollback` through `evaluateRollback()`; remove `buildCertificationTransitionBlock` import
- `packages/werkstatt/src/certification/storage/index.ts` — export `createR2StorageAdapter`
- `packages/werkstatt/src/certification/profile/index.ts` — export `astroProfile`
- `packages/werkstatt-site/src/deploy/` — write shared `deployToChannel()` helper (wrangler deploy, cache purge, health check) from scratch (old code deleted in commit `30bc3c6f`); called by dev-deploy, propagate, and promote commands
- Commands changed: `leitstand.dev-deploy`, `leitstand.propagate`, `leitstand.promote`, `leitstand.status`, `leitstand.rollback`, `leitstand.health`, `leitstand.pipeline.check`, `release.rollback`

### 2.2 Configuration and data

- `systems/registry.yaml` — R2 credential injection pattern (existing channel config, no structural change)
- `.env.example` files for services that invoke deployment commands — add `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` documentation

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — update DNA-49 and DNA-73 text: remove "currently blocked with CERT-TRANSITION-01" language
- `AGENTS.md` (root) — update CERT-007 section: remove "blocked" language, reflect unblocked deployment commands
- `packages/werkstatt/AGENTS.md` — update CERT-003 section: remove "No R2 adapter" statement
- `docs/verification-plan.xml` — synchronize with deployment command unblocking
- `docs/development-plan.xml` — synchronize with deployment command unblocking

### 2.4 Validation and pipelines

- `pnpm --filter werkstatt run build:check` — TypeScript compilation
- `pnpm --filter werkstatt run test` — vitest unit tests
- `pnpm --filter werkstatt-site run build:check` — TypeScript compilation
- `pnpm exec werkstatt run rfc.validate --id RFC-0865` — RFC validation
- No pipeline integration changes — deployment commands are operator-invoked, not pipeline-integrated

## 3. Step sequence

### Step 1. R2 durable storage adapter

**Goal:** Implement `createR2StorageAdapter()` that implements the existing `CertificationStorageAdapterV1` interface from `packages/werkstatt/src/certification/storage/adapter.ts:21-27`.

**Agent actions:**

- Create `packages/werkstatt/src/certification/storage/r2-adapter.ts`
- Implement `putObject(input: StoragePutInputV1)`: content-addressed (digest-keyed) upload to R2 bucket
- Implement `headObject(digest: Sha256Digest)`: check existence by content hash
- Implement `getObject(digest: Sha256Digest)`: retrieve by content hash
- Implement `appendAuditRecord(record: Uint8Array)`: append to audit log
- Use `fetch()` for R2 S3-compatible API calls (no SDK dependency — engine is stack-agnostic)
- Read credentials from config object (`accountId`, `accessKeyId`, `secretAccessKey`, `bucketName`)
- Export from `packages/werkstatt/src/certification/storage/index.ts`
- Write unit tests in `packages/werkstatt/src/certification/storage/tests/r2-adapter.test.ts` using mocked `fetch`

**Validation:**

- `pnpm --filter werkstatt run build:check`
- `pnpm --filter werkstatt run test -- --reporter=verbose packages/werkstatt/src/certification/storage/tests/r2-adapter.test.ts`

**Completion criterion:** `createR2StorageAdapter()` returns an object satisfying `CertificationStorageAdapterV1`; unit tests pass with mocked R2 API; `build:check` passes.

**Human review:** no

---

### Step 2. Minimal Astro certification profile

**Goal:** Create and validate a minimal `CertificationProfileV1` instance for the Astro stack with producers and requirements sufficient for the dev-deploy gate.

**Agent actions:**

- Create `packages/werkstatt/src/certification/profile/astro-profile.ts` exporting `astroProfile: CertificationProfileV1`
- Profile must match schema at `packages/werkstatt/src/certification/profile/schemas.ts:223-240`:
  - `schema: "werkstatt/certification-profile@1"`
  - `id: "astro-site-profile"`
  - `plugin: { id: "werkstatt-site", profileId: "astro-typescript-turborepo" }`
  - All 9 dimensions listed
  - Producers: `axiom-checks` (kernel-command), `site-smoke` (kernel-command), `site-e2e` (kernel-command)
  - Requirements: at least one mandatory requirement per dimension for dev-deploy gate
  - `evaluatorPolicy` and `retentionPolicy` filled
- Validate with `validateCertificationProfileV1(astroProfile, ctx)` where `ctx` has `pluginId: "werkstatt-site"`, `profileId: "astro-typescript-turborepo"`, `registeredCommands` including producer commands
- Export from `packages/werkstatt/src/certification/profile/index.ts`
- Write validation test in `packages/werkstatt/src/certification/profile/tests/astro-profile.test.ts`

**Validation:**

- `pnpm --filter werkstatt run build:check`
- `pnpm --filter werkstatt run test -- --reporter=verbose packages/werkstatt/src/certification/profile/tests/astro-profile.test.ts`

**Completion criterion:** `validateCertificationProfileV1(astroProfile, ctx).valid === true`; `build:check` passes.

**Human review:** no

---

### Step 3. `leitstand.dev-deploy` through `authorizeDeployment()`

**Goal:** Rewrite `runLeitstandDevDeploy` to call `authorizeDeployment(gate: "dev-deploy")` as a mandatory gate before executing deploy logic.

**Agent actions:**

- Remove `buildCertificationTransitionBlock` import from `leitstand-commands.ts`
- Import `authorizeDeployment` from `../certification/deployment/authority.ts`
- Import `evaluateCertificationDecision` from `../certification/aggregation.ts`
- Import `astroProfile` from `../certification/profile/astro-profile.ts`
- Build `CertificationPolicyBundleV1` from the profile (resolve requirements for dev-deploy gate)
- Run orchestrator: `planProducers()` → `executeProducers()` → collect evidence
- Call `evaluateCertificationDecision()` to get gate status
- Build `GateDecisionV1` from evaluation result
- Call `authorizeDeployment({ candidateId, gate: "dev-deploy", gateDecision, durableSyncVerified: false, artifactReadinessVerified: true, artifactHash, ... })`
- If `!result.ok`, return `{ exitCode: 1, diagnostics: [{ ruleId: result.ruleId, ... }] }`
- If `result.authorized`, execute deploy logic (wrangler deploy, cache purge, health check, smoke test)
- Write deploy logic from scratch in `packages/werkstatt-site/src/deploy/` — do NOT copy from git history
- Write unit test in `packages/werkstatt/src/leitstand/tests/leitstand-dev-deploy.test.ts`

**Validation:**

- `pnpm --filter werkstatt run build:check`
- `pnpm --filter werkstatt run test -- --reporter=verbose packages/werkstatt/src/leitstand/tests/leitstand-dev-deploy.test.ts`
- `grep -r "buildCertificationTransitionBlock" packages/werkstatt/src/leitstand/` returns zero matches

**Completion criterion:** `leitstand.dev-deploy` calls `authorizeDeployment(gate: "dev-deploy")`; deploy executes only when `authorized: true`; unit test passes; `build:check` passes.

**Human review:** no

---

### Step 4. `leitstand.propagate` through `authorizeDeployment()` with R2 durable sync

**Goal:** Rewrite `runLeitstandPropagate` to call `authorizeDeployment(gate: "propagate-alt")` with `durableSyncVerified: true` via R2 adapter.

**Agent actions:**

- Import `createR2StorageAdapter` from `../certification/storage/r2-adapter.ts`
- Create R2 adapter instance from `systems/registry.yaml` channel config
- Verify durable sync: `verifyStoredObject(adapter, dossierRootHash)` — check `ok && verified`
- Build `GateDecisionV1` for alt gate
- Call `authorizeDeployment({ gate: "propagate-alt", durableSyncVerified: true, ... })`
- If authorized, execute Alt deploy logic (wrangler deploy to alt channel, cache purge, health check)
- Write unit test in `packages/werkstatt/src/leitstand/tests/leitstand-propagate.test.ts`

**Validation:**

- `pnpm --filter werkstatt run build:check`
- `pnpm --filter werkstatt run test -- --reporter=verbose packages/werkstatt/src/leitstand/tests/leitstand-propagate.test.ts`

**Completion criterion:** `leitstand.propagate` calls `authorizeDeployment(gate: "propagate-alt")` with `durableSyncVerified: true`; unit test passes; `build:check` passes.

**Human review:** no

---

### Step 5. `leitstand.promote` through `authorizeDeployment()` with main verification

**Goal:** Rewrite `runLeitstandPromote` to call `authorizeDeployment(gate: "promote-main")` with `requiresMainVerification: true` via `verifyMainPromotion()`.

**Agent actions:**

- Import `verifyMainPromotion` from `../certification/deployment/authority.ts`
- Build `GateDecisionV1` for main gate
- Call `verifyMainPromotion()` for main verification
- Call `authorizeDeployment({ gate: "promote-main", ... })`
- If authorized, execute Main deploy logic (wrangler deploy to main channel, cache purge, health check)
- Write unit test in `packages/werkstatt/src/leitstand/tests/leitstand-promote.test.ts`

**Validation:**

- `pnpm --filter werkstatt run build:check`
- `pnpm --filter werkstatt run test -- --reporter=verbose packages/werkstatt/src/leitstand/tests/leitstand-promote.test.ts`

**Completion criterion:** `leitstand.promote` calls `authorizeDeployment(gate: "promote-main")` with `requiresMainVerification: true`; unit test passes; `build:check` passes.

**Human review:** no

---

### Step 6. Read-only commands: `leitstand.status`, `leitstand.health`, `leitstand.pipeline.check`

**Goal:** Restore read-only commands to read from `DeploymentOperationState` event chain instead of legacy release state.

**Agent actions:**

- Rewrite `runLeitstandStatus` to read deployment status from `DeploymentOperationState` events
- Rewrite `runLeitstandHealth` to run health checks against deployed channel URL
- Rewrite `runLeitstandPipelineCheck` to inspect `DeploymentOperationState` event chain
- Delete `PIPELINE_STATE_ORDER` array (line 951-958)
- Delete `detectChannelFromState()` function (line 870-876)
- Delete `autoStepReleaseState()` function (line 878-882)
- Delete `determineNextStep()` function (line 965-983)
- Delete `releaseStateIndex()` function (line 960-963)
- Write unit tests for all three commands

**Validation:**

- `pnpm --filter werkstatt run build:check`
- `pnpm --filter werkstatt run test`
- `grep -r "PIPELINE_STATE_ORDER\|detectChannelFromState\|autoStepReleaseState\|determineNextStep\|releaseStateIndex" packages/werkstatt/src/leitstand/leitstand-commands.ts` returns zero matches

**Completion criterion:** All three read-only commands return deployment status from `DeploymentOperationState`; legacy state functions deleted; unit tests pass; `build:check` passes.

**Human review:** no

---

### Step 7. Rollback commands: `leitstand.rollback` and `release.rollback`

**Goal:** Rewrite rollback commands through `evaluateRollback()` from `authority.ts`.

**Agent actions:**

- Rewrite `runLeitstandRollback` to call `evaluateRollback()` from `../certification/deployment/authority.ts`
- Rewrite `runReleaseRollback` to call `evaluateRollback()`
- Remove `buildCertificationTransitionBlock` import from `release-commands.ts`
- Write unit tests for both rollback commands

**Validation:**

- `pnpm --filter werkstatt run build:check`
- `pnpm --filter werkstatt run test`
- `grep -r "buildCertificationTransitionBlock" packages/werkstatt/src/release/` returns zero matches

**Completion criterion:** Both rollback commands call `evaluateRollback()`; `buildCertificationTransitionBlock` not imported in `release-commands.ts`; unit tests pass; `build:check` passes.

**Human review:** no

---

### Step 8. Documentation synchronization

**Goal:** Update all documentation artifacts to reflect unblocked deployment commands.

**Agent actions:**

- Update `docs/architecture-dna.md` DNA-49: remove "currently blocked with CERT-TRANSITION-01 until CERT-007 reconnects them" — replace with "connected to CERT-007 deployment authority via `authorizeDeployment()`"
- Update `docs/architecture-dna.md` DNA-73: remove "All site deployment commands are currently blocked with CERT-TRANSITION-01 until CERT-007" — replace with "All site deployment commands call `authorizeDeployment()` as a mandatory gate"
- Update `AGENTS.md` (root) CERT-007 section: remove "blocked" language, reflect unblocked deployment commands
- Update `packages/werkstatt/AGENTS.md` CERT-003 section: remove "No R2 adapter" statement, add "R2 adapter implemented in `storage/r2-adapter.ts`"
- Update `docs/verification-plan.xml`: synchronize deployment command verification with unblocked status
- Update `docs/development-plan.xml`: synchronize deployment command development plan with unblocked status
- Add R2 credential documentation to relevant `.env.example` files

**Validation:**

- `git diff --name-only` shows all scope.docs files modified
- `pnpm exec werkstatt run rfc.validate --id RFC-0865`

**Completion criterion:** All files in `scope.docs` are updated; `rfc.validate` passes.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0865 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0865`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0865`
- `pnpm --filter werkstatt run build:check`
- `pnpm --filter werkstatt-site run build:check`
- `pnpm --filter werkstatt run test`
- `pnpm --filter werkstatt-site run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0865` in the subject line (RFC-0265 commit hygiene)
- Unit test files proving `authorizeDeployment()` is called in each command handler
- `grep` output proving `buildCertificationTransitionBlock` is not imported in leitstand/release command files
- `grep` output proving legacy state functions are deleted

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Restoring 2123 lines of deploy logic | Step 3-5: 5-step rollout, each with unit tests; deploy logic written from scratch, not copied |
| R2 adapter as new I/O surface | Step 1: adapter uses `fetch()` with retry/backoff; credentials from `systems/registry.yaml`; unit tests with mocked `fetch` |
| Certification profile false-positive/negative | Step 2: minimal profile for dev-deploy gate; validated via `validateCertificationProfileV1` |
| Agent misinterpretation | Step 3-7: `authorizeDeployment()` returns structured `CERT-DEPLOY-01..09` diagnostics; implementation notes in RFC |
| `leitstand.status`/`leitstand.health` stale data | Step 6: read from `DeploymentOperationState` event chain, not legacy release state |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49 or DNA-73, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0865 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `CertificationProfileV1` schema cannot accommodate the minimal Astro profile, run `rfc.supersede.propose` against the profile schema RFC instead of modifying the schema in this RFC.
- If `authorizeDeployment()` API does not match the Leitstand command's needs, run `rfc.supersede.propose` against CERT-007 instead of bypassing the authority.
