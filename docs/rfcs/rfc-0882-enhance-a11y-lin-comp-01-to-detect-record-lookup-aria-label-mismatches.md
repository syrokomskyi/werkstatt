---
id: RFC-0882
title: "Enhance A11Y-LIN-COMP-01 to detect Record-lookup aria-label mismatches"
status: accepted
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-19
updatedAt: 2026-08-19
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
enhancedAt: 2026-08-19
amendedBy: []
related:
  - RFC-0832
  - RFC-0836
  - ADR-0047
satisfies:
  - DNA-67
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - a11y.label-in-name.component.validate
appsImpacted: []
packagesImpacted:
  - packages/werkstatt-site
successSignals:
  - "A11Y-LIN-COMP-01 catches Record-lookup aria-label mismatches at authoring time, before build"
  - "Zero A11Y-LIN-01 surprises during mission.validate for Record-lookup patterns"
nonGoals:
  - "Do not replace the post-build a11y.label-in-name.validate (RFC-0832) — it remains the final gate"
  - "Do not add a full AST parser for .astro files — the regex-based approach is extended, not replaced"
  - "Do not validate runtime values — static analysis only"
---

# RFC-0882: Enhance A11Y-LIN-COMP-01 to detect Record-lookup aria-label mismatches

## Context

RFC-0836 introduced `a11y.label-in-name.component.validate`, a workspace-scoped validator that scans `.astro` component source files for patterns where `aria-label={...}` and visible text `{...}` are both present on the same interactive element but the aria-label expression does not reference the visible text variable. This catches patterns like `aria-label={props.ctaPrimaryAriaLabel}` with visible text `{props.ctaPrimaryLabel}`.

However, the validator's detection logic only recognizes **direct variable references** — it checks if the visible text variable name appears in the aria-label expression. It does not recognize **Record-lookup patterns** where the aria-label and visible text are derived from different keys of the same or different Record objects.

During mission `warpgogol-com-m000077`, the `nachweis-card-component.astro` had:

```astro
<a aria-label={providerLabels[props.provider.id] ?? props.provider.name}>
  {providerInitials[props.provider.id] ?? props.provider.name.slice(0, 2).toUpperCase()}
</a>
```

The aria-label expression (`providerLabels[props.provider.id]`) and the visible text expression (`providerInitials[props.provider.id]`) reference different Record objects (`providerLabels` vs `providerInitials`) with the same key (`props.provider.id`). The validator did not flag this because neither expression contains the other's variable name. The post-build `a11y.label-in-name.validate` (RFC-0832) caught it as `A11Y-LIN-01` — but only after a full ~4 minute build cycle.

## Problem

**Unprotected invariant**: The component-level validator (RFC-0836) does not detect Record-lookup aria-label mismatches — where `aria-label={recordA[key]}` and visible text `{recordB[key]}` use different Record objects with the same or different keys. The post-build validator catches this, but only after a full build.

**What relies on manual discipline**: Component authors must recognize that `aria-label={providerLabels[id]}` and `{providerInitials[id]}` are semantically unrelated expressions even though they share a lookup key. The validator's current heuristic (checking if the visible text variable name appears in the aria-label expression) does not catch this.

**Known failure mode**: Mission `warpgogol-com-m000077` required one extra ~4 minute validate cycle to catch the `A11Y-LIN-01` violation in `nachweis-card-component.astro` that the component-level validator should have caught at authoring time.

## Decision

The `a11y.label-in-name.component.validate` detection logic is enhanced to recognize Record-lookup patterns. When `aria-label={recordA[key]}` and visible text `{recordB[key]}` are both present and `recordA` and `recordB` are different identifiers, the validator emits `A11Y-LIN-COMP-01`.

## Architectural fit

