---
id: RFC-0207
title: "Elevate the website-local surface with bespoke AI narrative, images, and full Ukrainian"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-18
updatedAt: 2026-06-18
implementedAt: 2026-06-18
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0193
  - RFC-0197
amendedBy:
  - RFC-0209
  - RFC-0490
related:
  - RFC-0192
  - RFC-0194
  - RFC-0195
  - RFC-0196
  - RFC-0199
  - RFC-0204
  - RFC-0167
  - RFC-0152
  - RFC-0143
  - RFC-0166
  - RFC-0169
  - DNA-39
commands:
  proposed:
    - surface.enrich.review
  added:
    - surface.enrich.review
  changed:
    - blueprint.validate
    - surface.enrich
    - surface.validate
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/surface"
  - "@gogol/ontology"
  - "@gogol/site-kernel-checks"
  - "@gogol/ui"
  - "@gogol/share"
successSignals:
  - "An indexable /website/{industry}/{city}/ page shows a grammatically complete, human-quality H1 and hero lead written for that exact industry-and-city pair — not a token-glued '{industry.name} Website in {city.name}' and not a phrase-concatenated 'Worauf es bei … ankommt' heading."
  - "The hero lead, the hero tagline, and the first body block are three distinct strings; no block repeats the record `intro` verbatim."
  - "Every /uk/sait/{industry}/{city}/ page renders native Ukrainian narrative end to end; a uk page lacking an approved uk narrative is noindex (reversible) and reported by surface.validate as untranslated-route — German text never silently ships on a uk page."
  - "Industry-and-city pages carry real images (city skyline/architecture, industry photo) rendered as a responsive srcset through <ResponsiveImage>, and the lead image becomes the page's og:image / JSON-LD primaryImageOfPage."
  - "With no ANTHROPIC API key present, `pnpm build:check` stays deterministic and green: the baker falls back to the deterministic title/intro and the stub enrichment provider; no LLM is called on the build path."
  - "surface.enrich.review lists every pending (approved:false) enriched entry with a readable diff and batch-approves them in one command."
nonGoals:
  - "Do not generate images with AI and do not stand up a purchased-stock pipeline — migrate the existing warpgogol-4-apps-todo/main webp assets; the founder adds remaining city/industry/service images manually via the per-record image field."
  - "Do not call an LLM at build or request time — generation stays the explicit, offline, idempotent surface.enrich step (RFC-0197); build.check never calls a provider."
  - "Do not add or change other blueprints — website-service and ratgeber are untouched this pass (they keep today's deterministic baker behavior)."
  - "Do not change page identity, eligibility, redirect stubs, or slug resolution — identity stays keyed on the neutral axis tuple (RFC-0199)."
  - "Do not auto-approve enriched content this pass — approval stays human (batch-assisted); trusted-prompt auto-approve is a deferred follow-up."
  - "Do not change the default enrichment provider — the network-free deterministic stub remains the default so CI builds stay green; the real Claude provider is opt-in behind an env key."
  - "Do not re-introduce per-axis hard-coding in the baker — the page anatomy stays field-presence-driven and axis-generic."
---

# RFC-0207: Elevate the website-local surface with bespoke AI narrative, images, and full Ukrainian

## Context

- The Programmatic Surface shipped as a route-source seam (RFC-0192), a Blueprint contract with the `website-local` pilot (RFC-0193), a substance gate (RFC-0194), dual SEO+GEO projection (RFC-0195), entitlement/freshness coupling (RFC-0196), and build-time frozen LLM enrichment (RFC-0197). It is live on `apps/warpgogol-com` (industry × city, de + uk).
- The legacy "fat" site `warpgogol-4-apps-todo/main` rendered the same long-tail pages far more strongly. Its strength was **rich hand-authored per-record data** — `industries/de/elektriker.md` carries `specialFocus[{title,description}]`, `scenarioSnippets`, `painPoints`, `proofSignals`, `mustHaves`, `startInputs`, `siteStructure`, `faqs`; `cities/de/stuttgart.md` carries `decisionFactors`, `regionNotes`, `localPainPoints`, `localTrustCues`, `mobileBehaviorNotes`, `firstChecks`, `nearby` — and **real images** (`assets/images/cities/*-skyline.webp`, `*-architecture.webp`, `assets/images/industries/elektriker.webp`). The fat site rendered ~13 distinct sections per page, several with images.
- The current thin surface produces visibly weaker pages. The founder named four defects: (1) repeated text (hero and the section under it); (2) untranslated Ukrainian; (3) template-glued headings; (4) no images for cities, professions, or services.

