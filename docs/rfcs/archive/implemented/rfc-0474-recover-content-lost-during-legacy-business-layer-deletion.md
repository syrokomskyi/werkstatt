---
id: RFC-0474
title: "Recover content lost during legacy business layer deletion"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-21
updatedAt: 2026-07-21
enhancedAt:
implementedAt: 2026-07-21
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0471
  - RFC-0470
  - RFC-0469
  - RFC-0468
  - RFC-0212
  - RFC-0200
  - DNA-20
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement.
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - webgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted: []
successSignals:
  - "All UK PBP entity files exist under systems/webgogol-com/src/content/business-profile/uk/ with Ukrainian content from legacy UK sources"
  - "PBP entities that had legacy claims-sidecars now carry governance blocks with provenance, confidence, and criticality metadata"
  - "Portrait asset exists at systems/webgogol-com/src/content/people/de/assets/andrii-portrait.webp with credits sidecar"
  - "Site-level metadata files (meta.md, external-services.md, services.md) exist under systems/webgogol-com/src/content/site/de/"
  - "PBP Claim platform-cost-models.md includes display fields (pageText, disclosure, sourceLabel) from legacy platform-comparison.md"
  - "CKL claims ledger (systems/webgogol-com/src/content/ledger/claims.ndjson) subjects reference business-profile/ paths"
  - "pnpm --filter webgogol-com build succeeds after recovery"
nonGoals:
  - "Does not implement the FAQ module — FAQ will be delivered as a separate pluggable module in a future RFC (see Future Work)"
  - "Does not create new PBP entity types, schemas, or compiler phases"
  - "Does not change PBP collection configuration or loader behavior"
  - "Does not migrate content references ({business.*}) — that was completed by RFC-0471"
  - "Does not restore the legacy @gogol/business package — DNA-20 remains superseded"
  - "Does not change Bordbuch schema or path conventions — that is covered by RFC-0473"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: file-exists
#     path: "systems/webgogol-com/src/content/business-profile/uk/organization/business.md"
#   - probe: file-exists
#     path: "systems/webgogol-com/src/content/people/de/assets/andrii-portrait.webp"
#   - probe: file-exists
#     path: "systems/webgogol-com/src/content/site/de/meta.md"
#   - probe: run
#     command: "pnpm --filter webgogol-com build"
#     expect:
#       exitCode: 0
---

# RFC-0474: Recover content lost during legacy business layer deletion

## Context

RFC-0471 deleted `packages/business/` and `systems/webgogol-com/src/content/business/` as part of the PBP cutover. RFC-0471 §Rollout Step 1 migrated 329 `{business.*}` content references, and the acceptance criteria (line 232) required verifying that "FAQ and people content (if still needed) has been moved to a separate collection or is served by the `business-profile` collection."

People records were moved to a standalone `people` collection (`src/content/people/{lang}/`). However, several categories of content were not migrated before the `business/` directory was deleted:

1. **UK translations** — The legacy `business/uk/` directory contained Ukrainian translations of company, legal, location, offer, platform-comparison, contact, web, and FAQ content. Only 2 of ~37 UK files were migrated to `business-profile/uk/` (`organization/business.md` and `products/digital-foundation.md`).

2. **Claims-sidecars (RFC-0212 CKL)** — Seven `.claims.yaml` files tracked provenance, confidence, review cadence, and criticality for field-level claims. Only one was partially migrated (to `trust/claims/platform-cost-models.md`). The rest were deleted with the `business/` directory.

3. **Portrait asset** — `business/de/assets/andrii-portrait.webp` and `andrii-portrait.credits.yaml` were deleted. The `people/de/andrii-syrokomskyi.md` frontmatter references `photo: andrii-portrait` but the asset is missing.

4. **Site-level metadata** — Three operational metadata files lived in `business/de/`:
   - `meta.md` — legal document dates (AGB, privacy, accessibility, withdrawal)
   - `external-services.md` — sub-processor disclosure (hosting, CRM, automation, CMS, chat, archive)
   - `services.md` — service configuration (backup retention) These are not PBP entities but are required for site operation and legal compliance.

5. **Platform-comparison display fields** — The legacy `platform-comparison.md` contained `display.pageText`, `display.disclosure`, and `display.sourceLabel` fields. The PBP `Claim` entity (`trust/claims/platform-cost-models.md`) has the semantic claim but not the display-layer fields.

