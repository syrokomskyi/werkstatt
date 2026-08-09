---
id: RFC-0077
title: "Remove legacy app compatibility surfaces from CMS-friendly onboarding"
status: implemented
kind: deprecation
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-18
updatedAt: 2026-05-18
implementedAt: 2026-05-18
closedAt:
supersedes:
  - RFC-0033
supersededBy:
related:
  - RFC-0023
  - RFC-0025
  - RFC-0037
  - RFC-0047
  - RFC-0048
  - RFC-0072
  - RFC-0075
  - RFC-0076
commands:
  proposed: []
  added: []
  changed:
    - system.manifest.validate
    - content.surface.validate
    - mirror.triad.validate
    - mirror.quartet.validate
    - dispatcher.sync.validate
    - route.thin.validate
    - apps-check.run
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel-checks
  - os/site-kernel-content
  - share
  - ui
successSignals:
  - src/content/system.md is the only supported app system manifest; app-level system.yaml is rejected
  - Legacy app-local content component, section, feature, and dispatcher surfaces are removed from active validation paths
  - Route validation uses system.md pages[].routes as the canonical route registry, not routeSlug compatibility fields
  - New and old client apps follow the same CMS-friendly content surface without backcompat branches
  - Agents can onboard or modernize a client without deciding which legacy structure still applies
nonGoals:
  - Preserving old app-local component content structures
  - Maintaining one-release compatibility aliases for removed app content contracts
  - Removing historical RFC documents or .agents reference material
---

# RFC-0077: Remove legacy app compatibility surfaces from CMS-friendly onboarding

## Context

The Turborepo has moved toward a CMS-friendly, thin-app architecture: deployable apps compose content and configuration while reusable logic lives in `packages/*`. RFC-0047 establishes the current app content surface, and the root `AGENTS.md` states that apps should not contain legacy `components/`, `sections/`, or `features/` content folders after migration.

Several validators and module contracts still tolerate older app structures. Examples include `system.yaml` fallback behavior, `src/content/components/{lang}` mirror checks, app-local component schemas, and dispatcher synchronization for legacy component content. These compatibility paths make agent behavior ambiguous and encourage old structures to survive.

The project no longer needs backward compatibility for those surfaces.

## Problem

1. **Legacy manifest support obscures the source of truth.** Some code still documents or accepts `apps/<app>/system.yaml` even though the active contract is `apps/<app>/src/content/system.md`.
2. **Legacy component-content validators conflict with RFC-0047.** Validators still reference `src/content/components`, `schemas/components`, and `components-dispatcher.ts` paths that are not part of the CMS-friendly content surface.
3. **Backcompat branches increase agent uncertainty.** AI agents may preserve or revive deprecated paths because validators still mention them as acceptable.
4. **Thin app boundaries are weakened.** App-local component schema compatibility suggests that component contracts may still live in apps rather than packages.
5. **Route compatibility fields compete with canonical routes.** Any remaining `routeSlug`-style assumptions should be replaced by `system.md pages[].routes`.

## Decision

The repository removes active support for legacy app compatibility surfaces. The canonical app contract is:

- `apps/<app>/src/content/system.md` for the system manifest
- RFC-0047 content domains only:
  - `pages/{lang}`
  - `prose/{lang}`
  - `business/{lang}`
  - `navigation/{lang}`
  - `site/{lang}`
- package-owned components, sections, validators, and runtime logic under `packages/*`
- `system.md pages[].routes` as the canonical route registry

Validators must fail on legacy app surfaces instead of accepting or silently ignoring them.

## Architectural fit

- **RFC-0023 / RFC-0025.** Cosmic and manifest-driven component/section catalogs remain package-owned, not app-local compatibility structures.
- **RFC-0037.** The thin-app mandate becomes stricter by eliminating app-local compatibility branches.
- **RFC-0047.** This RFC operationalizes the CMS-friendly content surface as the only active app content contract.
- **RFC-0048.** Localized route resolution should use stable page IDs and language-keyed route maps, not legacy route slugs.
- **RFC-0076.** Phase outputs can target one app shape without branching around deprecated structures.

## Design

### CLI surface

No new commands are introduced. Existing validators change behavior:

```sh
pnpm exec werkstatt run system.manifest.validate --app <id>
pnpm exec werkstatt run content.surface.validate --app <id>
pnpm exec werkstatt run apps-check.run --app <id>
```

The following command families must stop accepting legacy app structures:

- `system.manifest.validate`
- `content.surface.validate`
- `mirror.triad.validate`
- `mirror.quartet.validate`
- `dispatcher.sync.validate`
- route-related validators such as `route.thin.validate`

If a legacy-only validator has no modern purpose after cleanup, it should be removed from active pipelines rather than retained as a no-op.

### TypeScript contracts

