---
rfcId: RFC-0490
planId: PLAN-RFC-0490-01
status: implemented
owner: architecture
createdAt: 2026-07-22
updatedAt: 2026-07-23
scope:
  apps:
    - webgogol-com
  packages:
    - "@gogol/surface"
    - "@gogol/share"
    - "@gogol/ontology"
    - "@gogol/site-kernel-checks"
  services: []
  docs:
    - docs/technology.xml
    - docs/knowledge-graph.xml
    - packages/share/AGENTS.md
---

# Implementation Plan: RFC-0490

## 1. Objectives

- [ ] O1 — Add `BlueprintPillar` types and optional `pillar` field to `BlueprintLevel` in `@gogol/surface` — maps to acceptance criterion "BlueprintLevel includes the optional pillar field".
- [ ] O2 — Extend the Zod blueprint schema in `@gogol/ontology` to validate the `pillar` field — maps to "Zod schema validates the pillar field".
- [ ] O3 — Add `"collection"` to `SemanticPageType` and wire CollectionPage + ItemList JSON-LD in `@gogol/share` — maps to "SemanticPageType includes collection", "buildWebPageNode maps collection to CollectionPage", "buildJsonLd emits ItemList".
- [ ] O4 — Add `collectionItems` to `SemanticModelOptions` and `SemanticPageModel`; populate it in `resolve-route.ts` — maps to "SemanticPageModel has collectionItems", "resolve-route.ts populates collectionItems".
- [ ] O5 — Implement `bakePillarHub` depth-0 specialization in the baker — maps to "bakePage emits the five-block hub layout".
- [ ] O6 — Update `website-local.yaml` blueprint with `pillar` block, `semanticType: collection`, hub title, and description — maps to "website-local.yaml depth-0 has pillar block", "semanticType: collection", "titleTemplate is hub title", "descriptionTemplate".
- [ ] O7 — Implement `surface.hub.validate` command and register it in the build.check pipeline — maps to "surface.hub.validate enforces...", "warns on...".
- [ ] O8 — Update Compass XML and AGENTS.md — maps to "docs/technology.xml and docs/knowledge-graph.xml updated", "packages/share/AGENTS.md updated".

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/surface/src/blueprint.ts` — add `BlueprintPillar`, `BlueprintPillarHero`, `BlueprintPillarAdaptation`, `BlueprintPillarProductPrice`, `BlueprintPillarFinalCta` interfaces; add `pillar?: BlueprintPillar` to `BlueprintLevel`.
- `packages/surface/src/blueprint-schema.ts` — add Zod schemas for `BlueprintPillar*` and `pillar` field on the level schema.
- `packages/share/src/semantic/models.ts` — add `"collection"` to `SemanticPageType` union and `SEMANTIC_PAGE_TYPES` array; add `collectionItems?: Array<{ url: string; name: string }>` to `SemanticPageModel`.
- `packages/share/src/semantic/jsonld/webpage.ts` — add `case "collection": return ["WebPage", "CollectionPage"]` to `getWebPageTypes`.
- `packages/share/src/semantic/jsonld.ts` — add `buildCollectionListNode` for `"collection"` pages; emit `ItemList` node in `buildJsonLd` graph.
- `packages/share/src/astro/page-handler/types.ts` — add `collectionItems?: Array<{ url: string; name: string }>` to `SemanticModelOptions`.
- `packages/share/src/astro/page-handler/resolve-route.ts` — compute depth-1 children from surface artifact for `"collection"`-typed pages; pass `collectionItems` through `SemanticModelOptions`.
- `packages/os/site-kernel-checks/src/surface-expand/bake.ts` — add `bakePillarHub` function; dispatch to it from `bakePage` when `entry.depth === 0 && level?.pillar`.
- `packages/os/site-kernel-checks/src/surface-expand/bake-blocks.ts` — add `anchorId` support to `linkedCardGrid` (pass-through to block props).
- `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts` — add `surface.hub.validate` command entry.
- `packages/os/site-kernel-checks/src/checks/surface-hub-validate.ts` — new validator file implementing the six check rules.
- `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` — add `{ command: "surface.hub.validate" }` to `SITES_CHECK_AUTHOR_PIPELINE`.

### 2.2 Configuration and data

- `packages/ontology/blueprints/website-local.yaml` — depth-0 level: add `semanticType: collection`, `pillar` block (hero, adaptation, productPrice, finalCta), update `titleTemplate`, add `descriptionTemplate`.
- `packages/ontology/src/schemas/` — if the blueprint schema is mirrored here, update to include `pillar` validation.

### 2.3 Documentation and specs

- `docs/technology.xml` — add `pillar` field to `BlueprintLevel` type documentation; add `"collection"` to `SemanticPageType`.
- `docs/knowledge-graph.xml` — add module relationships for `surface.hub.validate`, `BlueprintPillar`, `collectionItems`.
- `packages/share/AGENTS.md` — update semantic table to note `"collection"` type and `collectionItems` field.

### 2.4 Validation and pipelines

- `SITES_CHECK_AUTHOR_PIPELINE` — new step `{ command: "surface.hub.validate" }` after `surface.validate`.
- `SITES_BUILD_CHECK_PIPELINE` — inherits the new step via `SITES_CHECK_AUTHOR_PIPELINE` spread.

## 3. Step sequence

### Step 1. Blueprint type contracts (`@gogol/surface`)

**Goal:** Add the `BlueprintPillar*` TypeScript interfaces and the optional `pillar` field on `BlueprintLevel`.

**Agent actions:**

- Add `BlueprintPillarHero`, `BlueprintPillarAdaptation`, `BlueprintPillarProductPrice`, `BlueprintPillarFinalCta`, and `BlueprintPillar` interfaces to `packages/surface/src/blueprint.ts`, following the field shapes in RFC-0490 § Design.
- Add `pillar?: BlueprintPillar` to `BlueprintLevel`.
- Export the new types from `packages/surface/src/index.ts`.

**Validation:**

- `pnpm --filter @gogol/surface run build:check` passes.

**Completion criterion:** `BlueprintLevel` type includes `pillar?: BlueprintPillar`; all `BlueprintPillar*` interfaces are exported; build:check passes.

**Human review:** no

---

### Step 2. Blueprint Zod schema (`@gogol/ontology`)

**Goal:** Extend the blueprint Zod schema to validate the `pillar` field when present.

**Agent actions:**

- Add Zod schemas for `BlueprintPillarHero`, `BlueprintPillarAdaptation`, `BlueprintPillarProductPrice`, `BlueprintPillarFinalCta`, and `BlueprintPillar` in `packages/surface/src/blueprint-schema.ts`.
- Add `pillar: pillarSchema.optional()` to the level object in `blueprintSchema`.
- If `packages/ontology/src/schemas/` mirrors the blueprint schema, update there too.

**Validation:**

- `pnpm --filter @gogol/surface run build:check` passes.
- A test blueprint with a `pillar` block passes `blueprintSchema.safeParse`; a blueprint without `pillar` still passes.

**Completion criterion:** Zod schema accepts and validates `pillar`; `surface.validate` (which uses the schema) passes on a test blueprint with `pillar`.

**Human review:** no

---

### Step 3. Semantic page type and JSON-LD (`@gogol/share`)

**Goal:** Add `"collection"` to `SemanticPageType`, wire CollectionPage + ItemList JSON-LD, and add `collectionItems` to the semantic model.

**Agent actions:**

- Add `"collection"` to the `SemanticPageType` union and `SEMANTIC_PAGE_TYPES` array in `packages/share/src/semantic/models.ts`.
- Add `collectionItems?: Array<{ url: string; name: string }>` to `SemanticPageModel`.
- Add `case "collection": return ["WebPage", "CollectionPage"]` to `getWebPageTypes` in `packages/share/src/semantic/jsonld/webpage.ts`.
- Create `buildCollectionListNode` in `packages/share/src/semantic/jsonld/collection-list.ts` — builds an `ItemList` node from `page.collectionItems`.
- Add `buildCollectionListNode` to `buildJsonLd` graph in `packages/share/src/semantic/jsonld.ts` (emitted only when `page.type === "collection" && page.collectionItems?.length`).
- Add `collectionItems?: Array<{ url: string; name: string }>` to `SemanticModelOptions` in `packages/share/src/astro/page-handler/types.ts`.

**Validation:**

- `pnpm --filter @gogol/share run build:check` passes.
- Unit test: a `SemanticPageModel` with `type: "collection"` and `collectionItems` produces JSON-LD with `CollectionPage` + `ItemList`.

**Completion criterion:** `"collection"` is in `SemanticPageType`; `buildWebPageNode` maps it to `CollectionPage`; `buildJsonLd` emits `ItemList`; `SemanticModelOptions` has `collectionItems`.

**Human review:** no

---

### Step 4. Page handler `collectionItems` population (`@gogol/share`)

**Goal:** Compute depth-1 children from the surface artifact and pass `collectionItems` through the semantic model callback.

**Agent actions:**

- In `packages/share/src/astro/page-handler/resolve-route.ts`, after the `surfaceEntry` lookup and before the `buildSemanticModel` callback, check if `semanticType === "collection"` and `surfaceEntry` exists.
- If so, load the surface artifact entries (via `getSurfaceEntryByPageId` or the surface artifact), filter for `depth === 1 && indexable && axes.industry` matches, build `{ url, name }` array using `hrefFor`/`titleForEntry` equivalents or the route registry.
- Pass `collectionItems` in the `SemanticModelOptions` object to the `buildSemanticModel` callback.

**Validation:**

- `pnpm --filter @gogol/share run build:check` passes.
- A surface page with `semanticType: "collection"` has `collectionItems` populated in the semantic model.

**Completion criterion:** `resolve-route.ts` populates `collectionItems` for `"collection"`-typed surface pages; the callback receives it via `SemanticModelOptions`.

**Human review:** no

---

### Step 5. Baker depth-0 pillar specialization (`@gogol/site-kernel-checks`)

**Goal:** Implement `bakePillarHub` and dispatch to it for depth-0 entries with a `pillar` block.

**Agent actions:**

- Add `anchorId` support to `linkedCardGrid` in `packages/os/site-kernel-checks/src/surface-expand/bake-blocks.ts` — accept an optional `anchorId` parameter and set it in the block props.
- Implement `bakePillarHub(entry, lang, ctx, level)` in `packages/os/site-kernel-checks/src/surface-expand/bake.ts` — reads `level.pillar` and emits the five-block layout: hero → adaptation markdown → industry catalog (linkedCardGrid with `anchorId: "industry-catalog"`) → product/price markdown → final-cta.
- In `bakePage`, add a dispatch at the top: `if (entry.depth === 0 && level?.pillar) return bakePillarHub(entry, lang, ctx, level)`.
- The industry catalog cards are built from `childrenOf(entry, ctx.entries, ctx.axisOrder)` — same as the current depth-0 child cards, but with `anchorId` and capped at the blueprint `linking.children.limit`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes.
- A baked depth-0 entry with `pillar` produces the five-block layout; a depth-0 entry without `pillar` still uses the old `bakePage` path.

**Completion criterion:** `bakePage` emits the five-block hub layout for depth-0 entries with `pillar`; hero primary CTA targets `#industry-catalog`; catalog block has `anchorId: industry-catalog`.

