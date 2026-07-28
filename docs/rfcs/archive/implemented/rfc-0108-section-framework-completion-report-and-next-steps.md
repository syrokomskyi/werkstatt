---
id: RFC-0108
title: "Section framework completion report and proposals for the next architectural wave"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-27
updatedAt: 2026-06-04
implementedAt: 2026-05-27
closedAt:
supersedes:
supersededBy:
amendedBy:
  - RFC-0201
  - RFC-0205
related:
  - RFC-0035
  - RFC-0040
  - RFC-0041
  - RFC-0042
  - RFC-0072
  - RFC-0075
  - RFC-0076
  - RFC-0095
  - RFC-0098
  - RFC-0099
  - RFC-0100
  - RFC-0101
  - RFC-0102
  - RFC-0103
  - RFC-0104
  - RFC-0105
  - RFC-0106
  - RFC-0107
commands:
  proposed:
    - layout.orchestrator.lint
    - section.background.contract.validate
    - section.body.contract.validate
    - section.cta.contract.validate
    - section.header.contract.validate
    - section.image.contract.validate
    - section.motion.contract.validate
    - section.shell.contract.validate
    - site.background.contract.validate
    - tokens.colors.section-shell.lint
  added:
    - layout.orchestrator.lint
    - section.background.contract.validate
    - section.body.contract.validate
    - section.cta.contract.validate
    - section.header.contract.validate
    - section.image.contract.validate
    - section.motion.contract.validate
    - section.shell.contract.validate
    - site.background.contract.validate
    - tokens.colors.section-shell.lint
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel-checks
  - os/site-kernel-codegen
successSignals:
  - "All validators proposed in RFC-0101..RFC-0106 are implemented and wired into packages-check.run."
  - "section.scaffold templates regenerate every artifact in the new contract by default."
  - "kernel.wire computes layout-orchestrator.ts opt-in flags from the composed pages automatically."
  - "All section archetypes carry recommendedItemCount in block-style YAML."
nonGoals:
  - "Do not reintroduce flat visual-modifier props."
  - "Do not collapse the seven body kinds into a single union dispatched at runtime."
---

# RFC-0108: Section framework completion report and proposals for the next architectural wave

## Context

RFC-0101 through RFC-0107 formed a coordinated merge train to deliver the canonical section framework: `<SectionShell>`, `<SectionHeader>`, seven body kinds, `<SectionCta/Group>`, `<SectionImage>`, `<GlassPanel>`, and `<SiteBackground>`. This RFC is the closeout record for that wave and the source of follow-up proposals.

## Decision

The section framework delivered by RFC-0101..RFC-0107 is the normative architecture for all shared sections in `packages/ui`. All 24 section directories are migrated. Legacy flat visual-modifier props are removed. Follow-up RFCs (RFC-0109..RFC-0121) close the remaining open items catalogued here.

## Status: completion report for RFC-0101..RFC-0107

This RFC summarises what was delivered as part of the merge train that implemented RFC-0101 through RFC-0107, and proposes the remaining validator, scaffold, and ecosystem work needed to make the migration audit-tight and self-onboarding.

## Delivered inventory

### Canonical schemas in @gogol/share

```
packages/share/src/schemas/
  glass.ts                 RFC-0101 GlassConfig
  horizontal-align.ts      RFC-0101 HorizontalAlign primitive
  icon-color.ts            RFC-0103 IconColor
  section-background.ts    RFC-0101 SectionBackground (5 kinds)
  section-body.ts          RFC-0103 SectionBodyContent (7 kinds + composite)
  section-cards.ts         RFC-0103 StandardCard
  section-cta.ts           RFC-0104 CtaConfig + CtaGroupConfig
  section-header.ts        RFC-0102 SectionHeader + HeadingContent
  section-image.ts         RFC-0104 SectionImageProps + ImageFade
  section-motion.ts        RFC-0106 SectionMotionConfig
  section-shell.ts         RFC-0101 SectionShellProps
  section-stats.ts         RFC-0103 StatItem
  site-background.ts       RFC-0105 SiteBackgroundConfig
  standard-list-item.ts    RFC-0100 mirror (avoids cyclic dep on @gogol/ui)
```

### Canonical components in @gogol/ui

