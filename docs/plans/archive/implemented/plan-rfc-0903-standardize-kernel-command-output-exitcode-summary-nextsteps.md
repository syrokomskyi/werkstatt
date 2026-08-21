---
rfcId: RFC-0903
planId: PLAN-RFC-0903-01
status: draft
owner: architecture
createdAt: 2026-08-21
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
    - "@warpgogol/werkstatt-shared"
  services: []
  docs:
    - "docs/rfcs/rfc-0903-standardize-kernel-command-output-exitcode-summary-nextsteps.md"
    - "docs/architecture-dna.md"
    - "packages/werkstatt/AGENTS.md"
---

# Implementation Plan: RFC-0903

## 1. Objectives

- [ ] O1 — Register `werkstatt.commands.validate` command in the engine kernel with `scope: workspace` (maps to acceptance criterion: "command is registered")
- [ ] O2 — Implement static analysis producing `CMD-OUTPUT-01`, `CMD-OUTPUT-02`, `CMD-OUTPUT-03` diagnostics (maps to: "produces diagnostics")
- [ ] O3 — Implement helper-exempt return detection for `passResult`/`failResult`/`diagnosticsResult`/`resultFromViolations`/`buildAuditResult` (maps to: "exempts returns that delegate to helpers")
- [ ] O4 — Implement `--mode=warning|error` flag (default: `error`) and `--json` output (maps to: "flag is implemented", "json output is documented")
- [ ] O5 — Fix `passResult` to return `[command.name]`-prefixed `summary` and explicit `exitCode: 0` (maps to: "passResult returns explicit exitCode: 0")
- [ ] O6 — Fix `failResult` to return `[command.name]`-prefixed `summary` (maps to: "failResult returns [command.name]-prefixed summary")
- [ ] O7 — Unit tests covering all three rule IDs and helper-exempt returns (maps to: "unit tests cover all three rule IDs")
- [ ] O8 — Update `packages/werkstatt/AGENTS.md` "Command handler patterns" section with output standard (maps to: "AGENTS.md documents the output standard")
- [ ] O9 — Do NOT add `werkstatt.commands.validate` to `PACKAGES_CHECK_PIPELINE` — gated adoption (maps to non-goal)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/os/werkstatt-commands-validate.module.ts` — **new** module file registering `werkstatt.commands.validate` command
- `packages/werkstatt/src/plugin/commands-validate.ts` — **new** implementation file with static analysis logic
- `tools/kernel.config.ts` — add `moduleLoaders` entry for `werkstatt-commands-validate`
- `packages/werkstatt-shared/src/checks/result-helpers.ts` — fix `passResult` summary prefix and `failResult` summary prefix
- `packages/werkstatt/src/kernel/types.ts` — read-only reference (no changes)

### 2.2 Configuration and data

- No YAML/JSON/manifest changes.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0903-standardize-kernel-command-output-exitcode-summary-nextsteps.md` — read-only reference
- `docs/architecture-dna.md` — already contains DNA-82 (no change needed)
- `packages/werkstatt/AGENTS.md` — add output standard rules to "Command handler patterns" section

### 2.4 Validation and pipelines

- `werkstatt.commands.validate` is NOT added to any pipeline (gated adoption)
- `PACKAGES_CHECK_PIPELINE` — no change
- Unit tests in `packages/werkstatt/src/tests/commands-validate.test.ts` — new test file

## 3. Step sequence

### Step 1. Fix `result-helpers.ts` helper compliance

**Goal:** Ensure `passResult` and `failResult` produce `[command.name]`-prefixed `summary` and explicit `exitCode`.

**Agent actions:**

