---
rfcId: RFC-0837
planId: PLAN-RFC-0837-01
status: draft
owner: architecture
createdAt: 2026-08-14
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
  services: []
  docs:
    - docs/architecture-dna.md
    - docs/styling.xml
    - docs/verification-plan.xml
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0837

## 1. Objectives

- [ ] Objective 1 — Create `css.mobile-layout.lint` validator that scans `.css` files and `.astro` inline `<style>` blocks for 6 mobile layout anti-patterns — maps to acceptance criterion [TypeScript types and interfaces defined] and [CLI command registered]
- [ ] Objective 2 — Register the command in `04-content-quality.ts` and wire into `SITES_CHECK_AUTHOR_PIPELINE` — maps to acceptance criterion [Integrated into `SITES_CHECK_AUTHOR_PIPELINE`]
- [ ] Objective 3 — Document the command in `packages/werkstatt-site/AGENTS.md` and `docs/styling.xml` — maps to acceptance criterion [AGENTS.md updated] and [verification-plan.xml updated]
- [ ] Objective 4 — Establish DNA-68 in `docs/architecture-dna.md` and verify `dna.registry.validate` passes — maps to acceptance criterion [DNA-68 entry appended]
- [ ] Objective 5 — Write unit tests covering all 6 rules, `@media` context suppression, warning vs error mode, and `.astro` `<style>` block extraction — maps to acceptance criterion [Existing sites pass without false positives]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/css-mobile-layout-lint.ts` — **new** validator implementation
- `packages/werkstatt-site/src/checks/index.ts` — add `export { runCssMobileLayoutLint }`
- `packages/werkstatt-site/src/checks/command-tables/04-content-quality.ts` — add command entry after `css.important.lint`
- `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts` — add `{ command: "css.mobile-layout.lint" }` after `css.important.lint`
- `packages/werkstatt-site/src/checks/tests/css-mobile-layout-lint.test.ts` — **new** test file

### 2.2 Configuration and data

None — no YAML/JSON/manifest changes required.

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — append `## DNA-68 · Mobile Layout CSS Best Practices` entry
- `docs/styling.xml` — add `<command id="v-css-mobile-layout">` entry to `<command-table>` section
- `docs/verification-plan.xml` — add `css.mobile-layout.lint` to the author pipeline check catalog
- `packages/werkstatt-site/AGENTS.md` — add `css.mobile-layout.lint` entry to Check commands section

### 2.4 Validation and pipelines

- `SITES_CHECK_AUTHOR_PIPELINE` — new step after `css.important.lint`
- `dna.registry.validate` — must pass after DNA-68 entry is added
- `rfc.validate --id RFC-0837` — must pass before stamping

## 3. Step sequence

### Step 1. Create the validator implementation

