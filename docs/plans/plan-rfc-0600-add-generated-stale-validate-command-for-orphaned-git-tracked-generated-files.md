---
rfcId: RFC-0600
planId: PLAN-RFC-0600-01
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
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0600

## 1. Objectives

- [ ] Objective 1 — Export `expandGlob` and `resolveEntryPath` from `generated-files-validate.ts` for reuse (maps to acceptance criterion: "Uses `collectFiles` from `@warpgogol/share/fs`")
- [ ] Objective 2 — Implement `runGeneratedStaleValidate` in `src/generated-stale-validate.ts` using `Diagnostic[]` and `diagnosticsResult()` (maps to: "runGeneratedStaleValidate implemented", "Uses `diagnosticsResult()`")
- [ ] Objective 3 — Register `generated.stale.validate` command in `01-codegen.ts` (maps to: "command registered in `01-codegen.ts`")
- [ ] Objective 4 — Wire into `SITES_BUILD_PREPARE_PIPELINE`, `SITES_BUILD_PREPARE_DEV_PIPELINE`, and `SITES_CHECK_AUTHOR_PIPELINE` (maps to: "Command added to `SITES_BUILD_PREPARE_PIPELINE`", "Command added to `SITES_BUILD_PREPARE_DEV_PIPELINE`", "Command added to `SITES_CHECK_AUTHOR_PIPELINE`")
- [ ] Objective 5 — Implement content-aware preview image resolver and static asset exempt directories (maps to: "Static assets in `public/textures/` are not flagged", "Per-page preview images for existing content pages are not flagged", "Per-page preview images for deleted content pages ARE flagged")
- [ ] Objective 6 — Unit tests covering stale detection, static asset exemption, preview image resolution, and clean-pass (maps to: "Unit test in `src/tests/generated-stale-validate.test.ts`")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/generated-files-validate.ts` — Export `expandGlob` and `resolveEntryPath` (currently internal functions)
- `packages/os/site-kernel-checks/src/generated-stale-validate.ts` — New module implementing `runGeneratedStaleValidate`
- `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` — Register `generated.stale.validate` command
- `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` — Add step to `SITES_BUILD_PREPARE_PIPELINE` and `SITES_BUILD_PREPARE_DEV_PIPELINE`
- `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` — Add step to `SITES_CHECK_AUTHOR_PIPELINE`
- `packages/os/site-kernel-checks/src/tests/generated-stale-validate.test.ts` — New test file

### 2.2 Configuration and data

- `GENERATOR_OWNERSHIP_MAP` in `generator-ownership.ts` — Read-only; no changes needed (the map already contains all generated file declarations)
- Static asset exempt directories list — Hardcoded in `generated-stale-validate.ts`: `["public/textures/"]`

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — Add `src/generated-stale-validate.ts` to the module table
- No `docs/*.xml` Compass files need updates (no repository-wide semantic change)
- No `docs/architecture-dna.md` changes (no new DNA invariant)

### 2.4 Validation and pipelines

- `SITES_BUILD_PREPARE_PIPELINE` — Add `generated.stale.validate` after `generated.files.validate` (line 121)
- `SITES_BUILD_PREPARE_DEV_PIPELINE` — Add `generated.stale.validate` after `generated.files.validate` (line 172)
- `SITES_CHECK_AUTHOR_PIPELINE` — Add `generated.stale.validate` after `generated.files.validate` (line 257)
- `SITES_BUILD_CHECK_PIPELINE` — Automatically inherits via `SITES_CHECK_AUTHOR_PIPELINE` spread

## 3. Step sequence

### Step 1. Export shared helpers from generated-files-validate.ts

**Goal:** Make `expandGlob` and `resolveEntryPath` reusable by the new stale validate module.

**Agent actions:**

- Add `export` keyword to `expandGlob` function in `generated-files-validate.ts` (currently internal at line 73)
- Add `export` keyword to `resolveEntryPath` function in `generated-files-validate.ts` (currently internal at line 42)
- Add `export` keyword to `isWorkspaceAbsolute`, `hasGlobPattern`, and `toPosix` helper functions (needed by the new module)
- Also export `WORKSPACE_ABSOLUTE_PREFIXES` constant (needed by `isWorkspaceAbsolute`)
- Verify no naming conflicts with existing exports

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build` — compiles without errors
- `pnpm --filter @warpgogol/site-kernel-checks run test` — existing tests still pass

**Completion criterion:** `expandGlob`, `resolveEntryPath`, `isWorkspaceAbsolute`, and `hasGlobPattern` are exported from `generated-files-validate.ts` and the package builds successfully.

**Human review:** no

---

### Step 2. Create generated-stale-validate.ts module

**Goal:** Implement the `runGeneratedStaleValidate` command handler.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/generated-stale-validate.ts`
- Import `collectFiles` from `@warpgogol/share/fs`, `diagnosticsResult` from `./result-helpers.ts`, `GENERATOR_OWNERSHIP_MAP` from `./generator-ownership.ts`, and `expandGlob`, `resolveEntryPath`, `isWorkspaceAbsolute`, `hasGlobPattern` from `./generated-files-validate.ts`
- Implement the algorithm per RFC-0600 § Algorithm:
  1. Enumerate all files in the site's `public/` directory using `collectFiles`
  2. Expand `GENERATOR_OWNERSHIP_MAP` entries to concrete paths using `expandGlob` and `resolveEntryPath`
  3. Build a set of expected generated paths
  4. Define static asset exempt directories: `["public/textures/"]`
  5. For `public/preview/{lang}/*.png` files: derive owning content page slug from the filename stem (e.g., `public/preview/de/founder.png` → slug `founder`). Skip opt-out files starting with `-` (e.g., `public/preview/de/-founder.png`). Check `src/content/pages/{lang}/{slug}.md` existence via `context.io.exists()`. If the content page exists, the preview image is legitimate; if not, it is stale.
  6. For each file in `public/`: check against expected paths, exempt directories, and preview resolver; emit STALE-01 for orphans
- Use `Diagnostic` type with `ruleId: "STALE-01"`, `severity: "error"`, `file`, `message`, `fixHint`
- Return via `diagnosticsResult("generated.stale.validate", diagnostics)`
- Add MODULE_CONTRACT header with purpose and non-goals

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build` — compiles without errors

**Completion criterion:** `runGeneratedStaleValidate` is exported from `generated-stale-validate.ts` and compiles successfully.

**Human review:** no

---

### Step 3. Register command in 01-codegen.ts

**Goal:** Register `generated.stale.validate` in the codegen command table.

**Agent actions:**

- Add import of `runGeneratedStaleValidate` to `command-tables/01-codegen.ts`
- Add command entry after the `generated.files.validate` entry (line 593):
  ```ts
  {
    name: "generated.stale.validate",
    description: "Detect files in public/ not produced by any registered generator (RFC-0600).",
    scope: "workspace",
    flags: {
      app: { kind: "string", description: "App id for app-scoped path resolution." },
    },
    supportsAllSites: true,
    cacheable: false,
    execute: runGeneratedStaleValidate,
  },
  ```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build` — compiles without errors
- `pnpm exec site-kernel run command.manifest.validate --json` — no CMD-MAN-03 warnings for the new command

**Completion criterion:** Command is registered and `command.manifest.validate` passes without warnings about the new entry.

**Human review:** no

---

### Step 4. Wire into pipelines

**Goal:** Add `generated.stale.validate` to the three pipelines specified in the RFC.

**Agent actions:**

- In `pipelines/build-prepare.ts`:
  - Add `{ command: "generated.stale.validate" }` after `{ command: "generated.files.validate" }` in `SITES_BUILD_PREPARE_PIPELINE` (after line 121)
  - Add `{ command: "generated.stale.validate" }` after `{ command: "generated.files.validate" }` in `SITES_BUILD_PREPARE_DEV_PIPELINE` (after line 172)
- In `pipelines/sites-check-author.ts`:
  - Add `{ command: "generated.stale.validate" }` after `{ command: "generated.files.validate" }` (after line 257)
- Add CHANGE_SUMMARY entries to both pipeline files

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build` — compiles without errors
- `pnpm exec site-kernel run gate-catalog.validate --json` — no gate catalog drift

**Completion criterion:** All three pipeline files include the new step and the package builds successfully.

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Cover stale detection, static asset exemption, preview image resolution, and clean-pass scenarios.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/generated-stale-validate.test.ts` (must be under `src/tests/` per vitest config)
- Test cases:
  1. **Stale file detection**: Create a `public/` with a file not in the ownership map and not in an exempt directory → expects STALE-01 diagnostic with exitCode 1
  2. **Static asset exemption**: Create a file in `public/textures/` → expects no STALE-01 diagnostic
  3. **Preview image for existing page**: Create `public/preview/de/founder.png` and `src/content/pages/de/founder.md` → expects no STALE-01 diagnostic
  4. **Preview image for deleted page**: Create `public/preview/de/founder.png` without the content page → expects STALE-01 diagnostic
  5. **Opt-out preview file**: Create `public/preview/de/-founder.png` → expects no STALE-01 diagnostic (opt-out files are always exempt)
  6. **Clean pass**: Create only files matching ownership map entries → expects exitCode 0
  7. **Old app-name file**: Create `public/webgogol-com-indexnow.txt` → expects STALE-01 diagnostic
- Use `createDefaultIO` and a mock `KernelRuntimeContext` (follow the pattern in `generated-files-validate.test.ts`)
- Use `mkdtemp` for temp directories and clean up with `rm`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test -- --run generated-stale-validate` — all test cases pass

**Completion criterion:** All test cases pass and cover the acceptance criteria for stale detection, static asset exemption, and preview image resolution.

**Human review:** no

---

### Step 6. Update AGENTS.md and run validation suite

**Goal:** Synchronize documentation and run the full validation suite.

**Agent actions:**

- Add `src/generated-stale-validate.ts` to the module table in `packages/os/site-kernel-checks/AGENTS.md` with a one-line description
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0600` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-checks run test` — all tests pass
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed
- Run `pnpm exec site-kernel run command.manifest.validate --json` — no warnings for the new command

**Validation:**

- `rfc.validate` passes
- `build:check` passes
- All unit tests pass
- `command.manifest.validate` passes

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
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0600 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0600`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline evidence annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0600`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm exec site-kernel run command.manifest.validate --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0600` in the subject line (RFC-0265 commit hygiene)
- `docs/reviews/code/` review report for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives for static assets | Step 2: hardcoded exempt directories list includes `public/textures/` |
| False positives for per-page preview images | Step 2: content-aware resolver checks `src/content/pages/{lang}/{slug}.md` existence |
| Performance | Step 2: reuses `expandGlob` from `generated-files-validate.ts`; `collectFiles` is fast |
| Agent misinterpretation | Step 2: `fixHint` field says `git rm <path>`; agents should verify before deleting |

## 6. Escalation triggers

- If implementation reveals that `expandGlob` cannot be reused (e.g., signature incompatibility), extract a shared helper to a new `src/lib/glob-utils.ts` module instead of duplicating logic.
- If the content-aware preview image resolver needs to handle additional patterns beyond `public/preview/{lang}/*.png`, add them to the resolver in Step 2 rather than creating a separate command.
- If `command.manifest.validate` reports CMD-MAN-03 (ownership map drift), add the missing `writes[]` declaration to the command registration in Step 3.
