---
rfcId: RFC-0609
planId: PLAN-RFC-0609-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel"
    - "@warpgogol/forge"
    - "@warpgogol/site-kernel-handoff"
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/site-kernel-codegen"
  services: []
  docs:
    - AGENTS.md
    - forge.yaml
    - .agents/skills/_shared/fo-pipeline-conventions.md
---

# Implementation Plan: RFC-0609

## 1. Objectives

- [ ] O1 — Remove `args` from `KernelCommandInput` and `ForgeCommandInput` at the type level (maps to AC: `KernelCommandInput` no longer has `args`, `ForgeCommandInput` no longer has `args`)
- [ ] O2 — `resolveCommandFlags` and `parseKernelArgv` stop returning `args`; emit `KERNEL-ARG-01` for positional tokens (maps to AC: `resolveCommandFlags` emits `KERNEL-ARG-01`, `parseKernelArgv` no longer returns `args`)
- [ ] O3 — Migrate 7 forge positional-only commands to flag-based (`rfc.validate`, `rfc.command-lifecycle.validate`, `rfc.graph`, `rfc.pipeline.status`, `adr.validate`, `session.validate`, `forge.create`) (maps to AC: each command accepts `--id`/`--name` and rejects positional)
- [ ] O4 — Migrate 5 site-kernel-checks positional-only commands to flag-based (`geo.slug.preview`, `i18n.config.validate`, `i18n.detect.implement`, `share.utility.lint`, `pbp.profile.validate`) (maps to AC: all handlers no longer read `input.args[0]`)
- [ ] O5 — Migrate `section.scaffold` multi-positional to `--slug` + `--archetype` flags (maps to AC: all handlers no longer read `input.args[0]`)
- [ ] O6 — Remove `?? input.args[0]` fallback from 15 dual-path handlers across `site-kernel-checks`, `site-kernel-handoff`, `site-kernel-codegen` (maps to AC: all 15 handlers no longer read `input.args[0]`)
- [ ] O7 — Update `forge.yaml` binding templates to flag format (maps to AC: `validateRfc`, `validateAdr`, `specValidate` use flag format)
- [ ] O8 — Update skill files and AGENTS.md with flag-only convention (maps to AC: skill files updated, AGENTS.md rule added)
- [ ] O9 — Unit tests for `KERNEL-ARG-01` diagnostic (maps to AC: unit tests in `packages/os/site-kernel/src/tests/`)
- [ ] O10 — All affected packages pass `build:check` and `rfc.validate` passes on RFC-0609 (maps to AC: `build:check` passes, `rfc.validate` passes)

## 2. Affected artifacts

### 2.1 Code and commands

**Type contracts:**

- `packages/os/site-kernel/src/types.ts` — remove `args` from `KernelCommandInput`
- `packages/forge/src/types.ts` — remove `args` from `ForgeCommandInput`

**Parser:**

- `packages/os/site-kernel/src/runtime/argv.ts` — `resolveCommandFlags` stops returning `args`, emits `KERNEL-ARG-01`; `parseKernelArgv` stops returning `args`, returns `{ argv, flags, diagnostics }`
- `packages/os/site-kernel/src/runtime/execute-command.ts` — stop constructing `KernelCommandInput` with `args: resolved.args`; stop passing `args` from `parseKernelArgv`

**Forge command registrations + handlers (7 commands):**

- `packages/forge/os/rfc/rfc.module.ts` — add `id` flag to 4 command registrations
- `packages/forge/os/rfc/handlers/validate.ts` — `input.args[0]` → `input.flags["id"]`
- `packages/forge/os/rfc/handlers/lifecycle.ts` — `input.args[0]` → `input.flags["id"]`
- `packages/forge/os/rfc/handlers/index-graph.ts` — `input.args[0]` → `input.flags["id"]`
- `packages/forge/os/rfc/handlers/pipeline-status.ts` — `input.args[0]` → `input.flags["id"]`
- `packages/forge/os/adr/adr.module.ts` — add `id` flag to `adr.validate`
- `packages/forge/os/adr/handlers/validate.ts` — `input.args[0]` → `input.flags["id"]`
- `packages/forge/os/session/session.module.ts` — add `id` flag to `session.validate`
- `packages/forge/os/session/handlers/validate.ts` — `input.args[0]` → `input.flags["id"]`
- `packages/forge/src/onboarding/create.ts` — `input.args[0]` → `input.flags["name"]`
- `packages/forge/os/core/core.module.ts` (or wherever `forge.create` is registered) — add `name` flag

