---
id: RFC-0071
title: "Extend biome schema, introduce site-family catalog, add deterministic token derivation"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-18
updatedAt: 2026-05-18
implementedAt: 2026-05-18
closedAt:
supersedes: []
supersededBy:
amendedBy:
  - RFC-0201
related:
  - DNA-23
  - RFC-0025
  - RFC-0070
  - RFC-0072
  - RFC-0075
commands:
  proposed:
    - biome.tokens.derive
    - family.contract.validate
    - family.list
  added:
    - biome.tokens.derive
    - family.contract.validate
    - family.list
  changed:
    - biome.contract.validate
    - biome.css.generate
  removed: []
appsImpacted: []
packagesImpacted:
  - ontology
  - tokens
  - os/site-kernel-checks
  - os/site-kernel-codegen
successSignals:
  - The biome YAML schema covers axes, palette, typography, spacing, motion, geometry, and authoring constraints — wide enough that tokens-override.css is never tempting
  - Site-family recipes live under packages/ontology/site-families/<id>/ and declare candidate biomes, candidate constellations, required archetypes, audit thresholds, and a tone-of-voice profile template
  - biome.tokens.derive turns a small axes input (warmth/contrast/density/...) into a deterministic OKLCH palette when the upstream concept JSON does not supply one
  - biome.css.generate emits @layer biome.<id> so multiple biomes coexist without collision
  - family.contract.validate runs as part of PACKAGES_CHECK_PIPELINE and rejects any biome whose family pointer or axes are inconsistent
nonGoals:
  - Per-app tokens-override.css (still forbidden)
  - Multi-biome runtime switching inside one app (one biome per app remains permanent)
  - LLM-driven color picking (axes classification is LLM; numeric palette synthesis is deterministic)
  - Auto-promoting any biome silently — biomes are written directly in their canonical .yaml location, validated by the pipeline, and reviewed by humans in the changelist
---

# RFC-0071: Extend biome schema, introduce site-family catalog, add deterministic token derivation

## Context

The cosmic overlay (RFC-0025) made biomes the single per-brand visual container — one biome per app, `system.md identity.biome`, materialized into `src/styles/biome.generated.css` and applied via `html[data-biome="<id>"]`. The current schema is intentionally narrow (palette + a typeface) and the only biome on disk is `nonprofit-trust.yaml` aimed at the existing charity site.

The next wave of clients arrives with explicit visual DNA: `19-visual-dna.md`, `20-design-strategies.md`, `21-directions.md`, one selected concept's full visual JSON in `24-concepts-concept-N.visual.json`, plus a localized hero image and a tone-of-voice document. Nothing in the existing schema can absorb that level of detail. The right answer is not to widen `tokens-override.css` (forbidden for good reason) but to widen the biome schema and to make biomes composable into named _site families_ so similar future clients reuse recipes instead of inventing biomes from scratch.

## Problem

1. **Biome schema too narrow.** Real brand DNA covers density, motion, type pairing, diagram presence, photo stance, accent geometry, line weights, and authoring constraints. Today there is no field for any of them.
2. **Token derivation is invisible.** When a human picks colors, no audit trail says "this hue traces to the concept JSON's brand palette, this contrast band traces to direction-2." Tokens cannot be reviewed against source.
3. **No site-family abstraction.** The Handwerk trust system, the charity donation funnel, a B2B SaaS landing, and an editorial site are recognizably different families — but the repo cannot express the difference. New onboardings restart from zero.
4. **`biome.css.generate` emits a flat selector block.** Two biomes on the same workspace would clash; the generator should emit `@layer biome.<id>` to keep them additive.
5. **Color picking is fragile.** Where the concept JSON does not supply a palette, the agent has to invent one. Without a deterministic derivation rule, a re-run produces different colors.

## Decision

Three changes ship together:

1. **Extend the biome YAML schema** to a full visual-DNA container: closed-enum axes, palette, typography, spacing, motion, geometry, constraints. A biome lives at `packages/ontology/biomes/<id>.yaml` (no `.draft.yaml` suffix — biomes are written in their final location and reviewed in the changelist).

