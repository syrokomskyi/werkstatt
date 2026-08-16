---
rfcId: RFC-0867
planId: PLAN-RFC-0867-01
status: draft
owner: architecture
createdAt: 2026-08-16
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
  services: []
  docs:
    - docs/rfcs/rfc-0867-cache-certification-evidence-by-artifact-hash.md
---

# Implementation Plan: RFC-0867

## 1. Objectives

- [ ] Objective 1 — Add `tryReuseEvidence` function that scans prior gate-decision JSONs for matching `policyBundleRoot` and reads the evidence sidecar — maps to acceptance criterion "tryReuseEvidence function implemented"
- [ ] Objective 2 — Write evidence sidecar `{release}-evidence.json` after producer execution — maps to acceptance criterion "Evidence sidecar written after producer execution"
- [ ] Objective 3 — Add `--force` flag to `leitstand.certify` command registration — maps to acceptance criterion "--force flag added"
- [ ] Objective 4 — Update `reads` field to include `gate-decisions/**` — maps to acceptance criterion "reads field includes gate-decisions/**"
- [ ] Objective 5 — Skip producer execution when evidence is reused, still write per-gate gate-decision JSON — maps to acceptance criteria "subsequent gate certifications skip producer execution" and "Gate-decision JSON still written per gate"
- [ ] Objective 6 — Handle failure modes: stale evidence, missing sidecar, `--force` — maps to acceptance criteria "Stale evidence not reused", "Missing evidence sidecar falls through", "Concurrent certification rejected by gate lock"
- [ ] Objective 7 — Unit tests for all 4 reuse scenarios — maps to acceptance criteria "Unit test: same/different hash, --force, stale evidence"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/leitstand/certify.ts` — add `tryReuseEvidence` function, evidence sidecar write logic, `--force` flag parsing, reuse log message
- `packages/werkstatt/src/leitstand/leitstand.module.ts` — add `force` flag to `leitstand.certify` command registration, update `reads` to include `gate-decisions/**`

### 2.2 Configuration and data

- `systems-cache/{system}/gate-decisions/{release}-evidence.json` — new sidecar file (written at runtime, not checked in)

### 2.3 Documentation and specs

- RFC file (read-only reference)
- No AGENTS.md updates needed — change is internal to certify command
- No Compass XML updates needed — no repository-wide semantics changed
- No `docs/architecture-dna.md` updates needed — no new DNA invariant

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck
- `pnpm --filter @warpgogol/werkstatt run test` — unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0867` — RFC validation

## 3. Step sequence

### Step 1. Add `tryReuseEvidence` function and evidence sidecar types

**Goal:** Implement the core reuse logic that scans prior gate-decision JSONs and reads the evidence sidecar.

**Agent actions:**

- Add `EvidenceCacheEntry` interface to `certify.ts` with `artifactHash`, `evidence`, `producedAt`, `freshnessExpiresAt`, `sourceGate` fields
- Add `tryReuseEvidence(cacheCloneDir, releaseId, artifactHash, forceRequested)` function:
  - If `forceRequested`, return `null`
  - Scan `gate-decisions/{releaseId}-*.json` files (excluding `{releaseId}-evidence.json` and `{releaseId}-main-verification.json`)
  - Parse each as `GateDecisionV1`, check `policyBundleRoot` matches `artifactHash`
  - For matching gate-decision, read `gate-decisions/{releaseId}-evidence.json` sidecar
  - Parse sidecar, check `artifactHash` matches
  - Check each evidence envelope's `freshness.expiresAt` has not passed
  - Return first non-stale `EvidenceCacheEntry` or `null`
- Add `EvidenceCacheSidecar` interface with `schema`, `releaseId`, `artifactHash`, `evidence`, `producedAt`, `producedByGate` fields

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes

**Completion criterion:** `tryReuseEvidence` function exists, is typed, and typecheck passes

**Human review:** no

---

### Step 2. Write evidence sidecar after producer execution

**Goal:** Persist the full `EvidenceEnvelopeV1[]` array to a sidecar file so subsequent gates can reuse it.

**Agent actions:**

- In `runLeitstandCertify`, after `executeProducers` returns successfully and before writing the gate-decision JSON:
  - Write `gate-decisions/{releaseId}-evidence.json` with `EvidenceCacheSidecar` schema containing `execResult.evidence`
  - Use `writeFileIfChanged` for the write
  - Add the sidecar to the git add + commit + push block (alongside the gate-decision JSON)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes

**Completion criterion:** Evidence sidecar is written after producer execution, committed to cache clone git

**Human review:** no

---

### Step 3. Integrate `tryReuseEvidence` into `runLeitstandCertify`

**Goal:** When evidence is reused, skip producer execution and use the cached evidence for `evaluateCertificationDecision`.

**Agent actions:**

- After resolving `artifactHash` and `cacheCloneDir`, before `planProducers`:
  - Parse `--force` flag from input
  - Call `tryReuseEvidence(cacheCloneDir, releaseId, artifactHash, forceRequested)`
  - If reuse entry is returned:
    - Log `[leitstand.certify] reusing evidence from {sourceGate} gate (artifact hash match)`
    - Skip `planProducers` + `executeProducers`
    - Use `reuseEntry.evidence` directly in `evaluateCertificationDecision`
    - Still write the per-gate gate-decision JSON with a new `decisionId`
    - Still write `MainVerificationDecisionV1` if gate=main and status=pass
    - Do NOT overwrite the evidence sidecar (it already exists from the prior gate)
  - If reuse entry is `null`, proceed with normal producer execution (existing flow)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes

**Completion criterion:** Reuse path skips producers, uses cached evidence, still writes per-gate gate-decision JSON

**Human review:** no

---

### Step 4. Update command registration in `leitstand.module.ts`

**Goal:** Add `--force` flag and update `reads` field.

**Agent actions:**

- Add `force` flag to `leitstand.certify` command registration:
  ```ts
  force: {
    kind: "boolean",
    description: "Bypass evidence cache and re-execute producers.",
  },
  ```
- Update `reads` to include `"systems-cache/{system}/gate-decisions/**"`
- Update `writes` to include `"systems-cache/{system}/gate-decisions/**"` (already present, verify)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes

**Completion criterion:** `--force` flag registered, `reads` includes `gate-decisions/**`

**Human review:** no

---

### Step 5. Unit tests

**Goal:** Test all 4 reuse scenarios plus the missing-sidecar edge case.

**Agent actions:**

- Create `packages/werkstatt/src/tests-handoff/leitstand-0867-evidence-reuse.test.ts`
- Test 1: same artifact hash → evidence reused (write prior gate-decision + sidecar, call certify, verify producer not executed, verify gate-decision written with new decisionId)
- Test 2: different artifact hash → producers execute (write prior gate-decision with different `policyBundleRoot`, verify producer executes)
- Test 3: `--force` → producers execute even with matching hash (write prior gate-decision + sidecar, pass `force: true`, verify producer executes)
- Test 4: stale evidence → producers execute (write prior gate-decision + sidecar with `freshness.expiresAt` in the past, verify producer executes)
- Test 5: missing evidence sidecar → producers execute (write prior gate-decision but no sidecar, verify producer executes, no error)
- Mock `executeKernelCommand` to prevent real `mission.check` execution
- Use temp directories for `cacheCloneDir` with `gate-decisions/` subdirectory

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test` — all tests pass

**Completion criterion:** 5 unit tests pass, covering all acceptance criteria test items

**Human review:** no

---

### Step 6. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify no AGENTS.md updates needed (change is internal to certify command)
- Verify no Compass XML updates needed (no repository-wide semantics changed)
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (the `--force` flag is a new flag on an existing command — regenerate to update the manifest)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`
- **Check off acceptance criteria:** verify each criterion against the implemented code. Mark `[x]` with inline `(evidence: <file:line>, <test-or-command>)` annotations
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0867 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from this session
- `pnpm exec werkstatt run rfc.validate --id RFC-0867`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with evidence annotations; RFC stamped as `implemented` via `rfc.implement.stamp`

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0867`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0867` in the subject line
- Unit test file `leitstand-0867-evidence-reuse.test.ts` as evidence of acceptance criteria

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Stale evidence risk — dev deployment changes between gates | Step 1: `tryReuseEvidence` checks `freshness.expiresAt` on each evidence envelope; stale evidence falls through to producer execution |
| Agent confusion — second gate is faster | Step 3: log message `[leitstand.certify] reusing evidence from {sourceGate} gate (artifact hash match)` |
| Missing evidence sidecar — gate-decision exists but no sidecar | Step 1: `tryReuseEvidence` returns `null` when sidecar is missing or malformed; producers execute normally |
| Concurrent certification — two agents certify same release+gate | Step 3: reuse path is protected by the existing gate lock manager (CERT-ORCHESTRATOR-03) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-59 or DNA-49, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0867 --reason "..." --invariant "DNA-N"` instead of working around it.