**Goal:** Implement `css.mobile-layout-lint.ts` with all 6 rules, `@media` context tracking, `.astro` `<style>` block extraction, and `--mode warning`/`--mode error` flag support.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/css-mobile-layout-lint.ts`
- Define `MobileLayoutViolation` and `MobileLayoutLintResult` interfaces per RFC TypeScript contracts
- Implement `collectCssAndAstroFiles(paths)` — collect `.css` files from `src/styles/` and `.astro` files from `src/pages/` (app scope); collect `.css` and `.astro` files from `packages/werkstatt-site/src/domain/ui/` (workspace scope)
- Implement `extractStyleBlocks(astroSource)` — extract content between `<style>...</style>` tags, preserving line offsets for accurate line/column reporting. Use the `<style(\s[^>]*)?\s*>` regex pattern from `semantic.ts:80` to find style block starts
- Implement `@media` context tracking — maintain a depth counter during line-by-line scanning: increment on `@media` openings, decrement on matching closing braces. Suppress MOBILE-CSS-01 violations when inside `@media (min-width: ...)` blocks (desktop-only context)
- Implement 6 rule detectors:
  - MOBILE-CSS-01: `height: 100vh` without `100dvh` in same rule (error)
  - MOBILE-CSS-02: `width: 100vw` with `padding` or `border` in same rule (error)
  - MOBILE-CSS-03: fixed `width: Npx` where N > 380 without `max-width: 100%` in same rule (error)
  - MOBILE-CSS-04: negative `margin` on `body`, `main`, `html`, or section wrapper selectors (error)
  - MOBILE-CSS-05: `position: fixed` with `width: Npx` where N > 430 (error)
  - MOBILE-CSS-06: `white-space: nowrap` without `overflow-wrap` or `word-break` in same rule (warning)
- Implement `--mode` flag parsing: `error` (default, exit 1 on violations) vs `warning` (exit 0, log via `context.logger.warn`)
- Use `collectFiles` from `@warpgogol/werkstatt-site/share/fs` and `getLineColumn` from `@warpgogol/werkstatt-site/share/text-position` — same imports as `css-important-lint.ts`
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding blocks
- Export `runCssMobileLayoutLint` as the kernel command handler

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles with no errors

**Completion criterion:** File exists, TypeScript compiles, all 6 rules implemented, `@media` context tracking works, `--mode` flag parsed.

**Human review:** no

---

### Step 2. Register the command and wire into pipeline

**Goal:** Register `css.mobile-layout.lint` in the command table and add it to `SITES_CHECK_AUTHOR_PIPELINE`.

**Agent actions:**

- Add `export { runCssMobileLayoutLint } from "./css-mobile-layout-lint.ts"` to `packages/werkstatt-site/src/checks/index.ts` (after the existing `css.important.lint` export, line ~145)
- Add import and command entry to `packages/werkstatt-site/src/checks/command-tables/04-content-quality.ts` after the `css.important.lint` entry (line ~243):

  ```ts
  {
    name: "css.mobile-layout.lint",
    description: "Lint CSS and Astro inline styles for mobile layout anti-patterns (100vh, 100vw, fixed widths, negative margins, fixed-position overflow, nowrap without overflow-wrap).",
    scope: "workspace",
    flags: { mode: { kind: "string", description: "error (default) or warning" } },
    supportsAllSites: true,
    reads: ["<app>/src/styles/**/*.css", "<app>/src/pages/**/*.astro", "packages/werkstatt-site/src/domain/ui/**/*.css", "packages/werkstatt-site/src/domain/ui/{sections,components}/**/*.astro"],
    modulePaths: ["css-mobile-layout-lint.ts"],
    execute: runCssMobileLayoutLint,
  },
  ```

  **Design decision (grilling):** Scope is `workspace` (not `app` as in the RFC). The command runs once for the entire workspace, scanning both workspace UI files and all apps' CSS/Astro files. The implementer must enumerate app directories from `context.workspaceRoot` to scan `<app>/src/styles/` and `<app>/src/pages/` for each site. This avoids redundant workspace UI file scans per app.

- Add `{ command: "css.mobile-layout.lint" }` to `SITES_CHECK_AUTHOR_PIPELINE` in `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts` after `css.important.lint` (line ~328)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- `pnpm exec werkstatt run command.manifest.generate` — command manifest includes the new command

**Completion criterion:** Command registered in table, pipeline updated, TypeScript compiles, command manifest generated.

**Human review:** no

---

### Step 3. Write unit tests

**Goal:** Create fixture-based tests covering all 6 rules, `@media` suppression, warning mode, `.astro` `<style>` extraction, and clean-pass scenarios.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/css-mobile-layout-lint.test.ts`
- Use `makeTestSiteContext` and `testInput` from `./helpers.ts` (same pattern as `css-important-lint.test.ts`)
- Test cases:
  1. Clean CSS passes (no violations) — exit 0
  2. MOBILE-CSS-01: `height: 100vh` without `100dvh` → violation
  3. MOBILE-CSS-01: `height: 100vh; height: 100dvh;` → no violation (fallback present)
  4. MOBILE-CSS-01: `100vh` inside `@media (min-width: 1024px)` → no violation (suppressed)
  5. MOBILE-CSS-02: `width: 100vw; padding: 16px;` → violation
  6. MOBILE-CSS-03: `width: 500px;` without `max-width: 100%` → violation
  7. MOBILE-CSS-03: `width: 500px; max-width: 100%;` → no violation
  8. MOBILE-CSS-04: `body { margin: -10px; }` → violation
  9. MOBILE-CSS-05: `position: fixed; width: 500px;` → violation
  10. MOBILE-CSS-06: `white-space: nowrap;` without `overflow-wrap` → warning (exit 0 in warning mode, exit 1 in error mode)
  11. `.astro` `<style>` block extraction — violation inside `<style>` block detected
  12. `--mode warning` flag → exit 0 even with violations
  13. Missing styles dir → exit 0, `files: 0`