**site-kernel-checks positional-only handlers (5 commands):**

- `packages/os/site-kernel-checks/src/geo.ts` — `input.args[0]` → `input.flags["name"]`
- `packages/os/site-kernel-checks/src/i18n-config-validate.ts` — `input.args[0]` → `input.flags["app"]`
- `packages/os/site-kernel-checks/src/i18n-detect-implement.ts` — `input.args[0]` → `input.flags["site"]`
- `packages/os/site-kernel-checks/src/share-utility.ts` — `input.args[0]` → `input.flags["app"]`
- `packages/os/site-kernel-checks/src/pbp-profile.ts` — `input.args[0]` → `input.flags["site"]`

**site-kernel-codegen multi-positional handler (1 command):**

- `packages/os/site-kernel-codegen/src/section-scaffold.ts` — `input.args[0]` + `input.args[1]` → `input.flags["slug"]` + `input.flags["archetype"]`

**Dual-path handlers (remove `?? input.args[0]` fallback):**

- `packages/os/site-kernel-checks/src/i18n-detect-implement.ts`
- `packages/os/site-kernel-checks/src/maintenance/maintenance-debt-queue.ts`
- `packages/os/site-kernel-checks/src/person-create.ts`
- `packages/os/site-kernel-checks/src/content-derived.ts`
- `packages/os/site-kernel-checks/src/biome-tokens/validate.ts`
- `packages/os/site-kernel-checks/src/archetype/cosmic-name.ts`
- `packages/os/site-kernel-checks/src/source-monitor.ts`
- `packages/os/site-kernel-handoff/src/handoff-validate.ts`
- `packages/os/site-kernel-handoff/src/handoff-pack.ts`
- `packages/os/site-kernel-handoff/src/handoff-absorb.ts`

**Test files needing `args` removal from mock inputs:**

- `packages/os/site-kernel/src/tests/flags.test.ts`
- `packages/os/site-kernel/src/tests/runtime.test.ts`
- `packages/os/site-kernel-checks/src/tests/pipeline-telemetry.test.ts`
- `packages/os/site-kernel/src/tests/pipeline-budgets.test.ts`
- Any other test that constructs `KernelCommandInput` with `args: []`

### 2.2 Configuration and data

- `forge.yaml` — update `validateRfc`, `validateAdr`, `specValidate` binding templates to flag format

### 2.3 Documentation and specs

- `AGENTS.md` (root) — add rule: all kernel commands accept entity identifiers via flags only; positional args trigger KERNEL-ARG-01
- `.agents/skills/_shared/fo-pipeline-conventions.md` — update binding example to show `--id {id}` format
- RFC-0609 file itself (read-only reference for acceptance criteria)

### 2.4 Validation and pipelines

- No new pipeline commands. `build:check` (typecheck) is the primary validation.
- `kernel.flags.lint` (RFC-0260) will flag any newly-registered commands without `flags` schema — all migrated commands must declare their new flags.

## 3. Step sequence

### Step 0. Pre-audit grep for complete `input.args` usage

**Goal:** Get the complete list of all files that read `input.args` in any form before making type changes, to avoid discovering handlers mid-implementation.

**Agent actions:**

- Run: `grep -rn "input\.args" packages/ --include="*.ts" | grep -v dist/ | grep -v node_modules/ | grep -v "\.test\.ts" | grep -v "\.d\.ts"`
- Categorize each hit: positional-only (`input.args[0]`), dual-path (`?? input.args[0]`), multi-positional (`input.args[1]`), or other (`input.args.slice()`, `input.args.length`, destructuring)
- If more than ~25 files are found, split the implementation into multiple commits per package
- Compare the complete list against the 15 files identified in the RFC. If new files are found, add them to the migration scope

**Validation:**

- The grep output is saved or noted for reference during Steps 1-5

**Completion criterion:** Complete list of files reading `input.args` is known; any files beyond the 15 identified in the RFC are added to the migration scope.

**Human review:** no

---

### Step 1. Remove `args` from type contracts

**Goal:** Delete the `args` field from `KernelCommandInput` and `ForgeCommandInput` at the TypeScript type level, making the compiler flag every handler that still reads `input.args`.

**Agent actions:**

