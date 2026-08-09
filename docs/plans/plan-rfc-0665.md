---
rfcId: RFC-0665
planId: PLAN-RFC-0665-01
date: 2026-08-03
status: draft
---

# Implementation Plan: RFC-0665

## Prerequisite

**External package dependency**: `runActiveMethodologies` must be implemented in `@syrokomskyi/axiom-methodology` (external, linked from `../../../../pipelines/packages/axiom/`). This is outside the Werkstatt monorepo. The Werkstatt-side implementation is split into two phases:

- **Phase 1 (implementable now)**: Config schema, `methodologies.validate` command, pipeline registration, `leitstand.propagate` gate update, `axiom.report` extension, `systems/methodologies.md` creation, `onboarding.scaffold` update, `AGENTS.md` update, command table registration, tests.
- **Phase 2 (blocked on external)**: `mission-check.ts` refactoring — remove direct imports, replace with `runActiveMethodologies` call. This step CANNOT be completed until the external package ships `runActiveMethodologies`. The acceptance criterion "mission.check no longer imports extractAxeResult, runAccessibilityInstrument, createAutomatedWebAccessibilityMethodology, or findingsForObservation directly" is blocked on Phase 2.

## Steps

### Step 1: Create `methodologies-config.ts` schema + loader

**File**: `packages/os/site-kernel-checks/src/methodologies-config.ts`

- Define Zod schemas: `instrumentConfigSchema`, `methodologyConfigSchema`, `gateConfigSchema`, `methodologiesConfigSchema`, `methodologyEvidenceSchema`, `evidenceMetadataSchema`.
- Export types: `MethodologiesConfig`, `InstrumentConfig`, `MethodologyConfig`, `GateConfig`, `MethodologyEvidence`.
- Implement `loadMethodologiesConfig(workspaceRoot: string): MethodologiesConfig` — reads `systems/methodologies.md`, parses YAML frontmatter, validates with Zod.
- Implement `parseMethodologiesConfig(content: string): MethodologiesConfig` — pure function for testing.
- Known methodology IDs: validate against the 8 factories in `@syrokomskyi/axiom-methodology` fixtures.
- Known instrument types: validate against the 8 instrument types.

**Validation**: `pnpm --filter @warpgogol/site-kernel-checks build:check`

### Step 2: Create `methodologies.validate` command

**File**: `packages/os/site-kernel-checks/src/methodologies-validate.ts`

- Implement `runMethodologiesValidate(input, context)`:
  - Read `systems/methodologies.md` from workspace root.
  - Parse + validate config.
  - Check each methodology `id` is a known methodology ID (from the 8 fixtures).
  - Check each methodology `instrument` references a declared instrument `id`.
  - Check each instrument `type` is a known instrument type.
  - Return JSON output with `instruments`, `methodologies`, `activeMethodologies`, `gate` counts.
- Exit codes: 0=pass, 1=invalid config, 2=file not found.
- Failure modes: `METH-VAL-01` (file not found), `METH-VAL-02` (schema violation), `METH-VAL-03` (unknown methodology id), `METH-VAL-04` (unknown instrument ref).

**File**: `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts`

- Add `methodologies.validate` entry to the command table.
- Scope: `workspace`. `supportsAllSites: false`. `mutatesState: false`. `cacheable: false`.

**File**: `packages/os/site-kernel-checks/src/module.ts`

- Register the command handler.

**Validation**: `pnpm --filter @warpgogol/site-kernel-checks build:check && pnpm --filter @warpgogol/site-kernel-checks test`

### Step 3: Add `methodologies.validate` to `packages-check.run` pipeline

**File**: `packages/os/site-kernel-checks/src/pipelines/packages-check.ts`

- Add `{ command: "methodologies.validate" }` to `PACKAGES_CHECK_PIPELINE`.
- Place it after `yaml.parse.validate` (line 187) since it parses YAML frontmatter.

**Validation**: `pnpm --filter @warpgogol/site-kernel-checks build:check`

