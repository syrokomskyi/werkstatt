---
id: RFC-0183
title: "Adopt content-layer feature policy without a features directory"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-08
updatedAt: 2026-06-08
implementedAt: 2026-06-08
closedAt:
supersedes: []
amends:
  - RFC-0019
related:
  - RFC-0018
  - RFC-0047
  - RFC-0077
  - RFC-0099
commands:
  proposed: []
  added:
    - feature.policy.validate
    - feature.references.validate
  changed:
    - feature.visibility.validate
  removed:
    - feature.graph.validate
appsImpacted:
  - nicaragua-projekt
  - webgogol-com
packagesImpacted:
  - site-kernel-checks
  - share
  - ui
successSignals:
  - "Feature visibility and behavior policy is declared inside existing RFC-0047 content domains, not in `src/content/features/**`."
  - "Page, section, shell-component, and content-element feature policy resolves from page/system/site frontmatter through one shared resolver."
  - "Legacy `featureFlag:` dot-path references are rejected after migration."
  - "No app reintroduces `src/content/features/**` or `src/configure/features.ts`."
  - "Navigation, semantic outputs, shared components, and page rendering consume the same resolved policy."
nonGoals:
  - "Do not reintroduce the retired `src/content/features/**` collection."
  - "Do not add a remote feature flag service or editor UI."
  - "Do not preserve backward compatibility for legacy dot-path feature flags after migration."
  - "Do not implement this RFC before it is accepted."
---

# RFC-0183: Adopt content-layer feature policy without a features directory

## Context

The repository has completed the RFC-0047 migration to a CMS-friendly app content surface:

- `src/content/system.md`
- `src/content/pages/{lang}/**/*.md`
- `src/content/prose/{lang}/**/*.md`
- `src/content/business/{lang}/**/*.md`
- `src/content/navigation/{lang}/**/*.md`
- `src/content/site/{lang}/**/*.md`

The legacy `src/content/features/**` collection is no longer part of the allowed app surface. `README.md`, `AGENTS.md`, and GRACE documents now treat apps as composition shells whose author-facing content lives in the RFC-0047 domains.

RFC-0018 introduced a content-declared feature graph under `src/content/features/**` for `nicaragua-projekt`. It is now superseded and conflicts with the current content surface. RFC-0019 promoted broader page-section-component architecture, but some implementation and validation surfaces still carry feature graph terminology and commands such as `feature.visibility.validate`.

A new feature policy is still needed. The user direction is to support page, section, component, and content-element visibility and behavior overrides from the content layer, with OS validation in `packages/os`, but not before an RFC is created and accepted.

## Problem

The current system has three incompatible ideas in circulation:

1. **Legacy graph surface:** RFC-0018's `src/content/features/**` collection.
2. **Current app surface:** RFC-0047 forbids `src/content/features/**` and keeps content in semantic domains.
3. **Runtime need:** apps still need centralized visibility and behavior policy for pages, sections, shell components, navigation, semantic outputs, and content elements.

This creates AI-operability risk:

- agents may try to reintroduce `src/content/features/**` because older RFCs and validators mention it;
- agents may add local booleans or ad hoc props when they need feature gating;
- validators may keep checking legacy `featureFlag:` dot paths instead of the current content-layer policy;
- shared components may consume policy differently from page rendering or semantic outputs.

## Decision

The repository adopts a **content-layer feature policy** resolved from existing RFC-0047 content domains. The policy is not a separate `features` collection and not a TypeScript config file.

Feature policy may be declared in these locations:

| Location | Role |
| --- | --- |
| `src/content/system.md` | Site-wide policy defaults, shell-level component policy, global feature catalog metadata. |
| `src/content/pages/{lang}/**/*.md` | Page block, section, component, and content-element policy close to the authored page structure. |
| `src/content/navigation/{lang}/**/*.md` | Navigation item policy and target availability hints. |
| `src/content/site/{lang}/**/*.md` | Site labels/config policy for global UI and integrations. |
| `src/content/business/{lang}/**/*.md` | Business record/item policy when business content contains optional offers, services, team members, or processors. |
| `src/content/prose/{lang}/**/*.md` | Prose-level policy for optional prose blocks or content references when needed. |

The canonical contract is named **Feature Policy**, not Feature Graph. The resolver may internally build a graph-like index, but the authored surface is policy embedded in semantic content frontmatter.

The policy supports four target classes:

1. page
2. section / page block
3. component / shell slot
4. content element / item

Each target may define:

- `visibility`: `enabled | disabled | hidden | draft`
- `behavior`: string-keyed behavior overrides with JSON-safe scalar values
- `reason`: optional author-facing explanation
- `expiresAt`: optional ISO date for temporary policy
- `audience`: optional closed audience id for future gating

Initial enforcement treats `disabled` and `hidden` as non-renderable for visitor-facing outputs. `draft` is valid only for non-production or authoring contexts and must fail production build checks unless explicitly allowed by app policy.

## Architectural fit

