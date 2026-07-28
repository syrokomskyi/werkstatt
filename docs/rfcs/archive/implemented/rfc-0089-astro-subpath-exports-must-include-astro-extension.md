---
id: RFC-0089
title: "Astro subpath exports must include .astro extension"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-23
updatedAt: 2026-06-04
implementedAt: 2026-05-24
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0027
  - RFC-0030
  - RFC-0080
commands:
  proposed:
    - astro.exports.lint
  added:
    - astro.exports.lint
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
  - warpgogol-com
packagesImpacted:
  - growth
  - ui
  - share
  - os/site-kernel-checks
successSignals:
  - Every cross-package import of a `.astro` component (e.g. `@gogol/growth/provider.astro`) resolves at build time via the package's `exports` map.
  - Vite's commonjs--resolver no longer errors with "Missing X specifier" on a freshly-scaffolded app's first `pnpm build`.
  - "`packages-check.run` flags any future `.astro` consumer import whose specifier is not in the producer's `exports`."
nonGoals:
  - Forcing or banning the .astro suffix on the consumer side — both forms work after this RFC.
  - Changing how non-.astro subpaths are declared (those keep the extensionless `./module` convention).
---

# RFC-0089: Astro subpath exports must include .astro extension

## Context

`@gogol/growth/package.json` declared `"./provider"` as the subpath export for `src/provider.astro`:

```json
"./provider": {
  "types": "./src/provider.astro",
  "default": "./src/provider.astro"
}
```

But every consumer — the scaffold template `src/pages/[lang]/[...slug].template.astro:43`, plus both live apps — imports it WITH the extension:

```ts
import GrowthProvider from "@gogol/growth/provider.astro";
```

Node and pnpm tolerate this loosely (the specifier and the key differ by exactly the file extension); Vite's `commonjs--resolver`, used by the static build path, does NOT — it requires an exact match against the `exports` map. The May 2026 warpgogol-com first build failed with:

```
[commonjs--resolver] Missing "./provider.astro" specifier in "@gogol/growth" package
```

The error is opaque (it surfaces only at build time, far from the consumer site), and it surfaced AFTER all author-phase validators were green — i.e. exactly the worst time for the agent to diagnose it.

## Problem

1. **Two-way drift between consumers and producers.** Consumer imports `.../provider.astro`; producer declares `./provider`. Both work in some tooling, neither lints against the other, and the static-build resolver eventually rejects the consumer side.
2. **Recurring on every new app.** The scaffold template ships the `.astro`-suffixed import, so every onboarded app hits the same error on its first build until growth's exports map is fixed.
3. **No workspace-level enforcement.** Nothing prevents the next `.astro`-shipping package from making the same mistake.

## Decision

Subpath exports that resolve to a `.astro` file MUST be declared under BOTH keys — extensionless AND with the `.astro` extension — pointing to the same file:

```json
"./provider": {
  "types": "./src/provider.astro",
  "default": "./src/provider.astro"
},
"./provider.astro": {
  "types": "./src/provider.astro",
  "default": "./src/provider.astro"
}
```

Rationale:

- Static-build resolvers (Vite's commonjs--resolver) need the `.astro` form.
- Some authoring tools and our own scaffold templates use the `.astro` form for clarity (it visually communicates "this is a component, not a module").
- Non-`.astro` subpaths keep their existing convention (`./adapter`, `./emit`, …) because no resolver complains.

A new `packages-check.run` lint enforces the contract: every `.astro` file referenced as a non-default `exports` value MUST also have a sibling key with the `.astro` suffix.

## Architectural fit

- **RFC-0027 (growth layer)** introduced `<GrowthProvider>` as the canonical hydration component. Its exports map was the original offender; this RFC closes the gap.
- **RFC-0030 (boilerplate)** generates the consumer import. After this RFC the template can stay on the `.astro`-suffixed form without breaking builds.
- **RFC-0080 (template suffix policy)** standardized template file naming. This RFC extends the same hygiene to subpath exports.

## Design

### Lint command

A new workspace-scope command `astro.exports.lint` scans every workspace package's `package.json`, finds every `exports` entry whose target ends in `.astro`, and asserts that the corresponding `.astro`-suffixed key is also present and points to the same file.

```sh
pnpm exec site-kernel run astro.exports.lint
```

### Output format

```
[ERROR] packages/growth/package.json — exports map declares "./provider" → src/provider.astro
        but no "./provider.astro" key. Add a sibling exports entry pointing to the same
        file so Vite's static-build resolver can resolve the .astro-suffixed import used
        by scaffold templates (RFC-0089).
```

### Failure modes

- Package has `./provider` but not `./provider.astro` → violation.
- Package has `./provider.astro` only (no extensionless form) → violation (the two MUST be aliases of the same source file in both directions).
- Package has both, pointing to different files → violation.

## Rollout

1. Add `./provider.astro` to `packages/growth/package.json` exports (the only known offender today). Done in the same change that lands this RFC.
2. Audit `packages/ui` and `packages/share` for other `.astro` exports that need the sibling key.
3. Land `astro.exports.lint`; add it to `PACKAGES_CHECK_PIPELINE`.
4. Update the scaffold template `src/pages/[lang]/[...slug].template.astro` doc-comment to call out the dual-key convention so the next contributor doesn't introduce a new offender.

## Alternatives considered

- **Drop the `.astro` extension from the consumer import.** Would force re-scaffolding every app and is contrary to the Astro community convention of suffixing component imports.
- **Use Astro's own resolver in static builds.** Not under our control; Vite is the build engine.

## Risks

- Adding two keys per `.astro` export inflates `package.json` slightly. Mitigation: lint enforces only the alias pair; no functional duplication.

## Acceptance criteria

- [x] `@gogol/growth/package.json` exports include `./provider.astro` aliasing `./provider`. — commit 2a74222e. (evidence: packages/ directory, package exists)
- [x] `astro.exports.lint` workspace command registered and wired into `PACKAGES_CHECK_PIPELINE`. — `packages/os/site-kernel-checks/src/astro-exports.ts`; registered in `module.ts:1595`, wired at `module.ts:339`. (evidence: packages/ directory, package exists)
- [x] Regression seed: a build of `apps/warpgogol-com` from a clean tree succeeds at the `[vite] commonjs--resolver` step that produced the May 2026 error. — `pnpm --filter warpgogol-com build` exits 0 with 15 pages. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Scaffold template doc-comment mentions the dual-key convention. — updated per commit 2a74222e. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status: accepted.
- Agents MUST NOT change RFC status.
- Implementation MUST run `pnpm --filter warpgogol-com build` end-to-end and confirm the previous `Missing "./provider.astro" specifier` error no longer surfaces.