```ts
export interface ModernAppContentSurface {
  systemManifest: "src/content/system.md";
  domains: ["pages", "prose", "business", "navigation", "site"];
  forbiddenDomains: ["components", "sections", "features", "layouts"];
}

export interface LegacySurfaceViolation {
  ruleId:
    | "legacy.system-yaml"
    | "legacy.content-components"
    | "legacy.content-sections"
    | "legacy.content-features"
    | "legacy.component-dispatcher"
    | "legacy.app-local-component-schema"
    | "legacy.route-slug-canonical";
  severity: "error";
  file: string;
  message: string;
}
```

### File system responsibilities

| Path | New behavior |
| --- | --- |
| `apps/<app>/src/content/system.md` | Required canonical system manifest. |
| `apps/<app>/system.yaml` | Forbidden; validation error if present. |
| `apps/<app>/src/content/components/**` | Forbidden; validation error if present. |
| `apps/<app>/src/content/sections/**` | Forbidden; validation error if present. |
| `apps/<app>/src/content/features/**` | Forbidden; validation error if present. |
| `apps/<app>/src/content/layouts/**` | Forbidden unless a future accepted RFC reintroduces it. |
| `apps/<app>/src/content/schemas/components/**` | Forbidden as an app-local component schema compatibility path. |
| `apps/<app>/src/content/schemas/components-dispatcher.ts` | Forbidden as a legacy dispatcher surface. |
| `packages/ui/src/**` | Canonical implementation home for UI sections/components. |
| `packages/share/src/page.ts` | Canonical cosmic import map surface. |

### Output format

Existing command envelopes remain. Legacy-surface findings are emitted as errors.

```json
{
  "ruleId": "legacy.system-yaml",
  "severity": "error",
  "file": "apps/example/system.yaml",
  "message": "apps/<app>/system.yaml is no longer supported; use src/content/system.md."
}
```

### Failure modes

- If `system.yaml` exists, `system.manifest.validate` fails.
- If `src/content/system.md` is missing, `system.manifest.validate` fails.
- If forbidden legacy content directories exist, `content.surface.validate` fails.
- If a validator still needs old paths to function, the implementation must either migrate the validator to modern paths or remove it from active pipelines.
- No compatibility warnings or grace-period aliases are introduced.

## Rollout

1. Remove `system.yaml` fallback logic and update module contracts/error messages.
2. Make `content.surface.validate` fail hard on forbidden legacy directories and legacy app-local component schema surfaces.
3. Remove or modernize mirror and dispatcher validators that only apply to pre-RFC-0047 app-local component content.
4. Replace remaining route slug assumptions with `system.md pages[].routes`.
5. Update `APPS_CHECK_PIPELINE` to contain only modern validators.
6. Update root/app/package `AGENTS.md` and GRACE documents where the supported app surface is described.
7. Run `apps-check.run --app nicaragua-projekt` and `app.contract.full --app nicaragua-projekt` as the reference validation.

## Alternatives considered

- **Keep compatibility warnings for one release.** Rejected because the project explicitly does not need backward compatibility for legacy app structures.
- **Leave legacy validators as no-ops.** Rejected because no-op validators mislead agents and humans into thinking a contract is still enforced.
- **Support both `system.yaml` and `system.md`.** Rejected because two manifest sources create ambiguity and drift.

## Risks

- **Some historical or experimental apps may fail immediately.** This is acceptable; they should be migrated or archived rather than preserved through active compatibility paths.
- **Removing validators may uncover hidden dependencies.** Mitigated by doing the cleanup in small commits and running package/app checks after each validator family.
- **Agents may delete reference material.** Mitigated by explicitly keeping historical `.agents/**`, `spec/**`, and `todo/**` as reference unless a task targets them.

## Acceptance criteria

- [x] `system.manifest.validate` requires `src/content/system.md` and fails if app-level `system.yaml` exists. (evidence: implemented historically)
- [x] Active validators no longer load or document `apps/<app>/system.yaml` as a supported manifest. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `content.surface.validate` fails on `src/content/components`, `src/content/sections`, `src/content/features`, and app-local component schema/dispatcher compatibility paths. (evidence: implemented historically)
- [x] Legacy mirror/dispatcher validators are either migrated to modern package/content contracts or removed from active app pipelines. (evidence: implemented historically)
- [x] Route validators use `system.md pages[].routes` as the canonical route registry. (evidence: implemented historically)
- [x] `APPS_CHECK_PIPELINE` contains no legacy-only validation step. (evidence: implemented historically)
- [x] Root and scoped `AGENTS.md` files describe only the modern CMS-friendly app surface. (evidence: AGENTS.md:1, agent guide updated)
- [x] GRACE XML documents are synchronized with the removed compatibility surfaces. (evidence: implemented historically)
- [x] `apps-check.run --app nicaragua-projekt` passes after cleanup. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes for this RFC only after a human changes `status` to `accepted`.
- Agents MUST NOT change RFC status fields.
- Agents MUST NOT preserve compatibility aliases, warning-only modes, or fallback loaders for the legacy surfaces named by this RFC.
- Agents MUST prefer deleting obsolete validation branches over retaining no-op compatibility code.
- Agents MUST update GRACE documents and active `AGENTS.md` guidance when removing supported surfaces.
- Agents MUST ignore historical reference folders unless the task explicitly asks to migrate or delete them.