- Edit `packages/os/site-kernel/src/types.ts`: remove `args: string[]` from `KernelCommandInput` interface
- Edit `packages/forge/src/types.ts`: remove `args: string[]` from `ForgeCommandInput` interface
- Do NOT fix handler errors yet — let the compiler identify all affected files

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run build:check` — expect type errors in handlers that read `input.args`
- `pnpm --filter @warpgogol/forge run build:check` — expect type errors in forge handlers

**Completion criterion:** `KernelCommandInput` and `ForgeCommandInput` no longer have `args` field; compiler errors exist in all handler files that read `input.args`.

**Human review:** no

---

### Step 2. Update `resolveCommandFlags` and `parseKernelArgv`

**Goal:** Update the parsers to stop returning `args` and emit `KERNEL-ARG-01` for positional tokens.

**Agent actions:**

- Edit `packages/os/site-kernel/src/runtime/argv.ts`:
  - `resolveCommandFlags`: remove `args` from return type; when a non-flag token is encountered, push a `KERNEL-ARG-01` diagnostic instead of pushing to `args`
  - `parseKernelArgv`: change return type from `KernelCommandInput` to `{ argv: string[]; flags: Record<string, KernelFlagValue>; diagnostics: Diagnostic[] }`; when a non-flag token is encountered, push a `KERNEL-ARG-01` diagnostic instead of pushing to `args`
- Edit `packages/os/site-kernel/src/runtime/execute-command.ts`:
  - Line 139: change `input = { argv: [...argv], args: resolved.args, flags: resolved.flags }` to `input = { argv: [...argv], flags: resolved.flags }` and handle `resolved.diagnostics`
  - Line 141: change `input = parseKernelArgv(argv)` to destructure the new return type and handle diagnostics
- Register `KERNEL-ARG-01` in the diagnostic rule registry if one exists

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run build:check` — type errors in `execute-command.ts` should be resolved

**Completion criterion:** `resolveCommandFlags` and `parseKernelArgv` no longer return `args`; both emit `KERNEL-ARG-01` for positional tokens; `execute-command.ts` constructs `KernelCommandInput` without `args`.

**Human review:** no

---

### Step 3. Migrate forge positional-only command handlers

**Goal:** Migrate all 7 forge commands from `input.args[0]` to `input.flags["<flag>"]`.

**Agent actions:**

- `packages/forge/os/rfc/rfc.module.ts`: add `id: { kind: "string", description: "RFC id, e.g. RFC-0609" }` to `flags` schema for `rfc.validate`, `rfc.command-lifecycle.validate`, `rfc.graph`, `rfc.pipeline.status`
- `packages/forge/os/rfc/handlers/validate.ts`: change `input.args[0]` to `input.flags["id"]`
- `packages/forge/os/rfc/handlers/lifecycle.ts`: change `input.args[0]` to `input.flags["id"]`
- `packages/forge/os/rfc/handlers/index-graph.ts`: change `input.args[0]` to `input.flags["id"]`
- `packages/forge/os/rfc/handlers/pipeline-status.ts`: change `input.args[0]` to `input.flags["id"]`
- `packages/forge/os/adr/adr.module.ts`: add `id: { kind: "string", description: "ADR id, e.g. ADR-0003" }` to `flags` schema for `adr.validate`
- `packages/forge/os/adr/handlers/validate.ts`: change `input.args[0]` to `input.flags["id"]`
- `packages/forge/os/session/session.module.ts`: add `id: { kind: "string", description: "Session id" }` to `flags` schema for `session.validate`
- `packages/forge/os/session/handlers/validate.ts`: change `input.args[0]` to `input.flags["id"]`
- `packages/forge/src/onboarding/create.ts`: change `input.args[0]` to `input.flags["name"]`
- Find `forge.create` registration (likely in `packages/forge/os/core/core.module.ts` or `packages/forge/src/forge-module.ts`): add `name: { kind: "string", required: true, description: "Project name." }` to `flags` schema

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — no type errors
- `pnpm exec site-kernel run rfc.validate --id RFC-0609 --json` — works with `--id` flag
- `pnpm exec site-kernel run rfc.validate RFC-0609 --json` — fails with KERNEL-ARG-01

**Completion criterion:** All 7 forge commands accept their respective flags and reject positional args with KERNEL-ARG-01.

**Human review:** no

---

### Step 4. Migrate site-kernel-checks and site-kernel-codegen positional-only handlers

