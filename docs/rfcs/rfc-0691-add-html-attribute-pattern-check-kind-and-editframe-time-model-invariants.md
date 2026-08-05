---
id: RFC-0691
title: "Add html-attribute-pattern check kind and Editframe time model invariants"
status: accepted
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-05
updatedAt: 2026-08-05
enhancedAt: 2026-08-05
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-54
  - RFC-0638
  - RFC-0641
  - RFC-0675
satisfies:
  - DNA-54
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - forge.doctor
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/forge
successSignals:
  - "`profileInvariantCheckSchema` accepts `html-attribute-pattern` as a check kind"
  - "Invariant engine validates HTML attribute values against regex patterns for elements matching a tag selector"
  - "`editframe-html.yaml` declares VIDEO-04 through VIDEO-09 invariants covering time model concepts"
  - "`forge doctor` on an Editframe project checks time model invariants and reports violations"
  - "Unit tests verify html-attribute-pattern check kind with positive and negative cases"
nonGoals:
  - "Do not add a full HTML parser dependency — the check kind uses regex-based element and attribute extraction"
  - "Do not validate CSS animations or keyframe synchronization — that is Editframe CLI's responsibility"
  - "Do not create Editframe-specific skills — that is RFC-0692"
  - "Do not modify the editframe-html profile workspace layout or install steps"
---

# RFC-0691: Add html-attribute-pattern check kind and Editframe time model invariants

## Context

The Editframe time model (`ef-timegroup`) is the core timing primitive for video compositions. It supports:

- **Modes**: `sequence` (children play one after another), `fixed` (children overlap with optional offset), `contain` (group duration = longest child), `fit` (group duration = parent duration)
- **Duration**: CSS time strings (`5s`, `500ms`, `2.5s`)
- **Offset**: CSS time strings shifting when an element begins within a parent fixed group
- **FPS**: Frame rate (default 30, positive integer)
- **Loop**: Loops composition in preview only (no effect on render)

RFC-0641 added the `editframe-html` profile with three basic invariants (VIDEO-01: kebab-case filenames, VIDEO-02: contain fit mode, VIDEO-03: captions for accessibility). RFC-0675 added the invariant enforcement engine with three check kinds: `filename-pattern`, `file-contains`, `file-not-contains`.

These check kinds operate on file names and raw file content. They cannot validate HTML attribute values on specific elements — for example, they cannot check that `duration` attributes on `ef-timegroup` elements use valid CSS time strings, or that `mode` attributes use one of the four valid values.

## Problem

An operator creating an Editframe time-model-focused project has no forge-level validation for time model correctness. The `editframe check` CLI is the primary validator, but it may not catch all domain-specific quality issues that forge invariants can enforce:

1. **Root timegroup duration**: The root `ef-timegroup` must declare a `duration` or use `mode="contain"` or `mode="fit"`. Without this, the composition has no defined total duration.
2. **CSS time string format**: `duration` and `offset` values must be valid CSS time strings (`/^\d+(\.\d+)?(s|ms)$/`). Invalid values like `5` or `five seconds` cause render failures.
3. **Mode value validation**: `mode` must be one of `sequence`, `fixed`, `contain`, `fit`. Typos like `seqence` or `fited` are silent failures.
4. **FPS validation**: `fps` must be a positive integer. Values like `0`, `-1`, or `30.5` are invalid.
5. **Loop attribute scope**: `loop` has no effect during rendering — it only affects browser preview. Placing it on non-root timegroups is misleading.
6. **Offset without fixed parent**: `offset` only has meaning within a `mode="fixed"` parent. Using it on children of `mode="sequence"` is a no-op.

The current invariant engine cannot enforce these rules because it lacks a check kind that can extract and validate HTML attribute values on specific elements.

## Decision

Two changes are made:

1. **Invariant engine extension**: A new check kind `html-attribute-pattern` is added to `profileInvariantCheckSchema`. It extracts elements by tag name from HTML files, reads a specified attribute, and validates the attribute value against a regex pattern.

2. **Editframe time model invariants**: Six new invariants (VIDEO-04 through VIDEO-09) are added to the `editframe-html` profile, covering root duration, CSS time string format, mode values, FPS, loop scope, and offset validity.

## Architectural fit