2. **Introduce a site-family catalog** under `packages/ontology/site-families/<id>/`:
   - `<id>/family.yaml` — the recipe (candidate biomes, candidate constellations, required section archetypes, audit thresholds, conversion goal templates, agent-readiness baseline).
   - `<id>/tone-of-voice.template.yaml` — starter voice profile a client may inherit and override.
   - `<id>/cultural-rules.yaml`, `<id>/linguistic-rules.yaml` — locale + family rules for the LLM audits (RFC-0074).

3. **Add `biome.tokens.derive`** — a deterministic command that turns a small axes input (warmth/contrast/density/typographySharpness/diagramPresence/etc.) into an OKLCH palette and a typography pair when the upstream concept JSON does not provide one. The math is documented; re-running on the same axes yields identical output.

`biome.contract.validate` is rewritten against the extended schema. `biome.css.generate` is extended to emit `@layer biome.<id>`. Both move into `PACKAGES_CHECK_PIPELINE` (RFC-0075). The single existing biome `nonprofit-trust.yaml` is rewritten in the implementation PR to the new schema (no legacy compatibility).

## Architectural fit

- **DNA-23 (cosmic overlay).** One biome per app permanently.
- **RFC-0025.** `system.md identity.biome` continues to be a scalar id.
- **RFC-0070 onboarding.** Phase 02 (scaffold) writes the chosen biome YAML and updates `apps/<id>/src/content/system.md identity.biome`. Phase 02 also creates or links a site family.
- **RFC-0072 archetype catalog.** A family declares which archetypes are required for member sites; the compose phase verifies the site plan honors that requirement.
- **`packages/tokens`.** Studio defaults in `tokens.css` remain the safe baseline. Biome YAMLs continue to override a subset; the new categories introduced by this RFC are added to `TOKEN_NAMES` so `tokens.ds.lint` keeps catching raw values.

## Design

### Extended biome schema

```yaml
# packages/ontology/biomes/<biome-id>.yaml
id: handwerk-material-warm
version: 1.0.0
displayName: "Handwerk · Material · Warm"
family: handwerk-trust-engineering

# Provenance — written during scaffold; required for biomes generated from a client bundle
provenance:
  client: webgogol-handwerk
  selectedConcept: concept-2
  selectedDirection: 2
  sourceFiles:
    - 19-visual-dna.md
    - 21-directions.md
    - 24-concepts-concept-2.visual.json
    - 26-localized-concept.webp
    - 28-tone-of-voice.md

axes:
  warmth: warm                       # cool | neutral | warm
  contrast: medium                   # low | medium | high
  density: comfortable               # dense | comfortable | airy
  typographySharpness: balanced      # soft | balanced | sharp
  diagramPresence: central           # absent | minimal | supportive | central
  photoStance: founder-only          # none | founder-only | documentary | editorial
  motionStance: restrained           # static | restrained | expressive
  textContrast: aa                   # aa | aaa
  cornerRadius: "4px"
  borderWeight: "1px"

palette:                              # CSS color values; OKLCH or hex
  brand:        "#7A4A2A"
  brandHover:   "#693D20"
  brandContrast:"#FFFFFF"
  accent:       "#1E4D3B"
  surface:      "#F5EDE2"
  surfaceMuted: "#EAE0D2"
  ink:          "#1A1A1A"
  inkSoft:      "#3C3633"
  inkMuted:     "#7A7066"
  divider:      "#D6CDBF"
  success:      "#2E7D4F"
  warning:      "#B07A1A"
  danger:       "#A4332B"
  info:         "#385E8C"

typography:
  headingFamily: "'Inter Display', system-ui, sans-serif"
  bodyFamily:    "'Inter', system-ui, sans-serif"
  monoFamily:    "'JetBrains Mono', ui-monospace, monospace"
  scaleRatio: 1.200
  baseSize: "17px"
  lineHeightBody: 1.6
  lineHeightHeading: 1.15
  measureBody: "68ch"
  measureHeading: "26ch"
  numericFeatures: "tnum, lnum"

spacing:
  base: "8px"
  sectionPaddingY: "clamp(48px, 6vw, 96px)"
  containerMaxWidth: "1180px"
  gutter: "clamp(16px, 2vw, 32px)"

motion:
  durationFast: "120ms"
  durationMedium: "200ms"
  durationSlow: "360ms"
  easing: "cubic-bezier(0.2, 0.0, 0.0, 1.0)"
  reduceMotionRespect: true

geometry:
  diagramLineWeight: "1.25px"
  diagramAccentColor: "#1E4D3B"
  decorativeAllowed: false

constraints:
  forbidStockPhotoTags: [hard-hats, generic-handshake, high-five]
  forbidPhrases:
    - "günstig"
    - "von 1 €/Tag"
    - "Ergebnis garantiert"
  enforceTabularNumeralsIn: [price, stats]
```