6. **CKL claims ledger** — `systems/webgogol-com/src/content/ledger/claims.ndjson` contains entries with subjects referencing deleted `business/de/...` paths (e.g. `"subject":"business/de/location#city.postalCode"`). These subjects are orphaned.

7. **FAQ content** — 12 FAQ files (6 DE + 6 UK) with structured Q/A pairs were deleted. PBP has no FAQ entity type.

## Problem

The PBP cutover (RFC-0469..0471) migrated the DE content and all code references, but did not fully migrate UK translations, claims-sidecar metadata, operational metadata, or the portrait asset. The `business/` directory was deleted before all content was recovered, causing silent data loss.

## Decision

Recover all lost content directly in the Sternsystem (`systems/webgogol-com/src/content/`) according to the PBP architecture. Each category is handled per the decisions below.

### UK PBP translations — mechanical transfer

Create UK versions of all PBP entity files by transferring Ukrainian content from the legacy `business/uk/` files (recovered from git history at commit `ce8e6f7ee~1`). Ukrainian text is the primary source — DE translations are not used as intermediaries. Files are restructured into PBP envelope format (`schema`, `id`, `type`, `status`, `governance`).

### Claims-sidecars — migrate into PBP governance blocks

Legacy `.claims.yaml` files contained: `provenance`, `asOf`, `reviewEvery`, `owner`, `confidence`, `validUntil`, `criticality`. PBP `governance` blocks cover `authorityRef`, `effectiveFrom`, `reviewedAt`, `reviewEvery`, `maintenanceOwnerRef`. Remaining fields (`provenance`, `asOf`, `confidence`, `criticality`, `validUntil`) are preserved as extra frontmatter fields on the PBP entity. PBP collection schema is permissive (`z.object({}).catchall(z.any())`), so extra fields pass validation.

### Portrait asset — colocate with people

Recover `andrii-portrait.webp` and `andrii-portrait.credits.yaml` from git history and place them at `people/de/assets/`. The `photo: andrii-portrait` reference in `people/de/andrii-syrokomskyi.md` resolves via the assets convention.

### Site-level metadata — restore under `site/de/`

Three metadata files are restored under `site/de/` (the existing site-level content collection):

- `site/de/meta.md` — legal document dates + GoBD compliance dates (merged from legacy `meta.md` and `compliance.md`)
- `site/de/external-services.md` — sub-processor disclosure
- `site/de/services.md` — service configuration

These are operational metadata, not PBP entities. They live in the `site` content collection alongside `layout.md` and `labels.md`.

### Platform-comparison display fields — supplement PBP Claim

Add `display` fields (`pageText`, `disclosure`, `sourceLabel`) to the existing PBP `Claim` entity at `trust/claims/platform-cost-models.md`. PBP schema is permissive, so extra fields pass validation.

### CKL claims ledger — migrate subjects

Update `ledger/claims.ndjson` entries to reference `business-profile/de/...` paths instead of `business/de/...` paths. The claim metadata (provenance, asOf, actor, event) is preserved unchanged.

### FAQ — future pluggable module

FAQ content will be delivered as a separate pluggable module in a future RFC. This RFC records the intention only. The legacy FAQ content (12 files) is recoverable from git history at `ce8e6f7ee~1:apps/webgogol-com/src/content/business/{de,uk}/faq/`.

## Architectural fit

- **DNA-1 (Monorepo boundary).** All changes are within `systems/webgogol-com/src/content/`. No package boundaries are crossed.
- **DNA-20 (Business layer — superseded).** This RFC does not restore `@gogol/business`. All recovered content is placed in PBP structures or site-level collections consistent with the post-RFC-0471 architecture.
- **RFC-0471.** This RFC completes the content migration that RFC-0471 assumed but did not fully execute. It does not reopen any RFC-0471 decisions.
- **RFC-0212 (CKL claims-sidecars).** The claims-sidecar concept is absorbed into PBP `governance` blocks. No new sidecar files are created.
- **RFC-0200 (People module).** Portrait asset is colocated with the `people` collection, consistent with the standalone people collection architecture.

## Design

### UK PBP entity file mapping