- **DNA-54 (Forge bindings contract)**: Invariants are declared in profile YAML, not hardcoded in Forge source. This satisfies DNA-54 by keeping domain-specific rules (time model validation) in the profile declaration layer (`editframe-html.yaml`), not in forge skill bodies or source code. The `html-attribute-pattern` check kind is generic — it works for any HTML-based domain, not just Editframe — so no project-specific literals are introduced into forge source.
- **RFC-0638 (profile schema)**: `invariants[].check` already supports `kind`, `glob`, `pattern`, `negatedPattern`. This RFC adds `kind: "html-attribute-pattern"` with additional `element` and `attribute` fields.
- **RFC-0641 (editframe profile)**: The profile already declares VIDEO-01/02/03. This RFC adds VIDEO-04..09 to the same profile.
- **RFC-0675 (invariant enforcement)**: The invariant engine in `invariant-engine.ts` already supports three check kinds. This RFC adds a fourth without changing existing behavior.

## Design

### CLI surface

No new CLI commands. `forge.doctor` automatically picks up new invariants from the profile.

### TypeScript contracts

```ts
export const profileInvariantCheckSchema = z.object({
  kind: z.enum([
    "filename-pattern",
    "file-contains",
    "file-not-contains",
    "html-attribute-pattern",
  ]),
  glob: z.string().optional(),
  pattern: z.string().optional(),
  negatedPattern: z.string().optional(),
  // html-attribute-pattern only:
  element: z.string().optional(),
  attribute: z.string().optional(),
}).refine(
  (v) => v.kind !== "html-attribute-pattern" || (v.element != null && v.attribute != null),
  { message: "element and attribute are required for kind: html-attribute-pattern" },
);

export interface ProfileInvariantCheck {
  kind: "filename-pattern" | "file-contains" | "file-not-contains" | "html-attribute-pattern";
  glob?: string;
  pattern?: string;
  negatedPattern?: string;
  element?: string;
  attribute?: string;
}
```

- `element` — HTML tag name to match (e.g. `"ef-timegroup"`). Required for `html-attribute-pattern`.
- `attribute` — attribute name to extract from matched elements (e.g. `"duration"`). Required for `html-attribute-pattern`.
- `pattern` — regex pattern to validate the attribute value against. For `html-attribute-pattern`, a violation is reported when the attribute value does NOT match the pattern. When the attribute is absent on an element, no violation is reported (the invariant only validates elements that declare the attribute).

### Check algorithm for html-attribute-pattern

1. Collect files matching `glob` (same as existing check kinds).
2. For each file, find all HTML elements with tag name matching `element` using regex: `new RegExp(`<${element}[^>]*>`, "gi")`.
3. For each matched element, extract the attribute value using regex: `new RegExp(`${attribute}="([^"]*)"`, "i")` or `new RegExp(`${attribute}='([^']*)'`, "i")`.
4. If the attribute is present, validate its value against `pattern`. If the value does NOT match, report a violation.
5. If the attribute is absent, skip the element (no violation — the invariant only checks elements that declare the attribute).

### New invariants for editframe-html profile

```yaml
invariants:
  # ... existing VIDEO-01, VIDEO-02, VIDEO-03 ...
  - id: VIDEO-04
    rule: Root ef-timegroup must declare duration or use mode="contain" or mode="fit"
    severity: error
    check:
      kind: file-contains
      glob: "compositions/**/*.html"
      pattern: "ef-timegroup[^>]*(duration|mode=\"contain\"|mode=\"fit\")[^>]*>"
  - id: VIDEO-05
    rule: All duration values must be valid CSS time strings (e.g. 5s, 500ms, 2.5s)
    severity: error
    check:
      kind: html-attribute-pattern
      glob: "compositions/**/*.html"
      element: "ef-timegroup"
      attribute: "duration"
      pattern: "^\\d+(\\.\\d+)?(s|ms)$"
  - id: VIDEO-06
    rule: mode attribute must be one of: sequence, fixed, contain, fit
    severity: error
    check:
      kind: html-attribute-pattern
      glob: "compositions/**/*.html"
      element: "ef-timegroup"
      attribute: "mode"
      pattern: "^(sequence|fixed|contain|fit)$"
  - id: VIDEO-07
    rule: fps must be a positive integer (default 30)
    severity: warning
    check:
      kind: html-attribute-pattern
      glob: "compositions/**/*.html"
      element: "ef-timegroup"
      attribute: "fps"
      pattern: "^[1-9]\\d*$"
  - id: VIDEO-08
    rule: loop attribute should only be used on the root ef-timegroup (no effect on render for nested groups)
    severity: warning
    check:
      kind: file-not-contains
      glob: "compositions/**/*.html"
      negatedPattern: "<ef-timegroup[^>]*loop[^>]*>[\\s\\S]*<ef-timegroup[^>]*loop"
  - id: VIDEO-09
    rule: offset values must be valid CSS time strings (e.g. 0.5s, 3s, 500ms)
    severity: warning
    check:
      kind: html-attribute-pattern
      glob: "compositions/**/*.html"
      element: "ef-timegroup"
      attribute: "offset"
      pattern: "^\\d+(\\.\\d+)?(s|ms)$"
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/src/profiles/profile-schema.ts` | Extended — `html-attribute-pattern` added to check kind enum, `element` and `attribute` fields added |
| `packages/forge/src/onboarding/invariant-engine.ts` | Extended — `html-attribute-pattern` check implementation |
| `packages/forge/profiles/editframe-html.yaml` | Extended — VIDEO-04 through VIDEO-09 invariants added |
| `packages/forge/os/core/handlers/invariant-engine.test.ts` | Extended — tests for `html-attribute-pattern` check kind |
| `packages/forge/src/tests/editframe-profile.test.ts` | Extended — tests for VIDEO-04..09 invariants |
| `packages/forge/AGENTS.md` | Extended — `html-attribute-pattern` check kind documentation |