- **RFC-0836 (extended)**: Extends the detection logic of the existing validator. The command name, pipeline placement, and output format remain unchanged. This RFC does not amend RFC-0836 — it is a standalone RFC that changes the existing command's detection logic.
- **RFC-0832 (related)**: The post-build validator remains the final gate. This RFC adds a pre-build check for a pattern that the post-build validator already catches.
- **ADR-0047 (related)**: ADR-0047 established the `resolveLabelInName` helper pattern. Components that use `resolveLabelInName` are recognized as safe via the existing variable-name-reference heuristic. Components that precompute a merged label must name the aria-label variable to contain the visible text variable name (e.g. `providerBadgeTextAriaLabel` for visible text `{providerBadgeText}`) — the validator does not parse frontmatter and cannot detect template literal definitions.
- **DNA-67 (satisfied)**: Extends the pre-deploy Lighthouse parity gate by catching the `label-content-name-mismatch` audit at authoring time for an additional pattern.

## Design

### Detection logic enhancement

The current validator checks: "does the visible text variable name appear in the aria-label expression?" This RFC adds a second check: "are the aria-label and visible text both Record-lookup expressions with different Record identifiers?"

```ts
interface RecordLookup {
  recordName: string;  // e.g. "providerLabels", "providerInitials"
  keyExpr: string;     // e.g. "props.provider.id"
}

function parseRecordLookup(expr: string): RecordLookup | null {
  // Matches: recordName[keyExpr] or recordName?.[keyExpr]
  const match = expr.match(/^(\w+)\s*(?:\?\.\s*)?\[(.+)\]$/);
  if (!match) return null;
  return { recordName: match[1], keyExpr: match[2] };
}

function isRecordLookupMismatch(
  ariaLabelExpr: string,
  visibleTextExpr: string,
): boolean {
  const ariaLookup = parseRecordLookup(splitFallback(ariaLabelExpr));
  const textLookup = parseRecordLookup(splitFallback(visibleTextExpr));
  if (!ariaLookup || !textLookup) return false;
  // Same Record identifier → safe (same lookup, just different rendering)
  if (ariaLookup.recordName === textLookup.recordName) return false;
  // Different Record identifiers → potential mismatch
  return true;
}
```

### Fallback expression splitting

Record-lookup expressions often have fallbacks (e.g. `providerLabels[id] ?? props.provider.name`). The `parseRecordLookup` regex does not match expressions with `??` suffixes. A `splitFallback` helper extracts the primary expression before `??`:

```ts
function splitFallback(expr: string): string {
  const idx = expr.indexOf("??");
  return idx !== -1 ? expr.substring(0, idx).trim() : expr.trim();
}
```

`isRecordLookupMismatch` calls `splitFallback` on both expressions before `parseRecordLookup`. If the primary expression is not a Record-lookup, the check is skipped (no false positive).

### Visible text expression extraction

The current `extractVisibleTextExprs` function uses regex `/^(props\.\w+|content\.\w+|[a-zA-Z_]\w*)$/` which only matches simple variable references. Record-lookup expressions like `providerInitials[props.provider.id] ?? props.provider.name.slice(0, 2).toUpperCase()` are NOT matched — meaning `visibleTextExprs` would be empty and the element would be skipped entirely (line 174: `if (visibleTextExprs.length === 0) continue;`). Without extending this regex, `isRecordLookupMismatch` is never called.

The regex is extended to also match Record-lookup expressions:

```ts
function extractVisibleTextExprs(content: string): string[] {
  const textOnly = content.replace(/<[^>]*>/g, "");
  const exprs: string[] = [];
  const regex = /\{([^}]+)\}/g;
  let match;
  while ((match = regex.exec(textOnly)) !== null) {
    const expr = match[1].trim();
    // Simple variable reference: props.xxx, content.xxx, variableName
    if (/^(props\.\w+|content\.\w+|[a-zA-Z_]\w*)$/.test(expr)) {
      exprs.push(expr);
      continue;
    }
    // Record-lookup: recordName[keyExpr] or recordName[keyExpr] ?? fallback
    if (/^(\w+)\s*(?:\?\.\s*)?\[.+\]\s*(?:\?\?.*)?$/.test(expr)) {
      exprs.push(expr);
    }
  }
  return exprs;
}
```

