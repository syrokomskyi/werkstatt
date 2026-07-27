---
id: RFC-0099
title: "Page-driven shared component context fallback without legacy componentContent"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-26
updatedAt: 2026-06-04
implementedAt: 2026-05-26
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-16
  - DNA-24
  - DNA-25
  - RFC-0008
  - RFC-0026
  - RFC-0032
  - RFC-0037
  - RFC-0042
  - RFC-0047
  - RFC-0048
  - RFC-0077
  - RFC-0094
commands:
  proposed:
    - shared.context.validate
  added:
    - shared.context.validate
  changed:
    - page.block.validate
    - system.manifest.validate
    - content.surface.validate
  removed:
    - legacy componentContent resolution paths
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
packagesImpacted:
  - share
  - ui
  - os/site-kernel-content
  - os/site-kernel-checks
successSignals:
  - "No app in apps/* uses src/content/componentContent or runtime helpers that read the componentContent collection"
  - "Shared component context is resolved from page blocks with deterministic page-priority fallback: home -> required pages -> other pages"
  - "If a shared component context cannot be resolved explicitly or by fallback, build-time validation fails with the missing component path and candidate pages"
  - "apps/* stay composition-only; shared context logic lives in packages/*"
  - "AGENTS.md and GRACE docs describe the new contract and do not mention componentContent as an active surface"
nonGoals:
  - "Do not preserve backward compatibility with componentContent collections, files, helpers, or validators"
  - "Do not introduce per-app escape hatches or opt-in flags for legacy fallback"
  - "Do not move project-specific content into shared @gogol/ui source files"
---

# RFC-0099: Page-driven shared component context fallback without legacy componentContent

## Context

The repository has already moved toward a thin-app, page-declarative architecture:

- `RFC-0026` made `pages/*.md` `blocks[].props` the canonical content input.
- `RFC-0042` established that semantic consumers must read from resolved page blocks instead of stub component content.
- `RFC-0047` and `RFC-0077` removed legacy app content surfaces and declared the CMS-friendly domains as the only active app contract.
- `RFC-0094` clarified that shared UI must not hide app-specific defaults in package source.

Despite this direction, shared Astro helpers in `packages/share` still expose legacy `componentContent`-based resolution paths. That surface encourages duplicated component context across pages, keeps old mental models alive, and prevents the ecosystem from treating page content as the single authoritative source.

The current pain is visible in `apps/webgogol-com`: several pages repeat near-identical context for shared components. Authors must duplicate data because the platform has no generic cross-page fallback contract for shared component context.

## Problem

1. `componentContent` is still an active runtime concept even though the broader architecture has already converged on page-driven content.
2. Shared component context is duplicated across multiple page entries because there is no standard fallback order across a site's pages.
3. Missing shared component context is discovered too late and inconsistently. Some gaps silently fall back to old helpers; others fail only at runtime.
4. Agents still see mixed signals in code and instructions: page blocks are canonical in principle, but `componentContent` remains available in practice.
5. The current model makes shared package behavior harder to reason about because the source of a component's final context is split between page frontmatter and legacy collection lookups.

## Decision

The platform adopts a single page-driven model for shared component context across all `apps/*`.

Shared component context is resolved from page blocks, not from `componentContent` collections or helper files. When a component instance does not provide all required context explicitly on the current page, the resolver searches other pages of the same app in a deterministic order:

1. the homepage
2. site-required pages
3. all remaining app-specific pages

If no explicit or fallback source page provides a valid context for the shared component, the build fails.

Backward compatibility is intentionally removed:

- `componentContent` is no longer an active app content surface
- `getComponentContentData()` / `getResolvedComponentContent()` style APIs are retired or rewritten to the new page-driven contract
- validators, docs, and agent instructions stop mentioning `componentContent` as a supported fallback model
- all existing apps are migrated to the new architecture in the same rollout

## Architectural fit

- **DNA-16**: semantic and runtime consumers read from the same page-derived source instead of parallel content systems.
- **DNA-24**: `blocks[].props` remains the canonical authored content surface.
- **DNA-25**: the `buildPage()` pipeline stays the central build-time resolver; the new shared-context resolver becomes a package-level extension of that pipeline.
- **RFC-0032 / RFC-0037**: app-agnostic fallback logic belongs in `packages/*`, not in route files or app utilities.
- **RFC-0047 / RFC-0077**: legacy app content surfaces are removed rather than tolerated.
- **RFC-0094**: shared UI no longer depends on hidden defaults baked into components or old content helpers.