- **RFC-0047:** preserves the CMS-friendly content surface and explicitly avoids `src/content/features/**`.
- **RFC-0077:** continues removal of legacy compatibility surfaces without preserving old dot-path feature flags.
- **RFC-0099:** aligns shared component context fallback with page-driven content rather than component-local defaults.
- **RFC-0019:** keeps page-section-component-content structure but moves visibility policy into current domains.
- **Storage policy:** no cookies are introduced; any client-side state remains `localStorage` only.
- **Generated-file governance:** generated app files are changed through templates/generators, never direct app edits.

## Design

### Authored content shape

The standard field is `policy`, not `featureFlag`.

Example page block:

```yaml
blocks:
  - id: contact-options
    type: contact
    policy:
      visibility: enabled
      behavior:
        blurWhatsappQr: true
    props:
      ...
```

Example navigation item:

```yaml
items:
  - label: Donate
    target:
      kind: internal
      pageId: donations
    policy:
      visibility: enabled
```

Example business item:

```yaml
services:
  - id: emergency-support
    title: Emergency support
    policy:
      visibility: hidden
      reason: "Offer not available during the current campaign."
```

### TypeScript contracts

```ts
export type FeaturePolicyVisibility = "enabled" | "disabled" | "hidden" | "draft";

export interface FeaturePolicy {
  visibility?: FeaturePolicyVisibility;
  behavior?: Record<string, string | number | boolean | null>;
  reason?: string;
  expiresAt?: string;
  audience?: string;
}

export type FeaturePolicyTargetKind = "page" | "section" | "component" | "item";

export interface FeaturePolicyTargetRef {
  kind: FeaturePolicyTargetKind;
  pageId?: string;
  blockId?: string;
  componentId?: string;
  itemId?: string;
  lang?: string;
}

export interface ResolvedFeaturePolicy {
  target: FeaturePolicyTargetRef;
  visibility: FeaturePolicyVisibility;
  behavior: Record<string, string | number | boolean | null>;
  sourcePath: string;
  inheritedFrom?: FeaturePolicyTargetRef;
}
```

### Resolution order

For a page block or component, the resolver applies policy in this order:

1. explicit policy on the content node;
2. page-level policy in the same page content file;
3. system-level policy for matching page/block/component ids;
4. site-level defaults;
5. platform default: `visibility: enabled`, empty behavior.

Localized content follows the existing content merge semantics. Because arrays replace wholesale, localized page files that override `blocks[]` must carry complete block policy for every localized block.

### CLI surface

```sh
pnpm exec site-kernel run feature.policy.validate --app nicaragua-projekt
pnpm exec site-kernel run feature.policy.validate --app webgogol-com
pnpm exec site-kernel run feature.references.validate --app nicaragua-projekt
pnpm exec site-kernel run feature.visibility.validate --app nicaragua-projekt
```

Command responsibilities:

- `feature.policy.validate`
  - validates `policy` field shape in all RFC-0047 content domains;
  - fails on `src/content/features/**`;
  - fails on `src/configure/features.ts`;
  - fails on unknown visibility values or non-JSON-safe behavior values;
  - warns first, then fails after migration, on legacy `featureFlag:` fields.

- `feature.references.validate`
  - validates that policy target ids match existing pages, block ids, shell component ids, navigation item ids, or business item ids;
  - fails when a visible navigation/semantic target points to disabled content;
  - reports inherited policy sources for AI review.

- `feature.visibility.validate`
  - changes from legacy dot-path checking to a compatibility alias for `feature.policy.validate` during migration;
  - is removed or kept as a thin alias after one release window.

- `feature.graph.validate`
  - is removed from standard pipelines after migration;
  - if kept temporarily, it must report a deprecation diagnostic pointing to `feature.policy.validate`.

### File system responsibilities

| Path                                    | Role                                   |
| --------------------------------------- | -------------------------------------- |
| `apps/*/src/content/system.md`          | Site-wide policy and shell defaults.   |
| `apps/*/src/content/pages/**`           | Page and block policy.                 |
| `apps/*/src/content/navigation/**`      | Navigation item policy.                |
| `apps/*/src/content/site/**`            | Global UI/integration policy.          |
| `apps/*/src/content/business/**`        | Business item policy.                  |
| `apps/*/src/content/prose/**`           | Optional prose policy.                 |
| `apps/*/src/content/features/**`        | Forbidden legacy path.                 |
| `apps/*/src/configure/features.ts`      | Forbidden legacy path after migration. |
| `packages/share/src/**`                 | Shared resolver and public types.      |
| `packages/os/site-kernel-checks/src/**` | Validators and pipeline registration.  |

### Output format

`feature.policy.validate --json` returns:

```json
{
  "command": "feature.policy.validate",
  "status": "fail",
  "violations": [
    {
      "ruleId": "POLICY-LEGACY-FEATURES-DIR",
      "file": "apps/example/src/content/features/pages/home.md",
      "message": "src/content/features/** is retired by RFC-0183. Move policy into RFC-0047 content domains."
    }
  ],
  "findings": [
    {
      "ruleId": "POLICY-INHERITED",
      "target": "page:home/block:hero",
      "source": "src/content/system.md"
    }
  ]
}
```

## Rollout

