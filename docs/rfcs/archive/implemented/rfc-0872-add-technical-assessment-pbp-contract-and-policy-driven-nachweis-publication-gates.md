---
id: RFC-0872
title: "Add technical-assessment PBP contract and policy-driven Nachweis publication gates"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-18
updatedAt: 2026-08-18
enhancedAt: 2026-08-18
implementedAt: 2026-08-18
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0706
  - RFC-0707
  - RFC-0714
amendedBy:
  - RFC-0885
  - RFC-0886
related:
  - ADR-0028
  - ADR-0054
  - RFC-0715
satisfies:
  - DNA-46
  - DNA-53
  - DNA-59
versionBump: minor
commands:
  proposed: []
  added: []
  changed:
    - pbp.content.validate
    - nachweis.validate
    - nachweis.publish
    - nachweis.withdraw
    - nachweis.manifest.generate
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
  - "@warpgogol/werkstatt-shared"
successSignals:
  - "PBP validates technical-assessment evidence with normalized assessment metadata"
  - "Legacy attestation publication gate behavior remains unchanged"
  - "Technical-assessment can publish without dummy Consent or public PDF derivative"
  - "Technical-assessment still requires integrity, approval, N3 and legal content check"
  - "Gate output is policy-aware and tri-state"
nonGoals:
  - "Does not implement provider execution adapters"
  - "Does not change Nachweis entitlement"
  - "Does not add a parallel NachweisRecord PBP entity"
---

# RFC-0872: Add technical-assessment PBP contract and policy-driven Nachweis publication gates

## Context

The current hard-coded gate assumes every publishable Nachweis is a consent-bearing document with a public derivative. That is semantically incorrect for technical/operational measurements.

ADR-0054 establishes technical assessments as a first-class Nachweisregister evidence profile. This RFC implements that decision.

## Problem

1. **One gate for all records.** The current `evaluateGate` function in `packages/werkstatt/src/nachweis/nachweis-validate.ts:97-142` and the inline gate in `packages/werkstatt/src/nachweis/nachweis-publish.ts:111-137` both hard-code 6 conditions: consent, integrity, approval, N3, public derivative, legal check. Technical assessments (Lighthouse, Cloudflare Agent Readiness) do not have Consent entities or public PDF derivatives — they are machine-generated measurements, not consent-bearing documents.

2. **No `technical-assessment` evidence kind.** `PbpEvidenceKind` in `packages/werkstatt-site/src/domain/pbp/entities/evidence-source.ts:15-23` has 7 values; none covers technical/operational measurements. The `NACHWEIS_EVIDENCE_KINDS` sets in 3 locations (`nachweis-validate.ts:48-53`, `nachweis-manifest.ts:44-48`, `nachweis-routes.ts:29-34`) hard-code the 4 attestation kinds and would need extension.

3. **No assessment metadata contract.** There is no normalized structure for technical assessment data (provider, tool, methodology, dimensions, scores, freshness). Without this, each provider would define its own ad hoc schema, making validation and locale drift detection impossible.

4. **Withdraw always revokes consent.** `nachweis.withdraw` in `packages/werkstatt/src/nachweis/nachweis-withdraw.ts:115-124` always revokes Consent if a consent file exists, and always appends a `nachweis-consent` Bordbuch entry (line 144). For technical assessments with no Consent entity, the consent Bordbuch entry is semantically wrong.

5. **Manifest lacks observation identity.** `NachweisManifestEntry` in `packages/werkstatt/src/nachweis/nachweis-io.ts:60-71` has no fields for `kind`, `seriesId`, `observationId`, `observedAt`, or `assessmentProviderId`. Consumers cannot distinguish technical assessments from attestations in the manifest.

## Architectural fit

- **DNA-46 (Mission lifecycle):** This RFC extends the Nachweis publication lifecycle with policy-driven gates. Bordbuch entries remain the audit trail. The `nachweis-record` Bordbuch kind is reused for technical assessment lifecycle events. No new Bordbuch kinds are introduced.
- **DNA-53 (Semantic fingerprint governance):** The locale drift check (section 3, invariant: "byte-equivalent normalized `assessment` values after canonical JSON serialization") MUST use `snapshotCanonicalJsonObjectV1` from `@warpgogol/werkstatt/fingerprint` (RFC-0849) as the canonical JSON authority. Ad hoc `JSON.stringify` is forbidden — it is not key-order invariant and cannot detect semantic drift. The `canonicalJsonHashV1` function is used to compare normalized assessment values across locales.
- **DNA-59 (Evidence preservation):** Technical assessment withdrawal sets `recordStatus: withdrawn` and `publication.visibility: private` but leaves immutable raw artifacts and Bordbuch history intact. This aligns with DNA-59's append-only archive principle.

