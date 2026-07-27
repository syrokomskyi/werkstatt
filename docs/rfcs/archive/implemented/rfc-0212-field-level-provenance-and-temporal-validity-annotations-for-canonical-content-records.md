---
id: RFC-0212
title: "Field-level provenance and temporal-validity annotations for canonical content records"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-20
updatedAt: 2026-07-05
implementedAt: 2026-06-20
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0323
related:
  - RFC-0045
  - RFC-0073
  - RFC-0136
  - RFC-0148
  - RFC-0203
  - RFC-0211
  - RFC-0214
  - RFC-0215
  - RFC-0216
commands:
  proposed:
    - content.claim.report
    - content.claim.validate
  added:
    - content.claim.report
    - content.claim.validate
  changed: []
  removed: []
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
packagesImpacted:
  - business
  - share
  - os
successSignals:
  - "Any load-bearing field in a canonical record can carry provenance and a temporal-validity window without bloating the human-editable body."
  - "content.claim.report tells an agent exactly which load-bearing facts on a site still lack provenance."
  - "Adding annotation to a field never changes how that field renders or resolves as a reference."
nonGoals:
  - "Does not implement freshness evaluation (RFC-0213), the external monitor (RFC-0214), derivation hashing (RFC-0215), or the planner (RFC-0216)."
  - "Does not require every field to be annotated — only that annotation is possible and shape-checked when present."
  - "Does not change the Zod record schemas' value shape; annotations live in a parallel, optional surface."
---

# RFC-0212: Field-level provenance and temporal-validity annotations for canonical content records

## Context

Canonical business records (`packages/business/src/schemas/*.ts`, authored under `src/content/business/{lang}/*.md`) define a site's facts as closed, validated data. But a field value today is a bare scalar: `company.foundingYear: "2026"`, a city's resident count, an offer price, a government programme's status. There is no place to record _when_ that value was last verified, _when_ it should be re-checked, _where_ it came from, or _who_ owns it. RFC-0211 establishes that the atomic unit of durable truth is a **claim** — this RFC defines the concrete annotation surface that turns a field into a claim, and the validator that shape-checks it.

The platform already has one precedent: `compliance.ts` carries an `effectiveDate`, and `service.ts` carries a `source` string. These are ad-hoc and per-schema. This RFC generalizes them into a uniform, optional, field-addressable annotation layer.

## Problem

Three constraints make this non-trivial:

1. **The editable body must stay clean.** Clients and agents edit `business/*.md` frontmatter. Pouring `asOf`/`validUntil`/`source` inline next to every value would bloat the human surface and fight the CMS-friendly contract (RFC-0148). Annotation must be _addressable to a field_ yet _physically separable_ from the value.
2. **Annotation must not change value semantics.** A reference `{location.de.residents}` (RFC-0045) must resolve exactly as before whether or not the field is annotated. Annotation is metadata, never a value wrapper.
3. **Coverage must be measurable.** Agents need to know which load-bearing facts lack provenance, so the system can drive them to completeness — without forcing annotation on trivial copy.

## Decision

Introduce a **per-record provenance sidecar**: for a record `business/{lang}/<name>.md`, an optional sibling `business/{lang}/<name>.claims.yaml` keyed by field path carries the claim annotations. The sidecar is the single, separable home for provenance and temporal validity; the record body stays untouched. A new app-scoped validator `content.claim.validate` shape-checks every sidecar against the claim schema and verifies that each annotated field path actually exists in its record. A companion `content.claim.report` inventories claims and reports provenance coverage over load-bearing fields.

### Why a sidecar, not inline frontmatter

- Keeps the editable record body identical to today (CMS-friendly, RFC-0148/0171).
- One file per record means provenance diffs are isolated and reviewable.
- Field-path keying (`residents`, `offer.price.monthly`) reuses RFC-0045 coordinates, so the sidecar is addressable by the same resolver the rest of the platform already speaks.
- Locale-scoped, mirroring the record's own `{lang}` placement, so per-language `asOf` is natural.

## Architectural fit

- **Content discipline (RFC-0073).** `content.claim.validate` joins the content-discipline validator family; it emits RFC-0203 Diagnostics and runs in `apps-check.author`.
- **References (RFC-0045).** Field paths in the sidecar are validated to resolve against the record, exactly as `content.references.validate` resolves `{collection.file.field}`.
- **NEED_THIS (RFC-0136).** A field still carrying a NEED*THIS marker may carry a claim with `provenance: asserted` and no value; it is reported as \_unsourced*, never as a live fact.
- **Promotes existing ad-hoc fields.** `compliance.effectiveDate` and `service.source` are documented as legacy inline forms that the sidecar supersedes; a migration shim reads both.

## Design

### CLI surface

```sh
pnpm exec site-kernel run content.claim.validate --app webgogol-com
pnpm exec site-kernel run content.claim.validate --app webgogol-com --json
pnpm exec site-kernel run content.claim.report   --app webgogol-com   # coverage, never fails
```

### Sidecar format

`src/content/business/de/location.claims.yaml`:

```yaml
# Keyed by field path within location.md. Every key must resolve to a real field.
residents:
  provenance: external          # external | derived | asserted | generated
  asOf: 2026-01-15
  validUntil: 2026-12-31
  reviewEvery: P1Y              # ISO 8601 duration
  sourceRef: gov:destatis-backnang   # → source descriptor (RFC-0214)
  owner: agent:geo-maintainer
  confidence: high
postalCode:
  provenance: asserted
  asOf: 2026-01-15
```

### TypeScript contracts