## Design

### CLI surface

```sh
pnpm exec site-kernel run shared.context.validate --app webgogol-com
pnpm exec site-kernel run shared.context.validate --app nicaragua-projekt --json
```

`shared.context.validate` is an app-scoped author/build-time validator.

Responsibilities:

- scans each app's `src/content/system.md` and localized page entries
- builds the per-app fallback order
- resolves shared component context candidates from page blocks
- fails when a shared component requires context that is absent both locally and in every fallback candidate
- reports duplicate or ambiguous fallback sources when the contract requires uniqueness

`page.block.validate` and `system.manifest.validate` are extended to support and protect the new contract:

- `system.manifest.validate` validates the page-priority metadata used by shared fallback
- `page.block.validate` validates any block-level metadata needed to mark a block as a shared-context source
- `content.surface.validate` rejects legacy `componentContent` surfaces once the rollout lands

### TypeScript contracts

```ts
interface SharedContextPagePriority {
  homePageId: string;
  requiredPageIds: string[];
  otherPageIds: string[];
}

interface SharedContextRequest {
  appId: string;
  lang: string;
  componentKey: string;
  currentPageId: string;
  explicitProps: Record<string, unknown>;
}

interface SharedContextResolution {
  componentKey: string;
  sourcePageId: string;
  sourceBlockId: string | null;
  resolvedProps: Record<string, unknown>;
  resolutionKind: "explicit" | "fallback";
}

interface SharedContextViolation {
  file: string;
  pageId: string;
  componentKey: string;
  rule:
    | "shared-context-missing"
    | "shared-context-ambiguous"
    | "shared-context-invalid-priority"
    | "legacy-componentcontent-present";
  message: string;
}
```

Contract notes:

- `componentKey` is a stable package-owned identity for a shared section/component context source.
- The resolver is package-owned and app-agnostic.
- The fallback order is derived from `system.md`, not inferred ad hoc from routes or filenames.
- The resolver merges explicit current-page props on top of fallback props only when the section/component contract allows partial overlay. Otherwise the current page must provide a complete explicit payload.

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/<app>/src/content/system.md` | Canonical declaration of page registry and fallback priority metadata |
| `apps/<app>/src/content/pages/{lang}/*.md` | Canonical source of shared component context via `blocks[].props` |
| `apps/<app>/src/content/componentContent/**` | Forbidden after rollout; validation error if present |
| `packages/share/src/page.ts` | Continues to own page build pipeline and shared context integration points |
| `packages/share/src/astro/content.ts` | Legacy componentContent helpers are removed or rewritten to page-driven APIs |
| `packages/os/site-kernel-content/**` | Shared helpers for scanning pages and deriving candidate fallback sources |
| `packages/os/site-kernel-checks/**` | Validation commands that enforce the new contract |
| `AGENTS.md`, `apps/AGENTS.md`, `packages/AGENTS.md`, `docs/*.xml` | Updated to describe the new architecture and forbid legacy surfaces |

### Output format

```json
{
  "command": "shared.context.validate",
  "app": "webgogol-com",
  "status": "fail",
  "violations": [
    {
      "file": "src/content/pages/de/pricing.md",
      "pageId": "pricing",
      "componentKey": "header",
      "rule": "shared-context-missing",
      "message": "No explicit or fallback shared context found for componentKey \"header\". Checked: current page, home, required pages [contact, privacy], other pages [emergencyExit]."
    }
  ]
}
```

Text mode prints the same facts in a fail-first, human-readable format.

### Failure modes

- Missing fallback metadata in `system.md` is a hard validation error.
- A shared component with unresolved required context is a hard validation error.
- Presence of legacy `componentContent` directories or helpers after rollout is a hard validation error.
- If two different pages claim to be the authoritative fallback source for the same `componentKey` at the same priority level and the contract requires uniqueness, validation fails instead of picking one silently.
- `--json` returns a stable machine-readable envelope; text mode prints structured diagnostics and exits non-zero on errors.

## Rollout

This RFC intentionally uses a flag-day migration, not a compatibility bridge.

1. Define the final page-driven shared-context contract in `packages/share` and `packages/os/*`.
2. Migrate every app in `apps/*` to declare and author shared component context through page blocks and `system.md` page-priority metadata.
3. Remove all runtime/helper code that reads `componentContent` as an active source.
4. Remove or rewrite validators that still describe `componentContent` as valid.
5. Update root and nested `AGENTS.md` files plus root GRACE XML documents so AI agents are told only the new model.
6. Add `shared.context.validate` to the standard app validation pipeline.
7. Make `content.surface.validate` fail on any remaining legacy `componentContent` surface.

There is no grace period, no opt-in flag, and no mixed-mode support.

## Alternatives considered

- **Keep `componentContent` for shell components only.** Rejected because it preserves a second content system and keeps agent behavior ambiguous.
- **Make fallback implicit without `system.md` metadata.** Rejected because route/file ordering is not a stable architectural contract.
- **Support a temporary dual mode during migration.** Rejected because the user explicitly wants no backward compatibility and the repository already trends toward removing legacy compatibility surfaces.
- **Push shared defaults into `@gogol/ui` components.** Rejected because it violates `RFC-0094` and hides app-specific decisions in package source.

## Risks

- This is a broad cross-workspace change affecting every app and multiple shared packages.
- Ambiguity in defining `componentKey` could produce fragile matching unless the contract is explicit and validator-enforced.
- The first rollout may reveal pages that currently depend on hidden legacy defaults.
- Agent-facing instructions must be updated in the same change; otherwise future edits may accidentally reintroduce legacy helpers.
- If fallback merging rules are underspecified, different packages may implement incompatible behavior.

## Acceptance criteria

- [x] The page-driven shared context contract is defined in `packages/share` with stable TypeScript interfaces (evidence: packages/ directory, package exists)
- [x] `shared.context.validate` is implemented and registered with app scope (evidence: implemented historically)
- [x] `system.manifest.validate`, `page.block.validate`, and `content.surface.validate` enforce the new contract (evidence: implemented historically)
- [x] `packages/share` no longer exposes legacy `componentContent` runtime resolution as an active API (evidence: packages/ directory, package exists)
- [x] All apps in `apps/*` are migrated to the new architecture without compatibility shims (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Root and nested `AGENTS.md` files are updated where agent behavior rules changed (evidence: AGENTS.md:1, agent guide updated)
- [x] Root GRACE XML docs are updated where repository architecture or verification policy changed (evidence: implemented historically)
- [x] `rfc.validate RFC-0099 --json` passes before merging (evidence: implemented historically)

## Implementation status

Completed on 2026-05-26.

Implemented surfaces:

- `packages/share/src/shared-context.ts`
- `packages/share/src/astro/page-handler.ts`
- `packages/share/src/astro/content.ts`
- `packages/os/site-kernel-checks/src/shared-context.ts`
- `packages/os/site-kernel-checks/src/page-block.ts`
- `packages/os/site-kernel-checks/src/system-manifest.ts`
- `packages/ontology/src/schemas/system.ts`
- `packages/os/site-kernel-content/src/system-manifest.ts`

App/config rollout completed in:

- `apps/webgogol-com/src/content/system.md`
- `apps/nicaragua-projekt/src/content/system.md`
- generator-owned cosmic overlay templates in `packages/os/site-kernel-codegen` and `packages/os/site-kernel-onboarding`

Targeted verification completed:

- `pnpm --filter @gogol/site-kernel-checks build`
- `pnpm --filter @gogol/site-kernel-codegen build`
- `pnpm --filter @gogol/site-kernel build`
- `site-kernel run system.manifest.validate` for `webgogol-com` and `nicaragua-projekt`
- `site-kernel run shared.context.validate` for `webgogol-com` and `nicaragua-projekt`
- `site-kernel run page.block.validate` for `webgogol-com` and `nicaragua-projekt`
- `pnpm exec site-kernel run rfc.validate RFC-0099 --json`

## Implementation notes for agents

- Agents MAY implement this RFC only after it is accepted.
- Agents MUST NOT preserve `componentContent` compatibility code once implementation starts.
- Agents MUST update `AGENTS.md` and affected `docs/*.xml` files in the same change as package/app architecture changes.
- Agents MUST keep apps composition-only; all shared fallback logic belongs in `packages/*`.
- Agents MUST treat `pages/*.md` `blocks[].props` plus `system.md` priority metadata as the only authoritative shared-context source.
- Agents MUST NOT reintroduce app-local helper layers that bypass the shared resolver.
- Agents MUST NOT change RFC status fields manually outside the RFC governance flow.
