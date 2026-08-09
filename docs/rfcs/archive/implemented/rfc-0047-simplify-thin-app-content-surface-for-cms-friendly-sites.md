---
id: RFC-0047
title: "Simplify thin app content surface for CMS-friendly sites"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-12
updatedAt: 2026-07-01
implementedAt: 2026-05-13
closedAt:
supersedes: []
supersededBy:
amendedBy:
  - RFC-0257
related:
  - DNA-21
  - DNA-22
  - DNA-23
  - DNA-24
  - DNA-25
  - DNA-26
  - RFC-0011
  - RFC-0018
  - RFC-0021
  - RFC-0024
  - RFC-0025
  - RFC-0026
  - RFC-0031
  - RFC-0033
  - RFC-0034
  - RFC-0036
  - RFC-0037
  - RFC-0038
  - RFC-0042
  - RFC-0043
  - RFC-0044
  - RFC-0045
  - RFC-0046
commands:
  proposed:
    - content.surface.validate
  added:
    - content.surface.validate
  changed:
    - app.contract.full
    - client.edit.validate
    - onboarding.scaffold
    - page.block.validate
    - page.shell.validate
    - system.manifest.validate
  removed:
    - feature.graph.validate
appsImpacted:
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/business"
  - "@gogol/site-kernel-content"
  - "@gogol/site-kernel-checks"
successSignals:
  - "A new app can be edited through src/content/{system.md,pages,prose,business,navigation,site}/** plus public/** exceptions without exposing component internals."
  - "apps/<app>/system.yaml and src/content/assets/system.md are replaced by one canonical src/content/system.md."
  - "Page authors use CMS-friendly block types, not cosmic catalog names."
  - "The feature graph layer is removed from the default app surface; visibility lives on page blocks and shell settings."
  - "All optimized visitor-facing media is referenced from content-local assets folders and processed by Astro."
nonGoals:
  - "Do not introduce a src/content/media directory."
  - "Do not move unoptimized special files out of public/."
  - "Do not remove src/scripts/layout-orchestrator.ts from thin apps."
  - "Do not remove src/styles as a brand override surface."
  - "Do not weaken the package-level cosmic manifest contract; hide cosmic names from client-facing content instead."
---

# RFC-0047: Simplify thin app content surface for CMS-friendly sites

## Context

`apps/nicaragua-projekt` is the current reference site for scaling WGogol to many client sites. The current implementation proves the package-first architecture, but the app content surface is still too technical for a CMS or repository-sync workflow.

The current app exposes multiple overlapping content concepts:

- `src/content/components/{de,en}/` stores shared shell copy, footer navigation, UI labels, and some business-like donation data.
- `src/content/components/prose/*.de.md` stores long-form prose with language suffixes instead of language folders.
- `src/content/components/assets/**` stores visitor-facing media even when the media semantically belongs to page blocks, prose, or shell content.
- `src/content/sections/{de,en}/donation-card.md` duplicates business donation data already modeled by `src/content/business/de/legal.md`.
- `src/content/features/**` stores a feature graph whose page and shared-component visibility overlaps with page block configuration and shell settings.
- `apps/<app>/system.yaml` and `src/content/assets/system.md` duplicate the system manifest for validator/runtime access.
- `pages/**/*.md blocks[].use` exposes cosmic catalog names to content authors, even though the cosmic overlay is an internal platform contract.

This creates avoidable client-facing complexity. A studio or CMS should work with pages, prose, business data, navigation, site settings, optimized assets, and public exceptions. It should not need to understand component implementation folders, section stubs, feature graph internals, or cosmic names.

At the same time, two app-local surfaces remain intentionally useful:

- `src/scripts/layout-orchestrator.ts` is the thin performance extension point that allows standard layout behavior to load conditionally without inline scripts or eager browser code.
- `src/styles/**` is the app brand override surface. It allows a client site to be visually distinct while still inheriting biome and package defaults.

## Problem

The thin-app contract is not yet CMS-friendly enough to scale to hundreds of sites.

The unprotected invariant is:

> A client-editable app surface must be semantically obvious, localized by default, and free of implementation-only identifiers.

The current repository violates or strains that invariant in these ways:

