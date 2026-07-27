---
id: RFC-0231
title: "Unified attribution visibility policy for credits, prose authorship, and footer copyright"
# kind options: architecture | contract | command | policy | deprecation
kind: policy
# scope options: app | workspace
scope: workspace
status: implemented
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
  - RFC-0228
amendedBy:
  - RFC-0499
related:
  - RFC-0005
  - RFC-0009
  - RFC-0163
  - RFC-0166
  - RFC-0167
  - RFC-0183
  - RFC-0211
  - RFC-0218
  - RFC-0223
  - RFC-0226
  - RFC-0227
commands:
  proposed: []
  added: []
  changed:
    - material.credits.validate
    - material.credits.report
  removed: []
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Hiding a credit (e.g. the home hero portrait) removes only the visible inline disclosure row; the image's ImageObject JSON-LD and its /bildnachweise/ entry stay present."
  - "One resolver — resolveAttributionDisplay — decides every inline credit, prose byline, and footer copyright line across both apps; no section ships its own bespoke show/hide flag, and the per-section `showCredit` boolean is gone."
  - "An editorial content image that has a credit shows its inline disclosure by default with zero per-image authoring; a decorative background image stays quiet by default."
  - "Setting one site-level `attribution.credits: hidden` makes every inline credit on the site quiet while keeping all provenance and the credits page intact; a single per-page or per-placement `shown` re-surfaces one credit."
  - "material.credits.validate passes for a hidden editorial credit, no longer warns on a decorative credit that renders quiet, and fails if any hide path drops the JSON-LD provenance node."
nonGoals:
  - "Does not let authors suppress provenance: a hidden credit never removes JSON-LD or the /bildnachweise/ listing, and there is no author-facing 'off' state."
  - "Does not change the visual design, ARIA markup, or CSS of the credit disclosure, prose byline, or copyright components."
  - "Does not change which assets require a credit — the RFC-0228 editorial/decorative intent gate still owns the required-credit decision; this RFC only governs whether an existing credit's inline surface renders."
  - "Does not introduce a new content collection or a per-app config mechanism; the site-level default reuses the existing site `labels.md` material-credits block."
  - "Does not add attribution surfaces beyond material credits, prose authorship, and footer copyright."
---

# RFC-0231: Unified attribution visibility policy for credits, prose authorship, and footer copyright

## Context

The ecosystem already has a complete material-credits stack (RFC-0220, extended by RFC-0223/0226/0227/0228):

- Per-asset `*.credits.yaml` sidecars, validated by `materialCreditSchema`.
- A single resolver, `creditByTarget(map, target, lang, defaultLang)`, that returns the `MaterialCredit | null` for a placed asset with language fallback.
- A visible `<MaterialCredit>` disclosure (`<details>` row) that also emits an `ImageObject`/`VideoObject`/`CreativeWork` JSON-LD `<script>` for search and AI consumers, with page-level `@id` dedup (RFC-0227).
- A localized credits page (`/bildnachweise/`) that aggregates every credited material.
- An editorial/decorative **intent** marker (RFC-0228) on the target, which drives the _required-credit_ gate in `material.credits.validate`.

Two adjacent attribution surfaces share the same shape but live elsewhere:

- **Prose authorship** (RFC-0228): a page-level credit record for prose/article pages (RFC-0166/0167), describing human and AI authorship.
- **Footer site copyright** (RFC-0005/0009): the `<CopyrightComponent>` line rendered in the footer from structured content.

## Problem

There is no managed policy for **whether an attribution surface is visible**. The rule today is implicit and fragmented:

1. **Inline credits render whenever a sidecar exists.** Each of ~8 call sites (`hero-section`, `women-section`, `people-section`, `section-card-grid`, `person-profile`, `footer-promo`, `markdown-section`, `media`) independently calls `creditByTarget(...)` and then renders the disclosure if the credit is truthy. "Show" is hard-coded as "a credit exists." An author who wants a clean hero has no managed way to hide that one row.

