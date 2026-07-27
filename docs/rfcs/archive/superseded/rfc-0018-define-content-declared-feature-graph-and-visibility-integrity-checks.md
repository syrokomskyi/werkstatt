---
id: RFC-0018
title: "Define content-declared feature graph and visibility integrity checks"
status: superseded
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: app
owners:
  - architecture
reviewers: []
createdAt: 2026-04-20
updatedAt: 2026-06-04
implementedAt: 2026-04-21
closedAt: 2026-04-21
supersedes: []
supersededBy: RFC-0019
related:
  - DNA-7
  - DNA-12
  - DNA-13
  - DNA-14
  - RFC-0003
  - RFC-0004
  - RFC-0008
  - RFC-0012
  - RFC-0013
commands:
  proposed:
    - feature.graph.validate
    - feature.links.validate
    - feature.projections.validate
  added: []
  changed:
    - feature.visibility.validate
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - site-kernel-checks
successSignals:
  - "Page, section, component, and item visibility are declared in `src/content/features/**/*.md` frontmatter rather than authored in `src/configure/features.ts`."
  - "Disabling a page removes its resolved links from header, footer, shared components, and semantic outputs without per-component special cases."
  - "Disabling a section or component makes its `page#anchor` target unresolved and therefore absent from navigation and semantic projections."
  - "Behavior overrides such as blurred contact QR or blurred messenger channels are resolved from the same graph as visibility."
  - "OS checks fail when feature declarations reference missing routes, missing anchors, missing component/item ids, or disabled targets that still leak into links or semantic outputs."
nonGoals:
  - "Do not introduce backward-compatibility aliases for the old dot-path tree once migration is complete."
  - "Do not generalize this architecture to all apps before it is proven in `nicaragua-projekt`."
  - "Do not add an editor UI or remote feature management service."
---

# RFC-0018: Define content-declared feature graph and visibility integrity checks

## Context

`apps/nicaragua-projekt` currently centralizes visibility in `src/configure/features.ts` and consumes it from routes, navigation helpers, footer behavior, and semantic outputs. That centralization is correct in spirit, but the authored model is too narrow for the site's real structure.

The site is not only a set of page flags. Its navigable topology is:

- page
- section inside page
- component inside section
- content item inside component

If something on this site isn't quite right, it should be corrected.

Each section and each addressable component can own an anchor, and any component may render links to pages or anchors that belong to another page. The current design handles only parts of this problem:

- routes gate pages and sections with booleans from `features.ts`
- `header.astro` hides links only when `resolveLinkTarget()` returns `null`
- `footer.astro` still mixes raw `href` values with `featureFlag` strings in content
- semantic outputs rely on navigation helpers and therefore inherit only page-level visibility well
- behavior overrides such as blurred WhatsApp and Telegram live beside structural flags but are not modeled as first-class node-level overrides

This creates drift risk: the site can hide a page in one place yet keep links, anchors, or semantic references alive elsewhere.

## Problem

The current feature tree cannot express the full topology that the site actually needs to control.

1. It has no first-class notion of a feature graph with page, section, component, and item nodes.
2. It does not define anchors as governed targets.
3. It allows internal links to be authored as raw localized `href` strings, which prevents automatic invalidation when the target page or anchor is disabled.
4. It treats behavior overrides as ad hoc booleans instead of attaching them to stable content items.
5. The current OS validation only checks that `featureFlag:` strings in markdown point to keys defined in `features.ts`; it does not verify route existence, anchor existence, component/item existence, or projection leakage.

As a result, the architecture does not yet protect DNA-12, DNA-13, and DNA-14 strongly enough for `nicaragua-projekt`.

## Decision

`nicaragua-projekt` moves from an authored boolean feature tree to a **content-declared feature graph**.

The canonical authored source of truth becomes a new Astro content collection under `src/content/features/`, where simple Markdown files store all declarations in frontmatter. The runtime registry is resolved from that content collection and consumed uniformly by routes, navigation helpers, shared components, and semantic builders.

The graph models four nested node classes:

