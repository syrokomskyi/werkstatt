---
reviewId: REVIEW-CODE-2026-08-06-01
date: 2026-08-06
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 506d9bce...HEAD
filesReviewed:
  - packages/pbp/src/entities/evidence-source.ts
  - packages/pbp/src/schemas/evidence-source.ts
  - packages/pbp/src/entities/consent.ts
  - packages/pbp/src/schemas/consent.ts
  - packages/pbp/src/schemas/index.ts
  - packages/pbp/src/index.ts
  - packages/pbp/src/entities/claim.ts
  - packages/pbp/src/schemas/claim.ts
  - packages/ontology/src/operations/mission.ts
  - packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts
  - packages/share/src/entitlement.ts
  - packages/os/site-kernel-checks/src/audit/validators/wikidata.ts
---

# Code Review: RFC-0706 implementation (506d9bce...HEAD)

### Verdict: Needs revision

The implementation is structurally sound and DNA-aligned, but has one field-name deviation from the RFC specification that should be documented or corrected before merging.

### Mechanical floor

Pass — all 5 impacted packages pass `build:check` (typecheck). `rfc.validate --id RFC-0706` passes with zero errors.

### Axis A — Structural correctness

1. **`consentStatus` vs `status` field name deviation** — The RFC (line 216) specifies `status: PbpConsentStatus` on `PbpConsent`, but the implementation uses `consentStatus` to avoid a TypeScript conflict with `PbpEntity.status: PbpEntityStatus`. This is a justified deviation (the two `status` types are incompatible), but it is undocumented in the code. A brief inline comment explaining the rename would prevent future confusion.

2. **`.regex()` vs `.pattern()`** — The RFC (line 183) uses `.pattern()` for sha256 validation, but the implementation correctly uses `.regex()` since `.pattern()` does not exist in the installed Zod version. This is a correct adaptation, not a finding.

### Axis B — DNA alignment

No issues. All changes are additive within `pbp/*@1` (DNA-20/PBP canonical layer). The `bordbuchEntryKindSchema` extension is additive (DNA-23 closed enum). The `ENTITLED_FEATURES` extension is additive. No invariants are weakened.

### Axis C — Ecosystem fit

No issues. Package boundaries respected. Consent schema properly registered in `pbpSchemaById` and `pbpEntityDiscriminatedUnion`. AGENTS.md updated for `packages/pbp`. All imports flow correctly.

### Axis D — Forward-only compliance

No issues. The `url`/`retrievedAt` optionality change is applied directly to the schema — no compatibility shim. The `wikidata.ts` consumer is updated directly to use optional `url`. No dual paths or legacy flags.

### Axis E — Agent-facing clarity

No issues. New files (`consent.ts` entity and schema) carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. All changes reference RFC-0706 in comments and CHANGE_SUMMARY entries. The `consentStatus` rename is the only clarity gap (see Axis A finding 1).

### Axis F — Pragmatism

No issues. Minimal changes — only what the RFC defines. No speculative generality. Existing entity/schema/barrel pattern followed consistently.

### Axis G — Blind spots

No issues. The `evidenceRef` format and `textVersion` lifecycle are explicitly deferred to RFC-0707 in the RFC text. No performance concerns (schema definitions only). No security/privacy concerns (no PII touched).

### Spec compliance

| Requirement from RFC-0706 | Status | Evidence |
| --- | --- | --- |
| 4 new PbpEvidenceKind values | Done | evidence-source.ts:17-21 |
| Optional file-based evidence fields | Done | evidence-source.ts:40-49 (schema) |
| url/retrievedAt optional | Done | evidence-source.ts:37-38 (schema) |
| PbpConsent entity + schema | Done | consent.ts entity + schema |
| consentSchema in registry + union | Done | schemas/index.ts:121,152 |
| statementLang on PbpClaim | Done | claim.ts:61, claim schema:54 |
| Bordbuch kinds nachweis-record/consent | Done | mission.ts:63-64 |
| nachweis writer-role | Done | bordbuch-io.ts:51 |
| nachweis entitlement | Done | entitlement.ts:36,59 |
| `status` field on PbpConsent | Partial | Renamed to `consentStatus` due to TypeScript conflict — justified but undocumented |

### Questions for the author

1. The RFC specifies `status: PbpConsentStatus` on `PbpConsent`, but the implementation uses `consentStatus`. Should the RFC be amended to reflect this rename, or should the field be accessed via a different pattern to preserve the RFC's field name?
