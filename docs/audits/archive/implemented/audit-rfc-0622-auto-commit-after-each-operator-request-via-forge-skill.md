---
rfcId: RFC-0622
auditId: AUDIT-RFC-0622-01
date: 2026-07-31
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0622

## Verdict: Needs revision

Three findings: the RFC introduces the first `invocation: model` skill without explaining why `user` is insufficient, the interaction between default auto-commit and multi-step pipeline execution is ambiguous, and the rollout omits the mandatory `.agents/skills/` sync step.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0622` reports zero violations.

## Axis A — Structural completeness

No issues. All sections contain real content. Decision is present tense ("The forge skill registry gains…"). Design section appropriately replaces CLI surface / TypeScript contracts / Output format with skill-specific subsections (frontmatter, behavior, failure modes). Alternatives considered has 4 real alternatives with rejection reasons. Acceptance criteria are checkable and mapped to evidence.

## Axis B — DNA alignment

No issues. `satisfies: []` is acceptable for a `kind: policy` RFC (required only for architecture/contract). `related` lists RFC-0265, RFC-0480, RFC-0580, RFC-0581 — all real, implemented, and directly relevant to commit discipline and mission git workflow.

## Axis C — Ecosystem fit

**Finding C-1: First `invocation: model` precedent.** All 29 existing forge skills use `invocation: user`. The Zod schema (`skill-schema.ts:22`) allows `model`, but no skill has ever used it. The RFC should explicitly state that this is the first `model`-invoked skill and explain why `user` is insufficient: the skill must run autonomously after every operator request without explicit invocation, which requires `invocation: model`.

**Finding C-2: Missing `.agents/skills/` sync step in rollout.** The forge AGENTS.md states: "When editing a skill in `packages/forge/skills/`, the synced copy in `.agents/skills/` MUST also be committed in the same session — `forge.create` is not run automatically after manual edits." The rollout section (line 166) says "create the `fo-step-commit` skill in `packages/forge/skills/fo/fo-step-commit/SKILL.md`" but does not mention syncing to `.agents/skills/fo/fo-step-commit/SKILL.md` or running `forge.create` to sync.

## Axis D — Forward-only compliance

No issues. No backward compatibility layers, no deprecation, no legacy paths.

## Axis E — Agent-facing policy

**Finding E-1: Ambiguity with pipeline execution.** The RFC says the skill runs "after every operator request" (line 140) and also "Called by other skills: fo-idea-implement, fo-fix, fo-review, and other skills MAY invoke this skill for intermediate commits during multi-step pipelines" (line 141). During a multi-step pipeline (e.g. `fo-idea-implement` running steps 3.1–3.8), it is unclear whether the default "after every request" behavior also fires, or only the parent skill's explicit invocations. The skill instruction must clarify: during pipeline execution, only the parent skill's explicit invocations fire — the default behavior applies only to standalone operator requests not already inside a skill pipeline.

## Axis F — Pragmatism

No issues. The skill is minimal (one `SKILL.md` file, no TypeScript code, no CLI command). `nonGoals` are explicit and meaningful. `packagesImpacted: [forge]` is correct and scoped.

## Axis G — Blind spots

No issues. Edge cases are covered: no changes (skip), workpiece not found (skip), `mission.git.commit` failure (non-fatal, report to operator). Concurrent agent scenario is addressed by the "stage only your files" rule. Performance impact of `git status --short` + `git commit` per request is trivial.

## Questions for the author

1. Why is `invocation: model` necessary instead of `invocation: user`? What specific behavior requires autonomous invocation that `user` cannot provide?
2. During a multi-step pipeline (e.g. `fo-idea-implement`), should the default auto-commit fire after each sub-step, or should it be suppressed until the pipeline completes?
3. How does the skill get synced to `.agents/skills/` — is `forge.create` run manually, or does the implementation commit include both `packages/forge/skills/` and `.agents/skills/` copies?