**Human review:** no

---

### Step 6. Blueprint YAML update (`@gogol/ontology`)

**Goal:** Update `website-local.yaml` with the `pillar` block, `semanticType`, hub title, and description.

**Agent actions:**

- Edit `packages/ontology/blueprints/website-local.yaml` depth-0 level:
  - Add `semanticType: collection`.
  - Update `titleTemplate` to the hub title (DE/UK from RFC-0490 § Blueprint configuration).
  - Add `descriptionTemplate` (DE/UK from RFC-0490).
  - Add the full `pillar` block with `hero`, `adaptation`, `productPrice`, and `finalCta` sub-blocks (DE/UK content from RFC-0490).

**Validation:**

- `pnpm --filter @gogol/ontology run build:check` passes.
- `blueprintSchema.safeParse` on the updated `website-local.yaml` passes.

**Completion criterion:** `website-local.yaml` depth-0 has `pillar`, `semanticType: collection`, hub `titleTemplate`, and `descriptionTemplate`.

**Human review:** no — content is from the RFC, which is accepted.

---

### Step 7. `surface.hub.validate` command (`@gogol/site-kernel-checks`)

**Goal:** Implement the validator, register the command, and wire it into the pipeline.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/checks/surface-hub-validate.ts` implementing the six check rules from RFC-0490 § Validator:
  - `pillar-hero-cta-not-anchor` (fail)
  - `pillar-commercial-promise` (fail)
  - `pillar-missing-title-template` (fail)
  - `pillar-no-published-industries` (fail)
  - `pillar-orphan-industry` (warn)
  - `pillar-priceref-unresolvable` (warn)
- Add the command entry to `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts`:
  ```ts
  {
    name: "surface.hub.validate",
    description: "Validate the depth-0 pillar hub configuration and rendered output (RFC-0490).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/surface.generated.yaml", "<app>/src/content/system.md"],
    execute: runSurfaceHubValidate,
  }
  ```
- Add `{ command: "surface.hub.validate" }` to `SITES_CHECK_AUTHOR_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts`, after `surface.validate`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes.
- `pnpm exec site-kernel run surface.hub.validate --site webgogol-com --json` exits 0.

**Completion criterion:** `surface.hub.validate` is registered, runs, and enforces all six rules; it is in `SITES_CHECK_AUTHOR_PIPELINE`.

**Human review:** no

---

### Step 8. Compass XML and AGENTS.md sync

**Goal:** Update documentation to reflect the new types and command.

**Agent actions:**

- Update `docs/technology.xml` — add `pillar` field to `BlueprintLevel` documentation; add `"collection"` to `SemanticPageType` enumeration.
- Update `docs/knowledge-graph.xml` — add module relationships for `surface.hub.validate`, `BlueprintPillar`, `collectionItems`.
- Update `packages/share/AGENTS.md` — note `"collection"` type and `collectionItems` field in the semantic table.

**Validation:**

- `pnpm exec site-kernel run compass.validate` passes (if available).

**Completion criterion:** `docs/technology.xml`, `docs/knowledge-graph.xml`, and `packages/share/AGENTS.md` reflect the new `pillar` field, `"collection"` type, and `surface.hub.validate` command.

**Human review:** no

---

### Step 9. End-to-end validation and evidence

**Goal:** Run the full validation suite and collect evidence.

**Agent actions:**

- Run `pnpm exec site-kernel run surface.generate --site webgogol-com` to regenerate the surface.
- Run `pnpm exec site-kernel run surface.hub.validate --site webgogol-com --json` — confirm exit 0.
- Run `pnpm exec site-kernel run content.references.validate --site webgogol-com` — confirm PBP references resolve.
- Run `pnpm --filter webgogol-com run build` — confirm no runtime errors.
- Inspect the rendered `/website/` and `/sait/` pages — confirm the five-block hub layout.
- Inspect the JSON-LD output — confirm `CollectionPage` + `ItemList`.
- Run `pnpm exec site-kernel run rfc.validate RFC-0490 --json` — confirm pass.
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0490` to collect evidence (RFC-0330).
- Update `amendedBy` on RFC-0238 and RFC-0207 to include `RFC-0490`.

