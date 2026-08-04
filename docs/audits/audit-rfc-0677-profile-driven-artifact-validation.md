---
rfcId: RFC-0677
auditId: AUDIT-RFC-0677-01
date: 2026-08-04
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0677 — Profile-driven artifact validation

## Verdict: Needs revision

RFC-0677 proposes `forge.validate.artifacts` as a structured validation reporter, but the RFC does not justify why a new command is needed when `forge.validate` (RFC-0674) already exists with the same profile resolution logic and could be extended with structured output. The relationship between the two commands is unclear and risks command-surface bloat. Additionally, the schema extension reuses the existing `validate` object on `profileArtifactSchema` but the RFC does not clarify whether the new fields (`outputFormat`, `violationPattern`) are backward-compatible additions to the existing `validate` or a new sibling object.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **A-1: Decision is vague on command relationship.** The Decision section says "Forge gains `forge.validate.artifacts`" but does not explain why `forge.validate` cannot be extended with the same structured output. The Alternatives section mentions "Extend `forge.validate` with structured output" but rejects it with "would complicate the generic command" — this is not a strong justification since the complexity is a `--json` flag, not a structural change.
- **A-2: TypeScript contracts duplicate existing types.** `ArtifactValidationResult` redefines `id`, `command`, `exitCode`, `stdout`, `stderr` from the existing `ForgeValidateArtifactResult` in `packages/forge/os/core/handlers/validate.ts:25-31`. The RFC should extend the existing interface, not create a parallel one.
- **A-3: `profileArtifactValidateSchema` naming is ambiguous.** The RFC proposes `profileArtifactValidateSchema` as a new schema, but the existing `profileArtifactSchema` already has a `validate` field. The RFC should clarify: is this a new top-level schema, or an extension of the existing `validate` object within `profileArtifactSchema`?

## Axis B — DNA alignment

- **B-1: DNA-54 satisfaction is weak.** The RFC claims `satisfies: [DNA-54]` (Forge bindings contract — no hardcoded project literals in skill bodies). The RFC body does not explain how `forge.validate.artifacts` enforces or extends DNA-54. The `outputFormat`/`violationPattern` fields are profile-declared, which aligns with DNA-54's spirit, but the RFC should explicitly state this.

## Axis C — Ecosystem fit

- **C-1: Command surface bloat.** `forge.validate` (RFC-0674) already executes `artifacts[].validate.command` with `--dry-run` and `--json`. The RFC proposes `forge.validate.artifacts` as a separate command with the same flags (`--dry-run`, `--json`, `--profile`) plus `--artifact`. The only new capabilities are: (1) `--artifact` filtering, (2) violation parsing, (3) `allPassed` summary. Items (1) and (3) could be flags on `forge.validate`. Item (2) is the only genuinely new capability. Consider extending `forge.validate` with `--structured` and `--artifact` flags instead of a new command.
- **C-2: `commands.proposed` vs `commands.added`.** The RFC lists `forge.validate.artifacts` in `commands.proposed` but it should land in `commands.added` upon implementation. This is correct per the frontmatter convention, but the RFC should note that `forge.validate` (RFC-0674) is in `commands.changed` if this RFC modifies its behavior — which it doesn't, but the overlap should be acknowledged.

## Axis D — Forward-only compliance

No issues. The RFC does not propose compatibility shims or legacy paths.

## Axis E — Agent-facing policy

No issues. Status gate is correct — implementation notes reference the accepted→implemented transition.

## Axis F — Pragmatism

- **F-1: New command vs extending existing.** See C-1. The RFC should justify why `forge.validate --structured --artifact composition` is insufficient. The current justification ("would complicate the generic command") is weak.
- **F-2: `violationPattern` regex with named capture groups.** The RFC proposes regex with named capture groups (`file`, `line`, `column`, `severity`, `message`) for parsing plain-text validate output. This is fragile and adds complexity. If `editframe check` supports JSON output, `outputFormat: "json"` should be the primary path. The RFC should make `outputFormat: "json"` the recommended default and `violationPattern` a fallback.

## Axis G — Blind spots

- **G-1: No performance estimate.** The RFC does not estimate the cost of running `forge.validate.artifacts` on a project with many artifacts. How many artifacts are typical? How large are composition files?
- **G-2: No empty-state handling.** What happens when the profile has artifacts but none have `validate` commands? The RFC says "skipped with a warning" but does not specify the exit code (0 or 1).
- **G-3: No concurrent execution consideration.** If multiple artifacts are validated sequentially, what happens if one validate command hangs? Is there a timeout?

## Questions for the author

1. Why not extend `forge.validate` (RFC-0674) with `--structured` and `--artifact` flags instead of creating `forge.validate.artifacts`? The overlap in profile resolution, flags, and output shape is near-total.
2. Are `outputFormat` and `violationPattern` fields added to the existing `validate` object in `profileArtifactSchema`, or is this a new sibling schema? The RFC says "extended with `outputFormat` and `violationPattern` on validate" but the schema name `profileArtifactValidateSchema` suggests a new top-level schema.
3. Does `editframe check` support JSON output? If yes, the RFC should set `outputFormat: "json"` in the `editframe-html` profile as part of this RFC, not "may add if needed".
