---
id: RFC-0613
title: "Accept null lastModified and fix YAML null parsing in markdown twin provenance"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-07-30
updatedAt: 2026-07-30
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0320
amendedBy: []
related:
  - RFC-0320
  - RFC-0602
  - RFC-0377
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-58
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - page.markdown.validate
  removed: []
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/share"
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "page.markdown.validate accepts lastModified: null without MDMETA-02 or MDMETA-04 errors for generated markdown twins."
  - "parseMarkdownTwinFrontmatter parses YAML null as JS null, not string 'null'."
  - "page.markdown.validate still rejects invalid date strings (e.g., '2026-7-4') with MDMETA-04."
  - "All existing page.markdown.validate tests pass without modification."
nonGoals:
  - "Do not change page.markdown.generate to produce a specific lastModified date — null is intentional for determinism (RFC-0602)."
  - "Do not remove the lastModified field from required fields — it must be present, just allowed to be null."
  - "Do not replace the hand-rolled YAML parser in parseMarkdownTwinFrontmatter with the yaml package — only fix null handling."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0613: Accept null lastModified and fix YAML null parsing in markdown twin provenance

## Context

RFC-0602 (timestamp determinism) made generators emit `lastModified: null` instead of `new Date().toISOString()` in generated markdown twins, so that re-running a generator produces byte-identical output. However, `page.markdown.validate` (established by RFC-0320) was not updated to accept `null` as a valid value for `lastModified`.

During mission `warpgogol-com-m000022` validation (2026-07-30), `page.markdown.validate` reported MDMETA-04 errors for all generated markdown twins: `lastModified is not a valid YYYY-MM-DD date: null`. The root cause was twofold:

1. **YAML null parsing bug**: `parseMarkdownTwinFrontmatter` in `packages/share/src/semantic/markdown-twin-provenance.ts` is a hand-rolled parser that treats all YAML values as strings. It parsed the YAML `null` keyword as the string `"null"` instead of JS `null`.
2. **Validator not updated for RFC-0602**: `page.markdown.validate` in `packages/os/site-kernel-checks/src/page-markdown.ts` required `lastModified` to be a valid `YYYY-MM-DD` date string. The string `"null"` (from the parsing bug) or even JS `null` (if parsed correctly) was rejected by MDMETA-02 (missing required field) and MDMETA-04 (invalid date format).

## Problem

Two bugs prevent `mission.validate` from passing when generated markdown twins use `lastModified: null` per RFC-0602:

1. `parseMarkdownTwinFrontmatter` (`packages/share/src/semantic/markdown-twin-provenance.ts:221-224`) parses YAML `null` as the string `"null"` instead of JS `null`.
2. `page.markdown.validate` (`packages/os/site-kernel-checks/src/page-markdown.ts:558-577`) rejects `null` for `lastModified` with MDMETA-02 and MDMETA-04, contradicting RFC-0602 determinism.

This gap is protected by manual discipline only — no test verifies that `null` is correctly parsed or accepted by the validator.

## Decision

`page.markdown.validate` accepts `null` as a valid value for `lastModified` in generated markdown twins, consistent with RFC-0602 determinism. The `parseMarkdownTwinFrontmatter` function parses YAML `null` as JS `null` instead of the string `"null"`.

This amends RFC-0320 (portable provenance frontmatter) to align with RFC-0602 (timestamp determinism).

## Architectural fit

- **DNA-58 (Generated-file content determinism)**: This RFC directly supports RFC-0602 determinism by ensuring the validator accepts the deterministic `null` value that generators produce.
- **RFC-0320 (Portable provenance frontmatter)**: Amended — `lastModified` is still a required field, but `null` is now an accepted value for generated twins.
- **RFC-0602 (Timestamp determinism)**: Depends on this RFC — without accepting `null`, the deterministic output produced by generators fails validation.
- **RFC-0377 (Standardized semantic frontmatter)**: Compatible — the frontmatter schema still requires `lastModified` to be present; only the value domain expands to include `null`.

## Design

### CLI surface

No CLI change — `page.markdown.validate` keeps its existing flags and interface. The change is internal to the validation logic.

### TypeScript contracts

```ts
// parseMarkdownTwinFrontmatter return type — no change, but null handling fixed
interface MarkdownTwinFrontmatter {
  lastModified: string | null;  // null is now a valid value
  [key: string]: string | null;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/semantic/markdown-twin-provenance.ts` | Fix `parseMarkdownTwinFrontmatter` to parse YAML `null` as JS `null` |
| `packages/os/site-kernel-checks/src/page-markdown.ts` | Fix MDMETA-02 and MDMETA-04 to accept `null` for `lastModified` |
| `packages/os/site-kernel-checks/src/tests/page-markdown.test.ts` | New regression tests for `null` parsing and validation |

