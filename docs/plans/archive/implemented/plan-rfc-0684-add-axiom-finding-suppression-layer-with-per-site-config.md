---
rfcId: RFC-0684
planId: PLAN-RFC-0684-01
status: draft
owner: architecture
createdAt: 2026-08-04
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - "packages/os/site-kernel-checks/AGENTS.md"
    - "docs/command-manifest.generated.yaml"
---

# Implementation Plan: RFC-0684

## 1. Objectives

- [ ] O1 — Create `suppressions-config.ts` module with Zod schemas, loaders, merger, and `applySuppressions` post-filter (acceptance: `suppressions-config.ts` module exists with schemas, loader, merger, and `applySuppressions`)
- [ ] O2 — Create `suppressions.validate` command and register it in the command table (acceptance: `suppressions.validate` command registered and passes)
- [ ] O3 — Create `systems/axiom-suppressions.yaml` with default rules for all four categories (acceptance: `systems/axiom-suppressions.yaml` exists with default rules)
- [ ] O4 — Add `--channel` flag to `mission.check` and apply suppressions after `runAxiomCheck` (acceptance: `mission.check` accepts `--channel` and applies suppressions)
- [ ] O5 — Add `suppressionSummary` to `mission.check` output (acceptance: output includes `suppressionSummary` when suppressions applied)
- [ ] O6 — Mark suppressed findings in evidence files with `suppressed: true` and `suppressedBy` reference (acceptance: suppressed findings marked in evidence)
- [ ] O7 — Update `leitstand.propagate` to skip findings marked `suppressed: true` in `isBlockingFinding` loop (acceptance: `leitstand.propagate` applies suppressions)
- [ ] O8 — Update `axiom.report` to render suppressed findings in a separate collapsible section (acceptance: `axiom.report` renders suppressed findings separately)
- [ ] O9 — Update `leitstand.dev-deploy` to pass `--channel dev` to `mission.check` (acceptance: `leitstand.dev-deploy` passes `--channel dev`)
- [ ] O10 — Integrate `suppressions.validate` into `mission.validate` pipeline (acceptance: `suppressions.validate` in pipeline)
- [ ] O11 — Run `command.manifest.generate` and update AGENTS.md (acceptance: manifest updated, AGENTS.md documents suppression layer)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/suppressions-config.ts` — NEW: Zod schemas (`suppressionRuleSchema`, `suppressionsConfigSchema`), types (`SuppressionRule`, `SuppressionsConfig`, `SuppressedBy`), loaders (`loadWorkshopSuppressions`, `loadWorkpieceSuppressions`), merger (`mergeSuppressions`), post-filter (`applySuppressions`)
- `packages/os/site-kernel-checks/src/suppressions-validate.ts` — NEW: `runSuppressionsValidate` command handler
- `packages/os/site-kernel-checks/src/axiom-adapter.ts` — MODIFIED: import `applySuppressions` + loaders, call after `runAxiomCheck`, add `--channel` flag parsing, add `suppressionSummary` to `MissionCheckResult`, write suppressed findings back to `study-run.json`
- `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts` — MODIFIED: add `channel` flag to `mission.check` entry, add `suppressions.validate` command entry
- `packages/os/site-kernel-checks/src/index.ts` — MODIFIED: export `runSuppressionsValidate` if needed by barrel
- `packages/os/site-kernel-checks/package.json` — MODIFIED: add subpath export `./suppressions-config` for cross-package import from `@warpgogol/site-kernel-handoff`
- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — MODIFIED: `runLeitstandDevDeploy` passes `--channel=dev` to `mission.check` in `runMissionCheckWithResilience`; `runLeitstandPropagate` imports `applySuppressions` via subpath export, re-applies suppressions to `study-run.json` findings, then skips `suppressed: true` in `isBlockingFinding` loop
- `packages/os/site-kernel-checks/src/pipelines/` — MODIFIED: add `suppressions.validate` to `mission.validate` pipeline

### 2.2 Configuration and data

- `systems/axiom-suppressions.yaml` — NEW: workshop-level default suppression rules (6 rules across 4 categories)

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — MODIFIED: document `suppressions-config.ts`, `suppressions-validate.ts`, `--channel` flag, suppression layer architecture
- `docs/command-manifest.generated.yaml` — REGENERATED via `command.manifest.generate`

### 2.4 Validation and pipelines

- `mission.validate` pipeline — MODIFIED: add `suppressions.validate` step after `methodologies.validate`
- Unit tests in `packages/os/site-kernel-checks/src/tests/` — NEW: `suppressions-config.test.ts`, `suppressions-validate.test.ts`

## 3. Step sequence

### Step 1. Create `suppressions-config.ts` module (contracts)

**Goal:** Define Zod schemas, types, loaders, merger, and post-filter function.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/suppressions-config.ts`
- Define `suppressionRuleSchema` with fields: `ruleId`, `category`, `channel?`, `channelNot?`, `contentType?`, `urlPattern?`, `messagePattern?`, `descriptionPattern?`, `reason`
- Define `suppressionsConfigSchema` with `suppressions: SuppressionRule[]`
- Export types: `SuppressionRule`, `SuppressionsConfig`, `SuppressedBy`
- Export constants: `WORKSHOP_SUPPRESSIONS_PATH = "systems/axiom-suppressions.yaml"`, `WORKPIECE_SUPPRESSIONS_PATH = "axiom-suppressions.yaml"`
- Implement `loadWorkshopSuppressions(workspaceRoot)`: read `systems/axiom-suppressions.yaml`, parse YAML, validate with Zod, return `undefined` if file doesn't exist
- Implement `loadWorkpieceSuppressions(missionDir)`: read `missions/{mission}/workpiece/axiom-suppressions.yaml`, same pattern
- Implement `mergeSuppressions(workshop, workpiece)`: concatenate workshop rules + workpiece rules. Per-site rules cannot un-suppress workshop rules — they can only add new suppressions. Return `SuppressionRule[]`.
- Implement `applySuppressions(findings, rules, context)`: pure function, returns new array. For each finding, evaluate rules in order. First matching rule wins. Match logic: `ruleId` must match finding's ruleId, then ALL specified conditions must match (AND logic). If matched, set `suppressed: true` and `suppressedBy: { ruleIndex, ruleId, category, reason }`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` compiles without errors

