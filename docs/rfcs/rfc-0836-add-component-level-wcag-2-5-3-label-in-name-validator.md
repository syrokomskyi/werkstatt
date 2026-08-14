---
id: RFC-0836
title: "Add component-level WCAG 2.5.3 Label in Name validator"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-13
updatedAt: 2026-08-13
enhancedAt: 2026-08-13
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0832
  - ADR-0047
  - DNA-67
satisfies:
  - DNA-67
versionBump: patch
commands:
  proposed: []
  added:
    - a11y.label-in-name.component.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/werkstatt-site
successSignals:
  - "Component-level aria-label violations caught at authoring time, before build"
  - "Zero A11Y-LIN-01 surprises during mission.validate build.post"
nonGoals:
  - "Do not replace the post-build a11y.label-in-name.validate (RFC-0832) — it remains the final gate"
  - "Do not validate CSS or non-interactive elements"
  - "Do not validate server-only (.ts) files — only .astro component source"
---

# RFC-0836: Add component-level WCAG 2.5.3 Label in Name validator

## Context

RFC-0832 introduced `a11y.label-in-name.validate`, a post-build validator that scans rendered HTML in `dist/client/` for interactive elements (`<a>`, `<button>`, `<input>`, `<select>`, `<textarea>`, elements with interactive ARIA roles) where `aria-label` does not include the visible text. This check runs in `SITES_CHECK_POSTBUILD_PIPELINE` — after the Astro build has completed.

The problem: this check only fires **after a full build**, which takes ~60 seconds. When multiple components have the same pattern (e.g., `aria-label={ariaLabel}` without merging the visible `label` text), the validator reports them all at once, but the fix requires editing component source files and rebuilding. During mission `warpgogol-com-m000054` close, this caused two cascading cycles:

1. First cycle: `overflowMenuAriaLabel` in `labels.md` didn't include visible text "Mehr" / "Більше" — fixed in content.
2. Second cycle: `section-cta.astro` and `hero-section.astro` had `aria-label={ariaLabel}` without merging the visible `label` — fixed in components.

The root cause is that Astro components use a pattern where `ariaLabel` and `label` are separate props, and there is no build-time check that verifies the component merges them correctly. The post-build validator catches the rendered output, but by then the component is already shipped.

Three components were affected (fixed in ADR-0047):

1. `section-cta.astro` — `aria-label={ariaLabel}` with `<span>{label}</span>`
2. `hero-section.astro` — `aria-label={props.ctaPrimaryAriaLabel}` with `{props.ctaPrimaryLabel}`
3. `brand-label-component.astro` — `aria-label={content.brandAriaLabel}` with `<span>{content.brandLabel}</span>` (latent — passed by content coincidence)

## Problem

**Unprotected invariant**: WCAG 2.5.3 Label in Name is enforced only at the post-build stage (rendered HTML). Component source code can introduce violations that are not caught until `mission.validate` runs the full build pipeline, wasting ~60 seconds per cycle.

**What relies on manual discipline**: Component authors must remember to merge visible label text into `aria-label` when both are present. The `section-cta.astro` component had `aria-label={ariaLabel}` and `<span>{label}</span>` as siblings — a human-readable label and an aria-label that didn't include it. This pattern was repeated in `hero-section.astro` with `aria-label={props.ctaPrimaryAriaLabel}` and `{props.ctaPrimaryLabel}`.

**Known failure mode**: Mission `warpgogol-com-m000054` required two cascading fix cycles to resolve all A11Y-LIN-01 violations, each costing a full validate run (~2 minutes). A component-level check would have caught both at authoring time.

## Decision

The kernel gains an `a11y.label-in-name.component.validate` command that scans `.astro` component source files in `packages/werkstatt-site/src/domain/ui/` for patterns where `aria-label={...}` and visible text (`{label}`, `{props.xxxLabel}`, etc.) are both present on the same interactive element but the aria-label expression does not reference the label variable.

## Architectural fit

- **Architecture DNA (DNA-67)**: Satisfies DNA-67 by adding an early static analysis for the same Lighthouse audit (`label-content-name-mismatch`) already covered by `a11y.label-in-name.validate` (RFC-0832) in the coverage matrix (`docs/lighthouse-parity-matrix.yaml`). This RFC does not add a new entry to the coverage matrix — it adds a pre-build component-level check that catches the same WCAG 2.5.3 violation at authoring time, before the build runs. The post-build `a11y.label-in-name.validate` (RFC-0832) remains the final gate on rendered output.
- **Component Contracts**: Formalizes that interactive components with separate `ariaLabel` and `label` props must merge them — the accessible name must include the visible text.
- **Pipeline placement**: Workspace-scoped command registered in `PACKAGES_CHECK_PIPELINE` (not `SITES_CHECK_AUTHOR_PIPELINE`). This follows the precedent of `section.image-props.validate` — a workspace-scoped component validator that scans the same `packages/werkstatt-site/src/domain/ui/**/*.astro` files in `PACKAGES_CHECK_PIPELINE`. The command scans shared package components, not per-site content.

