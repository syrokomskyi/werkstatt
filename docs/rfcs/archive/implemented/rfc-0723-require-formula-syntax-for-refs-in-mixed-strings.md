---
id: RFC-0723
title: "Require =(ref) formula syntax for content references in mixed strings"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-06
updatedAt: 2026-08-06
enhancedAt: 2026-08-06
implementedAt: 2026-08-06
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0529
amendedBy:
  - RFC-0765
related:
  - RFC-0527
  - RFC-0570
satisfies:
  - DNA-4
  - DNA-24
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - content.references.validate
    - content.formula.migrate
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/share"
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/site-kernel-codegen"
successSignals:
  - "Zero REF-04 warnings on warpgogol-com after content migration"
  - "=(ref) syntax used in all mixed-string content references"
  - "content.formula.migrate converts bare braceless refs in mixed strings to =(ref) syntax"
nonGoals:
  - "Do not change pure-ref behavior — bare braceless refs on their own line remain valid"
  - "Do not reintroduce brace-delimited {ref} syntax"
  - "Do not add locale-aware formatting for =(ref) string values — the raw field value is returned as-is"
---

# RFC-0723: Require =(ref) formula syntax for content references in mixed strings

## Context

RFC-0529 removed brace-delimited `{collection.file.field}` syntax and made braceless `collection.file.field` the only accepted reference syntax. RFC-0570 added `=(...)` formula expressions for numeric arithmetic over content references.

The `content.references.validate` validator (REF-04) currently emits **315 advisory warnings** on `warpgogol-com` because bare braceless references inside mixed strings (e.g. `"Ab business-profile.offerings/digital-foundation.presentation.price.monthly"`) are ambiguous — they could be literal text or references. The validator cannot distinguish them, and neither can AI agents reliably.

At runtime, `resolveReferencesInString` resolves these patterns correctly. But the ambiguity creates:

- Noisy validation output that hides real issues
- Agent confusion about whether a pattern is a reference or literal
- Inconsistent content authoring patterns across sites

## Problem

There is no explicit, unambiguous syntax for embedding a content reference inside a mixed string. Bare braceless refs work at runtime but are visually indistinguishable from literal text. The validator warns but does not enforce. AI agents author content without knowing the rule.

## Decision

The `=(ref)` formula syntax is the **only valid way** to embed a content reference inside a mixed string. Bare braceless references in mixed strings are prohibited (REF-04 promoted from warning to error).

`resolveFormula` is extended to support string values when the expression is a single reference (no arithmetic operators): `=(business-profile.contact/general-email.value)` returns the string value directly, not just numeric values.

### Examples

**Prohibited (REF-04 error):**

```yaml
value: "Ab business-profile.offerings/digital-foundation.presentation.price.monthly"
```

**Required:**

```yaml
value: "Ab =(business-profile.offerings/digital-foundation.presentation.price.monthly)"
```

**Pure refs (unchanged, still valid):**

```yaml
value: business-profile.offerings/digital-foundation.presentation.price.monthly
```

## Architectural fit

- **RFC-0529**: Extends braceless-only syntax by adding `=(...)` as the explicit marker for refs in mixed strings.
- **RFC-0570**: Extends formula evaluation to support string-valued single-reference expressions.
- **Content discipline**: Aligns with the existing pattern that pure refs must be the only content on their line.

## Design

### CLI surface

```sh
# Validator — now promotes REF-04 to error for known collections
pnpm exec werkstatt run content.references.validate --app warpgogol-com

# Migrator — converts bare braceless refs in mixed strings to =(ref) syntax
pnpm exec werkstatt run content.formula.migrate --app warpgogol-com
```

Both commands are app-scoped (`--app <id>`), matching the existing scope convention. `content.references.validate` runs in the `sites-check-author` pipeline. `content.formula.migrate` is a manual write command (not in any pipeline).

### Formula evaluation extension

`resolveFormula` in `packages/share/src/formula-eval.ts` returns the string value when:

1. The expression contains exactly one reference
2. The expression (trimmed) equals the reference string (no arithmetic operators)
3. The resolved value is not numeric

For numeric values, the existing behavior is unchanged (returns the number as a string).

### TypeScript contracts

```ts
// @warpgogol/share/formula-eval.ts — extended resolveFormula
// Already implemented: single-ref string return path
interface FormulaResolution {
  value: string;
  resolved: boolean;
  error?: string; // REF-06..09
}

// resolveFormula now returns string values for single-ref expressions:
// =(business-profile.contact/general-email.value) → "hallo@warpgogol.com"
// instead of REF-07 error for non-numeric values.

// @warpgogol/site-kernel-checks/src/content-references.ts — extended validator
// Already implemented: isInsideFormula check skips REF-04 for refs inside =(...)
// New: REF-04 promoted from warning to error for known collections
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/formula-eval.ts` | Extended `resolveFormula` — single-ref string return path (already implemented) |
| `packages/os/site-kernel-checks/src/content-references.ts` | Extended validator — `isInsideFormula` check (already implemented), REF-04 promotion (new) |
| `packages/os/site-kernel-codegen/src/content-formula-migrate.ts` | Extended migrator — detect bare braceless refs in mixed strings, wrap with `=(...)` (new) |
| `AGENTS.md` (root) | New rule: `=(ref)` required for refs in mixed strings (new) |
| `packages/share/AGENTS.md` | Updated formula-eval entry with RFC-0723 string-value extension (new) |
| `src/content/pages/{lang}/*.md` | Migrated by `content.formula.migrate` |
| `src/content/prose/{lang}/*.md` | Migrated by `content.formula.migrate` |

