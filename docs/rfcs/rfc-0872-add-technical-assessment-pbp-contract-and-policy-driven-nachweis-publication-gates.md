---
id: RFC-0872
title: "Add technical-assessment PBP contract and policy-driven Nachweis publication gates"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-18
updatedAt: 2026-08-18
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0706
  - RFC-0707
  - RFC-0714
amendedBy: []
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

This RFC adds a normalized evidence contract and replaces "one gate for every record" with deterministic policy selection by evidence kind.

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
- screenshots MUST NOT be the only canonical artifact when the adapter/provider supplied machine-readable output;
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
|---|---|---|---|
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

### 6. Backward-compatible output

For one transition period, `nachweis.validate --json` MAY expose the legacy booleans alongside `gateV2`, but:

- `gateV2` is normative;
- legacy booleans are compatibility projection only;
- no caller may derive publishability from legacy booleans after this RFC is implemented.

### 7. Withdraw behavior

Amend `nachweis.withdraw`:

**Attestation:** Existing behavior remains (withdraw record, set publication private, revoke linked consent, append Bordbuch entries, regenerate manifest).

**Technical/operational measurement:** Do not fabricate or revoke Consent. Set record status withdrawn, set publication private, append a `nachweis-record` withdrawal event with reason, regenerate manifest, leave immutable raw artifacts/Bordbuch history intact.

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

## Failure modes

| Code | Condition |
|---|---|
| `TECHNICAL_ASSESSMENT_METADATA_REQUIRED` | technical kind without assessment |
| `TECHNICAL_ASSESSMENT_CANONICAL_RAW_REQUIRED` | no canonical raw-result |
| `TECHNICAL_ASSESSMENT_HASH_REQUIRED` | canonical item has no SHA-256 |
| `TECHNICAL_ASSESSMENT_LOCALE_DRIFT` | locale copies disagree on machine assessment data |
| `NACHWEIS_POLICY_UNSUPPORTED_KIND` | Nachweis publisher sees an unsupported kind |
| `NACHWEIS_GATE_FAILED` | one or more required V2 conditions fail |
| `ASSESSMENT_AUTHORIZATION_REQUIRED` | measurement policy lacks authorization basis |

## File responsibilities

Expected changes:

- `packages/werkstatt-site/src/domain/pbp/entities/evidence-source.ts`
- PBP validators/tests for evidence source
- `packages/werkstatt-site/src/checks/nachweis/nachweis-publish.ts` (or equivalent)
- `packages/werkstatt-site/src/checks/nachweis/nachweis-validate.ts` (or equivalent)
- `packages/werkstatt-site/src/checks/nachweis/nachweis-withdraw.ts` (or equivalent)
- `packages/werkstatt-site/src/checks/nachweis/nachweis-manifest.ts` (or equivalent)
- Nachweis command tests

Do not move Nachweis pages into surface blueprints.

## Acceptance criteria

- [ ] Existing attestation fixtures produce the same publish/pass/fail outcomes as before.
- [ ] Existing published attestation still requires Consent and public derivative.
- [ ] Technical assessment validates without a Consent entity.
- [ ] Technical assessment validates without a public PDF derivative.
- [ ] Technical assessment cannot publish without canonical raw-result hash.
- [ ] Technical assessment cannot publish without N3.
- [ ] Technical assessment cannot publish without approval/legal check.
- [ ] Technical assessment cannot publish without authorization basis.
- [ ] Locale assessment drift fails.
- [ ] `not_applicable` never satisfies a condition marked `required: true`.
- [ ] Technical withdrawal does not alter Consent.
- [ ] Manifest includes technical observation identity.
- [ ] Build output remains deterministic.
