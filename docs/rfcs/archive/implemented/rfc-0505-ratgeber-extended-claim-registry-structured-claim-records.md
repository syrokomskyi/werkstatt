---
id: RFC-0505
title: "Ratgeber extended claim registry — structured claim records with source binding and expiry"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-23
updatedAt: 2026-07-23
enhancedAt: 2026-07-23
implementedAt: 2026-07-23
supersedes: []
supersededBy:
amends:
  - RFC-0502
amendedBy: []
related:
  - RFC-0211
  - RFC-0214
  - RFC-0478
  - RFC-0479
  - RFC-0480
  - RFC-0500
  - RFC-0501
  - RFC-0502
  - RFC-0504
satisfies:
  - DNA-16
  - DNA-24
  - DNA-53
breaksC: false
versionBump: minor
commands:
  proposed:
    - ratgeber.claim.validate
  added:
    - ratgeber.claim.validate
  changed:
    - ratgeber.provenance.validate
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/site-kernel-checks"
  - "@gogol/share"
  - "@gogol/site-kernel-handoff"
successSignals:
  - "A new content collection surface/claims/{lang}/*.md holds structured claim records with claimId, articleId, claimText, claimType, sourceRefs, calculationInputs, limitations, verifiedAt, expiresAt, and reviewStatus."
  - "Every published article that makes a factual claim references at least one claim record via claimId."
  - "No external fact is published without a source reference in the claim record."
  - "Claim records with calculationInputs carry the input values used (e.g., price.setup, price.monthly) — not hardcoded results."
  - "Claim records with expiresAt are flagged by ratgeber.claim.validate when expired."
  - "ratgeber.claim.validate checks claim record schema, source binding, claimId uniqueness, and expiry."
  - "ratgeber.provenance.validate checks that every claimId referenced in an article resolves to a claim record."
  - "The Quellen section in the prose body lists all referenced sources with titles and URLs — the claim registry is the machine-readable backing, not the visitor-facing display."
nonGoals:
  - "Does not change the CKL claim model (RFC-0211) or source descriptor schema (RFC-0214) — this RFC creates a ratgeber-specific claim collection that binds to CKL sources."
  - "Does not create a general-purpose claim system for all surfaces — claims are ratgeber-specific."
  - "Does not render claim records on the article page — the visitor-facing display is the Quellen section and provenance footer (RFC-0502)."
  - "Does not automate claim verification — verifiedAt and reviewStatus are manual editorial fields."
  - "Does not change the article collection schema — claim records are a separate collection referenced by claimId."
  - "Does not define automated PBP value drift detection — RG-CLAIM-09 warns when the current PBP value differs from the recorded calculationInputs value, but does not block publication."
---

# RFC-0505: Ratgeber extended claim registry — structured claim records with source binding and expiry

## Context

RFC-0502 introduced author records, source binding, and claim IDs for ratgeber articles. The claim binding reuses the CKL claim model (RFC-0211) and source descriptors (RFC-0214). However, the current claim model is minimal — claim IDs exist in article claim sidecars (`surface/articles/{lang}/{slug}.claims.yaml`) but there is no structured claim record with claim text, source references, calculation inputs, limitations, verification metadata, or expiry.

This RFC replaces the ratgeber-specific claim sidecars with a dedicated claim record collection. The CKL `recordClaimsSchema` (from `@gogol/share/schemas`) remains in use for other surfaces (business records); only the ratgeber article claim sidecars are superseded by the new claim record collection.

An external expert review (file 15.1, section 6) requires a structured claim registry where every key factual assertion has a traceable record with source binding, calculation inputs, limitations, and review status. The expert explicitly states: "Do not publish an external fact without a source reference."

## Problem

1. **No structured claim records.** The current system has claim IDs in article claim sidecars (RFC-0502, using CKL `recordClaimsSchema` from RFC-0211) but no dedicated claim collection. Claims are opaque identifiers — there is no claim text, no source binding at the individual claim level, no calculation inputs, no limitations, and no expiry.