### Safe pattern recognition

The existing safe patterns from RFC-0836 remain:

1. **`resolveLabelInName` helper**: `aria-label={resolveLabelInName(ariaLabel, label)}` → safe.
2. **Variable name reference**: `aria-label={mergedLabel}` where `mergedLabel` contains `label` as a substring → safe (existing heuristic, case-insensitive).
3. **Naming convention for precomputed labels**: `aria-label={providerBadgeTextAriaLabel}` with visible text `{providerBadgeText}` → safe, because `providerBadgeTextAriaLabel` contains `providerBadgeText` as a substring (case-insensitive). The validator does not parse frontmatter — it relies on the aria-label variable name containing the visible text variable name. Component authors must follow this naming convention when precomputing merged labels.

### Violation pattern (detected after this RFC)

```astro
<a aria-label={providerLabels[props.provider.id] ?? props.provider.name}>
  {providerInitials[props.provider.id] ?? props.provider.name.slice(0, 2).toUpperCase()}
</a>
```

The aria-label uses `providerLabels` and the visible text uses `providerInitials` — different Record identifiers → `A11Y-LIN-COMP-01`.

### Safe pattern (after fix)

```astro
const providerLabel = providerLabels[props.provider.id] ?? props.provider.name;
const providerBadgeText = providerInitials[props.provider.id] ?? props.provider.name.slice(0, 2).toUpperCase();
const providerBadgeTextAriaLabel = `${providerBadgeText} — ${providerLabel}`;
---
<a aria-label={providerBadgeTextAriaLabel}>
  {providerBadgeText}
</a>
```

The aria-label variable (`providerBadgeTextAriaLabel`) contains the visible text variable name (`providerBadgeText`) as a substring → safe via the existing variable-name-reference heuristic.

### CLI surface

```sh
pnpm exec werkstatt run a11y.label-in-name.component.validate
```

Scope: workspace. Scans `packages/werkstatt-site/src/domain/ui/**/*.astro`. No `--site` flag — the command scans shared package components, not per-site content. No flags changed from RFC-0836.

### TypeScript contracts

The existing `ComponentLabelInNameFinding` interface is unchanged. New internal functions:

```ts
interface RecordLookup {
  recordName: string;
  keyExpr: string;
}

function splitFallback(expr: string): string;
function parseRecordLookup(expr: string): RecordLookup | null;
function isRecordLookupMismatch(ariaLabelExpr: string, visibleTextExpr: string): boolean;
```

The `extractVisibleTextExprs` function is extended to recognize Record-lookup expressions (see Visible text expression extraction above). The `extractComponentLabelInNameViolations` function calls `isRecordLookupMismatch` as an additional check after the existing variable-name-reference check.

### Output format