1. page
2. section
3. component
4. item

Each page, section, and addressable component has a stable id. Each section and each addressable component has a stable anchor. Each item may carry both visibility state and behavior overrides.

Internal links stop being authored as raw local `href` strings plus independent `featureFlag` guards. Instead, internal links use semantic target references that resolve through the feature graph:

- page target
- page + anchor target
- external URL target (the only case where raw `href` remains canonical)

Disabling a page makes every internal reference to that page unresolved. Disabling a section or component makes its anchor unresolved. Components such as header, footer, and semantic outputs do not invent their own visibility rules; they ask the same resolver for target availability.

The existing values in `src/configure/features.ts` are migrated into this new graph:

- `features.pages.*` → page node visibility
- `features.sections.*` → section node visibility
- `features.header.langSwitcher` → shared component item visibility
- `features.contact.blurWhatsApp` / `features.contact.blurTelegram` → item behavior overrides in the contact/footer scope
- legacy alias nodes such as `heroSection` or `pageContentSection` are removed rather than preserved

## Architectural fit

- **DNA-7 — Routes stay thin**: routes consume resolved visibility and behavior, but do not author feature policy.
- **DNA-12 — Feature visibility is centralized**: authored declarations move to `src/content/features/**/*.md`, while the resolved registry remains a single central runtime abstraction.
- **DNA-13 — Disabled content disappears everywhere**: one resolver governs routes, navigation, and semantic projections.
- **DNA-14 — Navigation is content-driven but config-resolved**: content keeps labels and semantic targets; resolution of concrete URLs and visibility remains centralized.
- **RFC-0004**: page frontmatter stays the source of project-specific section copy; this RFC adds a separate content-layer graph for topology and visibility.
- **RFC-0008**: feature declaration files remain Markdown content and therefore stay compatible with the existing content discipline.
- **RFC-0012**: semantic builders must resolve visible pages and anchors from the same graph used by routes and navigation.
- **RFC-0013**: footer content is migrated from `href + featureFlag` to target references plus item-level behavior overrides.

## Design

### CLI surface

```sh
pnpm exec site-kernel run feature.graph.validate --app nicaragua-projekt
pnpm exec site-kernel run feature.links.validate --app nicaragua-projekt
pnpm exec site-kernel run feature.projections.validate --app nicaragua-projekt
pnpm exec site-kernel run feature.visibility.validate --app nicaragua-projekt
```

Command responsibilities:

- `feature.graph.validate`
  - validates the new `src/content/features/**/*.md` collection
  - checks id uniqueness and scope correctness
  - checks that declared pages, sections, components, items, and anchors map to real source artifacts

- `feature.links.validate`
  - checks that all internal link declarations in content resolve through the graph
  - reports raw local `href` usage where a semantic target must be used instead
  - fails when a visible link points to a disabled or missing page/anchor

- `feature.projections.validate`
  - checks that navigation registries and semantic outputs expose only visible pages and anchors
  - fails when disabled pages or anchors leak into site-level projections

- `feature.visibility.validate`
  - is repurposed from legacy `featureFlag:` key checking to validation of graph-driven visibility references during the migration window
  - after migration it validates that content-level visibility references point to real graph nodes rather than to legacy dot-path keys

All four commands are app-scoped. They live in `@gogol/site-kernel-checks` and stay app-agnostic by relying on app conventions plus content declarations.

### TypeScript contracts

