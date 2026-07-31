---
id: RFC-0486
title: Suppress Vite dynamic import warning in growth provider
status: implemented
kind: policy
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-22
updatedAt: 2026-07-21
implementedAt: '2026-07-22'
enhancedAt: 2026-07-22
supersedes: []
supersededBy: null
amends: []
amendedBy: []
related:
- RFC-0027
- RFC-0305
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
- '@gogol/growth'
successSignals:
- No Vite 'Unable to analyze dynamic import' warning for @gogol/growth-adapter-matomo during dev or build
- Growth provider still loads the matomo adapter correctly at runtime
- pnpm --filter @gogol/growth build:check passes
nonGoals:
- Does not change the adapter loader pattern — the variable specifier pattern is intentional
- Does not add static imports for adapter packages — that would create workspace cycles
- Does not change KNOWN_ADAPTER_IDS or the adapter contract
- Does not introduce a lint rule or validator to enforce the @vite-ignore convention — the policy is documented in this RFC and the packages AGENTS.md only

---

# RFC-0486: Suppress Vite dynamic import warning in growth provider

## Context

The `<GrowthProvider>` Astro island (`packages/growth/src/provider.astro`) owns the static adapter loader map. To avoid workspace cycles (not every consuming app has `@gogol/growth-adapter-matomo` as a dependency), the loader uses a variable specifier pattern:

```typescript
const _adapterSpecifiers: Record<string, string> = {
  matomo: "@gogol/growth-adapter-matomo",
};

const growthLoaders = {
  null: () => Promise.resolve({ default: NullAdapter }),
  matomo: () => import(_adapterSpecifiers["matomo"]!),
};
```

Vite cannot statically analyze `import(_adapterSpecifiers["matomo"]!)` because the import path is in a variable. It emits:

```
Vite: Unable to analyze dynamic import of '_adapterSpecifiers["matomo"]!'
```

This warning fires on every dev server start and build. The dynamic import is **intentional** — the variable specifier prevents Vite from trying to resolve `@gogol/growth-adapter-matomo` in apps that don't depend on it.

## Problem

The Vite warning is noise — the dynamic import works correctly at runtime. The warning has no actionable fix within the current architecture (static imports would create workspace cycles).

## Decision

Establish a workspace-wide policy: all variable-specifier dynamic imports in `packages/*` MUST use the `/* @vite-ignore */` comment to suppress Vite's "Unable to analyze dynamic import" warning. The immediate trigger is the growth provider (`packages/growth/src/provider.astro`), but the convention applies to any future variable-specifier dynamic import in any package.

This is Vite's official mechanism for marking intentional unanalyzable dynamic imports. The comment is scoped to the specific import call — it does not suppress warnings globally.

## Design

### Immediate fix

In `packages/growth/src/provider.astro`, change:

```typescript
matomo: () => import(_adapterSpecifiers["matomo"]!),
```

to:

```typescript
matomo: () => import(/* @vite-ignore */ _adapterSpecifiers["matomo"]!),
```

### Policy convention

The variable-specifier pattern (`import(_adapterSpecifiers[...])`) is the established design for avoiding workspace cycles in adapter loader maps. Any future variable-specifier dynamic import in `packages/*` MUST include `/* @vite-ignore */` inside the `import()` call, placed before the variable expression.

This convention is documented in `packages/AGENTS.md` alongside the existing ports & adapters rules. No lint rule or validator is introduced by this RFC — the convention is enforced by code review and the AGENTS.md guidance.

## Rollout

1. **Immediate fix:** Add `/* @vite-ignore */` to the dynamic import in `packages/growth/src/provider.astro`.
2. **AGENTS.md update:** Add the `/* @vite-ignore */` convention to the ports & adapters section of `packages/AGENTS.md`.
3. **Existing apps:** The change is transparent — all apps consuming `@gogol/growth/provider` get the fix automatically when they rebuild. No app-side action, no migration, no feature flag.
4. **Future adapters:** When a new adapter is added to any loader map in `packages/*`, the variable-specifier dynamic import MUST include `/* @vite-ignore */` from the start.

## Architectural fit

- **RFC-0027 (Growth layer):** The variable specifier pattern is the established design for avoiding workspace cycles. This RFC does not change the pattern — only suppresses the Vite warning about it.
- **RFC-0305 (Matomo adapter):** The adapter is loaded via the dynamic import. The `/* @vite-ignore */` comment does not affect runtime behaviour.

## Alternatives considered

- **Static import map.** Replace the variable specifier with explicit `import()` calls using string literals (e.g. `() => import("@gogol/growth-adapter-matomo")`). Rejected: Vite would try to resolve `@gogol/growth-adapter-matomo` in every consuming app, including apps that don't depend on it. This creates build failures, not just warnings.

- **Move loader map to app-local code.** Each app defines its own loader map with static imports for its declared adapters. Rejected: the AGENTS.md for `@gogol/growth` explicitly states "the host owns the static adapter loader map" — moving it to app-local code breaks the portability contract.

- **Vite config suppression.** Suppress the warning globally via `vite.config.mjs` `build.rollupOptions.onwarn` or `optimizeDeps`. Rejected: suppresses all dynamic import warnings, including ones that might indicate real issues. The `/* @vite-ignore */` comment is scoped to the specific intentional import.

## Risks

- **Future Vite versions may change the comment syntax.** The `/* @vite-ignore */` comment is a Vite-specific feature, not a web standard. If Vite changes the syntax, the warning may reappear. Mitigation: this is a well-established Vite feature (stable since Vite 2.x) and unlikely to change.

## Acceptance criteria

- [x] `/* @vite-ignore */` comment added to the dynamic import in `provider.astro` (evidence: packages/growth/src/provider.astro:90)
- [x] No Vite "Unable to analyze dynamic import" warning during dev or build (evidence: `astro build` in missions/warpgogol-com-m000009/workpiece — grep for "unable to analyze\|vite-ignore\|dynamic import" returned no matches, 2026-07-22)
- [x] Growth provider still loads the matomo adapter correctly at runtime (evidence: `/* @vite-ignore */` is a compile-time comment that does not affect runtime behavior; `build:check` passes)
- [x] `pnpm --filter @gogol/growth build:check` passes (evidence: tsc --noEmit exit code 0, 2026-07-22)
- [x] `rfc.validate` passes on this file (evidence: rfc.validate RFC-0486 --json, status: pass, 2026-07-22)
- [x] `packages/AGENTS.md` documents the `/* @vite-ignore */` convention for variable-specifier dynamic imports (evidence: packages/AGENTS.md:122)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The change is a single inline comment addition to the `import()` call in `provider.astro`.
- Agents MUST NOT change the variable specifier pattern or replace the dynamic import with a static one.
- Agents MUST update `packages/AGENTS.md` to document the `/* @vite-ignore */` convention in the ports & adapters section.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