**Goal:** Migrate 5 positional-only commands in `site-kernel-checks` and 1 multi-positional command in `site-kernel-codegen` to flag-based.

**Agent actions:**

- `packages/os/site-kernel-checks/src/geo.ts`: add `name` flag to command registration; change `input.args[0]` to `input.flags["name"]`
- `packages/os/site-kernel-checks/src/i18n-config-validate.ts`: add `app` flag; change `input.args[0]` to `input.flags["app"]`
- `packages/os/site-kernel-checks/src/i18n-detect-implement.ts`: add `site` flag; change `input.args[0]` to `input.flags["site"]`
- `packages/os/site-kernel-checks/src/share-utility.ts`: add `app` flag; change `input.args[0]` to `input.flags["app"]`
- `packages/os/site-kernel-checks/src/pbp-profile.ts`: add `site` flag; change `input.args[0]` to `input.flags["site"]`
- `packages/os/site-kernel-codegen/src/section-scaffold.ts`: add `slug` and `archetype` flags; change `input.args[0]` to `input.flags["slug"]` and `input.args[1]` to `input.flags["archetype"]`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-codegen run build:check`

**Completion criterion:** All 6 handlers read from `input.flags` instead of `input.args`; no type errors.

**Human review:** no

---

### Step 5. Remove dual-path fallback from remaining handlers

**Goal:** Remove `?? input.args[0]` fallback from all dual-path handlers so the flag becomes the only source.

**Agent actions:**

- `packages/os/site-kernel-checks/src/maintenance/maintenance-debt-queue.ts`: remove `?? input.args[0]` (2 occurrences)
- `packages/os/site-kernel-checks/src/person-create.ts`: remove `?? input.args[0]`
- `packages/os/site-kernel-checks/src/content-derived.ts`: remove `?? input.args[0]`
- `packages/os/site-kernel-checks/src/biome-tokens/validate.ts`: remove `?? input.args[0]` (2 occurrences)
- `packages/os/site-kernel-checks/src/archetype/cosmic-name.ts`: remove `?? input.args[0]`
- `packages/os/site-kernel-checks/src/source-monitor.ts`: remove `?? input.args[0]`
- `packages/os/site-kernel-handoff/src/handoff-validate.ts`: remove `?? input.args[0]`
- `packages/os/site-kernel-handoff/src/handoff-pack.ts`: remove `?? input.args[0]`
- `packages/os/site-kernel-handoff/src/handoff-absorb.ts`: remove `?? input.args[0]`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** No handler in the affected packages reads `input.args`; `grep -r "input\.args" packages/os/` returns zero results (excluding `dist/` and test fixtures).

**Human review:** no

---

### Step 6. Update test fixtures and mock inputs

**Goal:** Update all test files that construct `KernelCommandInput` with `args: []` to use the new type without `args`.

**Agent actions:**

- Search for `args: []` in test files: `grep -rn "args: \[\]" packages/os/*/src/tests/ packages/forge/src/tests/`
- Remove `args: []` from all `KernelCommandInput` and `ForgeCommandInput` mock constructions
- Update `packages/os/site-kernel/src/tests/flags.test.ts`: update `parseKernelArgv` golden tests to expect the new return type (no `args` field, `diagnostics` field present)
- Update `packages/os/site-kernel/src/tests/runtime.test.ts`: update `parseKernelArgv` test to expect new return type
- Add new unit tests for `KERNEL-ARG-01`:
  - Test that `resolveCommandFlags` emits `KERNEL-ARG-01` when a positional token is encountered
  - Test that `parseKernelArgv` emits `KERNEL-ARG-01` when a positional token is encountered
  - Test that the fix hint is correct
  - Test that schema-less commands with positional tokens get `KERNEL-ARG-01`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel run test`
- `pnpm --filter @warpgogol/forge run test`

**Completion criterion:** All tests pass; new `KERNEL-ARG-01` tests exist and pass; no test constructs `KernelCommandInput` with `args`.

**Human review:** no

---

### Step 7. Update `forge.yaml` bindings

**Goal:** Update binding templates to flag format.

**Agent actions:**

- Edit `forge.yaml`:
  - `validateRfc`: `pnpm exec site-kernel run rfc.validate {id} --json` → `pnpm exec site-kernel run rfc.validate --id {id} --json`
  - `validateAdr`: `pnpm exec site-kernel run adr.validate {id} --json` → `pnpm exec site-kernel run adr.validate --id {id} --json`
  - `specValidate`: `pnpm exec site-kernel run spec.validate --spec={id} --json` → `pnpm exec site-kernel run spec.validate --spec {id} --json`

**Validation:**

- `pnpm exec site-kernel run forge.doctor` (if available) — verify bindings validation passes
- `pnpm exec site-kernel run rfc.validate --id RFC-0609 --json` — verify the binding template works

**Completion criterion:** `forge.yaml` binding templates use `--id {id}` and `--spec {id}` format.

**Human review:** no

---

### Step 8. Update skill files and AGENTS.md

**Goal:** Update all skill files that reference positional command invocations and add AGENTS.md rule.

**Agent actions:**

- Edit `.agents/skills/_shared/fo-pipeline-conventions.md`: update the binding example to show `--id {id}` format
- Search all `.agents/skills/fo/*/SKILL.md` files for positional command invocations (`rfc.validate RFC-`, `adr.validate ADR-`, etc.) and update to flag format
- Edit `AGENTS.md` (root): add a rule in the appropriate section: "All kernel commands accept entity identifiers via declared flags only (`--id`, `--name`, `--site`, etc.). Positional arguments trigger KERNEL-ARG-01. Agents MUST NOT pass entity identifiers as positional args."

**Validation:**

- `grep -r "rfc\.validate [A-Z]\|adr\.validate [A-Z]\|session\.validate [A-Z]" .agents/skills/` — zero results (all updated)
- `pnpm exec site-kernel run forge.skill.validate` (if available) — verify skill files pass validation

**Completion criterion:** No skill file references positional command invocations; AGENTS.md has the flag-only rule.

**Human review:** no

---

### Step 9. Full typecheck and validation

**Goal:** Run full typecheck across all affected packages and verify RFC validation.

**Agent actions:**

- `pnpm --filter @warpgogol/site-kernel run build:check`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-codegen run build:check`
- `pnpm exec site-kernel run rfc.validate --id RFC-0609 --json`
- `grep -r "input\.args" packages/os/ packages/forge/ --include="*.ts" | grep -v dist/ | grep -v node_modules/ | grep -v "\.test\.ts"` — zero results