### Output format

`content.references.validate` (extended with promoted REF-04):

```json
{
  "command": "content.references.validate",
  "status": "fail",
  "violations": [
    {
      "file": "src/content/pages/de/digitales-fundament.md",
      "line": 269,
      "rule": "REF-04",
      "message": "ambiguous braceless pattern business-profile.offerings/digital-foundation.presentation.price.monthly in mixed string; use =(ref) syntax"
    }
  ]
}
```

`content.formula.migrate` (extended with mixed-string ref conversion):

```json
{
  "command": "content.formula.migrate",
  "status": "pass",
  "conversions": [
    {
      "file": "src/content/pages/de/digitales-fundament.md",
      "line": 269,
      "before": "Ab business-profile.offerings/digital-foundation.presentation.price.monthly",
      "after": "Ab =(business-profile.offerings/digital-foundation.presentation.price.monthly)"
    }
  ]
}
```

### Validator change

`content.references.validate` in `packages/os/site-kernel-checks/src/content-references.ts` promotes REF-04 from `severity: "warning"` to `severity: "error"` when the pattern matches a known collection in the content ref index. Patterns that don't match any known collection remain warnings (they are likely literal text).

### AGENTS.md rule

The following rule is added to root `AGENTS.md` and all site-level `AGENTS.md` files:

> **Content references in mixed strings MUST use `=(ref)` formula syntax.** A bare braceless reference (e.g. `business-profile.offerings/digital-foundation.presentation.price.monthly`) inside a mixed string (e.g. `"Ab business-profile.offerings/..."`) is prohibited. Use `=(business-profile.offerings/...)` to explicitly mark it as a reference. Pure refs (the entire field value is just the reference) remain valid without `=(...)`. This rule is non-negotiable for all AI agents.

### Failure modes

**Build-time (`content.references.validate`):**

- REF-04 (promoted): **error** — build fails with non-zero exit when a bare braceless ref matching a known collection appears in a mixed string. Patterns not matching any known collection remain warnings (likely literal text).
- REF-04 (inside formula): skipped — `isInsideFormula` check prevents false positives for refs already wrapped in `=(...)`.

**Runtime (SSR/SSG, `resolveReferencesInString`):**

- `=(ref)` with non-numeric value: returns the string value directly. No error.
- `=(ref)` with unresolved ref: renders empty string (REF-06). Never leaks `=(...)` syntax to the page.
- Bare braceless ref in mixed string: still resolves at runtime (backward-compatible). The validator catches it at build time.

**Migration (`content.formula.migrate`):**

- Idempotent: re-running on already-migrated files is a no-op. `scanFormulas` detects existing `=(...)` spans and skips them.
- False positives: the migrator only converts patterns matching known collections in the content ref index. Unknown patterns are left untouched.

## Consequences

- Positive: Eliminates 315 REF-04 warnings on warpgogol-com.
- Positive: Unambiguous content authoring — agents and validators can always distinguish refs from literals.
- Positive: `=(ref)` works for both numeric and string values.
- Negative: Content migration required — all existing bare braceless refs in mixed strings must be converted.
- Technical debt: None — the extension is backward-compatible (existing `=(...)` formulas still work).

## Migration

All 315 instances across 22 files in `warpgogol-com` are converted from bare braceless to `=(ref)` syntax. The conversion is mechanical: find `collection.file.field` patterns inside mixed strings that match a known collection in the content ref index, wrap with `=(...)`.

`content.formula.migrate` in `packages/os/site-kernel-codegen/src/content-formula-migrate.ts` is extended to detect bare braceless refs in mixed strings (not just hardcoded arithmetic patterns). The extension adds a second scan pass: after the existing `HARDCODED_FORMULA_PATTERN` pass, a new pass scans for `BRACELESS_PATTERN` matches that are not pure refs and not already inside `=(...)` formulas, wrapping them with `=(...)`.

No grace period — forward-only discipline. The migration and the validator promotion happen in the same RFC wave.

## Rollout

