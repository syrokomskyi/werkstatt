---
id: RFC-0499
title: "Media metadata leakage prevention on surface pages"
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
  - RFC-0231
amendedBy: []
related:
  - RFC-0220
  - RFC-0231
  - RFC-0232
  - RFC-0488
  - RFC-0478
  - RFC-0480
  - RFC-0492
satisfies:
  - DNA-24
  - DNA-53
breaksC: true
versionBump: patch
commands:
  proposed: []
  added:
    - surface.media-leakage.validate
  changed:
    - surface.validate
    - surface.contract.validate
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/site-kernel-checks"
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/ontology"
successSignals:
  - "No surface page renders visible media metadata text (Gemini, AIPlatform, Warpgogol Organization, commissioned-warpgogol-material, Copyright © 2026 Warpgogol) in the readable card body or prose blocks."
  - "Media metadata appears only in JSON-LD script blocks (structured data) and on the dedicated /bildnachweise/ provenance registry page (RFC-0488)."
  - "AI-generated images on surface pages display a short 'Konzeptillustration' label (or localized equivalent) and a link to the precise /bildnachweise/#... anchor — no full Bildnachweis text in the page body."
  - "surface.media-leakage.validate scans all rendered surface page HTML for prohibited metadata strings and fails on any match."
  - "The baker (bakePage) does not emit media metadata fields into readable block props — metadata stays in JSON-LD script blocks only."
  - "No surface page shows internal enum values (commissioned-warpgogol-material, linked-public-source, AIPlatform, Organization) to visitors — these are mapped to localized human-readable labels by the material credits renderer (RFC-0488)."
nonGoals:
  - "Does not change the material credits page (/bildnachweise/) — that is governed by RFC-0488."
  - "Does not change the credits sidecar schema (*.credits.yaml) — that is governed by RFC-0220."
  - "Does not change the inline disclosure behavior on non-surface pages (RFC-0231 visibility policy is unchanged for non-surface pages)."
  - "Does not add C2PA/IPTC/XMP embedded metadata — that remains a future RFC."
  - "Does not remove AI-generated images from surface pages — AI images may illustrate architectural concepts when explicitly labeled as conceptual."
  - "Does not change the image optimization or Cloudflare transformation pipeline — that is governed by the image optimization documentation."
---

# RFC-0499: Media metadata leakage prevention on surface pages

## Context

RFC-0220 introduced site-wide material credits with a structured sidecar schema. RFC-0231 established the visibility policy for media metadata. RFC-0232 upgraded the credits page to a media gallery. RFC-0488 redesigned the credits page as a provenance registry with stable anchors and human-readable labels for internal enum values.

An external expert review (file 14.3, §15) identified that surface pages still leak media metadata into the readable page body:

> С текущей страницы убрать видимый вывод: Gemini 3.1 Image AIPlatform Warpgogol Organization commissioned-warpgogol-material Copyright © 2026 Warpgogol
>
> На странице оставить: изображение; корректный alt; короткую отметку Konzeptillustration; ссылку на точный объект /bildnachweise/#...
>
> Полный media registry остаётся на /bildnachweise/.

The current baker (`bakePage`) may emit media metadata fields into readable block props (e.g., card descriptions, image captions) instead of keeping them in JSON-LD script blocks only. This creates visible text that exposes internal enum values and AI authorship labels to visitors in the page body.

## Problem

1. **Internal enum values visible.** Values like `commissioned-warpgogol-material`, `linked-public-source`, `AIPlatform`, `Organization` may appear in readable card bodies on surface pages.
2. **Full Bildnachweis text in page body.** The full media provenance text (e.g., "Gemini 3.1 Image", "Copyright © 2026 Warpgogol") may appear in readable prose or card descriptions instead of only in JSON-LD and on `/bildnachweise/`.
3. **No enforcement.** There is no validator that scans rendered surface page HTML for prohibited metadata strings.
4. **Inconsistent with RFC-0488.** RFC-0488 maps internal enum values to human-readable labels on the credits page, but surface pages may still render the raw values.