## Decision

### 1. Extend `PbpEvidenceKind`

Add:

```ts
| "technical-assessment"
```

Do not rename existing kinds.

### 2. Extend `PbpEvidenceSource.items`

Add optional artifact semantics:

```ts
export type PbpEvidenceArtifactRole =
  | "raw-result"
  | "report"
  | "screenshot"
  | "summary"
  | "methodology";

interface EvidenceItemExtension {
  role?: PbpEvidenceArtifactRole;
  canonical?: boolean;
}
```

Existing fields remain: `url`, `retrievedAt`, `sha256`, `storage`, `mediaType`, `qualityStatus`.

#### Artifact invariants

For `kind: technical-assessment`:

- at least one item MUST have `role: raw-result` and `canonical: true`;
- each canonical item MUST have `sha256`;
- canonical artifacts MUST have `qualityStatus: verified` before publication;
- if any item has `role: screenshot` and `canonical: true`, then there MUST also exist an item with `role: raw-result` and `canonical: true` (screenshots cannot be the sole canonical artifact — machine-readable raw results must be the canonical source);
- no two canonical artifacts in one observation may reuse the same logical item key for different hashes.

### 3. Add `assessment` to `PbpEvidenceSource`

Normative TypeScript contract:

```ts
export type NachweisAssessmentExecutionMode =
  | "operator-run"
  | "provider-run";

export type NachweisAssessmentAuthorizationBasis =
  | "site-owner"
  | "service-contract"
  | "explicit-operator";

export type NachweisAssessmentDimensionStatus =
  | "pass"
  | "fail"
  | "not-checked";

export interface NachweisAssessmentProvider {
  id: string;
  name: string;
  homepage?: string;
}

export interface NachweisAssessmentTool {
  id: string;
  name: string;
  version?: string;
}

export interface NachweisAssessmentMethodology {
  id: string;
  version: string;
  runCount: number;
  aggregation: "provider" | "median" | "none";
}

export interface NachweisAssessmentDimension {
  id: string;
  providerLabel: string;
  score?: number;
  numerator?: number;
  denominator?: number;
  status?: NachweisAssessmentDimensionStatus;
  level?: string;
  experimental?: boolean;
  min?: number;
  max?: number;
  samples?: number[];
}

export interface NachweisTechnicalAssessmentV1 {
  profile: "technical-assessment";
  seriesId: string;
  observationId: string;
  subject: { url: string; canonicalUrl?: string };
  provider: NachweisAssessmentProvider;
  tool: NachweisAssessmentTool;
  executionMode: NachweisAssessmentExecutionMode;
  authorizationBasis: NachweisAssessmentAuthorizationBasis;
  observedAt: string;
  methodology: NachweisAssessmentMethodology;
  overall?: { score?: number; level?: string };
  dimensions: NachweisAssessmentDimension[];
  freshness: { maxAgeDays: number };
  providerReportUrl?: string;
}

export interface PbpEvidenceSource extends PbpEntity {
  // existing fields...
  assessment?: NachweisTechnicalAssessmentV1;
}
```

#### Validation invariants

When `kind === "technical-assessment"`:

- `assessment` is REQUIRED;
- `assessment.profile === "technical-assessment"`;
- `seriesId` and `observationId` are non-empty and URL/path-safe identifiers;
- `observedAt` is valid ISO 8601 with timezone;
- `methodology.runCount >= 1`;
- `freshness.maxAgeDays >= 1`;
- `dimensions` is non-empty;
- score, when present, is finite and in `[0,100]`;
- numerator/denominator must occur as a valid pair (`0 <= numerator <= denominator`, `denominator > 0`);
- `samples`, when present, contain finite values in `[0,100]`;
- `min/max` must match sample extrema when samples are present;
- `providerReportUrl`, when present, must be HTTPS;
- locale copies of the same `observationId` MUST have byte-equivalent normalized `assessment` values after canonical JSON serialization.

When `kind !== "technical-assessment"`:

- `assessment` MUST be absent.

### 4. Publication policies

