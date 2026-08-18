---
id: RFC-0873
title: "Add generic Nachweis technical-assessment ingest and immutable observation history"
status: draft
kind: command
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
  - RFC-0707
amendedBy: []
related:
  - ADR-0054
  - RFC-0872
  - RFC-0713
  - RFC-0715
satisfies: []
versionBump: minor
commands:
  proposed:
    - nachweis.assessment.ingest
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "A normalized assessment bundle can be ingested without provider-specific code in the core command"
  - "All canonical artifacts are hashed and stored under immutable observation paths"
  - "Repeated observations preserve history"
  - "Idempotency and observation conflict behavior are deterministic"
nonGoals:
  - "Does not run Lighthouse"
  - "Does not call Cloudflare"
  - "Does not approve, sign, timestamp or publish automatically"
---

# RFC-0873: Add generic Nachweis technical-assessment ingest and immutable observation history

## Context

Provider adapters need one stable handoff into the existing Nachweis lifecycle. They must not each implement PBP writes, R2 paths, hashing and Bordbuch semantics differently.

This RFC defines a command-input/capture envelope. It is **not** a new PBP business entity and MUST NOT become a parallel source of truth.

## Decision

Add:

```text
nachweis.assessment.ingest
```

The command consumes an `AssessmentBundleV1`, validates it, hashes/stores artifacts, writes/updates the PBP EvidenceSource for the observation and appends a Bordbuch entry.

It ends at **N1 capture**. It does not sign, timestamp, approve or publish.

## CLI

```sh
pnpm exec werkstatt run nachweis.assessment.ingest \
  --system warpgogol-com \
  --bundle path/to/assessment-bundle.json

pnpm exec werkstatt run nachweis.assessment.ingest \
  --system warpgogol-com \
  --bundle path/to/assessment-bundle.json \
  --dry-run \
  --json
```

Flags:

- `--system` required
- `--bundle` required, local JSON file
- `--dry-run` optional
- `--json` optional

The bundle `systemId` MUST equal `--system`.

## AssessmentBundleV1

```ts
interface AssessmentBundleV1 {
  schemaVersion: "nachweis-assessment-bundle@1";
  systemId: string;
  slug: string;
  title: Record<string, string>;
  seriesId: string;
  observationId: string;
  subject: { url: string; canonicalUrl?: string };
  provider: { id: string; name: string; homepage?: string };
  tool: { id: string; name: string; version?: string };
  execution: {
    mode: "operator-run" | "provider-run";
    authorizationBasis: "site-owner" | "service-contract" | "explicit-operator";
  };
  observedAt: string;
  methodology: {
    id: string;
    version: string;
    runCount: number;
    aggregation: "provider" | "median" | "none";
  };
  result: {
    overall?: { score?: number; level?: string };
    dimensions: Array<{
      id: string;
      providerLabel: string;
      score?: number;
      numerator?: number;
      denominator?: number;
      status?: "pass" | "fail" | "not-checked";
      level?: string;
      experimental?: boolean;
      min?: number;
      max?: number;
      samples?: number[];
    }>;
  };
  freshness: { maxAgeDays: number };
  providerReportUrl?: string;
  artifacts: Array<{
    key: string;
    role: "raw-result" | "report" | "screenshot" | "summary" | "methodology";
    file: string;
    mediaType: string;
    canonical: boolean;
  }>;
}
```

## Bundle rules

- exactly one `schemaVersion`;
- `slug`, `seriesId`, `observationId`, artifact `key` are path-safe;
- all artifact paths are local files and remain inside the bundle directory unless the command has an explicit, validated workspace-root path policy;
- reject `..`, symlink escape and absolute-path escape;
- at least one canonical `raw-result`;
- no canonical artifact with unsupported/unknown file path;
- no network fetch by `assessment.ingest`;
- `observedAt` and result fields satisfy RFC-0872;
- bundle must contain no credentials, API tokens, cookies or private keys.

## R2 layout

Use existing Nachweis credentials and bucket isolation from RFC-0713.

Canonical pattern:

```text
private/
  assessments/
    {systemId}/
      {seriesId}/
        {observationId}/
          {artifactKey}.{ext}
```

Do not overwrite an existing object with a different hash.

If the current Nachweis bucket implementation has a different root prefix, adapt this pattern under the existing bucket root while preserving the invariant: `system + series + observation + artifact` must uniquely address immutable content.

## PBP write

For each observation, create/update one locale-equivalent `PbpEvidenceSource` with:

```text
kind = technical-assessment
assessment.profile = technical-assessment
assessment.seriesId = bundle.seriesId
assessment.observationId = bundle.observationId
items[artifact.key] = { sha256, storage: private, mediaType, qualityStatus: verified, role, canonical }
```

Human-facing titles may be localized. Machine assessment data MUST be locale-identical.

The command MUST use the repository's existing PBP authoring/write helper. It MUST NOT construct ad-hoc YAML/Markdown if a canonical helper exists.

## Bordbuch event

Append a `nachweis-record` event containing at least:

```json
{
  "action": "assessment-ingested",
  "seriesId": "...",
  "observationId": "...",
  "providerId": "...",
  "toolId": "...",
  "observedAt": "...",
  "artifactHashes": { "raw-1": "..." },
  "verificationLevel": "N1"
}
```

Do not store secrets or full raw provider payloads in Bordbuch.

## Transaction semantics

Desired order:

1. validate bundle completely;
2. hash all artifacts locally;
3. check idempotency/conflicts;
4. upload missing immutable objects;
5. write PBP entities;
6. append Bordbuch event last.

If step 5/6 fails after upload, immutable orphan objects may exist. They MUST be reported in structured error output and MUST NOT be treated as published or ingested evidence.

Do not delete an immutable object automatically after an uncertain remote write unless the existing R2 transaction pattern explicitly guarantees that action is safe.

## Idempotency

Identity key: `(systemId, seriesId, observationId)`

### Same identity + same normalized bundle + same hashes

Return successful no-op: `alreadyIngested: true`. No duplicate Bordbuch event.

### Same identity + different normalized data or hashes

Fail: `ASSESSMENT_OBSERVATION_CONFLICT`. Never overwrite.

### Same series + new observationId

Create a new immutable observation.

## Result

```json
{
  "command": "nachweis.assessment.ingest",
  "status": "ok",
  "systemId": "warpgogol-com",
  "slug": "warpgogol-lighthouse-home-20260818t070000z",
  "seriesId": "warpgogol-lighthouse-home",
  "observationId": "20260818T070000Z-<short-hash>",
  "verificationLevel": "N1",
  "artifactHashes": { "lhr-run-01": "<sha256>" },
  "alreadyIngested": false,
  "bordbuchEventId": "<id>"
}
```

## Provider adapters

Provider adapters MUST output a valid bundle and then invoke the same core ingest function/command.

They MUST NOT duplicate: R2 path construction, SHA-256 implementation, PBP persistence, Bordbuch append logic, observation conflict logic.

Unit tests should call the pure core functions directly where possible rather than shelling out.

## Security

- never write API tokens to bundle or Bordbuch;
- redact sensitive headers from any provider raw artifact if the provider returns caller-supplied secrets;
- reject artifact path traversal;
- follow existing R2 least-privilege credentials;
- no `--force-overwrite` for an existing observation;
- do not follow external URLs from bundle content during ingest.

## Failure modes

| Code | Meaning |
|---|---|
| `ASSESSMENT_BUNDLE_INVALID` | schema/semantic validation failed |
| `ASSESSMENT_SYSTEM_MISMATCH` | bundle system differs from CLI |
| `ASSESSMENT_ARTIFACT_MISSING` | artifact file absent |
| `ASSESSMENT_ARTIFACT_PATH_ESCAPE` | path/symlink escapes allowed root |
| `ASSESSMENT_CANONICAL_RAW_REQUIRED` | no canonical raw result |
| `ASSESSMENT_OBSERVATION_CONFLICT` | same identity with changed content |
| `ASSESSMENT_R2_UPLOAD_FAILED` | remote storage failed |
| `ASSESSMENT_PBP_WRITE_FAILED` | PBP persistence failed |
| `ASSESSMENT_BORDBUCH_WRITE_FAILED` | Bordbuch append failed after prior steps |

## Acceptance criteria

- [ ] Valid bundle dry-run performs no remote/file state mutation.
- [ ] Valid bundle ingest produces verified hashes, R2 objects, PBP source and Bordbuch event.
- [ ] Same ingest is idempotent.
- [ ] Same observation ID with changed content fails.
- [ ] New observation in same series preserves old artifacts and records.
- [ ] Path traversal and symlink escape fail.
- [ ] Missing canonical raw artifact fails.
- [ ] No credentials appear in JSON result, PBP or Bordbuch.
- [ ] Command supports `--json`.
- [ ] Command is entitlement-gated exactly like existing Nachweis commands.
- [ ] `nachweis.validate` passes the captured draft record but `nachweis.publish` still fails until N3/approval gates are completed.