## Decision

The baker (`bakePage` in `@gogol/site-kernel-checks/src/surface-expand/bake.ts`) is updated to stop emitting media metadata fields into readable block props. Media metadata is confined to JSON-LD `<script>` blocks and the `/bildnachweise/` provenance registry (RFC-0488). AI-generated images on surface pages get a short `Konzeptillustration` label and a deep link to `/bildnachweise/#...`.

A new validator `surface.media-leakage.validate` scans rendered surface page HTML for prohibited metadata strings. The prohibited strings are declared in the Layer C contract (`packages/ontology/src/external-surfaces/`) as a media-leakage policy, enforced by `surface.contract.validate`.

This RFC amends RFC-0231 (attribution visibility policy) to add surface-page-specific restrictions: on surface pages, the visibility policy is tightened to suppress all media metadata from readable HTML, not just per-section credit rows.

### Prohibited visible strings on surface pages

The following strings must not appear in the readable HTML body of any surface page (inside `<main>`, `<article>`, `<section>`, `<div>`, `<p>`, `<span>`, `<figcaption>`, or any other visible element — but not inside `<script>` tags):

| Prohibited string | Matching strategy | Reason |
| --- | --- | --- |
| `Gemini` | Context-aware: only flagged inside credit-context elements (`<figcaption>`, `<details>`, card metadata `<dl>`) — not in prose body text | AI model name is internal metadata, not visitor-facing |
| `AIPlatform` | Case-sensitive whole-word match | Internal enum value (`CreditPartyKind`) |
| `Organization` | Context-aware: only flagged as a media author label (inside `<figcaption>`, `<details>`, card metadata `<dl>`) — not in general prose | Internal enum value (`CreditPartyKind`) |
| `commissioned-warpgogol-material` | Case-sensitive whole-word match | Internal enum value (`MaterialSourceType`) |
| `linked-public-source` | Case-sensitive whole-word match | Internal enum value |
| `Copyright © 2026 Warpgogol` | Exact phrase match in card body (footer excluded) | Repetitive copyright boilerplate — per-material usage status is on `/bildnachweise/` |

**Context-aware matching.** The validator does not use naive substring scanning for "Gemini" and "Organization" — both are common words that appear legitimately in prose. Instead:

1. For `Gemini`: the string is flagged only when it appears inside an element whose `data-credit-context` attribute is set (emitted by `<MaterialCredit>` and `<figcaption>` for credited images), or inside a card description that maps to a media credit sidecar field.
2. For `Organization`: the string is flagged only as a media author label (inside `<figcaption>`, `<details>`, or a card metadata `<dl>`), not as a general prose word.
3. For enum values (`AIPlatform`, `commissioned-warpgogol-material`, `linked-public-source`): case-sensitive whole-word match anywhere in visible HTML — these strings are internal codes that never appear in legitimate prose.

### Allowed visible media labels on surface pages

| Allowed label | Context |
| --- | --- |
| `Konzeptillustration` (DE) / `Концептуальна ілюстрація` (UK) | Short label for AI-generated conceptual images |
| Image `alt` text | Accessible alternative text |
| Link to `/bildnachweise/#...` | Deep link to the material's card on the provenance registry page |

### Baker changes

The baker (`bakePage`) is updated to:

1. **Not emit** media metadata fields (`author`, `source`, `aiPlatform`, `copyright`, `usageBasis`) into readable block props (card descriptions, image captions, prose content).
2. **Emit** media metadata only in JSON-LD `<script type="application/ld+json">` blocks.
3. **Emit** a short `Konzeptillustration` label (or localized equivalent) as a `<figcaption>` for AI-generated images, with a link to the corresponding `/bildnachweise/#...` anchor.

### Validator

`surface.media-leakage.validate` scans all rendered surface page HTML for the prohibited strings. It checks:

1. No prohibited string appears inside a visible HTML element (not inside `<script>`), using the context-aware matching strategy described above.
2. AI-generated images have a `Konzeptillustration` (or localized equivalent) label.
3. AI-generated images have a link to `/bildnachweise/#...`.

The validator uses the same rendered HTML collection as `seo.structured-data.validate` (RFC-0074) — it reads from `dist/client/` after a production build.

### Layer C contract

The prohibited visible strings and the matching strategy are declared in the Layer C contract (`packages/ontology/src/external-surfaces/`, RFC-0480) as a new `mediaLeakagePolicy` section in `jsonld-types.yaml`. `surface.contract.validate` checks that the rendered HTML matches the policy.

## Architectural fit

- **RFC-0220 (material credits schema):** this RFC does not change the sidecar schema — it changes how the baker emits (or rather, suppresses) credit fields into readable block props. The sidecar remains the canonical source; JSON-LD projection from the sidecar is preserved.
- **RFC-0231 (attribution visibility policy, amended):** the amendment tightens the visibility policy for surface pages specifically. On non-surface pages, the existing `shown`/`hidden` precedence chain is unchanged. On surface pages, media metadata is always suppressed from readable HTML regardless of the per-asset/per-placement/site-default visibility settings — the surface-page rule is the strongest override.
- **RFC-0488 (provenance registry):** the `/bildnachweise/` page is the canonical full disclosure surface. Surface pages link to it via stable anchors. RFC-0488's label mapping helpers (`labelForSourceType`, `labelForStatus`, `labelForUsageBasis`) are reused by the baker when emitting the `Konzeptillustration` label.
- **RFC-0480 (Layer C protection):** the media-leakage policy is declared in the Layer C contract. `breaksC: true` because the C-contract in `packages/ontology/src/external-surfaces/` is extended. `surface.contract.validate` enforces the policy.
- **RFC-0498 (structured data policy):** RFC-0498 governs JSON-LD type policy per surface depth. This RFC is complementary — it governs visible HTML content, not JSON-LD types. The two policies are independent: RFC-0498 controls what JSON-LD types are emitted; RFC-0499 controls what media metadata appears in visible HTML.
- **DNA-24 (block-declarative pages):** the baker changes affect what fields are emitted into block props. The block-declarative contract is preserved — blocks still carry `type` and `props`; the change is that media metadata fields are removed from `props` and confined to JSON-LD `<script>` blocks emitted by the semantic layer.
- **DNA-53 (semantic fingerprint governance):** the media-leakage policy added to `packages/ontology/src/external-surfaces/jsonld-types.yaml` is part of the platform semantic hash. Changes to this file trigger version enforcement (RFC-0478). The `versionBump: patch` reflects that this is a policy addition, not a contract break.

## Design

### CLI surface

```sh
# Validate media leakage on rendered surface pages
pnpm exec site-kernel run surface.media-leakage.validate --site warpgogol-com --json

# Validate Layer C contract (includes media-leakage policy)
pnpm exec site-kernel run surface.contract.validate --site warpgogol-com --json
```

`surface.media-leakage.validate` is site-scoped and runs in `sites-check-postbuild` (after the production build, because it scans rendered HTML from `dist/client/`). It exits non-zero when any prohibited string is found in visible HTML, or when an AI-generated image lacks the `Konzeptillustration` label or `/bildnachweise/#...` link.

`surface.validate` is updated to include media-leakage checks as an additional rule set. `surface.contract.validate` is updated to check the media-leakage policy from the Layer C contract.

### TypeScript contracts