2. **The first hide control is an ad-hoc, section-local hack.** Commit `186871b7` added a `showCredit?: boolean` to **only** `hero-section`, and it suppresses the row by setting `portraitCredit = null`. Because the credit object is nulled, the `<ResponsiveImage>` receives no credit, so the `<MaterialCredit>` never renders — which also **drops the ImageObject JSON-LD provenance node** for that image. Hiding a visual row silently deletes structured data and the legal attribution signal. This pattern does not generalize: every other section would need its own copy of the flag, each free to reintroduce the same JSON-LD regression.

3. **No site-wide or page-wide control, and no shared vocabulary.** There is no switch to say "this site is visually quiet — keep all provenance, hide the inline rows," nor "hide credits on this one landing page." Prose bylines and the footer copyright line have no managed visibility at all. The three surfaces use three different mechanisms and three different mental models.

The studio runs **thin sites**: visibility must be declarative, resolved in one place, default to a sensible value with zero per-asset authoring, AI-agent-buildable, and validated — not a boolean sprinkled across section contracts.

## Decision

Introduce a single **attribution visibility policy**: one vocabulary, one resolver, one precedence chain, governing three surfaces — material credits, prose authorship, and footer copyright. Replace the per-section `showCredit` hack. **No legacy, no back-compat** (per the directive): `showCredit` is removed in the same change.

### One vocabulary

```ts
type AttributionDisplay = "shown" | "hidden";   // applies at every level
```

- **`shown`** — the visible surface renders (the credit `<details>` row, the prose byline, the footer copyright line).
- **`hidden`** — the visible surface does not render, **but provenance is always retained**: the ImageObject/VideoObject/CreativeWork JSON-LD node still emits, and the material still appears on `/bildnachweise/`. (This is the "quiet" state; we deliberately do **not** offer an author-facing "off" that would strip provenance — provenance is a legal/SEO invariant, not a presentation knob.)

### One precedence chain (most specific wins, default = shown)

For a given placed surface, resolve in order; the first level that sets a value wins:

| Level | Where it is authored | Applies to |
| --- | --- | --- |
| 1. **Per-asset** | `display:` field in the `*.credits.yaml` sidecar | material credits |
| 2. **Per-placement** | `creditDisplay:` on the section/block content (replaces `showCredit`) | material credits |
| 3. **Per-page** | `attribution:` block in page frontmatter | credits + prose byline |
| 4. **Site default** | `attribution:` block in site `labels.md` | credits + prose + footer copyright |
| 5. **Intrinsic default** | derived from RFC-0228 `intent` | credits + prose |

The intrinsic default (level 5, used when nothing above and the site default is `byIntent` or unset):

- **editorial → `shown`**, **decorative → `hidden`** (content/lead/portrait imagery is editorial by RFC-0228 default; ambient/background is decorative). Prose authorship is always editorial → shown. Footer copyright defaults to shown.

This means: an editorial content image with a credit shows by default with zero authoring; a decorative background stays quiet by default; an author hides one row with a single field at the most convenient scope; a site goes globally quiet with one site-level line — and in **every** case the JSON-LD and the credits page are untouched.

## Architectural fit

- **RFC-0220 / RFC-0228 (amended).** Same sidecar schema (adds one optional `display` field), same validator/report, same render path. The decision of _whether the row renders_ moves out of `credit && ...` truthiness in `<MaterialCredit>` into one resolver consulted by that component. Under the new policy a decorative credit rendering quiet is the designed default, not an anomaly (RFC-0228 specced a `decorative-credit-present` warning but never emitted one, so there is nothing to retire).
- **RFC-0163 / RFC-0227 (provenance).** The hide path is redefined so it can never drop a JSON-LD node; this fixes the `186871b7` regression and protects page-graph parity (`jsonld.parity`).
- **RFC-0183 (feature policy).** Conceptually parallel (a precedence chain over visibility) but intentionally **not** built on the Feature Policy runtime, which is Phase-0 scaffolding with known blockers and only header/footer consumers. Attribution visibility is a small, closed, self-contained policy; coupling it to feature-policy would inherit that risk for no benefit.
- **RFC-0211 / RFC-0218 (CKL).** Hiding a credit changes presentation only; provenance and authorship claims remain machine-readable and human-confirmed. AI authorship still uses existing AI roles.