```ts
type FeatureVisibility = "enabled" | "disabled";

type FeatureNodeKind = "page" | "section" | "component" | "item";

interface InternalTargetRef {
  kind: "internal";
  pageId: string;
  anchor?: string;
}

interface ExternalTargetRef {
  kind: "external";
  href: string;
}

type LinkTargetRef = InternalTargetRef | ExternalTargetRef;

interface FeatureItemDeclaration {
  id: string;
  visibility: FeatureVisibility;
  behavior?: Record<string, string | number | boolean | null>;
}

interface FeatureComponentDeclaration {
  id: string;
  componentPath: string;
  anchor: string;
  visibility: FeatureVisibility;
  items?: FeatureItemDeclaration[];
}

interface FeatureSectionDeclaration {
  id: string;
  anchor: string;
  visibility: FeatureVisibility;
  components: FeatureComponentDeclaration[];
}

interface FeaturePageDeclaration {
  id: string;
  routeSlug: string;
  visibility: FeatureVisibility;
  sections: FeatureSectionDeclaration[];
}

interface SharedComponentFeatureDeclaration {
  id: string;
  componentPath: string;
  anchor: string;
  visibility: FeatureVisibility;
  items?: FeatureItemDeclaration[];
}

interface SiteFeatureGraph {
  pages: Record<string, FeaturePageDeclaration>;
  sharedComponents: Record<string, SharedComponentFeatureDeclaration>;
}

interface FeatureGraphViolation {
  file: string;
  rule:
    | "duplicate-node-id"
    | "missing-route"
    | "missing-section-anchor"
    | "missing-component-anchor"
    | "missing-component-path"
    | "missing-item-id"
    | "dangling-target"
    | "disabled-target-leak"
    | "raw-internal-href";
  message: string;
}
```

