---
rfcId: RFC-0882
planId: PLAN-RFC-0882-01
status: draft
owner: architecture
createdAt: 2026-08-19
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
  services: []
  docs: []
---

# Implementation Plan: RFC-0882

## 1. Objectives

- [ ] O1 — Extend `extractVisibleTextExprs` to recognize Record-lookup expressions — maps to acceptance criterion "extractVisibleTextExprs is extended to recognize Record-lookup expressions"
- [ ] O2 — Add `splitFallback`, `parseRecordLookup`, `isRecordLookupMismatch` functions — maps to acceptance criteria "parseRecordLookup function extracts Record name and key expression", "splitFallback function extracts the primary expression before ??", "isRecordLookupMismatch function returns true when aria-label and visible text use different Record identifiers"
- [ ] O3 — Integrate `isRecordLookupMismatch` into `extractComponentLabelInNameViolations` — maps to acceptance criterion "a11y.label-in-name.component.validate emits A11Y-LIN-COMP-01 for Record-lookup mismatches"
- [ ] O4 — Update MODULE_CONTRACT and command-tables description — maps to acceptance criteria "MODULE_CONTRACT purpose and CHANGE_SUMMARY updated", "Command description in command-tables/08-section-framework.ts updated"
- [ ] O5 — Add unit tests for Record-lookup patterns — maps to acceptance criterion "Unit tests cover: different Record identifiers → violation, same Record identifier → safe, naming convention → safe, resolveLabelInName → safe, non-Record-lookup expressions → existing behavior unchanged, fallback expressions → primary expression checked"
- [ ] O6 — Verify safe patterns are not flagged — maps to acceptance criterion "Safe patterns (resolveLabelInName, naming convention, same Record identifier) are not flagged"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts` — validator source: add `splitFallback`, `parseRecordLookup`, `isRecordLookupMismatch`; extend `extractVisibleTextExprs`; integrate into `extractComponentLabelInNameViolations`; update MODULE_CONTRACT purpose and CHANGE_SUMMARY
- `packages/werkstatt-site/src/checks/tests/a11y-label-in-name-component.test.ts` — unit tests: new test cases for Record-lookup patterns
- `packages/werkstatt-site/src/checks/command-tables/08-section-framework.ts` — command description: update to mention Record-lookup detection (line 122)

### 2.2 Configuration and data

No configuration or data files affected. The validator scans `.astro` source files — no schema, manifest, or YAML changes.

### 2.3 Documentation and specs

- RFC file: `docs/rfcs/rfc-0882-enhance-a11y-lin-comp-01-to-detect-record-lookup-aria-label-mismatches.md` (read-only reference)
- No AGENTS.md updates needed — the check command is already documented in `packages/werkstatt-site/AGENTS.md` § Check commands. The description there mentions "Recognizes resolveLabelInName helper and merged-label patterns as safe" — after implementation, update the AGENTS.md description to also mention Record-lookup detection.
- No `docs/*.xml` Compass files need synchronization — no repository-wide semantics change.
- No `docs/architecture-dna.md` update — DNA-67 is already established, this RFC extends an existing validator.

### 2.4 Validation and pipelines

- `PACKAGES_CHECK_PIPELINE` (`packages/werkstatt-site/src/checks/pipelines/packages-check.ts:111`) — no pipeline change needed, `a11y.label-in-name.component.validate` is already registered.
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compilation.
- `pnpm --filter @warpgogol/werkstatt-site run test` — Vitest unit tests.
- `pnpm exec werkstatt run rfc.validate --id RFC-0882` — RFC mechanical validation.

## 3. Step sequence

### Step 1. Extend `extractVisibleTextExprs` to recognize Record-lookup expressions

**Goal:** The current `extractVisibleTextExprs` regex only matches simple variable references (`props.xxx`, `content.xxx`, `variableName`). Record-lookup expressions like `providerInitials[props.provider.id] ?? props.provider.name.slice(0, 2).toUpperCase()` are not matched, causing the validator to skip elements with Record-lookup visible text entirely. This step extends the function to also recognize Record-lookup expressions.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts`, modify `extractVisibleTextExprs` (line 120–132): after the existing simple-variable regex check, add a second regex test for Record-lookup patterns: `/^(\w+)\s*(?:\?\.\s*)?\[.+\]\s*(?:\?\?.*)?$/`. If the expression matches, push it to `exprs`. Use `continue` after the first regex match to avoid double-pushing.
- Update the MODULE_CONTRACT `<purpose>` block (lines 3–10) to mention Record-lookup detection: add "RFC-0882: extended to detect Record-lookup aria-label mismatches where aria-label and visible text use different Record identifiers."
- Update the MODULE_CONTRACT `<CHANGE_SUMMARY>` block (lines 19–21) to add: `<item>RFC-0882: extended extractVisibleTextExprs to recognize Record-lookup expressions; added splitFallback, parseRecordLookup, isRecordLookupMismatch for Record-lookup mismatch detection.</item>`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles without errors.

**Completion criterion:** `extractVisibleTextExprs` returns Record-lookup expressions in addition to simple variable references. TypeScript compiles.

**Human review:** no

---

### Step 2. Add `splitFallback`, `parseRecordLookup`, `isRecordLookupMismatch` functions

**Goal:** Add the three new internal functions that implement the Record-lookup mismatch detection logic.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts`, add the `RecordLookup` interface:
  ```ts
  interface RecordLookup {
    recordName: string;
    keyExpr: string;
  }
  ```
- Add `splitFallback` function:
  ```ts
  function splitFallback(expr: string): string {
    const idx = expr.indexOf("??");
    return idx !== -1 ? expr.substring(0, idx).trim() : expr.trim();
  }
  ```
- Add `parseRecordLookup` function:
  ```ts
  function parseRecordLookup(expr: string): RecordLookup | null {
    const match = expr.match(/^(\w+)\s*(?:\?\.\s*)?\[(.+)\]$/);
    if (!match) return null;
    return { recordName: match[1], keyExpr: match[2] };
  }
  ```
- Add `isRecordLookupMismatch` function:
  ```ts
  function isRecordLookupMismatch(
    ariaLabelExpr: string,
    visibleTextExpr: string,
  ): boolean {
    const ariaLookup = parseRecordLookup(splitFallback(ariaLabelExpr));
    const textLookup = parseRecordLookup(splitFallback(visibleTextExpr));
    if (!ariaLookup || !textLookup) return false;
    if (ariaLookup.recordName === textLookup.recordName) return false;
    return true;
  }
  ```
- Place these functions after `getVariableName` (line 137) and before `extractComponentLabelInNameViolations` (line 139).

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles without errors.

**Completion criterion:** Three new functions are defined and TypeScript compiles. Functions are not yet called from `extractComponentLabelInNameViolations`.

**Human review:** no

---

### Step 3. Integrate `isRecordLookupMismatch` into `extractComponentLabelInNameViolations`

**Goal:** Wire the Record-lookup mismatch check into the main violation extraction loop, as an additional check after the existing variable-name-reference check.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/a11y-label-in-name-component.ts`, modify the inner loop in `extractComponentLabelInNameViolations` (lines 176–189). The integration uses OR logic with a Record-lookup exemption to avoid false positives from `getVariableName` on same-Record expressions with different fallbacks:
  ```ts
  for (const visibleTextExpr of visibleTextExprs) {
    const varName = getVariableName(visibleTextExpr);
    const varNameReferenced = ariaLabelExpr.toLowerCase().includes(varName.toLowerCase());
    const recordLookupMismatch = isRecordLookupMismatch(ariaLabelExpr, visibleTextExpr);

    // Record-lookup exemption: if both expressions are Record-lookups with the
    // same Record identifier, skip the variable-name check — getVariableName
    // produces nonsensical values for Record-lookup expressions and may flag
    // same-Record patterns with different fallbacks (false positive).
    const ariaLookup = parseRecordLookup(splitFallback(ariaLabelExpr));
    const textLookup = parseRecordLookup(splitFallback(visibleTextExpr));
    const sameRecordLookup =
      ariaLookup !== null &&
      textLookup !== null &&
      ariaLookup.recordName === textLookup.recordName;

    if (sameRecordLookup) continue;

    if (!varNameReferenced || recordLookupMismatch) {
      findings.push({
        rule: RULE_ID,
        line: i + 1,
        element: tagName,
        ariaLabelExpr: `{${ariaLabelExpr}}`,
        visibleTextExpr: `{${visibleTextExpr}}`,
        message: MESSAGE,
        fixHint: FIX_HINT,
      });
    }
  }
  ```
  **Rationale:** `getVariableName` splits by `.` and takes the last segment. For Record-lookup expressions like `labels[id] ?? other`, it returns the full string (no dots to split), and the aria-label `labels[id] ?? fallback` does NOT contain `labels[id] ?? other` — the variable-name check would flag this as a violation even though both use the same Record. The exemption skips the variable-name check when both expressions are Record-lookups with the same Record identifier, relying solely on `isRecordLookupMismatch` (which returns `false` for same-Record). For different-Record expressions, `isRecordLookupMismatch` returns `true` and the finding is pushed. For non-Record-lookup expressions, the exemption does not apply and the existing variable-name check runs as before.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles without errors.

**Completion criterion:** `extractComponentLabelInNameViolations` calls `isRecordLookupMismatch` and pushes a finding when either the existing variable-name check or the Record-lookup check triggers. TypeScript compiles.

**Human review:** no

---

### Step 4. Update command-tables description

**Goal:** Update the command description in `command-tables/08-section-framework.ts` to mention Record-lookup detection, keeping it accurate for agent-facing discovery.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/command-tables/08-section-framework.ts` (line 122), update the `description` field to append: "RFC-0882: extended to detect Record-lookup aria-label mismatches where aria-label and visible text use different Record identifiers (e.g. `recordA[key]` vs `recordB[key]`)."

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles without errors.

**Completion criterion:** Command description mentions Record-lookup detection. TypeScript compiles.

**Human review:** no

---

### Step 5. Add unit tests for Record-lookup patterns

**Goal:** Add test cases covering Record-lookup violation patterns, safe patterns, and fallback expressions.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/tests/a11y-label-in-name-component.test.ts`, add the following test cases in the `extractComponentLabelInNameViolations (pure function)` describe block:
  1. **red: Record-lookup mismatch with different Record identifiers** — `aria-label={providerLabels[props.provider.id] ?? props.provider.name}` with visible text `{providerInitials[props.provider.id] ?? props.provider.name.slice(0, 2).toUpperCase()}` → 1 finding, `A11Y-LIN-COMP-01`.
  2. **green: same Record identifier is safe** — `aria-label={labels[id]}` with visible text `{labels[id]}` → 0 findings (same Record, just different rendering).
  3. **green: naming convention for precomputed labels** — `aria-label={providerBadgeTextAriaLabel}` with visible text `{providerBadgeText}` → 0 findings (variable name contains visible text variable name).
  4. **green: Record-lookup with fallback where primary is same Record (exemption)** — `aria-label={labels[id] ?? fallback}` with visible text `{labels[id] ?? other}` → 0 findings (same Record identifier after splitFallback, exemption skips variable-name check that would otherwise false-positive on different fallbacks).
  5. **red: Record-lookup mismatch with fallback** — `aria-label={providerLabels[id] ?? fallback}` with visible text `{providerInitials[id] ?? other}` → 1 finding (different Record identifiers after splitFallback).
  6. **green: non-Record-lookup expression with fallback does not trigger Record-lookup check** — `aria-label={someLabel ?? fallback}` with visible text `{otherLabel}` → existing behavior (variable-name check applies, Record-lookup check skipped).
  7. **green: resolveLabelInName with Record-lookup visible text** — `aria-label={resolveLabelInName(ariaLabel, providerInitials[id])}` with visible text `{providerInitials[id]}` → 0 findings (resolveLabelInName recognized as safe).

- Update the MODULE_CONTRACT `<CHANGE_SUMMARY>` in the test file to add: `<item>RFC-0882: added test cases for Record-lookup mismatch detection.</item>`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass.

**Completion criterion:** All new test cases pass. Existing tests still pass (no regressions).

**Human review:** no

---

### Step 6. Update `packages/werkstatt-site/AGENTS.md` check command description

**Goal:** Update the AGENTS.md check command description to mention Record-lookup detection, keeping agent-facing documentation accurate.

**Agent actions:**

- In `packages/werkstatt-site/AGENTS.md`, find the `a11y.label-in-name.component.validate` entry in the Check commands section. Update the description to append: "RFC-0882: extended to detect Record-lookup aria-label mismatches where aria-label and visible text use different Record identifiers."

**Validation:**

- Visual inspection — the AGENTS.md description matches the implemented behavior.

**Completion criterion:** AGENTS.md check command description mentions Record-lookup detection.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.packages` is updated — check each path against `git diff`.
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compilation.
- Run `pnpm --filter @warpgogol/werkstatt-site run test` — all unit tests pass.
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0882` — RFC mechanical validation.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0882 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476). The command validates all preconditions (status, criteria, clean tree, commit reachability). Do NOT hand-edit `status`, `implementedAt`, or `closedAt` fields — use the command.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0882`
- Every file in `scope.packages` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0882`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0882` (if acceptance probes declared)
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0882` (RFC-0330, for probe-bearing RFCs created on or after 2026-07-07)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0882.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0882` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positive rate — check fires when both expressions are Record-lookups with different Record identifiers | Step 5 test case 2 verifies same Record identifier is safe; Step 5 test case 4 verifies fallback with same Record is safe |
| Fallback expression complexity — expressions with complex fallbacks may not parse cleanly | Step 2 `splitFallback` extracts primary expression; Step 5 test cases 4 and 5 verify fallback handling |
| Maintenance burden — Record-lookup parser is a single regex and comparison function | Step 5 test suite covers all patterns; functions are internal and well-tested |
| Performance — validator scans ~47 .astro files, Record-lookup regex adds negligible overhead | Step 3 integration is O(1) per visible text expression; no measurable pipeline impact |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-67, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0882 --reason "..." --invariant "DNA-67"` instead of working around it.
- If the Record-lookup regex produces false positives on patterns not covered by the test suite, add a new test case documenting the pattern and adjust the regex — do not weaken the existing variable-name-reference check.