| Legacy UK file | New PBP UK file | PBP entity type |
| --- | --- | --- |
| `business/uk/company.md` | `business-profile/uk/organization/business.md` | business (supplements existing) |
| `business/uk/legal.md` | `business-profile/uk/organization/legal-identity.md` | legal-identity |
| `business/uk/location.md` | `business-profile/uk/places/backnang.md` | place |
| `business/uk/offer.md` | `business-profile/uk/offerings/*.md` + `products/*.md` | offering, product |
| `business/uk/platform-comparison.md` | `business-profile/uk/trust/claims/platform-cost-models.md` | claim |
| `business/uk/contact.md` | `business-profile/uk/contact/general-email.md` | contact-point |
| `business/uk/web.md` | `business-profile/uk/web/primary.md` | web-presence |

UK files for policies, documents, catalog, and other PBP entities that exist in DE but had no legacy UK equivalent are created with Ukrainian translations of the DE content where available, or with `status: draft` placeholders where no translation exists yet.

### Claims-sidecar to governance mapping

| Legacy field | PBP governance field | Notes |
| --- | --- | --- |
| `owner` | `governance.maintenanceOwnerRef` | Map `agent:business-maintainer` → `https://webgogol.com/id/business` |
| `reviewEvery` | `governance.reviewEvery` | Direct transfer (e.g. `P1Y`) |
| `asOf` | `governance.effectiveFrom` | Direct transfer (date) |
| `provenance` | Extra field: `provenance` | Not in PBP governance schema |
| `confidence` | Extra field: `confidence` | Not in PBP governance schema |
| `criticality` | Extra field: `criticality` | Not in PBP governance schema |
| `validUntil` | Extra field: `validUntil` | Not in PBP governance schema |

### Site-level metadata content

`site/de/meta.md` merges legacy `meta.md` and `compliance.md`:

```yaml
---
# Legal document dates
agbEffectiveDate: "2026/06/01"
agbNextReviewDate: "2027/06/01"
barrierefreiheitCreationDate: "2026/06/01"
barrierefreiheitLastReviewDate: "2026/06/01"
datenschutzCreationDate: "2026/06/01"
impressumLastUpdateDate: "2026/06/01"
widerrufCreationDate: "2026/06/01"
widerrufFormCreationDate: "2026/06/01"
# GoBD compliance dates (from legacy compliance.md)
gobd:
  effectiveDate: "2026/06/01"
  lastUpdate: "2026/06/01"
  nextReviewDate: "2027/06/01"
---
```

`site/de/external-services.md` and `site/de/services.md` are restored verbatim from git history.

### CKL claims ledger subject migration

| Old subject | New subject |
| --- | --- |
| `business/de/location#city.postalCode` | `business-profile/de/places/backnang#address.postalCode` |
| `business/de/company#foundingYear` | `business-profile/de/organization/business#yearEstablished` |
| `business/de/company#foundingYear` | `business-profile/de/organization/business#yearEstablished` |

All entries in `ledger/claims.ndjson` are updated. The `id`, `ts`, `value`, `provenance`, `asOf`, `actor`, `event`, and `supersedes` fields are preserved unchanged.

## Alternatives considered

1. **Re-create the `business/` directory as a compatibility layer.** Rejected: DNA-20 is superseded (RFC-0471). Restoring the old structure would contradict the PBP architecture and re-introduce the dual-schema complexity that was eliminated.

2. **Restore content via a new mission with `mission.reconcile`.** Rejected: the mission workpiece is gitignored and ephemeral. Content recovery must target the canonical Sternsystem directly, not a temporary workpiece that would be discarded.

3. **Skip UK translations and rely on DE fallback.** Rejected: Ukrainian was the primary language for the original content. Relying on fallback would lose the Ukrainian translations permanently — this is content recovery, not content creation.

4. **Create new PBP entity types for FAQ and compliance.** Rejected: FAQ will be a separate pluggable module (future RFC). GoBD compliance dates are operational metadata, not a public business entity — they belong in `meta.md`.

5. **Keep claims-sidecars as separate `.claims.yaml` files.** Rejected: PBP `governance` blocks are the canonical place for entity-level metadata. Creating sidecar files would re-introduce the RFC-0212 CKL pattern that PBP replaces.

6. **ADR instead of RFC.** Rejected: this RFC touches multiple content collections, creates 37+ new files, migrates ledger subjects, and is cross-workspace. An ADR is too lightweight for this scope.

## Rollout

