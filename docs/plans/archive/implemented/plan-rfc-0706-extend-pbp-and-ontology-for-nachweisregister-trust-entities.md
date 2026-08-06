---
rfcId: RFC-0706
planId: PLAN-RFC-0706-01
status: draft
owner: architecture
createdAt: 2026-08-06
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/pbp"
    - "@warpgogol/ontology"
    - "@warpgogol/share"
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/pbp/AGENTS.md
    - packages/ontology/AGENTS.md
    - packages/share/AGENTS.md
---

# Implementation Plan: RFC-0706

## 1. Objectives

- [ ] O1 — Extend `PbpEvidenceKind` with 4 new values and extend `evidenceSourceSchema` items with optional file-based evidence fields (maps to acceptance criteria 1–3)
- [ ] O2 — Create `PbpConsent` entity type, Zod schema, and register in barrel + `pbpSchemaById` + `pbpEntityDiscriminatedUnion` (maps to acceptance criteria 4–5, 12)
- [ ] O3 — Add optional `statementLang` to `PbpClaim` interface and `claimSchema` (maps to acceptance criteria 6–7)
- [ ] O4 — Extend `bordbuchEntryKindSchema` with `nachweis-record` and `nachweis-consent`, add `nachweis` writer-role mapping (maps to acceptance criteria 8–9, 13)
- [ ] O5 — Add `nachweis` to `ENTITLED_FEATURES` and `STRIPE_FEATURE_LOOKUP_MAP` (maps to acceptance criteria 10–11, 14)
- [ ] O6 — Audit all `items` consumers for `url`/`retrievedAt` optionality (maps to acceptance criterion: items consumer audit)
- [ ] O7 — Export all new types from `packages/pbp/src/index.ts` barrel (maps to acceptance criterion: barrel export)
- [ ] O8 — All affected packages pass `build:check` and `rfc.validate` passes (maps to acceptance criteria 15–16)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/pbp/src/entities/evidence-source.ts` — extend `PbpEvidenceKind` type, `PBP_EVIDENCE_KINDS` array, `isPbpEvidenceKind` function
- `packages/pbp/src/schemas/evidence-source.ts` — extend `pbpEvidenceKindSchema` enum, extend `items` value object with optional fields, make `url`/`retrievedAt` optional
- `packages/pbp/src/entities/consent.ts` — new file: `PbpConsent`, `PbpConsentMethod`, `PbpConsentStatus`, `CONSENT_SCHEMA_ID`, type guards
- `packages/pbp/src/schemas/consent.ts` — new file: `consentSchema` Zod schema for `pbp/consent@1`
- `packages/pbp/src/schemas/index.ts` — register `consentSchema` in barrel, `pbpSchemaById`, `pbpEntityDiscriminatedUnion`
- `packages/pbp/src/index.ts` — export `PbpConsent`, `PbpConsentMethod`, `PbpConsentStatus`, `CONSENT_SCHEMA_ID`, type guards from main barrel
- `packages/pbp/src/entities/claim.ts` — add optional `statementLang?: string` to `PbpClaim` interface
- `packages/pbp/src/schemas/claim.ts` — add optional `statementLang` to `claimSchema`
- `packages/ontology/src/operations/mission.ts` — add `nachweis-record`, `nachweis-consent` to `bordbuchEntryKindSchema` enum
- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` — add `nachweis` writer-role to `WRITER_ROLE_KINDS`
- `packages/share/src/entitlement.ts` — add `nachweis` to `ENTITLED_FEATURES` and `STRIPE_FEATURE_LOOKUP_MAP`

### 2.2 Configuration and data

- No YAML/JSON config changes needed. Content directory `src/content/business-profile/{lang}/consent/` is created at site adoption time (RFC-0708), not in this RFC.

### 2.3 Documentation and specs

- `packages/pbp/AGENTS.md` — add `PbpConsent`, `PbpConsentMethod`, `PbpConsentStatus` to Entities section; add consent to Content location section
- `packages/ontology/AGENTS.md` — note new Bordbuch entry kinds in mission.ts section
- `packages/share/AGENTS.md` — note `nachweis` feature in entitlement section (if it lists features)

### 2.4 Validation and pipelines

