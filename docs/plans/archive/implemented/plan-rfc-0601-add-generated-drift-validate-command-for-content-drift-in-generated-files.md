---
rfcId: RFC-0601
planId: PLAN-RFC-0601-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/site-kernel-codegen"
    - "@warpgogol/site-kernel"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
    - docs/architecture-dna.md
---

# Implementation Plan: RFC-0601

## 1. Objectives

- [ ] Objective 1 — Register DRIFT-01 and DRIFT-02 diagnostic rules in `core-infra.ts` (maps to: "DRIFT-01 and DRIFT-02 registered in `diagnostics/rules/core-infra.ts`")
- [ ] Objective 2 — Export shared helpers from `generated-files-validate.ts` for reuse (maps to: "Glob patterns and placeholders expanded using RFC-0375 logic")
- [ ] Objective 3 — Implement `runGeneratedDriftValidate` in `src/generated-drift-validate.ts` using canonical `Diagnostic[]` and `diagnosticsResult()` (maps to: "`runGeneratedDriftValidate` implemented in `src/generated-drift-validate.ts`")
- [ ] Objective 4 — Register `generated.drift.validate` command in `01-codegen.ts` (maps to: "`generated.drift.validate` command registered in `01-codegen.ts` with `scope: workspace`")
- [ ] Objective 5 — Wire into `SITES_BUILD_CHECK_PIPELINE` after `generated.marker.validate` (maps to: "Command added to `build.check` pipeline after `generated.marker.validate`")
- [ ] Objective 6 — Add `dryRun` support to initial generator handlers (humans.generate, robots.generate, ai.generate) (maps to: "DRIFT-02 (info) emitted for generators without `dryRun` support")
- [ ] Objective 7 — Unit tests covering drift detection, clean-pass, dryRun-skip, binary-skip, glob-expansion, and git-tracking filter (maps to: "Unit test in `src/tests/generated-drift-validate.test.ts`")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts` — Register `DRIFT-01` (error) and `DRIFT-02` (info) rule descriptors
- `packages/os/site-kernel-checks/src/generated-files-validate.ts` — Export `expandGlob`, `resolveEntryPath`, `isWorkspaceAbsolute`, `hasGlobPattern`, `toPosix`, `WORKSPACE_ABSOLUTE_PREFIXES` (currently internal)
- `packages/os/site-kernel-checks/src/generated-drift-validate.ts` — **New module** implementing `runGeneratedDriftValidate`
- `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` — Register `generated.drift.validate` command
- `packages/os/site-kernel-checks/src/pipelines/build-check.ts` — Add step to `SITES_BUILD_CHECK_PIPELINE`
- `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` — Read-only import of `SITES_BUILD_PREPARE_PIPELINE` to filter generators
- `packages/os/site-kernel-checks/src/public-surface/humans.ts` — Add `dryRun` support to `runHumansGenerate`
- `packages/os/site-kernel-checks/src/robots.ts` — Add `dryRun` support to `runRobotsGenerate`
- `packages/os/site-kernel-checks/src/ai.ts` — Add `dryRun` support to `runAiGenerate` (also covers `ai.policy.generate` which delegates to `runAiGenerate`)
- `packages/os/site-kernel-checks/src/tests/generated-drift-validate.test.ts` — **New test file**

### 2.2 Configuration and data

- `GENERATOR_OWNERSHIP_MAP` in `generator-ownership.ts` — Read-only; no changes needed
- Binary extension list — Hardcoded in `generated-drift-validate.ts`: `[".png", ".ico", ".webp", ".mp4", ".webm", ".jpg", ".jpeg", ".gif", ".tiff", ".heic", ".heif", ".svg"]`

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — Add `src/generated-drift-validate.ts` to the module table
- `docs/architecture-dna.md` — DNA-58 already added (RFC-0607 accepted)

### 2.4 Validation and pipelines

- `SITES_BUILD_CHECK_PIPELINE` in `build-check.ts` — Add `generated.drift.validate` after `generated.marker.validate` (line 255 area, after the `SITES_CHECK_AUTHOR_PIPELINE` spread + `generated.marker.validate`)

## 3. Step sequence

### Step 1. Register DRIFT-01 and DRIFT-02 diagnostic rules

**Goal:** Register the two new diagnostic rule IDs in the canonical rule registry.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts`, add after the `GEN-FILES-01` entry (line ~464):
  ```ts
  // generated.drift.validate — RFC-0601 content drift detection.
  "DRIFT-01": rule(
    "DRIFT-01",
    "Committed file content differs from generator output",
    "generated.drift.validate",
  ),
  "DRIFT-02": rule(
    "DRIFT-02",
    "Generator does not support dryRun mode; skipped",
    "generated.drift.validate",
    "info",
  ),
  ```
