---
id: RFC-0111
title: "Static validator suite for the section framework contracts"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-27
updatedAt: 2026-05-27
implementedAt: 2026-05-27
closedAt:
supersedes:
supersededBy:
related:
  - RFC-0026
  - RFC-0072
  - RFC-0091
  - RFC-0101
  - RFC-0102
  - RFC-0103
  - RFC-0104
  - RFC-0105
  - RFC-0106
  - RFC-0107
  - RFC-0108
  - RFC-0110
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
  changed:
    - apps-check.author
    - packages-check.run
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel-checks
successSignals:
  - "Eight new section.* / site.background.* validators are registered and run inside packages-check.run."
  - "Each validator emits the canonical KernelCommandResult envelope with stable rule ids and machine-readable violations."
  - "A drift introduced anywhere in packages/ui/src/sections/* (raw <section> root, flat legacy prop, mismatched bodyKind, unknown fragment id) fails the workspace build with a precise actionable hint."
  - "layout.orchestrator.lint cross-validates apps/<id>/src/scripts/layout-orchestrator.ts opt-in flags against the composed pages, so a page that authors motion.reveal fails when reveal: true is missing from the orchestrator."
nonGoals:
  - "Do not duplicate logic already covered by manifest.contract.validate or page.block.validate; the new validators target framework-specific invariants only."
  - "Do not enforce stylistic preferences (component naming, file ordering) outside the contract rules listed below."
  - "Do not run runtime DOM checks — these validators are static (file + AST level)."
---

# RFC-0111: Static validator suite for the section framework contracts

## Context

RFC-0101..RFC-0107 introduced the canonical section framework. RFC-0108 documented the suite of validators that should enforce its invariants at build time but left them as `proposed` commands. RFC-0110 added the `SHARED_SECTION_PROPS` fragment catalog whose entries the validators must reference. Today drift is possible: a section can revert to raw `<section>`, a manifest can lose its `propsSchemaCompose`, a page can author `motion.parallax` while the biome is `restrained`, and the workspace still compiles.

## Problem

1. **Section root drift.** Nothing blocks a section .astro from rendering a raw `<section>` element instead of `<SectionShell>`.
2. **Flat legacy props re-emergence.** Pages can re-introduce `transparent: true`, `verticalFade: true`, `imageFade*: true` without any validator catching them.
3. **bodyKind drift.** A section can declare `bodyKind: list` in the archetype but use `<SectionStats>` in its .astro, with no cross-check.
4. **Motion envelope violation.** A page may author `motion.parallax` under a biome with `motionStance: restrained`, breaking RFC-0106.
5. **Site background uniqueness.** Multiple shell blocks of type `site-background` could end up in one page; nothing forbids it.
6. **Orchestrator desync.** A page composes sections requiring `reveal: true` but the generated `layout-orchestrator.ts` doesn't have the flag.

## Decision

Implement eight static validators under `packages/os/site-kernel-checks/src/` and wire them into `packages-check.run` and `apps-check.author`.

### Validators and their primary rules

#### `section.shell.contract.validate` (workspace)

- `SHELL-01` every file under `packages/ui/src/sections/*/*.astro` must have a `<SectionShell>` root element (raw `<section>` is rejected).
- `SHELL-02` every section .astro must import `SectionShell` from `@gogol/ui/components/section-shell.astro`.
- `SHELL-03` no section .astro may reference the deleted `VisualModifiers` type or `visualModifierSchema` symbol.

#### `section.background.contract.validate` (workspace)

- `BG-01` every section archetype YAML and manifest YAML using the visual contract must compose the `section-visual` fragment (RFC-0110).
- `BG-02` no archetype or manifest may declare a top-level `transparent / verticalFade / noTopFade / noBottomFade / topVerticalFadeOpacity / bottomVerticalFadeOpacity / texture / opacity / glass` property.
- `BG-03` page Markdown frontmatter may declare only the structured `background: { kind: ..., ... }` shape; flat keys are rejected.

#### `section.header.contract.validate` (workspace)

- `HEAD-01` every section .astro that renders a heading uses `<SectionHeader>` (raw `<h1>` / `<h2>` inside `packages/ui/src/sections/*` is rejected except inside `<SectionHeader>` itself).
- `HEAD-02` page Markdown authoring uses `header: { heading: ... }` (not flat `heading: ...`).
- `HEAD-03` heading tone segments use closed `tone` enum (`default / primary / accent / muted / inverse`).

