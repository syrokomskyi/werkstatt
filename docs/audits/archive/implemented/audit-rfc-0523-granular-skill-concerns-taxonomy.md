---
rfcId: RFC-0523
auditId: AUDIT-RFC-0523-01
date: 2026-07-25
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
rfcPath: docs/rfcs/rfc-0523-granular-skill-concerns-taxonomy.md
---

# Audit: RFC-0523

## Verdict: Needs revision

The RFC proposes a well-motivated four-level `concerns` taxonomy to replace the current binary system, but has a DNA alignment failure (`satisfies: DNA-54` is tenuous), an empty `amends` field that contradicts the RFC body, two skill misclassifications in the rollout table, and a critical blind spot around SKILL-10 interaction. The core design is sound; the findings are fixable without changing the architectural approach.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **`amends` field is empty but RFC body claims amendment.** The frontmatter has `amends: []` (line 22), yet the RFC body states "This RFC amends the `ForgeSkillEntry` interface from RFC-0374" (line 224) and "This RFC amends the `ForgeSkillEntry` interface established by RFC-0374" (line 97). The `amends` field must contain `RFC-0374`. This is also a mechanical concern — `rfc.validate` may not catch it, but the referential integrity is broken.

- **File path error in File system responsibilities.** The RFC references `packages/forge/src/validators/skill-validator.ts` (line 143). The actual file is `packages/forge/src/validators/skill-validate.ts`. The validator module is named `skill-validate.ts`, not `skill-validator.ts`.

- **`skill-schema.ts` missing from File system responsibilities.** The Zod schema in `packages/forge/src/skill-schema.ts` (line 21: `concerns: z.enum(["document-only", "implementation"])`) must also be updated. This file is not listed in the File system responsibilities table. The RFC only mentions `registry.ts` and the (incorrectly named) validator file.

- **Skill count discrepancy.** The RFC says "all 28+ skills reclassified" (line 140) and "~28 skills" (line 164). The actual registry (`packages/forge/src/registry.ts`) contains 30 entries (23 fo + 4 shared + 3 meta). The reclassification table correctly lists 30 skills, but the prose undercounts.

- **Decision, CLI surface, TypeScript contracts, Output format, Failure modes, Rollout, Alternatives, Risks, Acceptance criteria, Implementation notes** — all present with real content. No template placeholders.

## Axis B — DNA alignment

- **`satisfies: DNA-54` is tenuous.** DNA-54 states: "Canonical forge skill bodies must not contain hardcoded project-specific literals in instruction lines." This RFC changes the `concerns` enum taxonomy — it does not enforce, protect, or extend the hardcoded-literals invariant. The "Architectural fit" section (line 96) argues the RFC "extends the forge skill contract by making `concerns` a more precise signal," but DNA-54 is specifically about bindings/hardcoded literals (SKILL-11), not about the `concerns` field. The RFC should either: (a) remove `DNA-54` from `satisfies` and keep it only in `related`, or (b) establish a new DNA invariant for the forge skill frontmatter contract and reference that instead. As written, the `satisfies` claim does not meet the audit criterion ("explains how it enforces, protects, or extends that invariant").

- **No new DNA invariant proposed.** The RFC changes a cross-workspace contract (the `concerns` enum) enforced by `forge.skill.validate`. This could warrant a new DNA entry (e.g. "DNA-NN: Forge skill concerns taxonomy is a closed four-level enum"). The RFC does not propose one. This is acceptable — not every contract change requires a DNA invariant — but given that DNA-54 is the only forge-related invariant and it doesn't cover this, a new invariant would strengthen the governance.

## Axis C — Ecosystem fit

- **Package boundaries.** Correct — all changes are within `packages/forge`. No cross-package import issues.

- **Command lifecycle.** `commands.changed: [forge.skill.validate]` is correct — the RFC modifies an existing command's validation logic. No new commands proposed.

- **Compass sync.** The RFC does not identify which `docs/*.xml` files need synchronization. Since `forge.skill.validate` is a verification command, `docs/verification-plan.xml` may need updating to reflect the new SKILL-12 rule. Minor gap.