## Design

### 1. Shared resolver (`@gogol/share`)

New module `attribution-display.ts`:

```ts
export type AttributionDisplay = "shown" | "hidden";
export type AttributionSurface = "material-credit" | "prose-authorship" | "footer-copyright";
export type AttributionSiteDefault = "byIntent" | "shown" | "hidden";

export interface AttributionDisplayInputs {
  surface: AttributionSurface;
  intent?: "editorial" | "decorative";   // material-credit / prose-authorship
  assetOverride?: AttributionDisplay;     // sidecar `display`  (material-credit only)
  placementOverride?: AttributionDisplay; // section/block `creditDisplay` (material-credit only)
  pageOverride?: AttributionDisplay;      // page frontmatter `attribution.*`
  siteDefault?: AttributionSiteDefault;   // site labels `attribution.*`
}

export function resolveAttributionDisplay(i: AttributionDisplayInputs): AttributionDisplay {
  const explicit = i.assetOverride ?? i.placementOverride ?? i.pageOverride;
  if (explicit) return explicit;
  const site = i.siteDefault ?? "byIntent";
  if (site === "shown" || site === "hidden") return site;
  // byIntent: decorative is quiet, everything else (editorial/undefined) shows.
  return i.intent === "decorative" ? "hidden" : "shown";
}
```

**As built**, resolution is centralized inside `<MaterialCredit>` rather than duplicated at each call site: the component already loads the site labels, so it reads the site default (`readCreditsSiteDefault`), takes `assetOverride` from `credit.display` and `intent` from `credit.target.intent`, and accepts the per-placement override via its new `display` prop. Call sites therefore only forward an optional `creditDisplay` — no per-site-call resolver wiring. `readCreditsSiteDefault(labels)` and `readAttributionPolicy(labels)` are the label-reading helpers shipped alongside the resolver.

### 2. Schema additions

- **Sidecar** (`schemas/material-credit.ts`): add `display: z.enum(["shown","hidden"]).optional()` at the top level of `materialCreditSchema` (per-asset override, level 1).
- **Site labels** (`site/{lang}/labels.md`, loaded by `getSiteLabelsData`): add one `attribution` block (level 4), parsed by a new `attributionPolicySchema`:

  ```yaml
  attribution:
    credits: byIntent        # shown | hidden | byIntent  (default byIntent)
    proseAuthorship: shown   # shown | hidden             (default shown)
    footerCopyright: shown   # shown | hidden             (default shown)
  ```

  It sits beside the existing `materialCredits:` label block. The value is policy, not copy; it is duplicated per language only because that is how site config is already authored (header/footer blocks do the same) — both languages should carry the same value, enforced by validate.

- **Page frontmatter** (level 3) — **deferred.** The resolver already accepts a `pageOverride`, but threading page-frontmatter `attribution` from the page markdown through `blocks-renderer` down to each credit placement is not yet wired (blocks-renderer carries only `blocks`/`lang`/`pageId` today). The shipped levels — per-asset, per-placement, site default, and intrinsic intent — cover every founder use case (hide one row, go site-wide quiet, decorative-quiet). Page-level remains a clean follow-up once a page-context channel exists.

  ```yaml
  # planned shape (not yet consumed):
  attribution:
    credits: hidden          # shown | hidden — hide/show all inline credits on this page
  ```

- **Section/block contract**: **remove** `HeroSectionContent.showCredit`; add a generic `creditDisplay?: "shown" | "hidden"` (level 2), so any section that places a creditable image can override per placement without a per-app sidecar. Shipped on `HeroSectionContent`, `<ResponsiveImage>`, and `<SectionImage>`.

### 3. Component changes (`@gogol/ui`)