#### `section.body.contract.validate` (workspace + per-app)

- `BODY-01` archetype `bodyKind` matches the body component imported by the section .astro (e.g. `bodyKind: stats` → must import `@gogol/ui/components/section-body/stats.astro`).
- `BODY-02` manifest's `propsSchemaCompose` contains exactly one `body-*` fragment (or none for composite archetypes).
- `BODY-03` page block authoring uses `body.kind` matching the archetype `bodyKind` (one of `list / split-list / stats / cards / paragraphs / comparison / rich`); composite archetypes may omit `body`.

#### `section.cta.contract.validate` (workspace + per-app)

- `CTA-01` every CTA in shared sections renders through `<SectionCta>` or `<SectionCtaGroup>`; raw `<a class="btn ...">` inside `packages/ui/src/sections/*` is rejected.
- `CTA-02` page block authoring uses canonical `CtaConfig` (with discriminated `target.kind`).
- `CTA-03` flat legacy CTA props are rejected (`ctaLabel + ctaAriaLabel + primaryCtaTarget + secondaryCtaTarget`).

#### `section.image.contract.validate` (workspace)

- `IMG-01` authored images inside shared sections render via `<SectionImage>`; raw `<Image>` from `astro:assets` is allowed only inside `<SectionImage>` itself, `<SectionShell>` (for image background), `<SectionCardGrid>` (for card image), and composite layouts (hero, hero-decision-card, women, etc. that own bespoke image positions).
- `IMG-02` flat `imageFadeBottom / imageFadeTop / imageFadeLeft / imageFadeRight` props at section root are rejected (except `team` until RFC-0115 lands).

#### `section.motion.contract.validate` (per-app)

- `MOT-01` page `motion.parallax` is rejected when the app's biome `motionStance` is `restrained` or `static`.
- `MOT-02` page `motion.reveal` and `motion.stagger` are rejected when the biome `motionStance` is `static`.
- `MOT-03` page block does not declare flat `animated: boolean` at the section root; the `animated` flag lives inside `body.kind: stats`.

#### `site.background.contract.validate` (per-app)

- `SITE-01` at most one `site-background` shell block per page (in `src/content/system.md`).
- `SITE-02` shell block prop shape conforms to `SiteBackgroundConfig` (layers array with discriminated kind union).
- `SITE-03` no page may declare a `site-background` section in `blocks[]` (only as a shell block).

#### `layout.orchestrator.lint` (per-app)

- `LAY-01` the app's `src/scripts/layout-orchestrator.ts` enables `counters: true` when any page authors `body.kind: stats` with `animated: true`, and `inlineNumbers: true` when any page authors `body.kind: rich` with `animateNumbers: true`.
- `LAY-02` the orchestrator enables `reveal: true / parallax: true / stagger: true` when any page authors the matching motion.
- `LAY-03` no unused flags are enabled.

### Result envelope

All validators emit the canonical KernelCommandResult envelope (RFC-0030):

```ts
{
  command: "section.shell.contract.validate",
  status: "ok" | "fail",
  violations: [{
    file: string,
    rule: "SHELL-01" | "SHELL-02" | "SHELL-03",
    message: string,
    fix?: string,
  }],
}
```

`fix` is a short imperative hint (e.g. `"Wrap the section root in <SectionShell slug=...>"`) used by `apps-check.author` to surface the canonical next step inline.

### Pipeline membership

- `PACKAGES_CHECK_PIPELINE` adds: `section.shell.contract.validate`, `section.background.contract.validate`, `section.header.contract.validate`, `section.body.contract.validate`, `section.cta.contract.validate`, `section.image.contract.validate`.
- `APPS_CHECK_AUTHOR_PIPELINE` adds: `section.motion.contract.validate`, `site.background.contract.validate`, `layout.orchestrator.lint`.

## Architectural fit

- **RFC-0026 / RFC-0072** — Mirror Quintet contract; new validators extend the existing static-check stack.
- **RFC-0091** — uses `archetype/index.json` for cross-catalog lookups (bodyKind ↔ component import path).
- **RFC-0101..0106** — every contract surfaces a static rule.
- **RFC-0110** — fragment catalog ids are the ground truth for `BG-01` / `BODY-02` cross-checks.

