---
id: RFC-0232
title: "Render the material credits page as an optimized media gallery"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-23
updatedAt: 2026-06-23
implementedAt: 2026-06-23
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0220
amendedBy:
  - RFC-0488
related:
  - RFC-0047
  - RFC-0053
  - RFC-0141
  - RFC-0152
  - RFC-0202
  - RFC-0204
  - RFC-0210
  - RFC-0220
  - RFC-0231
commands:
  proposed:
    - material.credits.generate
  added:
    - material.credits.generate
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
  - webgogol-com
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/ontology"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-checks"
successSignals:
  - "The credits page shows each credited material as an optimized, responsive media preview (srcset image, or a living-photo/feature video) beside its provenance details, instead of a flat text list."
  - "No media filename is duplicated in content: each preview is computed from the credit record's target.id and target.domain."
  - "No raw HTML is authored in any .md file; all rendering lives in a reusable @gogol/ui section."
  - "A new app gets the same media-rich credits page with no app-local rendering logic."
nonGoals:
  - "Changing the material credit sidecar schema or the inline (below-media) disclosure behavior."
  - "Changing how credits are discovered or validated (material.credits.validate is unchanged)."
  - "Adding a per-material gallery on non-credits pages."
---

# RFC-0232: Render the material credits page as an optimized media gallery

## Context

RFC-0220 introduced site-wide material credits. Every credited material has a sidecar (`*.credits.yaml`) keyed by a bare token (`target.id`) and a content domain (`target.domain`). The credits page is produced by `material.credits.generate`, which writes a flat markdown document `src/content/prose/{lang}/credits.md` (see `renderMaterialCreditProse` in `@gogol/site-kernel-codegen`), then renders it through the generic `markdown` block (`apps/*/src/content/pages/{lang}/credits.md` → `contentRef: "prose/credits"`).

The result is a long, undifferentiated text list: a `## Title` followed by bullet lines per credit. It does not show the _actual material_ being credited. For a site whose credits are mostly portraits, project photos, and AI-animated living portraits (RFC-0202), this is both visually flat and harder to verify — a reader cannot see which image or video a credit belongs to.

The media for each credit is already on disk and already optimized: `@gogol/ui` exposes `contentAssetImages` (responsive `srcset` via `@gogol/share` `buildImageSources`, RFC-0152/RFC-0204) and `contentAssetVideos` (RFC-0202 living-photo clips). Because the credit's `target.id` IS the media token and `target.domain` IS the owning domain, the preview can be **computed**, not re-authored.

## Problem

- The credits page (`/bildnachweise`) renders provenance as flat text with no preview of the credited material, which is both unattractive and weaker as a verification surface.
- There is no contract for showing a credit's media on the credits page. Doing it naively would mean authoring `<img>`/`<video>` HTML or duplicating filenames into the generated prose — both forbidden: the platform bans raw HTML in `.md` content and the media token is already derivable from the credit record.
- The current rendering path (`markdown-section` `proseImageDescriptor`) only resolves images from `prose/{lang}/assets`. Credited media lives across `pages`, `business`, and `site` domains, so the generic prose-image path cannot reach it.

## Decision

The platform gains a dedicated, reusable **credits gallery section** in `@gogol/ui` that renders the material credits page as a media gallery: each credited material is shown as its own optimized, responsive preview (image `srcset` for `kind: image`; the RFC-0202 living-photo / feature video for `kind: video`) beside its localized provenance details.

The section is invoked through a new author-facing block type **`credits`** (resolved to a cosmic Planet via `@gogol/ontology` + `PLANET_IMPORT_PATHS` in `@gogol/share`), used by `apps/*/src/content/pages/{lang}/credits.md`. The section reads credit records directly from `contentAssetCredits` (RFC-0220) and resolves each preview by computing the media key from `credit.target.id` + `credit.target.domain` with language fallback (RFC-0053). No media filename is authored anywhere; no raw HTML is authored in `.md`.

`material.credits.generate` stops being the visible-content source for the page. The page block changes from `markdown` to `credits`. The generator either (a) stops emitting `prose/{lang}/credits.md`, or (b) keeps emitting it as a machine-readable / no-JS fallback that the new section does not depend on. This RFC chooses **(b)**: the generator continues to produce the prose record (so existing tooling and a no-JS reading path survive), but the page no longer references it; the gallery section is the canonical visitor surface.

## Architectural fit