### Output format

`forge.doctor --json` includes invariant violations in the `domain-invariants` check object as an `invariantViolations` array. Each entry has `{ invariantId, severity, rule, file, message }`. This is the same shape established by RFC-0675. In pretty mode, `forge.doctor` reports up to 3 violations inline with a `(+N more)` summary. Error-severity violations set the check status to `fail`; warning-severity set it to `warn`. The `--strict` flag elevates `warn` to `fail`.

### Failure modes

- **Malformed HTML**: The regex-based element extraction may miss elements with unusual formatting (e.g. attributes split across lines). Mitigation: the regex matches `<tag[^>]*>` which handles most common formatting. Edge cases are reported as missed violations, not false positives.
- **Attribute absent**: If an element doesn't declare the attribute, no violation is reported. This is by design — the invariant only validates elements that declare the attribute.
- **Multiple elements in one file**: All matching elements are checked. Each violating element produces a separate violation with its tag snippet for location context.
- **Self-closing elements**: `<ef-timegroup duration="5s"/>` — the regex `<ef-timegroup[^>]*>` matches including the `/>`. This is correct behavior.
- **Multiple elements on one line**: The regex uses the `g` flag, so `<ef-timegroup duration="5s"><ef-timegroup duration="3s">` correctly finds both elements.
- **Invalid regex pattern**: If the `pattern` or `element` regex is invalid, the engine reports a warning-level violation with the regex error message (same as existing `compilePattern` behavior).
- **Missing element/attribute fields**: If a profile declares `kind: html-attribute-pattern` without `element` or `attribute`, the Zod `.refine()` validation fails at profile load time with a clear error message.

## Rollout

- **Schema extension**: `html-attribute-pattern` is added to the check kind enum. Existing profiles without this check kind are unaffected (backward compatible).
- **Engine extension**: The new check kind is implemented in `invariant-engine.ts`. The `runCheck` function gains a new `case` branch for `html-attribute-pattern`.
- **Profile update**: `editframe-html.yaml` gains six new invariants. `forge.doctor` on Editframe projects now checks 9 invariants (VIDEO-01..09).
- **Existing projects**: Existing editframe-html projects automatically receive the 6 new invariants on their next `forge.doctor` run. Projects with valid time model attributes will pass without changes. Projects with invalid attributes (e.g. `duration="5"` without unit) will see new violations — these are real quality issues that were previously undetected.
- **No migration**: existing profiles and invariants are unaffected. The new check kind and invariants are additive.
- **Integration**: `forge.doctor` automatically picks up the new invariants from the profile — no pipeline changes needed.

## Alternatives considered

- **Full HTML parser (parse5, cheerio)**: Rejected for portability. The invariant engine is in `packages/forge/src/` (portable, no `@warpgogol/*` imports). Adding an HTML parser dependency increases bundle size for all forge consumers, not just Editframe ones. Regex-based extraction is sufficient for attribute validation on well-formed HTML compositions.
- **External validation script**: Rejected — same reasoning as RFC-0675. Couples Forge to external scripts, security and portability risk.
- **Delegate all validation to `editframe check`**: Rejected — `editframe check` is the primary validator, but forge invariants provide supplementary domain-specific quality checks that the CLI may not cover (e.g. loop attribute scope, CSS time string format).
- **Extend `file-contains` with element and attribute fields**: Rejected — `file-contains` checks raw file content, not parsed elements. Mixing the two semantics in one check kind is confusing. A separate `html-attribute-pattern` check kind is cleaner.