## Design

### CLI surface

```sh
pnpm exec werkstatt run a11y.label-in-name.component.validate
```

Scope: workspace. Scans `packages/werkstatt-site/src/domain/ui/**/*.astro` (components and sections). No `--site` flag — the command scans shared package components, not per-site content.

### TypeScript contracts

```ts
interface ComponentLabelInNameFinding {
  rule: "A11Y-LIN-COMP-01";
  file: string;
  line: number;
  element: string; // e.g. "a", "button"
  ariaLabelExpr: string; // e.g. "{props.ctaPrimaryAriaLabel}"
  visibleTextExpr: string; // e.g. "{props.ctaPrimaryLabel}"
  severity: "error";
  message: string;
  fixHint: string;
}

interface ComponentLabelInNameResult {
  command: "a11y.label-in-name.component.validate";
  status: "pass" | "fail";
  findings: ComponentLabelInNameFinding[];
  checkedFiles: number;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/domain/ui/**/*.astro` | Scanned for violations |
| `packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts` | New validator source |
| `packages/werkstatt-site/src/checks/tests/a11y-label-in-name-component.test.ts` | Unit tests |

### Detection logic

The validator parses `.astro` files using a regex-based approach (not a full AST parser — `.astro` is not standard TS/JS). For each interactive element (`<a>`, `<button>`, `<input>`, `<select>`, `<textarea>`, elements with `role="button"|"link"|"checkbox"|"radio"|"tab"|"menuitem"`):

1. Extract the `aria-label={...}` expression (if present).
2. Extract visible text expressions within the element (children like `{label}`, `{props.xxxLabel}`, `{content.xxxLabel}`).
3. If both are present and the aria-label expression does not reference the same variable as the visible text, emit A11Y-LIN-COMP-01.

**Safe pattern recognition for `resolveLabelInName` helper (ADR-0047):** If the aria-label expression contains a call to `resolveLabelInName(...)` or any expression that references the visible text variable name (e.g., `resolvedAriaLabel` where `resolvedAriaLabel` is derived from `label`), the element is considered safe — no violation. The validator checks for the visible text variable name appearing anywhere in the aria-label expression, not just exact equality. This recognizes the canonical merge pattern from ADR-0047: `resolvedAriaLabel = ariaLabel && label && !ariaLabel.includes(label) ? \`${label} — ${ariaLabel}\` : ariaLabel`.

**Safe pattern (no violation):**

```astro
<a aria-label={resolvedAriaLabel}>
  <span>{label}</span>
</a>
```

Where `resolvedAriaLabel` is derived from `label` (e.g., `${label} — ${ariaLabel}`).

**Violation pattern:**

```astro
<a aria-label={props.ctaPrimaryAriaLabel}>
  {props.ctaPrimaryLabel}
</a>
```

The aria-label expression (`props.ctaPrimaryAriaLabel`) does not reference the visible text variable (`props.ctaPrimaryLabel`).

**Exception — icon-only buttons (no visible text):**

```astro
<button aria-label={content.copyButtonLabel}>
  <svg>...</svg>
</button>
```

No visible text expression → no violation. The aria-label is the sole accessible name.

### Output format

```json
{
  "command": "a11y.label-in-name.component.validate",
  "status": "fail",
  "findings": [
    {
      "rule": "A11Y-LIN-COMP-01",
      "file": "packages/werkstatt-site/src/domain/ui/sections/hero/hero-section.astro",
      "line": 194,
      "element": "a",
      "ariaLabelExpr": "{props.ctaPrimaryAriaLabel}",
      "visibleTextExpr": "{props.ctaPrimaryLabel}",
      "severity": "error",
      "message": "aria-label expression does not reference the visible text variable — accessible name may not include visible text (WCAG 2.5.3)",
      "fixHint": "Merge the label into the aria-label: `aria-label={props.ctaPrimaryLabel + ' — ' + props.ctaPrimaryAriaLabel}` or use a resolveLabelInName helper"
    }
  ],
  "checkedFiles": 47
}
```

### Failure modes

