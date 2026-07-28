---
id: RFC-0488
title: "Redesign the material credits page as a provenance registry"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-22
updatedAt: 2026-07-22
enhancedAt: 2026-07-22
implementedAt: 2026-07-22
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0220
  - RFC-0232
amendedBy: []
related:
  - RFC-0220
  - RFC-0223
  - RFC-0227
  - RFC-0228
  - RFC-0231
  - RFC-0232
  - RFC-0141
  - RFC-0152
  - RFC-0204
  - RFC-0210
  - RFC-0480
satisfies:
  - DNA-4
  - DNA-5
breaksC: false
versionBump: minor
commands:
  proposed: []
  added:
    - material.credits.validate
    - material.credits.generate
    - material.credits.report
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-handoff"
successSignals:
  - "The credits page shows each material as a card with preview, type badge, human-readable source status, usage locations, AI participation details, and a stable anchor — not a flat text list with raw enum values."
  - "Internal enum values (commissioned-warpgogol-material, linked-public-source, AIPlatform, Organization) are never shown to visitors; they are mapped to localized human-readable labels."
  - "AI-generated materials display a nuanced copyright status instead of automatically claiming 'Copyright © Warpgogol. All rights reserved.'"
  - "Third-party materials (Stuttgart Marathon photo, Komoot screenshot) either have a verified usageBasis or are removed from the site."
  - "Each material card has a stable URL anchor (/bildnachweise/#warpgogol-promo-video) that deep-links from other pages."
  - "Repetitive copyright boilerplate is replaced by per-material usage status; a single explanatory text appears once at the bottom."
  - "Broken previews (single-letter placeholders, orphan 'Image' entry) are eliminated; build fails on missing previews for active records."
  - "material.credits.validate enforces: every active record has a preview, every third-party record has a usageBasis, Organization is never the author of a human-made work, AI-generated works don't auto-claim copyright."
nonGoals:
  - "Does not create a new top-level content domain — credits sidecars stay beside their owning content assets (RFC-0047)."
  - "Does not write C2PA/IPTC/XMP embedded metadata — that remains a future RFC."
  - "Does not change the URL of the credits page (/bildnachweise/ is preserved)."
  - "Does not change the inline disclosure behavior on non-credits pages (RFC-0231 visibility policy is unchanged)."
  - "Does not modify the homepage, impressum, datenschutz, or footer — cross-page changes are deferred to their own expert-file sessions."
  - "Does not add client-side filtering or interactive search — the page is server-rendered; filters are a possible future enhancement."
  - "Does not introduce `contentHash`, `verifiedAt`, or `verifiedBy` fields — these are deferred to a future RFC that also adds validation rules using them. No current validator or renderer consumes them."
---

# RFC-0488: Redesign the material credits page as a provenance registry

## Context

RFC-0220 introduced site-wide material credits with a structured sidecar schema (`*.credits.yaml`), a generated credits page, JSON-LD projection, and a fail-hard validator. RFC-0232 upgraded the page from a flat markdown list to a media gallery with computed previews. The current state is functional but has significant gaps that an external expert review (file 11) has identified:

### Current problems

1. **Raw enum values shown to visitors.** The credits page outputs internal values like `commissioned-warpgogol-material`, `linked-public-source`, `screenshot-of-linked-public-source`, `AIPlatform`, and `Organization` directly in the visible `<dl>` metadata. These are internal codes, not public language.

2. **Repetitive copyright boilerplate.** Every material card repeats `Copyright © 2026 Warpgogol. All rights reserved unless otherwise stated.` even when the material is AI-generated (where the claim is legally questionable) or third-party (where the claim is false).

3. **AI-generated materials auto-claim copyright.** The default `copyrightNotice` is applied uniformly. For fully AI-generated output, German copyright law (§ 2 Abs. 2 UrhG) requires human creative contribution; an organization cannot automatically be the author. The current schema and rendering do not distinguish.

4. **Organization as author.** For human-made materials (e.g. the Andrii Syrokomskyi portrait), the `creator` is listed as `Warpgogol (Organization)`. In Germany, only a natural person can be an Urheber (§ 7 UrhG). The schema allows this but the rendering should clarify the role.

5. **Third-party materials lack verified usage basis.** The Stuttgart Marathon photo uses `linked-public-source` as its license label, which is not a legal basis. The Komoot screenshot uses `screenshot-of-linked-public-source`, which also does not establish permission. These need either a verified `usageBasis` or removal.