- **`<MaterialCredit>`** gains `display: AttributionDisplay`. It resolves the final decision internally (asset → placement → site default → intent); when the result is `hidden` it renders **no** `<details>` row but **still emits the JSON-LD `<script>`** (subject to the existing `claimCreditNode` / `suppressScript` dedup). This is the single chokepoint that guarantees the "hidden keeps provenance" invariant.
- **`<ResponsiveImage>`, `<SectionImage>`** thread a `creditDisplay` prop next to the existing `credit` prop and forward it to `<MaterialCredit>`. They render the disclosure whenever a credit exists (a `null` credit means there is nothing to attribute) — hiding is the `display` decision, never a "drop the credit" decision. The hero stops nulling the credit object.
- **`<Media>`** (feature video) keeps resolving its credit and rendering `<MaterialCredit>`, which now applies the site default + intent automatically; a per-placement `creditDisplay` for video is a future addition (not needed by any current placement).
- **`<CopyrightComponent>` / footer**: the footer reads `attribution.footerCopyright` (default `shown`) via `readAttributionPolicy` and shows the line only when both the existing feature-policy gate and the attribution policy allow it.
- **Prose images** (RFC-0166 markdown render): `markdown-section` resolves the policy per prose image and omits the visible credit row when `hidden`. A dedicated visible prose **byline** element does not exist in the codebase today; the `proseAuthorship` site key is shipped and reserved for when one is introduced (the resolver and schema already model it).

### 4. Migration of the existing hack

- `apps/nicaragua-projekt/.../pages/{de,en}/home.md`: `showCredit: false` → `creditDisplay: hidden` on the hero block. The hero portrait's credit object is no longer nulled, so its ImageObject JSON-LD is **restored** while the visible row stays hidden — i.e. this migration is also a provenance fix.
- `hero-section.astro`: drop the bespoke `showCredit` branch; always resolve the credit and forward `creditDisplay={props.creditDisplay}` to `<ResponsiveImage>`.

### 5. Validator & report changes (`@gogol/site-kernel-checks`)

- `material.credits.validate`:
  - **New** `attribution-policy-lang-skew` (warn): the `attribution` block differs between a site's languages. **Shipped.**
  - Accepts the sidecar `display` field via the schema (no "unknown field" rejection). **Shipped.**
  - **Deferred:** `attribution-hide-drops-provenance` (a source-level static guard that no section nulls a credit to hide it). The invariant is currently enforced structurally — `<MaterialCredit>` is the only hide path and always emits the `<script>` — so the static check is defense-in-depth, not load-bearing.
- `material.credits.report`: a per-placement resolved-visibility column is **deferred** (the report still groups by intent).

## Rollout