2. **No source binding at claim level.** Sources are bound at the article level (RFC-0502), not at the individual claim level. A reader (or validator) cannot trace which source supports which specific assertion.

3. **No calculation provenance.** Articles contain price calculations (e.g., "200 € + 12 × 70 € = 1.040 €") but the calculation inputs are not recorded. When prices change, there is no way to identify which claims need recalculation.

4. **No claim expiry.** Factual claims about search engine behavior, pricing, or regulations can become outdated. There is no mechanism to flag expired claims for review.

5. **No claim review status.** Claims do not have a review status (verified, unverified, disputed). The article status workflow (RFC-0503) covers the article, not individual claims.

## Decision

### Claim collection

New content collection `surface/claims/{lang}/*.md`:

```yaml
claimId: local-ranking-relevance-distance-prominence
articleId: lokale-sichtbarkeit
claimText: "Google nennt drei Hauptfaktoren der lokalen Suche: Relevanz, Entfernung und Bekanntheit/Prominenz."
claimType: factual
sourceRefs:
  - sourceId: google-business-profile-local-ranking
    url: "https://support.google.com/business/answer/7091"
    title: "How Google determines local ranking"
    retrievedAt: "2026-07-23"
calculationInputs: []
limitations:
  - "Die genaue Ranking-Formel ist unbekannt."
  - "Eine bessere organische Position kann nicht gekauft oder angefordert werden."
verifiedAt: "2026-07-23"
expiresAt:
reviewStatus: verified
```

### Claim record schema

Required fields:

- `claimId` — unique identifier (kebab-case, article-scoped)
- `articleId` — slug of the article this claim belongs to
- `claimText` — the factual assertion in plain text
- `claimType` — one of: `factual`, `calculation`, `methodological`, `regulatory`
- `sourceRefs` — array of source references (at least one for `factual` and `regulatory` types)
- `verifiedAt` — date of last editorial verification
- `reviewStatus` — one of: `verified`, `unverified`, `disputed`

Optional fields:

- `calculationInputs` — array of input references (e.g., `{ ref: "business-profile.offerings/digital-foundation.presentation.price.setup", value: "200" }`) for `calculation` type
- `limitations` — array of limitation strings
- `expiresAt` — date after which the claim should be re-reviewed

### Source reference schema

Each entry in `sourceRefs`:

- `sourceId` — CKL source descriptor ID (RFC-0214) or inline source identifier
- `url` — canonical URL of the source
- `title` — title of the source document
- `retrievedAt` — date the source was last accessed

### Claim types

| Type | Description | sourceRefs required? | calculationInputs required? |
| --- | --- | --- | --- |
| `factual` | External factual assertion (e.g., ranking factors) | Yes (≥ 1) | No |
| `calculation` | Price or cost calculation from PBP references | No (inputs are internal) | Yes (≥ 1) |
| `methodological` | Editorial methodology choice (e.g., cost model structure) | No | No |
| `regulatory` | Legal or regulatory claim | Yes (≥ 1) | No |

### Validation rules

New command `ratgeber.claim.validate`:

- **RG-CLAIM-01**: Every claim record has all required fields.
- **RG-CLAIM-02**: `claimId` is unique within the collection.
- **RG-CLAIM-03**: `articleId` resolves to an existing article record.
- **RG-CLAIM-04**: `factual` and `regulatory` claims have at least one `sourceRefs` entry.
- **RG-CLAIM-05**: `calculation` claims have at least one `calculationInputs` entry.
- **RG-CLAIM-06**: `sourceRefs[].url` is a valid URL.
- **RG-CLAIM-07**: Claims with `expiresAt` in the past produce a warning (not error — expired claims need review, not removal).
- **RG-CLAIM-08**: `reviewStatus: disputed` claims produce a warning.
- **RG-CLAIM-09**: `calculation` claims where `calculationInputs[].value` differs from the current PBP value at the `ref` path produce a warning (value drift detection).

