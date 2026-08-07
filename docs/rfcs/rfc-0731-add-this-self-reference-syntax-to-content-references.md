---
id: RFC-0731
title: "Add this self-reference syntax to content references"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-07
updatedAt: 2026-08-07
enhancedAt: 2026-08-07
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0730
amendedBy: []
related:
  - RFC-0527
  - RFC-0529
  - RFC-0570
  - RFC-0723
  - RFC-0729
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-4
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
    - content.references.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/share"
  - "@warpgogol/site-kernel-content"
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "content.references.validate passes with this. references in offering files"
  - "resolveReference expands this. to collection.file. prefix before index lookup"
  - "resolveReferencesInString resolves this. in plain refs, =(this.field) formulas, and pipe-formatted expressions"
nonGoals:
  - "Does not introduce relative references to other files (e.g. ../sibling.field) — only this. for same-file self-reference"
  - "Does not change the content reference index format or generation pipeline"
  - "Does not add formatters or pipe syntax — that is RFC-0729"
  - "Does not remove or migrate the presentation field — that is RFC-0730"
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

# RFC-0731: Add this self-reference syntax to content references

## Context

Content references (RFC-0527, RFC-0529) resolve values from the build-time generated `ContentRefIndex` using absolute `collection.file.field` paths. This works well for cross-entity references (e.g. a page referencing a business offering), but creates ergonomic friction when an entity references its own canonical fields — the author must hardcode the full `collection.file` prefix even though the reference originates from that same file.

RFC-0730 (accepted) eliminates `presentation` duplication in offering entities by routing display through canonical field references. For example, `presentation.guarantees.delivery.label` (a display duplicate of `guarantees.delivery.label`) is replaced by a reference like `business-profile.offerings/digital-foundation.guarantees.delivery.label`. This works, but the `business-profile.offerings/digital-foundation` prefix is redundant — the reference lives inside that very file.

The content reference resolver in `@warpgogol/share/content-reference` (`resolveReference`, `resolveReferencesInString`) and the formula evaluator in `@warpgogol/share/formula-eval` (`resolveFormula`, `scanFormulas`) both require absolute `collection.file.field` paths. There is no notion of "current file" or self-reference context.

## Problem

Self-references require hardcoding the full `collection.file` prefix, which creates two issues:

1. **Path coupling** — if the file slug or collection name changes, every self-reference breaks. The author must update references to their own file even though the reference never left the file.
2. **Verbosity** — `business-profile.offerings/digital-foundation.guarantees.delivery.label` is 60+ characters for a field that lives 20 lines above the reference. This discourages authors from using references and tempts them to duplicate values instead.

DNA-4 (canonical content in `src/content/`) is weakened: the friction of self-referencing canonical fields makes duplication the path of least resistance, which is exactly the problem RFC-0730 aims to solve.

## Decision

The content reference system gains a `this.` prefix for self-referencing fields within the same entity file. A reference like `this.guarantees.delivery.label` is resolved against the current file's own data in the `ContentRefIndex`, expanding to `collection.file.guarantees.delivery.label` internally. The `this.` prefix works in plain references, formula expressions `=(this.field)`, and pipe-formatted expressions `=(this.field | money currency=EUR)`.

## Architectural fit

- **DNA-4 (Canonical content in `src/content/`)** — `this.` reduces the friction of referencing canonical fields from within the same file, making the canonical-content approach more ergonomic and reducing the temptation to duplicate values.
- **RFC-0527 (Content reference index)** — `this.` is resolved through the same `ContentRefIndex`; no index format change. The `sourceRef` parameter extends the resolver contract without breaking existing callers (optional parameter).
- **RFC-0570 (Formula expressions)** — `this.` works inside `=(...)` formulas by the same expansion mechanism.
- **RFC-0723 (Formula syntax for mixed strings)** — `this.` inside `=(...)` follows the same rules as absolute references for REF-04 purposes.
- **RFC-0729 (Pipe formatter)** — `this.` is transparent to pipe formatting; the reference is resolved before the formatter is applied.
- **RFC-0730 (Presentation elimination)** — `this.` makes the canonical references introduced by RFC-0730 more concise and less coupled to file paths. This RFC amends RFC-0730 by providing the ergonomic syntax that makes its reference-heavy approach practical.

## Design

### CLI surface

No new commands. The existing `content.references.validate` command is updated to recognize and validate `this.` references:

```sh
pnpm exec site-kernel run content.references.validate --app warpgogol-com
```

Behavior is unchanged for absolute references. `this.` references are validated by expanding them through the file's own `collection.file` context and checking the resolved field path in the index.

### TypeScript contracts

