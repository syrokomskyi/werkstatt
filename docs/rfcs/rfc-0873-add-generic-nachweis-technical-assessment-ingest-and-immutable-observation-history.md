---
id: RFC-0873
title: "Add generic Nachweis technical-assessment ingest and immutable observation history"
status: accepted
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-18
updatedAt: 2026-08-18
enhancedAt: 2026-08-18
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
  - "@warpgogol/werkstatt"
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

## Problem

1. **No generic intake for technical assessments.** The existing `nachweis.ingest` (RFC-0707) accepts a single PDF file and is designed for attestations (client-statement, project-confirmation, certificate). Technical assessments (Lighthouse, Cloudflare Agent Readiness) produce structured JSON bundles with multiple artifacts, dimensions, and observation metadata — a fundamentally different input shape.

2. **Provider-specific code duplication risk.** Without a generic ingest command, each provider adapter (Lighthouse, Cloudflare, future providers) would independently implement R2 path construction, SHA-256 hashing, PBP entity writes, and Bordbuch appends — violating the one-decision-per-RFC principle and creating divergent, inconsistent observation paths.

3. **No immutable observation history.** The existing `nachweis.ingest` uses `recordId` + `version` as the identity key. Technical assessments require `(systemId, seriesId, observationId)` identity to preserve historical observations alongside new ones in the same series.

4. **No idempotency for assessment re-ingestion.** Operators may re-run the same assessment (same Lighthouse run, same Cloudflare scan) and need deterministic no-op behavior, not duplicate Bordbuch entries or R2 objects.

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
- at least one canonical `raw-result` (multiple canonical raw-results are allowed, e.g. 5 Lighthouse LHR runs);
- no canonical artifact with unsupported/unknown file path;
- no network fetch by `assessment.ingest`;
- `observedAt` and result fields satisfy RFC-0872;
- bundle must contain no credentials, API tokens, cookies or private keys.

## R2 layout

Use existing Nachweis credentials and bucket isolation from RFC-0713 (`R2_NACHWEIS_*` env vars, bucket `nachweis`).

The existing nachweis R2 path pattern is `{systemId}/private/{recordId}/v{version}/source.pdf` (see `nachweis-io.ts:resolveNachweisR2Path`). To preserve the `{systemId}/private/...` prefix convention while adding the assessment-specific structure, the adapted path is:

```text
{systemId}/private/assessments/{seriesId}/{observationId}/{artifactKey}.{ext}
```

The `{ext}` is derived from the artifact's `mediaType` (e.g. `application/json` → `.json`, `image/png` → `.png`).

Do not overwrite an existing object with a different hash.

If R2 credentials (`R2_NACHWEIS_*`) are absent, the command returns `exitCode: 1` with `ASSESSMENT_R2_UPLOAD_FAILED` and a `MISSING_ENV` diagnostic — same pattern as `nachweis.ingest`.

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

The command MUST use `parseMarkdownFrontmatter`/`stringifyMarkdownFrontmatter` from `@warpgogol/werkstatt-shared/content` to read/write PBP entity files, following the same pattern as `nachweis.public-derivative` (`packages/werkstatt/src/nachweis/nachweis-public-derivative.ts`). No canonical PBP write helper exists in the codebase; each nachweis command reads/writes entity files directly.

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

| Code                                | Meaning                                     |
| ----------------------------------- | ------------------------------------------- |
| `ASSESSMENT_BUNDLE_INVALID`         | schema/semantic validation failed           |
| `ASSESSMENT_SYSTEM_MISMATCH`        | bundle system differs from CLI              |
| `ASSESSMENT_ARTIFACT_MISSING`       | artifact file absent                        |
| `ASSESSMENT_ARTIFACT_PATH_ESCAPE`   | path/symlink escapes allowed root           |
| `ASSESSMENT_CANONICAL_RAW_REQUIRED` | no canonical raw result                     |
| `ASSESSMENT_OBSERVATION_CONFLICT`   | same identity with changed content          |
| `ASSESSMENT_R2_UPLOAD_FAILED`       | remote storage failed                       |
| `ASSESSMENT_PBP_WRITE_FAILED`       | PBP persistence failed                      |
| `ASSESSMENT_BORDBUCH_WRITE_FAILED`  | Bordbuch append failed after prior steps    |
| `ASSESSMENT_R2_MISSING_ENV`         | R2_NACHWEIS_* env vars absent (MISSING_ENV) |

## Architectural fit

- **Module placement:** `packages/werkstatt/src/nachweis/nachweis-assessment-ingest.ts` — same module as existing nachweis commands. Registered in `nachweis.module.ts` alongside `nachweis.ingest`, `nachweis.validate`, etc.
- **Bordbuch integration:** Uses `appendAndCommitBordbuch` from `bordbuch-commit-helper.ts` with writer-role `nachweis` and kind `nachweis-record` — same pattern as all existing nachweis commands.
- **R2 integration:** Uses `resolveR2ConfigFromEnv(NACHWEIS_BUCKET, "R2_NACHWEIS")` and `createR2Client` from `evidence/r2-client.ts` — same credentials and bucket as RFC-0713.
- **Fingerprint integration:** Uses `byteHashFile` from `@warpgogol/werkstatt/fingerprint` for SHA-256 computation — same as `nachweis.ingest`.
- **PBP integration:** Uses `parseMarkdownFrontmatter`/`stringifyMarkdownFrontmatter` from `@warpgogol/werkstatt-shared/content` and `resolvePbpEntityDir` from `nachweis-io.ts` — same pattern as `nachweis.public-derivative`.
- **Entitlement gating:** Checks `isNachweisEntitled` from `nachweis-io.ts` — same as all existing nachweis commands. Returns `makeSkipResult` if not resolved.
- **Lock integration:** Acquires `system:{id}` and `bordbuch:{id}` locks before appending Bordbuch entry — same as `nachweis.ingest`.
- **AGENTS.md update:** `packages/werkstatt/AGENTS.md` may need a note about the assessment ingest command and its entitlement gating pattern.
- **Compass sync:** `docs/verification-plan.xml` may need synchronization if the new command affects the verification surface. The command is not added to any pipeline (it is operator-invoked, not automatic).