- Add `MODULE_CONTRACT` Compass scaffolding to test file

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test -- --run css-mobile-layout-lint` — all tests pass

**Completion criterion:** All test cases pass, covering all 6 rules, `@media` suppression, warning/error mode, and `.astro` extraction.

**Human review:** no

---

### Step 4. Establish DNA-68 and update documentation

**Goal:** Add DNA-68 entry to `docs/architecture-dna.md`, update `docs/styling.xml` command table, and update `packages/werkstatt-site/AGENTS.md` Check commands section.

**Agent actions:**

- Append to `docs/architecture-dna.md` after DNA-67 (line 286):
  ```markdown
  ## DNA-68 · Mobile Layout CSS Best Practices

  CSS files and Astro inline `<style>` blocks must avoid mobile layout anti-patterns that cause horizontal overflow or layout shift: `height: 100vh` without `100dvh` fallback, `width: 100vw` with padding/border, fixed pixel widths exceeding mobile viewport without `max-width: 100%`, negative margins on root containers, `position: fixed` elements wider than viewport, and `white-space: nowrap` without `overflow-wrap`/`word-break`. Enforced by `css.mobile-layout.lint` in `SITES_CHECK_AUTHOR_PIPELINE`. Established by RFC-0837.
  ```
- Add `<command id="v-css-mobile-layout">` entry to `docs/styling.xml` `<command-table>` section (after the existing `v-tokens-colors` or at the end of the command-table block):
  ```xml
  <command id="v-css-mobile-layout">
    <name>css.mobile-layout.lint</name>
    <scope>app + packages</scope>
    <pipeline>SITES_CHECK_AUTHOR_PIPELINE</pipeline>
    <behaviour>Scans .css files and .astro inline &lt;style&gt; blocks for
      six mobile layout anti-patterns (MOBILE-CSS-01..06). Supports
      --mode warning (exit 0) for rollout and --mode error (exit 1,
      default) for enforcement. Tracks @media context to suppress
      desktop-only 100vh declarations.</behaviour>
  </command>
  ```
- Add to `packages/werkstatt-site/AGENTS.md` Check commands section (after the `css.important.lint`-related entry or at the end of the list):
  ```
  - `css.mobile-layout.lint` (RFC-0837) — scans .css files and .astro inline <style> blocks for six mobile layout anti-patterns: MOBILE-CSS-01 (100vh without 100dvh), MOBILE-CSS-02 (100vw with padding/border), MOBILE-CSS-03 (fixed width >380px without max-width: 100%), MOBILE-CSS-04 (negative margin on root containers), MOBILE-CSS-05 (position: fixed wider than 430px), MOBILE-CSS-06 (white-space: nowrap without overflow-wrap/word-break, warning). Supports --mode warning for initial rollout. Tracks @media context to suppress desktop-only 100vh. Integrated into SITES_CHECK_AUTHOR_PIPELINE after css.important.lint.
  ```

**Validation:**

- `pnpm exec werkstatt run dna.registry.validate --json` — DNA-68 entry and RFC-0837 `satisfies: [DNA-68]` are in sync
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles (AGENTS.md is not compiled, but verify no broken markdown)

**Completion criterion:** DNA-68 entry exists, `dna.registry.validate` passes, `docs/styling.xml` has the new command, `packages/werkstatt-site/AGENTS.md` has the new entry.

**Human review:** no

---

### Step 5. Run full validation suite and verify acceptance criteria

**Goal:** Run all validation commands, verify every acceptance criterion, and prepare for stamping.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0837 --json` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass (including new tests)
- Run `pnpm exec werkstatt run dna.registry.validate --json` — must pass
- Run `pnpm exec werkstatt run command.manifest.generate` — regenerate if command surfaces changed
- Verify each acceptance criterion in the RFC:
  - [x] TypeScript types and interfaces defined in `css-mobile-layout-lint.ts`
  - [x] CLI command registered with name `css.mobile-layout.lint` and scope `app` in `04-content-quality.ts`
  - [x] `--json` output format documented and stable
  - [x] Integrated into `SITES_CHECK_AUTHOR_PIPELINE` after `css.important.lint`
  - [x] Existing sites pass without changes in warning mode (validator runs in warning mode during initial rollout)
  - [x] `packages/werkstatt-site/AGENTS.md` Check commands section updated
  - [x] `docs/styling.xml` updated with new command table entry
  - [x] `docs/verification-plan.xml` updated with new check catalog entry
  - [x] DNA-68 entry appended to `docs/architecture-dna.md`
  - [x] `rfc.validate` passes on this file

**Validation:**

- All commands above pass with exit code 0

**Completion criterion:** All validation commands pass, all acceptance criteria checked off with evidence.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`:
  - `docs/architecture-dna.md` — DNA-68 entry added
  - `docs/styling.xml` — command table entry added
  - `packages/werkstatt-site/AGENTS.md` — Check commands entry added
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (the new command was added to the pipeline — regenerate the manifest)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0837 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0837`
- Every file in `scope.docs` is either updated or documented as not-applicable
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0837`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run dna.registry.validate --json`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0837` (RFC-0330, for probe-bearing RFCs created on or after 2026-07-07)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0837.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0837` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives from `100vh` in desktop-only `@media` blocks | Step 1: `@media` context tracking with depth counter suppresses MOBILE-CSS-01 inside `@media (min-width: ...)` |
| False positives from `white-space: nowrap` in legitimate non-text contexts | Step 1: MOBILE-CSS-06 is warning severity only; Step 3: test case verifies warning mode exits 0 |
| Performance: scanning many CSS files | Step 1: uses regex-based scanning (no AST), same pattern as `css.important.lint` which runs in <100ms |
| `.astro` `<style>` block extraction accuracy | Step 1: uses `<style(\s[^>]*)?\s*>` regex pattern from existing `semantic.ts:80`; Step 3: test case verifies extraction works |
| Concurrent execution | Step 1: validator is read-only (scans files, never writes) — no mitigation needed |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0837 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `@media` context tracking proves insufficient for complex nested media queries (e.g., `@media (min-width: 1024px) and (max-width: 1200px)`), escalate to a CSS AST parser instead of regex — but only if test cases demonstrate the regex approach produces false positives.
- The warning → error mode transition is currently a manual operator decision. A follow-up RFC or ADR should define an automatic trigger (e.g., violation count tracking across pipeline runs with a threshold for mode promotion). This is out of scope for this plan.
