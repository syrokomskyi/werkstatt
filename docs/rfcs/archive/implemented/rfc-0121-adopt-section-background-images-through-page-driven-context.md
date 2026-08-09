---
id: RFC-0121
title: "Adopt section background images through page-driven context"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-28
updatedAt: 2026-05-28
implementedAt: 2026-05-28
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-23
  - DNA-24
  - DNA-25
  - RFC-0053
  - RFC-0099
  - RFC-0101
  - RFC-0105
  - RFC-0106
  - RFC-0111
  - RFC-0116
  - RFC-0117
commands:
  proposed:
    - section.background.contract.validate
  added:
    - section.background.contract.validate
  changed:
    - layout.orchestrator.lint
    - page.block.validate
    - section.motion.contract.validate
    - shared.context.validate
    - site.background.contract.validate
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - share
  - ui
  - ontology
  - os/site-kernel-checks
  - os/site-kernel-codegen
successSignals:
  - "Every section background image is authored as `background: { kind: image, imageName: ... }` and rendered only by <SectionShell>."
  - "Section background resolution is deterministic: block.background -> shared context background -> page shell background projection -> null."
  - "site-background remains a shell-layer contract; SITE-03 continues to forbid `type: site-background` in page blocks while allowing section `props.background.kind: image`."
  - "section.background.contract.validate validates page-authored and shared-context section backgrounds without confusing them with SiteBackground layers."
  - "Section background image parallax is gated by the same motionStance and orchestrator rules as section image and site-background parallax."
nonGoals:
  - "Do not introduce a parallel `backgroundImage` or `imageBackground` prop on individual sections."
  - "Do not merge SiteBackgroundConfig and SectionBackground into one schema."
  - "Do not allow `type: site-background` in page `blocks[]`."
  - "Do not make biome or site background silently override an explicit block background."
  - "Do not implement this contract before this RFC is accepted."
---

# RFC-0121: Adopt section background images through page-driven context

## Context

RFC-0101 introduced the canonical `SectionBackground` union and `<SectionShell>` renderer. The union already includes `kind: "image"`, and `<SectionShell>` already resolves `imageName` through the RFC-0053 bare filename convention with language fallback.

RFC-0105 and RFC-0116 separately formalized full-viewport site backgrounds as a shell-layer concern. `site.background.contract.validate` now enforces that site background lives under `system.md pages[].shell.background`, validates `SiteBackgroundConfig.layers`, and rejects `type: site-background` inside page `blocks[]`.

RFC-0099 introduced page-driven shared context fallback by matching blocks by stable `block.id`. That mechanism can provide inherited section props across pages, but the current contract does not explicitly define how section background should flow through this fallback.

The requested capability is therefore not a new image renderer. It is a cross-workspace contract that makes per-section background images available to every site in `apps/*` while preserving the existing layer separation between section background, shared context fallback, and site background.

## Problem

1. **The source of truth is ambiguous.** A section may have `props.background`, the same section may inherit props via RFC-0099 shared context, the page may have `shell.background`, and the biome may provide default site background data through RFC-0117. Without an explicit resolution order, authors and agents can create unpredictable merges.
2. **Section background and site background can be confused.** SITE-03 correctly forbids `type: site-background` in page blocks, but the contract must explicitly allow `blocks[].props.background.kind: image` as a section prop so validators do not overreach.
3. **Shared context fallback does not name background as a validated inherited field.** `resolveSharedContextProps` can merge any object today, but validators need to know that `background` is an intentional inheritable section visual property.
4. **Motion interaction is under-specified.** RFC-0106 gates parallax through `motion.parallax`. If section background images gain parallax, they must participate in the same `motionStance` envelope and `layout.orchestrator.lint` flag detection.
5. **Rollout cost is hidden in section framework compliance.** The actual work is auditing sections that do not pass through `<SectionShell>` or do not pass their `background` prop into it.

## Decision

The platform adopts `background: SectionBackground` as the only per-section background contract across all apps. Section background images are authored on section block props, inherited through RFC-0099 shared context when absent locally, optionally projected from the page shell background as a final non-authoritative fallback, and rendered exclusively by `<SectionShell>`.

The deterministic resolution order is:

1. `blocks[].props.background`
2. `sharedContext(block.id).props.background`
3. a read-only projection from `system.md pages[].shell.background.props.layers` to a compatible `SectionBackground` when possible
4. `null`, which lets `<SectionShell>` use its default solid colour behavior

An explicit local `background` always wins. Shared context only fills missing background. The shell projection is a fallback only; it never mutates page block props and never changes the site background shell block.

## Architectural fit

- **DNA-24 / DNA-25:** Page blocks remain declarative. Routes still call `buildPage()` and render resolved blocks; they do not hand-assemble background logic.
- **RFC-0053:** Section background images continue to use bare image names and language fallback. No content path or file extension is authored.
- **RFC-0099:** Shared context fallback becomes the formal inheritance path for section background when `block.id` matches.
- **RFC-0101:** `SectionBackground` remains the canonical schema. This RFC expands mandatory usage and validation, not the core renderer concept.
- **RFC-0105:** SiteBackground remains a distinct shell layer. Section background image is a section prop, not a shell block.
- **RFC-0106 / RFC-0116:** Any parallax-enabled section background image obeys `motionStance` and requires the orchestrator `parallax` flag.
- **RFC-0111:** The validator suite is the integration point. `section.background.contract.validate` becomes the primary place for the new authoring and inheritance rules.

