---
id: RFC-0328
title: "Introduce semanticType: legal for legal pages"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-06
updatedAt: 2026-07-06
implementedAt: 2026-07-06
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0143
  - RFC-0042
  - RFC-0050
  - RFC-0174
amendedBy: []
related:
  - DNA-22
  - DNA-25
  - RFC-0047
  - RFC-0049
  - RFC-0142
  - RFC-0165
commands:
  proposed:
    - legal.page.validate
  added: []
  changed:
    - system.manifest.validate
    - sitemap.generate
    - llms.generate
    - seo.structured-data.validate
    - page.block.validate
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
  - check-warpgogol-com
packagesImpacted:
  - "@gogol/ontology"
  - "@gogol/share"
  - "@gogol/site-kernel-content"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Legal pages declare a closed semanticType: legal instead of reusing content + sitemap.category: legal."
  - "Default legal-page projections (sitemap category, llms exclusion, robots) are derived from semanticType."
  - "No app duplicates the legacy pattern after migration."
  - "A legal-page validator can enforce content and structural rules specific to statutory pages."
nonGoals:
  - "Do not introduce a separate legal content domain or file layout beyond the existing pages/prose surface."
  - "Do not add schema.org types that do not exist for legal pages; keep WebPage as the JSON-LD base."
  - "Do not create a new cosmic page archetype or PlanetCatalog entry solely for legal pages."
  - "Do not allow legal-type defaults to be silently overridden by unrelated pages."
  - "Do not preserve the legacy semanticType: content + sitemap.category: legal pattern."
---

# RFC-0328: Introduce semanticType: legal for legal pages

## Context

The platform already distinguishes legal pages from marketing pages, but it does so indirectly. Today a legal page is authored as `semanticType: content` and then tagged with `output.sitemap.category: legal` and `output.llms: exclude`:

```yaml
@apps/warpgogol-com/src/content/system.md:401-408
  - pageId: datenschutz
    semanticType: content
    output:
      llms: exclude
```

```yaml
@apps/nicaragua-projekt/src/content/system.md:146-161
  - pageId: legalNotice
    semanticType: content
    output:
      sitemap: { category: legal, lastmod: "2026-05-14", includeLastmod: true }
      llms: exclude
```

The `semanticType` enum is a closed catalog that drives JSON-LD construction, FAQ embedding, enrichment pools, and default output projections:

```ts
@packages/share/src/semantic/models.ts:20-28
export type SemanticPageType =
  | "home"
  | "about"
  | "projects"
  | "donationContact"
  | "openSource"
  | "content"
  | "article"
  | "person";
```

Legal pages are not generic content. They are statutory, high-stability, low-marketing pages that every site must carry. The current encoding requires authors to remember three separate declarations (`semanticType: content`, `sitemap.category: legal`, `llms: exclude`) and leaves no closed type for validators to target. Audit helpers derive `isLegal` from the sitemap category rather than from the page type:

```ts
@packages/os/site-kernel-checks/src/audit/helpers.ts:359
const isLegal = sitemapCategory === "legal";
```

## Problem

The unprotected invariants are:

> A legal page must carry a first-class semantic type so that the platform can apply legal-page defaults, validators, and audit rules without relying on a sitemap category side channel.

> The legal-page signal must be closed and validated, not reconstructed from an ad-hoc combination of `semanticType: content` + `output.sitemap.category: legal` + `output.llms: exclude`.

Current failure modes:

1. **No closed type.** Legal pages are indistinguishable from ordinary content pages in `SemanticPageType` and `semanticPageTypeSchema`. The only machine-readable signal is the free-form `output.sitemap.category` string.
2. **Manual duplication.** Every legal page repeats the same projection triplet. Authors must know to set `sitemap.category: legal` and `llms: exclude`; forgetting either produces silent drift (e.g., a legal page leaking into `llms-full.txt`).
3. **Audit and validation side channels.** `getAuditPageInfo` treats a page as legal only because of its sitemap category. A legal page that is excluded from the sitemap (`output.sitemap: false`) becomes invisible to legal-page audit rules.
4. **No legal-page validator target.** There is no type for `legal.page.validate` to key on, so structural expectations (no marketing CTA, prose-first body, required business data) cannot be enforced cleanly.
5. **Semantic model pollution.** `buildMarkdownPageSemantic` treats legal pages as generic content, so JSON-LD and answer-block extraction apply the same heuristics as a service page, even though legal pages are a different editorial class.