`ratgeber.provenance.validate` (RFC-0502) changes:

- **RG-PROV-03** is updated: instead of checking `claimId` existence in the article's claim sidecar (`surface/articles/{lang}/{slug}.claims.yaml`), it now checks `claimId` existence against the new claim record collection (`surface/claims/{lang}/*.md`). The claim sidecar is no longer the source of truth for ratgeber claim IDs.
- **RG-PROV-06** (new): Every `claimId` referenced in an article's `sources[].claimIds` (or `claimIds` frontmatter field) resolves to a claim record in `surface/claims/{lang}/`. This is the article-to-claim-record binding check.

The existing claim sidecars (`surface/articles/{lang}/{slug}.claims.yaml`) are removed by the migrator — their data is transformed into claim records. The CKL `recordClaimsSchema` and `content.claim.validate` command remain for business record claim sidecars; only ratgeber article claim sidecars are superseded.

### Article claim binding

Articles reference claims via the existing `sources[].claimIds` field (RFC-0502). The `claimIds` in `sources[].claimIds` must resolve to claim records in `surface/claims/{lang}/`:

```yaml
sources:
  - sourceId: google-business-profile-local-ranking
    claimIds:
      - local-ranking-relevance-distance-prominence
  - sourceId: internal-pricing
    claimIds:
      - website-kosten-setup-fee
      - website-kosten-monthly-base
```

The `claimId` namespace is article-scoped: `{article-slug}-{claim-slug}`. This prevents ID collisions between articles while keeping IDs readable.

### Migrator

A migrator (RFC-0479) creates the `surface/claims/{lang}/` collection directory and transforms existing article claim sidecars into claim records. For each entry in a claim sidecar (`surface/articles/{lang}/{slug}.claims.yaml`):

- `claimId` — the sidecar key (e.g., `pricing-setup-fee` → `{article-slug}-pricing-setup-fee` to enforce article-scoped naming)
- `claimText` — from `statement` if present, otherwise empty string (operator fills in)
- `claimType` — mapped from `claimClass`: `general` → `factual`, `legal` → `regulatory`, `price` → `calculation`, `comparative-commercial` → `factual`
- `sourceRefs` — from `sourceRef` (resolved to source descriptor for `url` and `title`)
- `calculationInputs` — empty array (operator fills in for `calculation` type)
- `limitations` — empty array (operator fills in)
- `verifiedAt` — from `asOf`
- `expiresAt` — from `validUntil` if present
- `reviewStatus` — `unverified` (all migrated claims start as unverified; operator promotes to `verified` after review)

After transformation, the claim sidecar file is deleted. The migrator is idempotent: if claim records already exist for the same `claimId`, the migrator does not overwrite them.

Migrator id: `rfc-0505`.

## Architectural fit

