---
rfcId: RFC-0832
planId: PLAN-RFC-0832-01
status: draft
owner: architecture
createdAt: 2026-08-13
updatedAt:
scope:
  apps: []
  packages:
    - werkstatt-site
  services: []
  docs:
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0832

## 1. Objectives

- [ ] Objective 1 — Create `a11y.label-in-name.validate` validator module that scans all rendered HTML in `dist/client/` for interactive elements with `aria-label` and checks that the accessible name includes the visible text — maps to acceptance criterion "command registered" + "A11Y-LIN-01 rule implemented"
- [ ] Objective 2 — Register the command in the build-artifacts command table with scope `app` — maps to acceptance criterion "command registered in command table with scope app"
- [ ] Objective 3 — Integrate into `SITES_CHECK_POSTBUILD_PIPELINE` after `surface.heading-uniqueness.validate` — maps to acceptance criterion "integrated into SITES_CHECK_POSTBUILD_PIPELINE"
- [ ] Objective 4 — Write unit tests covering passing, failing, and edge cases (nav landmark false-positive guard, icon-only, aria-hidden, non-interactive elements) — maps to acceptance criterion "Unit tests with fixture HTML"
- [ ] Objective 5 — Update `packages/werkstatt-site/AGENTS.md` Check commands section — maps to acceptance criterion "AGENTS.md updated"
- [ ] Objective 6 — Verify `--json` output format matches the RFC contract — maps to acceptance criterion "--json output format documented and stable"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/a11y-label-in-name.ts` — **new** validator module (following `surface-heading-uniqueness.ts` pattern: parse5, `collectFiles`, `diagnosticsResult`)
- `packages/werkstatt-site/src/checks/command-tables/09b-build-artifacts-part2.ts` — add `a11y.label-in-name.validate` entry to `BUILD_ARTIFACT_COMMANDS_PART2` (or appropriate table)
- `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts` — add `{ command: "a11y.label-in-name.validate" }` after `surface.heading-uniqueness.validate`
- `packages/werkstatt-site/src/checks/tests/a11y-label-in-name.test.ts` — **new** unit test file

### 2.2 Configuration and data

None. No YAML manifests, no ontology catalogs, no biome files.

### 2.3 Documentation and specs

- `packages/werkstatt-site/AGENTS.md` — add `a11y.label-in-name.validate` entry to "Check commands" section
- RFC file `docs/rfcs/rfc-0832-*.md` — read-only reference, not modified during implementation

### 2.4 Validation and pipelines

- `SITES_CHECK_POSTBUILD_PIPELINE` in `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts` — new step after `surface.heading-uniqueness.validate`
- No CI workflow changes needed (pipeline runs automatically)

## 3. Step sequence

### Step 1. Create validator module

**Goal:** Implement the `a11y.label-in-name.validate` command handler.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/a11y-label-in-name.ts`
- Follow the `surface-heading-uniqueness.ts` pattern: imports from `parse5`, `@warpgogol/werkstatt/kernel`, `@warpgogol/werkstatt-site/share/fs`, `result-helpers.ts`
- Export `extractLabelInNameViolations(html: string): LabelInNameViolation[]` pure function for testability
- Export `runA11yLabelInNameValidate(input, context): Promise<KernelCommandResult<CheckResult>>` handler
- Define `INTERACTIVE_TAGS` set: `a`, `button`, `input`, `select`, `textarea`
- Define `INTERACTIVE_ROLES` set: `button`, `link`, `checkbox`, `radio`, `tab`, `menuitem`, `option`, `switch`, `textbox`
- Implement `isInteractiveElement(node)`: checks tag name or `role` attribute
- Implement `collectTextContent(node)`: recursively concatenate text nodes (reuse pattern from `surface-heading-uniqueness.ts`)
- Implement `normalizeWhitespace(text)`: trim + collapse internal whitespace + lowercase
- Implement `hasAriaHidden(node)`: check `aria-hidden="true"` attribute
- Implement `isHiddenInput(node)`: check `type="hidden"` on `<input>`
- Handler logic:
  1. Check `context.site` exists (error if not)
  2. Check `dist/client/` exists (skip with pass if not)
  3. Collect all `.html` files in `dist/client/` via `collectFiles`
  4. For each HTML file: parse with `parse5.parse()` (wrap in try/catch per ADR-0018 finding), find all interactive elements with `aria-label`, check visible text inclusion
  5. Return `diagnosticsResult("a11y.label-in-name.validate", diagnostics)`
