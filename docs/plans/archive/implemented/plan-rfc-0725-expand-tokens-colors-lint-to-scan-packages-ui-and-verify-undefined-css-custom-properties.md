---
rfcId: RFC-0725
planId: PLAN-RFC-0725-01
status: draft
owner: architecture
createdAt: 2026-08-07
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/ui"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0725

## 1. Objectives

- [ ] Extend `runHardcodedColorLint` to scan `packages/ui/src/**/*.css` for raw colors and undefined `--ds-*` tokens — maps to acceptance criteria 1, 2, 6
- [ ] Add `reason: "undefined-token"` to findings and exit code 1 on undefined tokens — maps to acceptance criteria 3, 4
- [ ] Handle missing `packages/ui/src` with warning, not error — maps to acceptance criterion 5
- [ ] Add unit tests for new functionality — maps to acceptance criterion 7
- [ ] Update command table `reads` and `description` — maps to acceptance criterion 8
- [ ] Pass `rfc.validate` — maps to acceptance criterion 9

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/checks/tokens.ts` — extend `runHardcodedColorLint` with packages-level scan + undefined token check; add `ColorLintFinding` and `UndefinedTokenFinding` interfaces; add `scanPackagesUiCss` helper
- `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts` — update `tokens.colors.lint` entry: `reads` field add `packages/ui/src/**/*.css`; update `description`
- `packages/os/site-kernel-checks/src/tests/tokens-colors-lint.test.ts` — new test file

### 2.2 Configuration and data

No configuration or data files affected.

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — update `tokens.ts` module description if it lists `runHardcodedColorLint` responsibilities
- RFC file (read-only reference)

### 2.4 Validation and pipelines

- `tokens.colors.lint` already runs in `sites-check-author` pipeline — no pipeline changes needed
- No CI workflow changes needed

## 3. Step sequence

### Step 1. Extend `runHardcodedColorLint` with packages-level scan and undefined token check

**Goal:** Add the core scanning logic for `packages/ui/src/**/*.css` and undefined `--ds-*` token verification.

**Agent actions:**

- Import `TOKEN_NAME_SET` from `@warpgogol/tokens` at the top of `tokens.ts` (already a workspace dependency)
- Add `ColorLintFinding` interface extending the existing finding shape with optional `reason: "raw-rgba" | "raw-hex" | "undefined-token"`
- Add `UndefinedTokenFinding` interface
- Add `scanPackagesUiCss(workspaceRoot: string, tokenNameSet: Set<string>): Promise<ColorLintFinding[]>` helper:
  - Resolve `packages/ui/src` from `workspaceRoot`
  - If directory missing, log warning and return `[]`
  - Collect all `.css` files recursively via `collectFilesByExtensions`
  - For each file: strip comments/URLs, extract `var(--ds-*)` references via regex, check membership in `tokenNameSet`
  - Return findings with `reason: "undefined-token"`
- Extend `runHardcodedColorLint`:
  - After existing app-level scan, call `scanPackagesUiCss(context.workspaceRoot, TOKEN_NAME_SET)`
  - Also run raw color check (rgba/hex) on packages-level files
  - Merge findings from both levels
  - Extend return data to include `violations: ColorLintFinding[]` alongside existing `findings` count
  - Log all findings with workspace-relative paths for packages-level, app-relative for app-level

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** `runHardcodedColorLint` scans both app and packages CSS, reports undefined tokens, and returns extended data shape with `violations` array.

**Human review:** no

---

### Step 2. Update command table entry

**Goal:** Update the `tokens.colors.lint` command registration to reflect new scan scope and description.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts`:
  - Update `reads` from `["<app>/src/styles/**/*.css"]` to `["<app>/src/styles/**/*.css", "packages/ui/src/**/*.css"]`
  - Update `description` from `"Lint styles for raw rgba and hex color usage."` to `"Lint styles for raw rgba, hex color usage, and undefined CSS custom properties."`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes

**Completion criterion:** Command table entry reflects new `reads` and `description`.

**Human review:** no

---

### Step 3. Add unit tests

**Goal:** Cover the new scanning logic with unit tests.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/tokens-colors-lint.test.ts`
- Test cases:
  1. **Undefined token detection**: CSS with `var(--ds-nonexistent)` → finding with `reason: "undefined-token"`, exit code 1
  2. **Defined token passes**: CSS with `var(--ds-color-text-primary)` (exists in `TOKEN_NAME_SET`) → no finding
  3. **Packages-level scan**: CSS file in `packages/ui/src/sections/test/test.css` with undefined token → finding reported
  4. **Missing `packages/ui/src`**: workspace without `packages/ui/src` → warning logged, no error, app-level scan still runs
  5. **Existing raw color checks**: CSS with `#ff0000` and `rgba(...)` in app styles → findings with raw-hex/raw-rgba reasons
  6. **Return data shape**: result includes both `findings` count and `violations` array
- Mock `KernelRuntimeContext` with `workspaceRoot` and site paths
- Use temp directories for test CSS files

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test` — all tests pass

**Completion criterion:** All 6 test cases pass.

**Human review:** no

---

### Step 4. Validation suite

**Goal:** Run all validation checks to confirm the implementation is correct.

**Agent actions:**

- `pnpm exec site-kernel run rfc.validate --id RFC-0725 --json`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`

**Validation:**

- All three commands exit 0

**Completion criterion:** Zero errors across all three validation commands.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update `packages/os/site-kernel-checks/AGENTS.md` if the `tokens.ts` module description needs updating to reflect the new undefined token check
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (description changed — regenerate manifest)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` with inline `(evidence: ...)` annotations
- **Emit verification evidence:** run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0725` (RFC-0330). Note: this RFC has no acceptance probes, so the command may skip — that is expected and non-blocking.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0725 --implementation-commit <sha>` (use first implementation commit SHA)

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0725`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0725`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0725` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0725.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0725` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives from dynamic tokens | Step 1: regex extraction only catches literal `var(--ds-*)` — dynamic construction is an anti-pattern, documented in RFC Risks |
| `TOKEN_NAME_SET` drift (stale `token-names.generated.ts`) | Pre-existing risk — `@warpgogol/tokens` is a workspace dependency, built during `pnpm install`. No additional mitigation needed. |
| Performance (~50 files per scan) | Step 1: regex extraction is <100ms per scan. Duplicate findings across sites accepted (documented in RFC). |
| Return-type contract change | Step 1: `findings` count preserved alongside new `violations` array. Consumers reading only `data.findings` continue to work. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-10, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0725 --reason "..." --invariant "DNA-10"` instead of working around it.
- If `TOKEN_NAME_SET` import fails due to package resolution issues, investigate `@warpgogol/tokens` build state before proceeding — do not duplicate the token list.