### Site-family catalog

```yaml
# packages/ontology/site-families/handwerk-trust-engineering/family.yaml
id: handwerk-trust-engineering
displayName: "Handwerk · Trust-engineering"
version: 1.0.0
description: |
  B2B trust system for small German Handwerk businesses. Founder-led,
  written-conditions-first, vendor-lock-in-averse. Conversion is a written
  inquiry; lead-count and ROI promises are forbidden.

detection:                             # used by the synthesize phase to suggest a family
  signals:
    archetypePrimary: b2b-trust-system
    audienceAny: [handwerker, maler-lackierer, kleinunternehmen]
    conversionPrimary: qualified-project-inquiry
    materialMentionsAny: [notausgang, vendor-lock-in, controlled-responsibility]
  threshold: 0.7

recipe:
  candidateBiomes:
    - handwerk-material-warm
    - handwerk-paper-cool
    - handwerk-founder-personal
  candidateConstellations:
    - handwerk-trust-funnel
    - handwerk-segment-funnel
  requiredSectionArchetypes:
    - hero-decision-card
    - trust-strip
    - comparison-cards
    - audience-cards
    - ownership-block
    - notausgang-block
    - controlled-responsibility-block
    - price-card
    - founder-trust-card
    - faq-list
    - final-cta
  conversionGoals:
    primary:    { id: qualified-inquiry, eventName: inquiry-submitted }
    secondary:
      - { id: faq-engagement,  eventName: faq-question-opened }
      - { id: price-page-read, eventName: scroll-depth-80 }
  auditThresholds:
    forbiddenROIPromise: error
    forbiddenLeadCountGuarantee: error
    notausgangVisible: required
    priceVisible: required
    founderIdentified: required
    testimonialPresent: forbidden
  agentReadinessBaseline:
    maxBytesToCta: 4096
    requireStructuredData: [Organization, FAQPage, Service]
```

Siblings under `packages/ontology/site-families/handwerk-trust-engineering/`:

```
family.yaml
tone-of-voice.template.yaml    # starter voice profile per family
cultural-rules.yaml             # consumed by audit.llm.run --kind cultural
linguistic-rules.yaml           # consumed by audit.llm.run --kind linguistic
```

### `biome.tokens.derive` — one command, one purpose