- `pbp.content.validate` — automatically picks up new schemas via `pbpSchemaById` registry; no code change needed
- `bordbuch.validate` — automatically accepts new kinds via extended Zod enum; no code change needed
- `entitlement.module.validate` — automatically accepts `nachweis` via extended `ENTITLED_FEATURES`; no code change needed
- `build:check` on all 4 affected packages
- `rfc.validate --id RFC-0706`

## 3. Step sequence

### Step 1. Extend PbpEvidenceKind enum and evidence-source schema

**Goal:** Add 4 new evidence kind values and extend the items value object with optional file-based evidence fields.

**Agent actions:**

- Edit `packages/pbp/src/entities/evidence-source.ts`: add `client-statement`, `project-confirmation`, `certificate`, `operational-evidence` to `PbpEvidenceKind` type and `PBP_EVIDENCE_KINDS` array
- Edit `packages/pbp/src/schemas/evidence-source.ts`: add the 4 values to `pbpEvidenceKindSchema` enum; make `url` and `retrievedAt` optional (add `.optional()`); add `sha256` (pattern `^[a-f0-9]{64}$`), `storage` (enum `private|public`), `mediaType`, `qualityStatus` (enum with 5 values) as optional fields in items value object
- Update `packages/pbp/tests/type-guards.test.ts`: add test cases for new `isPbpEvidenceKind` values
- Update `packages/pbp/src/schemas/__tests__/golden-fixtures.test.ts`: add test for extended items fields

**Validation:**

- `pnpm --filter @warpgogol/pbp run build:check`
- `pnpm --filter @warpgogol/pbp run test`

**Completion criterion:** `PbpEvidenceKind` includes all 7 values; `evidenceSourceSchema.parse()` accepts items with optional `sha256`, `storage`, `mediaType`, `qualityStatus` and items without `url`/`retrievedAt`; existing tests still pass.

**Human review:** no

---

### Step 2. Create PbpConsent entity and schema

**Goal:** Create the new `PbpConsent` entity type, Zod schema, and register it in the PBP schema registry.

**Agent actions:**

- Create `packages/pbp/src/entities/consent.ts`: define `CONSENT_SCHEMA_ID`, `PbpConsentMethod`, `PbpConsentStatus`, `PBP_CONSENT_METHODS`, `PBP_CONSENT_STATUSES`, `isPbpConsentMethod`, `isPbpConsentStatus`, `PbpConsent` interface extending `PbpEntity`
- Create `packages/pbp/src/schemas/consent.ts`: define `consentSchema` Zod schema with all fields from the RFC contract, including `.strict()` and the `grantedAt`-`status` refinement (granted consent must have `grantedAt`)
- Edit `packages/pbp/src/schemas/index.ts`: import and export `consentSchema`; add to `pbpSchemaById` registry with key `pbp/consent@1`; add to `pbpEntityDiscriminatedUnion`
- Edit `packages/pbp/src/index.ts`: export `PbpConsent`, `PbpConsentMethod`, `PbpConsentStatus`, `CONSENT_SCHEMA_ID`, `isPbpConsentMethod`, `isPbpConsentStatus` from main barrel
- Add Compass scaffolding (`MODULE_CONTRACT` + `CHANGE_SUMMARY`) to both new files
- Add golden fixture test for `consentSchema` in `golden-fixtures.test.ts`

**Validation:**

- `pnpm --filter @warpgogol/pbp run build:check`
- `pnpm --filter @warpgogol/pbp run test`

**Completion criterion:** `consentSchema` validates a valid consent entity; rejects `status: "granted"` with `grantedAt: null`; `pbpSchemaById["pbp/consent@1"]` resolves; `pbpEntityDiscriminatedUnion` includes consent; all types exported from main barrel.

**Human review:** no

---

### Step 3. Add statementLang to PbpClaim

**Goal:** Add optional `statementLang` field to `PbpClaim` interface and `claimSchema`.

**Agent actions:**

- Edit `packages/pbp/src/entities/claim.ts`: add `statementLang?: string` to `PbpClaim` interface
- Edit `packages/pbp/src/schemas/claim.ts`: add `statementLang: nonEmptyString.optional()` to `claimSchema`
- Update `golden-fixtures.test.ts`: verify `claimSchema` accepts optional `statementLang` and existing claims still validate

**Validation:**

- `pnpm --filter @warpgogol/pbp run build:check`
- `pnpm --filter @warpgogol/pbp run test`

**Completion criterion:** `claimSchema.parse()` accepts optional `statementLang`; existing claim fixtures still validate without changes.