- **Formula resolver (`@warpgogol/share`):** Already implemented — `resolveFormula` returns string values for single-ref expressions. Non-breaking extension.
- **Validator `isInsideFormula` check:** Already implemented — skips REF-04 for refs inside `=(...)`.
- **Validator REF-04 promotion (warning → error):** New — promoted REF-04 fires as error for known collections. Existing content without bare refs in mixed strings passes unchanged.
- **Migrator extension:** New — `content.formula.migrate` extended with mixed-string ref conversion pass. Operator runs it once on `warpgogol-com` to convert 315 instances.
- **AGENTS.md rule:** New — root `AGENTS.md` and `packages/share/AGENTS.md` updated with `=(ref)` requirement for mixed strings.
- **New apps:** Automatically compliant — no bare refs in mixed strings to migrate.
- **Existing apps (`warpgogol-com`):** Operator runs `content.formula.migrate --app warpgogol-com` to convert existing bare refs. No flag day required — migration is mechanical and idempotent.

## Alternatives considered

1. **Keep REF-04 as warning, add lint-only check** — rejected. 315 warnings are noise that hides real issues. Warnings are ignored by agents and operators. Promotion to error is the only reliable enforcement mechanism.

2. **New delimiter syntax (e.g. `[[ref]]`)** — rejected. RFC-0570 already established `=(...)` as the formula delimiter. Introducing a second delimiter for the same purpose (embedding refs in mixed strings) would create confusion and increase cognitive load for content authors.

3. **Require all refs to use `=(...)` syntax, including pure refs** — rejected as too invasive. Pure refs on their own line are unambiguous and have no ambiguity problem. The rule targets only the ambiguous case: refs inside mixed strings.

4. **Automatic migration via build-time auto-fix** — rejected. Build-time auto-fix mutates content files during validation, which violates the separation between validation and codegen. `content.formula.migrate` is a manual command that the operator runs explicitly.

5. **Do nothing — accept the 315 warnings as noise** — rejected. The warnings hide real validation issues and create agent confusion about whether a pattern is a reference or literal text.

## Risks

- **False positives in REF-04 promotion:** A bare braceless pattern matching a known collection inside a mixed string could be intentional literal text (e.g., a documentation example showing the reference syntax). Mitigation: the migrator converts real refs; literal examples in documentation are rare and can be escaped or placed in code blocks where the validator does not scan.
- **Migration scope:** 315 instances across 22 files is a significant migration. Mitigation: `content.formula.migrate` is idempotent and mechanical. The operator reviews the diff before committing.
- **Agent misinterpretation:** Agents may confuse `=(ref)` with YAML frontmatter or Astro expressions. Mitigation: the AGENTS.md rule explicitly states the scope — content-reference syntax only, resolved by `resolveReferencesInString`.
- **Performance:** The `isInsideFormula` check is O(n) per line, negligible. The migrator's second scan pass is O(n) per file. No measurable impact on build or migration time.

## Acceptance criteria

- [x] `resolveFormula` in `packages/share/src/formula-eval.ts` returns string values for single-ref expressions (evidence: `packages/share/src/formula-eval.ts:183-190`, test `formula-eval.test.ts:235-262`)
- [x] `content.references.validate` skips REF-04 for refs inside `=(...)` formulas (evidence: `packages/os/site-kernel-checks/src/content-references.ts:144-151`, test `content-references.test.ts:76-92`)
- [x] `content.references.validate` promotes REF-04 from warning to error for known collections in mixed strings (evidence: `packages/os/site-kernel-checks/src/content-references.ts:152-161`, test `content-references.test.ts:58-74`)
- [x] `content.formula.migrate` converts bare braceless refs in mixed strings to `=(ref)` syntax, idempotent, skips refs already inside `=(...)` (evidence: `packages/os/site-kernel-codegen/src/content-formula-migrate.ts:105-138`, 36 conversions on warpgogol-com)
- [x] Unit tests for `resolveFormula` single-ref string return path in `packages/share/src/tests/formula-eval.test.ts` (evidence: 3 tests at lines 235-301)
- [x] Unit tests for `isInsideFormula` logic in `packages/os/site-kernel-checks` (evidence: `content-references.test.ts` — 3 tests, all pass)
- [x] Root `AGENTS.md` contains the `=(ref)` rule for mixed strings (evidence: `AGENTS.md:518-520`)
- [x] `packages/share/AGENTS.md` formula-eval entry updated with RFC-0723 string-value extension (evidence: `packages/share/AGENTS.md:35`)
- [x] `content.formula.migrate --app warpgogol-com` converts all instances with zero remaining REF-04 warnings (evidence: 36 conversions, `content.references.validate` reports 0 warnings)
- [x] `rfc.validate` passes on this file with zero RFC-specific errors (evidence: `rfc.validate --id RFC-0723` — 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0723 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST use `=(ref)` formula syntax for all content references inside mixed strings. Bare braceless references in mixed strings are prohibited.
- Agents MUST NOT use `=(...)` formula syntax in YAML frontmatter keys or Astro expressions — it is content-reference syntax only, resolved by `resolveReferencesInString` in `@warpgogol/share`.
- Agents MUST NOT hardcode numeric results of arithmetic over content references in prose or block props — use `=(...)` formula syntax instead (RFC-0570).
- The `resolveFormula` single-ref string return path and `isInsideFormula` check are already implemented. The remaining work is: REF-04 promotion, migrator extension, AGENTS.md rule, tests, content migration.
