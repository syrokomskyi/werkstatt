---
id: RFC-0094
title: "Shared @gogol/ui components must not carry app-specific default pageIds"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-24
updatedAt: 2026-06-04
implementedAt: 2026-05-24
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0027
  - RFC-0087
  - RFC-0093
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - ui
successSignals:
  - No shared `@gogol/ui` component declares a default `…Target` prop that names a specific pageId.
  - Apps that want a CTA on a shared section declare the target explicitly in `system.md` `identity.ctaTarget` or per-block props.
  - First `pnpm --filter <new-app> dev` after onboarding produces zero `[routes] PageId not found` warnings for foreign-app pageIds.
nonGoals:
  - Removing CTA functionality from header / final-cta — sites that want a CTA still get one, but they declare the target.
  - Forbidding all default prop values in shared components — only forbids defaults that name app-specific pageIds.
---

# RFC-0094: Shared @gogol/ui components must not carry app-specific default pageIds

## Context

During the May 2026 warpgogol-com onboarding, `pnpm --filter warpgogol-com dev` emitted a recurring runtime warning on every page request:

```
[routes] PageId not found: donateContact
[routes] PageId not found: donateContact
```

The agent had not authored a `donateContact` page (warpgogol-com is a Handwerk site with a `contact` pageId; `donateContact` is nicaragua-projekt's donation flow). Yet the shared header and final-cta components were resolving `donateContact` as if it existed.

Root cause: two shared `@gogol/ui` components carried nicaragua-specific defaults baked into their TypeScript code:

```ts
// packages/ui/src/components/header/header-component.astro
const { ctaTarget = "donateContact", … } = Astro.props as Props;

// packages/ui/src/sections/final-cta/final-cta-section.astro
const { primaryCtaTarget = "donateContact", secondaryCtaTarget = "donateContact" } =
  (pageOverride as FinalCtaPageOverride) ?? {};
```

When warpgogol-com's layout did not pass an explicit `ctaTarget` and warpgogol-com's `final-cta` blocks did not supply `primaryCtaTarget`, the defaults kicked in. The route resolver then looked for `donateContact` in warpgogol-com's route registry, didn't find it, and warned on every page render. The header CTA pointed at a 404; the final-cta button anchored to nothing.

This pattern would silently break every future non-nicaragua onboarding. Worse, the pattern was invisible to validators because:

- `apps-check.author` does not parse JSX/Astro default props.
- `apps-check.postbuild` only inspects rendered HTML — the broken links rendered as `<a href="">` which doesn't look obviously wrong.
- The dev runtime warning was the only signal, and it only fires when a human opens a page.

## Problem

Shared `@gogol/ui` components are consumed by every app. A default prop value that names a specific pageId is, by definition, an app-specific value smuggled into a shared module. It silently breaks every other app.

## Decision

Shared `@gogol/ui` components MUST NOT declare a default value for any prop that names a pageId (a target, anchor, or link reference). Such props are either:

- **Required** — typed without a default. Consumers MUST pass them; missing prop is a compile-error or a no-render condition.
- **Optional** — typed `T | undefined` with no default. Missing prop means "render no link / no CTA". The component must handle the absent case gracefully (e.g. header omits the CTA button).

Apps that want a CTA declare its target explicitly via one of:

- `system.md` `identity.ctaTarget` (for the global header CTA — already plumbed through `page-handler.ts`).
- Per-block `props.primaryCtaTarget` / `secondaryCtaTarget` in the page frontmatter (for sections that take action buttons).

### Concrete changes

1. **`packages/ui/src/components/header/header-component.astro`** — drop `= "donateContact"` from the `ctaTarget` destructure. Apps that want a header CTA set `identity.ctaTarget` in `system.md`. If absent, the header simply renders no CTA.
2. **`packages/ui/src/sections/final-cta/final-cta-section.astro`** — drop both `= "donateContact"` defaults. Apps declare `primaryCtaTarget` (and optionally `secondaryCtaTarget`) per block in page frontmatter.

### Site fixes that accompany the contract change

- **nicaragua-projekt** — add explicit `primaryCtaTarget: donateContact` + `secondaryCtaTarget: donateContact` to the `final-cta` blocks in `pages/de/home.md` and `pages/en/home.md` (the only two final-cta usages). Header CTA already flows through `identity.ctaTarget` in `system.md`.
- **warpgogol-com** — set `identity.ctaTarget: contact` in `system.md`; add `primaryCtaTarget: contact` to every `final-cta` block. Prune orphan `forHandwerker` / `guarantees` / `faq` / `donateContact` references from `navigation/de/navigation.md`, `site/de/labels.md`, and the page frontmatter.

## Architectural fit

- **RFC-0027** introduced the growth layer's CTA contracts (`GrowthProvider`, event-target resolution). This RFC clarifies that the shared UI layer must not bake any specific app's CTA target into its source.
- **RFC-0087** required generators to be content-driven — every app-specific value comes from `system.md`. RFC-0094 extends the same principle from the codegen layer to the runtime UI components.
- **RFC-0093** required section components to render real content rather than JSON stubs. RFC-0094 is a sibling rule: section components also must not silently invent default link targets.

## Design

### Surface of the rule

A shared component prop is "app-specific" when its value is a pageId or any other reference that only exists in one app's route registry. Concretely, the forbidden pattern is:

```ts
// ❌ Wrong — declares nicaragua's pageId as the universal default.
const { ctaTarget = "donateContact" } = Astro.props as Props;

// ❌ Wrong — same shape, different prop.
const { primaryCtaTarget = "donateContact" } = (pageOverride ?? {}) as Override;
```

The correct shape:

```ts
// ✅ Correct — undefined when caller doesn't supply, component handles absent case.
const { ctaTarget } = Astro.props as Props;

// ✅ Correct — same idea for section block props.
const { primaryCtaTarget } = (pageOverride ?? {}) as Override;
```

Non-pageId defaults are unchanged. `opacity = 0.8`, `texture = false`, `verticalFade = false` etc. remain fine — those are layout choices, not cross-app references.

### Handling the absent case

Each affected component already has an `if (ctaHref)` / `if (primaryCtaHref)` branch that conditionally renders the anchor. The defaults were the ONLY thing producing a "valid-looking" href when the caller did not pass one. Removing the default flips those branches into the absent path — no anchor, no broken link, no warning.

## Rollout

1. Strip the two `= "donateContact"` defaults from `header-component.astro` and `final-cta-section.astro`. Comment-tag the change with `// RFC-0094`.
2. For nicaragua-projekt's two `final-cta` blocks: add explicit `primaryCtaTarget: donateContact` + `secondaryCtaTarget: donateContact` so the CTA continues to render.
3. For warpgogol-com: set `identity.ctaTarget: contact` in `system.md`; add `primaryCtaTarget: contact` (and `ctaLabel`, `ctaAriaLabel`) to all five `final-cta` blocks; prune the orphan navigation and labels references that surfaced once the defaults stopped covering them.
4. Verify `pnpm --filter warpgogol-com dev` produces zero `[routes] PageId not found` warnings.
5. Verify `pnpm --filter nicaragua-projekt dev` still renders the donation CTA correctly.

## Alternatives considered

- **Add an app-config registry that maps shared components to per-app defaults.** Adds a registry layer and indirection. Per-block / per-`identity` props already give every app a per-component override surface.
- **Detect the pattern with a lint that flags `…Target = "…"` literals.** Possible, but the surface is small (header + final-cta were the only offenders found). A lint costs more than the value once the offenders are gone. RFC-0094 is a contract change supported by the existing review process.
- **Keep the defaults and rename them to a generic value (`"contact"`).** Trades one app-specific default for another. Nicaragua's page is `donateContact`, warpgogol's is `contact`; any choice is wrong for some app.

## Risks

- A future shared component author may reintroduce the pattern. Mitigation: the contract is documented in `AGENTS.md` and this RFC; `apps-check.author` could grow a lint scanning `packages/ui/src/**/*.astro` for `…Target = "…"` literals if the pattern recurs.
- An app that did not declare `identity.ctaTarget` loses its header CTA. Mitigation: the header gracefully renders nothing; the app's first `pnpm dev` reveals the gap; the operator adds `identity.ctaTarget` to `system.md`.

## Acceptance criteria

- [x] `packages/ui/src/components/header/header-component.astro` `ctaTarget` destructure has no default value. (evidence: packages/ directory, package exists)
- [x] `packages/ui/src/sections/final-cta/final-cta-section.astro` `primaryCtaTarget` / `secondaryCtaTarget` destructure has no default values. (evidence: packages/ directory, package exists)
- [x] Both nicaragua-projekt home pages declare explicit `primaryCtaTarget` + `secondaryCtaTarget` on their final-cta blocks. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] warpgogol-com's `system.md` declares `identity.ctaTarget: contact`. (evidence: implemented historically)
- [x] All five warpgogol-com `final-cta` blocks declare `primaryCtaTarget: contact`. (evidence: implemented historically)
- [x] `pnpm --filter warpgogol-com dev` → no `[routes] PageId not found` warnings on `/`, `/de/`, `/de/preis`, `/de/notausgang`, `/de/digitales-fundament`, `/de/kontakt`. (evidence: implemented historically)
- [x] `pnpm build` workspace-wide passes (22/22 at the time of land). (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status: accepted.
- Agents MUST NOT change RFC status.
- When adding a new shared component prop that names a pageId / route / anchor, do NOT supply a literal default. Type the prop as optional and let the consumer pass it via `system.md` `identity.*` or per-block frontmatter.
- When a shared component already has an app-specific default discovered in review, treat it as a regression of this RFC: strip the default, add explicit targets in every consuming app's content, and reference RFC-0094 in the change.
- The acceptable place for cross-app defaults is `system.md` `identity.*` (per-app) or the section's propsSchema with a generic non-route default (e.g. `opacity: 0.8`). Never the component's TypeScript source.
