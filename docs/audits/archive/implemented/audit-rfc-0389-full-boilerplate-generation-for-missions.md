---
rfcId: RFC-0389
auditId: AUDIT-RFC-0389-01
date: 2026-07-15
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0389

## Verdict: Needs revision

The RFC correctly identifies the gap between RFC-0356 §1.1 steps 7-8 and the current stub implementation, and the proposed approach (reuse `onboarding.scaffold` pattern) is architecturally sound. However, the RFC contains a factual error about workspace dependencies and a TypeScript code snippet that would not compile against the actual `DiscoveredSiteWorkspace` interface.

## Mechanical validation (rfc.validate)

Pass — 0 violations. RFC-0389 and its amended RFC-0356 are referentially consistent.

## Axis A — Structural completeness

**Finding A-1: TypeScript code snippet uses non-existent fields on `DiscoveredSiteWorkspace`.**

The RFC's Step 2 code snippet constructs a `DiscoveredSiteWorkspace` with fields `source` and `missionId`:

```ts
const stagingSiteWorkspace: DiscoveredSiteWorkspace = {
  name: manifest.systemId,
  source: "mission",        // ← does not exist
  directory: stagingDir,
  toolsDirectory: path.join(stagingDir, "tools"),
  missionId,                // ← does not exist
  configPath: undefined,
  packageName: manifest.systemId,
};
```

The actual `DiscoveredSiteWorkspace` interface in `packages/os/site-kernel/src/types.ts:33-39` has only: `name`, `directory`, `toolsDirectory`, `configPath?`, `packageName?`. The `source` and `missionId` fields do not exist. The code snippet would not compile.

**Fix**: Remove `source` and `missionId` from the snippet, or propose extending the interface if those fields are needed for the implementation.

## Axis B — DNA alignment

No issues. The RFC correctly references DNA-47 (Materialization) in `satisfies[]` and explains how full boilerplate generation enforces the materialization contract. DNA-44 (Sternsystem bundle contract) is correctly respected — the RFC explicitly excludes runtime scripts from Sternsystem repos and generates them into the Werkstück. DNA-51 (Werkstatt consistency primitives) is preserved — staging and atomic rename are maintained.

## Axis C — Ecosystem fit

**Finding C-1: Factual error — "No new workspace dependencies are needed" is false.**

The RFC states: "No new workspace dependencies are needed — `@gogol/site-kernel-handoff` already transitively depends on both packages through the workspace."

This is incorrect. `@gogol/site-kernel-handoff` `package.json` (lines 93-99) declares dependencies only on: `@gogol/fingerprint`, `@gogol/ontology`, `@gogol/share`, `@gogol/site-kernel`, `yaml`, `zod`. It does NOT depend on:

- `@gogol/site-kernel-codegen` — needed to import `runGenerateRoutes`, `runGenerateOverlayPages`, etc.
- `@gogol/site-kernel-onboarding` — needed to read template files (unless a path-based approach is used).
- `@gogol/site-kernel-astro` — needed for `requireAstroSitePaths` (used by all codegen generators).

`@gogol/site-kernel` (which handoff depends on) does NOT re-export the codegen generator functions. The `onboarding.scaffold` imports them directly from `@gogol/site-kernel-codegen`.

**Fix**: Add `@gogol/site-kernel-codegen` and `@gogol/site-kernel-astro` to `@gogol/site-kernel-handoff` dependencies. For template access, either add `@gogol/site-kernel-onboarding` as a dependency or use a path-based `readFileSync` approach (the RFC should clarify which).

**Finding C-2: `packagesImpacted` may be incomplete.**

The RFC lists `@gogol/site-kernel-onboarding` in `packagesImpacted` but does not list `@gogol/site-kernel-astro`. If the implementation adds a dependency on `@gogol/site-kernel-astro` to `@gogol/site-kernel-handoff`, that package is impacted (new consumer).

## Axis D — Forward-only compliance

No issues. The RFC replaces stubs with full generation in a single change. No dual-path, no compatibility shim, no deprecation grace period. Existing missions must be re-materialized — the RFC states this explicitly.

## Axis E — Agent-facing policy

No issues. The RFC's status is `draft` and it contains no self-authorizing language. Implementation notes correctly reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation). The status gate is respected: "Agents MAY implement code changes ONLY when this RFC has status: accepted."

## Axis F — Pragmatism

**Finding F-1: Template access approach is ambiguous.**

The RFC says templates are read from `@gogol/site-kernel-onboarding/src/templates/` but does not specify whether this is via a workspace dependency import or a path-based `readFileSync` relative to the package directory. The `onboarding.scaffold` uses `readFileSync` with `__dirname`-relative paths (lines 64-66), which works because the templates are in the same package. `mission-materialize.ts` is in a different package (`@gogol/site-kernel-handoff`) and cannot use `__dirname`-relative paths to reach `@gogol/site-kernel-onboarding/src/templates/`.

**Fix**: Specify the template access mechanism. Options: (a) add `@gogol/site-kernel-onboarding` as a dependency and export a `readTemplate` function from it, (b) use `createRequire`/`import.meta.resolve` to locate the package directory at runtime, (c) move shared templates to a location accessible to both packages.

## Axis G — Blind spots

**Finding G-1: `kernel.wire` path resolution not fully validated.**

The RFC proposes running `kernel.wire` against the staging directory by constructing a synthetic `DiscoveredSiteWorkspace`. However, `kernel.wire` calls `resolveWirePaths` which may call `discoverSiteWorkspaces` internally. The staging directory is not in the registry or `apps/`, so normal discovery will not find it. The RFC's approach of passing an app-scoped context is correct in principle (same as `onboarding.scaffold`), but the RFC should explicitly state that `resolveWirePaths` must use `context.site.directory` directly, not re-discover.

**Finding G-2: `requireAstroSitePaths` dependency chain.**

The codegen generators call `requireAstroSitePaths(context)` from `@gogol/site-kernel-astro`, which calls `getAstroSitePathsFromApp(context.site)`. This resolves paths like `srcDirectory`, `contentDirectory`, etc. from `context.site.directory`. The RFC should confirm that these paths are correct for a staging directory that has `src/content/system.md` (copied from Sternsystem data) but may not yet have `src/pages/`, `src/styles/`, etc. (these are created by the generators). The generators should create directories as needed — the RFC should verify this.

## Questions for the author

1. How will `@gogol/site-kernel-handoff` import codegen functions — via a new workspace dependency on `@gogol/site-kernel-codegen`, or should the functions be re-exported through `@gogol/site-kernel`?

2. How will template files be accessed from `@gogol/site-kernel-onboarding` — via a workspace dependency, runtime package resolution, or should the templates be moved to a shared location?

3. Should the `DiscoveredSiteWorkspace` interface be extended with `source` and `missionId` fields to support mission-scoped contexts, or should the code snippet use only the existing fields?