Given a YAML axes input (or directly a biome YAML's `axes:` block), produce a palette block and a typography block deterministically. The output is written to stdout or to the same biome YAML when `--inplace` is passed.

```sh
# Derive from a standalone axes file (the agent typically wrote this during scaffold)
pnpm exec site-kernel run biome.tokens.derive \
  --axes onboarding/.output/02-scaffold/axes.yaml \
  --out packages/ontology/biomes/handwerk-material-warm.yaml
```

Derivation rules (deterministic, no LLM):

| Axis | Effect on palette / typography |
| --- | --- |
| `warmth: warm` | brand hue ∈ [10°, 50°] OKLCH; surface ±5° at low chroma |
| `warmth: cool` | brand hue ∈ [180°, 240°] OKLCH |
| `warmth: neutral` | brand hue ∈ [0°, 360°] OKLCH at very low chroma (≤ 0.05) |
| `contrast: low` | ink vs. surface ΔL\* ≥ 60 (capped at 80) |
| `contrast: medium` | ΔL\* ≥ 72 |
| `contrast: high` | ΔL\* ≥ 85 |
| `density: dense` | `sectionPaddingY = clamp(32px, 4vw, 64px)`; `spacing.base = 6px` |
| `density: comfortable` | `sectionPaddingY = clamp(48px, 6vw, 96px)`; `spacing.base = 8px` |
| `density: airy` | `sectionPaddingY = clamp(64px, 8vw, 128px)`; `spacing.base = 10px` |
| `typographySharpness: sharp` | headings fall back to a geometric pair (Inter Display, Roobert, IBM Plex Sans) |
| `typographySharpness: soft` | headings fall back to a humanist pair (Source Serif, Georgia, IBM Plex Serif) |
| `diagramPresence: central` | `geometry.diagramLineWeight = 1.25px`; biome flag `diagramsAllowed = true` |
| `diagramPresence: absent` | `geometry.diagramLineWeight` omitted; `diagramsAllowed = false` |
| `textContrast: aaa` | derivation refuses palette pairs whose APCA fails AAA at the chosen sizes |

When the concept JSON supplies palette entries, they are imported verbatim and the derivation only fills missing slots. Every derived value is annotated in a comment so the human reviewer can trace it:

```yaml
palette:
  brand: "#7A4A2A"     # from 24-concepts-concept-2.visual.json#palette.brand
  surface: "#F5EDE2"   # derived: axes.warmth=warm + axes.contrast=medium
```

### `biome.css.generate` — one command, one purpose

Already exists. The change: emit `@layer biome.<id> { ... }` instead of a flat selector block.

```css
@layer biome.handwerk-material-warm {
  html[data-biome="handwerk-material-warm"] {
    --ds-color-brand: #7A4A2A;
    --ds-typography-heading-family: "Inter Display", system-ui, sans-serif;
    /* ... */
  }
}
```

Token names map deterministically from the biome YAML keys (e.g. `palette.brand` → `--ds-color-brand`; `typography.headingFamily` → `--ds-typography-heading-family`).

### `biome.contract.validate` — one command, one purpose

Validates every `packages/ontology/biomes/*.yaml` against the extended Zod schema. Cross-checks:

- `family` resolves to a real `packages/ontology/site-families/<id>/family.yaml`.
- `provenance.sourceFiles` are all numbered names that exist in the upstream pipeline contract (loose check — only that the names look like upstream artifacts).
- Palette passes APCA contrast at the level declared by `axes.textContrast`.
- Every key in `palette`, `typography`, `spacing`, `motion`, `geometry` maps to a known `TOKEN_NAMES` entry in `@gogol/tokens`.

### `family.contract.validate` — one command, one purpose

Validates every `packages/ontology/site-families/<id>/family.yaml`:

- `id` matches the folder name.
- Every `recipe.candidateBiomes` entry resolves to a real biome YAML, and that biome's `family` field points back at this family.
- Every `recipe.candidateConstellations` resolves to a real constellation YAML.
- Every `recipe.requiredSectionArchetypes` resolves to a real archetype YAML (RFC-0072).
- `auditThresholds` keys are a subset of the closed audit-rule enum.
- `agentReadinessBaseline.requireStructuredData` entries are valid schema.org types.

### `family.list` — utility

```sh
pnpm exec site-kernel run family.list --json
```

Prints all site families with their detection signals. Used by the agent in the synthesize phase to pick a family suggestion.

### TypeScript contracts

```ts
// packages/ontology/src/biome.ts
export const BiomeContract = z.object({
  id: z.string(),
  version: z.string(),
  displayName: z.string(),
  family: z.string(),
  provenance: z.object({ /* ... */ }).optional(),
  axes: BiomeAxes,
  palette: z.record(z.string(), z.string()),
  typography: z.record(z.string(), z.union([z.string(), z.number()])),
  spacing: z.record(z.string(), z.string()),
  motion: z.record(z.string(), z.union([z.string(), z.boolean()])),
  geometry: z.record(z.string(), z.union([z.string(), z.boolean()])),
  constraints: BiomeConstraints,
}).strict();

// packages/ontology/src/site-family.ts
export const SiteFamilyContract = z.object({
  id: z.string(),
  displayName: z.string(),
  version: z.string(),
  description: z.string(),
  detection: SiteFamilyDetection,
  recipe: SiteFamilyRecipe,
}).strict();
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/biomes/<id>.yaml` | Final biome location. No `.draft.yaml`. |
| `packages/ontology/site-families/<id>/family.yaml` | Family recipe. |
| `packages/ontology/site-families/<id>/tone-of-voice.template.yaml` | Voice template. |
| `packages/ontology/site-families/<id>/cultural-rules.yaml` | LLM cultural-audit rules. |
| `packages/ontology/site-families/<id>/linguistic-rules.yaml` | LLM linguistic-audit rules. |
| `packages/tokens/src/biomes/<id>.css` | Generated by `biome.css.generate`. |
| `apps/<id>/src/styles/biome.generated.css` | Per-app re-export of the workspace biome CSS. |
| `onboarding/.output/02-scaffold/visual-plan.md` | Human-readable axis decisions + family choice rationale (written by the agent during scaffold). |
| `onboarding/.output/02-scaffold/axes.yaml` | Optional machine-readable axes file the agent passes to `biome.tokens.derive`. |

### Failure modes

- Palette in concept JSON fails contrast at the chosen `textContrast` band → derivation refuses and emits a diagnostic instead of writing the YAML.
- A biome's `family` points to a family that does not list this biome among `candidateBiomes` → `biome.contract.validate` fails.
- `biome.tokens.derive` called with axes that are not in the closed enum → fail.
- A new biome whose `provenance.client` matches an `apps/<id>/` whose `system.md identity.biome` is something else → warning (the human likely forgot to update one).
- Two biomes with the same id → fail.

## Rollout

1. Add the extended schema + `BiomeContract`, `SiteFamilyContract` in `packages/ontology`.
2. Rewrite `packages/ontology/biomes/nonprofit-trust.yaml` to the new schema with axes and constraints filled. No legacy compatibility.
3. Add `packages/ontology/site-families/charity-donation-trust/` and `packages/ontology/site-families/handwerk-trust-engineering/` with at least `family.yaml` + `tone-of-voice.template.yaml`.
4. Implement `biome.tokens.derive`, `family.contract.validate`, `family.list`.
5. Rewrite `biome.contract.validate` against the extended schema.
6. Rewrite `biome.css.generate` to emit `@layer biome.<id>`.
7. Register `biome.contract.validate`, `family.contract.validate` in `PACKAGES_CHECK_PIPELINE`.

## Alternatives considered

- **Keep schema narrow, allow `tokens-override.css` again.** Rejected — overrides fragment the design system and prevent biome reuse.
- **Derive palette via LLM.** Rejected — LLM is fine for axis classification but not for numeric values. OKLCH math is reproducible; LLM-picked colors are not.
- **No site families, just biomes.** Rejected — the family layer is what makes the next Handwerk client cheaper than the first.

## Risks

- **Biome catalog bloat.** Without `.draft.yaml` to slow people down, anyone can add a biome and pollute the catalog. Mitigated by `family.contract.validate` requiring every biome to belong to a family, and by `section.similarity.report` (RFC-0072) catching near-duplicate visual identities.
- **`@layer` browser support.** Evergreen browsers ship it (Chrome 99+, Firefox 97+, Safari 15.4+). No fallback needed.
- **OKLCH compatibility.** Modern; same browser cohort. The generator emits OKLCH and a hex fallback when targeting older sets, controlled by a `tokens.fallbackHex: true` flag in `@gogol/tokens`.

## Acceptance criteria

- [x] `BiomeContract`, `SiteFamilyContract` Zod schemas defined and exported from `@gogol/ontology`. (evidence: packages/ directory, package exists)
- [x] `biome.tokens.derive`, `family.contract.validate`, `family.list` registered workspace-scoped. (evidence: implemented historically)
- [x] `biome.contract.validate` validates the extended schema; `biome.css.generate` emits `@layer`. (evidence: implemented historically)
- [x] `nonprofit-trust.yaml` rewritten to the new schema. (evidence: implemented historically)
- [x] Two site families committed: `charity-donation-trust` (existing baseline) and `handwerk-trust-engineering` (the active onboarding). (evidence: implemented historically)
- [x] `biome.contract.validate` and `family.contract.validate` listed in `PACKAGES_CHECK_PIPELINE` (RFC-0075). (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY write biome YAMLs directly to `packages/ontology/biomes/<id>.yaml` during the scaffold phase. There is no draft staging area; the human reviews the diff in Windsurf.
- Agents MUST classify axes (warmth/contrast/density/...) by reading the materials, not by guessing or copying from a previous client.
- Agents MUST run `biome.tokens.derive` (or import palette from concept JSON) instead of typing hex values.
- Agents MUST write a `provenance:` block on every biome generated from a client bundle.
- Agents MUST add or update the `apps/<id>/src/content/system.md identity.biome` pointer in the same phase that creates the biome.
- Agents MUST NOT re-introduce `tokens-override.css`. If a token is missing from the schema, open a successor RFC.
