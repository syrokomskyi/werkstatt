---
id: RFC-0502
title: "Ratgeber editorial provenance — authors, sources, claims, and review metadata"
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
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0500
amendedBy:
  - RFC-0505
related:
  - RFC-0193
  - RFC-0211
  - RFC-0214
  - RFC-0325
  - RFC-0478
  - RFC-0479
  - RFC-0480
  - RFC-0500
  - RFC-0501
  - RFC-0503
satisfies:
  - DNA-16
  - DNA-24
  - DNA-53
breaksC: false
versionBump: minor
commands:
  proposed:
    - ratgeber.provenance.validate
  added:
    - ratgeber.provenance.validate
  changed:
    - source.binding.validate
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - "@gogol/surface"
  - "@gogol/site-kernel-checks"
  - "@gogol/share"
  - "@gogol/site-kernel-handoff"
successSignals:
  - "A new content collection surface/authors/{lang}/*.md holds author records with id, name, role, bio, and contact URL."
  - "Every published article references an author via authorId that resolves to an author record."
  - "Article sources reference CKL source descriptors (RFC-0214) and claim IDs (RFC-0211)."
  - "ratgeber.provenance.validate checks that every authorId resolves, every sourceId resolves, and every claimId exists in the claim sidecar."
  - "Article pages display author name, review date, and sources in the page footer."
  - "The Quellen section in the prose body lists all referenced sources with titles and URLs."
nonGoals:
  - "Does not change the CKL claim model (RFC-0211) or source descriptor schema (RFC-0214) — this RFC reuses them."
  - "Does not create a people directory — authors are a ratgeber-specific collection, not a platform-wide people collection."
  - "Does not add author profile pages — author information is displayed inline on article pages."
  - "Does not define the editorial review workflow — that is RFC-0503."
---

# RFC-0502: Ratgeber editorial provenance — authors, sources, claims, and review metadata

## Context

RFC-0500 introduced the `articles` collection with `authorId` and `sources` fields. This RFC defines the author collection, the source and claim binding, and the provenance validation that ensures every published article has traceable editorial provenance.

The platform already has a CKL (Content Knowledge Lifecycle) claim model (RFC-0211) and source descriptor system (RFC-0214). This RFC reuses both — it does not create a parallel provenance system.

## Problem

1. **No author records.** The current ratgeber articles have an `author` field set to "Andrii Syrokomskyi" — a plain string. There is no author collection, no author metadata (role, bio, contact), and no way to reference the same author across multiple articles consistently.

2. **No source binding.** Articles make factual claims (prices, statistics, regulations) but do not bind those claims to external sources via the CKL system. There is no way to trace a claim in the prose back to a source descriptor.

3. **No provenance validation.** There is no validator that checks article sources resolve to CKL source descriptors and claim IDs exist in claim sidecars.

4. **No provenance display.** Article pages do not display author name, review date, or sources in the page footer. Readers cannot see who wrote the article, when it was last reviewed, and what sources were used.

## Decision

### Author collection

New content collection `surface/authors/{lang}/*.md`:

```yaml
id: andrii-syrokomskyi
name: "Andrii Syrokomskyi"
role: "Redakteur"
bio: "Betreut den Ratgeber seit 2026. Hintergrund in Webentwicklung und digitalem Fundament für kleines Gewerbe."
contactUrl: "https://webgogol.com/kontakt"
```

Required fields: `id`, `name`, `role`, `bio`.

Optional fields: `contactUrl`.

The `id` field is the stable identifier referenced by `authorId` in article records.

### Source binding

Article records (from RFC-0500) carry a `sources` field:

```yaml
sources:
  - sourceId: internal-pricing
    claimIds:
      - pricing-setup-fee
      - pricing-monthly-base
  - sourceId: gov:destatis-backnang
    claimIds:
      - population-backnang
```

- `sourceId` must resolve to a source descriptor in `integrations/truth-sources/*.yaml` (RFC-0214).
- `claimIds` must exist as keys in the article's claim sidecar (`surface/articles/{lang}/{slug}.claims.yaml`).

The field is named `sourceId` (not `sourceRef` as in CKL claim annotations) because it lives in the article record's frontmatter, not in a claim annotation. `sourceRef` in the CKL system is a field _within_ a claim annotation that points to a source descriptor. `sourceId` here is the article-level binding that groups claim IDs under a common source. Both resolve to the same source descriptor registry — the naming difference reflects the different structural role (article-level grouping vs. per-claim provenance pointer).

### Claim sidecars

Each article may have a claim sidecar at `surface/articles/{lang}/{slug}.claims.yaml` following the existing CKL claim sidecar format (RFC-0211/0212). The sidecar is a map of claim ID → `ClaimAnnotation`, validated by `recordClaimsSchema` from `@gogol/share/schemas`:

```yaml
pricing-setup-fee:
  provenance: asserted
  asOf: 2026-07-23
  sourceRef: internal-pricing
  confidence: high
  validUntil: 2026-12-31
population-backnang:
  provenance: external
  asOf: 2026-07-23
  sourceRef: gov:destatis-backnang
  confidence: high
  validUntil: 2026-12-31
```

Required fields per `claimAnnotationSchema`: `provenance` (enum: `external | derived | asserted | generated`) and `asOf` (ISO date). All other fields shown above are optional. This reuses the existing `recordClaimsSchema` from `@gogol/share/schemas` — no new schema is introduced.

The existing `collectClaimSidecars` function in `content-claims.ts` currently scans `paths.businessDirectory`. The `ratgeber.provenance.validate` validator loads article claim sidecars directly from `surface/articles/{lang}/` — it does not rely on `collectClaimSidecars`. The `source.binding.validate` command is updated to also scan article claim sidecars alongside business claim sidecars, so sourceRef resolution covers both collections.

### Provenance display

The `bakeRatgeberArticle` baker (from RFC-0500) is extended to emit a provenance footer block as the final block in the page — after the closing CTA. Provenance metadata is editorial attribution, not a call to action; placing it last follows the convention that attribution and source listings appear at the end of an article (cf. Wikipedia references, scholarly article appendices).

The provenance footer is a `markdown` block (the same block type used for the article body and FAQ entries) appended to `blocks[]`:

- **Author name** — from the author record `name`.
- **Author role** — from the author record `role`.
- **Review date** — from the article record `reviewedAt`.
- **Sources** — list of source titles (from source descriptors) with URLs (if `endpoint` is present).

The provenance footer is a markdown block with the heading "Redaktion" (DE) / "Редакція" (UK). Using the `markdown` block type keeps the page block-declarative (DNA-24) — the footer is a `blocks[]` entry with `props.contentRef` or inline markdown, not a route-level construct.

### Quellen section

The mandatory `## Quellen` section (RFC-0501) in the prose body must list all referenced sources. The validator checks that every `sourceId` in the article record's `sources` field appears in the Quellen section.

## Architectural fit

- **RFC-0500:** amends — defines the author collection and source binding that RFC-0500's article record references.
- **RFC-0211 (CKL claim model):** reuses — article claim sidecars use the same `recordClaimsSchema`.
- **RFC-0214 (source descriptors):** reuses — article `sourceId` references the same source descriptor registry. This is reuse, not an amendment — the source descriptor schema and registry are unchanged.
- **RFC-0478:** `versionBump: minor` — new collection and validator are Breaks-B.
- **RFC-0480:** `breaksC: false` — no external surface contract changes. The provenance footer is an internal page block, not a URL, JSON-LD type, or sitemap shape change.
- **DNA-16 (semantic outputs):** The provenance footer is a visual page block only. It does not add new JSON-LD fields or change the sitemap. Article JSON-LD already includes `author` via the existing `authorId` field — this RFC adds the author _record_ that the field resolves to, but the JSON-LD emission shape is unchanged. DNA-16 is satisfied because the author record's `name` feeds into the existing `author` JSON-LD property without introducing a new topology.
- **DNA-24 (block-declarative pages):** The provenance footer is a `markdown` block appended to `blocks[]` in `bakeRatgeberArticle`. It is not a route-level construct or a special section outside the block contract. DNA-24 is satisfied because the footer follows the same block-declarative pattern as all other page content.
- **DNA-53 (semantic fingerprint governance):** The author record and source bindings are new content collections, not changes to the semantic hash computation itself. The `platform.consistency.validate` hash will change because new files are added, but `versionBump: minor` is declared, so the hash change is expected and governed. DNA-53 is satisfied because the version bump is declared.

## Design

### CLI surface

```sh
pnpm exec site-kernel run ratgeber.provenance.validate --site webgogol-com --json
```

Site-scoped, runs in `build.check`.

Exit codes: `0` = pass (no errors, warnings allowed), `1` = error (at least one RG-PROV-01/02/03/04 violation), `2` = warning-only (RG-PROV-05 only).

`--json` output follows the standard `KernelCommandResult<CheckResult>` shape:

```json
{
  "commandName": "ratgeber.provenance.validate",
  "ok": true,
  "data": {
    "command": "ratgeber.provenance.validate",
    "status": "pass",
    "diagnostics": [
      {
        "ruleId": "RG-PROV-01",
        "severity": "error",
        "file": "surface/articles/de/website-kosten.md",
        "line": 3,
        "message": "authorId \"jane-doe\" does not resolve to an author record",
        "fixHint": "Create surface/authors/de/jane-doe.md or fix the authorId."
      }
    ]
  },
  "exitCode": 0
}
```