- Add a CHANGE_SUMMARY entry for RFC-0601

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build` — compiles without errors

**Completion criterion:** `DRIFT-01` and `DRIFT-02` are registered in `CORE_INFRA_RULES` and the package builds successfully.

**Human review:** no

---

### Step 2. Export shared helpers from generated-files-validate.ts

**Goal:** Make `expandGlob`, `resolveEntryPath`, and path helpers reusable by the new drift validate module.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/generated-files-validate.ts`:
  - Add `export` keyword to `toPosix` (line 31)
  - Add `export` keyword to `WORKSPACE_ABSOLUTE_PREFIXES` (line 35)
  - Add `export` keyword to `isWorkspaceAbsolute` (line 37)
  - Add `export` keyword to `resolveEntryPath` (line 42)
  - Add `export` keyword to `hasGlobPattern` (line 65)
  - Add `export` keyword to `expandGlob` (line 73)
  - Verify no naming conflicts with existing exports

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build` — compiles without errors
- `pnpm --filter @warpgogol/site-kernel-checks run test` — existing tests still pass

**Completion criterion:** All five helpers plus `WORKSPACE_ABSOLUTE_PREFIXES` are exported and the package builds successfully.

**Human review:** no

---

### Step 3. Create generated-drift-validate.ts module

**Goal:** Implement the `runGeneratedDriftValidate` command handler.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/generated-drift-validate.ts`
- Add MODULE_CONTRACT header with purpose and non-goals
- Import:
  - `Diagnostic`, `CheckResult`, `KernelCommandInput`, `KernelCommandResult`, `KernelRuntimeContext`, `executeKernelCommand` from `@warpgogol/site-kernel`
  - `diagnosticsResult` from `./result-helpers.ts`
  - `GENERATOR_OWNERSHIP_MAP`, `OwnershipEntry` from `./generator-ownership.ts`
  - `expandGlob`, `resolveEntryPath`, `isWorkspaceAbsolute`, `hasGlobPattern`, `toPosix` from `./generated-files-validate.ts`
  - `SITES_BUILD_PREPARE_PIPELINE` from `./pipelines/build-prepare.ts`
  - `collectFiles` from `@warpgogol/share/fs`
  - `execFile` from `node:child_process/promises` (for `git ls-files`)
  - `join`, `relative` from `node:path`
- Define `BINARY_EXTENSIONS` constant: `[".png", ".ico", ".webp", ".mp4", ".webm", ".jpg", ".jpeg", ".gif", ".tiff", ".heic", ".heif", ".svg"]`
- Define `isBinaryFile(path: string): boolean` — checks extension against `BINARY_EXTENSIONS`
- Define `normalizeContent(s: string): string` — normalizes line endings to LF and trims trailing whitespace per line
- Define `async function getGitTrackedFiles(siteDir: string, workspaceRoot: string): Promise<Set<string>>` — runs `git ls-files` from the workspace root with pathspec scoped to both the site directory and workspace-absolute prefixes (e.g., `packages/ui/`). Returns a set of POSIX-relative paths from the workspace root
- Implement the algorithm per RFC-0601 § Algorithm:
  1. Resolve the site workspace from `context.site?.directory` (mission-aware)
  2. Get git-tracked files via `git ls-files` scoped to the site directory
  3. For each `GENERATOR_OWNERSHIP_MAP` entry: a. Skip if `conditional: true` b. Skip if `isBinaryFile(entry.path)` — binary files are excluded c. Expand glob patterns and placeholders using `expandGlob` and `resolveEntryPath` (same logic as `generated.files.validate`) d. For workspace-absolute paths (e.g., `packages/ui/`), resolve relative to `workspaceRoot` e. For each expanded file path:
     - Check if file exists on disk (skip if not — RFC-0375 handles missing files)
     - Check if file is git-tracked (skip if not — untracked files cannot have drift)
     - Identify the owning generator from `entry.command`
     - Check if the generator is in `SITES_BUILD_PREPARE_PIPELINE` (skip if not — avoids false positives from non-build.prepare generators)
     - Re-invoke the generator's command handler via `executeKernelCommand({ commandName: entry.command, workspaceRoot, siteName, dryRun: true })` (public API from `@warpgogol/site-kernel`). This creates a fresh context with `dryRun: true` and returns a `KernelExecutionReport`
     - Capture the in-memory rendered output from the report's `data.renderedFiles` field (a `Record<string, string>` keyed by workspace-relative path). If `data.renderedFiles` is absent or does not contain the expected path → emit DRIFT-02 info Diagnostic (generator does not support dryRun)
     - Read the file from disk
     - Normalize line endings to LF in both
     - Compare byte-for-byte. On mismatch → emit DRIFT-01 error Diagnostic
     - If generator does not support dryRun (no `renderedFiles` in result) → emit DRIFT-02 info Diagnostic
  4. Return via `diagnosticsResult("generated.drift.validate", diagnostics)`
