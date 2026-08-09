---
rfcId: RFC-0642
auditId: AUDIT-RFC-0642-01
date: 2026-08-02
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0642

## Verdict: Needs revision

The RFC has a critical scope contradiction (SKILL-18 claims "same scope as SKILL-11" but excludes code blocks, which IS SKILL-11's scope), a factual file-path error, an incorrect skill count (33 vs 26 fo-* skills), and an undeclared dependency on RFC-0639's `resolveTerminology()` for the prose migration part. The `commands.changed` field is empty despite changing `forge.skill.validate` behavior.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0642 --json` reports zero violations.

## Axis A — Structural completeness

- **A1: File path error.** The file system responsibilities table lists `packages/forge/src/skill-validator.ts` but the actual validator file is `packages/forge/src/validators/skill-validate.ts` (plural "validators" directory, "skill-validate" filename). The RFC's TypeScript contracts section also references this file implicitly. Evidence: `packages/forge/src/validators/skill-validate.ts` exists; `packages/forge/src/skill-validator.ts` does not.

- **A2: Incorrect skill count.** The RFC says "All 33 fo-* skill files audited" (success signal) and "All 33 fo-* skills are audited and migrated" (Decision §2). The actual count is _*26 fo-* skills_* under `packages/forge/skills/fo/`. The number 33 is the total including 4 shared + 3 meta skills (per `packages/forge/AGENTS.md` line 10: "26 fo skills + 4 shared + 3 meta = 33 skills"). The acceptance criterion "All 33 fo-* skills audited and migrated" is uncheckable as stated because there are only 26 fo-* skills.

- **A3: `commands.changed` is empty.** The RFC adds a new validation rule (SKILL-18) to `forge.skill.validate`, changing its behavior. `forge.skill.validate` is a registered live command. Per RFC-CMD-03, `commands.changed` must list registered commands whose behavior changes. The RFC should list `forge.skill.validate` in `commands.changed`. Additionally, the CLI surface section mentions `forge skill.list --json` gaining SKILL-18 status — if `forge.skill.list` output changes, it should also be in `commands.changed`.

- **A4: `forge.skill.list` output format undefined.** The CLI surface section shows `forge skill.list --json` but the RFC does not describe what "SKILL-18 status" means in the `skill.list` output. What field is added? How does the JSON shape differ? The output format section only documents `forge.skill.validate` output, not `forge.skill.list`.

## Axis B — DNA alignment

- **B1: DNA-54 reference is correct.** `satisfies: [DNA-54]` is valid — DNA-54 exists in `docs/architecture-dna.md` (line 231) and the RFC body explains how SKILL-18 extends the de-hardcoding lattice (SKILL-11 → SKILL-17 → SKILL-18). No issues.

- **B2: No new DNA invariant established.** The RFC does not claim to establish a new DNA invariant. No `dna.registry.validate` sync needed. No issues.

## Axis C — Ecosystem fit

- **C1: Critical scope contradiction.** The Decision section (line 106) says: "must not reference software-specific binding keys (`typecheck`, `scopedBuild`, `test`) in instruction lines. Skills must reference semantic keys (`validate`, `produce`, `verify`) instead. Software-specific keys remain valid in forge.yaml and in code blocks / `run:` directives — the restriction is on instruction prose only, same scope as SKILL-11."

  This is self-contradictory. SKILL-11's `extractInstructionLines` (line 468 of `skill-validate.ts`) extracts lines **inside code blocks** and **`run:` directives** — not prose. If SKILL-18 has "same scope as SKILL-11", it scans code-block content. But the RFC says "Software-specific keys remain valid in ... code blocks / `run:` directives." These two statements cannot both be true.

  The actual grep results confirm that `bindings.commands.typecheck` and `bindings.commands.scopedBuild` references exist **inside code blocks** in `fo-idea-implement/SKILL.md` and `fo-doc-audit/SKILL.md`. If SKILL-18 uses `extractInstructionLines` (same scope as SKILL-11), these would be flagged — contradicting "remain valid in code blocks."

  The RFC must resolve this: either SKILL-18 checks code-block lines (and the "remain valid in code blocks" statement is removed), or SKILL-18 checks prose lines (and "same scope as SKILL-11" is removed).

- **C2: `bindings.terminology.*` pattern does not exist in any skill.** A grep for `bindings.terminology.` across all skills returned zero results. The RFC proposes migrating prose "app", "service", "package" to `ref(bindings.terminology.artifact)`, but this ref pattern is not used anywhere. The current `resolveBinding()` handles `bindings.commands.*` and `bindings.paths.*` — it does not resolve `bindings.terminology.*` keys. RFC-0639 proposes a `resolveTerminology()` function, but it is not implemented yet (status: draft). The prose migration is implicitly blocked on RFC-0639 implementation.

- **C3: Pack skill scope not clarified in code.** The RFC says "SKILL-18 applies to forge skills only (`fo-*` prefix)." The validator has two code paths: forge skills (line 178) and pack skills (line 346). The RFC does not specify where SKILL-18 is added. An implementer might add it to both paths. The RFC should state: SKILL-18 is added only to the forge-skill validation path (after SKILL-11, before SKILL-13), not to the pack-skill path.

- **C4: AGENTS.md update identified.** The RFC correctly identifies `packages/forge/AGENTS.md` needs updating with SKILL-18 documentation. The file system table includes this. No issues.

## Axis D — Forward-only compliance

- **D1: No compatibility shims.** The RFC is forward-only — all skills are migrated before enforcement, no dual-path. No issues.

- **D2: No legacy maintenance behind a flag.** The escape hatch (`<!-- skill-lint-disable SKILL-18 -->`) is a suppression mechanism, not a legacy path. This is consistent with SKILL-11 and SKILL-17. No issues.

## Axis E — Agent-facing policy

- **E1: Undeclared dependency on RFC-0639.** The prose migration part of the RFC (migrating "app", "service", "package" to `ref(bindings.terminology.artifact)`) depends on RFC-0639's `resolveTerminology()` function, which is not implemented. An agent implementing RFC-0642 would be unable to resolve `ref(bindings.terminology.artifact)` references. The RFC should either: (a) state that the prose migration is blocked on RFC-0639 and scope it to a follow-up, or (b) declare the dependency explicitly in the Implementation notes.

- **E2: Implementation notes are template boilerplate.** The "Implementation notes for agents" section contains only the standard HTML comment template. No specific guidance about the scope ambiguity (C1), the dependency on RFC-0639 (E1), or the pack-skill scope (C3). The RFC should add specific implementation guidance.

- **E3: No self-authorizing language.** The RFC does not grant implementation permission while draft. No issues.

## Axis F — Pragmatism

- **F1: Exempt set vs escape hatch redundancy.** The RFC defines both a `SKILL_18_EXEMPT` hardcoded set (containing `fo-add-tests`, `fo-architecture`) AND a `<!-- skill-lint-disable SKILL-18 -->` escape hatch. The escape hatch alone is sufficient — `fo-add-tests` and `fo-architecture` can use the escape hatch with a documentation comment. The hardcoded set couples the validator to specific skill names and creates a maintenance burden (new software-specific skills must be added to the set). This is over-engineering.

- **F2: Exempt criteria undefined.** The RFC says `fo-add-tests` is exempt because "tests are a software concept" and `fo-architecture` because "codebase architecture is software-specific." But the criteria for "inherently software-specific" are not defined. What about `fo-review` (reviews code changes), `fo-fix` (fixes code), `fo-doc-audit` (audits docs against code)? These are also software-adjacent. The RFC should define clear criteria or rely solely on the escape hatch with documented justification per skill.

- **F3: Prose migration scope is large.** Migrating "app", "service", "package" in prose across 26 skill files to `ref(bindings.terminology.artifact)` is a large change. The RFC should consider splitting the prose migration into a separate RFC (or a follow-up phase) to keep this RFC focused on the SKILL-18 validation rule and the binding-key migration (which is the core contribution).

## Axis G — Blind spots

- **G1: False-positive risk for "test" and "build".** The RFC's Problem section says skills reference `ref(bindings.commands.test)` and `ref(bindings.commands.scopedBuild)`. The TypeScript contracts show checking for `bindings.commands.typecheck`, `bindings.commands.scopedBuild`, `bindings.commands.test` — these are specific enough. But the RFC's description (line 91-96) says "references to 'typecheck', 'build', 'test'" which could be misinterpreted as flagging the bare words. The RFC should clarify that only `ref(bindings.commands.test)` patterns are flagged, not the word "test" or "build" in prose.

- **G2: Dependency on unimplemented RFCs.** RFC-0638 (profile schema), RFC-0639 (bindings schema), RFC-0640 (domain-aware commands) are all `draft`. RFC-0642's binding-key migration (`typecheck` → `validate`) depends on RFC-0639's semantic keys being added to the bindings schema. Without RFC-0639, `bindings.commands.validate` is not a valid binding key. The RFC should note that implementation is blocked until RFC-0639 is implemented, or scope the binding-key migration to after RFC-0639.

- **G3: `forge.skill.list` output change unspecified.** The CLI surface mentions `forge skill.list --json` but the RFC does not describe the output format change. What does "SKILL-18 status" look like in the list output? Is a new field added? Does the existing `violations` array include SKILL-18 entries?

- **G4: Performance note missing.** SKILL-18 adds another regex scan per skill file. The scan is trivial (string matching on code-block lines), but the RFC should note the performance cost is negligible (same order as SKILL-11).

- **G5: Migration path for existing forge.yaml files.** The Risks section mentions "Existing forge.yaml files may need to add semantic keys — forge doctor reports this as a defaultable-binding-null notice." But the RFC doesn't describe what happens when a skill references `ref(bindings.commands.validate)` and the binding is `null` (not configured). The degradation contract applies (optional absent → step skipped), but the RFC should explicitly state this.

## Questions for the author

1. Does SKILL-18 check code-block lines (same as SKILL-11's `extractInstructionLines`) or prose lines? The RFC says "same scope as SKILL-11" but also says "code blocks remain valid" — these are contradictory and must be resolved before implementation. (C1)

2. Is the prose migration (`ref(bindings.terminology.artifact)`) blocked on RFC-0639's `resolveTerminology()` implementation? If so, should the prose migration be split into a follow-up RFC to keep this RFC focused on the binding-key migration? (C2, E1, G2)

3. Why have both a `SKILL_18_EXEMPT` hardcoded set AND a `<!-- skill-lint-disable SKILL-18 -->` escape hatch? The escape hatch alone avoids coupling the validator to specific skill names. (F1)