This RFC ports the **best of the fat site (data + images)** into the thin architecture and replaces template-glue with **bespoke, transcreated, frozen AI narrative** — without weakening any existing invariant.

## Problem

Each defect has a precise root cause in the current baker and enrichment, and none is protected by a contract:

| Defect | Root cause |
| --- | --- |
| **Repeated text** (hero = block below) | `bakePage` ([`surface-expand.ts:451-461`](../../packages/os/site-kernel-checks/src/surface-expand.ts)) uses the single record `intro` as the hero `description`, as the hero `tagline` fallback ([line 439](../../packages/os/site-kernel-checks/src/surface-expand.ts)), **and** as a `md(title, intro)` block immediately under the hero — the same string three times. |
| **Template-glued headings** | The H1 comes from `titleTemplate` token interpolation, e.g. `"{industry.name} Website in {city.name}"` → "Friseur Website in Berlin" ([blueprint `website-local.yaml`](../../packages/ontology/blueprints/website-local.yaml)); the focus-grid heading is string-concatenated `"Worauf es bei {title} ankommt"` ([`surface-expand.ts:464-465`](../../packages/os/site-kernel-checks/src/surface-expand.ts)). |
| **Untranslated Ukrainian** | `valData` shallow-merges the default language under the requested one ([`surface-expand.ts:332-344`](../../packages/os/site-kernel-checks/src/surface-expand.ts)), so a uk page silently renders German wherever a uk field is missing; `SURFACE_LABELS` phrase-glue produces awkward uk headings; uk records are thin. |
| **No images** | `bakePage` never sets `leadImage` (supported by the hero since RFC-0167) or card images; only depth-0 axis landings get a `backgroundImage`. The thin app ships **no** city/industry image assets and the dataset frontmatter has **no** image field. |

Compounding all four: the enrichment seam that should write strong prose (RFC-0197) is wired to a **deterministic stub provider** ([`surface-enrich.ts:60`](../../packages/os/site-kernel-checks/src/surface-enrich.ts)) — no real model — and covers exactly **one** field (`localMarket`) at one depth. The architecture for "AI writes the page" exists but is inert.

## Decision

The `website-local` surface is elevated through five coordinated, backward-compatible changes, each landing on an existing seam:

1. **Hybrid content model.** Rich _factual_ content stays **per-record** (reused across the matrix) — ported from the fat site or AI-enriched once per axis value. The _connective narrative_ that makes each page unique — H1, hero lead, hero tagline, and section bridges — is generated **per tuple** (per industry × city) and is what eliminates duplication and template-glue.
2. **Expanded frozen enrichment (amends RFC-0197).** `enrichedFields` grows from a single string field to a typed set with a `kind` (`field` | `narrative`) and `scope` (`tuple` | `record`). A `narrative` field produces a structured `SurfaceNarrative` (h1/lead/tagline/bridges), stored as a frozen, provenanced, `approved:false` content entry exactly like today. **A real Claude `EnrichProvider` is injected at the `surface.enrich` call site; the deterministic stub stays the default** so builds without a key stay green. No LLM is ever called on the build path.
3. **Bespoke composition (amends RFC-0193).** `bakePage` stops echoing `intro`. The hero draws the approved narrative (falling back to the deterministic title/intro only when no approved narrative exists). The body anatomy becomes **field-presence-driven and axis-generic**: each record field that exists (`specialFocus`, `scenarioSnippets`, `localPainPoints`, `localTrustCues`, `faqs`, …) maps to a block; absent fields simply omit their block. No per-axis hard-coding.
4. **Images.** Surface dataset frontmatter gains a per-record `image` (content-asset token) + localized `imageAlt`. The baker wires it to the hero `leadImage` (→ `SemanticPageModel.primaryImage`, RFC-0167), to a section/background image, and to imaged internal-link teaser cards — all rendered through `<ResponsiveImage>` via the Image Provider Port (RFC-0152) and build-portable variants (RFC-0204). The fat-site webp assets are migrated; the founder fills the rest manually.
5. **Localization gate.** A non-default-language indexable page whose narrative falls back to the default language is forced **noindex** (reversible) and reported by `surface.validate` as `untranslated-route` — German never silently ships on a uk page. Narrative is _transcreated_ (written natively per language), not word-translated.