**Validation:**

- All acceptance criteria checkboxes in RFC-0490 are checked.
- `rfc.verification.emit` produces `docs/rfcs/verification/rfc-0490.generated.json`.

**Completion criterion:** All acceptance criteria pass; verification evidence is committed; RFC-0490 is stamped `implemented`.

**Human review:** yes — the `accepted → implemented` transition requires human architecture review (RFC-0224). The operator must verify the rendered pages and JSON-LD output before stamping `implemented`.

---

## 4. Validation suite

### 4.1 Required checks

- `pnpm --filter @gogol/surface run build:check`
- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run surface.generate --site webgogol-com`
- `pnpm exec site-kernel run surface.hub.validate --site webgogol-com --json`
- `pnpm exec site-kernel run content.references.validate --site webgogol-com`
- `pnpm exec site-kernel run rfc.validate RFC-0490 --json`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0490`
- `pnpm --filter webgogol-com run build` (dev build, no runtime errors)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0490.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0490` in the subject line (RFC-0265)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Blueprint complexity | Step 2 — Zod schema validates structure at load time; `pillar` is optional. |
| Baker branching | Step 5 — `bakePillarHub` extracted as a separate function; `bakePage` dispatches. |
| PBP reference in markdown body | Step 9 — `content.references.validate` confirms resolution; dev build confirms interpolation. |
| CollectionPage JSON-LD compatibility | Step 3 — additive switch-case branch; existing types unaffected. |
| Industry catalog completeness | Step 9 — visual inspection confirms catalog renders with current industries. |
| False-positive rate for commercial-promise check | Step 7 — phrases are specific multi-word strings; no suppression mechanism by design. |

## 6. Escalation triggers

- If the `collectionItems` flow cannot be wired through the existing `buildSemanticModel` callback without changing the callback signature, stop and consult the operator — this may require a contract change to `@gogol/pbp/semantic-profile`.
- If the PBP reference interpolation in `pillar.productPrice.body` does not work at render time, stop and file a separate RFC for markdown-body reference interpolation — this is a render-layer concern outside this RFC's scope.
- If implementation reveals an invariant conflict with DNA-24 (block-declarative pages), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0490 --reason "..." --invariant "DNA-24"` instead of working around it.