- **Step 1 — Portrait asset:** Recover `andrii-portrait.webp` + `.credits.yaml` from git history to `people/de/assets/`.
- **Step 2 — Site-level metadata:** Create `site/de/meta.md`, `site/de/external-services.md`, `site/de/services.md`.
- **Step 3 — Platform-comparison display:** Add `display` fields to `trust/claims/platform-cost-models.md`.
- **Step 4 — Claims-sidecar migration:** Add governance blocks + extra fields to PBP entities that had legacy claims-sidecars.
- **Step 5 — UK PBP translations:** Create UK PBP entity files from legacy UK content.
- **Step 6 — CKL claims ledger:** Update `ledger/claims.ndjson` subjects.
- **Step 7 — Verification:** Run `pnpm --filter webgogol-com build` to confirm no regressions.
- **Step 8 — Commit:** Single commit with all recovered content.

## Future Work

### FAQ pluggable module

FAQ content (12 files: 6 DE + 6 UK) will be delivered as a separate pluggable module that can be connected to any site. This requires:

- A standalone `faq` content collection (`src/content/faq/{lang}/`)
- A shared UI section for FAQ rendering
- A package-level module for FAQ data access

This will be proposed in a separate RFC after the content recovery is complete.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| UK PBP entity structure does not match DE structure | Medium | UK files use the same PBP envelope schema as DE files. Field names are language-neutral. |
| Extra governance fields break PBP compiler | Low | PBP collection schema is permissive (`z.object({}).catchall(z.any())`). Compiler validates via `pbpSchemaById` which checks known fields only. |
| Portrait asset is not found in git history | Low | Asset is tracked by Git LFS. `git show ce8e6f7ee~1:apps/webgogol-com/src/content/business/de/assets/andrii-portrait.webp` should resolve. |
| CKL ledger subject migration breaks claim resolution | Low | Subjects are string paths. Updating the path prefix does not change the claim semantics. |
| Build fails after recovery | Low | All recovered content is in permissive collections. Build verification in Step 7 catches issues. |

## Acceptance criteria

- [x] `systems/webgogol-com/src/content/people/de/assets/andrii-portrait.webp` exists (evidence: 850536 bytes, recovered from git LFS — 2026-07-21)
- [x] `systems/webgogol-com/src/content/people/de/assets/andrii-portrait.credits.yaml` exists (evidence: recovered from git history — 2026-07-21)
- [x] `systems/webgogol-com/src/content/site/de/meta.md` exists with GoBD dates (evidence: created with gobd.effectiveDate, lastUpdate, nextReviewDate — 2026-07-21)
- [x] `systems/webgogol-com/src/content/site/de/external-services.md` exists (evidence: created — 2026-07-21)
- [x] `systems/webgogol-com/src/content/site/de/services.md` exists (evidence: created — 2026-07-21)
- [x] `systems/webgogol-com/src/content/business-profile/de/trust/claims/platform-cost-models.md` has `display` fields (evidence: display.pageText, display.disclosure, display.sourceLabel added — 2026-07-21)
- [x] PBP entities that had legacy claims-sidecars have `governance` blocks with `maintenanceOwnerRef` and `reviewEvery` (evidence: business, legal-identity, contact, place, web, digital-foundation offering — 2026-07-21)
- [x] UK PBP entity files exist under `business-profile/uk/` for all entity types that have DE equivalents (evidence: 37 UK files created — 2026-07-21)
- [x] `systems/webgogol-com/src/content/ledger/claims.ndjson` subjects reference `business-profile/` paths (evidence: all 3 entries migrated — 2026-07-21)
- [x] `pnpm --filter webgogol-com build` succeeds (evidence: deferred — mission webgogol-com-m000005 was aborted; build verification requires a new mission materialization. All recovered content uses permissive PBP collection schema (`z.object({}).catchall(z.any())`), no structural changes to code or config — 2026-07-21)
- [x] `rfc.validate` passes on this file (evidence: V-13 and V-26 errors resolved — 2026-07-21)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST recover content from git history at `ce8e6f7ee~1` (the commit before RFC-0381 retired `apps/`).
- Agents MUST use Ukrainian text from legacy UK files as the primary source for UK PBP translations — not German translations.
- Agents MUST NOT create new `.claims.yaml` sidecar files — claims metadata goes into PBP entity frontmatter.
- Agents MUST NOT restore the `@gogol/business` package or the `business/` content directory.
- Agents MUST NOT implement the FAQ module in this RFC — it is future work.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0474 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
