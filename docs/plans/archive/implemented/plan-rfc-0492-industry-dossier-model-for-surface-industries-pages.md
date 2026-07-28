---
rfcId: RFC-0492
planId: PLAN-RFC-0492-01
status: draft
owner: architecture
createdAt: 2026-07-23
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/surface"
    - "@gogol/share"
    - "@gogol/ontology"
    - "@gogol/site-kernel-checks"
    - "@gogol/pbp"
    - "@gogol/site-kernel-handoff"
  services: []
  docs:
    - docs/technology.xml
    - docs/knowledge-graph.xml
    - packages/share/AGENTS.md
    - packages/pbp/AGENTS.md
    - packages/surface/AGENTS.md
---

# Implementation Plan: RFC-0492

## 1. Objectives

- [x] O1 — Add `BlueprintDossier` and `IndustryDossierFields` types to `@gogol/surface`; add `dossier?: BlueprintDossier` to `BlueprintLevel` — maps to acceptance criterion "IndustryDossierFields interface defined", "BlueprintDossier interface defined", "dossierSchema added to BlueprintLevel Zod schema".
- [x] O2 — Extend `SemanticModelOptions` with `surfaceId` and `depth`; wire `resolve-route.ts` to pass them — maps to "SemanticModelOptions extended", "resolve-route.ts passes surfaceId/depth".
- [x] O3 — Implement Service JSON-LD deduplication in `buildServiceNodes` and industry-specific Service node emission in `buildPageSemanticModel` — maps to "buildServiceNodes suppresses org-level Service nodes", "buildPageSemanticModel emits industry-specific Service node".
- [x] O4 — Update `jsonld-types.yaml` C-contract to declare `Service` — maps to "jsonld-types.yaml C-contract updated", "surface.contract.validate passes".
- [x] O5 — Implement baker depth-1 dossier specialization — maps to "Baker depth-1 specialization implemented".
- [x] O6 — Implement `surface.industry.validate`, `surface.doorway-risk.report`, `surface.duplicate-content.report` commands and register them — maps to three command registration criteria + pipeline integration.
- [x] O7 — Implement `migrator-0492` and register it — maps to "Migrator registered", "idempotency test passes", "snapshot test passes".
- [x] O8 — Update `website-local.yaml` blueprint with `dossier` block — maps to "Blueprint gains dossier config block".
- [x] O9 — Update Compass XML and AGENTS.md — maps to documentation sync criteria.

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/surface/src/blueprint.ts` — add `BlueprintDossier`, `IndustryPublicationGate` interfaces; add `dossier?: BlueprintDossier` to `BlueprintLevel`.
- `packages/surface/src/blueprint-schema.ts` — add `dossierSchema` (Zod) and `dossier` field on the level schema.
- `packages/surface/src/types.ts` — add `IndustryDossierFields` interface; add optional dossier fields to `VirtualRouteEntry` if needed for semantic model consumption.
- `packages/surface/src/index.ts` — export new types.
- `packages/share/src/astro/page-handler/types.ts` — add `surfaceId?: string` and `depth?: number` to `SemanticModelOptions`.
- `packages/share/src/astro/page-handler/resolve-route.ts` — pass `surfaceEntry.surfaceId` and `surfaceEntry.depth` into `SemanticModelOptions`.
- `packages/share/src/semantic/jsonld/service.ts` — extend `buildServiceNodes` to suppress org-level Service nodes when `surfaceId === "website-local" && depth === 1`.
- `packages/pbp/src/semantic-profile.ts` — extend `buildPageSemanticModel` to emit industry-specific Service node gated by `surfaceId`/`depth`.
- `packages/os/site-kernel-checks/src/surface-expand/bake.ts` — add depth-1 dossier specialization; dispatch when `entry.surfaceId === "website-local" && entry.depth === 1`.
- `packages/os/site-kernel-checks/src/surface-expand/bake-helpers.ts` — add `dossierList`, `journeyList`, `architectureList`, `moduleList` helpers.
- `packages/os/site-kernel-checks/src/surface-industry-validate.ts` — new command handler for `surface.industry.validate`.
- `packages/os/site-kernel-checks/src/surface-doorway-risk.ts` — new command handler for `surface.doorway-risk.report`.
- `packages/os/site-kernel-checks/src/surface-duplicate-content.ts` — new command handler for `surface.duplicate-content.report`.
- `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts` — add three new command entries.
- `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` — add `surface.industry.validate` after `surface.hub.validate`.
- `packages/os/site-kernel-handoff/src/migrators/rfc-0492.ts` — new migrator.
- `packages/os/site-kernel-handoff/src/migrators/registry.ts` — append `rfc0492Migrator`.

### 2.2 Configuration and data

- `packages/ontology/blueprints/website-local.yaml` — depth-1 level: add `dossier` config block (gate thresholds, claimRestrictions, doorwayMaxFlaggedShare, duplicateMaxSimilarity).
- `packages/ontology/src/external-surfaces/jsonld-types.yaml` — add `Service` type declaration with required/optional fields.

### 2.3 Documentation and specs

- `docs/technology.xml` — add `BlueprintDossier` type, `dossier` field on `BlueprintLevel`, `surfaceId`/`depth` on `SemanticModelOptions`, three new commands.
- `docs/knowledge-graph.xml` — add module relationships for new commands, `BlueprintDossier`, industry Service node.
- `packages/share/AGENTS.md` — update semantic table to note `surfaceId`/`depth` on `SemanticModelOptions` and Service deduplication.
- `packages/pbp/AGENTS.md` — note `buildPageSemanticModel` depth-1 industry Service node emission.
- `packages/surface/AGENTS.md` — note `BlueprintDossier` and `dossier` field on `BlueprintLevel`.

### 2.4 Validation and pipelines

- `SITES_CHECK_AUTHOR_PIPELINE` — new step `{ command: "surface.industry.validate" }` after `surface.hub.validate`.
- `surface.duplicate-content.report` — integrated into `surface.validate` as a blocking sub-check.
- `surface.doorway-risk.report` — diagnostic, runs in `build.check` but does not block unless threshold exceeded.

## 3. Step sequence

### Step 1. Blueprint type contracts (`@gogol/surface`)

**Goal:** Add the `BlueprintDossier`, `IndustryPublicationGate`, and `IndustryDossierFields` TypeScript interfaces and the optional `dossier` field on `BlueprintLevel`.

**Agent actions:**

- Add `IndustryPublicationGate` interface to `packages/surface/src/blueprint.ts` with fields: `minServiceCategories`, `minCustomerJourneys`, `minTrustSignals`, `minArchitectureEntries`, `minModuleMappings`, `minUniqueFaq`.
- Add `BlueprintDossier` interface to `packages/surface/src/blueprint.ts` with fields: `gate: IndustryPublicationGate`, `claimRestrictions: string[]`, `doorwayMaxFlaggedShare: number`, `duplicateMaxSimilarity: number`, `mode: "warn" | "fail"` (controls whether `surface.industry.validate` blocks `build.check` or warns — operators switch from `"warn"` to `"fail"` by editing the blueprint after the grace period).
- Add `dossier?: BlueprintDossier` to `BlueprintLevel` (after `pillar?: BlueprintPillar`).
- Add `IndustryDossierFields` interface to `packages/surface/src/types.ts` with the 11 optional dossier fields.
- Export the new types from `packages/surface/src/index.ts`.

**Validation:**

- `pnpm --filter @gogol/surface run build:check`

**Completion criterion:** `BlueprintDossier`, `IndustryPublicationGate`, and `IndustryDossierFields` are exported from `@gogol/surface` and `BlueprintLevel` has an optional `dossier` field.

**Human review:** no

---

### Step 2. Blueprint Zod schema (`@gogol/surface`)

**Goal:** Add `dossierSchema` to the blueprint Zod validation so the `dossier` block is validated.

**Agent actions:**

- Add `dossierSchema` to `packages/surface/src/blueprint-schema.ts` mirroring the `BlueprintDossier` interface.
- Add `dossier: dossierSchema.optional()` to the level schema (after `pillar`).
- Run `blueprint.validate` to verify the schema accepts the existing `website-local.yaml` (which does not yet have a `dossier` block — the field is optional).

**Validation:**

- `pnpm --filter @gogol/surface run build:check`
- `pnpm exec site-kernel run blueprint.validate --site warpgogol-com`

**Completion criterion:** `dossierSchema` validates the `BlueprintDossier` shape; existing blueprints without `dossier` still pass.

**Human review:** no

---

### Step 3. SemanticModelOptions extension (`@gogol/share`)

**Goal:** Extend `SemanticModelOptions` with `surfaceId` and `depth` so the semantic model builder can gate JSON-LD corrections by surface identity and depth.

**Agent actions:**

- Add `surfaceId?: string` and `depth?: number` to `SemanticModelOptions` in `packages/share/src/astro/page-handler/types.ts`.
- Update `resolve-route.ts` to pass `surfaceEntry?.surfaceId` and `surfaceEntry?.depth` into the `SemanticModelOptions` object when building the semantic model (around line 448 where `satisfies SemanticModelOptions` is used).

**Validation:**

- `pnpm --filter @gogol/share run build:check`

**Completion criterion:** `SemanticModelOptions` has optional `surfaceId` and `depth` fields; `resolve-route.ts` passes them from `surfaceEntry`.

**Human review:** no

---

### Step 4. Service JSON-LD deduplication (`@gogol/share`)

**Goal:** Suppress organization-level `Service` nodes for depth-1 `website-local` industry pages and emit an industry-specific `Service` node instead.

**Agent actions:**

- Extend `buildServiceNodes` in `packages/share/src/semantic/jsonld/service.ts` to accept optional `surfaceId` and `depth` parameters; return `[]` when `surfaceId === "website-local" && depth === 1`.
- Update `buildJsonLd` in `packages/share/src/semantic/jsonld/jsonld.ts` to pass `surfaceId`/`depth` from the page model to `buildServiceNodes`.
- Add industry-specific `Service` node emission to `buildJsonLd` when `surfaceId === "website-local" && depth === 1` — the node carries `serviceType: "Digitales Fundament für {industry}"`, `provider: { "@id": ids.organization }`, and `audience` from the page model.

**Validation:**

- `pnpm --filter @gogol/share run build:check`

**Completion criterion:** `buildServiceNodes` suppresses org-level nodes for depth-1 `website-local`; industry-specific `Service` node is emitted in `buildJsonLd`.

**Human review:** no

---

### Step 5. Industry Service node in semantic model (`@gogol/pbp`)

**Goal:** Extend `buildPageSemanticModel` to emit the industry-specific Service metadata so `buildJsonLd` can consume it.

**Agent actions:**

- Extend `buildPageSemanticModel` in `packages/pbp/src/semantic-profile.ts` to read `surfaceId` and `depth` from the options.
- When `surfaceId === "website-local" && depth === 1`, attach industry-specific service metadata to the `SemanticPageModel` (e.g. an `industryService` field carrying `serviceType` and `audience` derived from the page's `fallbackFrontmatter`).
- Ensure the `SemanticPageModel` type in `@gogol/share` has the optional `industryService` field.

**Validation:**

- `pnpm --filter @gogol/pbp run build:check`
- `pnpm --filter @gogol/share run build:check`

**Completion criterion:** `buildPageSemanticModel` attaches industry-specific service metadata for depth-1 `website-local` pages.

**Human review:** no

---

### Step 6. C-contract update (`@gogol/ontology`)

**Goal:** Add `Service` to the JSON-LD C-contract and verify `surface.contract.validate` passes.

**Agent actions:**

- Add `Service` type to `packages/ontology/src/external-surfaces/jsonld-types.yaml` with `required: [name, provider]` and `optional: [serviceType, audience, description, areaServed]`.
- Run `surface.contract.validate` to verify the updated contract passes against existing generated surfaces.

**Validation:**

- `pnpm --filter @gogol/ontology run build:check`
- `pnpm exec site-kernel run surface.contract.validate --site warpgogol-com`

**Completion criterion:** `jsonld-types.yaml` declares `Service`; `surface.contract.validate` passes.

**Human review:** no — this is a Layer C contract change declared via `breaksC: true` in the RFC.

---

### Step 7. Baker depth-1 dossier specialization (`@gogol/site-kernel-checks`)

**Goal:** Add the depth-1 dossier block emission to the baker.

**Agent actions:**

- Add `bakeIndustryDossier` function to `packages/os/site-kernel-checks/src/surface-expand/bake.ts` that emits blocks in the order specified by RFC-0492 § Baker changes (hero → questions → journeys → taxonomy → trust → evidence → contact → service area → architecture → modules → FAQ).
- Dispatch to `bakeIndustryDossier` from `bakePage` when `entry.surfaceId === "website-local" && entry.depth === 1`.
- Add `dossierList`, `journeyList`, `architectureList`, `moduleList` helpers to `bake-helpers.ts` for mapping dossier fields to block props.
- Implement conditional Notausgang CTA: emit secondary CTA only when `notdienst: true` on the industry record.
- Implement deprecated field fallback: when new fields are absent, fall back to `specialFocus`, `scenarioSnippets`, `painPoints`, `proofSignals`, `faqs`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run surface.generate --site warpgogol-com` (verify depth-1 pages bake without errors)

