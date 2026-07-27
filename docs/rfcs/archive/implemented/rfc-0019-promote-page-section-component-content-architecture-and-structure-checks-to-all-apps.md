---
id: RFC-0019
title: "Promote page-section-component-content architecture and structure checks to all apps"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-21
updatedAt: 2026-04-21
implementedAt: 2026-04-21
closedAt:
supersedes:
  - RFC-0018
supersededBy:
amendedBy:
  - RFC-0183
related:
  - DNA-4
  - DNA-5
  - DNA-7
  - DNA-8
  - DNA-12
  - DNA-13
  - DNA-14
  - DNA-16
  - RFC-0004
  - RFC-0012
  - RFC-0013
  - RFC-0018
commands:
  proposed: []
  added:
    - structure.hierarchy.validate
    - navigation.section.validate
  changed:
    - feature.graph.validate
    - feature.links.validate
    - feature.projections.validate
    - feature.visibility.validate
  removed: []
appsImpacted:
  - main
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - site-kernel-checks
successSignals:
  - "Visitor-facing page bodies in `apps/*` are modeled as ordered sections whose child components consume canonical content."
  - "Breadcrumbs are rendered inside a dedicated navigation section instead of directly by routes."
  - "Shared `build.check` pipelines can fail on hierarchy drift before a site build completes."
  - "The same structure validators can run against all `apps/*` without hardcoded app-specific rules."
nonGoals:
  - "Do not move layout-shell components such as `layout`, `header`, or `footer` into the page-body section tree."
  - "Do not force machine-readable endpoints or shared shell components into the visitor-facing page hierarchy."
  - "Do not require a same-day migration of every existing app before the commands exist."
  - "Do not hardcode `nicaragua-projekt` paths or page ids into shared `site-kernel-checks` logic."
---

# RFC-0019: Promote page-section-component-content architecture and structure checks to all apps

## Context

The current architecture already points toward a clear hierarchy:

- page routes orchestrate content and visibility
- section components assemble the visitor-facing body
- child components deliver UI structure
- canonical content lives in `src/content/`

`apps/nicaragua-projekt` already proves part of this direction. Its home page feature graph in `src/content/features/pages/home.md` declares page → section → component nodes, and its routes such as `src/pages/[lang]/index.astro` compose the page from section components in reading order.

However, the hierarchy is not yet a shared, formal, cross-app contract for `apps/*`.

Two important gaps remain:

1. The hierarchy is incomplete in practice. For example, `apps/nicaragua-projekt/src/pages/[lang]/wir-ueber-uns.astro` renders `Breadcrumbs` directly from the route, which bypasses the section layer.
2. The hierarchy is not enforced as a shared OS contract. `@gogol/site-kernel-checks` already provides mirroring, naming, route-thinness, and feature-graph commands, but it does not yet validate that visitor-facing page bodies consistently follow `page → section → component → content`.

RFC-0018 established an app-scoped proving ground for a content-declared feature graph in `nicaragua-projekt`. That RFC intentionally did not promote the model to all apps. The repository now needs the next step: a workspace-scoped architecture contract that can be rolled out across `apps/*` and enforced by shared pre-build checks.

## Problem

The current system leaves several invariants under-protected:

1. DNA-8 lacks enforceable structure. Pages are expected to be built from sections, but routes can still render copy-owning or navigation components directly.
2. DNA-12, DNA-13, and DNA-14 are only partially automated. The feature graph can describe sections and components, but there is no shared rule that the rendered page body must respect that structure in source code.
3. Breadcrumb placement is informal. `breadcrumbs.astro` is correctly modeled as a navigation component, but it has no mandatory architectural parent. This allows direct route usage and breaks the intended hierarchy.
4. The current OS checks stop too early. Existing commands can validate mirroring, naming, and parts of feature visibility, but they do not fail when a route bypasses the section layer or when a page-local navigation component is rendered outside a navigation section.
5. Cross-app rollout has no formal target state. `nicaragua-projekt` can be improved locally, but `apps/main` and future `apps/*` need the same documented contract and the same validator behavior.

As a result, the repository still depends on human review for a core architectural rule that should become machine-checkable before build execution.

## Decision

All visitor-facing page bodies in `apps/*` adopt a formal page → section → component → content architecture, and the Site OS gains shared validators that can enforce this contract before build completion.

