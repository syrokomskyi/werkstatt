---
id: RFC-0717
title: "Remove stale Nachweis surface module blueprint references — Nachweis pages are block-declarative, not surface-generated"
status: accepted
kind: architecture
scope: app
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-06
updatedAt: 2026-08-06
enhancedAt: 2026-08-06
supersedes: []
supersededBy:
amends:
  - RFC-0708
amendedBy: []
related:
  - DNA-24
  - RFC-0193
  - RFC-0708
satisfies:
  - DNA-24
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted: []
successSignals:
  - "Cache clone system.md surface.modules.nachweis has no blueprints key"
  - "surface.blueprints does not list nachweis or any nachweis-* blueprint ID"
  - "surface.modules.nachweis remains as entitlement gate"
  - "Nachweis pages continue to render via block-declarative model (system.md pages[] → blocks[] → components)"
nonGoals:
  - "Does not remove the nachweis entitlement or surface.modules.nachweis entry — the module declaration is still needed for entitlement gating"
  - "Does not change Nachweis page rendering — pages remain block-declarative"
  - "Does not create Nachweis blueprint YAML files — Nachweis pages are not surface-generated"
---

# RFC-0717: Remove stale Nachweis surface module blueprint references — Nachweis pages are block-declarative, not surface-generated

## Context

RFC-0708 added Nachweis pages to warpgogol-com using the **block-declarative page model** (DNA-24, RFC-0047): `system.md pages[]` → `blocks[]` → UI components. Nachweis pages render PBP entity content (EvidenceSource, Claim, Consent) through dedicated components (`nachweis-card`, `nachweis-list`, `nachweis-detail`, `nachweis-verify`), not through PSEO surface expansion.

The RFC-0708 implementation plan instructed adding `blueprints: [nachweis-list, nachweis-detail, nachweis-verify]` to `surface.modules.nachweis` and listing those IDs in `surface.blueprints`. The workpiece `system.md` (mission m000033) was correctly implemented without these entries. However, the cache clone (`systems-cache/warpgogol-com/src/content/system.md`) retains a stale `blueprints: [nachweis]` entry under `surface.modules.nachweis`.

## Problem

The stale `blueprints: [nachweis]` entry in the cache clone is dead configuration:

1. **No blueprint YAML file exists** in `packages/ontology/blueprints/` for `nachweis`. Only `offer.yaml`, `ratgeber.yaml`, `website-local.yaml`, `website-service.yaml` exist.
2. **`nachweis` is not listed in `surface.blueprints`** — so `blueprint.validate` does not flag it (the validator at `packages/os/site-kernel-checks/src/blueprint.ts:155-158` only checks IDs declared in `surface.blueprints`).
3. **`entitlement.module.validate` does not flag it** — the validator at `packages/os/site-kernel-checks/src/entitlement-module.ts:65-76` iterates over `surface.blueprints`, not module-level `blueprints` arrays.
4. **Surface blueprints are for PSEO** — they define how pages are generated from datasets via axes, levels, and eligibility matrices. Nachweis pages are not generated from datasets; they are authored content rendered through components.

While the stale entry does not cause validation failures, it is misleading: it implies Nachweis pages are surface-generated when they are block-declarative. It should be removed for configuration accuracy.

## Decision

Remove the `blueprints: [nachweis]` array from `surface.modules.nachweis` in the cache clone `system.md`. The `surface.modules.nachweis` entry itself remains as the entitlement gate for the `nachweis` feature. The workpiece `system.md` is already clean and requires no changes.

## Architectural fit

- **DNA-24 (block-declarative pages):** Nachweis pages follow the standard `system.md pages[]` → `blocks[]` → components pattern. They do not use surface expansion. Declaring surface blueprints for block-declarative pages is a category error. This RFC protects DNA-24 by removing contradictory configuration.
- **RFC-0193 (Programmatic Surface):** Surface blueprints define dataset-driven page generation. Nachweis pages are not dataset-driven — they render PBP entity content. They do not belong in the surface blueprint system.
- **Amending RFC-0708:** This RFC amends RFC-0708 by removing the erroneous surface configuration that survived in the cache clone. RFC-0708's page structure, component contracts, and route source are correct — only the surface module blueprint reference was wrong.