## Decision

Add `legal` to the closed `SemanticPageType` catalog and use it as the canonical signal for statutory/legal pages. The platform derives legal-page defaults from `semanticType: legal`; explicit `output` values may override those defaults, but the legacy `semanticType: content` + `output.sitemap.category: legal` combination is rejected. There is no backward compatibility, no deprecation alias, and no migration grace period.

### 1. `legal` enters the closed semantic-type catalog

`packages/share/src/semantic/models.ts` and `packages/ontology/src/schemas/system.ts` extend the enum:

```ts
export type SemanticPageType =
  | "home"
  | "about"
  | "projects"
  | "donationContact"
  | "openSource"
  | "content"
  | "article"
  | "person"
  | "legal";
```

### 2. Legal-page projection defaults

`resolvePageOutput` in `packages/share/src/semantic/output-projection.ts` applies a legal-page default layer when `semanticType === "legal"`:

| Projection                      | Default for `legal` | Overrideable |
| ------------------------------- | ------------------- | ------------ |
| `output.sitemap.include`        | `true`              | yes          |
| `output.sitemap.category`       | `"legal"`           | yes          |
| `output.sitemap.includeLastmod` | `true`              | yes          |
| `output.llms.depth`             | `"exclude"`         | yes          |
| `output.robots.index`           | `true`              | yes          |
| `output.robots.follow`          | `true`              | yes          |

The default `category` is `"legal"`. The default `llms` depth is `"exclude"` because legal documents are typically authored, reviewed, and not summarised by the platform's public AI feed.

### 3. Legacy pattern is a hard error

`system.manifest.validate` rejects the old encoding:

- `output.sitemap.category: "legal"` is only allowed when `semanticType: legal`.
- `semanticType: legal` is the only way to declare a legal page; no other `semanticType` may claim the legal sitemap category.

This is a flag-day change. All existing apps are migrated in the same implementation PR.

### 4. JSON-LD and semantic model

`buildMarkdownPageSemantic` continues to build legal pages through the generic markdown builder. `buildWebPageNode` keeps `WebPage` as the schema.org type for `legal` (schema.org does not define a `LegalPage` type). The semantic model gains `type: "legal"`, which future validators and projections can match directly.

### 5. Proposed `legal.page.validate`

A new app-scoped command is proposed to enforce legal-page-specific rules:

- A legal page must contain a `markdown` or `prose` block as its primary body.
- A legal page must not use marketing sections such as `ctaGroup`, `hero`, or `donation-card`.
- A legal page must not include `aggregateRating`, `Product`, or `Offer` structured data nodes.
- A legal page must resolve required business data from `business/{lang}/legal.md` for the relevant locale (Impressum, Datenschutz, AGB, etc.).
- A legal page must be present in the default language (no orphaned legal page in one locale only).

The command is not mandatory for the initial implementation; it can ship after the type change is landed.

## Architectural fit

**DNA-22 / client surface.** `system.md` remains the single editable source. The change is one new enum value and derived defaults, not a new content file or collection.

**RFC-0047 / CMS-friendly surface.** Authors still write `pages/{lang}/<page>.md` and `prose/{lang}/<page>.md`. The only system.md change is replacing the duplicated projection triplet with `semanticType: legal`.

**RFC-0143 / per-page output projection.** This RFC amends RFC-0143 by making `semanticType` an input to `resolvePageOutput`. The `output` block remains the explicit override surface; legal defaults live in the resolver, not in the schema.