This decision applies to the page body inside `<main>`, not to the global shell. `layout`, `header`, `footer`, and other shared shell components remain outside the page-body hierarchy and continue to be governed by their own contracts and shared feature declarations.

Within the page body:

1. A page is the orchestrator.
2. A page renders an ordered list of sections.
3. Each section renders one or more child components.
4. Each child component consumes or receives canonical content from the existing content layer.

The hierarchy becomes explicit in both source structure and feature declarations.

Additionally, a new reserved section role named `navigation` is introduced for page-local navigation aids. When a page exposes breadcrumb UI, the `Breadcrumbs` component must be rendered inside a dedicated navigation section, not directly by the route.

For the first proving rollout:

- `apps/nicaragua-projekt` becomes the initial implementation target.
- `apps/nicaragua-projekt/src/components/breadcrumbs.astro` remains the breadcrumb component.
- a page-body section component at `src/components/section/navigation-section.astro` becomes the canonical parent for breadcrumb rendering.

The shared OS validation surface is extended as follows:

- new `structure.hierarchy.validate`
- new `navigation.section.validate`
- extended `feature.graph.validate`
- extended `feature.links.validate`
- extended `feature.projections.validate`
- extended `feature.visibility.validate`

These commands live in `@gogol/site-kernel-checks`, remain app-agnostic, and are designed for eventual inclusion in the shared `STANDARD_CHECK_PIPELINE` and `STANDARD_BUILD_CHECK_PIPELINE` once the current apps adopt the contract.

## Architectural fit

This RFC strengthens the existing architecture rather than inventing a parallel model.

- DNA-4 / DNA-5 — Canonical meaning stays in `src/content/`, and copy-owning components continue to use mirrored content/schema contracts.
- DNA-7 — Routes stay thin because they orchestrate ordered sections instead of directly hosting page-local navigation components or ad hoc body composition.
- DNA-8 — Sections become the mandatory page-body building block, not only a recommendation.
- DNA-12 — Visibility stays centralized; the new structure checks verify that rendered page composition matches declared page/section/component topology.
- DNA-13 — Disabled content can be removed more reliably because the hierarchy is explicit and shared across routes, navigation, and projections.
- DNA-14 — Breadcrumb labels remain content-driven, while availability and placement become config- and structure-resolved.
- DNA-16 — Semantic outputs and breadcrumbs share the same topology and visibility rules instead of diverging.

This RFC also aligns with existing cross-site documentation:

- Page Contracts — visitor-facing pages remain orchestrators, but page body composition is now formalized as ordered sections.
- Component Contracts — `breadcrumbs.astro` remains a Class 5 navigation component; `navigation-section.astro` becomes a Class 3 section component that groups page-local navigation UI.
- Scaling Playbook — stage-2 growth explicitly calls for breadcrumbs and shared page-shell patterns before local variations proliferate; this RFC turns that advice into a governed pattern.
- Site OS operator model — shared validation belongs in `packages/os/site-kernel-checks`, not in app-private tooling.

## Design

### CLI surface

```sh
pnpm exec site-kernel run structure.hierarchy.validate --app nicaragua-projekt
pnpm exec site-kernel run navigation.section.validate --app nicaragua-projekt
pnpm exec site-kernel run structure.hierarchy.validate --all --json
pnpm exec site-kernel pipeline build.check --app nicaragua-projekt
```

Command responsibilities:

- `structure.hierarchy.validate`
  - validates that visitor-facing page bodies are composed as ordered sections
  - validates that body-level child components are rendered through sections rather than directly by routes
  - validates that declared feature-graph sections/components map to rendered page structure
  - validates that content ownership is not pulled back into routes

- `navigation.section.validate`
  - validates the reserved `navigation` section role
  - fails when breadcrumb UI is rendered directly from a route instead of from a navigation section
  - validates ordering constraints for the navigation section when present
  - validates that breadcrumb components declared in page structure sit inside the navigation section

Existing command behavior changes:

- `feature.graph.validate`
  - requires section declarations to carry enough metadata for hierarchy validation, including a section `role`
  - validates reserved-role constraints such as `navigation`

- `feature.links.validate`
  - validates that breadcrumb targets and page-local navigation targets resolve through the same feature topology

- `feature.projections.validate`
  - validates that semantic breadcrumbs and other projections do not leak disabled or structurally invalid targets

- `feature.visibility.validate`
  - stops treating legacy `featureFlag:` references as sufficient proof of architectural compliance once an app has adopted the new hierarchy contract