1. `components` is used as a content bucket rather than a component-only concept.
2. Prose entries use filename language suffixes (`impressum.de.md`) while pages and navigation use language folders.
3. Media ownership is unclear because `components/assets/**` is not tied to the content entry that references it.
4. `sections/donation-card.md` duplicates canonical business/legal data.
5. The feature graph duplicates page block visibility and makes simple content edits require knowledge of a second graph.
6. `system.yaml` and `system.md` require manual synchronization.
7. `blocks[].use: Europa` forces content authors to edit internal cosmic names.
8. Navigation has started moving to `src/content/navigation/**`, but header/footer content still carries navigation-like data.

These problems are manageable in one reference app but become expensive when onboarding and maintaining many client sites.

## Decision

The workspace adopts a CMS-friendly thin-app content surface that replaces implementation-shaped content folders with semantic content domains.

The canonical editable content surface for new and migrated apps is:

```txt
src/content/
  system.md
  pages/{lang}/...
  prose/{lang}/...
  business/{lang}/...
  navigation/{lang}/...
  site/{lang}/...
```

Visitor-facing media that should be optimized by Astro lives in `assets/` folders under the content domain that owns the reference:

```txt
src/content/pages/{lang}/assets/**
src/content/prose/{lang}/assets/**
src/content/site/{lang}/assets/**
src/content/business/{lang}/assets/**
```

There is no `src/content/media/` directory. Displayed media belongs to the page block, prose entry, business entry, or site/shell content that references it. Localized media is placed under the relevant language folder because images may contain translated text.

Files that must not be optimized by Astro, or that must remain addressable by fixed public paths, stay in `public/`. Examples include well-known files, manifest files, robots/sitemap-related static files, vendor-required verification files, and public icon files that are intentionally served as-is.

`src/scripts/layout-orchestrator.ts` remains part of a thin app. It is the local performance orchestration extension point and delegates reusable behavior to `@gogol/share/scripts`.

`src/styles/**` remains part of a thin app. It is the brand customization surface that makes each client site visually distinct beyond biome defaults.

The default feature graph layer is removed. Visibility, enabled/disabled state, and simple behavior switches live on page blocks, shell settings, or the relevant content entry. Growth funnels and analytics remain separate from the retired content feature graph.

`src/content/system.md` becomes the single canonical system manifest. The transitional pair `apps/<app>/system.yaml` plus `src/content/assets/system.md` is removed after validators and runtime loaders read the same `system.md`.

Page markdown no longer exposes cosmic catalog names. Client-facing page blocks use CMS-friendly archetype names such as `type: hero`, `type: problem`, or template-keyed blocks. The platform resolves those names through package manifests, registries, and cosmic catalogs internally.

## Architectural fit

This RFC keeps the package-first architecture but changes what the app exposes to humans and CMS tools.

**DNA-21 / app layout.** Thin apps still own composition, content, styles, and a small script orchestrator. They do not own reusable component logic.

**DNA-22 / client surface.** The client surface becomes domain-shaped instead of implementation-shaped. The editable whitelist shifts from `components`, `sections`, and `features` toward `pages`, `prose`, `business`, `navigation`, `site`, and localized `assets`.

**DNA-23 / cosmic overlay.** Cosmic names remain mandatory in `packages/ui` manifests and internal registries. The change is that app authors no longer type cosmic names in CMS-facing page content. Validators check the derived mapping.

**DNA-24 / block-declarative pages.** Pages remain block-declarative. The block selector changes from `use: PlanetName` to a stable author-facing archetype identifier or template slot name.

**DNA-25 / buildPage pipeline.** `buildPage()` remains the single route pipeline. It gains, or is preceded by, a normalization step that converts CMS-friendly block types into the internal cosmic/import-path representation.

**DNA-26 / runtime context.** Build-time context remains deterministic. Feature-graph visibility is replaced with visibility resolved from page blocks and system/site settings.

**RFC-0031 / assets.** This RFC aligns with colocated source assets but narrows the naming: the repository uses `assets/`, not `media/`, for Astro-optimized visitor-facing files.

**RFC-0043 / image formats.** Optimized content assets remain subject to image-format policy. Public exceptions stay in `public/`.

**RFC-0044 and RFC-0046 / navigation.** Navigation content remains a first-class content layer and becomes the canonical source for header/footer navigation links, legal links, and CMS-editable labels.

**RFC-0018 / feature graph.** This RFC proposes retiring the default `src/content/features/**` feature graph because page blocks and shell/site settings are sufficient for the CMS-first model.

