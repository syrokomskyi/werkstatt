---
rfcId: RFC-0602
planId: PLAN-RFC-0602-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/site-kernel-checks"
  services: []
  docs:
    - docs/verification-plan.xml
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0602

## 1. Objectives

- [ ] O1 — Complete `GENERATOR_OWNERSHIP_MAP` `module` fields for all entries — enables full scan coverage
- [ ] O2 — Implement `generated.timestamp.validate` command (Phase 1 source lint + Phase 2 `--deep` drift detection) — maps to acceptance criteria 1-7
- [ ] O3 — Implement `--mode warning|fail` flag (default `warning` during migration window) — maps to acceptance criterion 8
- [ ] O4 — Wire command into `build.check` pipeline — maps to acceptance criterion 9
- [ ] O5 — Standard `CheckResult` output with `diagnostics[]` (allowlist exemptions as `info` severity) — maps to acceptance criteria 10-11
- [ ] O6 — Unit tests covering source lint, allowlist, comment/string exclusion, clean pass, Phase 2 drift — maps to acceptance criterion 12
- [ ] O7 — Documentation sync (`verification-plan.xml`, `AGENTS.md`) — maps to acceptance criteria 13-14
- [ ] O8 — `rfc.validate` passes — maps to acceptance criterion 15

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/generated-timestamp-validate.ts` — **new module**: `runGeneratedTimestampValidate`, `TIMESTAMP_ALLOWLIST`, `TimestampAllowlistEntry`
- `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` — register `generated.timestamp.validate` entry
- `packages/os/site-kernel-checks/src/pipelines/build-check.ts` — add `{ command: "generated.timestamp.validate" }` step
- `packages/os/site-kernel-checks/src/generator-ownership.ts` — **modify**: add `module` field to all entries currently missing it (~30 entries: `overlay.pages.generate`, `routes.generate`, `agents.generate`, `biome.css.generate`, `legal.scaffold`, `entitlements.resolve`, etc.)

### 2.2 Configuration and data

- `TIMESTAMP_ALLOWLIST` constant in the new module — initial entries:
  - `packages/os/site-kernel-checks/src/agent/agent-surface-sign.ts` (pattern: `new Date().toISOString()`, reason: Ed25519 signing proof `created` timestamp, deterministic per RFC-0308)
  - `packages/os/site-kernel-checks/src/surface-breaker.ts` (pattern: `new Date().toISOString()`, reason: breaker verdict `evaluatedAt`, operational state not a generated file field)
  - `packages/os/site-kernel-codegen/src/open-source-page.ts` (pattern: `process.env.BUILD_TIMESTAMP`, reason: CI build metadata fallback, not `new Date()`)

### 2.3 Documentation and specs

- `docs/verification-plan.xml` — register `generated.timestamp.validate` in the `build.check` pipeline section
- `packages/os/site-kernel-checks/AGENTS.md` — add module table entry for `src/generated-timestamp-validate.ts`

### 2.4 Validation and pipelines

- `build.check` pipeline (`SITES_BUILD_CHECK_PIPELINE`) — new step appended after `open-source.validate`
- `PACKAGES_CHECK_PIPELINE` — not modified (workspace-scope command, not packages-scope)
- CI workflows — no changes needed (command runs as part of `build.check`)

## 3. Step sequence

### Step 1. Complete `GENERATOR_OWNERSHIP_MAP` `module` fields

**Goal:** Add `module` field to all ownership entries currently missing it, enabling full scan coverage for the timestamp lint.

**Agent actions:**

- Read `packages/os/site-kernel-checks/src/generator-ownership.ts` and identify all entries without `module`
- For each entry, trace the `command` to its source module:
  - `overlay.pages.generate` → `packages/os/site-kernel-codegen/src/overlay-pages.ts`
  - `routes.generate` → `packages/os/site-kernel-codegen/src/app-boilerplate.ts`
  - `agents.generate` → `packages/os/site-kernel-codegen/src/agents-docs.ts`
  - `biome.css.generate` → `packages/os/site-kernel-codegen/src/biome-css.ts`
  - `fonts.imports.generate` → `packages/os/site-kernel-codegen/src/fonts-imports.ts`
  - `legal.scaffold` → `packages/os/site-kernel-codegen/src/legal-scaffold.ts`
  - `entitlements.resolve` → `packages/os/site-kernel-checks/src/entitlements.ts`
  - `props.types.generate` → `packages/os/site-kernel-codegen/src/props-types.ts`
  - `material.credits.generate` → `packages/os/site-kernel-codegen/src/material-credits.ts`
  - `i18n.middleware.generate` → `packages/os/site-kernel-codegen/src/i18n-middleware.ts`
  - `api.routes.generate` → `packages/os/site-kernel-codegen/src/api-routes.ts`
  - `env.example.generate` → `packages/os/site-kernel-checks/src/env-example.ts`
  - `styles.global.generate` → `packages/os/site-kernel-codegen/src/styles-global.ts`
  - `scripts.orchestrator.generate` → `packages/os/site-kernel-codegen/src/scripts-orchestrator.ts`
  - `cms.schema.generate` → `packages/os/site-kernel-checks/src/cms.ts` (already has module)
  - Verify each path exists on disk before adding
- Add `module: "<path>"` to each entry missing it

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes
- `pnpm exec site-kernel run generator.ownership.lint` — still passes (no ownership conflicts introduced)
- `pnpm exec site-kernel run command.manifest.validate` — no new CMD-MAN-03 warnings

**Completion criterion:** Every entry in `GENERATOR_OWNERSHIP_MAP` has a `module` field pointing to an existing source file.

**Human review:** no

---

### Step 2. Implement `generated-timestamp-validate.ts` module

**Goal:** Create the new command handler with Phase 1 source lint, Phase 2 double-build drift detection, allowlist, comment/string exclusion, and `--mode`/`--deep` flags.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/generated-timestamp-validate.ts`
- Import `GENERATOR_OWNERSHIP_MAP` from `./generator-ownership.ts`
- Import `diagnosticsResult` from `./result-helpers.ts`
- Import `executeKernelPipeline` from `@warpgogol/site-kernel` for Phase 2
- Define `TimestampAllowlistEntry` interface and `TIMESTAMP_ALLOWLIST` constant with 3 initial entries
- Define volatile timestamp patterns: `new Date().toISOString()`, `new Date()`, `Date.now()`, `process.env.BUILD_TIMESTAMP`
- Implement `runGeneratedTimestampValidate(input, context)`:
  - Extract `--deep`, `--mode` flags from `input.flags` (default `mode: "warning"` during migration window)
  - Phase 1 (always): collect unique `module` paths from `GENERATOR_OWNERSHIP_MAP` (all entries now have `module` after Step 1); read each file; scan line-by-line with comment/string-literal exclusion; match volatile patterns; filter out allowlisted entries; emit `error`-severity diagnostics for violations and `info`-severity diagnostics for allowlist exemptions
  - Phase 2 (when `--deep` is passed): run `build.prepare` twice via `executeKernelPipeline` (standalone, not inside `build.check`); diff text-based generated files between the two runs; for each changed file, identify the volatile field and emit `error`-severity diagnostic with `field` annotation
  - In `warning` mode (default during migration): downgrade `error` diagnostics to `warning` severity (exit 0)
  - In `fail` mode: `error` diagnostics cause exit 1
  - Return `diagnosticsResult("generated.timestamp.validate", diagnostics)`