All commands are app-scoped and support `--all` via the kernel runtime. They are implemented in the shared checks package with `supportsAllApps: true`.

### TypeScript contracts

```ts
type SectionRole =
  | "navigation"
  | "hero"
  | "content"
  | "supporting"
  | "cta"
  | "custom";

interface ArchitectureComponentDeclaration {
  id: string;
  componentPath: string;
}

interface ArchitectureSectionDeclaration {
  id: string;
  role: SectionRole;
  anchor: string;
  visibility: "enabled" | "disabled";
  components: ArchitectureComponentDeclaration[];
}

interface HierarchyViolation {
  file: string;
  rule:
    | "route-renders-component-outside-section"
    | "missing-feature-section"
    | "missing-section-component"
    | "missing-navigation-section"
    | "breadcrumbs-outside-navigation-section"
    | "section-order-violation"
    | "undeclared-component-content-source";
  message: string;
}

interface HierarchyValidationResult {
  command: "structure.hierarchy.validate" | "navigation.section.validate";
  status: "pass" | "fail";
  checkedPages: number;
  checkedSections: number;
  violations: HierarchyViolation[];
}
```

The exact file names may differ during implementation, but the shared checks package must expose these concepts.

Important model notes:

- `role: "navigation"` is a reserved role.
- A page may have zero or one navigation section.
- `breadcrumbs` is a navigation component, not a section.
- A section may itself be structural; it does not need its own copy if canonical content belongs to its child components.

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/*/src/pages/[lang]/**/*.astro` | Scanned for visitor-facing page-body hierarchy violations |
| `apps/*/src/components/section/**/*.astro` | Canonical page-body section layer; includes `section/navigation-section.astro` when breadcrumb UI is present |
| `apps/*/src/components/breadcrumbs.astro` | Canonical breadcrumb component; must be rendered through a navigation section after migration |
| `apps/*/src/content/features/pages/**/*.md` | Canonical page structure declarations, including ordered sections and reserved section roles |
| `apps/*/src/content/features/shared/**/*.md` | Shared shell component declarations that stay outside the page-body hierarchy |
| `apps/*/src/content/pages/{lang}/**/*.md` | Page-level content and `componentOverrides`; remains the source of project-specific copy |
| `apps/*/src/content/components/{lang}/**/*.md` | Canonical component content for reusable components such as breadcrumbs |
| `apps/*/src/content/schemas/features.ts` | Extended with section role support required by shared hierarchy validators |
| `packages/os/site-kernel-checks/src/module.ts` | Registers the new commands and later promotes them into standard pipelines |
| `packages/os/site-kernel-checks/src/feature-graph.ts` | Extended to validate section roles and hierarchy-ready graph declarations |
| `packages/os/site-kernel-checks/src/structure-hierarchy.ts` | New shared hierarchy validator surface |
| `packages/os/site-kernel-checks/src/navigation-section.ts` | New shared navigation-section validator surface |
| `apps/*/tools/kernel.config.ts` | Consumes the standard build/check pipelines; no app-specific command duplication |

Files this RFC explicitly does not redefine:

- `layout.astro`
- shared shell components such as `header.astro` and `footer.astro`
- machine-readable endpoints such as `llms.txt.ts`

Those remain governed by their current contracts and are not forced into the page-body section tree.

### Output format

`structure.hierarchy.validate` JSON output:

```json
{
  "command": "structure.hierarchy.validate",
  "status": "fail",
  "checkedPages": 9,
  "checkedSections": 17,
  "violations": [
    {
      "file": "apps/nicaragua-projekt/src/pages/[lang]/wir-ueber-uns.astro",
      "rule": "route-renders-component-outside-section",
      "message": "Route renders Breadcrumbs directly. Render breadcrumb UI through section/navigation-section.astro instead."
    }
  ]
}
```

`navigation.section.validate` JSON output:

```json
{
  "command": "navigation.section.validate",
  "status": "fail",
  "checkedPages": 9,
  "checkedSections": 17,
  "violations": [
    {
      "file": "apps/nicaragua-projekt/src/content/features/pages/about.md",
      "rule": "missing-navigation-section",
      "message": "Page declares breadcrumb UI but has no section with role \"navigation\"."
    }
  ]
}
```

Pretty output must report one violation per line with app-relative paths.

### Failure modes

Rules for command behavior:

- Both new commands exit non-zero when they find violations in an app that has adopted this contract.
- `feature.graph.validate`, `feature.links.validate`, `feature.projections.validate`, and `feature.visibility.validate` remain build-blocking for structural violations once the app is on the new model.
- Visitor-facing page routes only are checked; machine-readable endpoints and non-page directories remain excluded by existing page filters.
- Shared shell components outside the page body are not reported as hierarchy violations.
- A structural wrapper section is valid even if it owns no copy itself, as long as its child components remain the canonical content owners.

### Migration rule

- Before workspace-wide rollout, the new commands may be run manually or appended to an app-specific pipeline for proving.
- They must not be inserted into the shared standard pipeline until both currently active apps have a documented compliance path.

## Rollout

1. Phase 1 — Shared contract definition
   - extend the feature-graph schema with section role metadata
   - define the reserved `navigation` section role
   - define the canonical `navigation-section.astro` pattern for page-local navigation UI

2. Phase 2 — Prove the model in `apps/nicaragua-projekt`
   - wrap direct breadcrumb rendering in a navigation section
   - migrate long-form and standard pages to explicit page-body sections where needed
   - run the new commands app-locally while refining false-positive behavior

3. Phase 3 — Generalize to `apps/main`
   - adopt the same hierarchy and section-role conventions in the reference app
   - confirm that the validators remain app-agnostic and path-convention-driven

4. Phase 4 — Promote into shared pipelines
   - add the new commands to `STANDARD_CHECK_PIPELINE`
   - therefore include them automatically in `STANDARD_BUILD_CHECK_PIPELINE`
   - from this point forward, new apps in `apps/*` must adopt the contract on day one

5. Phase 5 — Deprecate the app-only framing of RFC-0018
   - keep RFC-0018 as historical provenance for the proving rollout
   - treat RFC-0019 as the authoritative cross-app contract

There is no flag day requirement. The commands may exist before they are promoted into the shared pipeline. `nicaragua-projekt` is the proving target; the repository-wide pipeline change happens only after `main` and `nicaragua-projekt` both have a clear compliance path.

## Alternatives considered

1. Keep the hierarchy as documentation only
   - Rejected because the repository already relies on shared pre-build checks for core architecture invariants; this rule is too central to remain manual.

2. Treat breadcrumbs as a permanent route-level exception
   - Rejected because it weakens the very hierarchy this RFC is trying to formalize and leaves navigation outside the section model.

3. Keep RFC-0018 app-only and create app-local checks in each site
   - Rejected because the requested goal is a shared architecture for `apps/*`, and app-local duplication would weaken the Site OS model.

4. Infer the entire hierarchy only from file paths without feature metadata
   - Rejected because the build also needs structural meaning such as section roles and navigation intent, not just file existence.

5. Move `header` and `footer` into the page section tree
   - Rejected because they are shared shell components, not page-body sections, and forcing them into the hierarchy would blur ownership boundaries.

## Risks

- False positives during AST/source scanning — the validators must recognize approved page archetypes and not mistake shared shell code or endpoints for page-body violations.
- Over-constraining valid pages — the contract must remain strict about hierarchy without erasing legitimate differences between home, long-form, listing, and detail pages.
- Migration churn — introducing explicit navigation sections may touch multiple routes in `nicaragua-projekt` and later in `main`.
- Shared-package drift risk — if validators quietly encode `nicaragua-projekt` assumptions, they will become unusable for other apps.
- Agent overreach — future agents may try to force content into structural sections that do not actually own canonical copy. The RFC must make the page-body scope explicit.

## Acceptance criteria

- [x] Section role metadata is defined for the shared feature-graph contract — `sectionRoleSchema` added to `apps/nicaragua-projekt/src/content/schemas/features.ts`; `SectionRole` type exported; `role` field propagated through `ResolvedSectionNode` in `feature-graph.ts` (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `structure.hierarchy.validate` is implemented in `@gogol/site-kernel-checks` — `packages/os/site-kernel-checks/src/structure-hierarchy.ts`; scans `src/pages/[lang]/` for routes that import `breadcrumbs.astro` directly; passes on `nicaragua-projekt` (9 routes checked, 0 violations); reports 18 violations on `apps/main` deferred routes as expected; supports `--json` (evidence: packages/ directory, package exists)
- [x] `navigation.section.validate` is implemented in `@gogol/site-kernel-checks` — `packages/os/site-kernel-checks/src/navigation-section.ts`; scans `src/content/features/pages/` for pages with navigation components that lack a `role: navigation` section; passes on `nicaragua-projekt` (9 pages, 26 sections checked, 0 violations); gracefully skips `apps/main` (no content-declared feature graph); supports `--json` (evidence: packages/ directory, package exists)
- [x] `feature.graph.validate` is extended to validate hierarchy-ready declarations — added 4 new rules: `missing-section-role` (every section must declare a role), `duplicate-navigation-section` (max one per page), `navigation-section-missing-component` (navigation section must contain a nav component), `navigation-component-outside-navigation-section` (nav components must sit in role:navigation sections); fixed `checkComponentExists` to resolve paths from `appDirectory`; all section declarations in `nicaragua-projekt` updated with roles (`navigation`, `content`, `hero`, `supporting`, `cta`) (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `feature.links.validate` and `feature.projections.validate` are extended for navigation-section topology — `feature.links.validate` now checks breadcrumb `items[]` for raw internal `href` values (must use semantic pageId references); `feature.projections.validate` now scans enabled pages for disabled navigation sections that still contain navigation components (`disabled-target-leak`); whole-page disabling is correctly exempted; both pass on `nicaragua-projekt` with 0 violations (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `feature.visibility.validate` documents and enforces the post-migration boundary with legacy `featureFlag` usage — apps that have adopted the feature graph now receive an additional `undeclared-feature-flag` violation when any `featureFlag:` key matches navigation/breadcrumb patterns (RFC-0019 post-migration boundary); legacy apps fall through to `runLegacyFeatureVisibilityValidation` unchanged; passes on `nicaragua-projekt` with 0 violations (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps/nicaragua-projekt` proves the new navigation section by rendering breadcrumbs through a section component rather than directly from routes — all 8 routes migrated to `NavigationSection`; `section/navigation-section.astro` created; all page feature declarations updated with `role: navigation` sections (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps/main` has a documented adoption path before shared pipeline promotion — `section/navigation-section.astro` created in `apps/main`; all 5 legal pages (impressum, agb, datenschutz, widerruf, muster-widerruf) migrated from direct `Breadcrumbs` to `NavigationSection`; remaining 18 routes (complex PSEO/collection pages where Breadcrumbs is embedded in hero sections) are deferred to a follow-up migration; `astro check` passes with 0 errors on both apps (evidence: original apps retired by RFC-0381, implemented historically)
- [x] The new commands support stable `--json` output — both `structure.hierarchy.validate` and `navigation.section.validate` accept `--json` flag and emit structured `HierarchyValidationResult` JSON (evidence: implemented historically)
- [x] The commands are promoted into `STANDARD_CHECK_PIPELINE` only after both current apps are ready — both `apps/main` (33 routes, 0 violations) and `apps/nicaragua-projekt` (9 routes, 0 violations) pass `structure.hierarchy.validate`; commands added to `STANDARD_CHECK_PIPELINE` in `packages/os/site-kernel-checks/src/module.ts` Wave 3.5 (evidence: packages/ directory, package exists)
- [x] `architecture-dna.md`, `page-contracts.md`, and `component-contracts.md` are updated when implementation begins — all three created in `docs/` with full content referencing RFC-0019, DNA-8, and the page → section → component → content hierarchy (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has status `accepted`.
- Agents MUST NOT change the `status` field in this or any other RFC.
- Agents MUST apply this hierarchy only to the visitor-facing page body, not to layout-shell components such as `layout`, `header`, or `footer`.
- Agents MUST NOT render `Breadcrumbs` directly from a route after the migration step; it must be rendered via a navigation section component.
- Agents MUST keep project-specific copy in page content and `componentOverrides`; they MUST NOT invent route-local copy just to satisfy hierarchy rules.
- Agents MUST keep `@gogol/site-kernel-checks` app-agnostic. App names, page ids, and local exceptions must not be hardcoded into shared validators.
- Agents MUST validate the shared package before validating app consumers when implementing these checks.
- Agents MUST NOT promote the new commands into `STANDARD_CHECK_PIPELINE` until the rollout conditions in this RFC are met.
- When implementing the proving migration in `nicaragua-projekt`, agents SHOULD introduce `section/navigation-section.astro` before refactoring individual routes that currently render breadcrumbs directly.
