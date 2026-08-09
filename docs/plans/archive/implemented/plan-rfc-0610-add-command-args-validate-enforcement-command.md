---
rfcId: RFC-0610
planId: PLAN-RFC-0610-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0610

## 1. Objectives

- [ ] Objective 1 — Implement `runCommandArgsValidate` handler with three detection rules (ARG-COMPLIANCE-01, 02, 03) — maps to acceptance criteria 1–5
- [ ] Objective 2 — Register `command.args.validate` in the command table and pipeline — maps to acceptance criteria 6–7
- [ ] Objective 3 — Add `--json` output following standard `CheckResult` shape — maps to acceptance criterion 8
- [ ] Objective 4 — Unit test all three rules, comment exclusion, and clean-pass — maps to acceptance criterion 9
- [ ] Objective 5 — Pass `rfc.validate` and documentation sync — maps to acceptance criterion 10

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/command-args-validate.ts` — **new module**: `runCommandArgsValidate` handler, `CommandArgsViolation` interface, `stripCommentsAndStrings` (re-exported from `generated-timestamp-validate.ts` or imported)
- `packages/os/site-kernel-checks/src/command-tables/07-structure-naming.ts` — register `command.args.validate` entry alongside `kernel.flags.lint` and `kernel.io.lint`
- `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` — add `{ command: "command.args.validate" }` to `PACKAGES_CHECK_PIPELINE` after `kernel.io.lint`
- `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts` — register `ARG-COMPLIANCE-01/02/03` rule IDs alongside `KERNEL-FLAG-01..05` (confirmed during grilling — required for `diagnostic.shape.lint` compliance)

### 2.2 Configuration and data

No YAML/JSON/manifest changes. The command is read-only and scans source files.

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — add `src/command-args-validate.ts` module entry to the "What lives here" table

### 2.4 Validation and pipelines

- `PACKAGES_CHECK_PIPELINE` — new step `{ command: "command.args.validate" }` after `kernel.io.lint`
- `packages-check.run` / `packages.check` composite commands automatically pick up the new pipeline step

## 3. Step sequence

### Step 1. Implement `runCommandArgsValidate` handler

**Goal:** Create the validator module with all three detection rules and the `CommandArgsViolation` interface.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/command-args-validate.ts`
- Import `stripCommentsAndStrings` from `generated-timestamp-validate.ts` (reuse, do not duplicate)
- Implement `CommandArgsViolation` interface per RFC TypeScript contracts
- Implement ARG-COMPLIANCE-01: scan handler source files for `input.args` pattern (after stripping comments/strings)
- Implement ARG-COMPLIANCE-02: for each command registration with `flags: {}`, locate the handler source and scan for `input.flags["<name>"]` string-literal reads
- Implement ARG-COMPLIANCE-03: scan handler source files for `?? input.args[0]` and `|| input.args[0]` patterns
- Scan scope: `packages/forge/os/**/*.ts`, `packages/os/site-kernel-checks/src/command-tables/*.ts`, `packages/os/site-kernel-*/src/**/*.ts`
- Collect command registrations from both forge module files and command-tables data-driven arrays
- Return `CheckResult` with `diagnostics[]` in standard shape

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build` compiles without errors
- Manual smoke: `pnpm exec werkstatt run command.args.validate --json` exits 0 with zero violations (since RFC-0609 is already implemented)

**Completion criterion:** Module compiles, handler returns a `CheckResult` with `diagnostics[]`, all three rules are implemented.

**Human review:** no

---

### Step 2. Register diagnostic rule IDs

**Goal:** Register ARG-COMPLIANCE-01/02/03 in the diagnostic rule registry so `diagnostic.shape.lint` recognizes them.

**Agent actions:**

- Open `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts`
- Add three rule entries following the `KERNEL-FLAG-01..05` pattern:
  - `ARG-COMPLIANCE-01`: "Handler reads removed input.args field (flag-only standard violation)" — `command.args.validate`
  - `ARG-COMPLIANCE-02`: "Command registered with empty flags but handler reads named flag" — `command.args.validate`
  - `ARG-COMPLIANCE-03`: "Handler uses dual-path fallback with input.args[0] (prohibited)" — `command.args.validate`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build` compiles
- `pnpm exec werkstatt run diagnostic.shape.lint` does not flag `ARG-COMPLIANCE-*` as unregistered

**Completion criterion:** Three rule IDs registered in `core-infra.ts`.

**Human review:** no

---

### Step 3. Register command in command table

**Goal:** Add `command.args.validate` to the data-driven command table so it is auto-registered by `createStandardCheckModule`.

**Agent actions:**

- Open `packages/os/site-kernel-checks/src/command-tables/07-structure-naming.ts`
- Import `runCommandArgsValidate` from `../command-args-validate.ts`
- Add a `CheckCommandEntry` to `STRUCTURE_NAMING_COMMANDS`:
  - `name: "command.args.validate"`
  - `description: "RFC-0610: statically analyze command registrations and handler source code for flag-only argument compliance (ARG-COMPLIANCE-01/02/03)."`
  - `scope: "workspace"`
  - `flags: {}`
  - `supportsAllSites: true`
  - `cacheable: false`
  - `reads: ["packages/forge/os/**/*.ts", "packages/os/site-kernel-checks/src/command-tables/*.ts", "packages/os/site-kernel-*/src/**/*.ts"]`
  - `execute: runCommandArgsValidate`