6. **Broken previews.** Some records show single-letter placeholders (E, F, H, K, S, U) because the preview image is not found and the fallback renders `title.slice(0, 1).toUpperCase()`. There is also an orphan entry rendered as "Image" at the bottom. The build does not fail on missing previews.

7. **No usage locations.** The page does not show where each material is used on the site. Visitors cannot verify that a credited material is actually in use.

8. **No stable anchors.** Cards do not have stable URL anchors. Other pages cannot deep-link to a specific material's provenance record.

9. **No status lifecycle.** Records have `reviewedAt` but no `status` field (active, orphaned, needs-review, blocked, expired). The validator cannot enforce production rules like "blocked assets cannot be published."

10. **No evidence references.** Legal basis claims (permission, license, contract) have no internal evidence reference. The validator cannot check that a claimed permission actually has a backing document.

## Problem

The current material credits system (RFC-0220 + RFC-0232) is functional but has significant gaps that undermine its purpose as a provenance and rights disclosure surface:

1. **Raw enum values shown to visitors** — internal codes like `commissioned-warpgogol-material`, `AIPlatform`, `Organization` appear directly in the visible page.
2. **Repetitive copyright boilerplate** — every card repeats the same copyright notice, even for AI-generated or third-party materials where the claim is legally incorrect.
3. **AI-generated materials auto-claim copyright** — German copyright law (§ 2 Abs. 2 UrhG) requires human creative contribution; the schema does not distinguish.
4. **Third-party materials lack verified usage basis** — `linked-public-source` is a label, not a legal basis.
5. **Broken previews** — single-letter placeholders and orphan entries; the build does not fail.
6. **No usage locations, stable anchors, status lifecycle, or evidence references.**

These gaps mean the credits page fails as a verifiable provenance registry.

## Decision

The material credits system is upgraded from a flat provenance list to a **provenance registry** with:

- **Extended schema**: new fields for status, usage basis, evidence references, AI-specific metadata, and usage locations.
- **Human-readable label mapping**: internal enum values are mapped to localized public labels; raw codes are never shown to visitors.
- **AI copyright nuance**: AI-generated materials get a distinct copyright status that does not auto-claim all-rights-reserved.
- **Stable anchors**: each card has a stable `id`-based URL anchor.
- **Usage location discovery**: the generator discovers where each credited material is used and lists human-readable page names.
- **Preview enforcement**: the validator fails on active records with missing previews.
- **Rights audit enforcement**: third-party records require a `usageBasis`; `linked-public-source` and `screenshot-of-linked-public-source` are no longer sufficient as the sole legal basis.
- **Status lifecycle**: records declare `status: active | orphaned | needs-review | blocked | expired`; the validator enforces production rules.

This RFC amends RFC-0220 (schema) and RFC-0232 (gallery rendering). It does not supersede them — the core architecture (sidecar-per-asset, generated page, shared UI section, JSON-LD projection) is retained and extended.

## Architectural fit

- **RFC-0047 (content surface):** sidecars stay beside their owning content assets. No new top-level domain.
- **RFC-0141 (single content-asset glob):** the gallery section continues to consume shared `contentAssetImages` / `contentAssetVideos` / `contentAssetCredits` maps. No new `import.meta.glob`.
- **RFC-0152 / RFC-0204 (image providers):** previews continue to render through `<ResponsiveImage>` and the active image provider.
- **RFC-0210 (media):** video previews continue through `<Media>` / `<LivePhoto>`.
- **RFC-0231 (attribution visibility):** inline disclosure behavior on non-credits pages is unchanged. The credits page remains the canonical full disclosure surface.
- **RFC-0480 (Layer C protection):** the credits page URL (`/bildnachweise/`) is preserved. No URL schema, sitemap, or JSON-LD type changes. `breaksC: false`.
- **Platform versioning (RFC-0478):** this RFC changes `packages/share` schema (Breaks-B) and declares `versionBump: minor`. A migrator is required for existing sidecar YAML files.

## Design

### Schema changes (`packages/share/src/schemas/material-credit.ts`)

The `materialCreditSchema` is extended with new optional fields. The schema remains `.strict()` — existing sidecars that do not use the new fields continue to parse, but the migrator adds `status: active` to all existing records.

