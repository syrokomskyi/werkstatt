---
rfcId: RFC-0836
planId: PLAN-RFC-0836-01
status: draft
owner: architecture
createdAt: 2026-08-13
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
  services: []
  docs:
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0836

## 1. Objectives

- [ ] Objective 1 — Create `a11y.label-in-name.component.validate` command that scans `.astro` files for aria-label/visible text mismatches (maps to acceptance criteria: command registered, scans all .astro files, detects violations, reports A11Y-LIN-COMP-01, exits 1 on violations)
- [ ] Objective 2 — Integrate into `PACKAGES_CHECK_PIPELINE` after `section.image-props.validate` (maps to acceptance criterion: integrated into pipeline)
- [ ] Objective 3 — Unit tests covering violation, safe pattern, icon-only, non-interactive, multi-line, resolveLabelInName helper (maps to acceptance criterion: unit tests)
- [ ] Objective 4 — Existing codebase passes (maps to acceptance criterion: existing codebase passes)
- [ ] Objective 5 — AGENTS.md updated with new check entry (maps to acceptance criterion: AGENTS.md updated)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts` — new validator source (regex-based .astro scanner)
- `packages/werkstatt-site/src/checks/command-tables/08-section-framework.ts` — add command entry after `section.image-props.validate` (line 116). Same file as the precedent — both are workspace-scoped component validators scanning `.astro` files in `domain/ui`.
- `packages/werkstatt-site/src/checks/pipelines/packages-check.ts` — add `{ command: "a11y.label-in-name.component.validate" }` after `section.image-props.validate` (line 109)
- `packages/werkstatt-site/src/checks/module.ts` — no changes needed (command table auto-registration via ALL_COMMANDS)

### 2.2 Configuration and data

No YAML/JSON/manifest changes. No content schema changes.

### 2.3 Documentation and specs

- `packages/werkstatt-site/AGENTS.md` — add `a11y.label-in-name.component.validate` entry to Check commands section
- No `docs/*.xml` Compass files need sync — no repository-wide semantics changed
- No `docs/architecture-dna.md` changes — DNA-67 already established by RFC-0833

### 2.4 Validation and pipelines

- `PACKAGES_CHECK_PIPELINE` — new step added after `section.image-props.validate`
- No CI workflow changes needed

## 3. Step sequence

### Step 1. Create validator source

**Goal:** Implement the regex-based `.astro` component scanner that detects aria-label/visible text mismatches.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts`
- Implement `extractComponentLabelInNameViolations(astroSource: string): ComponentLabelInNameFinding[]` pure function
- Implement `runA11yLabelInNameComponentValidate(input, context): Promise<KernelCommandResult<CheckResult>>` handler
- Detection logic:
  1. Parse `.astro` files using regex to find interactive elements (`<a>`, `<button>`, `<input>`, `<select>`, `<textarea>`, elements with `role="button"|"link"|"checkbox"|"radio"|"tab"|"menuitem"`)
  2. Extract `aria-label={...}` expression (if present)
  3. Extract visible text expressions within the element (`{label}`, `{props.xxxLabel}`, `{content.xxxLabel}`)
  4. If both present and aria-label expression does not contain the visible text variable name as a substring, emit A11Y-LIN-COMP-01. Substring match approach: extract the variable name from the visible text expression (e.g., `ctaPrimaryLabel` from `{props.ctaPrimaryLabel}`) and check if it appears anywhere in the aria-label expression. This covers `resolvedAriaLabel` (where the variable is derived), `resolveLabelInName(label, ariaLabel)` helper calls, and template literals like `${label} — ${ariaLabel}`.
  5. Safe pattern: if aria-label expression contains `resolveLabelInName` call or the visible text variable name, no violation
- Use `context.workspaceRoot` to resolve path to `packages/werkstatt-site/src/domain/ui/` (same pattern as `section-image-props.ts`)
- Use `collectFiles` from `@warpgogol/werkstatt-site/share/fs` to scan `packages/werkstatt-site/src/domain/ui/**/*.astro` (both `sections/` and `components/` subdirectories)
- Use `diagnosticsResult` from `./result-helpers.ts` for output
- Include MODULE_CONTRACT and CHANGE_SUMMARY scaffolding

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles

**Completion criterion:** Validator source compiles without errors; `extractComponentLabelInNameViolations` function exported and callable.

**Human review:** no

---

### Step 2. Register command in command table

**Goal:** Add `a11y.label-in-name.component.validate` to the command table so it's auto-registered via ALL_COMMANDS.

**Agent actions:**

- Edit `packages/werkstatt-site/src/checks/command-tables/08-section-framework.ts`
- Add new entry after `section.image-props.validate` (line 116):
  ```ts
  {
    name: "a11y.label-in-name.component.validate",
    description: "RFC-0836: scan .astro component source files for aria-label/visible text mismatches (WCAG 2.5.3 Label in Name). Checks interactive elements where aria-label={...} and visible text {...} are both present but aria-label doesn't reference the visible text variable.",
    scope: "workspace",
    flags: {},
    supportsAllSites: true,
    reads: ["packages/werkstatt-site/src/domain/ui/**/*.astro"],
    execute: runA11yLabelInNameComponentValidate,
  },
  ```
- Import `runA11yLabelInNameComponentValidate` from `../a11y-label-in-name-component.ts`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles with new import

**Completion criterion:** Command entry added; import resolves; TypeScript compiles.

**Human review:** no

---

### Step 3. Add to PACKAGES_CHECK_PIPELINE

**Goal:** Wire the command into the pipeline after `section.image-props.validate`.

**Agent actions:**

- Edit `packages/werkstatt-site/src/checks/pipelines/packages-check.ts`
- Add after `section.image-props.validate` (line 109):
  ```ts
  // RFC-0836: WCAG 2.5.3 Label in Name — component-level aria-label/visible text parity check.
  { command: "a11y.label-in-name.component.validate" },
  ```

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** Pipeline step added; TypeScript compiles.

**Human review:** no

---

### Step 4. Create unit tests

**Goal:** Comprehensive unit tests covering all detection patterns and edge cases.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/a11y-label-in-name-component.test.ts`
- Test cases:
  1. Violation: `aria-label={props.ctaAriaLabel}` + `{props.ctaLabel}` — A11Y-LIN-COMP-01 emitted
  2. Safe pattern (merged): `aria-label={resolvedAriaLabel}` + `{label}` where `resolvedAriaLabel` contains "label" — no violation
  3. Safe pattern (resolveLabelInName helper): `aria-label={resolveLabelInName(ariaLabel, label)}` + `{label}` — no violation
  4. Icon-only button: `aria-label={content.iconLabel}` + `<svg>...</svg>` — no violation (no visible text expression)
  5. Non-interactive element: `<div aria-label={...}>{label}</div>` — no violation
  6. Multi-line aria-label expression: aria-label spans multiple lines — detected
  7. No aria-label: element with visible text but no aria-label — no violation
  8. Multiple violations in one file
  9. Empty file — no violations, no crash
  10. Malformed .astro — no crash