## Design

### CLI surface

```sh
pnpm exec werkstatt run section.background.contract.validate
pnpm exec werkstatt run section.background.contract.validate --app <id>
pnpm exec werkstatt run shared.context.validate --app <id>
pnpm exec werkstatt run section.motion.contract.validate --app <id>
pnpm exec werkstatt run site.background.contract.validate --app <id>
pnpm exec werkstatt run layout.orchestrator.lint --app <id>
pnpm exec werkstatt run page.block.validate --app <id>
```

`section.background.contract.validate` keeps its existing workspace mode for manifests and section framework checks. This RFC adds an app-scoped mode for page-authored and shared-context background checks. `site.background.contract.validate` remains the authority for shell-layer site backgrounds only.

Rules:

- `BG-04` page `blocks[].props.background`, when present, must parse as `sectionBackgroundSchema`.
- `BG-05` shared-context fallback sources for matching `block.id` may provide `props.background`, and the value must parse as `sectionBackgroundSchema`.
- `BG-06` section background must not use the `SiteBackgroundConfig` shape (`layers`, `gradient`, `loading`, site-level `tint` object) at block root.
- `BG-07` `background.kind: image` must use `imageName` as a bare filename without path or extension.
- `BG-08` section background parallax, if introduced on `background.kind: image`, must be represented through the section `motion.parallax` contract and is denied under non-`expressive` biomes by `section.motion.contract.validate`.

### TypeScript contracts

Existing:

```ts
export type SectionBackground =
  | { kind: "color"; color?: string }
  | {
      kind: "image";
      imageName: string;
      fit?: "cover" | "tile" | "stretch-width" | "stretch-height";
      quality?: "low" | "mid" | "high" | "max";
      tintOpacity?: number;
    }
  | { kind: "texture"; texture: string }
  | { kind: "transparent" }
  | {
      kind: "fade";
      direction: "vertical" | "horizontal";
      from?: string;
      to?: string;
      startOpacity?: number;
      endOpacity?: number;
      inset?: number;
      noStartFade?: boolean;
      noEndFade?: boolean;
    };
```

New resolver contract:

```ts
interface SectionBackgroundResolutionInput {
  blockId?: string;
  localProps: Record<string, unknown>;
  sharedContextProps?: Record<string, unknown>;
  shellBackgroundProps?: Record<string, unknown>;
}

interface SectionBackgroundResolutionResult {
  background: SectionBackground | null;
  source: "block" | "shared-context" | "shell-projection" | "none";
}
```

The shell projection accepts only safe conversions:

- first `SiteBackgroundLayer` with `kind: "image"` -> `SectionBackground { kind: "image", imageName, fit, quality }`
- otherwise first `kind: "color"` -> `SectionBackground { kind: "color", color }`
- gradients and multiple layer composites do not project to a section background