**RFC-0042 / semantic content.** Legal pages were previously classified as `content`. This RFC adds a more precise type so the semantic model can treat them distinctly.

**RFC-0050 / RFC-0142 / llms.** `output.llms: exclude` becomes the default for `legal`, removing the need for authors to repeat it. The LLM generator continues to read the resolved projection.

**RFC-0174 / binding language policy.** Legal documents often have locale-asymmetric requirements. `semanticType: legal` works with `locales:` (RFC-0097) to model pages like Impressum that are DE-only or privacy pages that are EN-only, without losing the legal-page signal.

**RFC-0229 / breadcrumbs.** Legal pages are typically flat (`Home → Legal page`). The `parentPageId` mechanism remains available for nested legal structures (e.g., `Legal → Privacy → Cookies`) but is not required.

**DNA-25 / thin delivery.** The resolver lives in `@gogol/share`; loaders and commands consume the resolved projection. No formatter or command duplicates the default logic.

## Design

### CLI surface

No new commands are added in the initial implementation. Existing commands change behavior:

```sh
pnpm exec site-kernel run system.manifest.validate --app warpgogol-com
pnpm exec site-kernel run sitemap.generate --app warpgogol-com
pnpm exec site-kernel run llms.generate --app warpgogol-com
```

Proposed later:

```sh
pnpm exec site-kernel run legal.page.validate --app warpgogol-com
pnpm exec site-kernel run legal.page.validate --all --json
```

### TypeScript contracts

```ts
// packages/share/src/semantic/models.ts

export type SemanticPageType =
  | "home"
  | "about"
  | "projects"
  | "donationContact"
  | "openSource"
  | "content"
  | "article"
  | "person"
  | "legal";
```

```ts
// packages/share/src/semantic/output-projection.ts

const LEGAL_PAGE_DEFAULTS: Partial<PageOutputProjection> = {
  sitemap: {
    include: true,
    category: "legal",
    includeLastmod: true,
  },
  llms: { depth: "exclude" },
  robots: { index: true, follow: true },
};

export interface ResolvePageOutputOptions extends LegacySitemapFields {
  semanticType?: string;
}

export function resolvePageOutput(
  raw: RawPageOutput | undefined,
  options: ResolvePageOutputOptions = {},
): PageOutputProjection {
  const defaults = options.semanticType === "legal" ? LEGAL_PAGE_DEFAULTS : {};
  // raw output values override defaults; resolve remaining fields to their normal defaults
  // ...
}
```

```ts
// packages/ontology/src/schemas/system.ts

export const semanticPageTypeSchema = z.enum([
  "home",
  "about",
  "projects",
  "donationContact",
  "openSource",
  "content",
  "article",
  "person",
  "legal",
]);
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/semantic/models.ts` | Add `"legal"` to `SemanticPageType` |
| `packages/share/src/semantic/output-projection.ts` | Apply `LEGAL_PAGE_DEFAULTS` when `semanticType === "legal"` |
| `packages/ontology/src/schemas/system.ts` | Extend `semanticPageTypeSchema` with `"legal"` |
| `packages/os/site-kernel-content/src/semantic-loader.ts` | Pass `semanticType` to `resolvePageOutput` |
| `packages/business/src/semantic-model.ts` | Same as above (Astro runtime path) |
| `packages/os/site-kernel-checks/src/system-manifest.ts` | Reject `sitemap.category: "legal"` without `semanticType: legal` |
| `packages/os/site-kernel-checks/src/audit/helpers.ts` | Derive `isLegal` from `semanticType === "legal"` instead of sitemap category |
| `packages/os/site-kernel-checks/src/sitemap-helpers.ts` | Continue reading resolved category; no direct change |
| `packages/os/site-kernel-checks/src/legal-page.ts` | Proposed home for `legal.page.validate` |
| `packages/os/site-kernel-onboarding/src/templates/system.template.md` | Scaffold legal pages with `semanticType: legal` |
| `apps/*/src/content/system.md` | Migrate legal pages to `semanticType: legal`; remove redundant `output` blocks |