- Violations exit with code 1 and log errors.
- Files that cannot be read or parsed are skipped (no crash).
- The validator is regex-based, not AST-based — it may miss complex expressions (e.g., ternary operators, template literals spanning multiple lines). This is acceptable: the post-build `a11y.label-in-name.validate` (RFC-0832) remains the final gate on rendered HTML and catches anything the component-level check misses.
- False positives are possible when the aria-label expression indirectly references the label variable (e.g., through a helper function). The validator should check for the label variable name appearing anywhere in the aria-label expression, not just exact equality.

## Rollout

- **Default behavior**: Error from day one. This is a static analysis check — there is no "grace period" needed because it runs at authoring time, not at build time. Components that violate the check must be fixed before they are committed.
- **Pipeline integration**: Added to `PACKAGES_CHECK_PIPELINE` after `section.image-props.validate` (both are workspace-scoped component validators scanning `packages/werkstatt-site/src/domain/ui/**/*.astro`).
- **Existing codebase**: All components in `packages/werkstatt-site/src/domain/ui/` must pass. The component fixes already applied in platform 5.51.6 (`section-cta.astro`, `hero-section.astro`) and ADR-0047 (`brand-label-component.astro`) ensure the current codebase is clean.
- **New components**: Automatically compliant — the check runs in `PACKAGES_CHECK_PIPELINE` for all changes to shared UI components.

## Alternatives considered

- **AST-based parser for .astro files**: Rejected — `.astro` is not a standard language with a production-grade parser available as an npm package. A regex-based approach is sufficient for the common patterns (`aria-label={...}` + visible text) and the post-build validator remains the final gate.
- **Extending the post-build validator only**: Rejected — the post-build validator catches violations after a ~60s build cycle. The component-level check catches them at authoring time, saving build cycles.
- **Extending `section.image-props.validate`**: Rejected — that validator checks image prop usage (`src={props.xxx}` without `resolveImage`), a different rule type. Mixing aria-label/text parity checks into it would violate single-responsibility and complicate the rule set. A dedicated validator is cleaner.
- **Lint rule in eslint**: Rejected — `.astro` files are not linted by eslint in this codebase. Adding eslint support for `.astro` would be a larger effort than a dedicated validator.

## Risks

- **False positives**: The regex-based parser may flag patterns where the aria-label indirectly includes the label (e.g., through a helper function). Mitigation: check for the label variable name appearing anywhere in the aria-label expression, not just exact equality. If false positives persist, a per-file opt-out via comment (e.g., `<!-- a11y-lin-ignore -->`) can be added.
- **Maintenance burden**: The regex patterns must be updated when new component patterns are introduced. This is low — the patterns are stable (`aria-label={...}` + `{...}` visible text).
- **Agent misinterpretation**: Agents may think this check replaces the post-build validator. It does not — both run. The AGENTS.md entry must be explicit about this.

## Acceptance criteria

- [x] `a11y.label-in-name.component.validate` command registered in command table (evidence: packages/werkstatt-site/src/checks/command-tables/08-section-framework.ts:119-128)
- [x] Scans all `.astro` files in `packages/werkstatt-site/src/domain/ui/**/*.astro` (evidence: packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts:113-120, collectFiles on uiDir)
- [x] Detects `aria-label={...}` + visible text `{...}` on same interactive element where aria-label doesn't reference the visible text variable (evidence: packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts:155-196, extractComponentLabelInNameViolations)
- [x] Reports A11Y-LIN-COMP-01 with file, line, element, expressions, and fix hint (evidence: packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts:186-195, Diagnostic with ruleId/severity/file/line/data)
- [x] Exits with code 1 on violations, 0 on clean (evidence: packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts:198-204, diagnosticsResult returns exitCode 1 when errors > 0)
- [x] Integrated into `PACKAGES_CHECK_PIPELINE` after `section.image-props.validate` (evidence: packages/werkstatt-site/src/checks/pipelines/packages-check.ts:110-111)
- [x] Unit tests in `a11y-label-in-name-component.test.ts` covering: violation, safe pattern (merged label), icon-only button (no violation), non-interactive element (no violation), multi-line aria-label expression (evidence: packages/werkstatt-site/src/checks/tests/a11y-label-in-name-component.test.ts, 16 tests pass)
- [x] Existing codebase passes (after the 5.51.6 fixes to `section-cta.astro`, `hero-section.astro`, and ADR-0047 fix to `brand-label-component.astro`) (evidence: `pnpm exec werkstatt run a11y.label-in-name.component.validate` exits 0)
- [x] `AGENTS.md` updated with the new check in the check commands list (evidence: packages/werkstatt-site/AGENTS.md:78)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0836 --json` status: pass)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0836` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0836 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The validator MUST NOT replace the post-build `a11y.label-in-name.validate` (RFC-0832). Both validators run — the component-level check is a fast pre-build static analysis, the post-build check is the final gate on rendered HTML.