No change from RFC-0836. The command returns `KernelCommandResult<CheckResult>` via `diagnosticsResult`. Diagnostics use `ruleId: "A11Y-LIN-COMP-01"`, `severity: "error"`, and the same `message`/`fixHint` constants. The `data` field includes `element`, `ariaLabelExpr`, and `visibleTextExpr`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts` | Validator source — enhanced detection logic, extended `extractVisibleTextExprs`, `splitFallback`, `parseRecordLookup`, `isRecordLookupMismatch` |
| `packages/werkstatt-site/src/checks/tests/a11y-label-in-name-component.test.ts` | Unit tests — new test cases for Record-lookup patterns |
| `packages/werkstatt-site/src/checks/command-tables/08-section-framework.ts` | Command description — updated to mention Record-lookup detection |
| `packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts` MODULE_CONTRACT | Purpose and CHANGE_SUMMARY — updated to mention Record-lookup detection |

### Failure modes

- **A11Y-LIN-COMP-01**: Record-lookup mismatch detected → error, same severity and output format as existing findings.
- **Parse failure**: If the expression cannot be parsed as a Record-lookup, the check is skipped (no false positive). The existing variable-name-reference check still runs.

## Rollout

- **Default behavior**: The enhanced detection is active from implementation. No opt-in flag.
- **Existing components**: Components that use `resolveLabelInName` or follow the naming convention (aria-label variable name contains visible text variable name) are already safe. Components with Record-lookup mismatches will be flagged — they must be fixed (the fix pattern is straightforward: precompute a merged label with a name that contains the visible text variable name).
- **Pipeline integration**: No pipeline changes — `a11y.label-in-name.component.validate` already runs in `PACKAGES_CHECK_PIPELINE`.

## Alternatives considered

- **Full AST parser for .astro**: Rejected — `.astro` is not standard TS/JS and no production-grade AST parser exists. The regex-based approach is sufficient for the common patterns and has zero dependencies.
- **Only check same-key Record lookups**: Rejected — even different-key lookups (e.g. `labels[id]` vs `initials[id]`) can produce mismatches. Checking different Record identifiers regardless of key is more robust.
- **Post-build only**: Rejected — the goal is to catch violations at authoring time, before the ~4 minute build cycle.

## Risks

- **False positive rate**: Low — the check only fires when both expressions are Record-lookups with different Record identifiers. Components that use the same Record for both (rare but valid) are not flagged.
- **Fallback expression complexity**: Expressions with complex fallbacks (e.g. `a ?? b ?? c`) may not parse cleanly. The parser extracts the primary expression and skips the check if parsing fails — no false positive.
- **Maintenance burden**: Moderate — the Record-lookup parser is a single regex and a comparison function. The existing test suite is extended with new cases.
- **Performance**: The validator scans ~47 `.astro` files in `packages/werkstatt-site/src/domain/ui/`. The Record-lookup regex adds negligible overhead — one additional regex test per visible text expression. No measurable impact on `PACKAGES_CHECK_PIPELINE` runtime.

## Acceptance criteria

- [x] `parseRecordLookup` function extracts Record name and key expression from `recordName[keyExpr]` patterns (evidence: packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts:158-162)
- [x] `splitFallback` function extracts the primary expression before `??` (evidence: packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts:153-156)
- [x] `isRecordLookupMismatch` function returns `true` when aria-label and visible text use different Record identifiers (evidence: packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts:164-173)
- [x] `extractVisibleTextExprs` is extended to recognize Record-lookup expressions (`recordName[keyExpr]` and `recordName[keyExpr] ?? fallback`) (evidence: packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts:135-138)
- [x] `a11y.label-in-name.component.validate` emits `A11Y-LIN-COMP-01` for Record-lookup mismatches (evidence: packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts:212-240, tests/a11y-label-in-name-component.test.ts:191-200)
- [x] Safe patterns (resolveLabelInName, naming convention, same Record identifier) are not flagged (evidence: tests/a11y-label-in-name-component.test.ts:202-210,212-220,222-230,254-262)
- [x] Unit tests cover: different Record identifiers → violation, same Record identifier → safe, naming convention → safe, resolveLabelInName → safe, non-Record-lookup expressions → existing behavior unchanged, fallback expressions → primary expression checked (evidence: tests/a11y-label-in-name-component.test.ts:189-262 — 7 new test cases, all 23 tests pass)
- [x] MODULE_CONTRACT purpose and CHANGE_SUMMARY in `a11y-label-in-name-component.ts` are updated to mention Record-lookup detection (evidence: packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts:10-11,23)
- [x] Command description in `command-tables/08-section-framework.ts` is updated to mention Record-lookup detection (evidence: packages/werkstatt-site/src/checks/command-tables/08-section-framework.ts:122)
- [x] `rfc.validate` passes on this file (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0882 --json` — zero errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The fix pattern for flagged components is to precompute a merged label with a variable name that contains the visible text variable name: `const visibleTextAriaLabel = \`${visibleText} — ${recordLabel}\``where`visibleTextAriaLabel`contains`visibleText` as a substring.
- Agents MUST NOT weaken the existing variable-name-reference check — the Record-lookup check is additive.