**Human review:** no

---

### Step 4. Extend Bordbuch entry kinds and writer roles

**Goal:** Add `nachweis-record` and `nachweis-consent` to `bordbuchEntryKindSchema` and add `nachweis` writer-role mapping.

**Agent actions:**

- Edit `packages/ontology/src/operations/mission.ts`: add `"nachweis-record"` and `"nachweis-consent"` to `bordbuchEntryKindSchema` enum array; update `CHANGE_SUMMARY` with RFC-0706 item
- Edit `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts`: add `nachweis: ["nachweis-record", "nachweis-consent"]` to `WRITER_ROLE_KINDS` record

**Validation:**

- `pnpm --filter @warpgogol/ontology run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `bordbuchEntryKindSchema.parse()` accepts `nachweis-record` and `nachweis-consent`; `validateWriterRole("nachweis", "nachweis-record")` returns `true`; existing bordbuch tests still pass.

**Human review:** no

---

### Step 5. Add nachweis to entitlement catalog

**Goal:** Add `nachweis` to `ENTITLED_FEATURES` and `STRIPE_FEATURE_LOOKUP_MAP`.

**Agent actions:**

- Edit `packages/share/src/entitlement.ts`: add `"nachweis"` to `ENTITLED_FEATURES` array; add `feature_nachweis: "nachweis"` to `STRIPE_FEATURE_LOOKUP_MAP`
- Update existing entitlement tests if they assert the full feature list

**Validation:**

- `pnpm --filter @warpgogol/share run build:check`
- `pnpm --filter @warpgogol/share run test`

**Completion criterion:** `isValidFeature("nachweis")` returns `true`; `STRIPE_FEATURE_LOOKUP_MAP["feature_nachweis"]` equals `"nachweis"`; existing tests pass.

**Human review:** no

---

### Step 6. Audit items consumers for url/retrievedAt optionality

**Goal:** Ensure no existing code reads `items[].url` or `items[].retrievedAt` without null-checking.

**Agent actions:**

- Run `grep -rn 'items\[' packages/` to find all consumers of `evidenceSourceSchema.items`
- For each match, verify the code uses optional chaining (`?.`) or null guards when accessing `url` or `retrievedAt`
- Fix any unguarded access found

**Validation:**

- `pnpm --filter @warpgogol/pbp run build:check`
- `pnpm --filter @warpgogol/share run build:check` (if share consumes items)

**Completion criterion:** `grep -rn 'items\[' packages/` shows all accesses use optional chaining or null guards; no unguarded `items[].url` or `items[].retrievedAt` access remains.

**Human review:** no

---

### Step 7. Update AGENTS.md documentation

**Goal:** Update package-level AGENTS.md files with new entities, kinds, and features.

**Agent actions:**

- Edit `packages/pbp/AGENTS.md`: add `PbpConsent`, `PbpConsentMethod`, `PbpConsentStatus` to Entities section; add `consent` to Content location section
- Edit `packages/ontology/AGENTS.md`: note new Bordbuch entry kinds in mission.ts CHANGE_SUMMARY section
- Edit `packages/share/AGENTS.md`: add `nachweis` to entitlement feature list if applicable

**Validation:**

- Visual inspection of AGENTS.md files

**Completion criterion:** All three AGENTS.md files reflect the new types, kinds, and features.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0706 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0706`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0706`
- `pnpm --filter @warpgogol/pbp run build:check`
- `pnpm --filter @warpgogol/ontology run build:check`
- `pnpm --filter @warpgogol/share run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/pbp run test`
- `pnpm --filter @warpgogol/share run test`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0706` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0706.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0706` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| PBP Claim field proliferation | Step 3 adds only one optional field; monitor per ADR-0028 Evolution |
| EvidenceSource items complexity (url/retrievedAt optional) | Step 6 explicitly audits all consumers before stamping |
| Open vocabularies on Consent | Accepted as MVP; deferred to future RFC if inconsistent authoring emerges |
| evidenceRef format ambiguity | Documented in RFC; resolver belongs to RFC-0707 |
| Bordbuch kind proliferation | 15→17 values; not yet problematic; policy deferred to future RFC |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-20 or DNA-46, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0706 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `pbp/*@1` namespace cannot accommodate the new `Consent` entity additively, escalate via a superseding RFC proposing `pbp/*@2` with a migration contract.
