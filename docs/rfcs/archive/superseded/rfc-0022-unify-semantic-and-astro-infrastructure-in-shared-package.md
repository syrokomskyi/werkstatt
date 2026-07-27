---
id: RFC-0022
title: "Unify Semantic and Astro Infrastructure in @gogol/share"
status: superseded
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-23
updatedAt: 2026-06-04
implementedAt: 2026-04-24
closedAt: 2026-05-01
supersedes: []
supersededBy: RFC-0037
related:
  - DNA-04
  - RFC-0008
  - RFC-0012
  - RFC-0021
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
  - main
packagesImpacted:
  - "@gogol/share"
successSignals:
  - Zero duplication of semantic models and extraction logic between apps
  - Build check passes for all apps using shared utilities
  - AI agents utilize shared package instead of local re-implementations
nonGoals:
  - Do not move project-specific CSS or brand styles to shared package
  - Do not create new packages in packages/ for these utilities
---

# RFC-0022: Unify Semantic and Astro Infrastructure in @gogol/share

## Context

The WGogol platform is maturing into a monorepo where multiple applications (e.g., `nicaragua-projekt`, `main`) share the same "Site OS" architectural principles. Currently, high-value logic for semantic data modeling, markdown extraction, JSON-LD generation, and localized middleware is duplicated or thin-proxied in each application. This leads to maintenance drift and forces AI agents to "re-invent" or copy complex logic when creating new sites.

## Problem

- **Semantic Models**: `SemanticPageModel`, `SemanticOrganization`, and other core types are defined locally in `src/semantic/models.ts`.
- **Extraction Logic**: Regex-based extraction of people, initiatives, and contact data from markdown (`src/semantic/extract.ts`) is largely identical across apps but lives in app space.
- **JSON-LD Construction**: The logic for building Schema.org graphs is complex and currently resides in `src/semantic/jsonld/`.
- **Astro Content Helpers**: Utilities like `getComponentContent` and `getLayoutContent` are duplicated or re-implemented.
- **Middleware**: Language redirection and other SEO-critical middleware are copied between projects.

## Decision

The `@gogol/share` package is promoted to be the canonical home for all app-agnostic platform intelligence.

1.  **Astro Dependency**: `@gogol/share` gains `astro` and `astro:content` awareness to host shared content retrieval utilities.
2.  **Semantic Centralization**: All types from `src/semantic/models.ts` and generic extractors from `src/semantic/extract.ts` move to `@gogol/share/semantic`.
3.  **JSON-LD Factory**: The JSON-LD graph construction logic moves to `@gogol/share/semantic/jsonld`.
4.  **Middleware Library**: Common middleware (e.g., language redirection) moves to `@gogol/share/middleware`.
5.  **Agent Instruction**: Root `AGENTS.md` and app-specific `AGENTS.md` are updated to enforce usage of these shared elements.

## Architectural fit

- **Architecture DNA**: Enforces **DNA-04** (Common implementation for entity-ID and content handling).
- **Site OS Operator Model**: Simplifies app creation by providing a "pre-packaged" semantic layer.
- **Scaling Playbook**: Essential for Stage 4 (Monorepo efficiency) where multiple apps must share a single source of truth for platform behavior.

## Design

### TypeScript contracts

New exports in `@gogol/share`:

```ts
// @gogol/share/semantic
export * from "./models";
export * from "./extract";
export * from "./jsonld";

// @gogol/share/astro
export { getComponentContent, getLayoutContent, validateEntryData } from "./content";

// @gogol/share/middleware
export { createLanguageRedirectMiddleware } from "./language-redirect";
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/semantic/` | Canonical home for all semantic types and extractors |
| `packages/share/src/middleware/` | Canonical home for shared middleware |
| `packages/share/src/astro/` | Canonical home for Astro-dependent content utilities |
| `apps/*/src/semantic/` | Becomes a collection of thin proxies or app-specific extensions |
| `apps/*/src/middleware.ts` | Imports shared logic from @gogol/share |

## Rollout

1.  **Draft RFC**: Submit for architectural review.
2.  **Infrastructure Migration**: Add `astro` dependency to `@gogol/share` and move the code.
3.  **App Refactoring**: Update `nicaragua-projekt` to use shared exports.
4.  **Documentation Update**: Update `AGENTS.md` across the repo.
5.  **Validation**: Run `pnpm build:check` to ensure no regression.

## Alternatives considered

- **Create `@gogol/site-kernel-semantic`**: Rejected to avoid package proliferation. The user explicitly requested to consolidate in `@gogol/share`.
- **Keep Astro utilities out of `@gogol/share`**: Rejected because many content utilities are fundamentally tied to how Astro handles collections, and separation would create awkward abstractions.

## Risks

- **Astro Version Lock**: `@gogol/share` becomes tied to a specific Astro version. Mitigated by using peer dependencies or keeping Astro versions synced in the monorepo.
- **Circular Dependencies**: Care must be taken not to import app-specific types back into the shared package.

## Acceptance criteria

- [x] `@gogol/share` contains `semantic`, `middleware`, and `astro` sub-modules. (evidence: packages/ directory, package exists)
- [x] `nicaragua-projekt` build check passes using shared utilities. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `AGENTS.md` contains explicit instructions to prefer `@gogol/share`. (evidence: AGENTS.md:1, agent guide updated)
- [x] No hardcoded app-specific strings (like "Nicaragua-Projekt") exist in shared extractors. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST NOT re-implement semantic extraction logic in `apps/*` if a suitable utility exists in `@gogol/share`.
- When adding a new page type, agents MUST first check if the model needs to be added to `@gogol/share/semantic/models`.
- Agents MUST use the shared `getComponentContent` and `getLayoutContent` helpers from `@gogol/share/astro`.
- Agents MUST NOT move CSS styles to `@gogol/share` under this RFC.