#### New fields on `MaterialCredit`

```ts
interface MaterialCredit {
  // ... existing fields ...

  /** Lifecycle status of the record. Defaults to "active" via migrator. */
  status?: "active" | "orphaned" | "needs-review" | "blocked" | "expired";

  /** Legal basis for using the material, distinct from the license label. */
  usageBasis?: {
    type:
      | "internal-commissioned"
      | "express-permission"
      | "license"
      | "customer-supplied"
      | "public-domain"
      | "statutory-exception"
      | "quotation-right"
      | "unverified";
    /** Internal evidence reference (contract, license receipt, permission email). Opaque string — never shown to visitors, not validated for existence. */
    evidenceRef?: string;
    /** Human-readable note about the basis, shown in the details section. */
    note?: string;
  };

  /** AI-specific provenance, required when sourceType is ai-generated or ai-assisted. */
  aiUsage?: {
    /** Whether the output is fully AI-generated or AI-assisted. */
    kind: "ai-generated" | "ai-assisted";
    /** Human creative contribution description. */
    humanContribution: string;
    /** Whether copyright is claimed for the output. */
    copyrightClaimed: boolean;
    /** Internal generation record reference. Opaque string — never shown to visitors, not validated for existence. */
    generationRecordRef?: string;
  };

}
```

#### New `sourceType` values

The `materialSourceTypeSchema` enum is extended:

```ts
export const materialSourceTypeSchema = z.enum([
  "human-made",
  "ai-assisted",
  "ai-generated",
  "composite",
  "third-party",
  // New values:
  "commissioned",
  "licensed-third-party",
  "customer-supplied",
  "public-domain",
  "screenshot",
]);
```

The migrator maps existing `sourceType` values where a more specific new value applies (e.g. `third-party` + `linked-public-source` license → `licensed-third-party` or `screenshot` depending on context).

#### New credit roles

The `creditRoleSchema` enum is extended:

```ts
export const creditRoleSchema = z.enum([
  // ... existing roles ...
  // New roles:
  "editor",
  "contributor",
  "photographer",
  "illustrator",
]);
```

These map to the existing `CreditPartyKind` values (`Person`, `Organization`, etc.).

#### Label schema extension

The `materialCreditLabelsSchema` is extended with new localized labels:

```ts
interface MaterialCreditLabels {
  // ... existing labels ...

  // New labels for human-readable enum mapping:
  sourceTypeLabels: Record<MaterialSourceType, string>;
  statusLabels: Record<"active" | "orphaned" | "needs-review" | "blocked" | "expired", string>;
  usageBasisLabels: Record<UsageBasisType, string>;
  aiUsageLabels: {
    aiGenerated: string;
    aiAssisted: string;
    humanContribution: string;
    copyrightClaimed: string;
    copyrightNotClaimed: string;
  };
  usedOnLabel: string;
  verifiedAtLabel: string;
  noPreviewLabel: string;
  /** Explanatory text rendered once at the bottom of the credits page. */
  copyrightExplanation: string;
}
```

### Label mapping (`packages/share/src/material-credits.ts`)

New helper functions map internal enum values to localized human-readable labels:

```ts
export function labelForSourceType(sourceType: MaterialSourceType, labels: MaterialCreditLabels): string {
  return labels.sourceTypeLabels[sourceType] ?? sourceType;
}

export function labelForStatus(status: string, labels: MaterialCreditLabels): string {
  return labels.statusLabels[status] ?? status;
}

export function labelForUsageBasis(basis: UsageBasis, labels: MaterialCreditLabels): string {
  return labels.usageBasisLabels[basis.type] ?? basis.type;
}
```

### AI copyright rendering

When `aiUsage.copyrightClaimed` is `false` (the default for `ai-generated` sourceType), the card renders:

> **Авторсько-правовий статус:** Окремий авторсько-правовий захід для повністю згенерованого ШІ матеріалу не заявляється.
>
> **Підстава використання:** Використання відповідно до умов платформи генерації.

When `aiUsage.copyrightClaimed` is `true`, the standard copyright notice is rendered with an additional note about human contribution.

The `copyrightNotice` field in the license is no longer auto-applied by the generator for `ai-generated` records. The migrator sets `aiUsage.copyrightClaimed` context-dependently for existing `ai-generated` records (see Migrator section below).

### Stable anchors