- **RFC-0502:** amends — replaces the ratgeber article claim sidecar system with a structured claim record collection. RG-PROV-03 is updated to check against claim records instead of sidecars. The `sources[].claimIds` article frontmatter field is unchanged — only the resolution target changes.
- **RFC-0211 (CKL claim model):** reuses — the CKL `recordClaimsSchema` and `content.claim.validate` remain for business record claim sidecars. This RFC does not touch the CKL model; it creates a ratgeber-specific claim collection that binds to CKL sources via `sourceRefs[].sourceId`.
- **RFC-0214 (source descriptors):** reuses — `sourceRefs[].sourceId` references the same source descriptor registry in `integrations/truth-sources/`.
- **RFC-0478:** `versionBump: minor` — new collection, new validator, and changed validator are Breaks-B (data contract extension). The migrator transforms existing claim sidecars into claim records.
- **RFC-0479:** migrator `rfc-0505` registered in the migrator registry, ordered by RFC-id.
- **RFC-0480:** `breaksC: false` — no external surface contract changes. URL structure, JSON-LD types, and sitemap shape are unchanged. The claim registry is a machine-readable backing store, not a visitor-facing surface.
- **DNA-16 (semantic layer shares topology with navigation):** The claim registry does not introduce a parallel page-structure model. It is a provenance backing store — `claimText`, `reviewStatus`, and `sourceRefs` are not rendered as navigation or semantic output. JSON-LD emission is unchanged; the `author` property already comes from `authorId` (RFC-0502). DNA-16 is satisfied because the claim registry does not create a new topology for semantic outputs.
- **DNA-24 (block-declarative pages):** Claim records are metadata records in a content collection, not page blocks. They are referenced by `claimIds` in article frontmatter and resolved by the validator. The claim registry does not introduce markdown bodies in page entries or route-local composition. DNA-24 is satisfied because claim records are not rendered as blocks.
- **DNA-53 (semantic fingerprint governance):** The claim record collection adds new content files, which will change the platform semantic hash. `versionBump: minor` is declared, so the hash change is expected and governed. DNA-53 is satisfied because the version bump is declared.

## Design

### CLI surface

```sh
pnpm exec site-kernel run ratgeber.claim.validate --site warpgogol-com --json
```

Site-scoped, runs in `build.check` (blocking).

Exit codes: `0` = pass (no errors, warnings allowed), `1` = error (at least one RG-CLAIM-01..06 violation), `2` = warning-only (RG-CLAIM-07/08/09 only).

`--json` output follows the standard `KernelCommandResult<CheckResult>` shape:

```json
{
  "commandName": "ratgeber.claim.validate",
  "ok": true,
  "data": {
    "command": "ratgeber.claim.validate",
    "status": "pass",
    "diagnostics": [
      {
        "ruleId": "RG-CLAIM-07",
        "severity": "warning",
        "file": "surface/claims/de/lokale-sichtbarkeit-ranking-factors.md",
        "message": "claim \"local-ranking-relevance-distance-prominence\" expired on 2026-06-01 — needs review",
        "fixHint": "Review the claim, update verifiedAt and expiresAt, or remove the claim."
      }
    ]
  },
  "exitCode": 0
}
```

### TypeScript contracts

```ts
// In @gogol/share/schemas/claim-records.ts

import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const claimRecordSchema = z.object({
  claimId: z.string().min(1),
  articleId: z.string().min(1),
  claimText: z.string(),
  claimType: z.enum(["factual", "calculation", "methodological", "regulatory"]),
  sourceRefs: z.array(z.object({
    sourceId: z.string().min(1),
    url: z.string().url(),
    title: z.string().min(1),
    retrievedAt: z.string().regex(ISO_DATE),
  })),
  calculationInputs: z.array(z.object({
    ref: z.string().min(1),
    value: z.string(),
  })).optional().default([]),
  limitations: z.array(z.string()).optional().default([]),
  verifiedAt: z.string().regex(ISO_DATE),
  expiresAt: z.string().regex(ISO_DATE).optional(),
  reviewStatus: z.enum(["verified", "unverified", "disputed"]),
}).strict();

export type ClaimRecord = z.infer<typeof claimRecordSchema>;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/schemas/claim-records.ts` | New: claim record Zod schema + type |
| `packages/share/src/schemas/index.ts` | Updated: re-export `claimRecordSchema`, `ClaimRecord` |
| `packages/os/site-kernel-checks/src/ratgeber-claim-validate.ts` | New: validator |
| `packages/os/site-kernel-checks/src/ratgeber-provenance-validate.ts` | Updated: RG-PROV-03 checks claim records, add RG-PROV-06 |
| `packages/os/site-kernel-checks/src/lib/surface-claims.ts` | New: load claim records from `surface/claims/{lang}/` |
| `packages/os/site-kernel-handoff/src/migrators/rfc-0505.ts` | New: migrator — transform claim sidecars to claim records |
| `packages/os/site-kernel-handoff/src/migrators/registry.ts` | Extended: register `rfc-0505` |
| `tools/kernel.config.ts` | Register `ratgeber.claim.validate` |
| `docs/verification-plan.xml` | Add RG-CLAIM-01..09 checks |
| `docs/COMMANDS.md` | Add command |
| `docs/requirements.xml` | Update: new claim record collection |
| `docs/technology.xml` | Update: new validator, migrator, schema |
| `docs/knowledge-graph.xml` | Update: RFC-0505 relationships |
| `packages/os/site-kernel-checks/AGENTS.md` | Update: document `ratgeber-claim-validate.ts` module |