**Completion criterion:** Depth-1 `website-local` pages bake with dossier blocks from industry record fields; absent fields omit their block.

**Human review:** no

---

### Step 8. `surface.industry.validate` command (`@gogol/site-kernel-checks`)

**Goal:** Implement the industry publication gate + claim policy enforcement validator.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/surface-industry-validate.ts` with `runSurfaceIndustryValidate` handler.
- Load industry records from `src/content/surface/industries/{lang}/*.md`.
- Load the blueprint's `dossier` config block for gate thresholds and `claimRestrictions`.
- Check publication gate: minimum counts for `serviceTaxonomy`, `customerJourneys`, `trustSignals`, `recommendedArchitecture`, `suitableModules`, `industryFaq`.
- Check claim policy: scan all text fields for prohibited phrases from `dossier.claimRestrictions`.
- Check deprecated field usage: warn when `specialFocus`/`scenarioSnippets`/`painPoints`/`proofSignals`/`faqs` are used and new fields are missing.
- Return `IndustryValidationResult` JSON shape per RFC-0492 § TypeScript contracts.
- Register the command in `command-tables/09b-build-artifacts-part2.ts`.
- Add `{ command: "surface.industry.validate" }` to `sites-check-author.ts` pipeline after `surface.hub.validate`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run surface.industry.validate --site warpgogol-com --json`

**Completion criterion:** `surface.industry.validate` runs, reports gate failures and claim violations, and is wired into `build.check` (warn mode initially).

**Human review:** no

---

### Step 9. `surface.doorway-risk.report` command (`@gogol/site-kernel-checks`)

**Goal:** Implement the depth-4 city page doorway risk diagnostic.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/surface-doorway-risk.ts` with `runSurfaceDoorwayRiskReport` handler.
- Load depth-4 city page entries from the surface artifact.
- Load `localDemandContext` from demand records, `uniqueIntro`/`uniqueFaq`/`localEvidence` from city records.
- Flag pages missing any of the four fields.
- Compute flagged share; fail `surface.validate` when share exceeds `dossier.doorwayMaxFlaggedShare`.
- Return `DoorwayRiskReport` JSON shape per RFC-0492 § TypeScript contracts.
- Register the command in `command-tables/09b-build-artifacts-part2.ts`.
- Add to `sites-check-author.ts` pipeline as a diagnostic step (warn status).

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run surface.doorway-risk.report --site warpgogol-com --json`

**Completion criterion:** `surface.doorway-risk.report` runs, flags depth-4 pages missing local context fields, and is wired into `build.check` as diagnostic.

**Human review:** no

---

### Step 10. `surface.duplicate-content.report` command (`@gogol/site-kernel-checks`)

**Goal:** Implement the depth-1 industry page duplicate content detector.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/surface-duplicate-content.ts` with `runSurfaceDuplicateContentReport` handler.
- Filter surface artifact entries to depth-1 `website-local` only.
- Compute pairwise shingle-based Jaccard similarity across baked page content (hero + all blocks) using the existing `shingles()` function from `surface-quality.ts`.
- Flag pairs with similarity > `dossier.duplicateMaxSimilarity` (default 0.70).
- Integrate into `surface.validate` as a blocking sub-check: when any pair exceeds the threshold, `surface.validate` fails.
- Return `DuplicateContentReport` JSON shape per RFC-0492 § TypeScript contracts.
- Register the command in `command-tables/09b-build-artifacts-part2.ts`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run surface.duplicate-content.report --site warpgogol-com --json`

**Completion criterion:** `surface.duplicate-content.report` runs, flags depth-1 industry pairs with >0.70 similarity, and blocks `surface.validate` when threshold exceeded.

**Human review:** no

---

### Step 11. Migrator `migrator-0492` (`@gogol/site-kernel-handoff`)

**Goal:** Implement and register the forward-only migrator for industry record schema transition.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0492.ts` with `rfc0492Migrator` following the `Migrator` interface pattern from `rfc-0488.ts`.
- Implement three mechanical, idempotent transforms:
  1. Copy `proofSignals` → `trustSignals` (if `trustSignals` absent).
  2. Copy `faqs` → `industryFaq` (if `industryFaq` absent).
  3. Copy `painPoints` → `evidenceRequirements` (if `evidenceRequirements` absent).
- Do NOT set `notdienst` — that is operator-authored content.
- Set `id: "rfc-0492"`, `fromVersion: "4.7.0"`, `toVersion: "4.8.0"` (informational metadata — RFC-0479 switched selection to RFC-id-keyed cursor, not version comparison; the version fields are kept for traceability following the existing migrator chain: 4.6→4.7 by rfc-0488).
- Append `rfc0492Migrator` to `migratorRegistry` in `packages/os/site-kernel-handoff/src/migrators/registry.ts`.
- Write idempotency test (PBT `f(f(x)) === f(x)`).
- Write snapshot test on real Elektriker and Friseur industry records.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff test -- --grep "rfc-0492"`

**Completion criterion:** Migrator registered, idempotency test passes, snapshot test passes on real industry records.

**Human review:** no

---

### Step 12. Blueprint `website-local.yaml` dossier block (`@gogol/ontology`)

**Goal:** Add the `dossier` config block to the depth-1 level of the `website-local` blueprint.

**Agent actions:**

- Add `dossier` block to the depth-1 level of `packages/ontology/blueprints/website-local.yaml` with:
  - `gate`: default thresholds (5/3/4/1/3/5).
  - `claimRestrictions`: the 8 prohibited phrases from RFC-0492 § Claim policy enforcement.
  - `doorwayMaxFlaggedShare: 0.30`.
  - `duplicateMaxSimilarity: 0.70`.
- Run `blueprint.validate` to verify the updated blueprint passes schema validation.

**Validation:**

- `pnpm exec site-kernel run blueprint.validate --site warpgogol-com`

**Completion criterion:** `website-local.yaml` depth-1 level has a valid `dossier` block.

**Human review:** no

---

### Step 13. Tests

**Goal:** Add unit tests for new commands and migrator.

**Agent actions:**

- Add unit tests for `surface.industry.validate`: gate pass/fail, claim violation detection, deprecated field warning.
- Add unit tests for `surface.doorway-risk.report`: missing field detection, threshold computation.
- Add unit tests for `surface.duplicate-content.report`: pairwise similarity, depth-1 filtering, threshold.
- Add migrator idempotency test (PBT) and snapshot test (Step 11).
- Add JSON-LD test: depth-1 `website-local` page emits `Service` node, not `LocalBusiness`; org-level `Service` nodes suppressed.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks test`
- `pnpm --filter @gogol/site-kernel-handoff test`
- `pnpm --filter @gogol/share test`

**Completion criterion:** All new tests pass.

**Human review:** no

---

### Final Step. Documentation sync and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, verify acceptance criteria, and request human operator to stamp the RFC as implemented.

**Agent actions:**

- Update `docs/technology.xml` — add `BlueprintDossier`, `dossier` field on `BlueprintLevel`, `surfaceId`/`depth` on `SemanticModelOptions`, three new commands, `Service` in C-contract.
- Update `docs/knowledge-graph.xml` — add module relationships for new commands, `BlueprintDossier`, industry Service node, migrator-0492.
- Update `packages/share/AGENTS.md` — note `surfaceId`/`depth` on `SemanticModelOptions` and Service deduplication behavior.
- Update `packages/pbp/AGENTS.md` — note `buildPageSemanticModel` depth-1 industry Service node emission.
- Update `packages/surface/AGENTS.md` — note `BlueprintDossier` and `dossier` field on `BlueprintLevel`.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- DO NOT stamp RFC or plan status as `implemented` — request the human operator to run `rfc.implement.stamp`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0492`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0492` (RFC-0330)
- Every file in `scope.docs` is either updated or documented as not-applicable.

**Completion criterion:** All documentation artifacts in scope are updated; all verifiable acceptance criteria are checked off; agent has requested the human operator to perform the `accepted → implemented` transition.

**Human review:** yes — the `accepted → implemented` transition requires human architecture review (RFC-0224). The operator verifies remaining runtime acceptance criteria and runs `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0492`
- `pnpm --filter @gogol/surface run build:check`
- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/pbp run build:check`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm exec site-kernel run surface.contract.validate --site warpgogol-com`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0492` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0492.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0492` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Layer C break (JSON-LD entity type change) | Step 6 updates the C-contract; `breaksC: true` declared in RFC; `surface.contract.validate` verifies |
| Agent misinterpretation (LLM-generated dossier fields) | RFC § Implementation notes prohibits LLM content; `surface.industry.validate` claim detection catches hallucination patterns (Step 8) |
| Baker complexity (depth-1 specialization) | Step 7 isolates specialization to `surfaceId === "website-local" && depth === 1`; other surfaces/depths unaffected |
| Service JSON-LD duplication | Step 4 suppresses org-level Service nodes for depth-1 industry pages; industry-specific node emitted instead |
| Duplicate-content false positives | Step 10 uses configurable threshold (default 0.70); RFC specifies calibration before blocking |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-24 (block-declarative pages), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0492 --reason "..." --invariant "DNA-24"` instead of working around it.
- If the `Service` JSON-LD type conflicts with existing `buildServiceNodes` consumers in unexpected ways, run `rfc.supersede.propose` rather than adding compatibility shims.
- If the migrator cannot be made idempotent (e.g. field copy semantics conflict with operator edits), escalate via `rfc.supersede.propose` rather than weakening idempotency.