- Test the pure function `extractComponentLabelInNameViolations` directly (same pattern as `a11y-label-in-name.test.ts`)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass

**Completion criterion:** All test cases pass; coverage matches acceptance criteria.

**Human review:** no

---

### Step 5. Update AGENTS.md and verify existing codebase

**Goal:** Document the new check and verify the existing codebase passes.

**Agent actions:**

- Edit `packages/werkstatt-site/AGENTS.md` — add entry to Check commands section after the `a11y.label-in-name.validate` (RFC-0832) entry:
  ```
  - `a11y.label-in-name.component.validate` (RFC-0836) — scans `.astro` component source files in `packages/werkstatt-site/src/domain/ui/**/*.astro` for interactive elements where `aria-label={...}` and visible text `{...}` are both present but the aria-label expression does not reference the visible text variable (WCAG 2.5.3 Label in Name). Emits A11Y-LIN-COMP-01 (error) for mismatches. Recognizes `resolveLabelInName` helper and merged-label patterns as safe. Integrated into `PACKAGES_CHECK_PIPELINE` after `section.image-props.validate`. Does NOT replace the post-build `a11y.label-in-name.validate` (RFC-0832) — both validators run.
  ```
- Run `pnpm exec werkstatt run a11y.label-in-name.component.validate` to verify existing codebase passes (after ADR-0047 fixes to section-cta.astro, hero-section.astro, brand-label-component.astro)
- If any existing components fail, fix them (they should already be fixed per ADR-0047)

**Validation:**

- `pnpm exec werkstatt run a11y.label-in-name.component.validate` — exits 0 (clean codebase)
- AGENTS.md updated

**Completion criterion:** AGENTS.md has new entry; validator passes on existing codebase.

**Human review:** no

---

### Step 6. Validation, evidence, review, fix, and stamp

**Goal:** Run all validation, emit evidence, review code, fix findings, and stamp RFC as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0836` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0836` — emit evidence file
- Commit evidence file
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command manifest changed
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm. Max 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against implemented code. Mark `[x]` with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0836 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from session
- `pnpm exec werkstatt run rfc.validate --id RFC-0836` — passes
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All validation passes; evidence file committed; code review passed; all acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0836`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run a11y.label-in-name.component.validate` — existing codebase passes
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0836` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0836.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0836` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives from regex-based parser | Step 1: check for visible text variable name anywhere in aria-label expression, not just exact equality; Step 4: test safe patterns explicitly |
| False positives from helper functions (resolveLabelInName) | Step 1: recognize `resolveLabelInName(...)` call as safe pattern; Step 4: test case for helper recognition |
| Agent misinterpretation (replaces post-build validator) | Step 5: AGENTS.md entry explicitly states "Does NOT replace the post-build a11y.label-in-name.validate (RFC-0832) — both validators run" |
| Maintenance burden for regex patterns | Step 1: patterns are stable (`aria-label={...}` + `{...}`); post-build validator remains final gate |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-67, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0836 --reason "..." --invariant "DNA-67"` instead of working around it.
- If the regex-based approach proves insufficient for complex .astro patterns, do not switch to an AST parser without a new RFC — the current design explicitly rejects AST-based parsing and this is a design decision, not an implementation detail.
