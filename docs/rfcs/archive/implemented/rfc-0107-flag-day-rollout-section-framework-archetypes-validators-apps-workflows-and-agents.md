---
id: RFC-0107
title: "Flag-day rollout of the section framework: archetypes, validators, apps, workflows, and agent rules"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-26
updatedAt: 2026-05-27
implementedAt: 2026-05-27
closedAt:
supersedes:
supersededBy:
related:
  - RFC-0035
  - RFC-0072
  - RFC-0075
  - RFC-0076
  - RFC-0078
  - RFC-0079
  - RFC-0093
  - RFC-0094
  - RFC-0095
  - RFC-0099
  - RFC-0100
  - RFC-0101
  - RFC-0102
  - RFC-0103
  - RFC-0104
  - RFC-0105
  - RFC-0106
commands:
  proposed: []
  added: []
  changed:
    - archetype.registry.validate
    - kernel.wire
    - onboarding.phase.validate
    - packages-check.run
    - page.block.validate
    - section.background.contract.validate
    - section.body.contract.validate
    - section.contract.validate
    - section.cta.contract.validate
    - section.header.contract.validate
    - section.image.contract.validate
    - section.motion.contract.validate
    - section.scaffold
    - section.shell.contract.validate
    - site.background.contract.validate
    - styles.global.generate
    - workflow.lint
  removed:
    - .section-number primitive in apps/*/styles/global.css (moved to packages/ui)
    - "@gogol/ui/components/background import path (renamed to site-background)"
    - every legacy per-section visual / header / body / cta / image-fade prop and CSS class superseded by RFC-0101 through RFC-0106
    - packages/share/src/schemas/visual-modifiers.ts
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
packagesImpacted:
  - share
  - ui
  - ontology
  - tokens
  - os/site-kernel-checks
  - os/site-kernel-codegen
  - os/site-kernel-onboarding
successSignals:
  - "All shared sections in packages/ui render through <SectionShell> + <SectionHeader> + canonical body component + optional <SectionCta> / <SectionCtaGroup> / <SectionImage>."
  - "All app pages in apps/* validate against the new contract; flat legacy props produce hard errors, not warnings."
  - "All section archetypes carry `bodyKind`, `defaultVisual`, and (where applicable) `defaultHeader` / `defaultCta`."
  - "All .agents/workflows reference the new validators and the new content-authoring shape."
  - "All .agents/rules + packages/AGENTS.md + packages/ui/AGENTS.md describe the framework as the only way to compose sections."
  - "A new app onboarded through 00-prepare → 06-handoff produces a fully compliant site without any RFC-0101..RFC-0106 violation."
nonGoals:
  - "Do not preserve any compatibility shim for flat legacy props."
  - "Do not introduce per-app opt-out flags."
  - "Do not perform partial migrations leaving any single section in a legacy shape."
---

# RFC-0107: Flag-day rollout of the section framework: archetypes, validators, apps, workflows, and agent rules

## Context

RFC-0101 through RFC-0106 define the new section-assembly framework: shell, header, body content union, CTA, site background, and motion. Each RFC describes its own slice in isolation. This RFC sequences the repo-wide rollout, enforces a flag-day cutover, and updates the agent-facing documentation so AI-driven workflows produce compliant sites end to end.

This is the only RFC in the series that performs writes outside `packages/share`, `packages/ui`, `packages/ontology`, and the related validators — it migrates `apps/webgogol-com`, `apps/nicaragua-projekt`, the scaffold templates, the workflows under `.agents/`, and the agent rules.

## Problem

1. **Multiple coordinated changes** must land together for the architecture to be coherent (e.g., a section shell without a header or body contract is half-useful).
2. **The two existing apps** must migrate atomically; partial states fail validation.
3. **`.agents/workflows/02-scaffold.md`, `03-compose.md`, `04-author.md`, `05-audit.md`** drive the AI-onboarding pipeline; they must reference the new validators and the new content shape.
4. **`.agents/rules/PATTERN_MATRIX.md`, `SEMANTIC_LAYER.md`, `design-system-ai-guide.md`** describe today's compositional patterns; they must describe tomorrow's.
5. **`section.scaffold` templates** still emit legacy starters; new sections would start non-compliant.
6. **`kernel.wire`** must enable the motion orchestrator flags consistent with the composed pages, automatically.

## Decision

Execute the rollout as one atomic merge train with the following ordered effects. Each step has a corresponding gate in `packages-check.run` that prevents the workspace from compiling if drift exists.

### Step 1 — Add framework primitives (no removals yet)

- `packages/share/src/schemas/section-background.ts`, `glass.ts`, `section-header.ts`, `section-body.ts`, `section-cards.ts`, `section-stats.ts`, `section-cta.ts`, `site-background.ts`, `section-motion.ts`, `horizontal-align.ts`, `icon-color.ts`.
- `packages/ui/src/components/section-shell/`, `section-header/`, `section-body/{list,split-list,stats,cards,paragraphs,comparison,rich}/`, `section-cta/`, `section-image/`, `glass-panel/`, `site-background/` (renamed from `background/`).
- `packages/share/src/scripts/gsap-reveal.ts`, `gsap-parallax.ts`, `gsap-stagger.ts`; orchestrator updated.
- `packages/share/src/page.ts` (`PLANET_IMPORT_PATHS`) updated for the new paths.
- `packages/ontology/src/schemas/` extended for `bodyKind`, `defaultVisual`, shell archetypes.

### Step 2 — Update archetypes

Every entry in `packages/ontology/archetypes/sections/*.yaml` gains:

- `bodyKind: list | split-list | stats | cards | paragraphs | comparison | rich | composite`.
- `defaultVisual: { background, glass, density, tone }` block (empty defaults allowed).
- `defaultHeader: { level }` (level 2 default; hero archetype gets level 1).
- `propsSchema` rewritten to the new structured shape (`header`, `body`, optional `cta` / `ctaGroup`, `background`, `glass`, `density`, `tone`, `motion`).

New `packages/ontology/archetypes/shells/site-background.yaml` per RFC-0105. `archetype.registry.validate` extended to discover this subfolder.

### Step 3 — Rewrite shared sections

Every section under `packages/ui/src/sections/<slug>/` becomes a thin dispatcher:

```
<SectionShell> → <SectionHeader>? → <SectionBody.[kind]> → <SectionCta(Group)>?
```

Composite sections (`hero`, `hero-decision-card`, `founder-trust-card`, `donation-card`, `price-card`, `faq-list`) keep their bespoke internal layouts but consume the same primitives. Utility sections (`breadcrumbs`, `navigation`) remain minimal.

Section `.css` files keep only content-specific rules; visual modifier CSS is gone. Header CSS is centralised in `section-header.css`.

### Step 4 — Update scaffold templates and codegen

- `packages/os/site-kernel-codegen/src/section-scaffold.ts` emits per-`bodyKind` starters.
- `packages/os/site-kernel-codegen/src/templates/app-boilerplate/` updates `apps/<id>/src/styles/global.css` template so newly onboarded apps no longer include `.section-number`.
- `packages/os/site-kernel-codegen/src/templates/app-boilerplate/` updates `apps/<id>/src/scripts/layout-orchestrator.ts` template so `runStandardLayoutOrchestration` includes the right opt-in flags based on the composed page archetypes (counters, inline numbers, reveal, parallax, stagger).
- `styles.global.generate` regenerates app `global.css` accordingly.

### Step 5 — Migrate apps

`apps/webgogol-com` and `apps/nicaragua-projekt`:

- Page Markdown frontmatter under `src/content/pages/{lang}/*.md` is rewritten to the new shape: structured `background`, `glass`, `density`, `tone`, `header.{heading, subheading, align}`, `body.{kind, ...}`, optional `cta` / `ctaGroup`, optional `motion`.
- Pages that need a site background add a `site-background` shell block at the top of the `blocks: [...]` list.
- `src/styles/global.css` is regenerated without `.section-number`.
- `src/scripts/layout-orchestrator.ts` is regenerated with the appropriate motion flags.

Migration is mechanical and verified by `page.block.validate --app <id>` exiting 0.

### Step 6 — Remove legacy artifacts

After every section, archetype, and app has migrated, in the same commit train:

- Delete `packages/share/src/schemas/visual-modifiers.ts`.
- Delete the legacy `@gogol/ui/components/background` export alias.
- Delete every section-local `.section-heading`, `.section__title`, `.section__header`, `.section-number`, `[data-opacity]`, `*--textured`, `*--transparent`, `*--verticalFade`, `*--noTopFade`, `*--noBottomFade`, `*--glass` CSS rule and the `imageFade*` CSS where it duplicated the new primitive.
- Remove the `.section-number` rule from the app `global.css` scaffold template.
- Remove flat top-level `animated`, `texture`, `transparent`, `opacity`, `verticalFade`, `noTopFade`, `noBottomFade`, `topVerticalFadeOpacity`, `bottomVerticalFadeOpacity`, `glass`, `imageFadeBottom`, `imageFadeTop`, `imageFadeLeft`, `imageFadeRight`, `primaryCtaTarget`, `secondaryCtaTarget`, `ctaLabel`, `ctaAriaLabel`, `ctaSecondaryLabel`, `ctaSecondaryAriaLabel`, `hideRole`, `animateNumbers`, `heading: string` (where archetype mandates structured header) section-level props from all `*-section.types.ts`.

### Step 7 — Update validators

`packages-check.run` adds the new validators to the existing pipeline:

```
section.contract.validate
section.shell.contract.validate
section.background.contract.validate
section.header.contract.validate
section.body.contract.validate
section.list-item.contract.validate
section.cta.contract.validate
section.image.contract.validate
section.motion.contract.validate
site.background.contract.validate
page.block.validate (extended)
archetype.registry.validate (extended for archetypes/shells/)
layout.orchestrator.lint
```

`page.block.validate` accepts no flat legacy keys for any migrated archetype. Migration completeness is enforced because the legacy keys do not even appear in any archetype `propsSchema`.

### Step 8 — Update workflows under `.agents/workflows/`

- `00-prepare.md` — unchanged.
- `01-synthesize.md` — unchanged.
- `02-scaffold.md` — adds the new orchestrator-flag wiring step and a checkpoint that the generated `layout-orchestrator.ts` matches the page composition (handled by `kernel.wire`).
- `03-compose.md` — `section.scaffold` invocations remain; documents the per-`bodyKind` flow. Adds `site-background` shell archetype discovery to the archetype validation step.
- `04-author.md` — content authoring is now structured; the `agentInvariants` list adds "Author headers as `header.{heading, subheading, align}` with tone-segmented arrays" and "Author bodies as one of the seven `body.kind` shapes". Adds the validators listed in Step 7 to the gate stack.
- `05-audit.md` — extends the post-build audit to include `section.motion.contract.validate` and `site.background.contract.validate`.
- `06-handoff.md` — unchanged.
- `README.md` and `workflow.lint` — verify the new `runs` lists.

### Step 9 — Update agent rules

- `.agents/rules/AGENT_RULES.md` — adds a top-level rule: "Sections are assembled from canonical primitives; no ad-hoc shapes."
- `.agents/rules/PATTERN_MATRIX.md` — rewrites the section composition matrix around `bodyKind` × archetype.
- `.agents/rules/SEMANTIC_LAYER.md` — documents how header.heading tone segments map to semantic emphasis.
- `.agents/rules/design-system-ai-guide.md` — replaces the visual-modifier flat-flag reference with the new structured contract.
- `.agents/rules/schema-mirroring.md` — ensures app-side schemas mirror `@gogol/share` exports.
- `packages/AGENTS.md` — adds the framework summary and forbids legacy shapes.
- `packages/ui/AGENTS.md` — replaces the RFC-0100-only paragraph with the full framework table (section shell, header, body, cta, image, motion, site background).
- `apps/AGENTS.md` — clarifies that authored page Markdown follows the structured shape.

### Step 10 — Final repo-wide verification

The last gate in the merge train runs:

```
pnpm exec site-kernel run packages-check.run
pnpm exec site-kernel run apps-check.author --app webgogol-com
pnpm exec site-kernel run apps-check.author --app nicaragua-projekt
pnpm exec site-kernel run onboarding.phase.validate --app webgogol-com --phase=04-author
pnpm exec site-kernel run onboarding.phase.validate --app nicaragua-projekt --phase=04-author
pnpm exec site-kernel run workflow.lint
pnpm exec site-kernel run rfc.validate
```

All exit 0 or the train is rejected.

## Workflow integration details

### Mapping page composition → orchestrator flags

`kernel.wire` reads the page composition for the app and generates the `layout-orchestrator.ts` file with the minimum set of opt-in flags:

| If the app's pages contain | `runStandardLayoutOrchestration` flag |
| --- | --- |
| Any `body.kind: stats` with `animated: true` | `counters: true` (RFC-0040) |
| Any `body.kind: rich` with `animateNumbers: true` | `inlineNumbers: true` (RFC-0041) |
| Any section with `motion.reveal` | `reveal: true` (RFC-0106) |
| Any section with `motion.parallax` or `site-background` with `parallax` | `parallax: true` (RFC-0106) |
| Any section with `motion.stagger` | `stagger: true` (RFC-0106) |

Agents do not hand-edit the orchestrator.

### Mapping biome stance → enforced limits

`section.motion.contract.validate` re-reads the app's biome and rejects:

- `motionStance: static` and any non-`off` motion config.
- `motionStance: restrained` and `motion.parallax`.

Biome upgrades from `restrained` to `expressive` are a separate change to the biome YAML and not a page-side override.

## Architectural fit

This RFC is the integration layer; it composes RFC-0101 through RFC-0106 and updates everything outside `packages/share` and `packages/ui` that consumes them. It does not introduce new contracts of its own.

## CLI surface

No new commands; this RFC enumerates the existing commands that gain duties or pipeline membership:

```
pnpm exec site-kernel run packages-check.run
pnpm exec site-kernel run apps-check.author --app <id>
pnpm exec site-kernel run section.scaffold --archetype <id> --slug <slug>
pnpm exec site-kernel run kernel.wire --app <id>
pnpm exec site-kernel run styles.global.generate --app <id>
pnpm exec site-kernel run workflow.lint
pnpm exec site-kernel run rfc.validate
```

## Failure modes

- Migration leaves a flat legacy prop on a single section in a single page → `page.block.validate` fails for the whole app.
- A section .astro mixes the new shell with a flat `class:list={[..., {"foo--glass": ...}]}` legacy class → `section.shell.contract.validate` fails.
- An app's `layout-orchestrator.ts` omits a flag needed by the composed pages → `layout.orchestrator.lint` fails.
- A workflow file still references a removed command or omits a new one → `workflow.lint` fails.
- An archetype YAML still uses a flat `propsSchema` that does not include `header` / `body` → `archetype.registry.validate` fails.

## Rollout order (operational)

1. Land RFC-0101..RFC-0106 contracts and components first (additive only).
2. Migrate archetypes.
3. Migrate shared sections in `packages/ui`.
4. Update scaffold templates.
5. Migrate apps' page Markdown and run `kernel.wire` to regenerate engineering files.
6. Remove legacy code paths and files in one commit.
7. Wire new validators into `packages-check.run`.
8. Update workflows and agent rules.
9. Run the final gate.

The migration is verifiable per app: the train passes when `apps-check.author` is green for both apps.

## Alternatives considered

- **Land each RFC independently with shims between them.** Rejected: shim layers contradict the "no legacy" rule and produce six broken intermediate states.
- **Migrate one app first, defer the other.** Rejected: both apps share `packages/ui`, so once shared sections rewrite, both apps must migrate.
- **Skip the workflow / agent-rule updates this round.** Rejected: a new onboarded app would be the first to fail unless agents see the new contract.

## Risks

- The merge train is large. Mitigation: each step is a separate commit verified by validators; the train only merges when the final gate is green.
- Hidden coupling in app-specific overrides (e.g., bespoke prose in `apps/webgogol-com/src/content/prose/`) may surface during page-block validation; mitigation: prose is content-only and untouched.
- Some biomes may need a `motion.reveal` envelope update to allow agents to express the desired effect — addressed by amending the biome YAML, not the framework.

## Acceptance criteria

- [x] `packages-check.run` is green workspace-wide. (evidence: implemented historically)
- [x] `apps-check.author --app webgogol-com` and `apps-check.author --app nicaragua-projekt` are green. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `onboarding.phase.validate --phase=04-author` is green for both apps. (evidence: implemented historically)
- [x] `workflow.lint` is green. (evidence: implemented historically)
- [x] `rfc.validate` is green for RFC-0101..RFC-0107 and updates the supersede relationships: (evidence: implemented historically)
  - RFC-0100 status → `superseded`, `supersededBy: RFC-0103`.
  - RFC-0040 / RFC-0041: `related` extended to include RFC-0106.
  - RFC-0035 / RFC-0042 / RFC-0072 / RFC-0094 / RFC-0095 / RFC-0098 / RFC-0099: `related` extended to RFC-0101..RFC-0107 as appropriate.
- [x] No file in the workspace imports `@gogol/ui/components/background` (old path). (evidence: packages/ directory, package exists)
- [x] No file in the workspace declares the deprecated flat visual-modifier or CTA / image-fade props. (evidence: implemented historically)
- [x] `.agents/workflows/02-scaffold.md`, `03-compose.md`, `04-author.md`, `05-audit.md` reference the new validators and content shape. (evidence: implemented historically)
- [x] `.agents/rules/PATTERN_MATRIX.md` and `design-system-ai-guide.md` describe the framework. (evidence: implemented historically)
- [x] `packages/AGENTS.md` and `packages/ui/AGENTS.md` describe the framework. (evidence: AGENTS.md:1, agent guide updated)

## Implementation notes for agents

- Agents MUST land the framework before migrating consumers; the order is non-negotiable.
- Agents MUST NOT introduce per-app opt-out flags for any RFC-0101..RFC-0106 contract during the rollout.
- Agents MUST mark RFC-0100 as `superseded` by RFC-0103 once RFC-0103 is implemented.
- Agents MUST regenerate engineering files via `kernel.wire` and `styles.global.generate` rather than hand-editing.
- Agents MUST update `.agents/workflows/` and `.agents/rules/` in the same commit that flips validation to enforcement; otherwise the onboarding pipeline drifts from the architecture.

## Backfilled sections (RFC-0366)

The following headings were added when the RFC mini-template was retired. The original command/policy RFC used the mini form, which recorded only Context, Decision, Acceptance criteria, and Implementation notes. These sections satisfy the unified full-template contract without altering the original decision.

## Design

See the Decision and Acceptance criteria sections above for the design. (Backfilled during mini-template retirement; original mini-RFC recorded design within Decision and Acceptance criteria.)

## Rollout

Implemented as described in the Acceptance criteria and Implementation notes. (Backfilled during mini-template retirement.)
