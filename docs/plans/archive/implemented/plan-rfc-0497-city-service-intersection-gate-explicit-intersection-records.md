---
rfcId: RFC-0497
planId: PLAN-RFC-0497-01
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
    - packages/os/site-kernel-checks/AGENTS.md
    - packages/os/site-kernel-handoff/src/migrators/registry.ts
---

# Implementation Plan: RFC-0497

## 1. Objectives

- [ ] O1 — Intersection record content collection loaded by surface expand pipeline — maps to acceptance criterion [surface/intersections collection exists and is loaded]
- [ ] O2 — Depth-5 pages require approved intersection records — maps to acceptance criterion [surface.generate does not emit depth-5 without approved record]
- [ ] O3 — `surface.intersection.validate` enforces gate, similarity, substance independence — maps to acceptance criterion [surface.intersection.validate enforces]
- [ ] O4 — `surface.intersection.report` generates scaling report — maps to acceptance criterion [surface.intersection.report generates]
- [ ] O5 — Baker emits only intersection-specific blocks — maps to acceptance criterion [baker does not re-render inherited prose]
- [ ] O6 — No-op migrator `rfc-0497` registered — maps to acceptance criterion [migrator registered, migrator.registry.validate passes]
- [ ] O7 — Depth-5 URLs without intersection records return 404 — maps to acceptance criterion [old URLs return 404]
- [ ] O8 — Documentation synced (AGENTS.md, CHANGE_SUMMARY blocks) — maps to acceptance criterion [rfc.validate passes]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/surface/src/blueprint.ts` — add `BlueprintIntersectionConfig`, `IntersectionGate`, `IntersectionSimilarity` interfaces; add `intersection?: BlueprintIntersectionConfig` to `BlueprintLevel`
- `packages/surface/src/blueprint-schema.ts` — add `intersectionSchema` (Zod); add to `blueprintLevelSchema`
- `packages/os/site-kernel-checks/src/surface-expand/expand.ts` — load `intersections` dataset via `loadDataset(appDir, "intersections", lang)`; pass to `applyIntersectionGate`
- `packages/os/site-kernel-checks/src/surface-expand/pipeline.ts` — add `applyIntersectionGate` function (pure, drops depth-5 entries without approved intersection records)
- `packages/os/site-kernel-checks/src/surface-expand/bake.ts` — replace depth-5 baker specialization with intersection-specific block emission
- `packages/os/site-kernel-checks/src/surface-expand/bake-helpers.ts` — add `intersectionQuestions`, `intersectionConstraints`, `intersectionEvidence`, `intersectionContentBlocks` helpers
- `packages/os/site-kernel-checks/src/surface-intersection-validate.ts` — new command handler for `surface.intersection.validate`
- `packages/os/site-kernel-checks/src/surface-intersection-report.ts` — new command handler for `surface.intersection.report`
- `packages/os/site-kernel-checks/src/surface-doorway-risk.ts` — update to also check for intersection records at depth-5
- `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts` — register `surface.intersection.validate` and `surface.intersection.report`
- `packages/os/site-kernel-handoff/src/migrators/rfc-0497.ts` — new no-op migrator
- `packages/os/site-kernel-handoff/src/migrators/registry.ts` — append `rfc0497Migrator`

### 2.2 Configuration and data

- `packages/ontology/blueprints/website-local.yaml` — add `intersection` config block to depth-5 level (gate thresholds, similarity thresholds, substanceIndependenceThreshold, mode: warn)

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — add command table entries for `surface.intersection.validate` and `surface.intersection.report`
- `packages/os/site-kernel-handoff/src/migrators/registry.ts` — update `CHANGE_SUMMARY` Compass block with `RFC-0497` entry
- `packages/surface/src/blueprint.ts` — update `CHANGE_SUMMARY` Compass block with `RFC-0497` entry
- `packages/surface/src/blueprint-schema.ts` — update `CHANGE_SUMMARY` Compass block with `RFC-0497` entry
- `packages/os/site-kernel-checks/src/surface-expand/pipeline.ts` — update `CHANGE_SUMMARY` Compass block with `RFC-0497` entry
- `packages/os/site-kernel-checks/src/surface-expand/bake.ts` — update `CHANGE_SUMMARY` Compass block with `RFC-0497` entry

### 2.4 Validation and pipelines

- `build.check` — gains `surface.intersection.validate` (warn mode) and `surface.intersection.report` (diagnostic)
- `build.prepare` — `surface.generate` now applies intersection gate
- `migrator.registry.validate` — must pass with new migrator

## 3. Step sequence

### Step 1. Surface package: intersection types and Zod schema

**Goal:** Add `BlueprintIntersectionConfig` types and `intersectionSchema` to `@gogol/surface`.

**Agent actions:**

- Add `BlueprintIntersectionConfig`, `IntersectionGate`, `IntersectionSimilarity` interfaces to `packages/surface/src/blueprint.ts`
- Add optional `intersection?: BlueprintIntersectionConfig` field to `BlueprintLevel`
- Add `intersectionSchema` (Zod) to `packages/surface/src/blueprint-schema.ts`
- Add `intersectionSchema` to `blueprintLevelSchema`
- Update `CHANGE_SUMMARY` Compass blocks in both files with `RFC-0497` entries

**Validation:**

- `pnpm --filter @gogol/surface run build:check`

**Completion criterion:** `@gogol/surface` builds with the new types and schema; `intersectionSchema` validates the `BlueprintIntersectionConfig` shape.

**Human review:** no

---

### Step 2. Blueprint YAML: add intersection config to website-local

**Goal:** Add the `intersection` config block to the depth-5 level of `website-local.yaml`.

**Agent actions:**

- Add `intersection` config block to depth-5 level in `packages/ontology/blueprints/website-local.yaml` with:
  - `gate`: minLocalServiceQuestions: 3, minScenarios: 2, minLocalEvidence: 2, minUniqueContentBlocks: 1, minUniqueFaq: 3, minSources: 1
  - `similarity`: similarityToIndustryPage: 0.70, similarityToCityPage: 0.70, similarityToServicePage: 0.70, similarityToOtherIntersections: 0.70
  - `substanceIndependenceThreshold`: 0.50
  - `mode`: warn

**Validation:**

- `pnpm --filter @gogol/ontology build:check`

**Completion criterion:** `website-local.yaml` validates against the updated `blueprintLevelSchema` with `intersection` block.

**Human review:** no

---

### Step 3. Pipeline: add `applyIntersectionGate` to `pipeline.ts`

**Goal:** Add the pure intersection gate function that drops depth-5 entries without approved intersection records.

**Agent actions:**

- Add `applyIntersectionGate` function to `packages/os/site-kernel-checks/src/surface-expand/pipeline.ts`
- The function takes entries, intersection records, and the blueprint's intersection config; drops depth-5 entries that lack a matching intersection record with `publicationDecision: approved`
- The function is pure (no I/O) — consistent with existing `applyExistenceGates`
- Update `CHANGE_SUMMARY` Compass block with `RFC-0497` entry

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `applyIntersectionGate` compiles and is exported from `pipeline.ts`.

**Human review:** no

---

### Step 4. Expand: load intersection records and wire gate

**Goal:** Load `surface/intersections/{lang}/*.md` in `expand.ts` and pass to `applyIntersectionGate`.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/surface-expand/expand.ts`, add `loadDataset(appDir, "intersections", lang)` call
- Match intersection records to depth-5 entries by joining on `industryId` (axes.industry), `cityId` (axes.city), `serviceId` (axes.demand)
- Call `applyIntersectionGate` after `applyExistenceGates` in the pipeline
- Update `CHANGE_SUMMARY` Compass block with `RFC-0497` entry

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `expand.ts` loads intersection records and passes them to `applyIntersectionGate`; depth-5 entries without approved records are dropped.

**Human review:** no

---

### Step 5. Baker: replace depth-5 specialization with intersection-specific blocks

**Goal:** Replace the depth-5 baker in `bake.ts` to emit only intersection-specific blocks.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/surface-expand/bake.ts`, replace the depth-5 baker specialization
- Emit only intersection-specific blocks: hero, cardGrid (questions), listCards (constraints), md (booking context), md (evidence), md (unique content blocks), ctaBlock
- Add helpers to `bake-helpers.ts`: `intersectionQuestions`, `intersectionConstraints`, `intersectionEvidence`, `intersectionContentBlocks`
- Do NOT render demand record fields on intersection pages
- Update `CHANGE_SUMMARY` Compass blocks with `RFC-0497` entries

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** Depth-5 baker emits only intersection-specific blocks from the intersection record; no inherited prose from parent pages.

**Human review:** no

---

### Step 6. Command: `surface.intersection.validate`

**Goal:** Add the `surface.intersection.validate` command handler.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/surface-intersection-validate.ts`
- Implement `runSurfaceIntersectionValidate` — enforces minimum gate (field counts), similarity thresholds (shingle method from `surface-quality.ts`), substance independence test (token-count delta)
- Return `IntersectionValidationResult` JSON shape
- Support warn mode (`intersection.mode: "warn"`) — report but exit 0
- Register in `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `surface.intersection.validate` command compiles and is registered in the command table.

**Human review:** no

---

### Step 7. Command: `surface.intersection.report`

**Goal:** Add the `surface.intersection.report` command handler.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/surface-intersection-report.ts`
- Implement `runSurfaceIntersectionReport` — generates scaling report (industry pages, city pages, service pages, intersections, indexable, noindex, missing evidence, duplicate similarity, doorway risk)
- Return `IntersectionReportData` JSON shape
- Always exits 0 (diagnostic)
- Register in `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `surface.intersection.report` command compiles and is registered in the command table.

**Human review:** no

---

### Step 8. Update `surface.doorway-risk.report` for intersection records

**Goal:** Update the existing doorway-risk report to also check for intersection records at depth-5.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/surface-doorway-risk.ts`, add depth-5 intersection record checks alongside the existing depth-4 city record checks
- Flag depth-5 entries that lack an approved intersection record

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `surface.doorway-risk.report` checks both depth-4 city records and depth-5 intersection records.

**Human review:** no

---

### Step 9. Migrator: register no-op `rfc-0497`

**Goal:** Register the no-op migrator for `versionBump: minor`.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0497.ts` — no-op migrator (same pattern as `rfc-0495.ts`)
- Import and append `rfc0497Migrator` in `packages/os/site-kernel-handoff/src/migrators/registry.ts`
- Update `CHANGE_SUMMARY` Compass block in `registry.ts` with `RFC-0497` entry

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm exec site-kernel run migrator.registry.validate`

**Completion criterion:** `migrator.registry.validate` passes with the new `rfc-0497` migrator registered.

**Human review:** no

---

### Step 10. Pipeline integration: wire `surface.intersection.validate` into `build.check`

**Goal:** Integrate the new validation command into the build check pipeline.

**Agent actions:**

- Add `surface.intersection.validate` (warn mode) to the `build.check` pipeline in the appropriate pipeline constant file
- Add `surface.intersection.report` (diagnostic) to `build.check`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** Both new commands are wired into `build.check`.

**Human review:** no

---

### Step 11. Tests

**Goal:** Add unit tests for the new pure functions and command handlers.

**Agent actions:**

- Add tests for `applyIntersectionGate` in `packages/os/site-kernel-checks/src/tests/surface-intersection-gate.test.ts` — test depth-5 entries with/without approved records, entries at other depths unaffected
- Add tests for `surface.intersection.validate` — test gate enforcement, similarity thresholds, substance independence test, warn vs fail mode
- Add tests for `surface.intersection.report` — test scaling report counts
- Add tests for the depth-5 baker specialization — test only intersection-specific blocks are emitted

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run test`

**Completion criterion:** All new tests pass.

**Human review:** no

---

### Step 12. Documentation sync and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, verify acceptance criteria, and request human operator to stamp the RFC as implemented.

**Agent actions:**

- Update `packages/os/site-kernel-checks/AGENTS.md` command table with `surface.intersection.validate` and `surface.intersection.report`
- Verify every file listed in `scope.docs` is updated — check each path against `git diff`
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- DO NOT stamp RFC or plan status as `implemented` — request the human operator to run `rfc.implement.stamp --id RFC-0497 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0497`
- `pnpm --filter @gogol/surface run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm exec site-kernel run migrator.registry.validate`
- Every file in `scope.docs` is either updated or documented as not-applicable.

**Completion criterion:** All documentation artifacts in scope are updated; all verifiable acceptance criteria are checked off; agent has requested the human operator to perform the `accepted → implemented` transition.

**Human review:** yes — the `accepted → implemented` transition requires human architecture review (RFC-0224). The operator verifies remaining runtime acceptance criteria and runs `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0497`
- `pnpm --filter @gogol/surface run build:check`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-checks run test`
- `pnpm exec site-kernel run migrator.registry.validate`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0497` in the subject line (RFC-0265 commit hygiene)
- `docs/rfcs/verification/rfc-0497.generated.json` — verification evidence (RFC-0330, if acceptance probes declared)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| SEO disruption from depth-5 pages disappearing | Step 4 (gate drops entries) — pages return 404, sitemap regenerated |
| Content authoring burden | Step 2 (warn mode in blueprint) — does not block initially |
| False positive in substance independence test | Step 6 (validate) — threshold configurable, test skips absent elements |
| O(N²) similarity computation | Step 6 (validate) — current dataset is small; future optimization noted in RFC |
| Agent misinterpretation: LLM-generated intersection records | Step 12 (docs) — AGENTS.md notes prohibit LLM-generated content |
| Migrator not registered | Step 9 (migrator) — no-op migrator registered and validated |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-24 or DNA-53, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0497 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the substance independence test cannot be implemented with the existing `pageText()` + `tokenize()` helpers (e.g., because the block structure doesn't allow element removal by string replacement), escalate to the operator — do not invent a new scoring method without RFC approval.