- Comment/string-literal exclusion logic:
  - Skip lines starting with `//` (after optional whitespace)
  - Track `/* */` block comment state across lines
  - Skip matches inside single-quoted, double-quoted, or backtick string literals on the same line

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** Module compiles, exports `runGeneratedTimestampValidate`, and produces `CheckResult` with `diagnostics[]` (not `violations[]`/`notices[]` — the RFC's output format example is illustrative; the actual type uses `diagnostics[]` with `severity` levels).

**Human review:** no

---

### Step 3. Register command in `01-codegen.ts`

**Goal:** Add the command entry to the data-driven command table.

**Agent actions:**

- Import `runGeneratedTimestampValidate` from `../generated-timestamp-validate.ts`
- Add entry to `CODEGEN_COMMANDS`:
  ```ts
  {
    name: "generated.timestamp.validate",
    description: "Detect volatile timestamps (new Date(), Date.now(), process.env.BUILD_TIMESTAMP) in generator source modules (RFC-0602).",
    scope: "workspace",
    flags: {
      deep: { type: "boolean", description: "Enable Phase 2 double-build drift detection" },
      mode: { type: "string", description: "warning (exit 0) or fail (exit 1)", default: "warning" },
    },
    reads: [
      "packages/os/site-kernel-checks/src/**/*.ts",
      "packages/os/site-kernel-codegen/src/**/*.ts",
      "packages/os/site-kernel-handoff/src/**/*.ts",
    ],
    execute: runGeneratedTimestampValidate,
  }
  ```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes
- `pnpm exec site-kernel run command.manifest.validate --json` — no CMD-MAN-03 warning for the new command

**Completion criterion:** Command appears in `docs/command-manifest.generated.yaml` after `ecosystem.manifest.generate` runs.

**Human review:** no

---

### Step 4. Wire into `build.check` pipeline

**Goal:** Add `generated.timestamp.validate` to `SITES_BUILD_CHECK_PIPELINE` for the migration window.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/pipelines/build-check.ts`
- Append `{ command: "generated.timestamp.validate" }` after `{ command: "open-source.validate" }`
- The command defaults to `warning` mode (set in Step 3), so the pipeline step runs without explicit flags. After all generators are fixed (separate follow-up task), change the default to `fail` in the command registration.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes
- `pnpm exec site-kernel run build.check --site warpgogol-com --json` — `generated.timestamp.validate` appears in pipeline sub-results with `status: "warn"` (warning mode, existing violations)

**Completion criterion:** `build.check` pipeline includes `generated.timestamp.validate` and it runs without crashing.

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Cover source lint detection, allowlist exemption, comment/string exclusion, clean-pass, Phase 2 drift, and warning/fail mode scenarios.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/generated-timestamp-validate.test.ts`
- Test cases:
  1. **Source lint detection**: fixture file with `new Date().toISOString()` → TS-TIME-01 error diagnostic
  2. **Allowlist exemption**: fixture file matching allowlist entry → `info`-severity diagnostic, no error
  3. **Comment exclusion**: fixture file with `// new Date().toISOString()` in comment → no diagnostic
  4. **Block comment exclusion**: fixture file with `/* new Date().toISOString() */` → no diagnostic
  5. **String literal exclusion**: fixture file with `"new Date().toISOString()"` in string → no diagnostic
  6. **Clean pass**: fixture file with no volatile patterns → empty diagnostics, `status: "pass"`
  7. **Warning mode**: violations with `--mode warning` → `warning` severity, exit 0
  8. **Fail mode**: violations with `--mode fail` → `error` severity, exit 1
  9. **`Date.now()` detection**: fixture with `Date.now()` → TS-TIME-01
  10. **`process.env.BUILD_TIMESTAMP` detection**: fixture with `process.env.BUILD_TIMESTAMP` in assignment → TS-TIME-01
  11. **Phase 2 drift**: mock `executeKernelPipeline` to produce a changed file → TS-TIME-01 with `field` annotation
  12. **Phase 2 clean**: mock `executeKernelPipeline` to produce no changes → `status: "pass"`
- Use vitest with `vi.mock` for `GENERATOR_OWNERSHIP_MAP` to provide controlled fixture paths
- Use `vi.mock` for `@warpgogol/site-kernel` `executeKernelPipeline` in Phase 2 tests
- Test file must live under `src/tests/` per vitest config (`include: ["src/tests/**/*.test.ts"]`)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test -- --run generated-timestamp-validate` — all tests pass

**Completion criterion:** All 12 test cases pass.

**Human review:** no

---

### Step 6. Update documentation

**Goal:** Synchronize `verification-plan.xml` and `AGENTS.md` with the new command.

**Agent actions:**

- Update `docs/verification-plan.xml`: add `generated.timestamp.validate` to the `build.check` pipeline command list
- Update `packages/os/site-kernel-checks/AGENTS.md`: add module table entry:
  ```
  | `src/generated-timestamp-validate.ts` | RFC-0602 `runGeneratedTimestampValidate` — scans generator source modules (from `GENERATOR_OWNERSHIP_MAP`) for volatile timestamp patterns (`new Date().toISOString()`, `Date.now()`, `new Date()`, `process.env.BUILD_TIMESTAMP`). Diagnostics: TS-TIME-01. Allowlist exemptions reported as info-severity diagnostics. `--deep` enables Phase 2 double-build drift detection (standalone, not in `build.check`). `--mode warning|fail` controls exit code (default `warning` during migration window). |
  ```
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` to update `docs/ecosystem.generated.yaml` with the new command

**Validation:**

- `git diff docs/verification-plan.xml` — shows new command entry
- `git diff packages/os/site-kernel-checks/AGENTS.md` — shows new module table row
- `git diff docs/ecosystem.generated.yaml` — shows new command in ecosystem manifest

**Completion criterion:** All three docs updated and committed.

**Human review:** no

---

### Step 7. Run validation suite

**Goal:** Verify all acceptance criteria pass.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0602` — RFC validates
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes
- Run `pnpm --filter @warpgogol/site-kernel-checks run test -- --run` — all tests pass
- Run `pnpm exec site-kernel run build.check --site warpgogol-com --json` — command appears in pipeline, exits 0 (warning mode)
- Run `pnpm exec site-kernel run generated.timestamp.validate --json` — command runs standalone, produces `CheckResult` with `diagnostics[]`
- Verify `docs/command-manifest.generated.yaml` includes the new command

**Validation:**

- All commands exit 0 (or expected exit codes for warning mode)
- No type errors
- All tests pass

**Completion criterion:** All validation commands pass.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (do not hand-edit `docs/ecosystem.generated.yaml`).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0602 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476). The command validates all preconditions (status, criteria, clean tree, commit reachability). Do NOT hand-edit `status`, `implementedAt`, or `closedAt` fields — use the command.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0602`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0602`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test -- --run generated-timestamp-validate`
- `pnpm exec site-kernel run build.check --site warpgogol-com --json`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0602.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0602` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives for legitimate timestamps | Step 2: allowlist with `reason` field; Step 5: test allowlist exemption |
| Phase 2 performance | Step 2: `--deep` is opt-in, never in `build.check` pipeline (Step 4) |
| Maintenance burden | Step 2: allowlist is a typed data structure with `module`, `reason`, `pattern` fields |
| Regex false positives | Step 2: comment/string-literal exclusion; Step 5: tests for exclusion cases |
| Cross-package generators | Step 1: complete `module` fields on all entries; Step 2: reads `GENERATOR_OWNERSHIP_MAP.module` which spans `site-kernel-checks`, `site-kernel-codegen`, `site-kernel-handoff` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-18 or DNA-53, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0602 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `CheckResult` type does not support `notices[]` (it uses `diagnostics[]` with severity levels), use `info`-severity diagnostics for allowlist exemptions — this is a type-level adaptation, not an RFC-level change.
- If a `module` path added in Step 1 does not exist on disk, verify the command-to-module mapping — the generator may have been renamed or refactored. Fix the path, do not skip the entry.