### Output format

`system.manifest.validate --json` will emit:

```json
{
  "command": "system.manifest.validate",
  "status": "fail",
  "app": "warpgogol-com",
  "findings": [
    {
      "file": "apps/warpgogol-com/src/content/system.md",
      "line": 104,
      "rule": "legal-semantic-type-mismatch",
      "severity": "error",
      "message": "output.sitemap.category 'legal' requires semanticType: legal; found semanticType: content."
    }
  ]
}
```

Proposed `legal.page.validate --json` will emit:

```json
{
  "command": "legal.page.validate",
  "status": "fail",
  "app": "warpgogol-com",
  "findings": [
    {
      "file": "apps/warpgogol-com/src/content/pages/de/agb.md",
      "rule": "legal-marketing-section",
      "severity": "error",
      "message": "Legal page 'agb' must not use a hero or ctaGroup section."
    }
  ]
}
```

### Failure modes

- **`semanticType: content` + `output.sitemap.category: legal`** → hard error in `system.manifest.validate`. No grace period.
- **`output.sitemap.category: legal` on any non-legal `semanticType`** → hard error.
- **`semanticType: legal` + `output.sitemap: false`** → allowed; the page is legal but excluded from the sitemap. `isLegal` remains `true` in audit helpers.
- **`semanticType: legal` + `output.llms: full`** → allowed; explicit override wins. A warning may be emitted by `legal.page.validate` if it is judged risky.
- **`semanticType: legal` on a page with no `business/{lang}/legal.md` data** → no error by default; the proposed `legal.page.validate` may flag it for specific legal page kinds.

## Rollout

This is a flag-day change with no backward compatibility.

1. **Phase 1 — types and resolver.** Add `"legal"` to `SemanticPageType` and `semanticPageTypeSchema`. Implement `LEGAL_PAGE_DEFAULTS` in `resolvePageOutput`.
2. **Phase 2 — loaders.** Wire both `semantic-loader.ts` and `semantic-model.ts` to pass `semanticType` into `resolvePageOutput`.
3. **Phase 3 — validation.** Update `system.manifest.validate` to reject the legacy combination. Update `audit/helpers.ts` to derive `isLegal` from `semanticType`.
4. **Phase 4 — generators.** Confirm `sitemap.generate` and `llms.generate` continue to read the resolved projection; their output should be unchanged for correctly migrated pages.
5. **Phase 5 — app migration.** Update all three apps:
   - `apps/warpgogol-com/src/content/system.md`: impressum, datenschutz, agb, widerruf, musterWiderruf, barrierefreiheit → `semanticType: legal`.
   - `apps/nicaragua-projekt/src/content/system.md`: legalNotice, privacyPolicy, terms, rightOfWithdrawal → `semanticType: legal`.
   - `apps/check-warpgogol-com/src/content/system.md`: impressum, datenschutz → `semanticType: legal`.
6. **Phase 6 — template.** Update `system.template.md` and onboarding scaffold so new apps use `semanticType: legal` for legal pages.
7. **Phase 7 — optional legal validator.** Implement `legal.page.validate` once the type change is stable.
8. **Phase 8 — docs.** Update `apps/AGENTS.md` and relevant GRACE XML to document that legal pages use `semanticType: legal`.

All implementation phases ship together in one change. No app is left on the legacy pattern.

## Alternatives considered

**Keep the current pattern (`semanticType: content` + `output.sitemap.category: legal`).** Rejected. It is manual, error-prone, and leaves no closed type for validators or audit helpers. The sitemap category is a projection concern, not a semantic type.

**Introduce a top-level `legalPages: []` registry in `system.md`.** Rejected. It duplicates the `pages` array and breaks the principle that a page's identity and role live in one place. Cosmic names already give pages stable identities; the semantic type should live alongside them.