Each card gets a stable anchor derived from the credit `id`:

```ts
function anchorForCredit(credit: MaterialCredit): string {
  return credit.id;
}
```

The card's `<h2>` and wrapping `<li>` carry `id={anchor}`. Other pages can link to `/bildnachweise/#{anchor}` (DE) or `/avtorstvo-materialiv/#{anchor}` (UK).

### Usage location discovery

The generator (`material.credits.generate`) discovers where each credited material is used by scanning page/prose/surface content for references to the credit's `target.id`. The discovery logic:

1. For each credit record, scan all page blocks for media/image references matching `target.id`.
2. For surface assets, check which surface pages reference the asset.
3. Build a list of `{ pageId, title, url }` for each credit.
4. Store the list in the generated prose fallback and pass it to the gallery section.

The gallery section renders a "Використовується на" (Used on) list with human-readable page names and links.

**Performance note:** the discovery scan is O(N×M) where N is the number of pages and M is the number of credit records. For `warpgogol-com` (small site, ~20 pages, ~15 credits) this is negligible. The scan reuses the same content-reference resolution as existing validators (`collectMaterialRefs` in `material-credits.ts`), so no new I/O pattern is introduced. The scan runs at generation time (build.prepare), not at request time.

### Preview enforcement

`material.credits.validate` gains a new failure mode:

- `missing-preview` (fail): an active record has no resolvable preview image or video.

The existing placeholder fallback (`title.slice(0, 1).toUpperCase()`) is replaced by a neutral type-labeled placeholder (e.g. "Зображення", "Відео") that does not look like a broken letter.

### Status lifecycle validation

`material.credits.validate` gains new rules:

- `blocked-status` (fail): a record with `status: blocked` is present in the generated page. Blocked records must be removed or have their status changed before publication.
- `orphaned-status` (warn): a record with `status: orphaned` is present. Orphaned records should not appear in the public page.
- `needs-review-status` (warn): a record with `status: needs-review` is present. These can be published but are flagged for follow-up.
- `expired-status` (fail): a record with `status: expired` is present. Expired records require re-verification.

### Rights audit enforcement

`material.credits.validate` gains new rules for third-party materials:

- `missing-usage-basis` (fail): a record with `sourceType` in `["third-party", "licensed-third-party", "screenshot", "commissioned"]` has no `usageBasis` field.
- `unverified-usage-basis` (fail): a record with `usageBasis.type: "unverified"` is present in the generated page. The operator must either verify the basis or remove the material.
- `organization-as-author` (fail): a record with `sourceType: "human-made"` has a `creator` or `coCreator` party with `kind: "Organization"`. Human-made works require a `Person` creator. An Organization as `commissionedBy` or `rightsHolder` does not trigger this rule.
- `ai-copyright-overstatement` (fail): a record with `sourceType: "ai-generated"` has `aiUsage.copyrightClaimed: true` but no `aiUsage.humanContribution` describing the creative input.

### Generator changes (`packages/os/site-kernel-codegen/src/service.ts`)

`renderMaterialCreditProse` is updated to:

1. Use `labelForSourceType` instead of raw `credit.sourceType`.
2. Use `labelForUsageBasis` for the usage basis line.
3. Render AI-specific fields when `aiUsage` is present.
4. Render usage locations.
5. Include stable anchors as `## {title} {{#anchor}}` (markdown heading with anchor).
6. Suppress repetitive copyright notices; render a single explanatory text at the bottom.

The prose fallback remains generated for no-JS / machine-readable consumers.

### UI changes (`packages/ui/src/sections/credits-gallery/`)

The gallery section is updated to:

1. Render type badges with human-readable labels (not raw enum values).
2. Render AI-specific provenance section when `aiUsage` is present.
3. Render usage locations list.
4. Render status badge when `status` is not `active`.
5. Use stable anchors on cards.
6. Replace the single-letter placeholder with a neutral type-labeled placeholder.
7. Suppress repetitive copyright notices; render per-material usage status instead.
8. Render a single explanatory text at the bottom of the page.

### Migrator

A migrator (RFC-0479) transforms existing sidecar YAML files:

1. Add `status: active` to all records.
2. For `ai-generated` records with the default copyright notice: add `aiUsage: { kind: "ai-generated", humanContribution: "Konzeption, Auswahl, Zusammenstellung und Nachbearbeitung durch Warpgogol", copyrightClaimed: <context-dependent> }`. The migrator checks: if the record already has a `humanContribution` field, explicit authorship parties (Person creator), or a non-default `copyrightNotice`, set `copyrightClaimed: true`. Otherwise set `copyrightClaimed: false`.
3. For `third-party` records: add `usageBasis: { type: "unverified", note: "Rights review required" }` (forces operator to verify or remove).
4. For `screenshot-of-linked-public-source` records: map `sourceType` to `screenshot` and add `usageBasis: { type: "unverified" }`.
5. For `human-made` records with `creator: Organization`: rename the party role to `commissionedBy` and add a `Person` creator if known, or flag as `needs-review`.

The migrator is idempotent: running it twice produces the same output.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/schemas/material-credit.ts` | Extended schema with new fields |
| `packages/share/src/material-credits.ts` | New label mapping helpers |
| `packages/os/site-kernel-codegen/src/service.ts` | Updated generator with label mapping, AI fields, usage locations, anchors |
| `packages/ui/src/sections/credits-gallery/credits-gallery-section.astro` | Updated gallery with badges, AI section, usage locations, anchors, placeholder fix |
| `packages/os/site-kernel-checks/src/material-credits.ts` | New validation rules |
| `packages/os/site-kernel-handoff/src/migrators/registry.ts` | Migrator entry for RFC-0488 |
| `missions/*/workpiece/src/content/site/{lang}/labels.md` | New `materialCredits` label keys for sourceType, status, usageBasis, aiUsage |

### Failure modes

New validation failure modes (in addition to existing RFC-0220 modes). Fail rules cause `material.credits.validate` to exit 1; warn rules exit 0 with diagnostics:

- `missing-preview` (fail, exit 1): active record has no resolvable preview.
- `blocked-status` (fail, exit 1): blocked record in generated page.
- `expired-status` (fail, exit 1): expired record in generated page.
- `missing-usage-basis` (fail, exit 1): third-party/screenshot/commissioned record without `usageBasis`.
- `unverified-usage-basis` (fail, exit 1): record with `usageBasis.type: "unverified"` in generated page.
- `organization-as-author` (fail, exit 1): human-made record with Organization `creator` or `coCreator`.
- `ai-copyright-overstatement` (fail, exit 1): AI-generated record claiming copyright without human contribution description.
- `orphaned-status` (warn, exit 0): orphaned record in generated page.
- `needs-review-status` (warn, exit 0): needs-review record in generated page.

### CLI surface

```sh
# Validate credits for a site (exit 1 on fail rules, exit 0 on warn-only)
pnpm exec site-kernel run material.credits.validate --site <site-id> --json

# Regenerate the credits page (prose fallback + page block)
pnpm exec site-kernel run material.credits.generate --site <site-id> --json

# Report: dump all credit records and material refs as JSON
pnpm exec site-kernel run material.credits.report --site <site-id> --json
```

The `--json` output shape for `material.credits.validate` follows the existing `CheckResult` contract: `{ command, status, count, violations[], diagnostics[] }`.

### Pipeline placement

New validation rules (`missing-preview`, `blocked-status`, `expired-status`, `missing-usage-basis`, `unverified-usage-basis`, `organization-as-author`, `ai-copyright-overstatement`) join the existing `material.credits.validate` step in `APPS_CHECK_AUTHOR_PIPELINE` (blocking, `build.check`). Warn rules (`orphaned-status`, `needs-review-status`) are advisory — they appear in diagnostics but do not block the build.

New apps get the new validation rules by default — `material.credits.validate` is already part of `APPS_CHECK_AUTHOR_PIPELINE` for all sites. No per-app opt-in is needed.

## Rollout

1. **Schema + labels**: extend `materialCreditSchema` and `materialCreditLabelsSchema` in `@gogol/share`. Add label mapping helpers. The labels update (step 6) MUST happen in the same mission as the schema change — the new label fields are required in a `.strict()` schema, so existing labels files will fail `materialCreditLabelsSchema.parse()` until updated.
2. **Migrator**: implement and register the RFC-0488 migrator in `@gogol/site-kernel-handoff`. Run it on `warpgogol-com` to transform existing sidecars.
3. **Generator**: update `renderMaterialCreditProse` and `runGenerateMaterialCreditsPage` with label mapping, AI fields, usage locations, and anchors.
4. **UI**: update `credits-gallery-section.astro` with new rendering.
5. **Validator**: add new validation rules to `material.credits.validate`.
6. **Labels**: add new `materialCredits` label keys to `src/content/site/{lang}/labels.md` for DE and UK. All 10 `sourceType` values (5 existing + 5 new), all 5 `status` values, all 8 `usageBasis.type` values, and `copyrightExplanation` must be present.
7. **Rights audit**: operator reviews Stuttgart Marathon photo and Komoot screenshot. Either add verified `usageBasis` or remove the sidecar and asset.
8. **Pilot**: regenerate the credits page for `warpgogol-com` and verify the rendered output.
9. **Switch to fail-hard**: enable new validation rules in `APPS_CHECK_AUTHOR_PIPELINE` (already wired — `material.credits.validate` is already a step in the pipeline).
10. **Compass sync**: update `docs/technology.xml` if it tracks `@gogol/share` schema exports. Update `packages/share/AGENTS.md` to document the new label mapping helpers (`labelForSourceType`, `labelForStatus`, `labelForUsageBasis`).

## Alternatives considered

- **Hand-edit the generated page.** Rejected — the page is generator-owned (RFC-0081 marker). Hand-editing would be overwritten on the next `material.credits.generate` run.
- **Create a separate provenance registry collection.** Rejected — duplicates the sidecar system and creates drift. The sidecar-per-asset model is the canonical source.
- **Drop the prose fallback entirely.** Rejected — it serves no-JS readers and machine-readable consumers. Keeping it is low cost.
- **Add client-side filtering.** Deferred — the page is server-rendered. Filters are a possible future enhancement but not needed for the provenance registry to be useful.
- **Hardcode the rights audit results.** Rejected — the operator must make a legal decision about the Stuttgart Marathon photo and Komoot screenshot. The RFC provides the framework; the operator provides the decision.

## Risks

- **Schema migration risk.** Existing sidecars must be migrated. The migrator is idempotent and tested with snapshot tests on real data (RFC-0479).
- **Label completeness.** Every `sourceType` (10 values), `status` (5 values), and `usageBasis.type` (8 values) must have a localized label. The new label fields are **required** in a `.strict()` schema — missing keys cause a parse error (build crash), not a silent fallback. The labels update (rollout step 6) MUST happen in the same mission as the schema change (rollout step 1). The `labelForSourceType` helper falls back to the raw enum value only if the label schema somehow passes with missing `Record` keys, which is a TypeScript type error, not a runtime path.
- **Usage location discovery accuracy.** The discovery scan must correctly identify which pages reference each material. False positives (listing a page that doesn't actually use the material) or false negatives (missing a page that does) reduce trust. The scan uses the same content-reference resolution as existing validators.
- **Rights audit operator burden.** The operator must review two third-party materials and make a legal decision. This is intentional — the RFC enforces the decision but does not make it automatically.
- **AI copyright nuance complexity.** The `aiUsage` model adds complexity to the schema. However, the alternative (uniform copyright claim) is legally incorrect for AI-generated materials.

## Acceptance criteria

- [x] `materialCreditSchema` in `@gogol/share` includes `status`, `usageBasis`, `aiUsage` fields. (evidence: `packages/share/src/schemas/material-credit.ts:124-143`)
- [x] `materialSourceTypeSchema` includes new values: `commissioned`, `licensed-third-party`, `customer-supplied`, `public-domain`, `screenshot`. (evidence: `packages/share/src/schemas/material-credit.ts:35-46`)
- [x] `creditRoleSchema` includes new roles: `editor`, `contributor`, `photographer`, `illustrator`. (evidence: `packages/share/src/schemas/material-credit.ts`)
- [x] `materialCreditLabelsSchema` includes `sourceTypeLabels`, `statusLabels`, `usageBasisLabels`, `aiUsageLabels`, `usedOnLabel`, `verifiedAtLabel`, `noPreviewLabel`, `copyrightExplanation`. (evidence: `packages/share/src/schemas/material-credit.ts:209-232`)
- [x] Label mapping helpers (`labelForSourceType`, `labelForStatus`, `labelForUsageBasis`) are exported from `@gogol/share/material-credits`. (evidence: `packages/share/src/schemas/material-credit.ts:252-266`)
- [x] `material.credits.generate` renders human-readable labels instead of raw enum values. (evidence: `packages/os/site-kernel-codegen/src/service.ts:679-685`)
- [x] `material.credits.generate` renders AI-specific provenance when `aiUsage` is present. (evidence: `packages/os/site-kernel-codegen/src/service.ts:686-688`)
- [x] `material.credits.generate` renders usage locations for each material. (evidence: `packages/os/site-kernel-codegen/src/service.ts:689-692`, `discoverUsageLocations` at `:760-816`)
- [x] `material.credits.generate` emits stable anchors for each card. (evidence: `packages/os/site-kernel-codegen/src/service.ts:694`)
- [x] `credits-gallery-section.astro` renders type badges, AI section, usage locations, status badges, and stable anchors. (evidence: `packages/ui/src/sections/credits-gallery/credits-gallery-section.astro`)
- [x] `credits-gallery-section.astro` replaces single-letter placeholders with neutral type-labeled placeholders. (evidence: `packages/ui/src/sections/credits-gallery/credits-gallery-section.astro`)
- [x] `material.credits.validate` enforces: `missing-preview`, `blocked-status`, `expired-status`, `missing-usage-basis`, `unverified-usage-basis`, `organization-as-author`, `ai-copyright-overstatement`. (evidence: `packages/os/site-kernel-checks/src/material-credits.ts:440-500`)
- [x] RFC-0488 migrator is registered and transforms existing sidecars idempotently. (evidence: `packages/os/site-kernel-handoff/src/migrators/rfc-0488.ts`, PBT + snapshot tests pass)
- [x] `src/content/site/{lang}/labels.md` includes new `materialCredits` label keys for DE and UK. (evidence: workpiece `missions/warpgogol-com-m000010/workpiece/src/content/site/{de,uk}/labels.md`)
- [x] Operator has reviewed Stuttgart Marathon photo and Komoot screenshot. Stuttgart: `usageBasis.type: quotation-right` (§ 51 UrhG, public event photo with source attribution). Komoot: `usageBasis.type: express-permission` (owned by Andrii Syrokomskyi, page owner). Komoot `sourceType` corrected from `composite` to `screenshot`, creator/rightsHolder corrected to Andrii Syrokomskyi. Both `reviewedAt: 2026-07-22`. (evidence: workpiece `missions/warpgogol-com-m000010/workpiece/src/content/prose/{de,uk}/assets/winnenden-salzburg-tour.credits.yaml`, `marathon-stuttgart.credits.yaml`)
- [x] `material.credits.validate --site warpgogol-com` exits 0 after migration and rights audit. (evidence: `material.credits.validate --site warpgogol-com --json` → status: warn, 0 violations; 3 missing-preview assets restored from Git LFS history — elektriker.webp, friseur.webp from surface/assets, promo.webm from pages/de/media)
- [x] `content.references.validate --site warpgogol-com` exits 0. (evidence: `content.references.validate --site warpgogol-com --json` → status: pass)
- [x] Dev build of `warpgogol-com` starts without runtime errors on `/bildnachweise/`. (evidence: `astro build` → Complete! in 9.11s; `dist/client/de/bildnachweise/index.html` and `dist/client/bildnachweise/index.html` generated)
- [x] `rfc.validate RFC-0488` passes. (evidence: `pnpm exec site-kernel run rfc.validate RFC-0488 --json` → status: pass)
- [x] RFC-0220 `amendedBy` includes RFC-0488; RFC-0232 `amendedBy` includes RFC-0488. (evidence: `docs/rfcs/archive/implemented/rfc-0220-*.md`, `docs/rfcs/archive/implemented/rfc-0232-*.md`)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has status `accepted`.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST NOT hardcode copyright notices for AI-generated materials — use the `aiUsage.copyrightClaimed` field.
- Agents MUST NOT show raw enum values to visitors — always use the label mapping helpers.
- Agents MUST NOT create a new content domain for the provenance registry — sidecars stay beside their owning assets.
- Agents MUST NOT skip the rights audit — the Stuttgart Marathon photo and Komoot screenshot require operator review.
- Agents MUST register a migrator (RFC-0479) for the schema changes.
- Agents MUST update `amendedBy` on RFC-0220 and RFC-0232 when this RFC is implemented.
- Agents MUST update `packages/share/AGENTS.md` to document the new label mapping helpers.
- When implementing, reference RFC-0488 in commit messages or PR descriptions.