### Failure modes

| Rule | Severity | Description |
| --- | --- | --- |
| `RG-CLAIM-01` | error | Claim record missing required field |
| `RG-CLAIM-02` | error | `claimId` is not unique within the collection |
| `RG-CLAIM-03` | error | `articleId` does not resolve to an existing article record |
| `RG-CLAIM-04` | error | `factual` or `regulatory` claim has no `sourceRefs` entries |
| `RG-CLAIM-05` | error | `calculation` claim has no `calculationInputs` entries |
| `RG-CLAIM-06` | error | `sourceRefs[].url` is not a valid URL |
| `RG-CLAIM-07` | warning | Claim with `expiresAt` in the past — needs review |
| `RG-CLAIM-08` | warning | `reviewStatus: disputed` — claim is contested |
| `RG-CLAIM-09` | warning | `calculationInputs[].value` differs from current PBP value at `ref` path |

### Pipeline placement

- `ratgeber.claim.validate` runs in `build.check` (blocking) — site-scoped.
- `ratgeber.provenance.validate` runs in `build.check` (blocking) — site-scoped. Updated with RG-PROV-03 change and RG-PROV-06 addition.

### Edge cases

- **No claim records exist:** The validator passes with zero diagnostics — no articles can reference non-existent claim records. If an article references a `claimId` and no claim record exists, RG-PROV-06 fires.
- **Article references a `claimId` but no claim record exists:** RG-PROV-06 fires (error) — the `claimId` in `sources[].claimIds` does not resolve to a claim record.
- **Claim record references an `articleId` that is `status: draft`:** RG-CLAIM-03 passes — the article record exists, regardless of status. Claim records may be authored before the article is published.
- **Claim sidecar still exists after migration:** The migrator deletes claim sidecars after transforming them. If a sidecar is found post-migration (e.g., operator created a new one manually), `ratgeber.provenance.validate` ignores it — RG-PROV-03 now checks claim records, not sidecars.
- **`calculationInputs[].ref` path does not resolve in PBP data:** RG-CLAIM-09 fires (warning) — the recorded value cannot be compared against the current PBP value.

### Performance estimate

The validator scans: claim records (~10–50 files per language), article records for `articleId` resolution (~10–50 files), and source descriptors for `sourceRefs[].sourceId` resolution (~5–20 files). For `calculation` type claims with `calculationInputs`, the validator also reads PBP data files to compare values (~1–10 files). Total I/O: ~25–130 file reads per site. This is comparable to `ratgeber.provenance.validate` and well within build-check latency budgets.

### False-positive analysis

- **RG-CLAIM-07 (expired claims):** During initial migration, all claims have `reviewStatus: unverified` and may have `expiresAt` set from the original `validUntil`. The validator produces warnings, not errors — expired claims need review, not removal. Operators can suppress noise by updating `expiresAt` or removing it during the review window.
- **RG-CLAIM-08 (disputed claims):** Rare in practice — only fires when an editor explicitly sets `reviewStatus: disputed`. No false-positive risk.
- **RG-CLAIM-09 (PBP value drift):** Only fires for `calculation` type claims with `calculationInputs`. During initial migration, `calculationInputs` is empty, so RG-CLAIM-09 does not fire. After operators populate `calculationInputs`, the warning fires only when the PBP value has changed since verification — which is the intended behavior.