## Design

### Changes to cache clone `system.md`

Remove `blueprints` array from `surface.modules.nachweis`:

```yaml
surface:
  modules:
    nachweis:
      entitlement: nachweis
      # blueprints:          ← removed entirely
      #   - nachweis
      masterLocale: de
      publishedLocales:
        - uk
      # ... rest unchanged
```

### What stays

- `surface.modules.nachweis` entry remains — it gates the `nachweis` entitlement
- `entitlementsOverride: ["nachweis"]` remains
- `pages[]` entries for `nachweise`, `nachweis-detail`, `nachweis-verify` remain
- All Nachweis UI components and route sources remain
- `surface.blueprints` list remains unchanged (`website-local`, `website-service`, `offer`, `ratgeber`)

### Workpiece `system.md`

The workpiece `system.md` (mission m000033) is already clean — `surface.modules.nachweis` has no `blueprints` key. No changes needed.

## Rollout

Single-step change: edit the cache clone `system.md` to remove the `blueprints` array from `surface.modules.nachweis`. No build or deploy required — the change takes effect on the next cache clone sync.

## Alternatives considered

- **Direct fix without RFC:** The stale entry is dead config that doesn't cause validation errors. A direct content data correction would suffice. Rejected because the operator chose to document the change as an RFC for traceability — it amends RFC-0708's surface configuration decision.
- **Create `nachweis.yaml` blueprint:** Instead of removing the `blueprints` array, create a real blueprint YAML file. Rejected because Nachweis pages are not dataset-driven PSEO pages — creating a blueprint would be forced and unnecessary.

## Risks

- **Agent misinterpretation:** An agent seeing `blueprints: [nachweis]` might attempt to create a `nachweis.yaml` blueprint file or add Nachweis pages to the surface generation pipeline. Removing the entry eliminates this risk.
- **False-positive rate:** None — the change removes dead config, not a validation rule.
- **No validation impact:** The change does not affect `blueprint.validate` or `entitlement.module.validate` because `nachweis` is not in `surface.blueprints`.

## Acceptance criteria

- [ ] Cache clone `system.md` `surface.modules.nachweis` has no `blueprints` key
- [ ] `surface.blueprints` does not list `nachweis` or any `nachweis-*` ID
- [ ] `surface.modules.nachweis` entry remains with `entitlement: nachweis`
- [ ] Nachweis pages continue to render via block-declarative model

## Implementation notes for agents

- Edit the cache clone `system.md` at `systems-cache/warpgogol-com/src/content/system.md` — remove the `blueprints` array from `surface.modules.nachweis`.
- Do NOT edit the workpiece `system.md` — it is already clean.
- Do NOT add `nachweis` to `surface.blueprints` — Nachweis pages are not surface-generated.
- Do NOT create a `nachweis.yaml` blueprint file in `packages/ontology/blueprints/`.
- After editing, run `entitlements.resolve --system warpgogol-com` to regenerate `entitlements.generated.yaml` if needed.

## Consequences

- **Positive:** Cache clone `system.md` accurately reflects the page generation model — block-declarative, not surface-generated.
- **Positive:** No misleading `blueprints` array that could confuse agents into creating unnecessary blueprint YAML files.
- **Negative:** None — the removed configuration was dead (no blueprint YAML file existed).
- **Technical debt:** None — this is a cleanup, not a deferral.

## Evolution

If Nachweis pages ever need PSEO-style generation (e.g., auto-generating pages per evidence record from a dataset), a new blueprint YAML would be created in `packages/ontology/blueprints/nachweis.yaml` and added to `surface.blueprints`. Until then, the block-declarative model is correct.