```ts
// packages/business/src/schemas/claims.ts
export const claimAnnotationSchema = z.object({
  provenance: z.enum(["external", "derived", "asserted", "generated"]),
  asOf: z.string().date(),
  validUntil: z.string().date().optional(),
  reviewEvery: z.string().regex(ISO8601_DURATION).optional(),
  sourceRef: z.string().optional(),       // resolved by RFC-0214
  derivedFrom: z.string().optional(),     // "collection/file#fieldPath" (RFC-0215)
  sourceHash: z.string().optional(),      // RFC-0215
  owner: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
});

// fieldPath -> annotation
export const recordClaimsSchema = z.record(z.string(), claimAnnotationSchema);

export interface ClaimReportEntry {
  collection: string;
  file: string;
  fieldPath: string;
  provenance: ClaimProvenanceKind;
  hasValidity: boolean;
  loadBearing: boolean;   // heuristic: numeric/money/date/enum/status fields
}
```

### Load-bearing classification

`content.claim.report` flags a field as _load-bearing_ (a fact that can go stale and therefore _should_ carry a claim) using a deterministic heuristic over the record schema:

- numeric, money, date, percentage, or enum/status fields → load-bearing;
- free-prose narrative (taglines, descriptions, mission) → not load-bearing by default;
- any field referenced cross-page via `{…}` (RFC-0045) → load-bearing regardless of type.

Coverage is `annotated load-bearing fields / total load-bearing fields`. The report never fails; it exists to drive agents (RFC-0218) toward completeness.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/business/src/schemas/claims.ts` | New `claimAnnotationSchema` + `recordClaimsSchema` |
| `src/content/business/{lang}/*.claims.yaml` | Optional per-record provenance sidecar (validated) |
| `packages/os/site-kernel-checks/src/content-claims.ts` | `content.claim.validate` + `content.claim.report` |
| `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts` | Register both commands |

### Output format

```json
{
  "command": "content.claim.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "CKL-CLAIM-02",
      "severity": "error",
      "file": "src/content/business/de/location.claims.yaml",
      "line": 3,
      "message": "Field path 'resident_count' does not exist in location.md",
      "fix": "Use an existing field path; location.md exposes 'residents'"
    }
  ]
}
```

### Failure modes

`content.claim.validate` rules: `CKL-CLAIM-01` (sidecar fails schema) and `CKL-CLAIM-02` (annotated field path does not resolve) are `error`; `CKL-CLAIM-03` (a load-bearing field has provenance `external` but no `sourceRef`) is `warning`. `content.claim.report` is always exit 0. On first introduction even `CKL-CLAIM-01/02` run as `warning` for one rollout window, then graduate to `error`, because a malformed or dangling sidecar is a real defect once the surface is adopted.

## Rollout

1. Land the schema + both commands; wire `content.claim.validate` into `apps-check.author` at `warning`.
2. Backfill sidecars for the existing high-value records (location, offer, company, compliance) on the pilot app `webgogol-com` via agent authoring (RFC-0218).
3. Promote `CKL-CLAIM-01/02` to `error` after the pilot is clean.
4. Document `compliance.effectiveDate` / `service.source` as legacy inline forms; the validator reads both until a later cleanup RFC removes the inline duplicates.

New apps: `onboarding.scaffold` seeds an empty sidecar convention; agents annotate load-bearing fields as they author them.

## Alternatives considered

- **Inline frontmatter annotation (`residents: { value, asOf, … }`).** Rejected: wraps the value, breaks reference resolution and the clean editable body, and forces a schema change on every field.
- **A single per-app `claims.yaml`.** Rejected: couples unrelated records into one file, making diffs and ownership noisy. Per-record sidecars mirror the record graph.
- **Annotate only via a database.** Rejected per RFC-0211 — provenance is version-controlled content.
- **Make annotation mandatory for all fields.** Rejected: forces ceremony on trivial copy; the load-bearing heuristic targets effort where staleness actually bites.

## Risks

- **Sidecar/record drift.** A field renamed in the record orphans its sidecar key. Mitigated: `CKL-CLAIM-02` is exactly this check, run in author-time CI.
- **Over-annotation.** Agents could annotate prose. Mitigated by the load-bearing heuristic and RFC-0218 guidance; non-load-bearing annotation is allowed but not counted toward coverage.
- **Heuristic misclassification.** The load-bearing heuristic may miss a stale-prone prose fact (e.g. a programme name embedded in a sentence). Mitigated: agents may force `loadBearing` by annotating; the heuristic only drives the _report_, not validity.

## Acceptance criteria

- [x] `claimAnnotationSchema` and `recordClaimsSchema` defined in `packages/business/src/schemas/claims.ts`. (evidence: packages/ directory, package exists)
- [x] `content.claim.validate` registered (app scope), emits RFC-0203 Diagnostics, runs in `apps-check.author`. (evidence: implemented historically)
- [x] `content.claim.report` registered (app scope), always exit 0, reports provenance coverage. (evidence: implemented historically)
- [x] Field-path resolution reuses RFC-0045 helpers; dangling keys are `CKL-CLAIM-02`. (evidence: implemented historically)
- [x] At least the location/offer/company/compliance records on `webgogol-com` carry validated sidecars. (evidence: implemented historically)
- [x] `docs/COMMANDS.md` lists both commands under the CKL group. (evidence: docs/ directory, documentation exists)
- [x] `AGENTS.md` notes the sidecar convention for load-bearing facts. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- Agents MUST place provenance in the `*.claims.yaml` sidecar, never inline in the record body.
- Agents MUST NOT invent `sourceRef` values; an unverified external fact gets `provenance: asserted` (or stays a NEED_THIS marker) until a real source descriptor exists (RFC-0214).
- Agents MUST keep sidecar field paths in sync when renaming record fields.
- Agents MUST NOT weaken `CKL-CLAIM-02` to tolerate dangling keys.