### MDMETA-02 fix

The missing-required-field check skips `lastModified` when its value is `null`:

```ts
for (const field of requiredFields) {
  if (!(field in frontmatter) || (frontmatter[field] == null && field !== "lastModified")) {
    errors.push(`MDMETA-02: ${abs}: missing required field "${field}"`);
  }
}
```

### MDMETA-04 fix

The date format check only runs when `lastModified` is a non-null string:

```ts
const lastModified = frontmatter.lastModified;
if (lastModified != null && typeof lastModified === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(lastModified)) {
  errors.push(`MDMETA-04: ${abs}: lastModified is not a valid YYYY-MM-DD date: ${lastModified}`);
}
```

### parseMarkdownTwinFrontmatter fix

The hand-rolled parser converts the string `"null"` to JS `null`:

```ts
const stripped = value.replace(/^["']|["']$/g, "");
frontmatter[key] = stripped === "null" ? null : stripped;
```

### Failure modes

- **MDMETA-02**: Still fires for truly missing fields (not in frontmatter at all). Does NOT fire for `lastModified: null`.
- **MDMETA-04**: Still fires for invalid date strings (e.g., `"2026-7-4"`, `"null"` if parsing is not fixed). Does NOT fire for `lastModified: null`.
- **MDMETA-04 with non-string lastModified**: If `lastModified` is a number or boolean (should not happen in well-formed frontmatter), the `typeof lastModified === "string"` guard prevents a false positive.

## Rollout

- **No migration needed**: Generated markdown twins already emit `lastModified: null` per RFC-0602. The validator change makes them pass.
- **Existing apps**: Apps with generated markdown twins using `lastModified: null` will immediately pass validation after this fix.
- **Authored content**: Authored markdown files with `lastModified: 2026-07-30` (date string) continue to validate as before.
- **No pipeline change**: `page.markdown.validate` remains in the same pipeline position.

## Alternatives considered

- **Replace `parseMarkdownTwinFrontmatter` with the `yaml` package**: Rejected because the hand-rolled parser is intentionally lightweight (no dependency on `yaml` for the provenance parsing path). The fix is a one-line change; replacing the parser would be a larger refactor with no additional benefit.
- **Make `lastModified` optional instead of accepting `null`**: Rejected because RFC-0320 requires `lastModified` to be present in the frontmatter. Removing it from required fields would break the provenance contract. Accepting `null` preserves the field's presence while allowing deterministic output.

## Risks

- **False negatives**: If `parseMarkdownTwinFrontmatter` is not fixed first, the validator will receive the string `"null"` instead of JS `null`, and MDMETA-04 will still fire. Both fixes must be applied together.
- **Agent confusion**: Agents may interpret `lastModified: null` as a missing field and try to fill in a date. The MDMETA-02 fix explicitly excludes `lastModified` from the null-check, but agents should be educated via AGENTS.md that `null` is intentional for generated files.
- **Schema drift**: If a future RFC changes the `lastModified` field type, both the parser and validator must be updated in sync.

## Acceptance criteria

- [ ] `parseMarkdownTwinFrontmatter` in `packages/share/src/semantic/markdown-twin-provenance.ts` parses YAML `null` as JS `null` (evidence: unit test in `packages/share/src/tests/markdown-twin-provenance.test.ts`)
- [ ] `page.markdown.validate` accepts `lastModified: null` without MDMETA-02 error (evidence: unit test in `packages/os/site-kernel-checks/src/tests/page-markdown.test.ts`)
- [ ] `page.markdown.validate` accepts `lastModified: null` without MDMETA-04 error (evidence: unit test in `packages/os/site-kernel-checks/src/tests/page-markdown.test.ts`)
- [ ] `page.markdown.validate` still rejects invalid date strings with MDMETA-04 (evidence: unit test)
- [ ] `pnpm --filter @warpgogol/share test -- --run` passes (evidence: test output)
- [ ] `pnpm --filter @warpgogol/site-kernel-checks test -- --run` passes (evidence: test output)
- [ ] `rfc.validate` passes on this file before merging (evidence: `pnpm exec site-kernel run rfc.validate --id RFC-0613 --json`)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST apply both fixes together: `parseMarkdownTwinFrontmatter` null parsing AND `page.markdown.validate` MDMETA-02/04 acceptance. Applying only one fix will not resolve the validation errors.
- Agents MUST NOT remove `lastModified` from the required fields list — it must remain required, just accepting `null` as a valid value.
- Agents MUST NOT replace the hand-rolled YAML parser with the `yaml` package — only fix the null handling.
- Agents MUST add regression tests for both the parser and the validator to prevent future regressions.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