**Validation:**

- All `build:check` commands pass
- `rfc.validate` passes on RFC-0609
- No source file (excluding tests and dist) reads `input.args`

**Completion criterion:** All affected packages pass typecheck; `rfc.validate` passes; no `input.args` reads in source files.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `AGENTS.md` (root) has the flag-only rule.
- Verify `forge.yaml` bindings are updated.
- Verify `.agents/skills/_shared/fo-pipeline-conventions.md` is updated.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0609 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0609`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0609`
- `pnpm --filter @warpgogol/site-kernel run build:check`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-codegen run build:check`
- `pnpm --filter @warpgogol/site-kernel run test`
- `pnpm --filter @warpgogol/forge run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0609` in the subject line (RFC-0265 commit hygiene)
- `grep -r "input\.args" packages/os/ packages/forge/ --include="*.ts" | grep -v dist/ | grep -v node_modules/ | grep -v "\.test\.ts"` output showing zero results

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Breaking change for agents and skills | Step 8 updates all skill files in the same commit; Step 3-5 migrate all commands |
| Breaking change for external forge consumers | Step 3 migrates `forge.create` to `--name`; documented in changelog |
| KERNEL-ARG-01 false positives for multi-word values | Step 2 preserves existing quoting behavior; no regression |
| Schema-less command migration (~357 commands) | Step 1 makes `args` unavailable at type level; compiler flags all readers; Step 3-5 migrate all identified readers |
| Pipeline step args | No existing pipeline definitions use positional tokens in `step.args` (verified during planning); non-issue in practice |
| Agent misinterpretation risk | Step 8 updates AGENTS.md with explicit flag-only rule |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0609 --reason "..." --invariant "DNA-54"` instead of working around it.
- If more than ~20 additional handlers reading `input.args` are discovered during Step 1 (beyond the 15 identified in the RFC), consider splitting the migration into multiple commits per package to keep the diff reviewable.
- If `parseKernelArgv` return type change breaks more than 10 test files, consider a phased approach: first migrate `resolveCommandFlags` (schema-carrying commands), then `parseKernelArgv` (schema-less commands) in a separate commit.