**Completion criterion:** `suppressions-config.ts` exists with all exported types, schemas, loaders, merger, and `applySuppressions` function. Build passes.

**Human review:** no

---

### Step 2. Create `suppressions.validate` command handler

**Goal:** Implement the validation command for suppression configs.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/suppressions-validate.ts`
- Implement `runSuppressionsValidate(input, context)`: load `systems/axiom-suppressions.yaml` via `loadWorkshopSuppressions`, validate schema, check for conflicting rules (same `ruleId` + same conditions), warn on unknown rule IDs (collect rule IDs from most recent `study-run.json` in any mission evidence directory; skip if no evidence), warn on broad patterns (single-word `messagePattern` or `descriptionPattern` < 10 chars)
- Return `CheckResult` with diagnostics and summary
- Register in `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts` as a new entry: `name: "suppressions.validate"`, `scope: "workspace"`, `execute: runSuppressionsValidate`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` compiles
- `pnpm exec werkstatt run suppressions.validate --json` (after Step 3 creates the YAML file)

**Completion criterion:** `suppressions.validate` command registered, compiles, and passes on the default config file.

**Human review:** no

---

### Step 3. Create `systems/axiom-suppressions.yaml` with default rules

**Goal:** Ship the workshop-level default suppression config.

**Agent actions:**

- Create `systems/axiom-suppressions.yaml` with 6 rules across 4 categories as specified in the RFC Design section
- Each rule has: `ruleId`, `category`, condition field(s), `reason`

**Validation:**

- `pnpm exec werkstatt run suppressions.validate --json` passes with zero errors

**Completion criterion:** `systems/axiom-suppressions.yaml` exists with all 6 default rules. `suppressions.validate` passes.

**Human review:** no

---

### Step 4. Add `--channel` flag and suppression post-filter to `mission.check`

