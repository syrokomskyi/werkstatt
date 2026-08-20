---
id: ADR-0056
title: "Enforce Nachweis slug at Zod schema level, not only at runtime validation"
status: implemented
scope: package
decider: architecture
createdAt: 2026-08-20
updatedAt: 2026-08-20
implementedAt: 2026-08-20
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0880
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0056: Enforce Nachweis slug at Zod schema level, not only at runtime validation

## Context

RFC-0880 introduced the `NACHWEIS-SLUG-01` runtime validation rule in `nachweis.validate`, requiring a non-empty `slug` field in the frontmatter of `evidence-source` entities with Nachweis kinds (`client-statement`, `project-confirmation`, `certificate`, `operational-evidence`, `technical-assessment`).

However, the Zod schema in `packages/werkstatt-site/src/domain/pbp/schemas/evidence-source.ts` declares `slug` as `nonEmptyString.optional()`. This means the PBP compiler accepts files without `slug` without error. The runtime check only fires when `nachweis.validate` actually executes — which is part of `build.check` and can be skipped entirely when `mission.validate` takes the distribution-reuse fast path (matching `build-input-hash.json`).

During mission `warpgogol-com-m000077`, four `evidence-source` files without `slug` were discovered in the cache clone after they had already passed through a previous mission close and deployment. The root cause: the data was committed before RFC-0880 existed, and subsequent missions with matching build-input hashes skipped `build.check` entirely, so `nachweis.validate` never ran.

## Decision

Add a `superRefine` check to `evidenceSourceSchema` that rejects entities with Nachweis kinds when `slug` is absent or empty, producing a Zod validation error at parse time.

- The `slug` field remains `optional()` in the schema for non-Nachweis kinds (e.g. `external-web-sources`, `verified-record`, `third-party-registry`).
- The runtime `NACHWEIS-SLUG-01` check in `nachweis.validate` stays as defense-in-depth — it catches cases where data bypasses the PBP compiler (e.g. raw file reads in `readPbpEntitiesByType`).
- The `NACHWEIS_EVIDENCE_KINDS` set is defined locally in the schema file, not imported from `packages/werkstatt` (engine must not be imported by the stack plugin).

## Justification

- **Schema-level enforcement is earlier than runtime enforcement**: the PBP compiler runs in `build.prepare` (before `build.check`), so invalid data is rejected before any pipeline step that depends on it.
- **Distribution reuse cannot skip schema validation**: the PBP compiler always parses entity files when loading content collections, regardless of build-input hash matching.
- **The change is backward-compatible**: it only rejects data that RFC-0880 already declared invalid. All existing valid data (with `slug`) continues to parse successfully.
- **Alternatives considered**: making `slug` unconditionally required for all evidence-source kinds — rejected because non-Nachweis kinds (e.g. `external-web-sources`) do not use `slug` for route generation and have no contract requiring it.

## Consequences

- Positive: Invalid Nachweis evidence-source entities are caught at PBP parse time, before `build.check` runs — eliminating the distribution-reuse blind spot.
- Positive: The runtime `NACHWEIS-SLUG-01` check remains as a second layer of defense for code paths that read entity files directly (bypassing the PBP compiler).
- Negative: Agents creating new Nachweis evidence-source files must include `slug` from the start or face a Zod parse error during `build.prepare` — but this is already the contract per RFC-0880.
- Technical debt: The `NACHWEIS_EVIDENCE_KINDS` set is now defined in two places (schema file and `nachweis-validate.ts`). A future refactor could extract it to a shared location in `werkstatt-site` if more consumers need it.

## Evolution

- If the set of Nachweis evidence kinds changes (e.g. a new kind is added to `pbpEvidenceKindSchema`), both the schema `superRefine` and the runtime `NACHWEIS_EVIDENCE_KINDS` set must be updated in parallel.
- If a future RFC makes `slug` required for all evidence-source kinds (not just Nachweis), this `superRefine` can be removed in favor of making the field non-optional directly.