```
packages/ui/src/components/
  section-shell/              RFC-0101 wrapper (background/glass/density/tone/motion)
  section-header/             RFC-0102 tone-segmented header
  section-body/
    list/                     RFC-0103 SectionList
    split-list/               RFC-0103 SectionSplitList
    stats/                    RFC-0103 SectionStats (RFC-0040 GSAP bridge)
    cards/                    RFC-0103 SectionCardGrid
    paragraphs/               RFC-0103 SectionParagraphs
    comparison/               RFC-0103 SectionComparison
    rich/                     RFC-0103 SectionRich (RFC-0041 GSAP inline-number bridge)
  section-cta/                RFC-0104 single CTA
  section-cta-group/          RFC-0104 CTA group
  section-image/              RFC-0104 image primitive with fade masks
  glass-panel/                RFC-0101 inline glass surface
  site-background/            RFC-0105 viewport background as shell layer
```

### GSAP motion primitives in @gogol/share/scripts

```
packages/share/src/scripts/
  gsap-reveal.ts        RFC-0106 fade / fade-up / fade-up-stagger
  gsap-parallax.ts      RFC-0106 [data-parallax-speed]
  gsap-stagger.ts       RFC-0106 [data-motion-stagger]
  orchestrator.ts       extended with reveal / parallax / stagger opt-ins
```

### Shared JSON Schema fragments in @gogol/ontology

```
packages/ontology/src/shared-section-props/
  index.ts              SHARED_SECTION_PROPS catalog + composeManifestPropsSchema
                        Currently registers: section-visual, section-header, body-icon-list
```

`getSectionPropsSchema` in `packages/ontology/src/schemas/page-entry.ts` composes fragments into the runtime JSON Schema used by `page.block.validate`.

### Section migration

| Section                         | Status                        | Body kind                     |
| ------------------------------- | ----------------------------- | ----------------------------- |
| ownership-block                 | migrated                      | list                          |
| trust-strip                     | migrated (no header)          | list                          |
| notausgang-block                | migrated                      | list + cta                    |
| transparency                    | migrated                      | list + reportLink             |
| controlled-responsibility-block | migrated                      | split-list                    |
| impact                          | migrated                      | stats                         |
| audience-cards                  | migrated                      | cards                         |
| approach                        | migrated                      | cards                         |
| donation-use                    | migrated                      | cards                         |
| comparison-cards                | migrated                      | comparison                    |
| problem                         | migrated                      | paragraphs                    |
| women                           | migrated                      | paragraphs + image            |
| social-proof                    | migrated                      | paragraphs + registrationNote |
| final-cta                       | migrated                      | paragraphs + ctaGroup         |
| hero                            | migrated                      | composite                     |
| hero-decision-card              | migrated                      | composite (+ GlassPanel)      |
| founder-trust-card              | migrated                      | composite                     |
| donation-card                   | migrated                      | composite                     |
| price-card                      | migrated                      | composite                     |
| faq-list                        | migrated                      | composite                     |
| markdown                        | migrated                      | composite                     |
| team                            | migrated                      | composite                     |
| breadcrumbs                     | utility (no migration needed) | n/a                           |
| navigation                      | utility (no migration needed) | n/a                           |

24 section directories accounted for. Each non-composite section is a thin dispatcher under ~40 lines of .astro.

### Apps migrated

```
apps/warpgogol-com/src/content/pages/de/{home,notausgang,pricing,contact,digitales-fundament}.md
apps/nicaragua-projekt/src/content/pages/de/{home,about-us,faq}.md
apps/nicaragua-projekt/src/content/pages/en/{home,about-us,faq}.md
```

All flat legacy visual-modifier and heading props have been replaced with the canonical structured contract. All Markdown frontmatters use block-style YAML (no flow-style `{}` mappings) per the human-editor convention.

### Legacy removals (RFC-0107 flag day)

- `packages/share/src/schemas/visual-modifiers.ts` — deleted.
- `visualModifierSchema` / `VisualModifiers` exports removed from `packages/share/src/index.ts`.
- Section-local `--verticalFade`, `--noTopFade`, `--noBottomFade`, `--transparent`, `--texture`, `--glass`, `[data-opacity]` CSS rules deleted from every section .css.
- Global `section[class*="--verticalFade"]` overlap rule removed from `packages/tokens/src/tokens.css`.
- `.section-number` primitive removed from `apps/*/src/styles/global.css` and from `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/styles/global.template.css`.
- 10 section `*.props.schema.ts` files rewritten to consume the new contracts.

### Workflow + AGENTS updates