```ts
interface MediaLeakageProhibitedString {
  pattern: string;
  matchingStrategy: "exact" | "whole-word" | "context-aware";
  contextSelector?: string;
  reason: string;
}

interface MediaLeakageViolation {
  rule: string;
  page: string;
  element: string;
  matchedString: string;
  message: string;
}

interface MediaLeakageValidateResult {
  command: "surface.media-leakage.validate";
  status: "pass" | "fail";
  count: number;
  violations: MediaLeakageViolation[];
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/surface-expand/bake.ts` | Baker: stop emitting media metadata into readable block props; emit `Konzeptillustration` label and `/bildnachweise/#...` link |
| `packages/os/site-kernel-checks/src/surface-media-leakage-validate.ts` | New: `surface.media-leakage.validate` command implementation |
| `packages/os/site-kernel-checks/src/surface/validate.ts` | Updated: include media-leakage rules |
| `packages/ontology/src/external-surfaces/jsonld-types.yaml` | Extended: `mediaLeakagePolicy` section with prohibited strings and matching strategies |
| `packages/ontology/src/external-surfaces/index.ts` | Extended: Zod schema for `mediaLeakagePolicy` |
| `packages/os/site-kernel-handoff/src/surface-contract.ts` | Updated: `surface.contract.validate` checks media-leakage policy |
| `packages/ui/src/components/material-credit/*` | Updated: surface-page mode suppresses visible credit row, emits `Konzeptillustration` label |
| `tools/kernel.config.ts` | Register `surface.media-leakage.validate` command |
| `docs/verification-plan.xml` | Add `surface.media-leakage.validate` check |
| `docs/COMMANDS.md` | Add new command |
| `packages/os/site-kernel-checks/AGENTS.md` | Document `surface.media-leakage.validate` |

### Output format

```json
{
  "command": "surface.media-leakage.validate",
  "status": "fail",
  "count": 2,
  "violations": [
    {
      "rule": "prohibited-string-in-visible-html",
      "page": "/de/elektriker/stuttgart/",
      "element": "figcaption",
      "matchedString": "Gemini 3.1 Image",
      "message": "Prohibited media metadata string 'Gemini 3.1 Image' found in visible <figcaption> on surface page."
    },
    {
      "rule": "missing-konzeptillustration-label",
      "page": "/de/friseur/heidelberg/",
      "element": "figure > img",
      "matchedString": "",
      "message": "AI-generated image on surface page lacks Konzeptillustration label."
    }
  ]
}
```

### Failure modes

| Rule | Severity | Exit code | Description |
| --- | --- | --- | --- |
| `prohibited-string-in-visible-html` | fail | 1 | A prohibited string appears in visible HTML (not inside `<script>`) |
| `missing-konzeptillustration-label` | fail | 1 | An AI-generated image on a surface page lacks the `Konzeptillustration` (or localized equivalent) label |
| `missing-bildnachweise-link` | fail | 1 | An AI-generated image on a surface page lacks a link to `/bildnachweise/#...` |
| `enum-value-in-visible-html` | fail | 1 | An internal enum value (`AIPlatform`, `commissioned-warpgogol-material`, `linked-public-source`) appears in visible HTML |

### Pipeline placement

`surface.media-leakage.validate` runs in `sites-check-postbuild` (blocking, after production build). It scans `dist/client/**/*.html` for surface page routes only — non-surface pages (home, legal, blog, etc.) are excluded. The validator reads the route registry to determine which pages are surface pages (routes with `surfaceId` in the route entry).

## Rollout

1. **Baker changes:** update `bakePage` to stop emitting media metadata into readable block props. Emit `Konzeptillustration` labels and `/bildnachweise/#...` links for AI-generated images. Existing surface pages are regenerated on the next `surface.generate` run — no manual content migration is needed.
2. **Layer C contract:** add `mediaLeakagePolicy` to `packages/ontology/src/external-surfaces/jsonld-types.yaml`. Update the Zod schema in `index.ts`.
3. **Validator:** implement `surface.media-leakage.validate` in `@gogol/site-kernel-checks`. Register in `tools/kernel.config.ts`.
4. **Existing validators:** update `surface.validate` and `surface.contract.validate` to include media-leakage checks.
5. **UI components:** update `<MaterialCredit>` to suppress visible credit rows on surface pages and emit the `Konzeptillustration` label instead.
6. **Compass sync:** update `docs/verification-plan.xml` with the new validator. Update `docs/COMMANDS.md` with the new command. Update `packages/os/site-kernel-checks/AGENTS.md`.
7. **Pilot:** run `surface.media-leakage.validate --site warpgogol-com` after the next production build. Fix any remaining leakage in the baker or content.
8. **New sites:** new sites scaffold with the media-leakage validator from day one — it is part of `sites-check-postbuild` for all sites with surface pages. Sites with no surface pages pass with zero violations.