**Goal:** Apply suppressions after `runAxiomCheck` and include `suppressionSummary` in output.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/axiom-adapter.ts`:
  - Import `loadWorkshopSuppressions`, `loadWorkpieceSuppressions`, `mergeSuppressions`, `applySuppressions` from `./suppressions-config.ts`
  - Add `--channel` flag parsing (default `"main"`) in `runMissionCheck`
  - After `runAxiomCheck` returns and evidence files are read via `readEvidenceFiles()`, call `applySuppressions(findings, mergedRules, { channel })`
  - Write the suppressed findings back to `study-run.json` (so `leitstand.propagate` can read the `suppressed: true` flags)
  - Add `suppressionSummary` to `MissionCheckResult`: `{ totalSuppressed: number, byCategory: Record<string, number> }`
  - Exclude suppressed findings from `findingsCount` and `findings` counts
  - Evaluate `closureDecision` on non-suppressed findings only
- In `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts`:
  - Add `channel` flag to `mission.check` command table entry: `kind: "string", description: "Deployment channel (dev|alt|main). Defaults to main."`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` compiles
- Unit test: `applySuppressions` correctly marks findings and excludes them from counts

**Completion criterion:** `mission.check` accepts `--channel`, applies suppressions, writes `suppressed: true` to `study-run.json`, includes `suppressionSummary` in output, and excludes suppressed findings from counts/closure.

**Human review:** no

---

### Step 5. Update `leitstand.propagate` to re-apply suppressions and skip suppressed findings

**Goal:** Ensure `leitstand.propagate` handles pre-suppression evidence and does not block on suppressed findings.

**Agent actions:**

- In `packages/os/site-kernel-checks/package.json`:
  - Add subpath export `"./suppressions-config": "./src/suppressions-config.ts"` to `exports` field
- In `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`:
  - Import `applySuppressions`, `loadWorkshopSuppressions`, `loadWorkpieceSuppressions`, `mergeSuppressions` from `@warpgogol/site-kernel-checks/suppressions-config`
  - In `runLeitstandPropagate`, after reading `studyRun.findings` (around line 1257), re-apply suppressions:
    - Load workshop suppressions via `loadWorkshopSuppressions(workspaceRoot)`
    - Load workpiece suppressions via `loadWorkpieceSuppressions(missionDir)` (if exists)
    - Merge via `mergeSuppressions(workshop, workpiece)`
    - Apply via `applySuppressions(studyRun.findings, mergedRules, { channel: "alt" })`
    - Use the returned array (with `suppressed: true` flags) for the blocking evaluation
  - In the `isBlockingFinding` loop (around line 1279), filter: `const blockingFindings = methodologyFindings.filter((f) => !f.suppressed && isBlockingFinding(f, methodology.id, blockOn))`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` compiles (verifies subpath export resolves)
- Unit test: `leitstand.propagate` re-applies suppressions to old evidence without `suppressed` flags and does not block on suppressed findings

**Completion criterion:** `leitstand.propagate` re-applies suppressions via `applySuppressions` subpath export, then skips findings with `suppressed: true` in the blocking evaluation. Pre-suppression evidence is handled without requiring re-run.

**Human review:** no

---

### Step 6. Update `leitstand.dev-deploy` to pass `--channel dev`

**Goal:** Ensure `leitstand.dev-deploy` passes the correct channel to `mission.check`.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`:
  - In `runMissionCheckWithResilience`, add `--channel=dev` to the `argv` array (after `--no-report` or similar)
  - The channel is always `dev` for `leitstand.dev-deploy` (it deploys to the dev channel)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` compiles

**Completion criterion:** `runMissionCheckWithResilience` passes `--channel=dev` to `mission.check`.

**Human review:** no

---

### Step 7. Update `axiom.report` to render suppressed findings separately

**Goal:** Distinguish suppressed findings from active findings in the HTML report.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/axiom-adapter.ts`:
  - In `runAxiomReport`, after reading evidence files, partition findings into `activeFindings` and `suppressedFindings` based on `suppressed: true` flag
  - Pass both arrays to `renderAxiomReportHtml` (or wrap/extend the render call) so the HTML report shows:
    - Active findings as before
    - Suppressed findings in a separate collapsible "Suppressed Findings" section, greyed out
    - Suppression summary count in the report header
  - If `renderAxiomReportHtml` from `@syrokomskyi/axiom-factory-app` does not support a separate suppressed section, post-process the HTML to inject the section

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` compiles
- Manual check: generated `report.html` contains a "Suppressed Findings" section when suppressed findings exist

**Completion criterion:** `axiom.report` renders suppressed findings in a separate section, visually de-emphasized, with summary count in header.

**Human review:** no

---

### Step 8. Integrate `suppressions.validate` into `mission.validate` pipeline

**Goal:** Catch suppression config errors before mission close.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/pipelines/` (or wherever `mission.validate` pipeline is defined):
  - Add `suppressions.validate` as a pipeline step after `methodologies.validate`
  - The step should be non-fatal (warning) if `systems/axiom-suppressions.yaml` doesn't exist — suppressions are optional

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` compiles

**Completion criterion:** `suppressions.validate` runs as part of `mission.validate` pipeline.

**Human review:** no

---

### Step 9. Write unit tests

**Goal:** Test the suppression config schema, loaders, merger, post-filter, and validate command.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/suppressions-config.test.ts`:
  - Schema validation: valid config passes, missing `reason` fails, missing `ruleId` fails, missing `category` fails
  - `loadWorkshopSuppressions`: returns `undefined` when file doesn't exist, returns parsed config when file exists
  - `mergeSuppressions`: workshop + workpiece rules are concatenated, workpiece cannot un-suppress workshop rules
  - `applySuppressions`: pure function (input array not modified), first matching rule wins, AND logic for combined conditions, `channelNot` condition, `contentType` condition, `messagePattern` condition, `descriptionPattern` condition, no match returns findings unchanged