- **AGENTS.md updates.** The RFC correctly identifies `packages/forge/AGENTS.md` as needing update (acceptance criterion, line 233). The root `AGENTS.md` does not mention the `concerns` field specifically, so no root update is needed.

## Axis D — Forward-only compliance

No issues. The RFC is explicitly forward-only: "No grace period — all skills must be reclassified in the same commit" (line 164). No compatibility shim, no dual-path, no legacy maintenance. The binary `implementation` value is removed, not kept alongside the new values.

## Axis E — Agent-facing policy

- **Status gate.** No self-authorizing language. The RFC correctly states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" (line 238).

- **Implementation notes.** Correctly reference RFC-0224 (accepted→implemented), RFC-0334 (supersede escalation). The informational-vs-gating distinction (line 240) is well-articulated.

- **Anti-fabrication.** Not applicable — no content authoring in acceptance criteria.

- **Storage policy.** Not applicable — no persistence changes.

## Axis F — Pragmatism

- **`fo-fix` misclassified as `content-mutation`.** The reclassification table (line 189) assigns `fo-fix` to `content-mutation` with rationale "Modifies code + content, commits." But the RFC's own `content-mutation` definition says "Does not touch executable `.ts`/`.astro` code" (line 108). `fo-fix` applies review findings to source code, runs `tsc --noEmit` typecheck, and modifies `.ts` files. It should be `code-mutation`, not `content-mutation`.

- **`fo-idea-implement` misclassified as `content-mutation`.** Same issue (line 182). `fo-idea-implement` implements RFCs end-to-end, including modifying `.ts`/`.astro` code, running `build:check`, and running `fo-review` on code changes. It should be `code-mutation`.

- **Minimal command surface.** No new commands — correct. The RFC extends an existing validator.

- **Lean contracts.** The four-level enum is minimal and well-justified. No speculative generality.

## Axis G — Blind spots

- **SKILL-10 interaction not addressed.** The current validator (`packages/forge/src/validators/skill-validate.ts:142`) checks `if (parsed.data.concerns === "document-only")` and rejects code execution instructions (SKILL-10). With the new four-level taxonomy, `read-only` skills should also be barred from containing code execution instructions (they don't modify any files). The RFC does not mention SKILL-10 at all — it only proposes SKILL-12. The implementation must update SKILL-10 to check `read-only` and `document-only` (not just `document-only`), or explain why `read-only` skills may contain execution instructions. This is a critical blind spot because leaving SKILL-10 unchanged would only check `document-only`, missing the new `read-only` category.

- **`skill-schema.ts` Zod schema update not in scope.** The Zod schema at `packages/forge/src/skill-schema.ts:21` defines `concerns: z.enum(["document-only", "implementation"])`. This must be updated to the four-level enum. The RFC's File system responsibilities table does not list this file. If the Zod schema is not updated, `forge.skill.validate` will reject all skills with the new `concerns` values at the schema parse level (SKILL-01), before SKILL-12 is even reached.

- **Performance.** `forge.skill.validate` scans ~30 SKILL.md files with regex — negligible cost. No issue.

- **False positives.** The RFC does not estimate false-positive rate for SKILL-12, but since the enum is closed and all skills are under forge control, false positives are unlikely. Acceptable.

- **Edge cases.** The RFC considers empty states (new skills default to `document-only` via `forge.port.scaffold`). Concurrent execution is not a concern (file-based validation). Acceptable.

## Questions for the author

1. Why does `satisfies` list `DNA-54` when DNA-54 is about hardcoded literals in skill bodies, not about the `concerns` taxonomy? Should this be moved to `related` only, or should a new DNA invariant be established for the forge skill frontmatter contract?

2. How should SKILL-10 be updated for the new taxonomy? Currently it only blocks code execution in `document-only` skills — should `read-only` skills also be blocked from containing execution instructions?

3. Should `fo-fix` and `fo-idea-implement` be reclassified as `code-mutation` given that they modify `.ts` source code, run typechecks, and apply review findings to executable code — directly contradicting the `content-mutation` definition "Does not touch executable `.ts`/`.astro` code"?