### TypeScript contracts

```ts
interface AuthorRecord {
  id: string;
  name: string;
  role: string;
  bio: string;
  contactUrl?: string;
}

interface ArticleSourceBinding {
  sourceId: string;
  claimIds: string[];
}
```

### Failure modes

| Rule | Severity | Description |
| --- | --- | --- |
| `RG-PROV-01` | error | `authorId` does not resolve to an author record |
| `RG-PROV-02` | error | `sourceId` does not resolve to a source descriptor |
| `RG-PROV-03` | error | `claimId` not found in article claim sidecar |
| `RG-PROV-04` | error | Source listed in `sources` but not in Quellen section |
| `RG-PROV-05` | warning | Article has no sources (non-blocking for `grundlagenartikel` and `begriffserklaerung`) |

The `grundlagenartikel` and `begriffserklaerung` types are exempt from RG-PROV-05 because these article types are definitional and conceptual — a glossary entry explaining "What is CSS?" or a foundational article explaining "How web hosting works" may legitimately have no external sources. All other article types (`methodik`, `entscheidungshilfe`, `checkliste`, `vergleich`, `rechenmodell`) make factual claims that require sourcing.

### Edge cases

- **No author records exist:** The validator passes with zero diagnostics — no articles can reference a non-existent author because RFC-0500's migrator already set `authorId` on all articles. If an article references an authorId and no author record exists, RG-PROV-01 fires.
- **Article has `sources: []`:** RG-PROV-05 fires (warning for non-exempt types, suppressed for exempt types). An empty array is treated the same as a missing field.
- **Article has no claim sidecar:** RG-PROV-03 does not fire for articles with no `claimIds` in their `sources` field. If `claimIds` are listed but the sidecar file is missing, RG-PROV-03 fires for each listed claimId.
- **Source descriptor exists but is unreachable:** This is a CKL-SRC-04 concern (from `source.binding.validate`), not a provenance validation concern. `ratgeber.provenance.validate` only checks that `sourceId` resolves to a descriptor, not that the descriptor's endpoint is reachable.

### Performance estimate

The validator scans: author records (~1–10 files), source descriptors (~5–20 files), article claim sidecars (~10–50 files), and article prose files for Quellen section coverage (~10–50 files). Total I/O: ~30–130 file reads per site. This is comparable to `ratgeber.article.validate` and well within build-check latency budgets.

### False-positive analysis (RG-PROV-04)