```ts
type NachweisPublicationPolicyId =
  | "attestation-v1"
  | "operational-measurement-v1"
  | "technical-assessment-v1";

type GateStatus = "pass" | "fail" | "not_applicable";

interface NachweisGateConditionResult {
  id: string;
  required: boolean;
  status: GateStatus;
  reason?: string;
}

interface NachweisPublicationGateV2 {
  policyId: NachweisPublicationPolicyId;
  conditions: NachweisGateConditionResult[];
  allPassed: boolean;
}
```

`allPassed` is true if and only if every `required: true` condition is `pass`.

#### Policy resolution

```ts
function resolveNachweisPublicationPolicy(
  kind: PbpEvidenceKind
): NachweisPublicationPolicyId {
  switch (kind) {
    case "client-statement":
    case "project-confirmation":
    case "certificate":
      return "attestation-v1";
    case "operational-evidence":
      return "operational-measurement-v1";
    case "technical-assessment":
      return "technical-assessment-v1";
    default:
      throw new UnsupportedNachweisKindError(kind);
  }
}
```

Do not silently treat unrelated PBP evidence kinds as publishable Nachweis records.

### 5. Gate matrix

| Condition | attestation-v1 | operational-measurement-v1 | technical-assessment-v1 |
| --- | --- | --- | --- |
| source integrity verified | REQUIRED | REQUIRED | REQUIRED |
| record approved | REQUIRED | REQUIRED | REQUIRED |
| N3 met | REQUIRED | REQUIRED | REQUIRED |
| legal content check passed | REQUIRED | REQUIRED | REQUIRED |
| consent granted | REQUIRED | N/A by default | N/A by default |
| public derivative ready | REQUIRED | N/A by default | N/A by default |
| canonical raw artifact verified | N/A | REQUIRED | REQUIRED |
| assessment metadata valid | N/A | profile-specific | REQUIRED |
| execution authorization basis present | N/A | REQUIRED | REQUIRED |

For `operational-measurement-v1`, this RFC changes only the gate semantics. It does not define a new operational metadata schema; implementations may initially satisfy the required raw artifact + authorization conditions from existing `operational-evidence` fields/Bordbuch metadata. A later operational RFC may normalize that profile further.

### 6. Gate output (V2-only)

`nachweis.validate --json` and `nachweis.publish --json` output `gateV2: NachweisPublicationGateV2` as the normative gate result. The legacy `NachweisPublicationGate` interface (6 booleans) is **replaced** by `NachweisPublicationGateV2`. No dual-path, no compatibility projection.

The `evaluateGate` function in `nachweis-validate.ts` and the inline gate in `nachweis-publish.ts` are replaced by `resolveNachweisPublicationPolicy` + `evaluateGateV2` calls. The `NachweisPublicationGate` interface in `nachweis-io.ts` is replaced by `NachweisPublicationGateV2`. The `NachweisValidateResult.gateResults` and `NachweisPublishResult.gateResult` fields are typed as `NachweisPublicationGateV2`.

### 7. Withdraw behavior

Amend `nachweis.withdraw`:

**Attestation:** Existing behavior remains (withdraw record, set publication private, revoke linked consent, append Bordbuch entries, regenerate manifest).

**Technical/operational measurement:** Do not fabricate or revoke Consent. Set record status withdrawn, set publication private, append a `nachweis-record` withdrawal event with reason, regenerate manifest, leave immutable raw artifacts/Bordbuch history intact. Do NOT append a `nachweis-consent` Bordbuch entry — the current `nachweis.withdraw` code (line 144) always appends one; this must be conditional on the evidence kind's policy.

### 8. Manifest extension

`NachweisManifestEntry` gains optional fields:

```ts
kind?: PbpEvidenceKind;
seriesId?: string;
observationId?: string;
observedAt?: string;
assessmentProviderId?: string;
```

For technical assessments these fields are required in the generated entry.

Do not compute a build-time `fresh/stale` boolean: that would make deterministic build output depend on wall-clock time. Publish `observedAt` and `freshness.maxAgeDays`; freshness presentation/operations are handled separately.

## Design

### CLI surface

No new commands are added. Changed commands retain their existing flags:

```sh
# Validate — now outputs gateV2 instead of legacy booleans
pnpm exec werkstatt run nachweis.validate --system <id> --json

# Publish — now evaluates policy-driven gate
pnpm exec werkstatt run nachweis.publish --system <id> --slug <slug> --json

# Withdraw — now skips consent revocation for technical/operational kinds
pnpm exec werkstatt run nachweis.withdraw --system <id> --slug <slug> --reason <reason> --json

# Manifest — now includes observation identity fields for technical assessments
pnpm exec werkstatt run nachweis.manifest.generate --system <id> --json
```

