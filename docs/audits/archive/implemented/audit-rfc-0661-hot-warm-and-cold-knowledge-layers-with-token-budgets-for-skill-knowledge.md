---
rfcId: RFC-0661
auditId: AUDIT-RFC-0661-01
date: 2026-08-03
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0661

## Verdict: Needs revision

The RFC is well-structured and pragmatically scoped, but has an output-format inconsistency with RFC-0660 (separate `warnings` array vs. `severity` inside `violations`), a missing file in the responsibilities table (`forge-config.ts` for the `bindings.knowledge` schema extension), and a gap in specifying how budget enforcement handles custom-named knowledge files. None of these are fundamental — they are coordination gaps within the five-RFC series.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0661 --json` returns zero violations.

## Axis A — Structural completeness

- **File system responsibilities table is missing `packages/forge/src/config/forge-config.ts`.** The RFC proposes `bindings.knowledge.budgets` in `forge.yaml`, which requires extending `forgeBindingsSchema` (currently at `packages/forge/src/config/forge-config.ts:35-67`). The table lists `budgets.ts`, `skill-validate.ts`, `doctor.ts`, and `writing-great-skills/SKILL.md`, but not the config schema file that must accept the new `knowledge` key. Without this, `resolveKnowledgeBudgets` has no schema to read against.
- **Output format is inconsistent with RFC-0660.** RFC-0661's `forge.skill.validate --json` output (lines 200-217) puts SKILL-21 warnings in a separate `warnings` array: `{ "violations": [], "warnings": [...] }`. RFC-0660's output (lines 274-304) puts SKILL-19 warnings inside `violations` with `"severity": "warning"`. Both RFCs are draft and will be implemented in series — the output shape must be reconciled. Either both use a separate `warnings` array, or both use `severity` inside `violations`. The current `SkillValidateResult` interface (`packages/forge/src/validators/skill-validate.ts:34-38`) has neither a `warnings` field nor a `severity` field on `Violation`, so both RFCs require the same structural change — they should agree on the shape.

## Axis B — DNA alignment

- **`satisfies: []` is empty despite the RFC body explicitly extending DNA-54.** The architectural fit section (line 103) states: "DNA-54 (Forge bindings contract): budget defaults live in forge; per-project overrides live in `forge.yaml` bindings." For `kind: policy` RFCs, `satisfies` is not required by the frontmatter comment ("Required for architecture/contract RFCs"), but listing `DNA-54` would improve traceability — the RFC formally extends the bindings contract by adding `bindings.knowledge.budgets`.
- **DNA-60 is referenced as "proposed by this series" but does not exist in `docs/architecture-dna.md`.** The DNA registry currently ends at DNA-59. RFC-0660 (still draft) is the establishing RFC for DNA-60. This is a series dependency, not a defect — RFC-0661 correctly notes in implementation notes (line 266) that it depends on RFC-0660. But the RFC should explicitly state that DNA-60's establishment is gated on RFC-0660's implementation, not just the parser dependency.

## Axis C — Ecosystem fit

No issues. All changes are in `packages/forge`. `commands.changed` lists `forge.skill.validate` and `forge.doctor` — both are registered commands in `forgeCoreModule`. No new commands are proposed. No `docs/*.xml` or `AGENTS.md` changes are needed. Package boundaries are respected.

## Axis D — Forward-only compliance

No issues. No compatibility shims, dual paths, or legacy code maintained behind flags. The RFC extends existing commands without creating parallel interpretations.

## Axis E — Agent-facing policy

No issues. The RFC correctly states agents MAY implement only when status is `accepted` or `implemented` (line 260). No self-authorizing language. Implementation notes reference RFC-0224 (transition preconditions), RFC-0330 (verification evidence), and RFC-0334 (supersede escalation). No content authoring claims that could be misattributed as auto-generatable.

## Axis F — Pragmatism

No issues. No new commands — extends `forge.skill.validate` and `forge.doctor`. TypeScript contracts (`KnowledgeBudgets`, `LayerBudgetReport`, `computeLayerBudgets`, `resolveKnowledgeBudgets`) are minimal and purposeful. `packagesImpacted: [forge]` is correct. `nonGoals` are explicit: no hard failures, no tokenizer dependency, no auto-reduction, no budgets on non-knowledge files.

## Axis G — Blind spots

- **Custom-named knowledge files are not addressed.** RFC-0660 (line 182) allows skills to declare custom knowledge file names with layer recorded in a preamble comment (`<!-- knowledge-layer: L1 -->`), falling back to file-name mapping. RFC-0661's budget resolver (`resolveKnowledgeBudgets`, `computeLayerBudgets`) needs to know which layer a file is to apply the correct budget (hot 4096 / warm 8192). The RFC's reading discipline table (lines 114-118) maps layers by file name only (`learned-principles.md` → hot, `fix-patterns.md` → warm, `qa-log.md` → cold). A skill declaring a custom-named L2 file (e.g. `my-principles.md`) would have no budget applied unless the resolver reads the preamble marker. The RFC should specify how `computeLayerBudgets` determines the layer of a file that doesn't match the three conventional names.
- **Performance cost of parsing all knowledge files during validation is not discussed.** SKILL-21 runs `parseKnowledgeFile` on every hot/warm knowledge file of every skill (forge + pack) during `forge.skill.validate`. At current scale (4 skills with knowledge files, all near-empty templates), this is negligible. But the RFC should acknowledge the cost trajectory: as knowledge files grow and more skills adopt the pattern, the parser runs on every validation. A note like "cost is linear in total knowledge file size; validation is operator-invoked, not pipeline-integrated" would suffice.

## Questions for the author

1. Should SKILL-21 warnings go in a separate `warnings` array (as RFC-0661 proposes) or inside `violations` with `severity: "warning"` (as RFC-0660 proposes)? Both RFCs are draft and will be implemented in series — the `SkillValidateResult` shape must be reconciled before either is implemented.
2. How does `computeLayerBudgets` determine the layer of a custom-named knowledge file (one not matching `qa-log.md`, `fix-patterns.md`, or `learned-principles.md`)? Does it read the `<!-- knowledge-layer: LN -->` preamble marker from RFC-0660, or are budgets only applied to conventionally-named files?
3. Should `satisfies` list `DNA-54` given that the RFC body explicitly extends the Forge bindings contract with `bindings.knowledge.budgets`? The empty array is technically valid for `kind: policy`, but the extension is real.
