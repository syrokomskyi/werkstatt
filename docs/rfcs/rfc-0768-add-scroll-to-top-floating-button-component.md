---
id: RFC-0768
title: "Add scroll-to-top floating button component"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-08
updatedAt: 2026-08-08
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-17
  - DNA-23
  - RFC-0011
  - RFC-0023
  - RFC-0031
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-19
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/ontology"
  - "@warpgogol/ui"
  - "@warpgogol/share"
successSignals:
  - "scroll-to-top component renders on all sites after scroll threshold"
  - "Button uses --ds-* biome tokens, no raw colors"
  - "LordIcon arrow-up animation plays on hover"
  - "prefers-reduced-motion respected"
nonGoals:
  - "No per-site configuration in system.md — the button is always present in layout"
  - "No content-layer labels file — aria-label is a static prop with i18n fallback"
  - "No size/position customization props — fixed bottom-right, biome-token-driven styling"
  - "No new Site OS commands"
  - "No changes to the Lenis smooth-scroll module (lenis.ts) — the component reads window.wgLenis opportunistically"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0768: Add scroll-to-top floating button component

## Context

All Warpgogol sites use a shared `layout-component.astro` (`packages/ui/src/components/layout/`) that renders the HTML shell, skip link, SVG clip-path defs, and a `<slot />` for page content. The layout already includes a fixed header with scroll-based hide/show behaviour and a footer — but there is no mechanism for visitors to quickly return to the top of a long page after scrolling down.

The platform uses Lenis for smooth scrolling (`packages/share/src/scripts/lenis.ts`), with `window.wgLenis` as the shared instance. The header component already reads `window.wgLenis` for anchor-link scrolling. A scroll-to-top button is a standard UX pattern that complements the existing navigation infrastructure.

The UI ontology (`@warpgogol/ontology`) uses closed enums for `ComponentRole` (DNA-19). Adding a new component role requires an architecture RFC. The `MoonCatalog` has sufficient free names — no catalog extension is needed.

## Problem

There is no shared scroll-to-top button component in `packages/ui`. Sites that want one would need to implement it independently, leading to:

- **Code duplication** across sites, violating the shared-UI package pattern (DNA-17 Mirror Quintet).
- **Inconsistent UX** — different thresholds, positions, animations, and accessibility behaviours per site.
- **No biome integration** — ad-hoc implementations would use hardcoded colors instead of `--ds-*` tokens (DNA-10).

The `ComponentRole` enum in `packages/ontology/src/enums.ts` does not include a `scroll-to-top` role, so a proper Mirror Quintet component cannot be registered without extending the closed enum (DNA-19).

## Decision

The `ComponentRole` closed enum gains a `scroll-to-top` value, and a new Mirror Quintet component `scroll-to-top` is created in `packages/ui/src/components/scroll-to-top/` with cosmicName `Daphnis`. The component is automatically rendered by `layout-component.astro` on every page — no per-site configuration required. It appears after the user scrolls one viewport height (100vh) and uses the existing Lenis instance for smooth scrolling with a native `scrollTo` fallback.

## Architectural fit

- **DNA-19** (Closed ontology vocabularies): This RFC extends `ComponentRole` with `scroll-to-top`, following the superseding-RFC requirement for closed-enum changes.
- **DNA-17** (Mirror Quintet): The component ships `.astro`, `.css`, `.manifest.yaml`, `.client.ts`, and `.types.generated.ts` — the full Mirror Quintet contract.
- **DNA-23** (Cosmic overlay): cosmicName `Daphnis` is drawn from the existing `MoonCatalog` (no catalog extension needed). Three-way alignment: manifest, `MOON_IMPORT_PATHS` (registry-derived via `archetype.registry.build`), and layout integration.
- **DNA-10** (No hardcoded design tokens): All colours use `--ds-*` biome tokens. No raw hex/rgb values in component CSS.
- **RFC-0011** (Script placement): The client script follows the S-1 component-colocated pattern — `<script> import "./scroll-to-top-component.client"; </script>` inside the `.astro` file.
- **RFC-0031** (Component-scoped client scripts): The `.client.ts` file is colocated with the component, following the copyright-component pattern.
- **Scaling Playbook**: The component is biome-token-driven, so it automatically adapts to every site's visual identity. No per-site configuration or content-layer labels are needed.

## Design

### Component role and archetype

`ComponentRoleValues` in `packages/ontology/src/enums.ts` gains `"scroll-to-top"` as a new value at the end of the array. The JSDoc comment above the enum is updated with a description line.

A new archetype YAML is created at `packages/ontology/archetypes/components/scroll-to-top.yaml`:

```yaml
id: scroll-to-top
displayName: Scroll to Top
version: 1.0.0
semanticRole: component-scroll-to-top
description: |
  Floating button that scrolls to the top of the page after the user
  scrolls past one viewport height. Uses Lenis for smooth scrolling
  with native fallback. Styled entirely through biome --ds-* tokens.
expectedIntents:
  - guide-navigation
  - orient-visitor
expectedIndustryFit: []
layoutHint: single-column
propsSchema:
  $shape: zod
  shape: |
    z.object({
      ariaLabel: z.string().optional(),
    }).passthrough()
acceptedCosmicNames:
  - Daphnis
constraints: {}
```

### Mirror Quintet component

The component lives at `packages/ui/src/components/scroll-to-top/` and contains:

| File | Purpose |
| --- | --- |
| `scroll-to-top-component.astro` | Astro component: renders `<button>` with LordIcon, imports client script |
| `scroll-to-top-component.css` | Styles using `--ds-*` tokens only; `@media print` hides the button |
| `scroll-to-top-component.client.ts` | Scroll listener, Lenis/native scrollTo, LordIcon hover animation |
| `scroll-to-top-component.manifest.yaml` | Mirror Quintet manifest: id, cosmicName: Daphnis, role: scroll-to-top, archetype: scroll-to-top |
| `scroll-to-top-component.types.generated.ts` | Generated TypeScript types from manifest propsSchema |

### Component props

```ts
interface ScrollToTopProps {
  /** Accessible label for the button. Defaults to language-based fallback. */
  ariaLabel?: string;
}
```

The component accepts a single optional `ariaLabel` prop. When absent, the component reads the `lang` attribute from `<html>` and uses a built-in fallback:

- `de` → "Nach oben"
- `uk` → "Догори"
- default → "Back to top"

### Layout integration

`layout-component.astro` imports and renders `<ScrollToTop>` after the `<slot />`, before `</body>`:

```astro
import ScrollToTop from "@warpgogol/ui/components/scroll-to-top";
// ...
<slot />
<ScrollToTop />
</body>
```

No props are passed from the layout — the component is self-contained.

### Client script behaviour

1. **Visibility threshold**: The button is hidden by default (`opacity: 0; pointer-events: none`). A scroll listener checks `window.scrollY > window.innerHeight`. When the threshold is crossed, the button fades in (`opacity: 1; pointer-events: auto`). When the user scrolls back above the threshold, the button fades out.
2. **Click action**: On click, the script checks `window.wgLenis` (the shared Lenis instance). If available, calls `lenis.scrollTo(0, { immediate: prefersReducedMotion })`. If not, calls `window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' })`.
3. **prefers-reduced-motion**: Respected via `window.matchMedia('(prefers-reduced-motion: reduce)')`. When reduced motion is preferred, the scroll is instant and the visibility transition is disabled.
4. **LordIcon animation**: The button contains a `doodle-outline-272-arrow-up-hover-pointing` LordIcon. On hover, the icon's `playerInstance.playFromStart()` is called (following the header lang-switcher pattern).

### CSS design

All styling uses `--ds-*` tokens:

- Button background: `var(--ds-color-primary)` (biome brand color)
- Button icon color: `var(--ds-color-text-inverse)` (biome brandContrast)
- Button hover background: `var(--ds-color-secondary)` (biome brandHover)
- Button border-radius: `var(--ds-radius-md)`
- Position: `fixed; bottom: var(--ds-space-4); right: var(--ds-space-4); z-index: 100`
- Size: `48px x 48px` (fixed, no size prop)
- Transition: `opacity 0.3s ease, transform 0.3s ease`
- `@media print`: `display: none`

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/src/enums.ts` | Add `scroll-to-top` to `ComponentRoleValues` |
| `packages/ontology/archetypes/components/scroll-to-top.yaml` | New archetype |
| `packages/ui/src/components/scroll-to-top/scroll-to-top-component.astro` | New component |
| `packages/ui/src/components/scroll-to-top/scroll-to-top-component.css` | New styles |
| `packages/ui/src/components/scroll-to-top/scroll-to-top-component.client.ts` | New client script |
| `packages/ui/src/components/scroll-to-top/scroll-to-top-component.manifest.yaml` | New manifest |
| `packages/ui/src/components/scroll-to-top/scroll-to-top-component.types.generated.ts` | Generated types |
| `packages/ui/src/components/layout/layout-component.astro` | Import and render `<ScrollToTop>` |
| `packages/ui/src/assets/icons/lordicon/doodle-outline/doodle-outline-272-arrow-up-hover-pointing.json` | Existing LordIcon asset (no changes) |

### No new commands

This RFC does not introduce, change, or remove any Site OS commands. The component is a pure UI addition.

## Rollout

- **Default behaviour**: The component is rendered automatically by `layout-component.astro` on every page of every site. No per-site configuration, system.md entry, or shell block is required.
- **Existing sites**: All sites using the shared layout (`layout-component.astro`) get the button immediately after implementation — no migration needed. The button is biome-token-driven, so it automatically matches each site's visual identity.
- **New sites**: Automatically compliant from day one via the shared layout.
- **Print mode**: The button is hidden via `@media print` CSS — no JavaScript check needed.
- **Short pages**: The button naturally does not appear on pages shorter than one viewport because the scroll threshold (100vh) is never reached.
- **Regeneration**: After implementation, run `archetype.registry.build` to register the new archetype and cosmic name in the archetype index, then `props.types.generate` to generate the TypeScript types from the manifest.

## Alternatives considered

1. **Use an existing ComponentRole (e.g. `footer-promo` or `section-cta`)**: Rejected because it would be semantically inaccurate. The closed enum exists precisely to keep component roles meaningful, and misusing an existing role would confuse manifest validation and archetype registry lookups.

2. **Embed the logic directly in `layout-component.astro` without a separate component**: Rejected because it would violate the component decomposition pattern (DNA-17 Mirror Quintet). The layout shell's contract explicitly states it owns the HTML skeleton, not feature logic. A separate component is testable, manifestable, and replaceable.

3. **Control visibility via shell block in system.md (like header/footer)**: Rejected because it adds configuration overhead for a feature that should be universal. The operator explicitly requested automatic inclusion on all sites.

4. **Use a content-layer labels file for the aria-label**: Rejected because the button has a single static label per language. A full content-layer file would be over-engineering for one string. The component uses a built-in i18n fallback with an optional `ariaLabel` prop override.

## Risks

- **Performance**: The scroll listener runs on every scroll event. Mitigation: use `requestAnimationFrame` throttling (same pattern as the header scroll handler) and `{ passive: true }` on the scroll event listener.
- **Layout shift**: The fixed-position button does not cause layout shift. It overlays content at `z-index: 100`, below the header (`z-index: 200`).
- **Accessibility**: The button must be keyboard-accessible (`<button>` element, focusable, `aria-label` provided). The LordIcon must have `aria-hidden="true"` so screen readers do not announce the decorative icon.
- **Agent misinterpretation**: Agents might be tempted to add per-site configuration or content-layer labels. The non-goals section explicitly forbids this. The component is always present in the layout — agents must not add visibility conditions or feature-policy gates.
- **Z-index conflicts**: The button uses `z-index: 100`. If a future component uses the same z-index, there could be a stacking conflict. Mitigation: document the z-index value in the component CSS comment and in `packages/ui/AGENTS.md`.

## Acceptance criteria

- [ ] `scroll-to-top` added to `ComponentRoleValues` in `packages/ontology/src/enums.ts` (evidence: `packages/ontology/src/enums.ts:NNN`)
- [ ] Archetype YAML created at `packages/ontology/archetypes/components/scroll-to-top.yaml` with `acceptedCosmicNames: [Daphnis]` (evidence: file exists, `archetype.registry.build` exit 0)
- [ ] Mirror Quintet component created at `packages/ui/src/components/scroll-to-top/` with all 5 files (evidence: `manifest.contract.validate` exit 0)
- [ ] Component manifest has `cosmicName: Daphnis`, `role: scroll-to-top`, `archetype: scroll-to-top` (evidence: `scroll-to-top-component.manifest.yaml`)
- [ ] `layout-component.astro` imports and renders `<ScrollToTop>` after `<slot />` (evidence: `packages/ui/src/components/layout/layout-component.astro:NNN`)
- [ ] Client script uses `window.wgLenis` with native `scrollTo` fallback and respects `prefers-reduced-motion` (evidence: `scroll-to-top-component.client.ts:NNN`)
- [ ] CSS uses only `--ds-*` tokens, no raw hex/rgb (evidence: `tokens.ds.lint` exit 0, `tokens.colors.lint` exit 0)
- [ ] `@media print` hides the button (evidence: `scroll-to-top-component.css` contains `@media print` rule)
- [ ] Button appears only after `window.scrollY > window.innerHeight` (evidence: `scroll-to-top-component.client.ts` scroll threshold check)
- [ ] `archetype.registry.build` passes and registers the new archetype (evidence: command exit 0)
- [ ] `rfc.validate --id RFC-0768` passes with zero errors (evidence: command exit 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT add per-site configuration for the scroll-to-top button. The component is always rendered by the layout. Sites cannot opt out via system.md or feature policy.
- Agents MUST NOT add a content-layer labels file for the aria-label. The component uses a built-in i18n fallback with an optional `ariaLabel` prop.
- Agents MUST use the existing `doodle-outline-272-arrow-up-hover-pointing.json` LordIcon asset. Do not add a new LordIcon JSON source.
- Agents MUST follow the LordIcon hover animation pattern from `header-component.astro` (lines 472-492): check `playerInstance`, call `playFromStart()` only when `!playing`.
- Agents MUST use `requestAnimationFrame` throttling for the scroll listener, matching the header scroll handler pattern.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- After implementation, run `archetype.registry.build` and `props.types.generate` to register the archetype and generate types.
