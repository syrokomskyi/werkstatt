---
rfcId: RFC-0731
auditId: AUDIT-RFC-0731-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0731

## Verdict: Needs revision

The RFC introduces a well-motivated ergonomic improvement, but has a critical error code collision (REF-10 is already assigned by RFC-0729) and an incomplete call site inventory that would cause implementation failures. The design also lacks specificity on how the validator maps file paths to `ContentRefIndex` context.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **REF-10 error code collision**: The RFC proposes REF-10 for "this. reference used without sourceRef context" (line 208), but REF-10 is already assigned by RFC-0729 to "Unknown pipe formatter" in `packages/share/src/formula-eval.ts:292`. The existing test suite in `packages/share/src/tests/formula-eval.test.ts:463-505` asserts `REF-10` for unknown formatter errors. The RFC must use different error codes — REF-12 and REF-13 are the next available.
- **Stale RFC-0730 status language**: The rollout section (line 220) says "When RFC-0730 is implemented, the canonical references it introduces should use `this.`..." but RFC-0730 is already `status: implemented` (frontmatter line 4). This should say "RFC-0730 is implemented" and frame `this.` adoption as an immediate improvement to existing references, not a future dependency.
- **`successSignals` empty**: The field is empty. Consider listing observable signals (e.g. "content.references.validate passes with `this.` references in offering files", "resolveReference expands `this.` to `collection.file.` prefix").

## Axis B — DNA alignment

- **DNA-4 alignment is sound**: The RFC explains how `this.` reduces friction of referencing canonical fields from within the same file, strengthening DNA-4 (canonical content in `src/content/`). The connection is concrete, not decorative.

## Axis C — Ecosystem fit

- **Incomplete call site inventory**: The file system responsibilities table (line 184) lists only `semantic-loader.ts` as a call site to update. There are at least 5 other call sites that invoke `resolveReferencesInString`, `resolveReferencesDeep`, or `resolveFormula`:
  - `packages/ui/src/sections/markdown/prose-pipeline.ts`
  - `packages/pbp/src/semantic-model.ts`
  - `packages/share/src/astro/page-handler/semantic.ts`
  - `packages/share/src/astro/content.ts`
  - `packages/ui/src/components/section-body/rich/section-rich.astro`
  - `packages/os/site-kernel-codegen/src/material-metadata-write.ts`

  The implementation notes (line 257) correctly say "Agents MUST update all call sites", but the file system responsibilities table must enumerate them so the implementer knows the full scope.

- **Validator file-context mapping gap**: The `content-references.ts` validator currently has no mechanism to map a file path (e.g. `src/content/business-profile/uk/offerings/digital-foundation.md`) to its `collection.file` key in the `ContentRefIndex`. The RFC says "expand via file context" but doesn't explain how this mapping is derived. The validator iterates files from `collectMarkdownFilesSafe` and has `doc.relativeFile` — it needs a path-to-context derivation step that the RFC should specify.
- **Package boundaries**: Correct. `@warpgogol/share` owns the resolver, `@warpgogol/site-kernel-content` owns the loader call sites, `@warpgogol/site-kernel-checks` owns the validator. No boundary violations.

## Axis D — Forward-only compliance

- **No compatibility shim**: The `sourceRef` parameter is optional, not a dual-path. Existing callers continue to work without changes (they just can't use `this.`). This is forward-only — no legacy path is maintained.
- **No deprecation**: The RFC doesn't deprecate absolute references; both coexist. This is additive, not a migration. Acceptable.

## Axis E — Agent-facing policy

- **Status gate**: No self-authorizing language. The RFC correctly states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" (line 253).
- **Implementation notes**: Reference the correct governance rules (RFC-0224, RFC-0334). The note about updating all call sites is good but should be backed by the complete call site list (see Axis C).
- **NEEDS CLARIFICATION markers**: No unresolved markers.

## Axis F — Pragmatism

- **Minimal command surface**: No new commands. The existing `content.references.validate` is extended. This is the right approach.
- **Lean contracts**: The `SourceRef` interface is minimal (`collection` + `file`). The optional parameter pattern is clean.
- **Scope discipline**: `packagesImpacted` lists `@warpgogol/share`, `@warpgogol/site-kernel-content`, `@warpgogol/site-kernel-checks` — all three are directly impacted. `appsImpacted` is empty, which is correct since this is a package-level change.

## Axis G — Blind spots

- **Pattern collision with `PURE_REF_PATTERN`**: `this.guarantees.delivery.label` matches the existing `PURE_REF_PATTERN` (`^[a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$`) as collection=`this`, file=`guarantees`, field=`delivery.label`. The RFC's expansion rule says "replace `this.` with `${sourceRef.collection}.${sourceRef.file}.`" but doesn't specify that this must happen BEFORE pattern matching. Without this ordering, `resolveReferencesInString` would try to resolve `this` as a collection name and fail with REF-01. The RFC should clarify the order of operations: detect `this.` prefix → expand → then match against `REF_PATTERN`.
- **`REF_IN_FORMULA_PATTERN` ambiguity**: The RFC says to "update `REF_IN_FORMULA_PATTERN` to recognize `this.` prefix" (line 183), but doesn't specify how. The current pattern `/[a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_.-]+/g` would match `this.guarantees.delivery` as a three-segment reference. The RFC should specify whether the pattern itself changes or whether `this.` expansion happens before the pattern is applied in `resolveFormula`.
- **`BRACELESS_PATTERN` in validator**: The validator's `BRACELESS_PATTERN` (`/\b([a-z][a-z-]*)\.([a-z0-9-/]+)\.([a-zA-Z0-9_.-]+)\b/g`) would match `this.guarantees.delivery` as collection=`this`. The RFC doesn't explain how the validator detects and handles `this.` references before they hit this pattern.
- **Performance**: Correctly assessed as negligible — a single string prefix check before the existing resolution path.

## Questions for the author

1. REF-10 is already assigned by RFC-0729 to "Unknown pipe formatter". What error codes will you use instead for the two new `this.` failure modes? (REF-12/REF-13 are the next available.)
2. How does the `content-references.ts` validator derive the `sourceRef` (collection + file) from a file path like `src/content/business-profile/uk/offerings/digital-foundation.md`? Is there a path-to-context mapping, or does the validator need to reverse-lookup the file path in the `ContentRefIndex` entries?
3. What is the order of operations for `this.` expansion: does it happen before or after pattern matching in `resolveReference`, `resolveReferencesInString`, and `resolveFormula`? The current `PURE_REF_PATTERN` and `BRACELESS_PATTERN` would match `this.` as a collection name without pre-expansion.