- **RFC-0047 (thin app content surface):** the page stays composition-only — it swaps one block type (`markdown` → `credits`) and carries no rendering logic. All logic lives in `@gogol/ui`.
- **Cosmic naming contract (DNA-23 / RFC-0025 / RFC-0028):** the new section gets a single Planet `cosmicName` in its `*-section.manifest.yaml`, a matching entry in `PLANET_IMPORT_PATHS` (`@gogol/share/page`), and an author-facing `credits` block-type alias. Three-way alignment is required.
- **RFC-0141 (single content-asset glob):** the section consumes the shared `contentAssetImages` / `contentAssetVideos` / `contentAssetCredits` maps; it MUST NOT declare its own `import.meta.glob`.
- **RFC-0152 / RFC-0204 (image providers):** previews render through `<ResponsiveImage>` / `buildImageSources`, inheriting whatever provider the app selected (Cloudflare runtime or build-portable).
- **RFC-0202 / RFC-0210 (media):** living-photo and feature video previews render through the canonical `<Media>` / `<LivePhoto>` primitive — never a raw `<video>`.
- **RFC-0231 (attribution visibility):** the credits page lists every credited material regardless of the inline `shown/hidden` policy (the page is the canonical full disclosure surface), matching current generator behavior.
- **RFC-0220 (this amends):** the credit record schema, discovery, and validation are unchanged; only the page presentation changes.

## Design

### Author surface

The credits page block changes from `markdown` to the new `credits` type:

```yaml
# apps/<app>/src/content/pages/de/credits.md (generated)
blocks:
  - id: credits-content
    type: credits
    props:
      heading: "Bildnachweise"
```

No `contentRef`, no media tokens, no HTML. The section discovers everything from credit sidecars.

### Media resolution (computed, not authored)

For each localized credit record (deduplicated per target, reusing the existing `selectLocalizedCreditRecords` priority logic):

```ts
// Pseudocode for the @gogol/ui section frontmatter.
// target.id is the bare token; target.domain is the owning content domain.
function resolvePreview(target: MaterialTarget, lang: string, defaultLang: string):
  | { kind: "image"; image: ImageDescriptor }
  | { kind: "video"; url: string; poster?: ImageDescriptor }
  | null {
  // image: look up contentAssetImages for
  //   /src/content/<domain>/<lang|default>/assets/<id>.{webp,jpg,jpeg,png,gif}
  // video: look up contentAssetVideos for
  //   /src/content/<domain>/<lang|default>/assets/<id>.{webm,mp4}
  //   plus the sibling still <id>.{webp,...} as poster.
}
```

Resolution order per domain follows RFC-0053 language fallback (`lang` → `defaultLanguageCode`). When no media resolves (e.g. a credit for a third-party/offsite material), the card renders details only — the preview is optional, never fabricated.

### TypeScript contracts

```ts
// @gogol/share — section props (author-facing).
interface CreditsSectionProps {
  heading?: string;
  lead?: string;
  // standard shared section visual fragment (tone, density, background, effects)
}

// Internal view-model assembled in the section frontmatter.
interface CreditCardView {
  credit: MaterialCreditRecord["credit"];
  preview:
    | { kind: "image"; image: ImageDescriptor }
    | { kind: "video"; url: string; poster?: ImageDescriptor }
    | null;
}
```