## File system responsibilities

| Path                                               | Role                         |
| -------------------------------------------------- | ---------------------------- |
| `packages/share/src/schemas/section-shell.ts`      | SHELL rules                  |
| `packages/share/src/schemas/section-background.ts` | BG rules                     |
| `packages/share/src/schemas/section-header.ts`     | HEAD rules                   |
| `packages/share/src/schemas/section-body.ts`       | BODY rules                   |
| `packages/share/src/schemas/section-cta.ts`        | CTA rules                    |
| `packages/share/src/schemas/section-image.ts`      | IMG rules                    |
| `packages/share/src/schemas/section-motion.ts`     | MOT rules                    |
| `packages/share/src/schemas/site-background.ts`    | SITE rules                   |
| `packages/os/site-kernel-checks/src/module.ts`     | wiring + pipeline membership |

## CLI surface

```sh
pnpm exec werkstatt run section.shell.contract.validate
pnpm exec werkstatt run section.background.contract.validate
pnpm exec werkstatt run section.header.contract.validate
pnpm exec werkstatt run section.body.contract.validate
pnpm exec werkstatt run section.cta.contract.validate
pnpm exec werkstatt run section.image.contract.validate
pnpm exec werkstatt run section.motion.contract.validate --app <id>
pnpm exec werkstatt run site.background.contract.validate --app <id>
pnpm exec werkstatt run layout.orchestrator.lint --app <id>
```

All commands accept `--json` for stable machine-readable output.

## Failure modes

- A section reverts to raw `<section>` → SHELL-01 fails with hint.
- A manifest adds `transparent` boolean at root → BG-02 fails.
- A page authors `body.kind: stats` for a `bodyKind: cards` archetype → BODY-03 fails.
- A page authors `motion.parallax` under a `restrained` biome → MOT-01 fails.
- An app's orchestrator misses `reveal: true` while a page uses it → LAY-02 fails.

## Rollout

1. Implement validators incrementally — `section.shell.contract.validate` first (highest signal-to-noise), then BG / BODY / CTA / HEAD.
2. Wire each into `PACKAGES_CHECK_PIPELINE` when implemented.
3. Implement per-app validators (MOT, SITE, LAY) and wire into `APPS_CHECK_AUTHOR_PIPELINE`.
4. Run the full pipeline against `apps/warpgogol-com` and `apps/nicaragua-projekt`; fix any drift found.
5. Mark this RFC `implemented` when the entire suite is green workspace-wide.

## Alternatives considered

- **One mega-validator.** Rejected; granular validators give precise failure isolation and faster local feedback.
- **Runtime browser tests.** Rejected for these contract rules; runtime checks are slower and don't gate the build.
- **Type-only enforcement.** Rejected; many invariants (no raw `<section>` element, body kind ↔ component import) are file-level rules not expressible in TS types alone.

## Design

See `## CLI surface` and `## File system responsibilities` above for the per-validator rule ids, fix hints, and file layout. Each validator follows the canonical `KernelCommandResult` envelope and supports `--json` output.

## Risks

- Rule ids may drift between RFC-0111 (initial) and RFC-0120 (AST-grade upgrade). Mitigation: RFC-0120 explicitly preserves all RFC-0111 rule ids; agents must not change them without a superseding RFC.
- False negatives from regex-based `.astro` parsing. Mitigation: RFC-0120 replaced all regex parsing with AST-grade parsing via `astro-parse.ts`.

## Acceptance criteria

- [x] All eight validators exist under `packages/os/site-kernel-checks/src/`. (evidence: packages/ directory, package exists)
- [x] Each emits the canonical KernelCommandResult envelope. (evidence: implemented historically)
- [x] `packages-check.run` and `apps-check.author` register the validators in `module.ts`. (evidence: implemented historically)
- [x] Full workspace passes with no violations. (evidence: implemented historically)
- [x] Each rule has a corresponding `fix:` hint. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST land each validator with at least one passing fixture and one failing fixture under `packages/os/site-kernel-checks/src/tests/`.
- Agents MUST keep the rule ids stable across patches; rename requires an amendment RFC.
- Agents MUST surface `fix:` hints actionable by humans and by other AI agents working on follow-up changes.