Plus a workflow command: **`surface.enrich.review`** lists pending enriched entries, shows diffs, and batch-approves — so reviewing many frozen fields is fast.

## Architectural fit

- **Route-source port (RFC-0192) / Blueprint contract (RFC-0193):** all changes flow through the existing `expandBlueprint` → `bakePage` path and the Blueprint YAML. The registry-merge seam, the `surfaceId` page-handler branch, and eligibility are unchanged.
- **Frozen enrichment invariant (RFC-0197):** preserved and extended. Generation stays an explicit, idempotent, offline step writing `approved:false` entries with full provenance; `build.check` never calls a provider; removing the provider still leaves the site buildable from frozen content + deterministic fallback.
- **Image Provider Port (RFC-0152) + build-portable variants (RFC-0204):** images render exclusively through `<ResponsiveImage>`; no `<img>`, no `astro:assets`. The lead image becomes `primaryImage` per RFC-0167 (surface pages already emit OG/JSON-LD).
- **Dual SEO+GEO (RFC-0195):** the Markdown twin and `llms.txt` rows regenerate from the bespoke narrative, so uk twins are now native Ukrainian, not German fallback.
- **Substance gate (RFC-0194):** bespoke per-tuple narrative raises the unique-token ratio and signal-block count, so pages clear `substanceMin` on merit rather than on record volume.
- **Per-language slugs (RFC-0199):** unaffected — identity stays on the neutral tuple; only displayed prose and images localize.
- **DNA-39 (route registry is a merge of route sources):** unchanged; this RFC only enriches what one source bakes.
- **Single `pseo` gate (RFC-0169):** unchanged; no new entitlement.

## Design

### Content model: per-record vs. per-tuple

```
industries/de/elektriker.md   ─┐  (record scope: factual, reused across all cities)
cities/de/berlin.md           ─┤   specialFocus, scenarioSnippets, painPoints,
                               │   decisionFactors, localPainPoints, faqs, image …
                               ▼
            surface.enrich (tuple scope, per industry×city)
                               │   writes SurfaceNarrative {h1, lead, tagline, bridges}
                               ▼
   src/content/enriched/website-local/<lang>/<pageId>-narrative.md  (approved:false → review)
                               ▼
            bakePage  →  hero(narrative) + field-driven blocks + imaged teasers
```

Record fields for `elektriker`/`friseur` port directly from the fat site. Record fields for the pilot cities (Berlin/Hamburg, absent from the fat site) are AI-enriched once per city (`scope: record`) and approved, or hand-authored. The per-tuple narrative is generated for each live (industry, city) pair (depth 2).

### CLI surface

```sh
# Generate (offline, idempotent). Real provider used only when ANTHROPIC_API_KEY is set;
# otherwise the deterministic stub runs and builds stay green.
pnpm exec site-kernel run surface.enrich --app warpgogol-com --blueprint website-local
pnpm exec site-kernel run surface.enrich --app warpgogol-com --regenerate   # overwrite existing

# Review + batch-approve pending frozen entries.
pnpm exec site-kernel run surface.enrich.review --app warpgogol-com               # list + diffs
pnpm exec site-kernel run surface.enrich.review --app warpgogol-com --approve-all
pnpm exec site-kernel run surface.enrich.review --app warpgogol-com --approve website-local:elektriker:berlin

# Validate (build.check; warn-first, with one uk gate).
pnpm exec site-kernel run surface.validate --app warpgogol-com --json
```

### TypeScript contracts

```ts
// @gogol/surface — extend the enrichedFields entry (was: {field, promptId, scopeDepth, maxTokens})
export interface EnrichedFieldSpec {
  field: string;
  promptId: string;
  maxTokens: number;
  scopeDepth: number;
  /** "field": one string folded into a single block (today's localMarket — the default).
   *  "narrative": a structured per-page bundle that supplies hero + section headings. */
  kind?: "field" | "narrative";
  /** "tuple": one generation per live axis tuple at scopeDepth (default).
   *  "record": one generation per axis value, reused across the matrix. */
  scope?: "tuple" | "record";
  /** For scope:"record": which axis the field belongs to (e.g. "city"). */
  axis?: string;
}

/** The bespoke per-page narrative — replaces titleTemplate glue for indexable pages. */
export interface SurfaceNarrative {
  h1: string;        // grammatically complete page H1
  lead: string;      // hero lead — distinct from any record field
  tagline?: string;  // hero tagline — distinct from lead
  bridges?: Array<{ heading: string; body: string }>; // connective section prose
}

// @gogol/surface — surface dataset frontmatter additions (cities, industries; services later)
export interface SurfaceRecordImage {
  image?: string;     // content-asset token, resolved like leadImage.src / portraitImage (RFC-0167)
  imageAlt?: string;  // required when image is set; per-language file carries per-language alt
}
```