- Rule ID: `A11Y-LIN-01`, severity: `error`
- `fixHint`: "Include visible text in aria-label (e.g. 'Situation beschreiben — Anfrage senden') OR remove aria-label and let visible text be the accessible name"
- Wrap `parse()` in try/catch returning empty diagnostics on parse failure (per memory: parse5 can throw on malformed HTML)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles

**Completion criterion:** File exists, TypeScript compiles, `extractLabelInNameViolations` is exported as a pure function.

**Human review:** no

---

### Step 2. Register command in command table

**Goal:** Register `a11y.label-in-name.validate` in the data-driven command table.

**Agent actions:**

- Open `packages/werkstatt-site/src/checks/command-tables/09b-build-artifacts-part2.ts`
- Add import for `runA11yLabelInNameValidate` from `../a11y-label-in-name.ts`
- Add entry to the `BUILD_ARTIFACT_COMMANDS_PART2` array (or the exported array in that file):
  ```ts
  {
    name: "a11y.label-in-name.validate",
    description:
      "RFC-0832: scan rendered HTML in dist/client/ for interactive elements with aria-label and check that the accessible name includes the visible text (WCAG 2.5.3 Label in Name). Checks <a>, <button>, <input>, <select>, <textarea> and elements with interactive ARIA roles. Skips landmark elements like <nav aria-label>.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html"],
    modulePaths: ["a11y-label-in-name.ts"],
    execute: runA11yLabelInNameValidate,
  },
  ```
- Place after the `surface.heading-uniqueness.validate` entry for logical grouping

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- `pnpm exec werkstatt run command.manifest.generate` — command appears in manifest (optional, if available)

**Completion criterion:** Command entry exists in the table, TypeScript compiles, `ALL_COMMANDS` includes the new command.

**Human review:** no

---

### Step 3. Add to SITES_CHECK_POSTBUILD_PIPELINE

**Goal:** Wire the validator into the post-build pipeline.

**Agent actions:**

- Open `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts`
- Add `{ command: "a11y.label-in-name.validate" }` after `{ command: "surface.heading-uniqueness.validate" }` (line 75)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles

**Completion criterion:** Pipeline array includes the new step after `surface.heading-uniqueness.validate`.

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Comprehensive unit tests for the validator.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/a11y-label-in-name.test.ts`
- Follow the `surface-heading-uniqueness.test.ts` pattern: `describe` blocks for pure function and handler, `makeContext`, `makeInput`, `extractDiagnostics` helpers
- Test cases for `extractLabelInNameViolations` (pure function):
  1. Matching aria-label contains visible text — no violation
  2. aria-label does not contain visible text — A11Y-LIN-01 violation
  3. Icon-only button (no text content) — skipped, no violation
  4. `<nav aria-label="Main navigation">` with link text — skipped (non-interactive element), no violation
  5. `<a aria-label="Click here">Contact us</a>` — violation (visible text "contact us" not in "click here")
  6. `<a aria-label="Contact us — send message">Contact us</a>` — no violation (visible text contained)
  7. `<button aria-hidden="true" aria-label="Hidden">Close</button>` — skipped (aria-hidden)
  8. `<input type="hidden" aria-label="Token">` — skipped (hidden input)
  9. `<div role="button" aria-label="Open menu">Open menu</div>` — no violation (interactive role, text matches)
  10. `<div role="button" aria-label="Expand">Open</div>` — violation (interactive role, text mismatch)
  11. `<span aria-label="Label">Text</span>` — skipped (non-interactive, no role)
  12. Case-insensitive matching: `<a aria-label="CONTACT US">Contact us</a>` — no violation
  13. Whitespace normalization: `<a aria-label="Contact  Us">Contact us</a>` — no violation
  14. Empty HTML — no violations
  15. Malformed HTML — no crash (try/catch returns empty)
- Test cases for `runA11yLabelInNameValidate` (handler):
  1. No app context — exitCode 1
  2. No dist/client — pass with exitCode 0
  3. HTML with violation — exitCode 1, A11Y-LIN-01 diagnostic
  4. HTML with no violations — exitCode 0
  5. Nav landmark false-positive guard — `<nav aria-label="Main">` with mismatched link text → no violation (nav is not interactive)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test -- --reporter=verbose a11y-label-in-name` — all tests pass