The exact file and type names may vary during implementation, but the architecture requires these concepts.

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/nicaragua-projekt/src/content/features/**/*.md` | Canonical authored feature graph declarations in frontmatter |
| `apps/nicaragua-projekt/src/content/schemas/features.ts` | Zod schema for feature declaration entries |
| `apps/nicaragua-projekt/src/content.config.ts` | Registers the new `siteFeatures` content collection |
| `apps/nicaragua-projekt/src/configure/features.ts` | Stops being the authored feature tree; may remain only as a thin resolved export surface during implementation, but not as canonical data |
| `apps/nicaragua-projekt/src/configure/navigation.ts` | Resolves internal link targets and anchors from the feature graph |
| `apps/nicaragua-projekt/src/content/components/**/header.md` | Internal navigation items use semantic target refs instead of hardcoded page URLs |
| `apps/nicaragua-projekt/src/content/components/**/footer.md` | Internal links migrate from `href + featureFlag` to semantic target refs and item-level behavior ids |
| `apps/nicaragua-projekt/src/pages/[lang]/**/*.astro` | Consume the resolved graph for page/section/component/item visibility |
| `apps/nicaragua-projekt/src/semantic/**/*.ts` | Consume the same graph so disabled pages and anchors disappear from projections |
| `packages/os/site-kernel-checks/src/feature-graph.ts` | Shared validation helpers for graph, links, and projection integrity |
| `packages/os/site-kernel-checks/src/module.ts` | Registers the new check commands |

### Output format

`feature.graph.validate` JSON output:

```json
{
  "command": "feature.graph.validate",
  "status": "fail",
  "checkedFiles": 9,
  "violations": [
    {
      "file": "apps/nicaragua-projekt/src/content/features/pages/home.md",
      "rule": "missing-section-anchor",
      "message": "Section \"transparency\" declares anchor \"transparenz\" but no matching DOM id was found."
    }
  ]
}
```

`feature.links.validate` JSON output:

```json
{
  "command": "feature.links.validate",
  "status": "fail",
  "checkedFiles": 14,
  "violations": [
    {
      "file": "apps/nicaragua-projekt/src/content/components/de/footer.md",
      "rule": "raw-internal-href",
      "message": "Use a semantic target ref for /spenden-kontakt#kontakt instead of a local href literal."
    }
  ]
}
```

`feature.projections.validate` JSON output:

```json
{
  "command": "feature.projections.validate",
  "status": "fail",
  "violations": [
    {
      "file": "apps/nicaragua-projekt/src/semantic/pages/index.ts",
      "rule": "disabled-target-leak",
      "message": "Disabled target \"donationContact#kontakt\" still appears in a semantic projection."
    }
  ]
}
```

### Failure modes

- All three new commands fail with non-zero exit code when violations are found.
- `feature.visibility.validate` also fails during migration when legacy references or mixed contracts are still present beyond the allowed transition steps.
- Pretty output must report one violation per line with app-relative paths.
- `--json` output must stay stable and machine-readable for agents.
- Missing `src/content/features/` is an error after this RFC is implemented; the site must not silently fall back to the legacy authored tree.

## Rollout

1. **Phase 1 — Content collection and schema**
   - add `siteFeatures` collection in `src/content`
   - migrate the existing page, section, header, and contact flags into Markdown frontmatter declarations

2. **Phase 2 — Runtime consumption**
   - replace route- and helper-level reads of authored booleans with reads from the resolved feature graph
   - convert footer and any other internal-link content from raw local `href` values to semantic target refs

3. **Phase 3 — Integrity checks**
   - add graph, links, and projection validation commands in `@gogol/site-kernel-checks`
   - wire them into the affected app's `build.check` pipeline only after the migration is complete and stable

4. **Phase 4 — Legacy removal**
   - remove the old authored dot-path feature tree and its aliases
   - keep no permanent backward-compatibility layer

New apps are not required to adopt this model until a later RFC explicitly promotes it beyond `nicaragua-projekt`.

## Alternatives considered

1. **Keep `src/configure/features.ts` as the canonical authored tree and add more nested booleans**
   - Rejected because it keeps structural meaning outside content and does not solve link/anchor integrity.

2. **Store only behavior toggles in content and keep visibility in config**
   - Rejected because it would split one concern into two sources of truth.

3. **Keep raw local `href` values and add more `featureFlag` fields**
   - Rejected because dead links still depend on human discipline rather than graph resolution.

4. **Infer all anchors and items from `.astro` source without explicit content declarations**
   - Rejected because item-level behavior and business meaning would remain implicit and unstable.

## Risks

- **Declaration overhead**: the feature graph adds explicit ids and anchors that must stay synchronized with routes and components.
- **Validation complexity**: anchor and item checks may produce false positives if source contracts stay implicit.
- **Migration churn**: footer, navigation, routes, and semantic builders all need to converge on the same resolver.
- **Package boundary risk**: shared checks must remain app-agnostic even though the first rollout is app-specific.

## Acceptance criteria

- [x] `siteFeatures` content collection defined for `apps/nicaragua-projekt` (evidence: original apps retired by RFC-0381, implemented historically)
- [x] All current authored flags from `src/configure/features.ts` migrated into `src/content/features/**/*.md` (evidence: implemented historically)
- [x] Internal navigation content uses semantic target refs instead of local page `href` literals (evidence: implemented historically)
- [x] Routes, navigation helpers, and semantic builders consume one resolved feature graph (evidence: implemented historically)
- [x] Disabling a page removes all internal links to it (evidence: implemented historically)
- [x] Disabling a section or component makes its `page#anchor` target unresolved (evidence: implemented historically)
- [x] Item-level behavior overrides are available for contact/footer-style cases such as blur states (evidence: implemented historically)
- [x] `feature.graph.validate` implemented and registered (evidence: implemented historically)
- [x] `feature.links.validate` implemented and registered (evidence: implemented historically)
- [x] `feature.projections.validate` implemented and registered (evidence: implemented historically)
- [x] `feature.visibility.validate` updated for the new model (evidence: implemented historically)
- [x] App pipeline updated only after the migration is stable (evidence: implemented historically)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change the `status` field in this or any other RFC.
- Agents MUST remove the old authored alias flags instead of preserving them indefinitely.
- Agents MUST treat `src/content/features/**/*.md` frontmatter as the only canonical authored source of feature declarations.
- Agents MUST use semantic target refs for internal page and anchor links in content; raw local `href` values are reserved for external URLs or non-site targets.
- Agents MUST ensure that section and component anchor declarations match real DOM ids emitted by the rendered `.astro` components.
- Agents MUST keep `@gogol/site-kernel-checks` app-agnostic; any `nicaragua-projekt`-specific mapping belongs in app conventions or feature content, not in shared package hardcoding.
- Agents MUST validate `@gogol/site-kernel-checks` before validating `nicaragua-projekt` when shared package code changes.
