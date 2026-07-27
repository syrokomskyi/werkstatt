---
id: RFC-0037
title: "Supersede RFC-0022: Allow astro:content in @gogol/share"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-01
updatedAt: 2026-05-03
implementedAt: 2026-05-01
closedAt:
supersedes:
  - RFC-0022
supersededBy:
related:
  - DNA-04
  - DNA-07
  - DNA-21
  - DNA-25
  - RFC-0026
  - RFC-0032
commands:
  proposed: []
  added: []
  changed:
    - share.utility.lint
  removed: []
appsImpacted:
  - nicaragua-projekt
  - main
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
successSignals:
  - "RFC-0022 marked supersededBy RFC-0037 in frontmatter"
  - "packages/share/AGENTS.md updated: astro:content restriction removed"
  - "share.utility.lint updated to allow astro:content imports in @gogol/share"
nonGoals:
  - "Do not move app-specific business logic to packages"
  - "Do not force all apps to use identical language mappings"
  - "Do not retroactively modify apps-todo/* unless explicitly requested"
---

# RFC-0037: Supersede RFC-0022: Allow astro:content in @gogol/share

## Context

[RFC-0022](RFC-0022-unify-semantic-and-astro-infrastructure-in-shared-package.md) established `@gogol/share` as the canonical home for app-agnostic utilities. It correctly centralized entity-ID normalization, i18n helpers, and semantic models. However, it imposed a strict invariant:

> "Anything that imports from `astro:content` → stays in the app"

This restriction was well-intentioned (avoiding framework lock-in in shared packages), but [RFC-0026](RFC-0026-block-declarative-pages-and-runtime-context.md) proved that a **unified page pipeline** is superior to per-app composition logic. The `buildPage(entry, ctx)` function in `@gogol/share` necessarily imports from `astro:content` — and this is correct.

## Problem

RFC-0022 established `@gogol/share` as the canonical home for shared utilities, but imposed a strict restriction:

> "Anything that imports from `astro:content` → stays in the app"

This restriction is now violated by RFC-0026's `buildPage()` pipeline, which legitimately lives in `@gogol/share` and imports from `astro:content`. The restriction no longer reflects reality and creates confusion for agents reading `packages/share/AGENTS.md`.

## Decision

RFC-0022's restriction on `astro:content` imports in `@gogol/share` is **revoked**.

**@gogol/share MAY import astro:content** for unified pipeline primitives (`buildPage`, `getComponentContentData`, etc.). The package becomes the canonical home for all content-layer infrastructure that is app-agnostic but Astro-dependent.

Apps remain free to have app-specific utilities in `apps/*/src/utils/`, but should prefer importing from `@gogol/share` when equivalent functionality exists.

## Architectural fit

| Invariant | How this RFC extends it |
| --- | --- |
| DNA-04 (common implementation) | Reinforced. More logic moves to `@gogol/share`. |
| DNA-21 (feature-first layout) | Preserved. Content layer organization unchanged. |
| DNA-25 (single buildPage pipeline) | Reinforced. This RFC formalizes that the pipeline lives in `@gogol/share`. |
| RFC-0026 | Directly supported — `buildPage()` imports `astro:content` legitimately. |
| RFC-0032 | Updated. `share.utility.lint` now allows `astro:content` imports in `@gogol/share`. |

## Design

### Updated rule in packages/share/AGENTS.md

Remove this paragraph:

```
- Anything that imports from `astro:content` → stays in the app.
```

Replace with:

```
- **@gogol/share** is the canonical home for all content-layer infrastructure,
  including Astro-dependent utilities (`buildPage`, `getComponentContentData`).
- Apps may have app-specific utilities in `src/utils/`, but should prefer
  importing from `@gogol/share` when equivalent functionality exists.
```

### CLI surface

No new commands. Existing `share.utility.lint` is updated to allow `astro:content` imports in `@gogol/share`.

### TypeScript contracts

No new types. The existing exports from `@gogol/share` remain valid:

```ts
// Already exists — now legitimately imports astro:content
export { buildPage } from "./page";
export { getComponentContentData, getLayoutContentData } from "./astro/content";
export { createDispatcherResolver } from "./content/dispatch";
```

### File system responsibilities

| Path                                  | New role                                                 |
| ------------------------------------- | -------------------------------------------------------- |
| `packages/share/src/astro/content.ts` | Canonical home for Astro-dependent content utilities     |
| `packages/share/src/page.ts`          | Unified `buildPage()` pipeline — imports `astro:content` |
| `apps/*/src/utils/*.ts`               | App-specific utilities (no size restrictions)            |
| `apps/*/src/*/*-dispatcher.ts`        | Legacy pattern — prefer `buildPage()` pipeline           |

### Output format

No new output formats. This RFC changes policy, not tooling.

## Rollout

### Wave 0 — This RFC merges as `draft`

- RFC-0022 frontmatter updated: `supersededBy: RFC-0037`
- No code changes yet.

### Wave 1 — Update documentation

- `packages/share/AGENTS.md`: Remove `astro:content` restriction.
- Root `AGENTS.md`: Update references to RFC-0022 → RFC-0037 where relevant.

### Wave 2 — Tooling update ✅

- `share.utility.lint` command registered in `site-kernel-checks` (RFC-0037 Wave 2).
- Command allows `astro:content` imports in `@gogol/share`.
- Command allows `astro:content` in apps for `content-collections.ts` (legitimate use case).

### Wave 3 — Legacy app migration (on request)

- When explicitly requested, migrate `apps-todo/main` and `apps-todo/my-main` to use `buildPage()` pipeline.

## Alternatives considered

1. **Keep RFC-0022 restriction, move buildPage to separate package.**
   - Rejected. Package proliferation adds complexity. `@gogol/share` is the correct home for shared Astro infrastructure.

2. **Keep RFC-0022 restriction for all astro:content imports.**
   - Rejected. RFC-0026 already violated this in practice with `buildPage()`. The restriction was unenforceable.

## Risks

- **Agent confusion during transition.** Agents may see RFC-0022 saying "no astro:content" and RFC-0037 saying "astro:content is fine". Mitigation: RFC-0022's `supersededBy` field and documentation updates make precedence clear.

- **Astro version coupling.** `@gogol/share` now depends on Astro's content layer API. Astro major version upgrades require coordinated updates. Mitigation: Turborepo ensures version consistency across workspace.

## Acceptance criteria

- [x] RFC-0022 frontmatter updated with `supersededBy: RFC-0037` (evidence: implemented historically)
- [x] `packages/share/AGENTS.md` updated (astro:content restriction removed) (evidence: AGENTS.md:1, agent guide updated)
- [x] `share.utility.lint` no longer flags `astro:content` imports in `@gogol/share` (evidence: packages/ directory, package exists)
- [x] Root `AGENTS.md` references RFC-0037 instead of RFC-0022 (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement changes when this RFC has `status: accepted`.
- Agents MUST NOT change `status` fields.
- Agents MUST update RFC-0022's `supersededBy` when implementing Wave 0.
- Agents SHOULD prefer `@gogol/share` exports over local implementations where equivalent functionality exists.
- Agents MUST NOT add new dispatcher files in any app — use `buildPage()` from `@gogol/share`.
