---
id: RFC-0738
title: "RateSnapshot Entity"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-07
updatedAt: 2026-08-07
enhancedAt: 2026-08-07
implementedAt: 2026-08-07
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-1
  - DNA-53
  - DNA-55
  - RFC-0735
  - RFC-0737
satisfies:
  - DNA-1
  - DNA-53
  - DNA-55
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/pbp"
successSignals:
  - "PbpRateSnapshot interface exported from @warpgogol/pbp"
  - "PbpRateSnapshotDigest interface exported"
  - "PbpRateSnapshotSource interface exported"
  - "RATE_SNAPSHOT_SCHEMA_ID constant exported via pbpSchemaId"
  - "pbpRateSnapshotSchema Zod schema exported from @warpgogol/pbp/schemas"
  - "rateSnapshotSchema registered in pbpSchemaById and pbpEntityDiscriminatedUnion"
  - "rate-snapshot Astro collection added to pbpCollections"
  - "tsc --noEmit and vitest run pass"
nonGoals:
  - "Does not fetch rates — that is RFC-0744 (Rate Fetcher Service)"
  - "Does not define the rate source contract — that is RFC-0744"
  - "Does not define how snapshots are stored — that is RFC-0740 (materialization) and RFC-0744 (service)"
  - "Does not define snapshot lifecycle (creation, pruning) — that is RFC-0744"
  - "Does not define the rate-snapshot.resolve command — that is RFC-0741"
  - "Does not define digest verification logic — that is RFC-0740 (compiler) and RFC-0744 (service)"
---

# RFC-0738: RateSnapshot Entity

## Context

RFC-0737 defines `RatePolicy` which declares where rates come from and how fresh they must be. When the Rate Fetcher Service (RFC-0744) fetches a rate from an external source, it creates an immutable `RateSnapshot` — a record of a specific rate observation at a specific point in time. The currency-conversion derivation (RFC-0739) uses the snapshot to compute derived prices deterministically.

The research document specifies:

- RateSnapshot is an immutable record of a rate observation
- It includes the value, source, observation time, and freshness window
- It includes a digest for tamper evidence
- It is the input to the currency-conversion derivation

## Problem

1. **No immutable rate record.** There is no PBP entity that captures a specific rate observation with its source, timestamp, and digest. Without this, derived prices cannot be traced back to a specific rate.

2. **No freshness window.** There is no field declaring how long a snapshot remains acceptable. The `freshUntil` field determines whether a snapshot is within the `maximumAge` of its RatePolicy.

3. **No tamper evidence.** There is no digest on the snapshot. Without it, a snapshot could be silently modified, breaking the reproducibility of derived prices.

## Decision

### 1. `PbpRateSnapshot` entity

```ts
export interface PbpRateSnapshotDigest {
  algorithm: string;
  value: string;
}

export interface PbpRateSnapshotSource {
  kind: PbpRateMode; // reuses PbpRateMode from RFC-0737
  sourceContractRef?: PbpEntityRef;
  rateScheduleRef?: PbpEntityRef;
  rateScheduleEntryKey?: string;
}

export interface PbpRateSnapshot extends PbpEntity {
  type: "rate-snapshot";
  pair: {
    sourceCurrency: string;
    targetCurrency: string;
  };
  quotation: {
    direction: PbpRateDirection;
  };
  value: string;
  source: PbpRateSnapshotSource;
  observedAt: string;
  freshUntil: string;
  digest: PbpRateSnapshotDigest;
}
```

### 2. Schema ID

```ts
export const RATE_SNAPSHOT_SCHEMA_ID = pbpSchemaId("rate-snapshot");
// → "pbp/rate-snapshot@1"
```

### 3. Zod schema

```ts
export const pbpRateSnapshotDigestSchema = z.object({
  algorithm: nonEmptyString,
  value: nonEmptyString,
});

export const pbpRateSnapshotSourceSchema = z.object({
  kind: pbpRateModeSchema, // reuses pbpRateModeSchema from RFC-0737
  sourceContractRef: pbpEntityRefSchema.optional(),
  rateScheduleRef: pbpEntityRefSchema.optional(),
  rateScheduleEntryKey: nonEmptyString.optional(),
});

export const rateSnapshotSchema = pbpEntitySchema
  .extend({
    type: z.literal("rate-snapshot"),
    pair: z.object({
      sourceCurrency: nonEmptyString,
      targetCurrency: nonEmptyString,
    }),
    quotation: z.object({
      direction: pbpRateDirectionSchema,
    }),
    value: decimalString,
    source: pbpRateSnapshotSourceSchema,
    observedAt: nonEmptyString,
    freshUntil: nonEmptyString,
    digest: pbpRateSnapshotDigestSchema,
  })
  .strict();
```

### 4. Validation rules