The Quellen section coverage check matches `sourceId` strings in the prose body's `## Quellen` section. Partial matches are avoided by matching the full `sourceId` string (e.g., `gov:destatis-backnang` must appear as a complete string, not as a substring). If a source is renamed in the descriptor registry, the article's `sourceId` must be updated to match — the validator will flag the old `sourceId` as unresolved (RG-PROV-02) and the new `sourceId` as missing from Quellen (RG-PROV-04).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/ratgeber-provenance-validate.ts` | New: validator |
| `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-article.ts` | Updated: provenance footer block |
| `packages/os/site-kernel-checks/src/lib/surface-articles.ts` | Updated: load author records |
| `packages/os/site-kernel-checks/src/content-source-binding.ts` | Updated: check article claim sidecars |
| `packages/os/site-kernel-handoff/src/migrators/rfc-0502.ts` | New: migrator — creates initial author record file |
| `tools/kernel.config.ts` | Register `ratgeber.provenance.validate` |
| `docs/verification-plan.xml` | Add check |
| `docs/COMMANDS.md` | Add command |

## Rollout

1. Implement migrator `rfc-0502.ts` — creates `surface/authors/{lang}/andrii-syrokomskyi.md` with initial author record. Idempotent: if the file already exists, the migrator is a no-op.
2. Implement `ratgeber.provenance.validate`.
3. Update `bakeRatgeberArticle` with provenance footer.
4. Create claim sidecars for articles with factual claims.
5. Register source descriptors in `integrations/truth-sources/` as needed.
6. Register command in `tools/kernel.config.ts`.
7. Run `ratgeber.provenance.validate --site webgogol-com`.

## Alternatives considered

1. **Extend the existing `people` collection instead of creating a new `authors` collection.** Rejected because the `people` collection is platform-wide (PBP program, RFC-0398) and carries business-profile semantics (roles, offerings, evidence). Ratgeber authors are an editorial concept — a person who writes articles — not a business entity. Mixing the two would conflate editorial provenance with business identity.

2. **Store provenance metadata directly in the article record instead of using CKL claim sidecars.** Rejected because the CKL claim model (RFC-0211) already provides a provenance sidecar with `provenance`, `asOf`, `validUntil`, `sourceRef`, and `confidence` fields. Creating a parallel provenance system would violate the one-model principle and duplicate the source descriptor resolution machinery.

3. **Add provenance as a JSON-LD-only concern (no visual footer).** Rejected because readers benefit from seeing who wrote an article and what sources were used. A visual footer builds trust and is standard practice for editorial content. The JSON-LD `author` property is already emitted via `authorId` — this RFC adds the human-visible display, not the machine-readable output.

4. **Use `sourceRef` instead of `sourceId` in the article record's `sources` field.** Rejected because `sourceRef` is a field _within_ a CKL claim annotation — it points from a single claim to its source. The article record's `sources` field is an article-level grouping that binds multiple claim IDs to a common source descriptor. Using `sourceId` distinguishes the structural role: article-level grouping vs. per-claim pointer. Both resolve to the same source descriptor registry.

## Risks

1. **Migrator creates author record that operators may want to edit.** The migrator creates `surface/authors/{lang}/andrii-syrokomskyi.md` with a default bio and contact URL. Operators may want to customize the bio text. This is handled by the mission workflow: the migrator runs during `mission.migrate`, then the operator can edit the workpiece before `release.prepare`. The migrator is idempotent — if the operator has already customized the file, re-running the migrator is a no-op.

2. **Claim sidecar collection path mismatch with existing CKL scanners.** The existing `collectClaimSidecars` scans `paths.businessDirectory`, not `surface/articles/`. The `ratgeber.provenance.validate` validator loads article sidecars directly. The `source.binding.validate` command is updated to scan both paths. If this update is missed, article claim sidecars will not be checked for sourceRef resolution — but `ratgeber.provenance.validate` independently checks `sourceId` resolution, so the risk is mitigated.

3. **Quellen section false positives from sourceId renaming.** If a source descriptor is renamed, the article's `sourceId` and the Quellen section must both be updated. The validator flags both RG-PROV-02 (old sourceId unresolved) and RG-PROV-04 (new sourceId missing from Quellen), making the rename visible. This is a two-step fix, not a silent failure.

4. **Agent auto-generates claim sidecars without human review.** Claim sidecars contain provenance assertions (who said this, when, how confident). An agent may be tempted to auto-generate sidecars with `provenance: asserted` and `confidence: high` without verifying the source. The implementation notes below explicitly prohibit this — claim sidecars for factual claims must be human-authored or human-reviewed.

## Implementation notes for agents

- **Agents MUST NOT implement this RFC until it has status `accepted`.** Draft RFCs are proposals, not authorizations.
- **Agents MUST NOT auto-generate claim sidecars for factual claims.** Claim sidecars contain provenance assertions — `provenance`, `asOf`, `confidence` — that require human verification. An agent may create the sidecar file structure, but the provenance fields must be filled by a human or explicitly human-reviewed.
- **Agents MAY create author record files** — these are editorial metadata (name, role, bio), not factual claims. The bio text should be drafted by the operator or agent and reviewed by the operator.
- **The migrator is idempotent.** If `surface/authors/{lang}/andrii-syrokomskyi.md` already exists, the migrator MUST NOT overwrite it. It checks for file existence and returns early.
- **The provenance footer block is a `markdown` block**, not a new block type. Agents MUST NOT create a new block type for the footer — use the existing `markdown` block with inline content or a `contentRef`.
- **The `source.binding.validate` update MUST scan both `paths.businessDirectory` and `surface/articles/{lang}/` for claim sidecars.** Missing either path leaves claim sidecars unchecked for sourceRef resolution.

## Acceptance criteria

- [x] `surface/authors/{lang}/*.md` created with initial author record. (evidence: `packages/os/site-kernel-handoff/src/migrators/rfc-0502.ts` creates `surface/authors/{lang}/andrii-syrokomskyi.md`)
- [x] Every published article's `authorId` resolves to an author record. (evidence: `packages/os/site-kernel-checks/src/ratgeber-provenance-validate.ts` RG-PROV-01)
- [x] Every `sourceId` resolves to a source descriptor. (evidence: `packages/os/site-kernel-checks/src/ratgeber-provenance-validate.ts` RG-PROV-02)
- [x] Every `claimId` exists in the article's claim sidecar. (evidence: `packages/os/site-kernel-checks/src/ratgeber-provenance-validate.ts` RG-PROV-03)
- [x] Article pages display provenance footer. (evidence: `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-article.ts` `buildProvenanceFooter`)
- [x] `rfc.validate` passes. (evidence: `pnpm exec site-kernel run rfc.validate --root docs/rfcs/rfc-0502-ratgeber-editorial-provenance-authors-sources-claims.md` — only V-19 warning)