## Alternatives considered

- **Extend `material.credits.validate` instead of a new command.** Rejected: `material.credits.validate` validates sidecar schema and coverage — it does not scan rendered HTML. Media-leakage detection requires post-build HTML scanning, which is a different pipeline stage (`sites-check-postbuild` vs `build.check`). The existing `surface.*.validate` pattern (`surface.hub.validate`, `surface.service.validate`, `surface.intersection.validate`) establishes the precedent for per-concern surface validators.
- **Naive substring matching for all prohibited strings.** Rejected: "Gemini" and "Organization" are common words that appear legitimately in prose. Context-aware matching is required to avoid false positives (see Risks).
- **Suppress all media from surface pages.** Rejected: AI-generated images may illustrate architectural concepts. The RFC allows them with a `Konzeptillustration` label — removing them would degrade the page quality.
- **Handle this in the credits sidecar schema.** Rejected: the sidecar schema is the canonical source (RFC-0220). The problem is not the schema — it is the baker emitting schema fields into readable HTML. The fix is in the baker, not the schema.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| **False positives for "Gemini" and "Organization"** | Medium | Context-aware matching: "Gemini" is only flagged inside credit-context elements (`<figcaption>`, `<details>`, card metadata `<dl>`), not in prose. "Organization" is only flagged as a media author label, not as a general word. Enum values (`AIPlatform`, `commissioned-warpgogol-material`) use case-sensitive whole-word match — these strings never appear in legitimate prose. |
| **Performance: scanning all surface page HTML** | Low | The validator scans only surface page routes (identified by `surfaceId` in the route registry), not all pages. For `warpgogol-com` (~50-100 surface pages, ~50KB HTML each), the scan is negligible. The scan runs once per `sites-check-postbuild` invocation, not per request. |
| **Footer copyright on surface pages** | Low | The footer copyright line ("Copyright © 2026 Warpgogol") appears in the footer, which is visible HTML. The validator excludes footer elements (scoped to `<footer>` or `[data-footer]`) from the `Copyright © 2026 Warpgogol` check — the prohibition targets per-material copyright boilerplate in card bodies, not the site-wide footer. |
| **Legitimate "Gemini" in prose** | Low | An industry dossier might mention astrology or the Gemini constellation. Context-aware matching ensures only credit-context occurrences are flagged. |
| **Baker regression: dropping JSON-LD** | Low | The baker changes only affect readable block props. JSON-LD `<script>` emission is handled by the semantic layer (`buildJsonLd` in `@gogol/share`), which is not modified by this RFC. The semantic layer continues to emit `ImageObject`/`VideoObject` with full credit fields. |
| **Migration: existing surface pages** | Low | Surface pages are regenerated by `surface.generate` on each build. The baker changes take effect on the next build — no manual content migration is needed. |

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has status `accepted`.
- Agents MUST NOT change the credits sidecar schema — this RFC changes the baker, not the schema (RFC-0220).
- Agents MUST NOT remove JSON-LD `<script>` blocks from surface pages — media metadata stays in structured data. The RFC suppresses visible HTML only.
- Agents MUST use context-aware matching for "Gemini" and "Organization" in the validator — naive substring matching will produce false positives.
- Agents MUST update `packages/ontology/src/external-surfaces/jsonld-types.yaml` with the `mediaLeakagePolicy` section — this is a Layer C contract change (`breaksC: true`).
- Agents MUST update `amendedBy` on RFC-0231 to include RFC-0499 when this RFC is implemented.
- Agents MUST register `surface.media-leakage.validate` in `tools/kernel.config.ts`.
- Agents MUST add the validator to `sites-check-postbuild` pipeline, not `build.check` — it requires rendered HTML from `dist/client/`.
- When implementing, reference RFC-0499 in commit messages.

