---
rfcId: RFC-0532
planId: PLAN-RFC-0532-01
status: draft
owner: architecture
createdAt: 2026-07-25
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel-onboarding"
    - "@gogol/site-kernel-handoff"
  services: []
  docs:
    - "packages/os/site-kernel-onboarding/AGENTS.md"
    - "packages/os/site-kernel-handoff/AGENTS.md"
    - "AGENTS.md"
    - "docs/COMMANDS.md"
---

# Implementation Plan: RFC-0532

## 1. Objectives

- [ ] O1 — Remove old onboarding commands and files (maps to acceptance: old commands removed, phase-contract.ts + scaffold.ts deleted)
- [ ] O2 — Implement `onboarding.synthesize` command in new `synthesize.ts` (maps to acceptance: synthesize registered, validates brief, writes input-manifest.json)
- [ ] O3 — Extend `sternsystem.register` with pin, content stubs, mission opening, materialization, and amend flags (maps to acceptance: extended in site-kernel-handoff, creates registry entry + pin + mission)
- [ ] O4 — Create `fo-onboard` forge skill (maps to acceptance: skill exists at .agents/skills/fo-onboard/SKILL.md, orchestrates pipeline)
- [ ] O5 — Delete old workflows and stale onboarding data (maps to acceptance: workflows deleted, onboarding/.input + .output deleted)
- [ ] O6 — Update documentation and Compass sync (maps to acceptance: AGENTS.md files updated, docs/COMMANDS.md + docs/*.xml updated)

## 2. Affected artifacts

### 2.1 Code and commands

**`@gogol/site-kernel-onboarding`:**

- `src/module.ts` — remove registrations for `brief.validate`, `onboarding.input.validate`, `onboarding.phase.validate`, `onboarding.scaffold`, `onboarding.checklist`; add registration for `onboarding.synthesize`
- `src/phase-contract.ts` — **delete** (extract hashing/classification logic to `synthesize.ts` first)
- `src/scaffold.ts` — **delete** (but preserve `applyTokens`, `readTemplate`, `readRuntimeTemplate` exports — these are used by `mission.materialize` in `@gogol/site-kernel-handoff`; move them to `templates.ts` if not already there)
- `src/synthesize.ts` — **create** — `onboarding.synthesize` implementation
- `src/brief.ts` — update path references from `onboarding/.input/` to `onboarding/<system-id>/.input/`; remove `apps/<id>/` cross-check, add `systems/registry.yaml` check
- `src/index.ts` — remove exports of `runOnboardingScaffold`, `runOnboardingInputValidate`, `runOnboardingPhaseValidate`, `OnboardingPhase`, `OnboardingInputManifest`, `OnboardingPhaseOutputHeader`, `OnboardingPhaseValidationResult`; add export of `runOnboardingSynthesize`
- `src/checklist.ts` — **delete** (only used by `onboarding.checklist` command)
- `src/templates.ts` — verify `applyTokens`, `readTemplate`, `readRuntimeTemplate` are exported here (they already are per `index.ts`); if they were re-exported from `scaffold.ts`, ensure they remain accessible after `scaffold.ts` deletion

**`@gogol/site-kernel-handoff`:**

- `src/sternsystem/sternsystem-register.ts` — extend with: pin creation (delegate to `sternsystem.pin`), content stub creation, `mission.open` call, `mission.materialize` trigger, `--amend`/`--amend-id` flags, atomic rollback on failure
- `src/sternsystem/sternsystem.module.ts` — update command registration with new flags (`amend`, `amend-id`)

**Site OS commands:**

- `onboarding.synthesize` — new, workspace scope, `@gogol/site-kernel-onboarding`
- `sternsystem.register` — changed, workspace scope, `@gogol/site-kernel-handoff`
- `brief.validate` — removed
- `onboarding.input.validate` — removed
- `onboarding.phase.validate` — removed
- `onboarding.scaffold` — removed
- `onboarding.checklist` — removed

### 2.2 Configuration and data

- `onboarding/.input/` — **delete** (95 files, including amend-001/)
- `onboarding/.output/` — **delete** (27 files)
- `.agents/workflows/00-prepare.md` through `06-handoff.md` — **delete**
- `.agents/workflows-amend/` — **delete** (entire directory)
- `.agents/skills/fo-onboard/` — **create** (SKILL.md, learned-principles.md, qa-log.md)

### 2.3 Documentation and specs

- `packages/os/site-kernel-onboarding/AGENTS.md` — update commands table, brief contract paths, phase contract section (remove), rules
- `packages/os/site-kernel-handoff/AGENTS.md` — document extended `sternsystem.register`
- `AGENTS.md` (root) — update onboarding references
- `docs/COMMANDS.md` — update command surface
- `docs/ecosystem.generated.yaml` — regenerate via `ecosystem.manifest.generate` (do not hand-edit)

### 2.4 Validation and pipelines

- No new build.check entries (onboarding-time commands, not build-time)
- `pnpm --filter @gogol/site-kernel-onboarding build:check`
- `pnpm --filter @gogol/site-kernel-onboarding test`
- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm --filter @gogol/site-kernel-handoff test`
- `pnpm exec werkstatt run rfc.validate --id RFC-0532`

## 3. Step sequence

### Step 1. Extract hashing/classification logic from phase-contract.ts

**Goal:** Preserve the reusable hashing and file-classification logic before deleting `phase-contract.ts`.

**Agent actions:**

- Read `packages/os/site-kernel-onboarding/src/phase-contract.ts` and identify the hashing logic (SHA-256 per file + aggregate `inputHash`) and file classification logic
- Create `packages/os/site-kernel-onboarding/src/synthesize.ts` with the extracted logic, adapted for the per-system path layout (`onboarding/<system-id>/.input/` instead of `onboarding/.input/`)
- Implement `runOnboardingSynthesize` function: reads `onboarding/<system-id>/.input/`, validates `00-brief.md` via `BriefFrontmatter` schema, classifies files, computes hashes, writes `onboarding/<system-id>/.output/input-manifest.json`
- Handle noop case: return `{ status: "noop" }` (exit 0) if `.input/` directory does not exist

**Validation:**

- `pnpm --filter @gogol/site-kernel-onboarding build:check`

**Completion criterion:** `synthesize.ts` exists, exports `runOnboardingSynthesize`, and passes typecheck.

**Human review:** no

---

### Step 2. Register onboarding.synthesize command

**Goal:** Wire the new command into the kernel module and public API.

**Agent actions:**

- In `src/module.ts`: add `onboarding.synthesize` command registration with `--system` flag, workspace scope, reads `onboarding/<system>/.input/**`, writes `onboarding/<system>/.output/input-manifest.json`
- In `src/index.ts`: add `export { runOnboardingSynthesize } from "./synthesize.ts"` and remove exports of `runOnboardingInputValidate`, `runOnboardingPhaseValidate` and their types
- Write unit tests for `onboarding.synthesize` in `src/tests/synthesize.test.ts`: test pass case (valid brief + files), test fail case (missing brief), test noop case (no .input/ directory)

**Validation:**

- `pnpm --filter @gogol/site-kernel-onboarding build:check`
- `pnpm --filter @gogol/site-kernel-onboarding test`

**Completion criterion:** `onboarding.synthesize` is registered, exported, and tested.

**Human review:** no

---

### Step 3. Remove old onboarding commands and files

**Goal:** Delete the five retired commands and their source files.

**Agent actions:**

- In `src/module.ts`: remove registrations for `brief.validate`, `onboarding.input.validate`, `onboarding.phase.validate`, `onboarding.scaffold`, `onboarding.checklist` and their dynamic imports
- Delete `src/phase-contract.ts`
- Delete `src/scaffold.ts` — but first verify that `applyTokens`, `readTemplate`, `readRuntimeTemplate` are defined in `src/templates.ts` (not in `scaffold.ts`). If any are defined in `scaffold.ts`, move them to `templates.ts` before deletion
- Delete `src/checklist.ts`
- In `src/index.ts`: remove exports of `runOnboardingScaffold`, `runOnboardingChecklist`, and any types only used by deleted files
- Update or remove tests that reference deleted commands

**Validation:**

- `pnpm --filter @gogol/site-kernel-onboarding build:check`
- `pnpm --filter @gogol/site-kernel-onboarding test`

**Completion criterion:** No references to `brief.validate`, `onboarding.input.validate`, `onboarding.phase.validate`, `onboarding.scaffold`, `onboarding.checklist` remain in the package. `phase-contract.ts`, `scaffold.ts`, `checklist.ts` are deleted. Build and tests pass.

**Human review:** no

---

### Step 4. Update brief.ts path references

**Goal:** Update the brief validation logic for the per-system directory layout.

**Agent actions:**

- In `src/brief.ts`: change path references from `onboarding/.input/00-brief.md` to `onboarding/<system-id>/.input/00-brief.md`
- Remove the `apps/<id>/src/content/system.md` cross-check
- Add a `systems/registry.yaml` check: if the system-id already exists in the registry, `brief.validate` should warn (for amend scenarios) or pass (for new onboarding, the system doesn't exist yet)
- Update `runBriefValidate` to accept a `--system` flag for the system-id

**Validation:**

- `pnpm --filter @gogol/site-kernel-onboarding build:check`
- `pnpm --filter @gogol/site-kernel-onboarding test`

**Completion criterion:** `brief.ts` references `onboarding/<system-id>/.input/` paths, no `apps/<id>/` references remain.

**Human review:** no

---

### Step 5. Extend sternsystem.register

**Goal:** Add pin creation, content stubs, mission opening, materialization, and amend flags to the existing command.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts`:
  - After existing registry entry creation, add: call `sternsystem.pin` to create `systems/<id>/system.pin.json`
  - Create initial content stub: `systems/<id>/content/system.md` with identity and i18n blocks derived from the brief (read from `onboarding/<id>/.input/00-brief.md`)
  - Call `mission.open` to open first mission (`<system-id>-m000001`)
  - Call `mission.materialize` to produce first Werkstück
  - Implement atomic rollback: if `mission.open` fails, remove pin file and registry entry. If `mission.materialize` fails after `mission.open` succeeds, abort mission via `mission.abort`, then remove pin file and registry entry
  - Add `--amend` (boolean) and `--amend-id` (number) flags: with `--amend`, skip registry entry creation, update pin, open amend mission, trigger materialization
- In `src/sternsystem/sternsystem.module.ts`: add `amend` and `amend-id` flag definitions to the command registration
- Write unit tests for the extended behavior: test successful full flow, test rollback on `mission.open` failure, test rollback on `mission.materialize` failure, test amend mode

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm --filter @gogol/site-kernel-handoff test`

**Completion criterion:** `sternsystem.register` creates registry entry + pin + content stub + opens mission + triggers materialization. Amend mode works. Rollback tests pass.

**Human review:** no

---

### Step 6. Create fo-onboard skill

**Goal:** Scaffold the forge skill that orchestrates the full onboarding pipeline.

**Agent actions:**

- Run `pnpm exec werkstatt run forge.port.scaffold --skill fo-onboard` (RFC-0393) to create `.agents/skills/fo-onboard/` with forge-compliant structure
- Write `SKILL.md` with the orchestration steps: Prepare (read brief, validate) → Synthesize (run `onboarding.synthesize`, then AI synthesis) → Register (run `sternsystem.register`) → Handoff (report results)
- Write `learned-principles.md` (empty, for cumulative knowledge)
- Write `qa-log.md` (empty, for cumulative knowledge)
- Document `--amend` mode in the skill

**Validation:**

- `pnpm exec werkstatt run forge.skill.validate --skill fo-onboard` (if available)
- Verify `.agents/skills/fo-onboard/SKILL.md` exists and references `onboarding.synthesize` and `sternsystem.register`

**Completion criterion:** `fo-onboard` skill exists at `.agents/skills/fo-onboard/SKILL.md` with orchestration steps documented.

**Human review:** no

---

### Step 7. Delete old workflows and stale onboarding data

**Goal:** Remove the retired workflow files and historical onboarding content.

**Agent actions:**

- Delete `.agents/workflows/00-prepare.md` through `06-handoff.md`
- Delete `.agents/workflows-amend/` (entire directory)
- Delete `onboarding/.input/` (entire directory, 95 files)
- Delete `onboarding/.output/` (entire directory, 27 files)

**Validation:**

- `git status` shows only deletions
- No code references the deleted paths (verify with grep)

**Completion criterion:** Old workflows and onboarding data are deleted. No code references them.

**Human review:** no

---

### Step 8. Update documentation

**Goal:** Synchronize all documentation artifacts with the new command surface.

**Agent actions:**

- Update `packages/os/site-kernel-onboarding/AGENTS.md`: rewrite commands table (remove 5 old commands, add `onboarding.synthesize`), update brief contract paths, remove phase contract section, update rules
- Update `packages/os/site-kernel-handoff/AGENTS.md`: document extended `sternsystem.register` with pin, mission, materialization, and amend flags
- Update root `AGENTS.md`: update any onboarding references
- Update `docs/COMMANDS.md`: remove old commands, add `onboarding.synthesize`, mark `sternsystem.register` as changed
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` to regenerate `docs/ecosystem.generated.yaml`

**Validation:**

- `git diff` shows documentation changes only
- `pnpm exec werkstatt run ecosystem.manifest.validate` (if available)

**Completion criterion:** All documentation files in scope are updated. `docs/ecosystem.generated.yaml` is regenerated.

**Human review:** no

---

### Final Step. Acceptance criteria verification and stamp

**Goal:** Verify all acceptance criteria, run validation suite, and stamp the RFC as implemented.

**Agent actions:**

- Verify every acceptance criterion in RFC-0532 against the implemented code. Mark `[x]` with inline `(evidence: ...)` annotations.
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0532`
- Run `pnpm --filter @gogol/site-kernel-onboarding build:check`
- Run `pnpm --filter @gogol/site-kernel-onboarding test`
- Run `pnpm --filter @gogol/site-kernel-handoff build:check`
- Run `pnpm --filter @gogol/site-kernel-handoff test`
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0532` and commit the evidence file
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0532 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0532` — zero errors
- All build:check and test commands pass

**Completion criterion:** All acceptance criteria checked off with evidence. RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0532`
- `pnpm --filter @gogol/site-kernel-onboarding build:check`
- `pnpm --filter @gogol/site-kernel-onboarding test`
- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm --filter @gogol/site-kernel-handoff test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0532` (RFC-0330)
- `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0532 --implementation-commit <sha>`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0532.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0532` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Loss of onboarding history for warpgogol-com | Step 7 deletes only after all code is updated; Sternsystem + Bordbuch remain authoritative |
| fo-onboard skill complexity | Step 6 delegates deterministic work to commands; skill focuses on orchestration |
| Agent confusion during transition | Step 8 updates all AGENTS.md files with new command surface |
| sternsystem.register atomicity | Step 5 implements rollback: abort mission → remove pin → remove registry entry |
| Concurrent sternsystem.register calls | Step 5 uses existing `readRegistry`/`writeRegistry` with Werkstatt consistency primitives (DNA-51) |
| Parallel onboarding processes | Per-system namespace prevents conflicts; `sternsystem.register` duplicate-id check rejects collisions |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-44, DNA-45, DNA-46, or DNA-47, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0532 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `scaffold.ts` deletion breaks `mission.materialize` (which imports `applyTokens` from `@gogol/site-kernel-onboarding`), move the affected exports to `templates.ts` before deletion (Step 3 handles this).
- If the amend lifecycle commands (7 commands deferred to nonGoals) break due to path changes, create a follow-up RFC to migrate them — do not fix them inline in this RFC's implementation.