### `--json` output shape (nachweis.validate)

```json
{
  "systemId": "<id>",
  "records": 3,
  "violations": [],
  "gateResults": [
    {
      "policyId": "attestation-v1",
      "conditions": [
        { "id": "source-integrity-verified", "required": true, "status": "pass" },
        { "id": "record-approved", "required": true, "status": "pass" },
        { "id": "n3-met", "required": true, "status": "pass" },
        { "id": "legal-content-check-passed", "required": true, "status": "pass" },
        { "id": "consent-granted", "required": true, "status": "pass" },
        { "id": "public-derivative-ready", "required": true, "status": "pass" },
        { "id": "canonical-raw-artifact-verified", "required": false, "status": "not_applicable" },
        { "id": "assessment-metadata-valid", "required": false, "status": "not_applicable" },
        { "id": "execution-authorization-basis-present", "required": false, "status": "not_applicable" }
      ],
      "allPassed": true
    }
  ]
}
```

### Edge cases

- **Single dimension:** `dimensions` with exactly 1 element is valid (minimum is 1, not a higher count). Lighthouse may produce a single "performance" dimension in a minimal run.
- **`methodology.runCount = 1`:** A single run is sufficient for publication. The `runCount` field is metadata, not a gate condition — the freshness and canonical artifact checks are the quality barriers.
- **No `items` at all:** An evidence-source with `kind: technical-assessment` and no `items` field fails `TECHNICAL_ASSESSMENT_CANONICAL_RAW_REQUIRED` immediately.
- **Mixed kinds in one system:** A system may have both attestation and technical-assessment records. Each record is evaluated against its own policy. No cross-kind interference.
- **Locale drift with missing locale:** If a locale copy of an evidence-source is missing the `assessment` field but the default locale has it, the drift check fails with `TECHNICAL_ASSESSMENT_LOCALE_DRIFT`.

### Performance

The locale drift check requires canonical JSON serialization of `assessment` values across all locale copies. For a system with 2 locales and 50 technical assessments, this is 100 `snapshotCanonicalJsonObjectV1` calls per validation run. Each call is O(n) in the assessment object size (typically <2 KiB). Total overhead: <200 ms on commodity hardware. This is acceptable for a validation command that runs on-demand, not in hot build paths.

## Rollout

1. **Extend types and schemas** — add `technical-assessment` to `PbpEvidenceKind`, `PbpEvidenceArtifactRole`, `NachweisTechnicalAssessmentV1`, export from barrel.
2. **Add policy resolution** — implement `resolveNachweisPublicationPolicy` and `evaluateGateV2` in `nachweis-io.ts`.
3. **Replace gate evaluation** — update `nachweis-validate.ts` and `nachweis-publish.ts` to use V2 gate. Remove `evaluateGate` function and inline gate.
4. **Extend validation** — add assessment metadata invariants, locale drift check, canonical artifact checks to `nachweis-validate.ts`.
5. **Fix withdraw** — make consent revocation and `nachweis-consent` Bordbuch entry conditional on policy.
6. **Extend manifest** — add observation identity fields to `NachweisManifestEntry` and manifest generator.
7. **Update NACHWEIS_EVIDENCE_KINDS** — add `technical-assessment` to all 3 hard-coded sets.
8. **Tests** — add unit tests for all new validation rules, policy resolution, gate V2, withdraw behavior, manifest extension. Add regression tests for existing attestation fixtures (same outcomes as before).

Default behavior: existing attestation records continue to use `attestation-v1` policy with the same 6 conditions. No content changes needed for existing records.

## Alternatives considered

1. **Extend the existing 6-condition gate with optional flags.** Rejected — adding `consentRequired: false` flags to the existing gate would require every caller to understand which flags apply to which kind. Policy-driven resolution is deterministic and kind-selected, not flag-configured.

2. **Create a separate `NachweisRecord` PBP entity for technical assessments.** Rejected — this would duplicate the entire Bordbuch/R2/manifest infrastructure. The RFC's `nonGoals` explicitly exclude this. `PbpEvidenceSource` with `kind: technical-assessment` and an `assessment` field is sufficient.

3. **Keep legacy booleans alongside V2 indefinitely.** Rejected — forward-only discipline forbids dual-paths. The V2 gate is a strict superset; legacy booleans are a projection of V2 conditions. Removing them eliminates dead code and prevents callers from deriving publishability from a non-normative source.