```ts
// @warpgogol/share/content-reference

/**
 * Identifies the source file for `this.` reference expansion.
 * Passed optionally to resolveReference, resolveReferencesInString,
 * resolveReferencesDeep, and resolveFormula.
 */
export interface SourceRef {
  collection: string;
  file: string;
}

export function resolveReference(
  index: ContentRefIndex,
  ref: string,
  lang: string,
  defaultLang: string,
  sourceRef?: SourceRef,
): ResolveReferenceResult;

export function resolveReferencesInString(
  index: ContentRefIndex,
  text: string,
  lang: string,
  defaultLang: string,
  sourceRef?: SourceRef,
): string;

export async function resolveReferencesDeep(
  index: ContentRefIndex,
  data: unknown,
  lang: string,
  defaultLang: string,
  sourceRef?: SourceRef,
): Promise<unknown>;
```

```ts
// @warpgogol/share/formula-eval

export function resolveFormula(
  index: ContentRefIndex,
  expression: string,
  lang: string,
  defaultLang: string,
  sourceRef?: SourceRef,
): FormulaResolution;
```

**Expansion rule:** When a reference starts with `this.`, the resolver replaces `this.` with `${sourceRef.collection}.${sourceRef.file}.` **before** matching against `REF_PATTERN`. This pre-expansion step is the first operation in `resolveReference`, `resolveReferencesInString`, and `resolveFormula` — it happens before any pattern matching (`REF_PATTERN`, `PURE_REF_PATTERN`, `BRACELESS_SCAN_PATTERN`, `REF_IN_FORMULA_PATTERN`). Without this ordering, `this` would be misinterpreted as a collection name by the existing patterns. If `sourceRef` is not provided, the resolver returns error code `REF-12: this. reference used without sourceRef context`.