**RFC-0038 / language config.** Content-declared language configuration remains, but the source becomes a single `src/content/system.md` rather than a mirrored YAML/Markdown pair.

## Design

### CLI surface

This RFC proposes one new validation command and changes several existing commands.

```sh
pnpm exec werkstatt run content.surface.validate --app nicaragua-projekt
pnpm exec werkstatt run content.surface.validate --all --json
```

`content.surface.validate` validates the CMS-friendly app surface:

- `src/content/system.md` exists and is the only canonical system manifest.
- `src/content/components/**` is absent after migration, except during an explicit migration grace mode.
- `src/content/sections/**` is absent after migration.
- `src/content/features/**` is absent after migration.
- `src/content/prose/{lang}/**/*.md` is used instead of language suffix filenames.
- `src/content/**/assets/**` is allowed and optimized by Astro import paths.
- `src/content/media/**` is forbidden.
- `public/**` contains only public exceptions, not normal visitor-facing content images.
- Page block selectors use author-facing `type` or template slot keys, not `use: PlanetName`.

Changed commands:

- `system.manifest.validate` reads `src/content/system.md`.
- `page.block.validate` validates author-facing block types and their internal mapping.
- `page.shell.validate` reads shell settings from `system.md` and/or `site/{lang}` content.
- `client.edit.validate` uses the new editable whitelist.
- `onboarding.scaffold` creates the new content layout.
- `app.contract.full` includes `content.surface.validate`.

Removed command:

- `feature.graph.validate` is removed after migration because `src/content/features/**` is not part of the default content model.

### TypeScript contracts

The author-facing page contract becomes archetype-based.

```ts
type ContentLanguage = string;

interface SystemContentEntry {
  app: string;
  version: string;
  identity: {
    systemStar: string;
    biome: string;
    tagline?: string;
  };
  i18n: {
    default: ContentLanguage;
    supported: Record<
      ContentLanguage,
      {
        name: string;
        flag?: string;
        hreflang?: string;
        rtl?: boolean;
      }
    >;
  };
  clientEditable: string[];
  growth?: unknown;
  release?: unknown;
}

interface AuthorPageEntry {
  kind: "page";
  pageId: string;
  routeSlug: string;
  title: string;
  description: string;
  lang: ContentLanguage;
  blocks: AuthorBlockEntry[];
}

interface AuthorBlockEntry {
  id: string;
  type: string;
  props: Record<string, unknown>;
  visibility?: unknown;
}

interface NormalizedBlockEntry {
  id: string;
  use: string;
  props: Record<string, unknown>;
  visibility?: unknown;
}
```

`AuthorBlockEntry.type` is a CMS-facing archetype slug, for example `hero`, `problem`, `markdown`, `team`, `donation-card`, or `breadcrumbs`. The platform maps it to the internal cosmic name and import path by reading package manifests and registries.

The prose reference contract becomes language-folder based.

```ts
interface MarkdownBlockProps {
  contentRef: string;
}
```

For `lang = "en"` and `contentRef = "legal/impressum"`, the resolver checks:

```txt
src/content/prose/en/legal/impressum.md
src/content/prose/{defaultLang}/legal/impressum.md
```