- `.agents/workflows/03-compose.md` — extended `agentInvariants` to require `bodyKind` + `propsSchema.compose` on new archetypes, forbid inline `{}` flow style, and clarify that `site-background` is a shell archetype.
- `.agents/workflows/04-author.md` — extended `agentInvariants` to describe the structured authoring shape, forbid flat legacy props, enforce tone-segmented headings as arrays (never inline Markdown), constrain `motion.parallax` to biomes with `motionStance: expressive`, and require block-style YAML in page frontmatter.
- `packages/ui/AGENTS.md` — new "RFC-0101..0107 section framework" section describes the canonical dispatcher pattern, all five contracts, and the manifest `propsSchemaCompose` mechanism.
- RFC-0100 status set to `superseded`; `supersededBy: RFC-0103`.

## Open work — proposed validators (this RFC)

The merge train delivered the contracts and the migration. The remaining work is mechanical and lives entirely in `packages/os/site-kernel-checks/`. Each validator below is short (<200 lines) because the canonical schemas in `@gogol/share` already encode the rules; the validators only walk files and parse against the schema.

### `section.shell.contract.validate`

For every `.astro` under `packages/ui/src/sections/<slug>/`:

- The root element MUST be `<SectionShell>` (or one of the registered composite roots: hero composite, hero-decision-card composite, ...).
- The file MUST import `<SectionShell>` from `@gogol/ui/components/section-shell.astro`.
- The file MUST NOT contain a raw `<section>` element at root scope.

Violation rules: `raw-section-element-root`, `missing-section-shell-import`.

### `section.background.contract.validate`

For every section archetype YAML and every page block:

- The `background` field, if present, MUST match `sectionBackgroundSchema`.
- Flat legacy props (`transparent`, `verticalFade`, `noTopFade`, `noBottomFade`, `topVerticalFadeOpacity`, `bottomVerticalFadeOpacity`, `texture`, `opacity`, `glass` as boolean) are hard violations.

### `section.header.contract.validate`

For every section archetype that requires a header (i.e. archetype `bodyKind != composite` and not in the `noHeader` allow-list):

- `header.heading` MUST be present.
- `header.heading` MUST be a string OR an array of `{ text, tone? }` segments.
- `header.align`, `body.align`, and any nested `align` field are independent.

### `section.body.contract.validate`

For every section archetype that declares `bodyKind != composite`:

- The section `.astro` MUST import the matching `<SectionBody-{kind}>` component from `@gogol/ui/components/section-body/{kind}.astro`.
- The archetype `propsSchema` MUST encode `body.kind: const "{kind}"`.
- The page authored content MUST satisfy `sectionBodyContentSchema`.

### `section.cta.contract.validate`

For every section that renders a CTA:

- The CTA MUST be authored as `CtaConfig` or `CtaGroupConfig`.
- Flat legacy keys (`ctaLabel`, `ctaAriaLabel`, `ctaSecondaryLabel`, `primaryCtaTarget`, `secondaryCtaTarget`) are hard violations.
- Section `.astro` MUST consume `<SectionCta>` or `<SectionCtaGroup>` — no raw `<a class="btn ...">` inside `packages/ui/src/sections/`.

### `section.image.contract.validate`

For every section that renders an authored image inside its body:

- The section `.astro` MUST consume `<SectionImage>`. Direct `import { Image } from "astro:assets"` is only allowed inside composite layout slots (hero portrait, hero-decision-card bg, women hero photo) — enumerated in an allow-list inside the validator.
- Flat legacy props (`imageFadeBottom`, `imageFadeTop`, `imageFadeLeft`, `imageFadeRight`) are hard violations on the section root.

### `section.motion.contract.validate`

For every section's `motion` config plus the resolved biome motion stance:

- `static` biome → any non-`off` motion is denied.
- `restrained` biome → `motion.parallax` is denied; `motion.reveal` accepts `fade` and `fade-up` only (not `fade-up-stagger`).
- `expressive` biome → all allowed.

The validator reads `apps/<id>/src/content/system.md` for `identity.biome`, then loads `packages/ontology/biomes/<id>.yaml`, then walks page blocks.

### `site.background.contract.validate`

For every page Markdown:

- At most one `type: site-background` shell block per page.
- Section blocks (i.e. `layer != "shell"`) MUST NOT carry the `site-background` type.
- The authored `layers` field MUST satisfy `siteBackgroundConfigSchema`.

### `layout.orchestrator.lint`

For every app:

- Walk `apps/<id>/src/content/pages/**/*.md` and collect motion / counter / inline-number opt-ins.
- Open `apps/<id>/src/scripts/layout-orchestrator.ts`, parse the `runStandardLayoutOrchestration({ ... })` call, and confirm:
  - `counters: true` if any `body.kind: stats` block has `animated: true`.
  - `inlineNumbers: true` if any `body.kind: rich` block has `animateNumbers: true`.
  - `reveal: true` if any section has `motion.reveal`.
  - `parallax: true` if any section has `motion.parallax` OR any `site-background` image layer has `parallax`.
  - `stagger: true` if any section has `motion.stagger`.

### `tokens.colors.section-shell.lint`

For every CSS file under `packages/ui/src/components/section-shell/`, `packages/ui/src/components/section-header/`, `packages/ui/src/components/section-body/**`, `packages/ui/src/components/section-cta/`, `packages/ui/src/components/section-image/`, `packages/ui/src/components/glass-panel/`, and `packages/ui/src/components/site-background/`:

- No raw hex / rgb / rgba / hsl colour. Only `--ds-*` tokens and `color-mix(in srgb, var(--ds-color-*), ...)` are allowed.

### Wiring

All validators above are added to `packages-check.run` in `packages/os/site-kernel-checks/src/module.ts`. Each carries the standard KernelCommandResult envelope and a `--json` flag for CI consumption.

## Open work — scaffold templates (RFC-0107 step 4 finish)

`packages/os/site-kernel-codegen/src/section-scaffold.ts` is currently unchanged in this merge train. The proposal:

- Branch the scaffold on the archetype's `bodyKind` field.
- Emit per-bodyKind starters that already use `<SectionShell>` + `<SectionHeader>` + the matching `<SectionBody-{kind}>` component.
- Pre-populate `propsSchemaCompose: [section-visual, section-header, body-icon-list]` (or the appropriate fragment list).
- Author `.types.ts` to mirror the new contract.
- Author a `.story.md` with a realistic body example.

This change is mechanical but touches the scaffold template renderer in non-trivial places; it is split out of this report so it can land as its own small RFC if the team prefers a dedicated review.

## Open work — `kernel.wire` motion auto-wiring

`kernel.wire` should regenerate `apps/<id>/src/scripts/layout-orchestrator.ts` with the minimum opt-in flags derived from the composed pages, per the table in RFC-0106 Step 8. Currently the orchestrator is generated by hand by the app author. Once `kernel.wire` derives it, `layout.orchestrator.lint` becomes a guard rather than a source of friction.

## New architectural proposals (next wave)

These are observations surfaced during the migration that justify their own RFCs.

### Proposal A — RFC-0109: archetype.bodyKind enforcement in `sectionArchetypeSchema`

`packages/ontology/src/schemas/section-archetype.ts` currently does not declare `bodyKind` as a field on `sectionArchetypeSchema`. The migration added the field to YAML files; the schema accepts it through `.passthrough()` mode. A future RFC should:

- Add `bodyKind: sectionBodyKindSchema` to `sectionArchetypeSchema`.
- Make it required for new archetypes; legacy archetypes without `bodyKind` get a soft warning until they migrate.
- Cross-validate: `archetype.bodyKind == "composite"` ↔ section has no `<SectionBody-*>` child component. This catches drift between archetype and implementation.

### Proposal B — RFC-0110: shared-section-props fragment registry as a YAML catalog

Currently the fragment catalog lives in TypeScript (`packages/ontology/src/shared-section-props/index.ts`). For the human-editor ergonomics rule (the same that forbids flow-style YAML mappings), the fragments should be authored as YAML files under `packages/ontology/shared-section-props/<id>.yaml` and loaded at runtime.

Benefits:

- Brand designers can read the visual contract without opening TypeScript.
- A future site family can extend the registry without modifying the ontology package source.
- Diff reviews focus on data, not on TS expression syntax.

### Proposal C — RFC-0111: biome → SectionShell token resolution layer

The migration assumes `--ds-color-*`, `--ds-shadow-glass`, `--ds-color-border-glass`, `--ds-blur-md` exist on every biome. `packages/tokens/src/tokens.css` carries studio defaults; biomes override selectively via `biome.generated.css`. A new RFC should:

- Mark which `--ds-*` tokens `<SectionShell>` and its body components consume as a contract document.
- Add `biome.contract.validate` cross-check: every consumed token must be present (after biome merge) or fall back through a documented chain.
- Surface "biome misses canonical token X" as a soft warning during `biome.tokens.derive`.

### Proposal D — RFC-0112: archetype catalog regeneration from manifest scan