- Read `packages/werkstatt-shared/src/checks/result-helpers.ts`
- Fix `passResult`: change `summary: summary ?? \`${command}: OK\`` to `summary: summary ?? \`[${command}] OK\`` and ensure `exitCode: 0` is explicit (already is)
- Fix `failResult`: change `summary: \`${command}: ${violations.length} violation(s)\`` to `summary: \`[${command}] ${violations.length} violation(s)\``
- Fix `diagnosticsResult`: change `summary: \`${command}: ${summary.error} error(s), ${summary.warning} warning(s)\`` to `summary: \`[${command}] ${summary.error} error(s), ${summary.warning} warning(s)\``
- Fix `resultFromViolations`: verify it delegates to `passResult`/`failResult` (transitively compliant)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-shared run build:check`
- `pnpm --filter @warpgogol/werkstatt-shared test`

**Completion criterion:** `passResult`, `failResult`, and `diagnosticsResult` all produce `[command.name]`-prefixed `summary` strings; `exitCode` is explicit on all paths.

**Human review:** no

---

### Step 2. Implement `commands-validate.ts` static analysis

**Goal:** Create the core implementation that scans `.ts` files for command handler return statements and produces `CMD-OUTPUT-*` diagnostics.

**Agent actions:**

- Create `packages/werkstatt/src/plugin/commands-validate.ts`
- Implement `runCommandsValidate(workspaceRoot: string, mode: "error" | "warning")` that:
  1. Scans `packages/werkstatt/src/**/*.ts`, `packages/werkstatt-site/src/**/*.ts`, `packages/werkstatt-shared/src/**/*.ts`
  2. Filters to files that (a) import `KernelCommandResult` or `KernelNextStep`, or (b) contain `registry.registerCommand` / `ALL_COMMANDS` patterns, or (c) contain return statements with `exitCode`/`summary`/`nextSteps` properties
  3. For each matching file, regex-scans return statements for object literals with `exitCode`, `summary`, `nextSteps` properties
  4. Applies rules:
     - `CMD-OUTPUT-01`: return object missing `exitCode` property
     - `CMD-OUTPUT-02`: return object missing `summary` or `summary` does not start with `[command.name]` pattern (regex: `^\[.+\]`)
     - `CMD-OUTPUT-03`: return object with `exitCode: 1` (or `exitCode` variable that resolves to failure) missing `nextSteps` or with empty `nextSteps: []`
  5. Exempts returns that delegate to `passResult`, `failResult`, `diagnosticsResult`, `resultFromViolations`, or `buildAuditResult` (detect by `return passResult(`, `return failResult(`, etc.)
  6. Produces `Diagnostic[]` using canonical `Diagnostic` type from `@warpgogol/werkstatt/schemas`, with `data: { file, commandName, line }`
  7. Returns `KernelCommandResult` with `exitCode` (0 or 1 based on mode and violations), `[werkstatt.commands.validate]`-prefixed `summary`, and `nextSteps` on failure
- Export `CommandsValidateResult` interface

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** `commands-validate.ts` compiles, exports `runCommandsValidate` and `CommandsValidateResult`, produces `Diagnostic[]` with `CMD-OUTPUT-*` rule IDs.

**Human review:** no

---

### Step 3. Register `werkstatt.commands.validate` command

**Goal:** Create the kernel module and wire it into the kernel config.

**Agent actions:**

- Create `packages/werkstatt/os/werkstatt-commands-validate.module.ts` following the pattern of `werkstatt-shared-validate.module.ts`
- Register command with `name: "werkstatt.commands.validate"`, `scope: "workspace"`, `cacheable: false`
- Add `--mode` flag schema (`"error" | "warning"`, default `"error"`)
- Add `--json` flag (boolean, default false)
- Set `reads` to `["packages/werkstatt/src/**", "packages/werkstatt-site/src/**", "packages/werkstatt-shared/src/**"]`
- In `execute`, call `runCommandsValidate(context.workspaceRoot, mode)` and return result with `[werkstatt.commands.validate]`-prefixed summary and `nextSteps` on failure
- Add `moduleLoaders` entry in `tools/kernel.config.ts`: `"werkstatt-commands-validate": async () => (await import("@warpgogol/werkstatt/os/werkstatt-commands-validate-module")).werkstattCommandsValidateModule`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm exec werkstatt run werkstatt.commands.validate` (manual smoke test — expect violations since handlers are not yet fixed)

**Completion criterion:** `werkstatt.commands.validate` is registered and runnable; `--json` and `--mode` flags work; command produces diagnostics.

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Cover all three rule IDs, helper-exempt returns, and `--mode` flag behavior.

**Agent actions:**

- Create `packages/werkstatt/src/tests/commands-validate.test.ts`
- Test cases:
  1. `CMD-OUTPUT-01`: return object without `exitCode` → violation reported
  2. `CMD-OUTPUT-02`: return object with `exitCode` but missing `summary` → violation
  3. `CMD-OUTPUT-02`: return object with `summary` not starting with `[...]` → violation
  4. `CMD-OUTPUT-03`: return object with `exitCode: 1` and no `nextSteps` → violation
  5. `CMD-OUTPUT-03`: return object with `exitCode: 1` and empty `nextSteps: []` → violation
  6. Helper-exempt: `return passResult(...)` → no violation
  7. Helper-exempt: `return failResult(...)` → no violation
  8. Helper-exempt: `return diagnosticsResult(...)` → no violation
  9. Helper-exempt: `return buildAuditResult(...)` → no violation
  10. `--mode=warning`: violations are warnings, `exitCode` is 0
  11. `--mode=error`: violations are errors, `exitCode` is 1
  12. Compliant return: `exitCode: 0`, `summary: "[cmd] OK"`, no `nextSteps` → no violation
  13. Compliant failure: `exitCode: 1`, `summary: "[cmd] failed"`, `nextSteps: [{ action: "...", kind: "required" }]` → no violation

**Validation:**

- `pnpm --filter @warpgogol/werkstatt test -- commands-validate`

**Completion criterion:** All test cases pass; coverage includes all three rule IDs and all five helper-exempt patterns.

**Human review:** no

---

### Step 5. Update `packages/werkstatt/AGENTS.md`

**Goal:** Document the output standard in the "Command handler patterns" section.

**Agent actions:**

- Add to `packages/werkstatt/AGENTS.md` "Command handler patterns" section:
  - Every command handler return path MUST set `exitCode` explicitly (both `0` and `1`)
  - `summary` MUST start with `[command.name]` prefix (e.g. `[nachweis.sign]`)
  - `nextSteps` MUST be present and non-empty on failure paths (`exitCode: 1`), with at least one `kind: "required"` entry
  - Use `passResult`/`failResult`/`diagnosticsResult` from `@warpgogol/werkstatt-shared/checks` for compliant output by default
  - Enforced by `werkstatt.commands.validate` (DNA-82)

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0903`

**Completion criterion:** `packages/werkstatt/AGENTS.md` "Command handler patterns" section includes the output standard rules.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `docs/architecture-dna.md` already contains DNA-82 (no change needed — confirmed at line 343-345)
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surface changed (new command registered)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0903 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0903`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt test`
- `pnpm --filter @warpgogol/werkstatt-shared run build:check`
- `pnpm --filter @warpgogol/werkstatt-shared test`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0903`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt-shared run build:check`
- `pnpm --filter @warpgogol/werkstatt test`
- `pnpm --filter @warpgogol/werkstatt-shared test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0903` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| False positives in static analysis | Step 2: three-tier file detection (import-based + registration pattern + return-shape) reduces false positives; Step 4: tests verify compliant returns are not flagged |
| False negatives for dynamic returns | Step 2: acceptable limitation documented in RFC; regex catches common case of direct object literal returns |
| Large initial violation count | Step 3: command is not in any pipeline; violations are expected and non-blocking during gated adoption |
| Agent misinterpretation (requiring nextSteps on success) | Step 5: AGENTS.md explicitly states nextSteps is optional on success |
| Helper drift | Step 1: fixes helpers first; Step 2: validator scans `result-helpers.ts` separately for compliance |
| Maintenance burden during gated adoption | Step 5: AGENTS.md documents the standard for new commands; future RFC will add to pipeline |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-82 or DNA-35, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0903 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the static analysis approach proves fundamentally inadequate (e.g., cannot handle factory-pattern handlers), escalate to a superseding RFC proposing AST-based analysis instead of regex.