## Implementation plan

1. Update the baker (`bakePage`) to not emit media metadata into readable block props.
2. Update the baker to emit `Konzeptillustration` labels and `/bildnachweise/#...` links for AI-generated images.
3. Add `mediaLeakagePolicy` to `packages/ontology/src/external-surfaces/jsonld-types.yaml` and update the Zod schema in `index.ts`.
4. Implement `surface.media-leakage.validate` command in `@gogol/site-kernel-checks`.
5. Update `surface.validate` to include media-leakage checks.
6. Update `surface.contract.validate` to include the media-leakage policy.
7. Update `<MaterialCredit>` to suppress visible credit rows on surface pages.
8. Register the new command in `tools/kernel.config.ts`.
9. Update `docs/verification-plan.xml`, `docs/COMMANDS.md`, `packages/os/site-kernel-checks/AGENTS.md`.

## Acceptance criteria

- [x] No surface page renders `Gemini` (in credit context), `AIPlatform`, `Organization` (as media author), `commissioned-warpgogol-material`, `linked-public-source`, or `Copyright © 2026 Warpgogol` (in card body) in visible HTML. (evidence: `surface.media-leakage.validate` scans rendered HTML with context-aware matching; `MaterialCredit` component suppresses credit rows in surfacePage mode)
- [x] AI-generated images on surface pages display a `Konzeptillustration` (or localized equivalent) label. (evidence: `material-credit.astro` emits `<figcaption>` with `konzeptLabel` from `labels.aiUsageLabels.aiGenerated` when `surfacePage && isAiGenerated`)
- [x] AI-generated images on surface pages link to `/bildnachweise/#...`. (evidence: `material-credit.astro` emits `<a href={bildnachweiseHref}>` where `bildnachweiseHref = /bildnachweise/#${credit.id}`)
- [x] `surface.media-leakage.validate` scans rendered HTML and fails on prohibited strings using context-aware matching. (evidence: `surface-media-leakage-validate.ts` implements exact, whole-word, and context-aware matching strategies against `mediaLeakagePolicy.prohibitedStrings`)
- [x] `surface.contract.validate` includes the media-leakage policy from the Layer C contract. (evidence: `surface-contract.ts` checks `jsonldTypes.mediaLeakagePolicy` presence and structural validity — prohibitedStrings, requiredLabels, requiredLinkPattern, aiImageAttribute)
- [x] Media metadata appears only in JSON-LD `<script>` blocks and on `/bildnachweise/`. (evidence: `surface.media-leakage.validate` strips JSON-LD `<script>` blocks before scanning; `MaterialCredit` always emits JSON-LD regardless of `surfacePage` mode)
- [x] `surface.media-leakage.validate` is registered in `tools/kernel.config.ts` and runs in `sites-check-postbuild`. (evidence: registered in `command-tables/09b-build-artifacts-part2.ts`; added to `SITES_CHECK_POSTBUILD_PIPELINE` in `sites-check-postbuild.ts`)
- [x] `packages/ontology/src/external-surfaces/jsonld-types.yaml` includes the `mediaLeakagePolicy` section. (evidence: `jsonld-types.yaml` lines 50-79 declare prohibitedStrings, requiredLabels, requiredLinkPattern, aiImageAttribute; Zod schema in `index.ts` validates the structure)
- [x] RFC-0231 `amendedBy` includes RFC-0499. (evidence: `docs/rfcs/archive/implemented/rfc-0231-*.md` frontmatter `amendedBy: [RFC-0499]` already present)