**Completion criterion:** All test cases pass, covering matching, mismatching, icon-only, aria-hidden, hidden input, non-interactive elements, interactive roles, case-insensitivity, whitespace normalization, empty HTML, malformed HTML, and nav landmark guard.

**Human review:** no

---

### Step 5. Update AGENTS.md

**Goal:** Document the new command in `packages/werkstatt-site/AGENTS.md`.

**Agent actions:**

- Open `packages/werkstatt-site/AGENTS.md`
- Add to the "Check commands" section (after the last entry):
  ```
  - `a11y.label-in-name.validate` (RFC-0832) — scans rendered HTML in dist/client/ for interactive elements with aria-label and checks that the accessible name includes the visible text (WCAG 2.5.3 Label in Name). Checks <a>, <button>, <input>, <select>, <textarea> and elements with interactive ARIA roles. Emits A11Y-LIN-01 (error) for mismatches. Integrated into SITES_CHECK_POSTBUILD_PIPELINE after surface.heading-uniqueness.validate.
  ```

**Validation:**

- File updated, no broken markdown

**Completion criterion:** `packages/werkstatt-site/AGENTS.md` Check commands section includes the `a11y.label-in-name.validate` entry.

**Human review:** no

---

### Step 6. Run validation suite

**Goal:** Verify all acceptance criteria pass.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0832 --json` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — must pass (TypeScript strict)
- Run `pnpm --filter @warpgogol/werkstatt-site run test -- a11y-label-in-name` — all tests pass
- Verify `--json` output shape matches RFC contract: `{ command, status, diagnostics, checkedElements }`

**Validation:**

- All three commands exit 0

**Completion criterion:** `rfc.validate` passes, `build:check` passes, all unit tests pass, `--json` output shape matches RFC.

**Human review:** no

---

### Step 7. Run code review and fix

**Goal:** Automated code review and fix cycle.

**Agent actions:**

- Invoke `fo-review` via the `skill` tool on all session code changes
- If findings reported, invoke `fo-fix` via the `skill` tool
- Re-run `fo-review` to confirm all findings resolved (max 3 iterations)

**Validation:**

- Review report exists in `docs/reviews/code/` for this session
- All findings resolved (if any)

**Completion criterion:** Code review passed, findings fixed if any.

**Human review:** no

---

### Final Step. Documentation sync, acceptance criteria verification, and stamp

**Goal:** Verify all acceptance criteria and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/werkstatt-site/AGENTS.md` is updated (Step 5)
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (optional, if available)
- Check off acceptance criteria in the RFC with inline `(evidence: <file:line>)` annotations
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0832` and commit evidence file
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0832 --implementation-commit <sha>` to transition `accepted → implemented`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0832` — passes
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All acceptance criteria checked off with evidence annotations; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0832`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test -- a11y-label-in-name`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0832` (RFC-0330, for probe-bearing RFCs created on or after 2026-07-07)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0832.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0832` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives from landmark elements | Step 1: restrict to interactive elements only (per operator decision during enhance) |
| False positives from icon-only elements | Step 1: skip elements with empty visible text |
| False positives from dynamic text | Step 1: Astro SSG produces final HTML at build time — static scan is accurate |
| Agent confusion (removing aria-label) | Step 1: fixHint suggests both options (include text OR remove aria-label) |
| Performance | Step 1: simple DOM traversal, ~20-40 HTML pages, <1s per site |
| Malformed HTML crash | Step 1: wrap parse5.parse() in try/catch (per ADR-0018 pattern) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0832 --reason "..." --invariant "DNA-N"` instead of working around it.