- Each DRIFT-01 Diagnostic carries: `ruleId: "DRIFT-01"`, `severity: "error"`, `message`, `file` (workspace-relative POSIX path), `data: { generator: string }`, `fixHint: "Re-run: pnpm exec site-kernel run <generator> --site <id>"`
- Each DRIFT-02 Diagnostic carries: `ruleId: "DRIFT-02"`, `severity: "info"`, `message`, `file`, `data: { generator: string }`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build` — compiles without errors

**Completion criterion:** `runGeneratedDriftValidate` is exported from `generated-drift-validate.ts` and compiles successfully.

**Human review:** no

---

### Step 4. Register command in 01-codegen.ts

**Goal:** Register `generated.drift.validate` in the codegen command table.

**Agent actions:**

- Add import of `runGeneratedDriftValidate` to `command-tables/01-codegen.ts`
- Add command entry after the `generated.files.validate` entry (line ~593):
  ```ts
  {
    name: "generated.drift.validate",
    description:
      "Detect content drift in text-based generated files by re-rendering from source and comparing with committed disk content (RFC-0601).",
    scope: "workspace",
    flags: {
      app: { kind: "string", description: "App id for app-scoped path resolution." },
    },
    supportsAllSites: true,
    cacheable: false,
    mutatesState: false,
    execute: runGeneratedDriftValidate,
  },
  ```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build` — compiles without errors
- `pnpm exec site-kernel run command.manifest.validate --json` — no CMD-MAN-03 warnings for the new command

**Completion criterion:** Command is registered and `command.manifest.validate` passes without warnings about the new entry.

**Human review:** no

---

### Step 5. Wire into build.check pipeline

**Goal:** Add `generated.drift.validate` to the `SITES_BUILD_CHECK_PIPELINE`.

**Agent actions:**

- In `pipelines/build-check.ts`:
  - Import `SITES_BUILD_PREPARE_PIPELINE` from `./build-prepare.ts` (to check which generators are in build.prepare)
  - Add `{ command: "generated.drift.validate" }` after the `SITES_CHECK_AUTHOR_PIPELINE` spread and before the post-build validators. Specifically, insert it after the `generated.marker.validate` step that runs via `SITES_CHECK_AUTHOR_PIPELINE` (line 255 in `sites-check-author.ts`), which is spread into `SITES_BUILD_CHECK_PIPELINE` at the top. The step should be added in `build-check.ts` after the spread, before `biome.tokens.validate`:
    ```ts
    export const SITES_BUILD_CHECK_PIPELINE: KernelPipelineStep[] = [
      ...SITES_CHECK_AUTHOR_PIPELINE,
      // RFC-0601: detect content drift in text-based generated files
      { command: "generated.drift.validate" },
      // RFC-0201: validate CSS token usage against the active biome after codegen
      { command: "biome.tokens.validate" },
      ...
    ];
    ```
  - Add CHANGE_SUMMARY entry for RFC-0601

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build` — compiles without errors
- `pnpm exec site-kernel run gate-catalog.validate --json` — no gate catalog drift

**Completion criterion:** Pipeline includes the new step and the package builds successfully.

**Human review:** no

---

### Step 6. Add dryRun support to initial generators

**Goal:** Add `dryRun: true` support to the three simplest generators as a proof-of-concept and to validate the dryRun mechanism.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/`:
  - **`public-surface/humans.ts`** (`runHumansGenerate`): Check `context.dryRun`. When true:
    - Execute all read operations as normal (load system.md, team data)
    - Render the humans.txt content in memory
    - Do NOT write to disk (skip `writeFileIfChanged`)
    - Return `data.renderedFiles: { "public/humans.txt": renderedContent }` in the command result
  - **`robots.ts`** (`runRobotsGenerate`): Same pattern — render in memory, return `data.renderedFiles`, skip disk write
  - **`ai.ts`** (`runAiGenerate`): Same pattern. Note: `ai.policy.generate` delegates to `runAiGenerate`, so dryRun support is inherited automatically