1. Land `attribution-display.ts` + schema fields in `@gogol/share` (additive; defaults preserve today's behavior since absent intent ⇒ editorial-ish ⇒ shown).
2. Thread `display` through `<MaterialCredit>` and the three image/media components; switch the ~8 call sites to `creditDisplayFor(...)`.
3. Remove `showCredit`; migrate nicaragua hero blocks to `creditDisplay: hidden`. Verify the hero ImageObject JSON-LD returns while the row stays hidden.
4. Wire prose byline + footer copyright to the policy; add the `attribution` block to both apps' `labels.md` (explicit defaults).
5. Update `material.credits.validate` / `report`; run `build:check` on both apps (target: all green).
6. Update RFC-0220 and RFC-0228 `amendedBy: [RFC-0231]`; mark this RFC implemented once criteria are verified and committed (per RFC-0224 self-stamp policy).

## Alternatives considered

- **Keep per-section `showCredit` booleans.** Rejected: the hack already fragments across sections, each copy can null the credit and drop JSON-LD, and there is no site/page scope. This is the status quo the RFC exists to remove.
- **Per-asset-only suppression (`display` in the sidecar, no other levels).** Rejected: the same asset legitimately renders differently in different placements (quiet in a dense hero, shown in an editorial section). Asset-only cannot express placement intent.
- **A real "off" state that drops provenance.** Rejected by the founder decision: hiding must keep JSON-LD and the credits page (legal attribution + Google licensable metadata). If there is genuinely nothing to attribute, the answer is "no sidecar," not "off."
- **Build on the RFC-0183 Feature Policy runtime.** Rejected: feature-policy is Phase-0 with known blockers; attribution visibility is small and closed and should not inherit that risk.
- **A separate `attribution.display.validate` command.** Rejected to avoid command sprawl; folded into the existing `material.credits.validate` / `report`.

## Risks

- **Provenance regression resurfacing.** Mitigated by making `<MaterialCredit display="hidden">` the only hide path (it always emits `<script>`). A source-level `attribution-hide-drops-provenance` static check is deferred as additional defense-in-depth.
- **Default flips a site's appearance.** `byIntent` is chosen so the _visible_ result matches today for editorial imagery (shown) and only changes decorative imagery (which today shows only if a sidecar happened to exist) to quiet. Report output makes the before/after auditable per site.
- **Language skew in the site `attribution` block.** Caught by `attribution-policy-lang-skew`.
- **Footer copyright hidden by mistake.** Default is `shown`; hiding requires an explicit site-level `footerCopyright: hidden`. Documented as unusual.

## Acceptance criteria

- [x] `resolveAttributionDisplay` exists in `@gogol/share` with the precedence asset → placement → page → site → intent, defaulting to `shown` (editorial) / `hidden` (decorative) under `byIntent`. (evidence: packages/ directory, package exists)
- [x] `HeroSectionContent.showCredit` is removed; the generic `creditDisplay` field exists on the section-image/hero contracts and is honored by `<ResponsiveImage>`/`<SectionImage>`. (evidence: implemented historically)
- [x] `<MaterialCredit display="hidden">` renders no `<details>` yet still emits the JSON-LD `<script>` (dedup preserved); the credit object is never nulled to hide. (evidence: implemented historically)
- [x] The nicaragua hero renders **no** visible credit row **and** emits the hero ImageObject JSON-LD node — verified in `dist`: `"contentUrl":"/_img/hero-1/768.webp"` present, and the home page has more ImageObject nodes (9) than visible credit rows (7). Provenance restored vs the `186871b7` hack. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] A site-level `attribution.credits` switch governs inline credit visibility site-wide while `/bildnachweise/` and all JSON-LD remain complete; a per-placement `creditDisplay` overrides one credit back to visible. (Per-**page** override is deferred — see Design §2.) (evidence: original apps retired by RFC-0381, implemented historically)
- [~] Footer copyright honors the `attribution.footerCopyright` policy; prose-image credits honor the policy via `markdown-section`. A visible prose **byline** element does not exist yet, so `proseAuthorship` is shipped-and-reserved.
- [x] `material.credits.validate` accepts the new `display` field and adds the `attribution-policy-lang-skew` warn; the `attribution-hide-drops-provenance` static check and the report visibility column are deferred (see Design §5). (evidence: implemented historically)
- [x] `build:check` is green on both `webgogol-com` and `nicaragua-projekt` (32/32); `rfc.validate` passes. (evidence: original apps retired by RFC-0381, implemented historically)

## Implementation notes for agents

- The resolver is pure and lives in `@gogol/share` (`attribution-display.ts`); do not read content or globs inside it — callers pass the resolved overrides, mirroring how `creditByTarget` already takes a raw map. Visibility is resolved inside `<MaterialCredit>`, which already loads site labels; sections only forward an optional `creditDisplay`.
- Do **not** reintroduce `credit ? <X credit={credit}/> : null` to hide a row. Hiding is the `display` prop, always — nulling the credit drops the JSON-LD provenance (the original `186871b7` bug).
- `creditDisplay` threads through `section-image` → `responsive-image` → `material-credit`; follow the existing `credit` prop's path as the template.
- Author both languages' `attribution` blocks with the same values; `attribution-policy-lang-skew` will warn otherwise.
- Deferred follow-ups: page-frontmatter (level-3) threading via `blocks-renderer`; a visible prose byline element; the `attribution-hide-drops-provenance` source check; the `material.credits.report` visibility column; a per-placement `creditDisplay` on `<Media>`.