**Error code numbering:** REF-10 is already assigned by RFC-0729 to "Unknown pipe formatter" in `formula-eval.ts`. This RFC uses REF-12 (missing sourceRef) and REF-13 (field not found after expansion) to avoid collision.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/content-reference.ts` | Add `SourceRef` type, `sourceRef` parameter, `this.` expansion logic (pre-expansion before pattern matching) |
| `packages/share/src/formula-eval.ts` | Add `sourceRef` parameter, expand `this.` before `REF_IN_FORMULA_PATTERN` matching |
| `packages/os/site-kernel-content/src/semantic-loader.ts` | Pass `sourceRef` from entity context to `resolveReferencesInString` / `resolveReferencesDeep` |
| `packages/pbp/src/semantic-model.ts` | Pass `sourceRef` from entity context when resolving references in PBP entity data |
| `packages/share/src/astro/page-handler/semantic.ts` | Pass `sourceRef` from page context when resolving references |
| `packages/share/src/astro/content.ts` | Pass `sourceRef` from entity context when resolving references |
| `packages/ui/src/sections/markdown/prose-pipeline.ts` | Pass `sourceRef` from prose context when resolving references |
| `packages/ui/src/components/section-body/rich/section-rich.astro` | Pass `sourceRef` from section context when resolving references |
| `packages/os/site-kernel-codegen/src/material-metadata-write.ts` | Pass `sourceRef` from material context when resolving references |
| `packages/os/site-kernel-checks/src/content-references.ts` | Recognize `this.` references, derive `sourceRef` from file path, expand via file context, validate with REF-12/REF-13 |
| `packages/share/src/tests/content-ref-index.test.ts` | Add `this.` reference tests |
| `packages/share/src/tests/formula-eval.test.ts` | Add `this.` in formula tests |

### Output format

`content.references.validate` --json output is unchanged in shape. Two new error codes may appear in the `violations` array:

```json
{
  "command": "content.references.validate",
  "status": "fail",
  "violations": [
    "REF-12: this. reference used without sourceRef context in src/content/business-profile/uk/offerings/digital-foundation.md",
    "REF-13: this.guarantees.delivery.label unresolved in src/content/business-profile/uk/offerings/digital-foundation.md — field \"delivery\" not found"
  ]
}
```

### Failure modes

| Code | Condition | Severity |
| --- | --- | --- |
| REF-12 | `this.` reference encountered but no `sourceRef` provided (resolver called without context) | error |
| REF-13 | `this.` reference expanded but field path not found in the current file's data | error |
| REF-01..09 | Existing error codes apply after `this.` expansion (e.g. collection not found, file not found, language fallback) | error |
| REF-10 | Existing: Unknown pipe formatter (RFC-0729) — not reused by this RFC | error |

`this.` references that resolve successfully are silent (no warning, no info). The validator exits non-zero if any REF-12 or REF-13 error is found.

## Rollout

- **Default behavior:** `this.` references are recognized immediately upon implementation. No feature flag, no opt-in period.
- **Backward compatibility:** Existing absolute references continue to work unchanged. The `sourceRef` parameter is optional — callers that don't pass it simply cannot use `this.` references (REF-12 if they try).
- **Adoption:** Content authors may adopt `this.` references incrementally. No migration is required — absolute references remain valid. Authors are encouraged to use `this.` for self-references to reduce path coupling.
- **Integration:** `content.references.validate` in `build.check` automatically validates `this.` references. No pipeline changes.
- **RFC-0730 integration:** RFC-0730 is already `implemented`. The canonical references it introduced (e.g. `business-profile.offerings/digital-foundation.guarantees.delivery.label`) should be migrated to `this.` syntax where the reference targets the same entity file. This makes RFC-0730's display routing concise and decoupled from file paths. Migration is incremental — absolute references remain valid.

## Alternatives considered

- **Pre-expansion at call sites** — Instead of adding `sourceRef` to the resolver, each call site (semantic-loader, validator) would replace `this.` with the full `collection.file.` prefix before passing the string to the resolver. Rejected because it duplicates expansion logic across multiple call sites and the resolver cannot distinguish `this.` references from absolute ones for error reporting.

- **Relative references (e.g. `../sibling.field`)** — A more general relative reference system. Rejected as scope creep — the identified need is self-reference within the same file, not cross-file relative paths. Relative references introduce ambiguity (relative to what? collection root? file directory?) and are not needed for the RFC-0730 use case.

- **No `this.` — keep absolute references** — RFC-0730 already works with absolute references. Rejected because the verbosity and path coupling actively discourage authors from using references, undermining the goal of eliminating duplication.

## Risks

- **Agent misinterpretation** — Agents may use `this.` in cross-file contexts (e.g. in a page file referencing an offering field). The validator must catch this with REF-13 (field not found in current file). The `sourceRef` is determined by the file being processed, not by the author's intent.
- **Pattern collision** — `this` is a common English word. The `this.` prefix must only be recognized as a reference when followed by a valid field path pattern (`this.[a-zA-Z0-9_-]+`). The pattern `this.guarantees.delivery.label` is a reference; the word "this" in prose is not affected because it lacks the dotted field path suffix.
- **Call site coverage** — All call sites that pass strings to `resolveReferencesInString` or `resolveFormula` must be updated to pass `sourceRef`. Missed call sites will produce REF-12 errors when `this.` is used, which is the correct fail-safe behavior.
- **Performance** — Negligible. The `this.` expansion is a single string prefix check and replacement before the existing resolution path.

## Acceptance criteria

- [ ] `SourceRef` interface and `sourceRef` optional parameter added to `resolveReference`, `resolveReferencesInString`, `resolveReferencesDeep` in `@warpgogol/share/content-reference`
- [ ] `sourceRef` optional parameter added to `resolveFormula` in `@warpgogol/share/formula-eval`; `REF_IN_FORMULA_PATTERN` updated to recognize `this.` prefix
- [ ] `this.` expansion logic implemented: `this.field.path` → `${sourceRef.collection}.${sourceRef.file}.field.path` before index lookup
- [ ] REF-12 error code emitted when `this.` is used without `sourceRef`
- [ ] REF-13 error code emitted when `this.` reference is expanded but field path is not found in the current file's data
- [ ] `content.references.validate` in `@warpgogol/site-kernel-checks` recognizes and validates `this.` references, deriving `sourceRef` from file path
- [ ] `semantic-loader.ts` in `@warpgogol/site-kernel-content` passes `sourceRef` from entity context
- [ ] Unit tests in `packages/share/src/tests/content-ref-index.test.ts` cover `this.` in plain references, `this.` without `sourceRef` (REF-12), and `this.` with unresolvable field (REF-13)
- [ ] Unit tests in `packages/share/src/tests/formula-eval.test.ts` cover `this.` in formula expressions and pipe-formatted expressions
- [ ] Existing absolute references continue to resolve without behavior change (regression tests pass)
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
- Agents MUST update all call sites that pass strings to `resolveReferencesInString`, `resolveReferencesDeep`, or `resolveFormula` to pass `sourceRef`. The full call site inventory is listed in the file system responsibilities table above. The `sourceRef` is derived from the entity being processed (collection + file slug), not from the file path on disk.
- Agents MUST use `this.` for self-references within entity files to keep references concise and decoupled from file paths.
- Agents MUST NOT use `this.` in cross-file contexts — `this.` always refers to the current file being processed.