- Create `packages/os/site-kernel-checks/src/tests/suppressions-validate.test.ts`:
  - Valid config passes, schema violation fails, conflicting rules error, broad pattern warning, unknown ruleId warning (with mock evidence)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test` — all tests pass

**Completion criterion:** All unit tests pass. `applySuppressions` purity verified. All condition types tested.

**Human review:** no

---

### Step 10. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update `packages/os/site-kernel-checks/AGENTS.md` with new modules: `suppressions-config.ts`, `suppressions-validate.ts`, `--channel` flag on `mission.check`, suppression layer architecture
- Run `pnpm exec werkstatt run command.manifest.generate` to update `docs/command-manifest.generated.yaml`
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0684`
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0684` (RFC-0330 — acceptance probes are commented out, so this will produce no evidence file, which is expected)
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: invoke `fo-fix` if review has findings
- Check off acceptance criteria: verify each criterion against implemented code
- Stamp: `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0684 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0684`
- Review report exists in `docs/reviews/code/` for this session
- `docs/command-manifest.generated.yaml` contains `suppressions.validate` and `--channel` flag on `mission.check`

**Completion criterion:** All documentation artifacts updated; code review passed; all acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0684`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm exec werkstatt run suppressions.validate --json`
- `pnpm exec werkstatt run command.manifest.generate`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0684` (no evidence file expected — probes commented out)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0684.generated.json` — verification evidence (may not be produced if probes are commented out)
- Commit messages referencing `RFC-0684` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Over-suppression (broad patterns) | Step 2: `suppressions.validate` warns on broad patterns. Step 9: test broad pattern detection. |
| Rule ID drift (Axiom renames rules) | Step 2: `suppressions.validate` warns on unknown rule IDs collected from `study-run.json`. |
| Agent misuse (hiding real issues) | Step 1: `reason` field required. Step 10: `fo-review` flags new suppression rules. |
| Per-site override conflict | Step 1: `mergeSuppressions` enforces per-site cannot un-suppress workshop. Step 9: test merge semantics. |
| Pre-suppression evidence blocks propagate | Step 5: `leitstand.propagate` re-applies suppressions via `applySuppressions` to old evidence without `suppressed` flags. No re-run required. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49 or DNA-59, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0684 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `renderAxiomReportHtml` from `@syrokomskyi/axiom-factory-app` cannot be extended to support a separate suppressed section (Step 7), post-process the HTML output in `axiom-adapter.ts` — do not modify the external package.