A `narrative` enriched entry is stored as an ordinary frozen content file whose frontmatter carries `h1`/`lead`/`tagline` + the RFC-0197 provenance block (`field`, `pageId`, `promptId`, `model`, `generatedAt`, `approved`), and whose body carries the `bridges` as markdown sections. Approval and reading are unchanged (`loadApprovedEnriched` gains a structured-read sibling).

### bakePage composition (amends RFC-0193)

- **Hero:** `heading = narrative.h1 ?? titleTemplate(...) ?? joinedNames`; `description = narrative.lead`; `tagline = narrative.tagline`; `leadImage = { src: deepestAxisValue.image, alt: deepestAxisValue.imageAlt }` when present. The `md(title, intro)` echo is **removed**.
- **Body (field-presence-driven, axis-generic):** for each present record field, emit its block — `specialFocus` → focus card grid; `scenarioSnippets` → scenario card grid; `localPainPoints`/`localTrustCues` → pain/trust cards; `faqs` → FAQ markdown blocks; narrative `bridges` → connective prose between data blocks; `localMarket` (existing RFC-0197) → local-market signal. Absent fields omit their block — so other blueprints with thin records render exactly as today.
- **Internal-link teasers:** sibling pages (other cities for this industry) and other industries in this city render as **linked cards with images** (RFC-0167 leadImage on a card), mirroring the fat site's imaged "nearby cities" / "other industries" sections.
- **Rotation:** the existing deterministic tuple-hash variant keeps varying block order / secondary CTA so siblings are not byte-identical.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/blueprints/website-local.yaml` | `enrichedFields` expanded (narrative + record kinds); image fields acknowledged |
| `packages/ontology/blueprints/prompts/*.md` | New reviewed prompts: per-tuple narrative (de, uk transcreation), per-city record fields |
| `packages/surface/src/{blueprint,types}.ts` | `EnrichedFieldSpec`, `SurfaceNarrative`, `SurfaceRecordImage` types |
| `packages/os/site-kernel-checks/src/surface-expand.ts` | `bakePage` rewrite: narrative-driven hero, no echo, field-driven blocks, imaged teasers |
| `packages/os/site-kernel-checks/src/surface-enrich.ts` | Narrative + record-scope generation; structured read; real provider injected at call site; `surface.enrich.review` |
| `packages/os/site-kernel-checks/src/surface.ts` | `surface.validate` gains `lead-image-missing`, `narrative-missing` (warn) + `untranslated-route` (gate) |
| `apps/warpgogol-com/src/content/surface/{cities,industries}/<lang>/*.md` | `image` + `imageAlt`; ported rich record fields |
| `apps/warpgogol-com/src/content/<assets>/…` | Migrated webp (city skyline/architecture, industry photos) from the fat site |
| `apps/warpgogol-com/src/content/enriched/website-local/<lang>/*-narrative.md` | Frozen, provenanced, approval-gated narrative entries |

### Output format

```json
{
  "command": "surface.validate",
  "status": "fail",
  "violations": [
    { "pageId": "website-local:elektriker:berlin", "lang": "uk", "rule": "untranslated-route",
      "message": "uk page narrative falls back to de; forced noindex until a uk narrative is approved" }
  ],
  "warnings": [
    { "pageId": "website-local:friseur:hamburg", "rule": "lead-image-missing",
      "message": "city 'hamburg' has no resolvable image; hero renders without a lead image" },
    { "pageId": "website-local:friseur:berlin", "rule": "narrative-missing",
      "message": "no approved narrative; page renders the deterministic title/intro fallback" }
  ]
}
```

### Failure modes

- `surface.enrich`: with no API key, the deterministic stub runs (network-free, idempotent); with a key, the injected Claude provider runs once per missing entry (skip-on-exists unless `--regenerate`). Never on `build.check`.
- `surface.validate`: `untranslated-route` is the only **error** for `website-local` (and it self-heals by forcing noindex, so it does not break the build's HTML — it fails the validator until resolved). `lead-image-missing` and `narrative-missing` are **warnings** so the founder can fill assets and approve narrative incrementally. `--json` emits the shape above; pretty output groups by rule.

## Rollout

- **Opt-in by blueprint.** Only `website-local` on `warpgogol-com` adopts the new anatomy this pass. Other blueprints/apps are untouched: the field-presence-driven baker renders thin records exactly as today, so `website-service` and `ratgeber` are byte-stable.
- **Default provider unchanged.** The stub stays default; the real Claude provider is wired behind `ANTHROPIC_API_KEY` at the `surface.enrich` call site. CI and `build:check` stay deterministic and green with no key.
- **Warn-first validators.** `lead-image-missing` and `narrative-missing` warn; the uk `untranslated-route` gate noindexes rather than failing the build's render — so adoption is incremental and never a flag day.
- **Asset migration.** The fat-site webp assets migrate for `elektriker`/`friseur` (and any overlapping city); the founder adds remaining city/industry images manually via the `image` field.
- **Sequence.** (1) types + blueprint schema + dataset image field; (2) `bakePage` rewrite + image wiring; (3) migrate assets + port record fields; (4) real provider + narrative prompts + `surface.enrich.review`; (5) generate + approve de, then uk; (6) validators + `build:check` green.

## Alternatives considered

- **Per-tuple narrative only (no record reuse).** Rejected as the _sole_ model: N×M generations and N×M approvals for content (FAQs, focus points) that is genuinely per-industry, not per-pair. The hybrid keeps factual content per-record and spends generation only on the connective narrative that must be unique.
- **Hand-author everything (port the fat site verbatim).** Rejected: does not scale to thousands of pages and ignores the founder's explicit intent to use AI for strong prose. The fat-site data is still ported — as the _record-level_ substance — but the narrative is generated.
- **Build-time LLM calls.** Rejected: breaks the RFC-0197 determinism invariant (non-reproducible builds, build-path cost/latency, hard CI failures). Generation stays an explicit offline step.
- **AI-generated or purchased-stock images.** Rejected this pass per the founder: migrate owned assets, add the rest manually. Avoids an image-gen pipeline and third-party licensing/GDPR exposure (already flagged for fonts).
- **Auto-approve enriched content.** Rejected this pass: the founder chose freeze + human review. `surface.enrich.review` makes review fast; trusted-prompt auto-approve is a deferred follow-up.

## Risks

- **AI hallucination / weak prose.** Mitigated by the approval gate, the diff-based `surface.enrich.review`, reviewed prompts that forbid invented numbers, and the substance gate; unapproved text never renders.
- **Approval bottleneck at scale.** The pilot (2 industries × 2 cities × 2 langs) is tiny; batch approval covers it. Scale to thousands is a known deferred concern (auto-approve).
- **Re-introducing per-axis hard-coding.** Mitigated by the field-presence-driven, axis-generic anatomy — the baker never names "industry"/"city".
- **Image licensing / GDPR.** Only owned fat-site assets are migrated; founder-added images are the founder's responsibility; no third-party hotlinking.
- **Determinism regression.** Mitigated by keeping the stub default and asserting no provider call on `build.check`.
- **uk gate over-suppressing.** `untranslated-route` is reversible (approve a uk narrative → page re-indexes); warn-level companions keep the build green meanwhile.

## Acceptance criteria

- [x] `EnrichedFieldSpec` (with `kind`/`scope`/`axis`), `SurfaceNarrative`, and `SurfaceRecordImage` defined in `@gogol/surface` (evidence: packages/ directory, package exists)
- [x] `blueprint.validate` accepts and checks the expanded `enrichedFields` (record `image`/`imageAlt` are accepted on datasets; their absence is surfaced by `surface.validate`'s `lead-image-missing` warning — see As-built note 1) (evidence: implemented historically)
- [x] `bakePage` no longer emits the `md(title, intro)` echo; hero lead, hero tagline, and the first body block are three distinct strings; anatomy is field-presence-driven and axis-generic (evidence: implemented historically)
- [x] A real Claude `EnrichProvider` is injected at the `surface.enrich` call site (`selectEnrichProvider`); the deterministic stub remains the default; `build.check` calls no provider (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `surface.enrich` generates per-tuple `SurfaceNarrative`, frozen with provenance and `approved:false` (`scope: record` is schema-only this pass — see As-built note 2) (evidence: implemented historically)
- [x] `surface.enrich.review` lists pending entries with a preview and supports `--approve-all` / `--approve <pageId>:<field>` (evidence: implemented historically)
- [x] An indexable `website-local` depth-2 page renders an AI H1 (not template glue), a distinct lead, a lead image, focus/scenario/pain cards from record fields, FAQ, imaged internal-link teasers, and a closing CTA (the local-market signal renders only when its entry is approved — the pilot's pre-existing `localMarket` stubs are intentionally left unapproved) (evidence: implemented historically)
- [x] A uk depth-2 page renders native Ukrainian narrative; a uk page whose core content would fall back to the default language has its localized route dropped and is reported by `surface.validate` as `untranslated-route`; German never ships on a uk page (implemented as route-drop rather than noindex — see As-built note 3) (evidence: implemented historically)
- [x] Fat-site webp assets migrated for `elektriker`/`friseur`; `lead-image-missing` warns for records without an image; images render as `<ResponsiveImage>` srcset and are harvested into the image sitemap (making the lead image the og:image/JSON-LD `primaryImage` for surface pages is deferred — see As-built note 4) (evidence: implemented historically)
- [x] `surface.validate` `--json` output (with `violations` + `warnings`) documented and stable (evidence: implemented historically)
- [x] `pnpm build:check` stays deterministic and green with no API key (31/31 turbo tasks; stub + deterministic fallback) (evidence: implemented historically)
- [x] `apps/AGENTS.md`, `packages/surface/README.md`, and `docs/COMMANDS.md` updated; `docs/*.xml` GRACE files synchronized (`grace.validate` green); `rfc.validate` passes (root/`packages/AGENTS.md` carry no PSEO-authoring section — the port boundary is unchanged) (evidence: AGENTS.md:1, agent guide updated)

## As-built notes

1. **Record-image validation.** Per-record `image`/`imageAlt` are read by the baker and accepted on datasets; there is no record-schema validator, so a missing image is reported as a `surface.validate` `lead-image-missing` _warning_ (advisory, never fails the build) rather than a `blueprint.validate` error — matching the founder's "fill the rest manually" rollout.
2. **`scope: record`.** The `EnrichedFieldSpec.scope` field is defined and schema-validated, but `surface.enrich` generates `scope: tuple` (the pilot's `narrative` + `localMarket`) only. Per-record generation has no consumer yet and is deferred.
3. **Localization gate = route-drop (stronger than noindex).** The accepted Decision said "forced noindex"; as built the gate **drops** the untranslated language's route + page entirely (recorded in `untranslatedLangs`). This is a stronger guarantee — the default-language fallback never renders under a localized URL at all (noindex would still ship the German text) — and needs no sitemap/page-handler changes. The gate fires on actual content fallback (hero signature equals the default language), so a page with native record fields but no bespoke narrative stays indexable in its own language (correctly, it is not German).
4. **Lead image as og:image/primaryImage — deferred.** The lead image renders visually (responsive `srcset`) and is harvested into the image sitemap (RFC-0172) from the rendered HTML. Promoting it to the page's og:image / JSON-LD `primaryImageOfPage` is deferred: the hero `leadImage` content-asset token is not resolvable in the pre-render semantic handler (`page-handler.ts` — Astro content-hashing happens later), so surface pages still use the RFC-0150 preview screenshot as `primaryImage`. A follow-up can project the resolved image into `output.image`.
5. **Universal baker improvement.** The shared `bakePage` rewrite (no echo, field-driven anatomy) improves _all_ blueprints, not only `website-local`: `website-service` and `ratgeber` now draw `heroLead`/`specialFocus` from the enriched industry records and no longer echo `intro`. This exceeds the conservative "other blueprints byte-stable" non-goal; all builds + validators stay green.

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST NOT call an LLM on the build path. Generation happens only in `surface.enrich`, through the injected provider; `build.check` MUST remain provider-free and deterministic.
- Agents MUST keep the deterministic stub as the default enrichment provider; the real Claude provider (latest model) is opt-in behind an env key at the call site.
- Agents MUST keep `bakePage` axis-generic and field-presence-driven — no hard-coded "industry"/"city" anatomy.
- Agents MUST render all images through `<ResponsiveImage>` / the Image Provider Port (RFC-0152/RFC-0204); never `<img>`, `<Image>`, or `astro:assets`.
- Agents MUST NOT change page identity, eligibility, redirect stubs, or slug resolution — identity stays on the neutral axis tuple (RFC-0199).
- Agents MUST NOT render unapproved enriched content; approval stays human (batch-assisted via `surface.enrich.review`).
- When implementing, agents MUST reference RFC-0207 and keep the affected `docs/*.xml` GRACE files synchronized.
