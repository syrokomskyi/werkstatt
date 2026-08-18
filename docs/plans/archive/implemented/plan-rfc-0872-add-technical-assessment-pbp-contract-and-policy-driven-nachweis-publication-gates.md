---
rfcId: RFC-0872
planId: PLAN-RFC-0872-01
status: draft
owner: architecture
createdAt: 2026-08-18
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/werkstatt"
    - "@warpgogol/werkstatt-site"
    - "@warpgogol/werkstatt-shared"
  services: []
  docs:
    - packages/werkstatt/AGENTS.md
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0872

## 1. Objectives

- [ ] O1 — Add `technical-assessment` to `PbpEvidenceKind` and extend `PbpEvidenceSource` with artifact roles and `assessment` field — maps to acceptance criteria [Technical assessment validates without a Consent entity] and [Technical assessment validates without a public PDF derivative]
- [ ] O2 — Implement policy-driven gate V2 with `resolveNachweisPublicationPolicy` and `evaluateGateV2` — maps to [Gate output is policy-aware and tri-state] and [not_applicable never satisfies a condition marked required: true]
- [ ] O3 — Replace legacy gate in `nachweis.validate` and `nachweis.publish` with V2 — maps to [Existing attestation fixtures produce the same publish/pass/fail outcomes as before]
- [ ] O4 — Add assessment validation invariants (metadata, canonical raw, locale drift) — maps to [Technical assessment cannot publish without canonical raw-result hash] and [Locale assessment drift fails]
- [ ] O5 — Amend `nachweis.withdraw` to skip consent for technical/operational kinds — maps to [Technical withdrawal does not alter Consent]
- [ ] O6 — Extend `NachweisManifestEntry` with observation identity fields — maps to [Manifest includes technical observation identity]
- [ ] O7 — Ensure build output remains deterministic — maps to [Build output remains deterministic]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/domain/pbp/entities/evidence-source.ts` — extend `PbpEvidenceKind`, add `PbpEvidenceArtifactRole`, extend `PbpEvidenceSource.items`, add `assessment` field
- `packages/werkstatt-site/src/domain/pbp/schemas/evidence-source.ts` — extend Zod schema
- `packages/werkstatt-site/src/domain/pbp/index.ts` — export new types
- `packages/werkstatt-site/src/domain/share/astro/nachweis-routes.ts` — extend `NACHWEIS_EVIDENCE_KINDS`
- `packages/werkstatt/src/nachweis/nachweis-io.ts` — add V2 gate types, policy resolution, extend manifest entry, replace legacy gate interface
- `packages/werkstatt/src/nachweis/nachweis-validate.ts` — replace `evaluateGate` with V2, extend `NACHWEIS_EVIDENCE_KINDS`, add assessment validation, locale drift check
- `packages/werkstatt/src/nachweis/nachweis-publish.ts` — replace inline gate with V2
- `packages/werkstatt/src/nachweis/nachweis-withdraw.ts` — conditional consent revocation
- `packages/werkstatt/src/nachweis/nachweis-manifest.ts` — extend `NACHWEIS_EVIDENCE_KINDS`, add observation identity fields
- `packages/werkstatt/src/nachweis/nachweis.module.ts` — update command descriptions

### 2.2 Configuration and data

- No YAML/JSON config changes. Evidence-source frontmatter gains new optional fields.

### 2.3 Documentation and specs

- `packages/werkstatt/AGENTS.md` — note new `technical-assessment` kind and V2 gate in nachweis section
- `packages/werkstatt-site/AGENTS.md` — note new `PbpEvidenceKind` value and assessment contract in PBP domain section

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/werkstatt run test` — vitest unit tests
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/werkstatt-site run test` — vitest unit tests

## 3. Step sequence

### Step 1. Extend PBP evidence-source types and schemas

**Goal:** Add `technical-assessment` kind, artifact roles, and `NachweisTechnicalAssessmentV1` interface to the PBP domain.

**Agent actions:**

- Edit `packages/werkstatt-site/src/domain/pbp/entities/evidence-source.ts`:
  - Add `"technical-assessment"` to `PbpEvidenceKind` union and `PBP_EVIDENCE_KINDS` array
  - Add `PbpEvidenceArtifactRole` type (`"raw-result" | "report" | "screenshot" | "summary" | "methodology"`)
  - Extend `PbpEvidenceSource.items` with `role?: PbpEvidenceArtifactRole` and `canonical?: boolean`
  - Add `NachweisAssessmentExecutionMode`, `NachweisAssessmentAuthorizationBasis`, `NachweisAssessmentDimensionStatus`, `NachweisAssessmentProvider`, `NachweisAssessmentTool`, `NachweisAssessmentMethodology`, `NachweisAssessmentDimension`, `NachweisTechnicalAssessmentV1` interfaces
  - Add `assessment?: NachweisTechnicalAssessmentV1` to `PbpEvidenceSource`
- Edit `packages/werkstatt-site/src/domain/pbp/schemas/evidence-source.ts`:
  - Add `"technical-assessment"` to `pbpEvidenceKindSchema` enum
  - Add `role` and `canonical` to items Zod schema
  - Add `assessmentSchema` with all nested objects
- Edit `packages/werkstatt-site/src/domain/pbp/index.ts`:
  - Export `PbpEvidenceArtifactRole`, `NachweisTechnicalAssessmentV1`, and all assessment sub-types

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — compiles without errors

**Completion criterion:** TypeScript compiles; new types are exported from barrel; Zod schema accepts `technical-assessment` kind with `assessment` and `items[].role`/`items[].canonical`.

**Human review:** no

---

### Step 2. Add V2 gate types and policy resolution to nachweis-io.ts

**Goal:** Define `NachweisPublicationGateV2`, `NachweisGateConditionResult`, `NachweisPublicationPolicyId`, `resolveNachweisPublicationPolicy`, and `UnsupportedNachweisKindError` in the I/O layer.

**Agent actions:**

- Edit `packages/werkstatt/src/nachweis/nachweis-io.ts`:
  - Add `NachweisPublicationPolicyId` type (`"attestation-v1" | "operational-measurement-v1" | "technical-assessment-v1"`)
  - Add `GateStatus` type (`"pass" | "fail" | "not_applicable"`)
  - Add `NachweisGateConditionResult` interface
  - Add `NachweisPublicationGateV2` interface
  - Add `UnsupportedNachweisKindError` class
  - Add `resolveNachweisPublicationPolicy(kind: PbpEvidenceKind): NachweisPublicationPolicyId` function
  - Replace `NachweisPublicationGate` with `NachweisPublicationGateV2` in `NachweisValidateResult` and `NachweisPublishResult`
  - Extend `NachweisManifestEntry` with optional `kind`, `seriesId`, `observationId`, `observedAt`, `assessmentProviderId`
  - Update `CHANGE_SUMMARY` with RFC-0872 entry

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — compiles without errors

**Completion criterion:** TypeScript compiles; `resolveNachweisPublicationPolicy` returns correct policy for each kind; unsupported kinds throw `UnsupportedNachweisKindError`.

**Human review:** no

---

### Step 3. Implement evaluateGateV2 and assessment validation in nachweis-validate.ts

**Goal:** Replace legacy `evaluateGate` with policy-driven `evaluateGateV2`, add assessment metadata validation, canonical artifact checks, and locale drift detection.

**Agent actions:**

- Edit `packages/werkstatt/src/nachweis/nachweis-validate.ts`:
  - Add `"technical-assessment"` to `NACHWEIS_EVIDENCE_KINDS` set
  - Replace `evaluateGate` function with `evaluateGateV2` that:
    - Calls `resolveNachweisPublicationPolicy(kind)` to get policy ID
    - Evaluates 9 conditions per the gate matrix, returning `NachweisGateConditionResult[]`
    - Sets `allPassed = conditions.every(c => !c.required || c.status === "pass")`
  - Add assessment validation invariants:
    - `TECHNICAL_ASSESSMENT_METADATA_REQUIRED` — kind is `technical-assessment` but no `assessment` field
    - `TECHNICAL_ASSESSMENT_CANONICAL_RAW_REQUIRED` — no item with `role: raw-result` and `canonical: true`
    - `TECHNICAL_ASSESSMENT_HASH_REQUIRED` — canonical item missing `sha256`
    - `ASSESSMENT_AUTHORIZATION_REQUIRED` — measurement policy lacks `authorizationBasis`
    - Validate `assessment.profile === "technical-assessment"`, non-empty `seriesId`/`observationId`, valid ISO 8601 `observedAt`, `methodology.runCount >= 1`, `freshness.maxAgeDays >= 1`, non-empty `dimensions`, score in `[0,100]`, numerator/denominator pair validity, samples in `[0,100]`, min/max matching sample extrema, HTTPS `providerReportUrl`
    - Validate `assessment` is absent when `kind !== "technical-assessment"`
  - Add locale drift check:
    - Read evidence-source entities from ALL locale directories (not just default lang)
    - For each `observationId`, compare `assessment` values using `snapshotCanonicalJsonObjectV1` + `canonicalJsonHashV1` from `@warpgogol/werkstatt/fingerprint`
    - Emit `TECHNICAL_ASSESSMENT_LOCALE_DRIFT` violation on hash mismatch
  - Update `NachweisValidateResult.gateResults` type to `NachweisPublicationGateV2[]`
  - Update `CHANGE_SUMMARY` with RFC-0872 entry

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — compiles without errors

**Completion criterion:** TypeScript compiles; `evaluateGateV2` returns correct conditions per policy; assessment validation invariants produce correct violation codes; locale drift check uses `snapshotCanonicalJsonObjectV1`.

**Human review:** no

---

### Step 4. Replace inline gate in nachweis-publish.ts with V2

**Goal:** Update `nachweis.publish` to use policy-driven gate evaluation.

**Agent actions:**

- Edit `packages/werkstatt/src/nachweis/nachweis-publish.ts`:
  - Replace inline gate evaluation (lines 111-137) with `resolveNachweisPublicationPolicy` + `evaluateGateV2`
  - Update `NachweisPublishResult.gateResult` type to `NachweisPublicationGateV2`
  - Update gate-failed summary to include `policyId` and failed condition IDs
  - Update `CHANGE_SUMMARY` with RFC-0872 entry

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — compiles without errors

**Completion criterion:** TypeScript compiles; `nachweis.publish` uses V2 gate; gate-failed output includes policy ID and condition details.

**Human review:** no

---

### Step 5. Amend nachweis-withdraw.ts for policy-driven consent handling

**Goal:** Make consent revocation and `nachweis-consent` Bordbuch entry conditional on the evidence kind's policy.

**Agent actions:**

- Edit `packages/werkstatt/src/nachweis/nachweis-withdraw.ts`:
  - Read the evidence-source `kind` field
  - Call `resolveNachweisPublicationPolicy(kind)` to determine policy
  - For `attestation-v1`: keep existing behavior (revoke consent, append `nachweis-consent` Bordbuch entry)
  - For `operational-measurement-v1` and `technical-assessment-v1`: skip consent revocation entirely, do NOT append `nachweis-consent` Bordbuch entry, only append `nachweis-record` withdrawal event
  - Update `CHANGE_SUMMARY` with RFC-0872 entry

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — compiles without errors

**Completion criterion:** TypeScript compiles; withdraw skips consent for technical/operational kinds; attestation behavior unchanged.

**Human review:** no

---

### Step 6. Extend nachweis-manifest.ts with observation identity fields

**Goal:** Add `kind`, `seriesId`, `observationId`, `observedAt`, `assessmentProviderId` to manifest entries for technical assessments.

**Agent actions:**

- Edit `packages/werkstatt/src/nachweis/nachweis-manifest.ts`:
  - Add `"technical-assessment"` to `NACHWEIS_EVIDENCE_KINDS` set
  - For each published record, read `kind`, `assessment.seriesId`, `assessment.observationId`, `assessment.observedAt`, `assessment.provider.id` from the evidence-source entity
  - For technical assessments, these fields are required in the manifest entry
  - For attestations, these fields are omitted (undefined)
  - Do NOT compute a build-time `fresh/stale` boolean — publish `observedAt` and `freshness.maxAgeDays` only
  - Update `CHANGE_SUMMARY` with RFC-0872 entry

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — compiles without errors

**Completion criterion:** TypeScript compiles; manifest includes observation identity for technical assessments; no `fresh/stale` boolean computed.

**Human review:** no

---

### Step 7. Update nachweis-routes.ts and nachweis.module.ts

**Goal:** Extend the routing layer and module descriptions for the new evidence kind.

**Agent actions:**

- Edit `packages/werkstatt-site/src/domain/share/astro/nachweis-routes.ts`:
  - Add `"technical-assessment"` to `NACHWEIS_EVIDENCE_KINDS` set
- Edit `packages/werkstatt/src/nachweis/nachweis.module.ts`:
  - Update `nachweis.validate` description to mention policy-driven gates
  - Update `nachweis.publish` description to mention policy-driven gates
  - Update `nachweis.withdraw` description to mention policy-driven consent handling
  - Update `CHANGE_SUMMARY` with RFC-0872 entry

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — compiles without errors
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — compiles without errors

**Completion criterion:** Both packages compile; `NACHWEIS_EVIDENCE_KINDS` includes `technical-assessment` in all 3 locations.

**Human review:** no

---

### Step 8. Write unit tests

**Goal:** Add unit tests for all new validation rules, policy resolution, gate V2, withdraw behavior, and manifest extension.

**Agent actions:**

- Add test file `packages/werkstatt/src/nachweis/__tests__/nachweis-policy.test.ts`:
  - Test `resolveNachweisPublicationPolicy` for all kinds
  - Test `UnsupportedNachweisKindError` for non-Nachweis kinds
  - Test `evaluateGateV2` for each policy (attestation-v1, operational-measurement-v1, technical-assessment-v1)
  - Test `not_applicable` never satisfies `required: true`
  - Test `allPassed` logic (all required conditions must be `pass`)
- Add tests to existing `nachweis-validate.test.ts` (or create if not exists):
  - Test `TECHNICAL_ASSESSMENT_METADATA_REQUIRED` violation
  - Test `TECHNICAL_ASSESSMENT_CANONICAL_RAW_REQUIRED` violation
  - Test `TECHNICAL_ASSESSMENT_HASH_REQUIRED` violation
  - Test `TECHNICAL_ASSESSMENT_LOCALE_DRIFT` violation
  - Test `ASSESSMENT_AUTHORIZATION_REQUIRED` violation
  - Test assessment field validation (ISO 8601, runCount, maxAgeDays, dimensions, scores, numerator/denominator, samples, min/max, HTTPS)
  - Test `assessment` absent for non-technical kinds
  - Test existing attestation fixtures produce same outcomes (regression)
- Add tests for `nachweis-withdraw.ts`:
  - Test technical assessment withdrawal does not revoke consent
  - Test technical assessment withdrawal does not append `nachweis-consent` Bordbuch entry
  - Test attestation withdrawal still revokes consent (regression)
- Add tests for `nachweis-manifest.ts`:
  - Test manifest includes `kind`, `seriesId`, `observationId`, `observedAt`, `assessmentProviderId` for technical assessments
  - Test manifest omits these fields for attestations
  - Test no `fresh/stale` boolean in manifest
- Add tests for Zod schema in `packages/werkstatt-site/src/domain/pbp/schemas/__tests__/`:
  - Test `evidenceSourceSchema` accepts `technical-assessment` kind with assessment
  - Test schema rejects `assessment` on non-technical kinds
  - Test schema accepts artifact role and canonical fields

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test` — all tests pass
- `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass

**Completion criterion:** All tests pass; regression tests confirm existing attestation behavior unchanged; all new validation rules have test coverage.

**Human review:** no

---

### Step 9. Update AGENTS.md files

**Goal:** Document the new evidence kind and V2 gate in package-level AGENTS.md files.

**Agent actions:**

- Edit `packages/werkstatt/AGENTS.md` — add note in nachweis section about `technical-assessment` kind, policy-driven gates, and V2 gate interface
- Edit `packages/werkstatt-site/AGENTS.md` — add note in PBP domain section about `technical-assessment` kind and `NachweisTechnicalAssessmentV1` contract

**Validation:**

- Visual inspection — both files updated with relevant notes

**Completion criterion:** Both AGENTS.md files mention the new kind and V2 gate.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0872` — must pass with 0 errors.
- Run `pnpm --filter @warpgogol/werkstatt run build:check` — must pass.
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — must pass.
- Run `pnpm --filter @warpgogol/werkstatt run test` — all tests pass.
- Run `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass.
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0872 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0872`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0872`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0872` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Agent misinterpretation — fabricating Consent for technical assessments | Step 8 tests assert Consent is not required; Step 9 AGENTS.md notes forbid it |
| False-positive locale drift | Step 3 uses `snapshotCanonicalJsonObjectV1` (RFC-0849) for key-order invariant comparison; Step 8 tests verify |
| Provider schema drift | `NachweisTechnicalAssessmentV1` is normalized profile, not raw dump; provider adapters are nonGoals |
| Security/privacy — `providerReportUrl` | Step 3 validation enforces HTTPS; content author responsibility |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46, DNA-53, or DNA-59, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0872 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the locale drift check cannot use `snapshotCanonicalJsonObjectV1` due to import restrictions (engine/site boundary), escalate to architecture — do not use ad hoc `JSON.stringify`.