1. **RFC draft:** document the replacement architecture and validator contracts.
2. **Acceptance:** only after maintainer review.
3. **Schema phase:** add shared policy types and Zod fragments in `@gogol/share` or the appropriate content contract package.
4. **Validator phase:** implement `feature.policy.validate` and `feature.references.validate` in `packages/os/site-kernel-checks`.
5. **Migration phase:** migrate any active legacy `featureFlag:` or graph consumers to `policy`.
6. **Pipeline phase:** add policy validators to app build/check pipelines.
7. **Deprecation phase:** remove `feature.graph.validate` from active pipelines and convert `feature.visibility.validate` to an alias or remove it under a follow-up RFC if needed.

## Adoption status (decided 2026-06-08)

**Decision: keep the subsystem, but it is NOT yet open for content authoring.** The contracts, validators, runtime resolver, and the header/footer wiring stay in the tree (build-green), but apps MUST NOT start declaring `policy:` across pages/sections/navigation/business content until the gaps below are closed. The mechanism is enabled on real, demonstrated need — not speculatively.

**Why:** the need is real and recurring (three prior feature-gating systems were retired by RFC-0047), so the direction is correct and worth retaining. But the current implementation is Phase-0 scaffolding: enabling it broadly now would add a second visibility system with no real consumers and known sharp edges.

**Blockers before broad authoring:**

1. ~~Resolver cache was module-global (keyed by target+lang without context identity) and would clobber page-level policy.~~ Fixed 2026-06-08: cache is now scoped to the content context (WeakMap).
2. `feature.references.validate` is a transitional alias only — target-id ↔ content reference-graph integrity checks are deferred. A typo in a target id silently resolves to the default `enabled`. Implement real reference validation before authors rely on it.
3. Only shell components (header/footer) consume the resolver. Page rendering, sections, navigation items, and business items do not read it yet, so `policy:` authored there is currently inert.
4. Relationship with the existing `VisibilityExpr` block-visibility grammar (RFC-0026, `packages/share/src/visibility.ts`) is undecided. Resolve how `policy.visibility` and `VisibilityExpr` interact before broad use to avoid reintroducing two parallel visibility systems.

**Allowed today:** shell component / item policy in `system.md` (the header/footer path is wired and shape-validated) — suitable for a first low-risk real use.

## Alternatives considered

### Reuse `src/content/features/**`

Rejected. It conflicts with RFC-0047 and reintroduces a removed content surface.

### Keep `src/configure/features.ts`

Rejected. It makes feature policy code-owned rather than CMS/content-owned and blocks author-facing management.

### Add a remote feature flag service

Rejected. The platform currently needs build-time deterministic policy, not live remote feature management.

### Use ad hoc booleans in each component

Rejected. That recreates drift between rendering, navigation, semantic outputs, and shared components.

## Risks

- **Schema sprawl:** policy fields in many domains could become inconsistent unless shared schemas are reused.
- **Localized arrays:** localized `blocks[]` replace default arrays wholesale, so policy must be duplicated when blocks are localized.
- **Validator false positives:** early validators may not understand all addressable item ids.
- **Agent confusion:** older RFCs mention `feature graph`; current instructions must point agents to Feature Policy.

## Acceptance criteria

- [x] RFC status changed to accepted before implementation starts. (evidence: implemented historically)
- [x] `FeaturePolicy` and `ResolvedFeaturePolicy` types exist in a shared package. (evidence: implemented historically)
- [x] `policy` field is validated in all RFC-0047 content domains that support it. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `feature.policy.validate` is registered in `@gogol/site-kernel-checks`. (evidence: packages/ directory, package exists)
- [x] `feature.references.validate` is registered or explicitly deferred with rationale. (evidence: implemented historically)
- [x] `src/content/features/**` and `src/configure/features.ts` are rejected for RFC-0183 apps. (evidence: implemented historically)
- [x] Legacy `featureFlag:` usage is migrated or produces actionable diagnostics. (evidence: implemented historically)
- [x] Runtime resolver (`resolveFeaturePolicy`, `createFeaturePolicyResolver`) exists in `@gogol/share`. The legacy RFC-0018 feature-graph runtime is removed (no compatibility adapter retained — there are no legacy consumers). (evidence: packages/ directory, package exists)
- [x] Navigation, page rendering, shared components, and semantic outputs consume one resolved policy surface (header, footer migrated). (evidence: implemented historically)
- [x] `AGENTS.md`, `apps/AGENTS.md`, `packages/AGENTS.md`, and affected package guides mention Feature Policy instead of Feature Graph where current behavior is described. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate RFC-0183 --json` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST NOT implement this RFC while `status: draft`.
- Agents MUST NOT create `src/content/features/**` in any app.
- Agents MUST NOT add new `featureFlag:` fields.
- Agents SHOULD use `policy` for new authored feature behavior only after this RFC is accepted and validators exist.
- Agents MUST treat localized `blocks[]` as array replacements; do not rely on default-language block policy fallback inside arrays.
- Agents MUST keep generated app files generator-owned and update templates/generators instead of direct generated outputs.