## Rollout

1. Add claim record Zod schema to `@gogol/share/schemas/claim-records.ts`. Export from `@gogol/share/schemas`.
2. Implement `ratgeber.claim.validate` command with RG-CLAIM-01..09 rules.
3. Update `ratgeber.provenance.validate`: RG-PROV-03 checks claim records instead of sidecars; add RG-PROV-06.
4. Create `packages/os/site-kernel-handoff/src/migrators/rfc-0505.ts`.
5. Register migrator in `registry.ts`.
6. Register `ratgeber.claim.validate` in `tools/kernel.config.ts`.
7. Run migrator on warpgogol-com mission workpiece — transforms existing claim sidecars into claim records, deletes sidecars.
8. Populate `claimText`, `limitations`, and `calculationInputs` for the two reference articles (lokale-sichtbarkeit, website-kosten) — this is human editorial work.
9. Verify with `ratgeber.claim.validate --site warpgogol-com --json` and `ratgeber.provenance.validate --site warpgogol-com --json`.
10. Compass sync: update `docs/verification-plan.xml`, `docs/COMMANDS.md`, `docs/requirements.xml`, `docs/technology.xml`, `docs/knowledge-graph.xml`, `packages/os/site-kernel-checks/AGENTS.md`.

## Alternatives considered

**Extend RFC-0502 claim sidecars instead of new collection.** Rejected — claim sidecars (RFC-0211) are article-adjacent files with opaque IDs. A dedicated claim collection allows cross-article claim reuse, independent validation, and expiry tracking.

**Use CKL claim model directly.** Rejected — the CKL model (RFC-0211) is a platform-wide claim registry with different fields. The ratgeber claim registry is editorial-specific with `calculationInputs`, `limitations`, and `expiresAt` that the CKL model does not carry. This RFC binds to CKL sources via `sourceRefs[].sourceId` but does not duplicate the CKL claim schema.

**No expiry tracking.** Rejected — the expert explicitly requires that outdated claims be flagged for review. `expiresAt` is a lightweight mechanism that does not require automated monitoring.

## Risks

- **Claim collection maintenance burden.** Every factual assertion needs a claim record. Mitigation: start with the two reference articles and expand incrementally; `reviewStatus: unverified` allows gradual adoption.
- **Source URL rot.** External URLs may become unavailable. Mitigation: `retrievedAt` records when the source was last accessed; expired claims are flagged for re-review via RG-CLAIM-07.
- **Calculation input drift.** PBP price references may change, making `calculationInputs` stale. Mitigation: `calculationInputs` records the reference path and value at verification time; RG-CLAIM-09 warns when the current PBP value differs from the recorded value.
- **Agent auto-generates claim records without human review.** Claim records contain `claimText`, `limitations`, and `reviewStatus` — editorial fields that require human authoring. An agent may be tempted to auto-generate claim records with `reviewStatus: verified` without verifying the source. The implementation notes below explicitly prohibit this — claim records for factual claims must be human-authored or human-reviewed.
- **RG-CLAIM-07 false positives during migration.** All migrated claims start with `expiresAt` from the original `validUntil`, which may be in the past. Mitigation: RG-CLAIM-07 is a warning, not an error — it does not block publication. Operators update `expiresAt` during the review window.
- **Migrator deletes claim sidecars.** Operators who manually created claim sidecars after migration will lose them on re-run. Mitigation: the migrator is idempotent — it only transforms sidecars that have not yet been migrated. If claim records already exist for the same `claimId`, the migrator skips that sidecar.

## Implementation notes for agents

