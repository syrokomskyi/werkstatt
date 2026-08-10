---
rfcId: RFC-0795
auditId: AUDIT-RFC-0795-01
date: 2026-08-10
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0795

## Verdict: Needs revision

The RFC is structurally complete and architecturally sound, but contains a V-rule number collision with existing validation rules (V-31 and V-32 are already taken) and a stamping gate rule number collision (RFC-IMP-06 is the highest existing). These must be renumbered before implementation to avoid conflicts in `validate-rules.ts` and `implement-stamp.ts`.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0795` reports zero violations.

## Axis A — Structural completeness

- **A-1: V-rule number collision.** The RFC assigns V-31 to `dependsOn` referential integrity and V-32 to `batch` slug format. However, V-31 is already used for filename number matching (line 856 of `validate-rules.ts`) and V-32 is already used for implementation commit drift detection (RFC-0625, line 890). The new rules must be renumbered to V-33 and V-34 respectively.
- **A-2: Stamping gate rule number collision.** The RFC assigns `RFC-DEP-01` to the dependency gate. While this is not a direct collision (existing stamp rules are `RFC-IMP-01` through `RFC-IMP-06`), the naming convention `RFC-DEP-01` breaks the existing `RFC-IMP-NN` pattern. Consider `RFC-IMP-07` for consistency with the existing stamping gate rule family, or keep `RFC-DEP-01` but document the naming choice explicitly.
- **A-3: `RfcImplementStampRule` type not mentioned.** The existing `RfcImplementStampRule` union type in `types.ts` (line 488) lists `"RFC-IMP-01" | "RFC-IMP-02" | ... | "RFC-IMP-06"`. The RFC's TypeScript contracts section does not mention extending this union. If `RFC-DEP-01` is kept, it must be added to this type; if `RFC-IMP-07` is used, it must be added.

## Axis B — DNA alignment

- **B-1: DNA-65 not yet in `satisfies[]`.** The RFC body states "DNA-65 (new) — established by this RFC" and the Decision section says "DNA-65 ... is established by this RFC." However, `satisfies: []` is empty in the frontmatter. Since this RFC is `kind: policy` (not `architecture` or `contract`), `--satisfies` is not required by RFC-0331. But the RFC should still list DNA-65 in `satisfies[]` for traceability — `rfc.create` allows `--satisfies` for policy RFCs too, it's just not mandatory. Alternatively, the implementation notes correctly state DNA-65 will be added to `docs/architecture-dna.md` during implementation, which is the right approach. Consider adding `DNA-65` to `satisfies[]` anyway for self-documentation.
- **B-2: `related` references are relevant.** DNA-54 (Forge bindings), RFC-0331 (satisfies enforcement), RFC-0476 (rfc.implement.stamp) are all directly related. No decorative references.

## Axis C — Ecosystem fit

- **C-1: `rfc.list` flag registration not fully specified.** The RFC's file system responsibilities table mentions `packages/forge/os/rfc/rfc.module.ts` for `--batch` flag registration. The existing `rfc.list` command in `rfc.module.ts` (lines 42-63) has typed flags: `status`, `kind`, `owner`. The RFC should mention that a `batch` flag entry needs to be added to the `flags` object in the command registration, following the same `{ kind: "string", description: "..." }` pattern.
- **C-2: `RfcListEntry` type extension not mentioned.** The `rfc.list --json` output example includes `batch` and `dependsOn` fields in each entry. The existing `RfcListEntry` type in `types.ts` would need these fields added. The TypeScript contracts section should mention this.
- **C-3: `RFC_KNOWN_KEYS` location.** The RFC references `RFC_KNOWN_KEYS` but this constant is not shown in the existing `types.ts` snippet. The implementer needs to find it — it's in `validate-rules.ts` where V-20 (unknown frontmatter keys) checks against it. The RFC should cite the file path for this constant.
- **C-4: Command lifecycle consistency.** `commands.changed` lists `rfc.implement.stamp`, `rfc.list`, and `rfc.validate`. These are existing registered commands being extended — correct. No new commands proposed — correct. The `commands.proposed` and `commands.added` arrays are empty — consistent.

## Axis D — Forward-only compliance

No issues. Both fields are optional and backward compatible. No shims, no dual paths, no deprecation grace periods. Retroactive batch auto-detection modifies existing RFC frontmatter directly (forward-only), not behind a flag.

## Axis E — Agent-facing policy

- **E-1: Implementation notes reference correct governance rules.** RFC-0224 (accepted→implemented), RFC-0330 (verification evidence), RFC-0334 (supersede escalation) are all correctly referenced.
- **E-2: No self-authorizing language.** The RFC does not grant implementation permission while draft. Status gate is respected.
- **E-3: No `NEEDS CLARIFICATION` markers.** Clean.
- **E-4: Session affinity recommendation text is advisory, not enforced.** Correct — the RFC explicitly states "sessions have no forge-internal identity" in nonGoals.

## Axis F — Pragmatism

- **F-1: Minimal command surface.** No new commands — extends `rfc.list` with a flag, extends `rfc.implement.stamp` with an internal check, extends `rfc.validate` with two rules. This is the minimal surface.
- **F-2: `--batch` flag is a filter, not a grouping command.** Correct — reuses existing `rfc.list` scanning logic.
- **F-3: Retroactive batch auto-detection heuristic.** The "mutual `related` references AND close creation dates (within 7 days)" heuristic is reasonable but may miss batches where RFCs were created over a longer period (e.g. RFC-0772..0776 engine consolidation spanned multiple sessions). Consider widening the window or making it configurable. Alternatively, accept that some batches won't be auto-detected — the RFC already says "If auto-detection is ambiguous, skip."

## Axis G — Blind spots

- **G-1: Performance of `rfc.implement.stamp` dependency check.** The stamp handler already calls `listRfcFiles` and `readAndParseRfc` for the target RFC. The dependency check needs to read the status of each `dependsOn` entry. The `loadRfcStatusMap` function in `frontmatter-io.ts` (line 116) already exists and returns a `Map<string, string>` of all RFC statuses. The RFC should mention using this existing helper to avoid N separate file reads.
- **G-2: Edge case: self-dependency.** The RFC does not explicitly forbid `dependsOn: [RFC-0795]` (an RFC depending on itself). V-33 should catch this as a warning or error.
- **G-3: Edge case: `dependsOn` on a `rejected` RFC.** If RFC-A is `rejected` and RFC-B has `dependsOn: [RFC-A]`, the stamping gate would block RFC-B forever (RFC-A will never be `implemented`). The RFC's Risks section mentions this scenario and proposes mitigation (amending RFC to remove `dependsOn`, or superseding the blocking RFC). This is adequate.
- **G-4: `batch` field in `rfc.list` pretty output.** The RFC shows `--json` output but does not describe how `batch` appears in pretty (non-JSON) output. Should it be a column? A suffix? This is a minor UX detail but should be specified.

## Questions for the author

1. Should the new validation rules be numbered V-33 and V-34 (next available after V-32), or should they use a different numbering scheme to avoid future collisions?
2. Should the stamping gate rule be named `RFC-IMP-07` (continuing the existing `RFC-IMP-NN` family) or `RFC-DEP-01` (new family for dependency-specific rules)?
3. Should `dependsOn` on a `rejected` RFC produce a V-33 warning at validation time (not just a stamp-time block), to surface the deadlock earlier?