- Each generator's `dryRun` mode MUST produce byte-identical output to normal mode (after line-ending normalization)
- Each generator's `dryRun` flag is read from `KernelRuntimeContext.dryRun` (not a CLI flag)
- The `dryRun` mode is opt-in (default `false` — existing callers are unaffected)
- Add a CHANGE_SUMMARY entry to each modified file

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build` — compiles without errors
- `pnpm --filter @warpgogol/site-kernel-checks run test` — existing tests still pass
- Manual verification: run `pnpm exec site-kernel run humans.generate --site warpgogol-com --dry-run --json` and verify `data.renderedFiles` contains the rendered content

**Completion criterion:** Three generators support `dryRun` mode and return rendered content without writing to disk.

**Human review:** no

---

### Step 7. Write unit tests

**Goal:** Cover drift detection, clean-pass, dryRun-skip, binary-skip, glob-expansion, and git-tracking filter scenarios.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/generated-drift-validate.test.ts` (must be under `src/tests/` per vitest config)
- Test cases:
  1. **Drift detection**: Create a file on disk with content that differs from the generator's dryRun output → expects DRIFT-01 error diagnostic with exitCode 1
  2. **Clean pass**: Create a file on disk that matches the generator's dryRun output → expects zero diagnostics, exitCode 0
  3. **dryRun skip**: Generator does not return `renderedFiles` in dryRun mode → expects DRIFT-02 info diagnostic, exitCode 0
  4. **Binary skip**: Ownership entry with `.png` extension → expects no diagnostic for that entry
  5. **Glob expansion**: Entry with `{lang}` placeholder → correctly expands to per-language files
  6. **Git-tracking filter**: File exists on disk but is not git-tracked → expects no diagnostic (untracked files are skipped)
  7. **Conditional skip**: Entry with `conditional: true` → expects no diagnostic
  8. **Workspace-absolute path**: Entry with `packages/ui/` prefix → resolved relative to workspaceRoot
- Use `createDefaultIO` and a mock `KernelRuntimeContext` (follow the pattern in `generated-files-validate.test.ts`)
- Use `mkdtemp` for temp directories and clean up with `rm`
- Mock `executeRegisteredCommand` to return synthetic `renderedFiles` for dryRun mode
- Mock `git ls-files` via `execFile` mock

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test -- --run generated-drift-validate` — all test cases pass

**Completion criterion:** All test cases pass and cover the acceptance criteria for drift detection, binary skip, dryRun skip, glob expansion, and git-tracking filter.

**Human review:** no

---

### Step 8. Update AGENTS.md and run validation suite

**Goal:** Synchronize documentation and run the full validation suite.

**Agent actions:**

- Add `src/generated-drift-validate.ts` to the module table in `packages/os/site-kernel-checks/AGENTS.md` with a one-line description
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0601` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-checks run test` — all tests pass
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed
- Run `pnpm exec site-kernel run command.manifest.validate --json` — no warnings for the new command
- Run `pnpm exec site-kernel run diagnostic.shape.lint --json` — no DSL-02 warnings for unregistered DRIFT-01/DRIFT-02

**Validation:**

- `rfc.validate` passes
- `build:check` passes
- All unit tests pass
- `command.manifest.validate` passes
- `diagnostic.shape.lint` passes

**Completion criterion:** All validation commands pass with zero errors.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-checks/AGENTS.md` module table includes the new module
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0601 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0601`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline evidence annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0601`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm exec site-kernel run command.manifest.validate --json`
- `pnpm exec site-kernel run diagnostic.shape.lint --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0601` in the subject line (RFC-0265 commit hygiene)
- `docs/reviews/code/` review report for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Generator side effects in dryRun | Step 6: each generator's dryRun implementation suppresses all side effects (no file writes, no cache updates) |
| dryRun output fidelity | Step 6: each generator's dryRun mode verified to produce byte-identical output to normal mode |
| Performance | Step 3: command runs in `build.check` (not `build.prepare`), so it does not slow down the dev loop; ~30-50 text-based files per site |
| False positives from line-ending differences | Step 3: `normalizeContent` normalizes line endings to LF and trims trailing whitespace |
| Glob and placeholder expansion complexity | Step 2: reuse existing `expandGlob` and `resolveEntryPath` from `generated-files-validate.ts` |
| False positives from non-build.prepare generators | Step 3: skip files whose owning generator is not in `SITES_BUILD_PREPARE_PIPELINE` |

## 6. Escalation triggers

- If `executeKernelCommand` cannot be called in-process from within `generated.drift.validate` (e.g., registry not available in the checks package context), extract a shared `invokeGeneratorDryRun` helper to `packages/os/site-kernel/src/runtime/` and call it from both the validator and the pipeline executor.
- If the `dryRun` flag on `KernelRuntimeContext` is insufficient (e.g., a generator needs more context), add an optional `dryRunOutput: { renderedFiles: Record<string, string> }` field to `KernelCommandResult.data` as a convention, documented in the kernel types.
- If `git ls-files` is too slow for large sites, cache the result per-invocation (the command runs once per `build.check`).
- If a generator's `dryRun` mode cannot guarantee output fidelity (e.g., timestamp-dependent output), skip it with DRIFT-02 and document the limitation in the generator's MODULE_CONTRACT.