`packages/ontology/archetypes/index.json` is regenerated by `archetype.registry.build` from manifests. The migration added the new shell archetype (`shells/site-background.yaml`) but the registry build command does not yet scan `archetypes/shells/`. A new RFC should:

- Extend `archetype.registry.build` to walk both `archetypes/sections/` and `archetypes/shells/`.
- Add `archetype.layer` to the index so consumers can filter shell vs section archetypes without re-parsing manifests.
- Update `PLANET_IMPORT_PATHS` and `MOON_IMPORT_PATHS` derivation accordingly; remove the manual `MOON_IMPORT_PATHS_FALLBACK` for `Hermippe → site-background`.

### Proposal E — RFC-0113: archetype.acceptedCosmicNames promotion to a registry

Section migrations introduced eight new component cosmic names (Ananke, Pasiphae, Sinope, Lysithea, Hegemone, Praxidike, Erinome, Aitne, Kalyke, Isonoe, Eukelade, Taygete, Hermippe, Carme). These were picked manually. A new RFC should:

- Audit the cosmic name catalog (`packages/ontology/src/cosmic/`) to ensure uniqueness across all manifests post-migration.
- Run `cosmic.name.pick` retroactively to verify the picks land in valid buckets.
- Document the policy for "internal infrastructure components" (section-shell, section-header, body primitives) whose cosmic names are picked by the framework, not by an archetype.

### Proposal F — RFC-0114: drop `*.props.schema.ts` files in favour of manifest as source of truth

Since `getSectionPropsSchema` consumes the manifest `propsSchemaCompose` + local JSON Schema (not the `.props.schema.ts` Zod export), the per-section `.props.schema.ts` is documentation only. A future RFC should:

- Either delete the `.props.schema.ts` files entirely (smaller surface) and generate Zod types from the manifest for type-aware consumers, or
- Codegen `.props.schema.ts` from the manifest so they cannot drift.

Currently they were rewritten manually in this merge train. The drift risk is real.

### Proposal G — RFC-0115: SiteBackground per-route content discipline

Currently `<SiteBackground>` is authored per page Markdown frontmatter. Two consequences:

- Authors must repeat the same block on every page that wants the same background.
- A constellation cannot declare a default site background applied across all pages of the same biome.

A new RFC should evaluate:

- Whether `<SiteBackground>` belongs in `constellation.yaml` (default for the family) with page-level override.
- Whether the `<Layout>` component should accept a `siteBackground` prop and the constellation supplies it.

## Acceptance criteria

- [x] Each proposed validator above is implemented as a separate small RFC or gathered into one mechanical RFC-0116 "validators". (evidence: implemented historically)
- [x] `kernel.wire` motion-flag auto-wiring lands as part of the RFC-0107 closeout. (evidence: implemented historically)
- [x] `archetype.registry.build` discovers `archetypes/shells/`. (evidence: implemented historically)
- [x] `bodyKind` becomes a required field on `sectionArchetypeSchema`. (evidence: implemented historically)
- [x] `cosmic.name.pick` ratifies the post-migration catalog. (evidence: implemented historically)
- [x] Section `*.props.schema.ts` files are either removed or codegen'd from manifests. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY proceed to implement Proposal A–G individually as separate small RFCs, OR bundle them into a single RFC-0116 validators package.
- Agents MUST update `.agents/workflows/05-audit.md` once the new validators land so the audit phase consumes them.
- Agents MUST NOT regress the migration by reintroducing flat visual-modifier props or inline-flow-style YAML mappings.

## Outcome (annotated 2026-05-29)

Each Proposal raised by this RFC has now landed, been superseded, or been explicitly closed. The map below points future readers at the canonical follow-up. RFC-0108 itself retains its `implemented` status as the merge-train completion report it always was; this section is a navigation aid, not a contract change.

### Validator suite (§"Open work — proposed validators")

| Proposed command | Closed by |
| --- | --- |
| `section.shell.contract.validate` | RFC-0111 (initial), RFC-0120 (AST-grade upgrade), RFC-0126 (utility allow-list) |
| `section.background.contract.validate` | RFC-0111, RFC-0126 (utility allow-list) |
| `section.header.contract.validate` | RFC-0111, RFC-0120 |
| `section.body.contract.validate` | RFC-0111, RFC-0120 |
| `section.cta.contract.validate` | RFC-0111, RFC-0120, RFC-0127 (composite allow-list `hero` / `hero-decision-card` / `founder-trust-card`) |
| `section.image.contract.validate` | RFC-0111, RFC-0120, RFC-0127 (nested `defaultImageFade` shape in markdown-section) |
| `section.motion.contract.validate` | RFC-0111 (skeleton), RFC-0116 (full enforcement) |
| `site.background.contract.validate` | RFC-0111 (skeleton), RFC-0116 (full enforcement) |
| `layout.orchestrator.lint` | RFC-0111 (skeleton), RFC-0116 (full enforcement) |
| `tokens.colors.section-shell.lint` | RFC-0122 |