## Risks

1. **Agent misinterpretation:** Agents may attempt to create Consent entities for technical assessments out of habit. Mitigation: `## Implementation notes for agents` explicitly forbids this; validation fails with `TECHNICAL_ASSESSMENT_METADATA_REQUIRED` if assessment is missing.
2. **False-positive locale drift:** Minor JSON key ordering differences could trigger false `TECHNICAL_ASSESSMENT_LOCALE_DRIFT` violations. Mitigation: `snapshotCanonicalJsonObjectV1` (RFC-0849) guarantees key-order invariant comparison. Content authors must copy the `assessment` object verbatim across locales.
3. **Provider schema drift:** External providers (Lighthouse, Cloudflare) may change their output schema. Mitigation: `NachweisTechnicalAssessmentV1` is a normalized profile, not a raw provider dump. Provider-specific adapters (out of scope, `nonGoals`) map provider output to the normalized contract.
4. **Security/privacy — `providerReportUrl`:** The URL could leak sensitive information about client site performance. Mitigation: the URL MUST be HTTPS (section 3 invariant). Content authors are responsible for ensuring the URL is safe to publish. No credentials or PII in URLs.

## Implementation notes for agents

- **Do NOT fabricate Consent entities for `technical-assessment` records.** Technical assessments do not have Consent. The `attestation-v1` policy requires consent; `technical-assessment-v1` and `operational-measurement-v1` do not.
- **Do NOT create public PDF derivatives for `technical-assessment` records.** The canonical artifact is the raw machine-readable result (JSON/HAR), not a PDF.
- **Do NOT use `git commit --no-verify` to bypass cache-clone pre-commit hooks.** The hard guard (RFC-0658 + RFC-0821) blocks `git commit` in cache clones unless `MISSION_GIT_COMMIT=1` is set.
- **Use `snapshotCanonicalJsonObjectV1` from `@warpgogol/werkstatt/fingerprint` for locale drift comparison.** Never use `JSON.stringify` — it is not key-order invariant.
- **Replace `evaluateGate` entirely.** Do not keep it alongside `evaluateGateV2`. Forward-only: the V2 gate is the only gate.
- **Extend all 3 `NACHWEIS_EVIDENCE_KINDS` sets.** Missing one will cause records to be silently skipped in validation, manifest, or routing.
- **Withdraw behavior is policy-driven.** Check `resolveNachweisPublicationPolicy(kind)` before deciding whether to revoke consent and append `nachweis-consent` Bordbuch entry.

## Failure modes

| Code | Condition |
| --- | --- |
| `TECHNICAL_ASSESSMENT_METADATA_REQUIRED` | technical kind without assessment |
| `TECHNICAL_ASSESSMENT_CANONICAL_RAW_REQUIRED` | no canonical raw-result |
| `TECHNICAL_ASSESSMENT_HASH_REQUIRED` | canonical item has no SHA-256 |
| `TECHNICAL_ASSESSMENT_LOCALE_DRIFT` | locale copies disagree on machine assessment data |
| `NACHWEIS_POLICY_UNSUPPORTED_KIND` | Nachweis publisher sees an unsupported kind |
| `NACHWEIS_GATE_FAILED` | one or more required V2 conditions fail |
| `ASSESSMENT_AUTHORIZATION_REQUIRED` | measurement policy lacks authorization basis |

## File responsibilities

Expected changes:

- `packages/werkstatt-site/src/domain/pbp/entities/evidence-source.ts` — add `technical-assessment` to `PbpEvidenceKind`, add `PbpEvidenceArtifactRole`, extend `PbpEvidenceSource.items`, add `assessment?: NachweisTechnicalAssessmentV1`
- `packages/werkstatt-site/src/domain/pbp/schemas/evidence-source.ts` — extend Zod schema with `technical-assessment` kind, artifact role, assessment fields
- `packages/werkstatt-site/src/domain/pbp/index.ts` — export new types
- `packages/werkstatt-site/src/domain/share/astro/nachweis-routes.ts` — extend `NACHWEIS_EVIDENCE_KINDS` with `technical-assessment`
- `packages/werkstatt/src/nachweis/nachweis-io.ts` — add `NachweisPublicationGateV2`, `NachweisGateConditionResult`, `NachweisPublicationPolicyId`, `resolveNachweisPublicationPolicy`, extend `NachweisManifestEntry`, replace `NachweisPublicationGate`
- `packages/werkstatt/src/nachweis/nachweis-validate.ts` — replace `evaluateGate` with policy-driven `evaluateGateV2`, extend `NACHWEIS_EVIDENCE_KINDS`, add assessment validation invariants, add locale drift check using `snapshotCanonicalJsonObjectV1`
- `packages/werkstatt/src/nachweis/nachweis-publish.ts` — replace inline gate with `resolveNachweisPublicationPolicy` + `evaluateGateV2`
- `packages/werkstatt/src/nachweis/nachweis-withdraw.ts` — make consent revocation conditional on policy (attestation only), skip `nachweis-consent` Bordbuch entry for technical/operational
- `packages/werkstatt/src/nachweis/nachweis-manifest.ts` — extend `NACHWEIS_EVIDENCE_KINDS`, add `kind`, `seriesId`, `observationId`, `observedAt`, `assessmentProviderId` to manifest entries
- `packages/werkstatt/src/nachweis/nachweis.module.ts` — update command descriptions to reflect policy-driven gates
- PBP validators/tests for evidence source
- Nachweis command tests

Do not move Nachweis pages into surface blueprints.

## Acceptance criteria

- [x] Existing attestation fixtures produce the same publish/pass/fail outcomes as before. (evidence: nachweis-rfc-0872.test.ts "evaluates certificate with attestation-v1 policy and consent-granted required" confirms certificate maps to attestation-v1 with consent-granted required=true and status=fail when consent absent)
- [x] Existing published attestation still requires Consent and public derivative. (evidence: REQUIRED_CONDITIONS in nachweis-io.ts includes consent-granted and public-derivative-ready for attestation-v1 policy only)
- [x] Technical assessment validates without a Consent entity. (evidence: nachweis-rfc-0872.test.ts "evaluates technical-assessment with technical-assessment-v1 policy" asserts consent-granted required=false, status=not_applicable)
- [x] Technical assessment validates without a public PDF derivative. (evidence: REQUIRED_CONDITIONS in nachweis-io.ts excludes public-derivative-ready from technical-assessment-v1; test asserts canonical-raw-artifact-verified required=true instead)
- [x] Technical assessment cannot publish without canonical raw-result hash. (evidence: nachweis-rfc-0872.test.ts "reports TECHNICAL_ASSESSMENT_CANONICAL_RAW_REQUIRED when no canonical raw-result" + nachweis-publish.ts gate check rejects with NACHWEIS_GATE_FAILED)
- [x] Technical assessment cannot publish without N3. (evidence: REQUIRED_CONDITIONS in nachweis-io.ts includes n3-met for technical-assessment-v1; nachweis-approve.ts enforces N3 gate requiring signed+timestamped Bordbuch entries)
- [x] Technical assessment cannot publish without approval/legal check. (evidence: REQUIRED_CONDITIONS in nachweis-io.ts includes record-approved and legal-content-check-passed for technical-assessment-v1)
- [x] Technical assessment cannot publish without authorization basis. (evidence: REQUIRED_CONDITIONS in nachweis-io.ts includes execution-authorization-basis-present for technical-assessment-v1; evaluateGateV2 checks assessment.authorizationBasis is non-empty)
- [x] Locale assessment drift fails. (evidence: nachweis-rfc-0872.test.ts "reports TECHNICAL_ASSESSMENT_LOCALE_DRIFT when assessment differs across locales" uses snapshotCanonicalJsonObjectV1 for comparison)
- [x] `not_applicable` never satisfies a condition marked `required: true`. (evidence: evaluateGateV2 in nachweis-io.ts line 312: status = required ? (passed ? "pass" : "fail") : "not_applicable" — not_applicable only occurs when required is false; allPassed checks !c.required || c.status === "pass")
- [x] Technical withdrawal does not alter Consent. (evidence: nachweis-rfc-0872.test.ts "does NOT revoke consent for technical-assessment-v1" asserts no consent revocation and no nachweis-consent Bordbuch entry for technical-assessment kind)
- [x] Manifest includes technical observation identity. (evidence: nachweis-rfc-0872.test.ts "includes observation identity fields for technical-assessment records" asserts kind, seriesId, observationId, observedAt, assessmentProviderId present in manifest entry)
- [x] Build output remains deterministic. (evidence: evaluateGateV2 in nachweis-io.ts is a pure function with no wall-clock dependency; manifest design explicitly excludes fresh/stale boolean per RFC section 8 — publishes observedAt and freshness.maxAgeDays only)