- **Agents MUST NOT implement this RFC until it has status `accepted`.** Draft RFCs are proposals, not authorizations.
- **Agents MUST NOT auto-generate `claimText`, `limitations`, or `reviewStatus: verified` for factual claims.** These are editorial fields requiring human authoring. The migrator creates claim records with `reviewStatus: unverified` and empty `claimText` (when `statement` is absent) — the operator fills in the editorial content.
- **Agents MAY create claim record file structures** with `reviewStatus: unverified` from existing claim sidecar data. The migrator handles this transformation.
- **The migrator is idempotent.** If claim records already exist for the same `claimId`, the migrator MUST NOT overwrite them. It checks for existing claim records and skips.
- **The migrator deletes claim sidecars after transformation.** The claim sidecar (`surface/articles/{lang}/{slug}.claims.yaml`) is removed once the corresponding claim records are created. This is forward-only — no dual-path.
- **Agents MUST run the migrator via `mission.migrate`** — not by manually editing content files.
- **Agents MUST update `amendedBy` on RFC-0502** to include RFC-0505.
- **Agents MUST update `packages/os/site-kernel-checks/AGENTS.md`** to document the new `ratgeber-claim-validate.ts` module and the RG-PROV-03/RG-PROV-06 changes.
- **Agents MUST create PBT and snapshot tests for the `rfc-0505` migrator** (DNA-41, RFC-0479).
- Claim records are language-specific (`surface/claims/{lang}/`) because `claimText` is in the article's language. `sourceRefs` are language-independent (same external source).
- The `claimId` namespace is article-scoped: `{article-slug}-{claim-slug}`. This prevents ID collisions between articles while keeping IDs readable.
- The visitor-facing source display remains the Quellen section in the prose body (RFC-0501). The claim registry is the machine-readable backing — not rendered directly on the page.
- When implementing, reference RFC-0505 in commit messages.

## Acceptance criteria

- [x] `ratgeber.claim.validate` is implemented and registered in `tools/kernel.config.ts`. (evidence: `packages/os/site-kernel-checks/src/ratgeber-claim-validate.ts` + command registration)
- [x] Claim record Zod schema is exported from `@gogol/share/schemas`. (evidence: `packages/share/src/schemas/claim-records.ts` + re-export in `packages/share/src/schemas/index.ts`)
- [x] `ratgeber.claim.validate --site warpgogol-com --json` passes. (evidence: command output with `status: pass`)
- [x] RG-CLAIM-01..09 rules are implemented. (evidence: `packages/os/site-kernel-checks/src/ratgeber-claim-validate.ts` — all 9 rules present)
- [x] `ratgeber.provenance.validate` RG-PROV-03 checks claim records instead of sidecars. (evidence: `packages/os/site-kernel-checks/src/ratgeber-provenance-validate.ts` — RG-PROV-03 resolves against `surface/claims/`)
- [x] `ratgeber.provenance.validate` RG-PROV-06 checks article `claimIds` resolve to claim records. (evidence: `packages/os/site-kernel-checks/src/ratgeber-provenance-validate.ts` — RG-PROV-06 rule)
- [x] Migrator `rfc-0505` is registered in the migrator registry and transforms claim sidecars into claim records. (evidence: `packages/os/site-kernel-handoff/src/migrators/rfc-0505.ts` + `registry.ts` — migrator registered, PBT + snapshot tests pass)
- [x] Migrator deletes claim sidecars after transformation. (evidence: `packages/os/site-kernel-handoff/src/migrators/rfc-0505.ts` — sidecar file deletion logic)
- [x] `surface/claims/{lang}/*.md` collection schema and loader are ready for operator editorial work. Initial claim record files for the two reference articles will be authored by the operator during mission workpiece editing (Rollout step 8 — human editorial work). (evidence: `packages/os/site-kernel-checks/src/lib/surface-claims.ts` — loader reads `surface/claims/{lang}/*.md`; `packages/share/src/schemas/claim-records.ts` — Zod schema ready)
- [x] `rfc.validate RFC-0505` passes. (evidence: `pnpm exec site-kernel run rfc.validate RFC-0505 --json` — status: pass)