- `pair.sourceCurrency` MUST differ from `pair.targetCurrency`.
- `value` MUST be a positive decimal string (ADR-012).
- `quotation.direction` MUST match the RatePolicy that governs this pair.
- `observedAt` MUST be a valid ISO 8601 datetime.
- `freshUntil` MUST be a valid ISO 8601 datetime and MUST be later than `observedAt`.
- `digest.algorithm` SHOULD be `sha256`.
- `digest.value` is the hex digest of the canonical serialization of the snapshot (excluding the digest field itself).
- `source.kind: "external"` MUST have `sourceContractRef`.
- `source.kind: "business-fixed"` MUST have `rateScheduleRef` and `rateScheduleEntryKey`.
- Snapshots are immutable — once created, they MUST NOT be modified. New observations create new snapshots.

### 5. Digest computation

The digest is computed over the canonical serialization of the snapshot excluding the `digest` field:

```ts
import { stableStringify, byteHash } from "@warpgogol/fingerprint";

function computeSnapshotDigest(snapshot: Omit<PbpRateSnapshot, "digest">): string {
  const canonical = stableStringify(snapshot); // sorted keys, no whitespace
  return byteHash(canonical); // SHA-256 hex via @warpgogol/fingerprint (DNA-53)
}
```

Canonical serialization uses `stableStringify` from `@warpgogol/fingerprint` (DNA-53 — no ad hoc hashing outside the fingerprint package). `stableStringify` sorts object keys alphabetically and serializes as UTF-8 JSON with no whitespace. Optional fields that are `undefined` are omitted from the serialization; fields that are `null` are preserved. This ensures deterministic digests across snapshots with different optional-field combinations.

### 6. ID convention

Snapshot IDs follow the HTTPS URI pattern used by all PBP entities:

```
https://warpgogol.com/id/rate-snapshot/{date}:{pair}:{source}:{value}
```

Example: `https://warpgogol.com/id/rate-snapshot/2026-08-07:eur-uah:ecb:46.18`

The `source` segment (e.g. `ecb`, `business-fixed`) prevents collisions when multiple sources observe the same pair on the same date with the same value. This makes snapshots content-addressed — the same observation from the same source on the same date for the same pair with the same value produces the same ID.

### 7. Content file location

RateSnapshots are generated, not authored. They live at:

```
src/content/business-profile/{lang}/rate-snapshot/{id}.md
```

The Rate Fetcher Service (RFC-0744) creates these files. They are committed to the site's content directory so they are version-controlled and reproducible.

### 8. Example content

