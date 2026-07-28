---
rfcId: RFC-0496
planId: PLAN-RFC-0496-01
status: draft
owner: architecture
createdAt: 2026-07-23
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/surface"
    - "@gogol/ontology"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-handoff"
  services: []
  docs:
    - packages/AGENTS.md
    - packages/os/site-kernel-checks/AGENTS.md
    - docs/requirements.xml
    - docs/verification-plan.xml
---

# Implementation Plan: RFC-0496

## 1. Objectives

- [ ] O1 — Create `website-service` blueprint with `industry × service` axes and depth-1 level — maps to acceptance criterion "website-service.yaml exists with axes industry × service and depth-1 level"
- [ ] O2 — Add `surface/services/{lang}/*.md` content collection support to `expandBlueprint` — maps to acceptance criterion "surface/services collection exists and is loaded by expandBlueprint"
- [ ] O3 — Add `website-service` depth-1 baker specialization in `bakePage` — maps to acceptance criterion "bakePage generates service pages from structured fields"
- [ ] O4 — Create `surface.service.validate` command with publication gate and claim restrictions — maps to acceptance criterion "surface.service.validate enforces publication gate and claim restrictions"
- [ ] O5 — Register `surface.service.validate` in command tables and wire into `sites-check-author` pipeline — maps to acceptance criterion "surface.service.validate is registered in command tables" and "integrated into build.check"
- [ ] O6 — Add `/:locale?/:industry/:service` route pattern to `url-schema.yaml` C-contract — maps to acceptance criterion "url-schema.yaml contains the route pattern"
- [ ] O7 — Register no-op migrator `rfc-0496` in migrator registry — maps to acceptance criterion "migrator rfc-0496 registered"
- [ ] O8 — Add industry-to-service cross-linking block in `website-local` depth-1 baker — maps to acceptance criterion "Industry pages link to their child service pages"
- [ ] O9 — Add `website-service` to `system.md surface.blueprints` for `warpgogol-com` — maps to acceptance criterion "Service pages are generated at /website/{industry}/{service}/"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ontology/blueprints/website-service.yaml` — new blueprint YAML
- `packages/ontology/src/external-surfaces/url-schema.yaml` — add `/:locale?/:industry/:service` route pattern
- `packages/surface/src/blueprint.ts` — `BlueprintLevel` gains optional `service?: BlueprintServiceConfig`
- `packages/surface/src/blueprint-schema.ts` — `serviceSchema` Zod schema added to `BlueprintLevel` schema
- `packages/os/site-kernel-checks/src/surface-expand/bake.ts` — `website-service` depth-1 baker specialization
- `packages/os/site-kernel-checks/src/surface-expand/expand.ts` — no changes needed (already handles multiple blueprints via `loadSurfaceBlueprints`)
- `packages/os/site-kernel-checks/src/surface-service-validate.ts` — new command handler
- `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts` — register `surface.service.validate`
- `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` — add `surface.service.validate` after `surface.industry.validate`
- `packages/os/site-kernel-handoff/src/migrators/rfc-0496.ts` — new no-op migrator
- `packages/os/site-kernel-handoff/src/migrators/registry.ts` — append `rfc0496Migrator`

### 2.2 Configuration and data

- `missions/*/workpiece/src/content/system.md` — add `website-service` to `surface.blueprints` list
- `missions/*/workpiece/src/content/surface/services/{lang}/*.md` — service records (authored by operator, not agent)

### 2.3 Documentation and specs

- `packages/AGENTS.md` — add `website-service` blueprint description to the `surface` package ownership table
- `packages/os/site-kernel-checks/AGENTS.md` — add `surface.service.validate` to the check commands table
- `docs/requirements.xml` — update if surface structure rules are declared
- `docs/verification-plan.xml` — update if surface verification rules are declared

### 2.4 Validation and pipelines

- `sites-check-author` pipeline — `surface.service.validate` added (warn mode)
- `surface.contract.validate` — validates new `/:locale?/:industry/:service` route pattern
- `migrator.registry.validate` — validates new `rfc-0496` migrator entry

## 3. Step sequence

### Step 1. Create `website-service` blueprint YAML

**Goal:** Create the new blueprint definition file with axes, levels, and service config.

**Agent actions:**

- Create `packages/ontology/blueprints/website-service.yaml` with:
  - `id: website-service`
  - `entitlement: pseo`
  - `axes: [industry (collection: industries, field: slug), service (collection: services, field: slug)]`
  - `dataset: { collection: services, status: active }`
  - `levels: [{ depth: 1, slug: { de: "website/{industry}/{service}", uk: "sait/{industry}/{service}" }, constellation: website-service }]`
  - `policy: { minRecordsPerDepth: { 1: 1 }, trailingSlash: true }`
  - `linking: { parent: { surface: website-local, depth: 1, joinField: industryId } }`
  - Service config block with gate thresholds and claim restrictions (mode: warn)

**Validation:**

- `pnpm exec site-kernel run blueprint.validate` (if command exists) or verify `loadSurfaceBlueprints` parses the new YAML without errors
- `pnpm --filter @gogol/surface run build:check`

**Completion criterion:** `website-service.yaml` exists and is parsed by `parseBlueprint` without errors.

**Human review:** no

---

### Step 2. Add `BlueprintServiceConfig` type and Zod schema

**Goal:** Extend the surface package types and schemas to support the `service` config block on `BlueprintLevel`.

**Agent actions:**

- Add `BlueprintServiceConfig` interface to `packages/surface/src/blueprint.ts` with `gate: ServicePublicationGate`, `claimRestrictions: string[]`, `mode: "warn" | "fail"`
- Add `ServicePublicationGate` interface with `minServiceVariants`, `minCustomerQuestions`, `minPriceModels`, `minFaq`, `minPageStructure`
- Add optional `service?: BlueprintServiceConfig` to `BlueprintLevel` interface
- Add `serviceSchema` Zod schema to `packages/surface/src/blueprint-schema.ts` and attach to `BlueprintLevel` schema
- Add `CHANGE_SUMMARY` entry for RFC-0496 in both files

**Validation:**

- `pnpm --filter @gogol/surface run build:check`
- `pnpm --filter @gogol/surface test`

**Completion criterion:** `BlueprintLevel` type and Zod schema accept optional `service` config block; existing blueprint validation still passes.

**Human review:** no

---

### Step 3. Add `/:locale?/:industry/:service` route pattern to C-contract

**Goal:** Update the declarative URL schema to include the new service page route pattern.

**Agent actions:**

- Add new route pattern to `packages/ontology/src/external-surfaces/url-schema.yaml`:
  ```yaml
  - pattern: "/:locale?/:industry/:service"
    params:
      locale:
        optional: true
        enum: [de, en]
      industry:
        type: string
        from: ontology.Industry
      service:
        type: string
    generated: true
  ```

**Validation:**

- `pnpm exec site-kernel run surface.contract.validate --site warpgogol-com`

**Completion criterion:** `url-schema.yaml` contains the new route pattern with `generated: true`; `surface.contract.validate` passes.

**Human review:** no

---

### Step 4. Add `website-service` depth-1 baker specialization

**Goal:** Extend `bakePage` to generate service dossier pages from structured service record fields.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/surface-expand/bake.ts`, add a `website-service` depth-1 specialization that emits blocks in the order specified in RFC-0496 (hero → md purpose → cardGrid questions → cardGrid variants → listCards price → listCards duration → cardGrid booking → md consultation → md team → md portfolio → listCards evidence → cardGrid architecture → md FAQ → ctaBlock)
- The specialization is triggered by `surfaceId === "website-service" && depth === 1`
- Absent fields omit their block — field-presence-driven, consistent with RFC-0193
- Add `CHANGE_SUMMARY` entry for RFC-0496

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-checks test`

**Completion criterion:** `bakePage` produces the correct block sequence for `website-service` depth-1 from a test service record.

**Human review:** no

---

### Step 5. Add industry-to-service cross-linking block

**Goal:** Extend the `website-local` depth-1 baker to emit a service catalog block linking to published service pages.

**Agent actions:**

- In `bake.ts`, modify the `website-local` depth-1 specialization to check for `website-service` generated routes matching the current `industryId`
- If matching service routes exist, emit a `linkedCardGrid` block with links to service pages
- If no service routes exist (empty collection), omit the block — graceful degradation
- Add `CHANGE_SUMMARY` entry for RFC-0496

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-checks test`

**Completion criterion:** Industry pages emit a service catalog block when service records exist; omit it when they don't.

**Human review:** no

---

### Step 6. Create `surface.service.validate` command handler

**Goal:** Implement the validation command that enforces the publication gate and claim restrictions for service records.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/surface-service-validate.ts` with `runSurfaceServiceValidate` function
- Load service records from `src/content/surface/services/{lang}/*.md` via `loadDataset`
- Load the `website-service` blueprint to read gate thresholds and claim restrictions from the `service` config block
- For each service record, check:
  - Publication gate: `serviceVariants ≥ 3`, `customerQuestions ≥ 3`, `pricePresentationModels ≥ 3`, `faq ≥ 5`, `recommendedPageStructure ≥ 1`, `reviewStatus === "approved"`, `publicationStatus === "published"`
  - Claim restrictions: scan all text fields for prohibited phrases (global list + per-record `claimRestrictions`)
- Return `ServiceValidationResult` with per-service `gatePassed`, `claimViolations`, `missingFields`
- Handle empty collection: exit 0 with `status: "pass"` and empty `services[]`
- Handle missing `website-service` blueprint: exit 0 with `status: "pass"` and skip message
- Support `--json` flag for machine-readable output
- Warn mode: report failures but exit 0; fail mode: exit non-zero on any failure
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass blocks

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `surface.service.validate` handler exists, loads service records, enforces gate and claim restrictions, handles empty collection gracefully.

**Human review:** no

---

### Step 7. Register `surface.service.validate` in command tables and pipeline

**Goal:** Wire the new command into the command registry and the `sites-check-author` pipeline.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts`, add entry for `surface.service.validate` after `surface.industry.validate` entry:
  ```ts
  {
    name: "surface.service.validate",
    description: "RFC-0496: validate service dossier records — publication gate (minimum field counts), claim policy (prohibited result-claim phrases).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/src/content/surface/services/**/*.md", "packages/ontology/blueprints/*.yaml"],
    execute: runSurfaceServiceValidate,
  },
  ```
- Import `runSurfaceServiceValidate` at the top of the file
- In `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts`, add `{ command: "surface.service.validate" }` after `{ command: "surface.industry.validate" }` (line 114)

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run command.registry.validate` (if command exists)

**Completion criterion:** `surface.service.validate` is registered in command tables and appears in the `sites-check-author` pipeline after `surface.industry.validate`.

**Human review:** no

---

### Step 8. Register no-op migrator `rfc-0496`

**Goal:** Create and register the no-op migrator required by `versionBump: minor` (RFC-0479).

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0496.ts` following the pattern of `rfc-0495.ts`:
  - `id: "rfc-0496"`
  - `fromVersion: "4.9.0"` (current platform version after RFC-0495)
  - `toVersion: "4.10.0"`
  - `description: "No-op migrator — services collection is additive. Advances migratorCursor for RFC-0496."`
  - `transform: async (data) => data` (no-op)
  - Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass blocks
- In `packages/os/site-kernel-handoff/src/migrators/registry.ts`:
  - Import `rfc0496Migrator` from `"./rfc-0496.ts"`
  - Append `rfc0496Migrator` to `migratorRegistry` array

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm exec site-kernel run migrator.registry.validate`

**Completion criterion:** `rfc-0496` migrator is registered; `migrator.registry.validate` passes.

**Human review:** no

---

### Step 9. Add `website-service` to `system.md surface.blueprints` for `warpgogol-com`

**Goal:** Enable the `website-service` surface for `warpgogol-com` so `surface.generate` emits service pages.

**Agent actions:**

- In the active mission workpiece's `src/content/system.md`, add `website-service` to the `surface.blueprints` list
- If no active mission exists, this step is deferred to the next mission's `mission.materialize` — document this in the plan

**Validation:**

- `pnpm exec site-kernel run surface.generate --site warpgogol-com` (if mission workpiece is available)
- Verify `src/surface.generated.yaml` contains `website-service` routes (empty if no service records exist)

**Completion criterion:** `system.md` declares `website-service` in `surface.blueprints`; `surface.generate` processes the new blueprint.

**Human review:** no

---

### Step 10. Documentation sync

**Goal:** Update all documentation artifacts affected by the new blueprint, command, and migrator.

**Agent actions:**

- Update `packages/AGENTS.md` — add `website-service` blueprint description to the `surface` package ownership table entry
- Update `packages/os/site-kernel-checks/AGENTS.md` — add `surface.service.validate` to the check commands table and the module table
- Update `docs/requirements.xml` if it contains surface structure rules — add `website-service` surface
- Update `docs/verification-plan.xml` if it contains surface verification rules — add `surface.service.validate`
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed

**Validation:**

- `git diff` — verify all scope.docs files are either updated or documented as not-applicable
- `pnpm exec site-kernel run rfc.validate --id RFC-0496`

**Completion criterion:** All documentation artifacts in scope are updated; `rfc.validate` passes.

**Human review:** no

---

### Step 11. Tests

**Goal:** Add unit tests for the new baker specialization, validation command, and migrator.

**Agent actions:**

- Add unit test for `website-service` depth-1 baker specialization in `packages/os/site-kernel-checks/src/surface-expand/bake.test.ts` (or co-located test file) — verify block sequence from a fixture service record
- Add unit test for `surface.service.validate` — verify gate enforcement, claim restriction detection, empty collection handling, missing blueprint handling
- Add unit test for `rfc-0496` migrator — verify no-op transform, id registration
- Add unit test for `BlueprintServiceConfig` Zod schema — verify valid/invalid configs

**Validation:**

- `pnpm --filter @gogol/surface test`
- `pnpm --filter @gogol/site-kernel-checks test`
- `pnpm --filter @gogol/site-kernel-handoff test`

**Completion criterion:** All new tests pass; existing tests still pass.

**Human review:** no

---

### Step 12. Final validation and acceptance criteria verification

**Goal:** Run the full validation suite, verify all acceptance criteria, and request human operator to stamp the RFC as implemented.

**Agent actions:**

- Run full validation suite (see section 4)
- Check off each acceptance criterion in the RFC against the implemented code
- Mark `[x]` for verified criteria; document any unchecked `[ ]` criteria with reason
- DO NOT stamp RFC or plan status as `implemented` — request human operator to run `rfc.implement.stamp --id RFC-0496 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0496`
- `pnpm --filter @gogol/surface run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm exec site-kernel run migrator.registry.validate`
- `pnpm exec site-kernel run surface.contract.validate --site warpgogol-com` (if mission workpiece available)

**Completion criterion:** All validation commands pass; all verifiable acceptance criteria are checked off; agent has requested the human operator to perform the `accepted → implemented` transition.

**Human review:** yes — the `accepted → implemented` transition requires human architecture review (RFC-0224). The operator verifies remaining runtime acceptance criteria and runs `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0496`
- `pnpm --filter @gogol/surface run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm exec site-kernel run migrator.registry.validate`
- `pnpm exec site-kernel run surface.contract.validate --site warpgogol-com` (if mission workpiece available)
- `pnpm --filter @gogol/surface test`
- `pnpm --filter @gogol/site-kernel-checks test`
- `pnpm --filter @gogol/site-kernel-handoff test`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0496.generated.json` — verification evidence (RFC-0330, if acceptance probes declared)
- Commit messages referencing `RFC-0496` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Content authoring burden | Step 9 enables the surface but `surface.service.validate` runs in warn mode (Step 7) — no blocking until operator switches to fail mode |
| False positive in claim detection | Step 6 implements full-phrase matching consistent with RFC-0492; Step 11 tests claim detection |
| Agent misinterpretation: LLM-generated service records | Step 10 updates AGENTS.md with anti-fabrication rules; service records are authored by operator, not agent |
| Baker complexity | Step 4 isolates specialization to `surfaceId === "website-service" && depth === 1`; Step 11 tests the specialization |
| Layer C break | Step 3 updates `url-schema.yaml`; Step 12 validates with `surface.contract.validate` |
| Cross-surface linking errors | Step 5 uses generated routes, not hardcoded URLs; Step 12 validates with `surface.validate` |
| Empty collection on initial deployment | Step 6 handles empty collection gracefully; Step 11 tests empty collection handling |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-24 or DNA-53, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0496 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `website-service` blueprint cannot be parsed by `parseBlueprint` due to schema constraints, do not modify the schema to accept fractional depths — create a superseding RFC that proposes a schema extension.
- If the `linking.parent` cross-surface reference cannot be resolved by the existing `expandBlueprint` orchestrator, do not add a parallel resolution path — create a superseding RFC that extends the blueprint contract.