## Design

### TypeScript contracts

```ts
// packages/werkstatt/src/nachweis/nachweis-assessment-ingest.ts

export interface AssessmentBundleV1 {
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

export interface AssessmentIngestResult {
  systemId: string;
  slug: string;
  seriesId: string;
  observationId: string;
  verificationLevel: "N1";
  artifactHashes: Record<string, string>;
  alreadyIngested: boolean;
  bordbuchEventId: string | null;
  dryRun: boolean;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/nachweis/nachweis-assessment-ingest.ts` | Command handler |
| `packages/werkstatt/src/nachweis/nachweis.module.ts` | Module registration (add command) |
| `packages/werkstatt/src/nachweis/nachweis-io.ts` | Add `resolveAssessmentR2Path` helper |
| `packages/werkstatt/src/nachweis/index.ts` | Barrel exports |
| `packages/werkstatt/src/tests-handoff/nachweis-assessment-ingest.test.ts` | Unit tests |
| R2 bucket `nachweis` | `{systemId}/private/assessments/{seriesId}/{observationId}/{artifactKey}.{ext}` |
| `<cache>/src/content/business-profile/{lang}/trust/evidence/{slug}.md` | PBP evidence-source entity |

## Rollout

- **Default behavior:** The command is registered but skips execution if `nachweis` entitlement is not resolved (same as all existing nachweis commands).
- **warpgogol-com pilot:** `entitlementsOverride: ["nachweis"]` in `system.md`. R2 bucket `nachweis` already exists (RFC-0707). R2 credentials `R2_NACHWEIS_*` already configured (RFC-0713).
- **Pipeline integration:** None — the command is operator-invoked, not added to `build.prepare` or `build.check`.
- **Existing apps:** No migration needed — the command is additive. Sites without `nachweis` entitlement are unaffected.

## Alternatives considered

- **Extend `nachweis.ingest` with a `--bundle` flag:** Rejected. `nachweis.ingest` accepts a single PDF file and produces a `recordId`-keyed record. Assessment bundles are JSON with multiple artifacts and `(seriesId, observationId)` identity. Combining them would require a bifurcated code path inside one command, violating the single-responsibility principle.
- **Provider-specific commands (`nachweis.lighthouse.ingest`, `nachweis.cloudflare.ingest`):** Rejected. Each provider would duplicate R2 path construction, hashing, PBP writes, and Bordbuch appends. The generic `AssessmentBundleV1` envelope eliminates provider-specific code in the core.
- **Store assessments as `operational-evidence` kind:** Rejected. RFC-0872 established `technical-assessment` as a distinct PBP evidence kind with its own publication policy (`technical-assessment-v1`) that does not require consent or public derivative. Using `operational-evidence` would apply the wrong publication gate.

## Risks

- **R2 orphan objects:** If PBP write or Bordbuch append fails after R2 upload, immutable objects exist in R2 but are not tracked. Mitigation: report orphan paths in structured error output; do not auto-delete (immutable objects may be referenced by prior observations). A future `nachweis.cleanup` command could detect orphaned R2 objects.
- **Bordbuch growth:** Each assessment observation generates one Bordbuch entry. A series with frequent observations (e.g. daily Lighthouse runs) grows the bordbuch faster. Mitigation: `bordbuch.validate` performance is O(n) — monitor for sites with 100+ assessment observations.
- **Agent misinterpretation risk:** An agent might confuse `nachweis.assessment.ingest` with `nachweis.ingest` and pass a PDF instead of a bundle. Mitigation: the `--bundle` flag name and the `ASSESSMENT_BUNDLE_INVALID` error code make the distinction explicit.
- **Bundle path traversal:** A malicious bundle could specify `../../etc/passwd` as an artifact path. Mitigation: the command rejects `..`, symlink escape, and absolute paths; all artifact paths must remain inside the bundle directory.

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- This RFC amends RFC-0707 (Nachweis kernel module) — RFC-0707.amendedBy must include RFC-0873.
- This RFC depends on RFC-0872 (technical-assessment PBP contract) — the `technical-assessment` evidence kind and `NachweisTechnicalAssessmentV1` interface must exist in `@warpgogol/werkstatt-site` before implementing this RFC.
- This RFC uses R2 credential isolation from RFC-0713 (`R2_NACHWEIS_*` env vars).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0873 --reason "..." --invariant "DNA-N"` instead of working around it.
- R2 bucket `nachweis` and `R2_NACHWEIS_*` env vars must be configured before running `nachweis.assessment.ingest`.
- The command is entitlement-gated: it returns `makeSkipResult` when `nachweis` entitlement is not resolved, same as all existing nachweis commands.

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