The resolver does not require `legal/impressum.en`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/<app>/src/content/system.md` | Single canonical app system manifest and i18n source |
| `apps/<app>/system.yaml` | Removed after migration; no longer canonical |
| `apps/<app>/src/content/assets/system.md` | Removed after migration; replaced by `src/content/system.md` |
| `apps/<app>/src/content/pages/{lang}/**/*.md` | CMS-editable block-declarative pages |
| `apps/<app>/src/content/pages/{lang}/assets/**` | Optimized page-owned assets |
| `apps/<app>/src/content/prose/{lang}/**/*.md` | CMS-editable long-form prose with language fallback |
| `apps/<app>/src/content/prose/{lang}/assets/**` | Optimized prose-owned localized assets |
| `apps/<app>/src/content/business/{lang}/**/*.md` | Canonical business/legal/contact data |
| `apps/<app>/src/content/business/{lang}/assets/**` | Optimized assets owned by business entries |
| `apps/<app>/src/content/navigation/{lang}/navigation.md` | Canonical navigation labels and semantic targets |
| `apps/<app>/src/content/site/{lang}/**/*.md` | Shared shell/site UI labels, footer promo content, and non-navigation shared copy |
| `apps/<app>/src/content/site/{lang}/assets/**` | Optimized shell/site-owned localized assets |
| `apps/<app>/src/content/components/**` | Removed from the CMS-first surface |
| `apps/<app>/src/content/sections/**` | Removed; section-specific data moves to pages/prose/business |
| `apps/<app>/src/content/features/**` | Removed; feature graph replaced by page block and shell settings |
| `apps/<app>/src/content/media/**` | Forbidden; use colocated `assets/**` |
| `apps/<app>/public/**` | Public exceptions served as-is and not optimized by Astro |
| `apps/<app>/src/scripts/layout-orchestrator.ts` | Required thin app performance extension point |
| `apps/<app>/src/styles/**` | Allowed brand customization surface |
| `packages/share/src/page.ts` | Normalization and block-resolution contracts |
| `packages/os/site-kernel-checks/**` | Validation command updates |
| `packages/os/site-kernel-content/**` | `system.md` and localized content loader updates |

### Output format

`content.surface.validate --json` returns:

```json
{
  "command": "content.surface.validate",
  "status": "fail",
  "app": "nicaragua-projekt",
  "violations": [
    {
      "file": "apps/nicaragua-projekt/src/content/components/de/header-component.md",
      "rule": "legacy-components-content",
      "severity": "error",
      "message": "src/content/components/** is not part of the CMS-first content surface."
    }
  ],
  "warnings": [
    {
      "file": "apps/nicaragua-projekt/public/images/logo.svg",
      "rule": "public-exception-review",
      "severity": "warning",
      "message": "public/** is reserved for fixed-path public exceptions; verify this file must bypass Astro optimization."
    }
  ]
}
```

The pretty output groups violations by content domain and prints migration hints.

### Failure modes

After this RFC is accepted and the migration grace mode ends, these are errors:

- both `system.yaml` and `src/content/system.md` exist as canonical manifests;
- `src/content/assets/system.md` exists;
- `src/content/components/**` exists;
- `src/content/sections/**` exists;
- `src/content/features/**` exists;
- `src/content/media/**` exists;
- page blocks use `use: <CosmicName>`;
- prose files use language suffix naming under the new `src/content/prose/**` surface;
- normal visitor-facing image assets are placed in `public/**` instead of content-local `assets/**`.

These are warnings:

- `public/**` contains files that may be valid fixed-path exceptions but need human review;
- an asset is placed under a language folder but referenced by all languages;
- a page block carries visibility logic that should be simplified into `enabled: false` or removed.

During migration, `content.surface.validate --grace` may warn instead of fail for legacy folders, but new apps created by `onboarding.scaffold` must comply from day one.

## Rollout

1. Add `content.surface.validate` in warning mode for existing apps.
2. Update `onboarding.scaffold` so every new app uses the CMS-first content surface.
3. Add a `system.md` loader in `@gogol/site-kernel-content` and update runtime/validator consumers to read it.
4. Migrate `apps/nicaragua-projekt` as the proving app:
   - move `components/prose/*.de.md` to `prose/de/*.md`;
   - move `components/prose/*.en.md` to `prose/en/*.md`;
   - update `contentRef` values to language-independent references;
   - move `components/assets/**` into owning `assets/**` folders;
   - move header/footer navigation data to `navigation/{lang}/navigation.md`;
   - move shell labels and footer promo copy to `site/{lang}/`;
   - remove `sections/donation-card.md` and read donation data from `business/{lang}/legal.md`;
   - replace `system.yaml` and `content/assets/system.md` with one `content/system.md`;
   - replace `blocks[].use` with author-facing block `type`;
   - remove `content/features/**`.
5. Update validators and `app.contract.full`.
6. Promote `content.surface.validate` to fail-hard for new apps and migrated apps.
7. Update `AGENTS.md`, root GRACE docs, onboarding documentation, and client-export documentation.

No backward compatibility guarantee is required for `apps/nicaragua-projekt` because the platform is still in the reference-site phase. Existing accepted RFCs remain authoritative until this RFC reaches `accepted`.

## Alternatives considered

**Keep `src/content/components/**`.** Rejected because clients and CMS users should not edit implementation-shaped folders. Component implementation lives in `packages/ui`; app content should use semantic domains.

**Create `src/content/media/**`.** Rejected. Displayed media should be colocated under `assets/\*\*` near the content domain that owns it so Astro can optimize it and localization is explicit.

**Keep both `system.yaml` and `system.md`.** Rejected. The mirror pair created drift risk and manual synchronization overhead.

**Keep feature graph as an advanced layer.** Rejected for the default model. It duplicates page block visibility and makes simple sites harder to maintain. A future RFC may reintroduce advanced experimentation/segmentation through Growth-specific contracts if needed.

**Keep cosmic names in page markdown.** Rejected for CMS-facing content. Cosmic names remain valuable internally but are not suitable for client editing.

**Move all app scripts and styles into packages.** Rejected. `layout-orchestrator.ts` and `src/styles/**` are deliberate thin app extension points for performance and brand identity.

## Risks

**Validator churn.** Several validators currently assume `system.yaml`, `components/**`, `features/**`, or `blocks[].use`. The migration must update validators before deleting legacy content.

**Cosmic overlay confusion.** Agents may assume removing `use` removes cosmic names entirely. It does not. Cosmic names remain package/internal contract fields.

**Asset path breakage.** Moving assets requires updating import globs to use `src/content/**/assets/**/*` consistently.

**Public folder misuse.** Teams may overuse `public/**` because it is simple. Validation and documentation must make clear that normal visitor-facing media belongs in content-local `assets/**`.

**Feature flag loss.** Removing `src/content/features/**` simplifies CMS editing but removes a general-purpose graph. Growth-specific experimentation must remain in the Growth layer, not in the retired feature graph.

**Single `system.md` parser risk.** Markdown frontmatter must be parsed reliably by both Astro runtime and Site OS validators.

## Acceptance criteria

- [x] `src/content/system.md` is the only canonical system manifest for migrated apps. (evidence: implemented historically)
- [x] `system.manifest.validate` reads and validates `src/content/system.md`. (evidence: implemented historically)
- [x] `onboarding.scaffold` creates the CMS-first content tree. (evidence: implemented historically)
- [x] `content.surface.validate` is implemented with stable `--json` output. (evidence: implemented historically)
- [x] `app.contract.full` runs `content.surface.validate`. (evidence: implemented historically)
- [x] `src/content/prose/{lang}/**/*.md` replaces `components/prose/*.lang.md`. (evidence: implemented historically)
- [x] `contentRef` resolution supports language folders and default-language fallback. (evidence: implemented historically)
- [x] `src/content/components/**`, `src/content/sections/**`, and `src/content/features/**` are removed from the migrated reference app. (evidence: implemented historically)
- [x] `src/content/media/**` is rejected by validation. (evidence: implemented historically)
- [x] Content asset globs support recursive `src/content/**/assets/**/*` lookup. (evidence: implemented historically)
- [x] `public/**` exceptions are documented and validated. (evidence: implemented historically)
- [x] Header/footer navigation consumes `src/content/navigation/{lang}/navigation.md`. (evidence: implemented historically)
- [x] Shell labels and shared site copy consume `src/content/site/{lang}/`. (evidence: implemented historically)
- [x] Donation card data is loaded from `src/content/business/{lang}/legal.md`. (evidence: implemented historically)
- [x] Page blocks use CMS-facing `type` or template slot names instead of `use`. (evidence: implemented historically)
- [x] `src/scripts/layout-orchestrator.ts` remains the standard thin app script extension point. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `src/styles/**` remains the standard thin app brand customization surface. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `AGENTS.md`, GRACE XML docs, and onboarding docs are updated after acceptance. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes from this RFC only after status becomes `accepted`.
- Agents MUST NOT change this RFC's status field.
- Agents MUST NOT delete `src/scripts/layout-orchestrator.ts` while implementing this RFC.
- Agents MUST NOT delete `src/styles/**` as part of the thin-app simplification.
- Agents MUST NOT introduce `src/content/media/**`.
- Agents MUST keep optimized visitor-facing media under content-local `assets/**`.
- Agents MUST keep fixed-path unoptimized exceptions under `public/**`.
- Agents MUST preserve the package-level cosmic manifest and catalog contracts.
- Agents MUST hide cosmic names from CMS-facing page content through normalization, not by removing cosmic validation.
- Agents MUST remove the feature graph only after page block, shell, and growth contracts have replacement paths.
- Agents MUST update root `AGENTS.md` and GRACE XML docs when this RFC is implemented because it changes repository-wide app structure and validation policy.
