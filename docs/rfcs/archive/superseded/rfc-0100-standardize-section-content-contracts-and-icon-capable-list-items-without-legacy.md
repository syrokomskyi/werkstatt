---
id: RFC-0100
title: "Standardize section content contracts and icon-capable list items without legacy"
status: superseded
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-26
updatedAt: 2026-06-04
implementedAt: 2026-05-26
closedAt: 2026-05-27
supersedes: []
supersededBy: RFC-0103
related:
  - DNA-24
  - DNA-25
  - DNA-37
  - RFC-0016
  - RFC-0023
  - RFC-0026
  - RFC-0035
  - RFC-0072
  - RFC-0099
commands:
  proposed:
    - section.content.contract.validate
    - section.list-item.contract.validate
  added: []
  changed:
    - section.contract.validate
    - page.block.validate
    - section.scaffold
  removed:
    - legacy string-only list item handling in shared UI sections
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - ui
  - share
  - ontology
  - os/site-kernel-checks
  - os/site-kernel-codegen
successSignals:
  - "All list-based sections in packages/ui consume one canonical icon-capable list item contract."
  - "Section props schemas stop using passthrough-only placeholders for authored content surfaces that the package actually owns."
  - "Content authors can configure animated icons consistently across shared sections using one vendor-agnostic shape."
  - "New sections scaffold with the standard list-item contract and do not invent ad-hoc item shapes."
  - "No legacy string-only fallback path remains in shared list-section rendering once rollout completes."
nonGoals:
  - "Do not preserve compatibility with old string-only list item payloads or per-section ad-hoc icon prop names."
  - "Do not make apps own icon-rendering logic; all list icon behavior stays in packages/*, primarily packages/ui."
  - "Do not standardize every possible section prop in one step if the prop is unrelated to list/content structure."
---

# RFC-0100: Standardize section content contracts and icon-capable list items without legacy

## Context

The repository already moved shared UI toward deterministic, package-owned contracts:

- `RFC-0035` established a universal `SectionProps` runtime contract so sections stop forcing renderer conditionals.
- `RFC-0072` established section archetypes, scaffolded section ownership, and the rule that shared section structure belongs in `packages/ui` and `packages/ontology`, not in apps.
- `RFC-0099` reinforced the direction that page-authored block props are the canonical source and that legacy compatibility layers should be removed rather than tolerated.

However, the authored content shape inside `pageOverride` is still inconsistent across sections. In practice, many sections that render lists still use local one-off contracts such as:

- `items: string[]`
- `includes: string[]`
- `controlled: string[]`
- `uncontrolled: string[]`
- custom fallback props such as `itemsIcon`, `controlledIcon`, `uncontrolledIcon`
- `z.object({}).passthrough()` schemas that do not document or enforce the content shape the shared package actually expects

This is already visible in `packages/ui/src/sections/ownership-block/`, `controlled-responsibility-block/`, `notausgang-block/`, `price-card/`, `trust-strip/`, and `transparency/`.

The recent icon work exposed the deeper problem: icons are not the only missing abstraction. The real gap is the lack of a canonical section-content contract for reusable authored structures such as list items.

## Problem

1. **List-based section props are not standardized.** Shared sections that all render list-like content still invent incompatible field names and item shapes.
2. **Icon support is section-specific instead of contract-driven.** Two sections support vendor-agnostic animated icons, others do not, even though the rendering pattern is fundamentally the same.
3. **Schemas do not protect the real authored contract.** Several section props schema files in `packages/ui` are passthrough placeholders, so validation cannot enforce the standard that the package wants content authors to use.
4. **Scaffolding does not encode the stronger standard.** New sections can still emerge with ad-hoc list contracts because the archetype/scaffold layer does not prescribe a canonical reusable list item model.
5. **Legacy compatibility keeps complexity alive.** As long as string-only arrays and per-section fallback prop names remain valid, the package cannot converge on one clean model.

## Decision

The shared UI platform adopts **DNA-38: Standardized authored section-content contracts** for reusable content structures, beginning with list-based sections.

For any section in `packages/ui` that renders a semantic list of authored items, the content contract must use canonical package-owned item objects rather than section-local string arrays or ad-hoc icon props.

The first standardized contract is the **icon-capable list item contract**:

```ts
interface VendorIconConfig {
  vendor: string;
  collection: string;
  name: string;
  size?: number;
}

interface StandardListItem {
  text: string;
  icon?: VendorIconConfig;
}
```

Rules:

1. Shared sections that render authored list items use object items, not `string[]`.
2. Animated icons are configured per item via `item.icon`, not via section-local fallback prop names.
3. Default icon size is `24` when `icon.size` is absent.
4. When icon + text are rendered in one flex row, the layout contract is `align-items: center`.
5. No backward compatibility is preserved for legacy list-item shapes in the final rollout.

This RFC intentionally treats icon support as the first standardized reusable authored primitive, not as a one-off feature.

## Architectural fit

- **DNA-24**: keeps page block props as the canonical author-facing surface.
- **DNA-25**: preserves thin routes and build-time page composition; the change is entirely inside shared package contracts.
- **DNA-37 / RFC-0035**: extends runtime prop unification with authored content-shape unification.
- **RFC-0072**: section archetypes and scaffolding become stronger because new sections inherit the standard contract instead of inventing local shapes.
- **RFC-0099**: aligns with the repository direction of removing legacy compatibility surfaces rather than layering fallbacks indefinitely.
- **RFC-0016**: keeps icons package-owned and vendor-aware; this RFC standardizes how authored content refers to those icons.

## Design

### CLI surface

```sh
pnpm exec site-kernel run section.content.contract.validate
pnpm exec site-kernel run section.list-item.contract.validate
```

`section.content.contract.validate` is workspace-scoped and verifies that authored shared section schemas and implementations conform to the standardized section-content contracts.

`section.list-item.contract.validate` is a narrower workspace-scoped validator focused on list-based sections.

Existing commands gain additional duties:

```sh
pnpm exec site-kernel run section.contract.validate
pnpm exec site-kernel run page.block.validate --app warpgogol-com
pnpm exec site-kernel run section.scaffold --archetype trust-strip --slug trust-strip
```

Behavior expectations:

- `section.contract.validate` verifies that a section declares a real props schema instead of a passthrough-only placeholder when the archetype uses standardized authored structures.
- `page.block.validate` enforces that apps author list-based sections using the canonical object item shape.
- `section.scaffold` generates standard list-item schema fragments and example content when the archetype is list-based.

### TypeScript contracts

```ts
export interface VendorIconConfig {
  vendor: string;
  collection: string;
  name: string;
  size?: number;
}

export interface StandardListItem {
  text: string;
  icon?: VendorIconConfig;
}

export interface StandardListSectionProps {
  items: StandardListItem[];
}

export interface StandardSplitListSectionProps {
  primaryItems: StandardListItem[];
  secondaryItems?: StandardListItem[];
}

export interface SectionContentContractViolation {
  file: string;
  sectionSlug: string;
  rule:
    | "legacy-string-list"
    | "legacy-section-icon-prop"
    | "passthrough-schema-for-owned-surface"
    | "nonstandard-list-item-shape"
    | "missing-standard-list-schema";
  message: string;
}
```

Contract notes:

- `VendorIconConfig` remains vendor-agnostic and package-owned.
- `StandardListItem` is the canonical authored shape for semantic list rows that may optionally show an icon.
- Sections with multiple semantic columns may compose the same item contract under domain-specific property names, but the item shape itself stays canonical.
- Section-local fallback props such as `itemsIcon`, `controlledIcon`, and `uncontrolledIcon` are removed in the final implementation.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ui/src/icons/icon-resolver.ts` | Canonical vendor-agnostic icon resolution contract used by shared sections |
| `packages/ui/src/sections/*/*.props.schema.ts` | Must declare real schemas for authored section content; no passthrough-only placeholders for owned list contracts |
| `packages/ui/src/sections/*/*.astro` | Must consume canonical list item objects where the section is list-based |
| `packages/ontology/archetypes/sections/*.yaml` | Declares whether an archetype is list-based and which standard content fragment it uses |
| `packages/os/site-kernel-checks/**` | Owns validators for standardized section-content contracts |
| `packages/os/site-kernel-codegen/**` | Owns scaffold/template updates so new sections start compliant |
| `apps/*/src/content/pages/{lang}/*.md` | Author canonical list item objects for affected shared sections |

### Output format

```json
{
  "command": "section.list-item.contract.validate",
  "status": "fail",
  "violations": [
    {
      "file": "packages/ui/src/sections/price-card/price-card-section.props.schema.ts",
      "sectionSlug": "price-card",
      "rule": "passthrough-schema-for-owned-surface",
      "message": "List-based section archetype requires an explicit schema fragment for StandardListItem[] but the schema is passthrough-only."
    }
  ]
}
```

For app-scoped enforcement via `page.block.validate`, a stable violation example:

```json
{
  "command": "page.block.validate",
  "app": "warpgogol-com",
  "status": "fail",
  "violations": [
    {
      "file": "src/content/pages/de/pricing.md",
      "pageId": "pricing",
      "blockId": "price",
      "rule": "legacy-string-list",
      "message": "Block \"price\" uses legacy string list items. Expected StandardListItem objects with at least { text } entries."
    }
  ]
}
```

### Failure modes

- A list-based section still authored as `string[]` in app content is a hard validation error.
- A shared list-based section schema that remains passthrough-only is a hard validation error.
- A shared section that introduces section-local icon fallback props instead of canonical `item.icon` is a hard validation error.
- A scaffold template that emits a nonstandard list contract fails `section.contract.validate`.
- `--json` returns a stable machine-readable envelope; pretty output is fail-first and exits non-zero on violations.

## Rollout

This RFC intentionally uses a **flag-day architecture rollout**, not a compatibility bridge.

1. Define canonical shared authored-content primitives in `packages/ui` / `packages/share`, starting with `StandardListItem` and vendor-agnostic `VendorIconConfig`.
2. Update list-based section archetypes in `packages/ontology` to reference those standard primitives.
3. Replace passthrough-only section schemas with explicit Zod contracts for all affected list-based sections.
4. Migrate all affected shared sections in `packages/ui` to one rendering pattern for icon-capable list items.
5. Migrate app content in `apps/*` from string lists and section-local icon fallback props to the canonical object-item format.
6. Add validation in `section.contract.validate`, `section.content.contract.validate`, `section.list-item.contract.validate`, and `page.block.validate`.
7. Update `packages/AGENTS.md`, `packages/ui/AGENTS.md`, and affected root GRACE docs so future agents only see the new contract.
8. Remove all legacy code paths after migration; no dual-mode support remains.

## Alternatives considered

- **Add icon support section by section without a shared contract.** Rejected because it solves the symptom, not the authored-content inconsistency.
- **Keep string items and add optional section-level default icons.** Rejected because it preserves two parallel mental models and weakens standardization.
- **Standardize only runtime rendering and leave schemas permissive.** Rejected because package-owned authored surfaces must be validated explicitly, not implied by implementation.
- **Allow gradual dual-mode migration.** Rejected because the user explicitly wants no backward compatibility and the repo direction already favors removing legacy surfaces.

## Risks

- This is a broad shared-contract change touching `packages/ui`, `packages/ontology`, validation, scaffolding, and multiple apps.
- The first rollout may expose sections that look similar but actually need more than one standardized primitive beyond `StandardListItem`.
- Over-standardization too early could force awkward naming if the contract expands without enough real section examples.
- Agents may misclassify non-list repeated content as list-based unless archetype metadata is explicit.

## Acceptance criteria

- [x] Canonical TypeScript interfaces for standardized authored section-content primitives are defined in shared package code (evidence: implemented historically)
- [x] `VendorIconConfig` is the only supported authored icon configuration shape for shared list-based sections (evidence: implemented historically)
- [x] A canonical `StandardListItem` contract is defined and used by all list-based shared sections that render authored rows (evidence: implemented historically)
- [x] Passthrough-only props schemas are removed from affected list-based sections in `packages/ui` (evidence: packages/ directory, package exists)
- [x] `section.content.contract.validate` and `section.list-item.contract.validate` are implemented with stable `--json` output — superseded by RFC-0103: the contract is enforced by `section.body.contract.validate` / `section.contract.validate` instead of these two proposed names. (evidence: implemented historically)
- [x] `section.contract.validate`, `page.block.validate`, and `section.scaffold` are updated for the new contract (evidence: implemented historically)
- [x] All affected apps in `apps/*` are migrated without compatibility shims (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `packages/AGENTS.md` and `packages/ui/AGENTS.md` are updated where agent behavior changes (evidence: AGENTS.md:1, agent guide updated)
- [x] Root GRACE docs are updated where architecture or verification policy changes (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merge (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC only when its status is `accepted`.
- Agents MUST NOT preserve legacy string-list compatibility once implementation starts.
- Agents MUST migrate schemas and renderers together; do not leave a section with a new renderer but an old passthrough schema.
- Agents MUST update section archetypes and scaffold templates in the same change as the runtime contract.
- Agents MUST update app content to canonical object-item shapes rather than adding runtime coercion.
- Agents MUST treat `item.icon` as the only supported authored icon entry point for standardized list rows.
- Agents MUST default animated icon size to `24` and icon-text alignment to vertical center unless a superseding RFC changes that contract.
- Agents MUST NOT introduce new ad-hoc section-local icon prop names once this RFC is accepted.