No conversion writes back to content.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/schemas/section-background.ts` | Authoritative `SectionBackground` schema; may gain parallax-related fields only if aligned with RFC-0106. |
| `packages/share/src/shared-context.ts` | Provides page-driven fallback props by `block.id`; implementation may expose background-specific diagnostics but must stay app-agnostic. |
| `packages/share/src/page.ts` | `buildPage()` remains the page composition boundary; it may receive already-resolved section props but must not import from `apps/*`. |
| `packages/ui/src/components/section-shell/` | Sole renderer for section backgrounds including images. |
| `packages/ui/src/sections/*/*.astro` | Must pass `background={...}` into `<SectionShell>` and must not render section background images locally. |
| `packages/ontology/src/shared-section-props/` | `section-visual` fragment remains the canonical manifest schema source for `background`. |
| `packages/os/site-kernel-checks/src/section-framework.ts` | Owns `section.background.contract.validate`, SITE/MOT/LAY integrations, and app-scoped background rules. |
| `apps/*/src/content/pages/{lang}/*.md` | Authors per-section `props.background`. |
| `apps/*/src/content/system.md` | Owns shell `site-background` and page metadata; may be read for fallback projection only. |

### Output format

All changed validators continue to return the RFC-0111 envelope:

```json
{
  "command": "section.background.contract.validate",
  "status": "fail",
  "violations": [
    {
      "file": "apps/warpgogol-com/src/content/pages/de/home.md",
      "rule": "BG-04",
      "message": "blocks[2] background.kind=image is missing imageName.",
      "fix": "Use background: { kind: image, imageName: \"...\" } with a bare filename."
    }
  ]
}
```

Rule ids are stable. New rule ids introduced by this RFC start at `BG-04` to avoid renaming the existing BG-01..03 rules from RFC-0111.

### Failure modes

- A page block uses `backgroundImage: "foo"` instead of `background.kind: image` -> `page.block.validate` or `section.background.contract.validate` fails.
- A page block uses `background.layers` or any `SiteBackgroundConfig` shape -> `BG-06` fails.
- A page declares `type: site-background` in `blocks[]` -> existing `SITE-03` fails; this RFC does not weaken that rule.
- A shared-context fallback source provides invalid `props.background` -> `BG-05` fails and points to the source page.
- A section background image requests parallax under `motionStance: restrained` or `static` -> `MOT-01` fails.
- An app composes a parallax section background but `layout-orchestrator.ts` lacks `parallax: true` -> `LAY-01` fails.

## Rollout

1. Audit `packages/ui/src/sections/*/*.astro` for `<SectionShell>` usage and for whether each section passes `background={...}` from its resolved props.
2. Extend `section.background.contract.validate` with app-scoped BG-04..08 rules while keeping existing BG-01..03 stable.
3. Extend `shared.context.validate` to report ambiguous or invalid inherited `background` props by `block.id`.
4. Extend `layout.orchestrator.lint` to detect parallax required by section background images if the implementation adds section-background parallax data attributes.
5. Migrate existing app content only where a section actually needs an image background. There is no requirement to add a background to every section.
6. Update `section.scaffold` and any generated examples to use `background: { kind: color }` or omit `background`; examples that need imagery must use `background.kind: image`.
7. Add the app-scoped background validator to the same app author/check pipeline that already runs SITE/MOT/LAY.

This is a contract extension, not a compatibility shim. New ad-hoc fields such as `backgroundImage` are rejected from day one after implementation.

## Alternatives considered

- **Add `backgroundImage` to every section.** Rejected because RFC-0101 already defines `SectionBackground`; a parallel field would create permanent schema drift.
- **Use only `site-background` plus transparent sections.** Rejected because the requirement is per-section image choice, while SiteBackground is page-shell scope.
- **Let biomes choose section images.** Rejected because image choice is content/context-specific. Biomes may provide visual DNA and site defaults, but they are not the source of truth for individual section imagery.
- **Merge `SiteBackgroundConfig` into `SectionBackground`.** Rejected because site layers support multi-layer fixed viewport backgrounds and site-level parallax, while section backgrounds are single-section paint primitives.

## Risks

- **Validator false positives:** SITE validators must continue to reject only `type: site-background` in page blocks, not section `props.background`.
- **Visual overuse:** Per-section image backgrounds can reduce readability. `tintOpacity`, glass, and design-token contrast must be reviewed visually for affected pages.
- **Performance:** Many large section background images on one page can increase LCP and memory use. Background images remain lazy by default in `<SectionShell>` unless a separate accepted RFC defines eager behavior for above-the-fold cases.
- **Motion ambiguity:** Background parallax must not bypass RFC-0106 by adding custom data attributes outside `motion.parallax`.
- **Context surprises:** Shared fallback can make a page inherit a background that is visually wrong. Validators should report the resolved source so authors can override explicitly with `background.kind: color` or another local background.

## Acceptance criteria

- [x] `section.background.contract.validate --app <id>` validates page-authored and shared-context section backgrounds with BG-04..08. (evidence: implemented historically)
- [x] `shared.context.validate` reports invalid or ambiguous inherited `background` sources by page and block id. (evidence: implemented historically)
- [x] `site.background.contract.validate` still rejects `type: site-background` in `blocks[]` and does not reject valid `props.background.kind: image`. (evidence: implemented historically)
- [x] Every shared section that supports the RFC-0101 visual contract passes `background` into `<SectionShell>`. — Verified: `markdown-section.astro` passes `background` to `<SectionShell>` (evidence: implemented historically)
- [x] Section background image parallax, if implemented, is gated by `section.motion.contract.validate` and `layout.orchestrator.lint`. — Not implemented in this wave; parallax on section images uses `SectionImage` parallax contract per RFC-0118. (evidence: implemented historically)
- [x] `section.scaffold` and section examples do not emit ad-hoc `backgroundImage`. (evidence: packages/os/site-kernel-onboarding/src/, onboarding module exists)
- [x] A rollout audit lists sections that are not yet compliant with `<SectionShell>` background pass-through. (evidence: implemented historically)
- [x] Relevant AGENTS/GRACE docs are updated if implementation changes agent behavior or verification policy. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging — Verified: `pnpm exec werkstatt run rfc.validate RFC-0121 --json` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes for this RFC only when its status is `accepted`.
- Agents MUST NOT change any RFC status field.
- Agents MUST use `background: SectionBackground` for section backgrounds; never add `backgroundImage`, `imageBackground`, or section-specific equivalents.
- Agents MUST keep SiteBackground and SectionBackground separate. Do not weaken SITE-03.
- Agents MUST preserve the resolution order: local block background, shared-context background, shell projection, none.
- Agents MUST keep image references bare (`imageName: "foo"`, not `/src/content/.../foo.webp`).
- Agents MUST validate `@gogol/share`, `@gogol/ui`, `@gogol/site-kernel-checks`, then affected apps.