Beyond the original list, two adjacent validators were added during the follow-up wave:

| Added command | Authored by |
| --- | --- |
| `tokens.section-shell.contract.validate` | RFC-0124 (cross-checks every consumed `--ds-*` against `@gogol/tokens` `TOKEN_NAME_SET`) |
| `shared.section-props.contract.validate` | RFC-0119 |

### Scaffold + kernel.wire (§"Open work — scaffold templates", §"Open work — `kernel.wire`")

- `section.scaffold` per-`bodyKind` templates and canonical fragment output — **RFC-0112**.
- `kernel.wire` motion-flag auto-wiring — closed at runtime by injecting per-page `OrchestratorConfig` through `resolvePageRoute` → `<BaseLayout orchestratorConfig>` → `window.__SITE_CONFIG.orchestrator`. The orchestrator file itself remains a thin S-2 bridge; flags are no longer hand-authored. Recorded in this repository's session log on 2026-05-29.

### Proposals A–G (§"New architectural proposals")

| Proposal | Topic | Closing RFC |
| --- | --- | --- |
| A | `bodyKind` required on `sectionArchetypeSchema` | RFC-0109 |
| B | Shared-section-props fragment registry | RFC-0110 (initial), RFC-0119 (versioning + pinning) |
| C | Biome → SectionShell token resolution layer | RFC-0124 + `packages/ui/docs/section-framework-token-contract.md` |
| D | `archetype.registry.build` discovers shell archetypes | Already covered — scanner walks `packages/ontology/archetypes/components/shell/` (see `archetype.ts:172`); `MOON_IMPORT_PATHS_FALLBACK` retired from `packages/share/src/page.ts` on 2026-05-29 |
| E | `cosmic.name.pick` ratify post-migration | `cosmic.catalog.validate` + `cosmic.name.unique` both green (62 manifests, all unique) on 2026-05-29 — no dedicated RFC required |
| F | Drop `*.props.schema.ts` in favour of manifest-only contract | RFC-0123 |
| G | SiteBackground in constellation | RFC-0125 (explicit closeout — biome-level via RFC-0114 / RFC-0117 chosen over constellation-level) |

### Cross-cutting cleanup landed alongside

- RFC-0113 — GSAP counter + inline-number cross-link cleanup under RFC-0106.
- RFC-0115 — team / person-profile migration to `<SectionImage>` and `imageFade` removal.
- RFC-0118 — `<SectionImage>` variable parallax speed + variant.
- RFC-0121 — page-driven shared-context for section background images.

### Still open after the closeout wave

- **HEAD-01 in markdown-section.** Tracked by RFC-0127 §"Remaining open work" — substantive refactor of `<h1 class="markdown-section__title">` into `<SectionHeader>`. Not absorbed into RFC-0127 because it touches CSS and the prose-heading model.
- **RFC-0114 / RFC-0117 build-time pipeline.** `biome.site-background.derive` is not yet a registered kernel command; `onboarding.scaffold` does not yet seed `system.md shell.background` from `biome.siteBackground`. Tracked by RFC-0125 §"Remaining open work" and remains under the RFC-0114 / RFC-0117 envelopes.

## Backfilled sections (RFC-0366)

The following headings were added when the RFC mini-template was retired. The original command/policy RFC used the mini form, which recorded only Context, Decision, Acceptance criteria, and Implementation notes. These sections satisfy the unified full-template contract without altering the original decision.

## Problem

See the Context section above for the problem this RFC addresses. (This section is required by the unified RFC template; the original mini-RFC recorded the problem within Context.)

## Architectural fit

This RFC aligns with the DNA invariants and related RFCs listed in the frontmatter. (Backfilled during mini-template retirement; original mini-RFC did not include a separate Architectural fit section.)

## Design

See the Decision and Acceptance criteria sections above for the design. (Backfilled during mini-template retirement; original mini-RFC recorded design within Decision and Acceptance criteria.)

## Rollout

Implemented as described in the Acceptance criteria and Implementation notes. (Backfilled during mini-template retirement.)

## Alternatives considered

No alternatives were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)

## Risks

No additional risks were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)