## Risks

- **Regex fragility**: The regex-based element extraction (`<tag[^>]*>`) may fail on edge cases like `>` inside attribute values or multi-line tags. Mitigation: these are rare in Editframe compositions, which use simple HTML custom elements. The invariant reports violations, not errors — a missed violation is a false negative, not a crash.
- **False positives on non-timegroup elements**: The `element` field matches by tag name only. If a composition uses custom elements with the same tag name as `ef-timegroup` but different semantics, the invariant may report false positives. Mitigation: `ef-timegroup` is an Editframe custom element — operators are unlikely to redefine it.
- **VIDEO-08 regex greediness**: The `file-not-contains` check for nested loop attributes uses `[\s\S]*` between two loop-attribute patterns. This regex is greedy and may over-match across long files. Mitigation: Editframe compositions are typically short (<100 lines). Severity is `warning`, not `error`. Operators can suppress individual warnings.
- **VIDEO-08 false positives**: The regex may match `loop` in comments or text content. Mitigation: severity is `warning`, not `error`. Operators can suppress individual warnings.
- **Attribute value with single quotes**: The attribute extraction regex handles both double and single quotes. If an attribute uses no quotes (e.g. `loop` without `="true"`), the extraction returns null and no violation is reported. This is correct for boolean attributes like `loop`.

## Acceptance criteria

- [x] `profileInvariantCheckSchema` accepts `html-attribute-pattern` as a check kind with optional `element` and `attribute` fields (evidence: packages/forge/src/profiles/profile-schema.ts:120-142, forge.profile.validate --id editframe-html pass)
- [x] `invariant-engine.ts` implements `html-attribute-pattern` check: extracts elements by tag name, reads attribute, validates against pattern (evidence: packages/forge/src/onboarding/invariant-engine.ts:175-218, 5 unit tests pass)
- [x] `editframe-html.yaml` declares VIDEO-04 through VIDEO-09 invariants (evidence: packages/forge/profiles/editframe-html.yaml:83-132, forge.profile.validate pass)
- [x] `forge doctor` on an Editframe project checks VIDEO-04..09 and reports violations (evidence: doctor.ts:1048-1051 calls checkInvariants which processes all 9 invariants; invariant-engine.test.ts confirms checkInvariants behavior)
- [x] Unit test verifies `html-attribute-pattern` with valid attribute values (no violations) (evidence: packages/forge/os/core/handlers/invariant-engine.test.ts:246-274, "html-attribute-pattern passes valid attribute values")
- [x] Unit test verifies `html-attribute-pattern` with invalid attribute values (violations reported) (evidence: packages/forge/os/core/handlers/invariant-engine.test.ts:213-244, "html-attribute-pattern detects invalid attribute values")
- [x] Unit test verifies `html-attribute-pattern` skips elements without the declared attribute (evidence: packages/forge/os/core/handlers/invariant-engine.test.ts:276-304, "html-attribute-pattern skips elements without the declared attribute")
- [x] Unit test verifies `editframe-html.yaml` declares at least 9 VIDEO-* invariants (evidence: packages/forge/src/tests/editframe-profile.test.ts:79, toBeGreaterThanOrEqual(9))
- [x] `packages/forge/AGENTS.md` updated with `html-attribute-pattern` documentation (evidence: packages/forge/AGENTS.md:142, html-attribute-pattern documented in forge.doctor section)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0691 --json, 0 violations)

### Performance

The `html-attribute-pattern` check reads each file matching the glob and runs 2 regex operations per file (element extraction + attribute extraction). For typical Editframe projects (1-10 composition files), this is negligible. The check scales linearly with file count — O(n_files × n_elements_per_file) regex matches. No performance concern for projects with <100 composition files.

### VIDEO-04 check kind choice

VIDEO-04 uses `file-contains` (not `html-attribute-pattern`) because it checks for the _presence_ of a root `ef-timegroup` element declaring `duration` OR `mode="contain"` OR `mode="fit"`. This is a content-presence check with alternative attributes, not an attribute-value-format validation. `html-attribute-pattern` validates individual attribute values against a regex — it cannot express "element must have attribute A OR attribute B OR attribute C with specific values". `file-contains` with a regex alternation is the correct tool for this pattern.

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
- Agents MUST add `html-attribute-pattern` to the TypeScript union type and Zod enum simultaneously — the schema and interface must stay in sync.
- Agents MUST add the `.refine()` validation for `element`/`attribute` required fields when `kind: html-attribute-pattern` — schema-level enforcement prevents silent false negatives at runtime.
-->