```yaml
---
schema: pbp/rate-snapshot@1
id: https://warpgogol.com/id/rate-snapshot/2026-08-07:eur-uah:ecb:46.18
type: rate-snapshot
status: published

pair:
  sourceCurrency: EUR
  targetCurrency: UAH

quotation:
  direction: target-per-source

value: "46.18"

source:
  kind: external
  sourceContractRef:
    ref: https://warpgogol.com/id/rate-source/primary

observedAt: 2026-08-07T06:00:00Z
freshUntil: 2026-09-07T06:00:00Z

digest:
  algorithm: sha256
  value: "a1b2c3d4e5f6..."
---
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** Entity type in `packages/pbp/`.
- **DNA-53 (Semantic fingerprint governance).** Digest computation uses `stableStringify` and `byteHash` from `@warpgogol/fingerprint` — no ad hoc hashing helpers outside the package.
- **DNA-55 (Spec vendoring).** New entity extends `pbp/*@1` additively as a platform extension — new entity type, no key renames or semantic changes to existing entities, permitted within `@1` per DNA-55's additive-only constraint.
- **DNA-42 (Compass markup contract).** New source files in `packages/pbp/src/entities/` and `packages/pbp/src/schemas/` carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass blocks.
- **RFC-0737 (RatePolicy).** `RatePolicy.freshness.maximumAge` determines `freshUntil`. `RatePolicy.freshness.allowLastKnownValue` determines whether a snapshot past `freshUntil` is still usable. `PbpRateMode` and `pbpRateModeSchema` are reused from RFC-0737.
- **ADR-012 (Decimal strings).** `value` is a `decimalString`.

## Design

### CLI surface

No CLI command in this RFC. RFC-0744 defines `rate-snapshot.resolve` which creates snapshots.

### TypeScript contracts

```ts
// packages/pbp/src/entities/rate-snapshot.ts

import type { PbpEntity, PbpEntityRef } from "../envelope.js";
import type { PbpRateMode, PbpRateDirection } from "./rate-policy.js";
import { pbpSchemaId } from "../schema-id.js";

export const RATE_SNAPSHOT_SCHEMA_ID = pbpSchemaId("rate-snapshot");

export interface PbpRateSnapshotDigest {
  algorithm: string;
  value: string;
}

export interface PbpRateSnapshotSource {
  kind: PbpRateMode; // reuses PbpRateMode from RFC-0737
  sourceContractRef?: PbpEntityRef;
  rateScheduleRef?: PbpEntityRef;
  rateScheduleEntryKey?: string;
}

export interface PbpRateSnapshot extends PbpEntity {
  type: "rate-snapshot";
  pair: { sourceCurrency: string; targetCurrency: string };
  quotation: { direction: PbpRateDirection };
  value: string;
  source: PbpRateSnapshotSource;
  observedAt: string;
  freshUntil: string;
  digest: PbpRateSnapshotDigest;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/entities/rate-snapshot.ts` | Entity interface + `RATE_SNAPSHOT_SCHEMA_ID` constant |
| `packages/pbp/src/schemas/rate-snapshot.ts` | Zod schema (`rateSnapshotSchema`) |
| `packages/pbp/src/schemas/index.ts` | Register in `pbpSchemaById` + `pbpEntityDiscriminatedUnion` |
| `packages/pbp/src/index.ts` | Re-exports from entity module |
| `packages/pbp/src/astro.ts` | Add `rate-snapshot` to `pbpCollections` |
| `packages/pbp/AGENTS.md` | Document new exports in API surface |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on test failures.
- Digest mismatch (detected by RFC-0740 compiler) blocks publication.

## Rollout

- **Immediate:** Upon acceptance, entity type and Zod schema are added to `@warpgogol/pbp`.
- **No site impact yet:** RateSnapshots are not created until RFC-0744 (Rate Fetcher Service) and not consumed until RFC-0739 (derivation).

## Alternatives considered

- **Store rates in a database.** Use a runtime database for rate storage. Rejected: the Werkstatt model is build-time content. Rates are content, not runtime state. Storing them as content files makes them version-controlled, reviewable, and reproducible.

- **No digest.** Skip the digest field. Rejected: the digest provides tamper evidence. Without it, a snapshot could be silently modified, breaking the reproducibility of derived prices. The digest is part of the derivation provenance (RFC-0739).

- **Mutable snapshots.** Allow updating a snapshot in place. Rejected: immutability is a core principle. A new observation creates a new snapshot. This ensures derived prices can always be traced back to a specific, unchanging rate.

## Risks

- **Snapshot proliferation.** Daily fetching creates ~365 snapshots per year per pair. Mitigation: RFC-0744 includes a pruning strategy (keep last N snapshots or snapshots within `maximumAge`).

- **Digest algorithm portability.** SHA-256 is used for digests. If a different algorithm is needed in the future, the `algorithm` field allows it. The digest is over canonical JSON serialization — the canonicalization rules must remain stable.

## Acceptance criteria

- [x] `PbpRateSnapshot` interface exported from `@warpgogol/pbp` (evidence: packages/pbp/src/index.ts:575, dde4dd78)
- [x] `PbpRateSnapshotDigest` interface exported (evidence: packages/pbp/src/index.ts:573, dde4dd78)
- [x] `PbpRateSnapshotSource` interface exported (evidence: packages/pbp/src/index.ts:574, dde4dd78)
- [x] `RATE_SNAPSHOT_SCHEMA_ID` constant exported (via `pbpSchemaId`) (evidence: packages/pbp/src/index.ts:576, dde4dd78)
- [x] `rateSnapshotSchema` Zod schema exported from `@warpgogol/pbp/schemas` (evidence: packages/pbp/src/schemas/index.ts:82-86, dde4dd78)
- [x] `rateSnapshotSchema` registered in `pbpSchemaById` and `pbpEntityDiscriminatedUnion` (evidence: packages/pbp/src/schemas/index.ts:152,187, dde4dd78)
- [x] `rate-snapshot` Astro collection added to `pbpCollections` (evidence: packages/pbp/src/astro.ts:48-54, dde4dd78)
- [x] `packages/pbp/AGENTS.md` updated with new exports (evidence: packages/pbp/AGENTS.md:123, 459a709b)
- [x] Unit tests: schema validation (valid/invalid snapshots), digest computation, ID convention (evidence: packages/pbp/src/schemas/**tests**/golden-fixtures.test.ts:878-932, packages/pbp/tests/entities.test.ts:112-116, dde4dd78)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: pnpm --filter @warpgogol/pbp run build:check exit 0)
- [x] `vitest run` passes for `packages/pbp/` (evidence: pnpm --filter @warpgogol/pbp run test — 13 test files pass, 1 pre-existing failure in rfc-0468 unrelated to RFC-0738)
- [x] `rfc.validate` passes on this file (evidence: pnpm exec site-kernel run rfc.validate --id RFC-0738 exit 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- `PbpRateSnapshot extends PbpEntity` — do not redefine `schema`, `id`, `type`, `status`, `governance`.
- `rateSnapshotSchema` MUST inherit `pbpEntitySchema` and apply `.strict()` — same pattern as all existing PBP entity schemas (e.g. `claimSchema`).
- `RATE_SNAPSHOT_SCHEMA_ID` MUST use `pbpSchemaId("rate-snapshot")` — not a string literal.
- `PbpRateMode` and `pbpRateModeSchema` are reused from RFC-0737 — do not create `PbpRateSnapshotSourceKind`.
- Digest computation MUST use `stableStringify` and `byteHash` from `@warpgogol/fingerprint` (DNA-53) — not `node:crypto.createHash`.
- Snapshot IDs MUST use HTTPS URI pattern (`https://warpgogol.com/id/rate-snapshot/...`) — not URN.
- New source files MUST carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass blocks (DNA-42).
- `packages/pbp/AGENTS.md` MUST be updated with new exports.
- Snapshots are immutable. Never modify an existing snapshot — create a new one.
- `value` is a decimal string (ADR-012), never binary float.
- The digest is computed over the canonical serialization excluding the `digest` field itself.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