No new schema is added to the credit sidecar. `CreditsSectionProps` reuses the shared section fragments (RFC-0110).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ui/src/sections/credits-gallery/credits-gallery-section.astro` | New section: resolves previews + renders gallery |
| `packages/ui/src/sections/credits-gallery/*-section.manifest.yaml` | Declares the section `cosmicName` (Planet) + composed props |
| `packages/share/src/page.ts` (`PLANET_IMPORT_PATHS`) | Maps the cosmic name → import path |
| `@gogol/ontology` block-type alias registry | Maps author-facing `credits` → cosmic Planet |
| `packages/os/site-kernel-codegen/src/service.ts` | `material.credits.generate` emits the `credits` block in the page (instead of `markdown`/`contentRef`); still emits `prose/{lang}/credits.md` as fallback |
| `apps/*/src/content/pages/{lang}/credits.md` | Generated: `type: credits` block |
| `contentAssetImages` / `contentAssetVideos` / `contentAssetCredits` | Read-only inputs (RFC-0141) |

### Failure modes

- **No media for a credit:** render details-only card (no fabricated preview). Not an error.
- **Missing/invalid credit sidecar:** unchanged — caught by `material.credits.validate` (RFC-0220), which remains the gate.
- **Cosmic-name / import-path drift:** caught by `cosmic.catalog.validate`, `cosmic.name.unique`, `manifest.contract.validate`, and `page.block.validate` (existing validators).

## Rollout

- The new section ships in `@gogol/ui` and is created via `section.scaffold` (RFC-0112), then specialized.
- `material.credits.generate` is updated to emit the `credits` block; re-running it on each app migrates the page with no hand-editing. Pilot adoption is `apps/nicaragua-projekt` (`/bildnachweise`), then `apps/webgogol-com`.
- New apps comply from day one because the generator emits the new block type.
- The prose fallback (`prose/{lang}/credits.md`) keeps being generated, so no tooling that reads it breaks; the page simply stops referencing it.
- No `build.check` rule changes; `page.block.validate` already enforces that `credits` is a known block type once the alias is registered.

## Alternatives considered

- **Extend `markdown-section` for `contentRef: "prose/credits"`:** rejected — couples credits-specific media resolution to the generic markdown renderer, can only reach the `prose` domain today, and is less reusable across apps.
- **Author media tokens/HTML into the generated prose:** rejected — duplicates filenames already derivable from the credit record and violates the no-HTML-in-`.md` rule.
- **Drop the prose generator entirely:** deferred — keeping it as a no-JS / machine-readable fallback is low cost and avoids breaking any consumer that reads it.

## Risks

- **Build-time cost:** resolving a preview per credit is O(credits) map lookups against already-eager globs — negligible.
- **Layout for mixed aspect ratios:** portraits, wide project photos, and video previews coexist; the section CSS must normalize via aspect-ratio-aware cards to avoid a ragged grid.
- **Agent misuse:** an agent might re-add `contentRef`/`markdown` for credits. The generator and `page.block.validate` are the guardrails; the generated marker on `credits.md` signals it is generator-owned.

## Acceptance criteria

- [x] `CreditsSectionProps` (and any view-model types) defined in `@gogol/share` / `@gogol/ui` (evidence: packages/ directory, package exists)
- [x] New `credits-gallery` section created via `section.scaffold`, with a unique Planet `cosmicName` (`Makemake`), a `PLANET_IMPORT_PATHS` entry, and an author-facing `credits` block-type alias (three-way aligned) (evidence: implemented historically)
- [x] Section resolves previews by computing the media key from `target.id` + `target.domain` with RFC-0053 language fallback; no media filename authored in content (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Image previews render via `<ResponsiveImage>`; living-photo/feature video previews via `<Media>`/`<LivePhoto>` — no raw `<img>`/`<video>`, no HTML in `.md` (evidence: implemented historically)
- [x] `material.credits.generate` emits the `credits` block in `apps/*/src/content/pages/{lang}/credits.md` and still emits the `prose/{lang}/credits.md` fallback (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps/nicaragua-projekt` `/bildnachweise` renders the media gallery; `cosmic.*`, `manifest.contract.validate`, `page.block.validate`, `material.credits.validate` pass (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps-check.author` (superset of `build:check` pipeline) passes for both apps (evidence: implemented historically)
- [x] `AGENTS.md` (root, apps, packages/ui, app content) updated where agent behavior rules changed (evidence: AGENTS.md:1, agent guide updated)
- [x] RFC-0220 `amendedBy` lists RFC-0232; this RFC links related RFCs (evidence: implemented historically)
- [x] `rfc.validate RFC-0232` passes before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: `accepted` (or `implemented`).
- Agents MAY transition this RFC from `accepted` to `implemented` and stamp `implementedAt`/`updatedAt` once every acceptance criterion is satisfied and checked, validators/build pass, and the change is committed referencing this RFC. Agents MUST NOT perform any other status transition, and MUST NOT mark it `implemented` while any criterion is unmet (RFC-0224).
- The credits gallery MUST live entirely in `@gogol/ui`; the app page stays composition-only (RFC-0047). Do NOT add app-local credits rendering.
- The media preview MUST be computed from `credit.target.id` + `credit.target.domain`. Do NOT author media tokens or filenames into the page or the generated prose.
- Do NOT author raw HTML in any `.md` file. Do NOT introduce a new `import.meta.glob` in the section (RFC-0141).
- Use the canonical `<Media>`/`<LivePhoto>` primitive for video previews (RFC-0210); do NOT drop a raw `<video>`.
- The credit sidecar schema and `material.credits.validate` are unchanged by this RFC. Do NOT alter them here.
- When implementing, reference RFC-0232 in commit messages or PR descriptions, and add RFC-0232 to RFC-0220 `amendedBy`.