### Step 4: Create `systems/methodologies.md` config file

**File**: `systems/methodologies.md`

- Use the exact config from RFC-0665 Design section (lines 138-210).
- 8 instruments, 8 methodologies (visual-regression `active: false`), gate `all-must-pass`.

**Validation**: `pnpm exec werkstatt run methodologies.validate`

### Step 5: Update `leitstand.propagate` gate logic

**File**: `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`

- In the propagate gate section (around line 1023-1109):
  - Read `methodologies[]` from `evidence-metadata.json`.
  - If `methodologies[]` is absent, reject with `"Evidence predates RFC-0665 (no methodologies[] field). Re-run leitstand.dev-deploy to generate current evidence."` Exit code 1.
  - For each methodology in `methodologies[]`:
    - Filter `study-run.json` findings where `finding.methodologyId === methodology.id`.
    - Filter findings where `finding.severity` is in `methodology.blockOn`.
    - If any findings remain, fail with per-methodology violation count.
  - Keep the existing `accessibility.axe.violation` predicate check as a fallback for old evidence that has `methodologies[]` but still uses the old predicate format. Actually no — if `methodologies[]` is present, use the new gate. If absent, reject.
  - Incomplete findings do not block (existing behavior preserved).

**Validation**: `pnpm --filter @warpgogol/site-kernel-handoff build:check && pnpm --filter @warpgogol/site-kernel-handoff test`

### Step 6: Extend `axiom.report` with gate summary + per-methodology sections

**File**: `packages/os/site-kernel-checks/src/axiom-report.ts`

- In `renderAxiomReportHtml`:
  - Read `methodologies[]` from `evidence-metadata.json`.
  - If `methodologies[]` is absent, gracefully degrade to the old single-methodology format (existing behavior, with a warning).
  - If `methodologies[]` is present:
    - Add a "Gate Summary" section showing pass/fail per methodology.
    - Group findings by `methodologyId` in the findings-by-severity and findings-by-page sections.
  - The existing 9 sections are preserved; the gate summary is inserted after the header.

**Validation**: `pnpm --filter @warpgogol/site-kernel-checks build:check && pnpm --filter @warpgogol/site-kernel-checks test`

### Step 7: Update `onboarding.scaffold` to create `systems/methodologies.md` if absent

**File**: `packages/os/site-kernel-onboarding/src/` (find the scaffold handler)

- In the scaffold handler:
  - Check if `systems/methodologies.md` already exists.
  - If it exists, skip creation (log: "systems/methodologies.md already exists, skipping").
  - If it does not exist, create it with the default config (8 methodologies, visual-regression `active: false`).

**Validation**: `pnpm --filter @warpgogol/site-kernel-onboarding build:check`

### Step 8: Update `mission-check.ts` — extend `evidence-metadata.json` with `methodologies[]`

**File**: `packages/os/site-kernel-checks/src/mission-check.ts`

- Read `systems/methodologies.md` config at the start of `runMissionCheck`.
- If config not found, fail with `"systems/methodologies.md not found. Create it or run onboarding.scaffold."` Exit code 2.
- For each active methodology in the config, compute its digest (via `methodologyPackageDigest`).
- Write `methodologies[]` array to `evidence-metadata.json` with `id`, `digest`, `blockOn` for each active methodology.
- **Phase 2 (blocked)**: Replace the direct capture/instrument/finding-projection code with a call to `runActiveMethodologies` from the external package. Until the external package ships, keep the existing single-methodology capture path but still write the `methodologies[]` metadata (with only `automated-web-accessibility` active).

**Validation**: `pnpm --filter @warpgogol/site-kernel-checks build:check && pnpm --filter @warpgogol/site-kernel-checks test`

### Step 9: Update `AGENTS.md` to document `systems/methodologies.md`

**File**: `AGENTS.md` (root)