- Add `<item>RFC-0610: register command.args.validate.</item>` to the `CHANGE_SUMMARY` block

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build` compiles
- `pnpm exec werkstatt run command.args.validate --json` returns a valid `CheckResult`

**Completion criterion:** Command is registered and invocable via `site-kernel run command.args.validate`.

**Human review:** no

---

### Step 4. Add to PACKAGES_CHECK_PIPELINE

**Goal:** Wire the command into the workspace package check pipeline.

**Agent actions:**

- Open `packages/os/site-kernel-checks/src/pipelines/packages-check.ts`
- Add `{ command: "command.args.validate" }` after the `kernel.io.lint` step (line ~140)
- Add `<item>RFC-0610: Add command.args.validate after kernel.io.lint.</item>` to the `CHANGE_SUMMARY` block

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build` compiles
- `pnpm exec werkstatt run packages.check --strict 2>&1 | head -50` shows `command.args.validate` in the pipeline output

**Completion criterion:** Command appears in `PACKAGES_CHECK_PIPELINE` and runs as part of `packages.check`.

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Comprehensive unit tests covering all three rules, comment/string exclusion, and clean-pass.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/command-args-validate.test.ts`
- Test ARG-COMPLIANCE-01: fixture with `input.args` reference → violation detected
- Test ARG-COMPLIANCE-01 clean: fixture with `input.flags["id"]` only → no violation
- Test ARG-COMPLIANCE-02: fixture with `flags: {}` registration + handler reading `input.flags["id"]` → violation detected
- Test ARG-COMPLIANCE-02 clean: fixture with `flags: { id: {...} }` + handler reading `input.flags["id"]` → no violation
- Test ARG-COMPLIANCE-03: fixture with `?? input.args[0]` → violation detected
- Test ARG-COMPLIANCE-03: fixture with `|| input.args[0]` → violation detected
- Test comment exclusion: `// input.args` in comment → no violation
- Test string-literal exclusion: `"input.args"` in string → no violation
- Test dynamic flag access: `input.flags[variable]` with `flags: {}` → no violation (not a string literal)
- Test clean-pass: all handlers use `input.flags["id"]` with declared `flags: { id: {...} }` → zero violations

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run vitest -- src/tests/command-args-validate.test.ts` passes

**Completion criterion:** All test cases pass, covering all three rules, exclusion logic, and clean-pass.

**Human review:** no

---

### Step 6. Documentation sync

**Goal:** Update AGENTS.md with the new module entry.

**Agent actions:**

- Open `packages/os/site-kernel-checks/AGENTS.md`
- Add a row to the "What lives here" table: `| src/command-args-validate.ts | RFC-0610 runCommandArgsValidate — statically analyzes command registrations and handler source code for flag-only argument compliance. Diagnostics: ARG-COMPLIANCE-01, ARG-COMPLIANCE-02, ARG-COMPLIANCE-03 |`

**Validation:**

- `git diff packages/os/site-kernel-checks/AGENTS.md` shows the new row

**Completion criterion:** AGENTS.md updated with new module entry.

**Human review:** no

---

### Step 7. Validation suite

**Goal:** Run all required validators to confirm the implementation is clean.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0610`
- Run `pnpm --filter @warpgogol/site-kernel-checks run build`
- Run `pnpm --filter @warpgogol/site-kernel-checks run vitest -- src/tests/command-args-validate.test.ts`
- Run `pnpm exec werkstatt run command.args.validate --json` — confirm zero violations
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surface changed (it did — new command)

**Validation:**

- `rfc.validate` passes
- Build passes
- Tests pass
- `command.args.validate` exits 0 with zero violations
- `ecosystem.manifest.generate` updates `docs/ecosystem.generated.yaml` with the new command

**Completion criterion:** All validators pass, ecosystem manifest regenerated.

**Human review:** no

---

### Final Step. Review, fix, and stamp implemented

**Goal:** Run code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations
- Check off acceptance criteria: verify each criterion against the implemented code. Mark `[x]` for verified criteria
- Commit acceptance criteria update: `git commit -m "rfc: RFC-0610 check acceptance criteria with evidence"`
- Stamp the RFC: `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0610 --implementation-commit <sha>`
- Commit the stamp transition: `git commit -m "rfc: implement RFC-0610 command.args.validate enforcement command"`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0610`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0610`
- `pnpm --filter @warpgogol/site-kernel-checks run build`
- `pnpm --filter @warpgogol/site-kernel-checks run vitest -- src/tests/command-args-validate.test.ts`
- `pnpm exec werkstatt run command.args.validate --json`
- `pnpm exec werkstatt run packages.check --strict` (full pipeline including new step)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0610` in the subject line (RFC-0265 commit hygiene)
- `docs/ecosystem.generated.yaml` updated with `command.args.validate` command entry

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives from string literals | Step 1: reuse `stripCommentsAndStrings` from `generated-timestamp-validate.ts`; Step 4: test comment/string exclusion |
| False positives from dynamic flag access | Step 1: ARG-COMPLIANCE-02 only flags string-literal flag reads; Step 4: test dynamic access case |
| Performance (scanning ~60-90 files) | Step 1: regex-based scan, not AST; bounded file set |
| Agent misinterpretation of ARG-COMPLIANCE-02 | Step 1: error message includes fix hint clarifying `flags: {}` is valid when handler reads no flags |
| `as any` escape hatch | Out of scope — `no-as-any` ESLint rule is the first line of defense; documented in RFC Risks section |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0610 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `command.args.validate` produces false positives on existing commands after RFC-0609 migration, verify RFC-0609 is fully implemented before adjusting detection rules.