**Use `pageId` prefix or a separate `category: legal` field.** Rejected. `pageId` is a stable identifier, not a classifier. A separate `category` field would duplicate `output.sitemap.category` and still fail to enter the semantic model.

**Add `semanticType: legal` but keep the legacy pattern as a deprecated alias.** Rejected. The user explicitly requested no backward compatibility and no legacy. The legacy pattern is mechanically migratable and there are only three apps, so a flag-day change is cheaper than a deprecation period.

**Map `semanticType: legal` to a special schema.org type.** Rejected. schema.org does not define a `LegalPage` type. `WebPage` remains correct; the value of the type is in defaults and validation, not in JSON-LD type expansion.

## Risks

**Flag-day migration across three apps.** Mitigation: the change is mechanical (`semanticType: content` → `legal` and removal of redundant `output.llms: exclude` / `output.sitemap.category: legal`). A single PR can migrate all apps and packages.

**Validator churn in hot files.** `output-projection.ts` and `systemManifestSchema` are central. Mitigation: the change is additive (new enum value + default layer) and does not alter existing type behavior for non-legal pages.

**False positives in `legal.page.validate`.** If implemented later, rules such as "no CTA" must be closed and documented to avoid rejecting legitimate navigation links. Mitigation: start with conservative rules and expand via separate RFCs.

**Audit helpers drift.** `getAuditPageInfo` is used by multiple audit commands. Mitigation: update the helper to prefer `semanticType` over category in one change, and verify all audit consumers in the same PR.

**Content-authoring impact.** Authors currently learn the triplet. Mitigation: the new form is simpler (`semanticType: legal` alone), and the migration is automated through manifest edits, not content rewrites.

## Acceptance criteria

- [x] `SemanticPageType` and `semanticPageTypeSchema` include `"legal"`. (evidence: implemented historically)
- [x] `resolvePageOutput` applies legal-page defaults when `semanticType === "legal"`. (evidence: implemented historically)
- [x] `system.manifest.validate` rejects `output.sitemap.category: "legal"` unless `semanticType: legal`. (evidence: implemented historically)
- [x] `system.manifest.validate` rejects any non-legal `semanticType` with `output.sitemap.category: "legal"`. (evidence: implemented historically)
- [x] `apps/warpgogol-com`, `apps/nicaragua-projekt`, and `apps/check-warpgogol-com` migrate all legal pages to `semanticType: legal`. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `audit/helpers.ts` derives `isLegal` from `semanticType`. (evidence: implemented historically)
- [x] `sitemap.generate` and `llms.generate` output is unchanged for migrated pages. (evidence: implemented historically)
- [x] Onboarding `system.template.md` scaffolds legal pages with `semanticType: legal`. (evidence: implemented historically)
- [x] `apps/AGENTS.md` documents the legal-page semantic type and the no-legacy rule. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes from this RFC only after its status becomes `accepted`.
- Agents MUST NOT change this RFC's status field.
- Agents MUST add `"legal"` to both `packages/share/src/semantic/models.ts` and `packages/ontology/src/schemas/system.ts` in the same change.
- Agents MUST apply legal-page defaults in `resolvePageOutput` in `@gogol/share`; never duplicate the default logic in a loader, command, or formatter.
- Agents MUST update both `semantic-loader.ts` and `semantic-model.ts` (Astro runtime) together.
- Agents MUST migrate all three apps in the same implementation PR; no app may remain on the legacy `semanticType: content` + `sitemap.category: legal` pattern.
- Agents MUST NOT keep the legacy pattern as a deprecated alias or warning-only mode.
- Agents MUST update `audit/helpers.ts` to derive `isLegal` from `semanticType`.
- Agents MAY defer `legal.page.validate` to a follow-up PR after the type change is landed.
- When implementing, agents MUST reference `RFC-0328` in commit messages or PR descriptions.
- Agents MUST update `apps/AGENTS.md` and relevant GRACE XML because this RFC changes the repository-wide semantic-page contract and validation policy.