- Add a section under the existing Axiom/Leitstand documentation:
  - Document `systems/methodologies.md` as the workshop-level methodologies config.
  - Document the per-methodology gate in `leitstand.propagate`.
  - Document `methodologies.validate` as a workspace-scoped command in `packages-check.run`.

**File**: `packages/os/site-kernel-checks/AGENTS.md`

- Add `methodologies-config.ts` and `methodologies-validate.ts` to the module table.

**File**: `packages/os/site-kernel-handoff/AGENTS.md`

- Update the Leitstand section to document the per-methodology gate.

### Step 10: Write tests

**File**: `packages/os/site-kernel-checks/src/tests/methodologies-config.test.ts`

- Test `parseMethodologiesConfig` with valid config, invalid config (schema violations), unknown methodology id, unknown instrument ref.
- Test `loadMethodologiesConfig` with a temp workspace.

**File**: `packages/os/site-kernel-checks/src/tests/methodologies-validate.test.ts`

- Test `runMethodologiesValidate` with valid config, missing file, invalid schema, unknown methodology, unknown instrument.

**File**: `packages/os/site-kernel-checks/src/tests/mission-check-rfc-0665.test.ts`

- Test that `evidence-metadata.json` contains `methodologies[]` with correct `id`, `digest`, `blockOn`.
- Test that `mission.check` fails when `systems/methodologies.md` is missing.

**File**: `packages/os/site-kernel-handoff/src/tests/leitstand-propagate-rfc-0665.test.ts`

- Test that `leitstand.propagate` rejects pre-RFC-0665 evidence (missing `methodologies[]`).
- Test per-methodology gate: methodology with `blockOn: [high, critical]` fails on high finding, passes on medium finding.
- Test that incomplete findings do not block.

**File**: `packages/os/site-kernel-checks/src/tests/axiom-report-rfc-0665.test.ts`

- Test `renderAxiomReportHtml` with `methodologies[]` present — gate summary rendered.
- Test `renderAxiomReportHtml` with `methodologies[]` absent — graceful degradation.

### Step 11: Update command manifest + docs

**File**: `docs/COMMANDS.md` (if it exists as a generated file, run the generator)

- Run `site-kernel run command.manifest.validate` to verify the manifest is in sync.
- Run `site-kernel run docs.commands.validate` to verify command docs are in sync.

### Step 12: Validate + commit

- Run `pnpm --filter @warpgogol/site-kernel-checks build:check`
- Run `pnpm --filter @warpgogol/site-kernel-checks test`
- Run `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff test`
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0665`
- Run `pnpm exec werkstatt pipeline packages-check.run` (verify `methodologies.validate` passes)
- Commit all changes.

## Blocked steps (Phase 2 — external package)

### Step 13 (BLOCKED): Refactor `mission-check.ts` to use `runActiveMethodologies`

**Blocked on**: `runActiveMethodologies` implementation in `@syrokomskyi/axiom-methodology` (external package).

- Remove imports: `extractAxeResult`, `runAccessibilityInstrument`, `createAutomatedWebAccessibilityMethodology`, `findingsForObservation`.
- Replace capture + instrument + projection code with `runActiveMethodologies` call.
- This step cannot be completed from within the Werkstatt monorepo.

## Evidence

- `systems/methodologies.md` exists and `methodologies.validate` passes → acceptance criterion 1-2
- `methodologies.validate` in `packages-check.run` pipeline → acceptance criterion 3
- `mission.check` reads config and writes `methodologies[]` to evidence-metadata → acceptance criterion 4-6 (partial — full delegation blocked on Phase 2)
- `leitstand.propagate` per-methodology gate → acceptance criterion 7-9
- `axiom.report` gate summary → acceptance criterion 10
- `onboarding.scaffold` conditional creation → acceptance criterion 11
- `leitstand.propagate` rejects pre-RFC-0665 evidence → acceptance criterion 12
- `axiom.report` graceful degradation → acceptance criterion 13
- `AGENTS.md` updated → acceptance criterion 14
- `rfc.validate` passes → acceptance criterion 15
