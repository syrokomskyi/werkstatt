---
reviewId: REVIEW-CODE-2026-07-31-01
date: 2026-07-31
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: a83fa65...HEAD
filesReviewed:
  - packages/forge/skills/fo/fo-step-commit/SKILL.md
  - .agents/skills/fo/fo-step-commit/SKILL.md
  - AGENTS.md
  - packages/AGENTS.md
  - packages/forge/AGENTS.md
  - docs/rfcs/rfc-0622-auto-commit-after-each-operator-request-via-forge-skill.md
---

# Code Review: a83fa65...HEAD

## Verdict: Needs revision

Two findings: the skill body uses `mission.git.commit` without binding resolution (SKILL-11), and the skill instruction lacks explicit `git diff` verification before staging (AGENTS.md commit hygiene rule).

## Mechanical floor

Pass — `pnpm --filter @warpgogol/forge run build:check` exits 0. `rfc.validate --id RFC-0622` passes. `forge.skill.validate` reports zero violations for `fo-step-commit`.

## Axis A — Structural correctness

No issues. Skill frontmatter is valid YAML with all required fields. Body is well-structured with clear sections (When this skill runs, Behavior, What this skill does NOT do, Opt-out, Failure modes). No dead code, no duplicated logic.

## Axis B — DNA alignment

No issues. No DNA invariants are directly touched by this change. The skill is a policy artifact (`kind: policy` RFC), not a code-level invariant change.

## Axis C — Ecosystem fit

**Finding C-1: `mission.git.commit` hardcoded in skill body.** The skill body (`packages/forge/skills/fo/fo-step-commit/SKILL.md:37`) says "commit there via `mission.git.commit`". SKILL-11 prohibits hardcoded `pnpm exec site-kernel run` in skill instruction lines, but `mission.git.commit` is a command name, not a CLI invocation. However, the skill should use binding resolution (`ref(forge.yaml bindings.commands...)`) for command references to remain portable across projects. The forge bindings contract (RFC-0393) requires skills to reference bindings by key. The skill should either declare a binding for the mission git commit command or use `<!-- skill-lint-disable SKILL-11 -->` if no binding exists.

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths. The old "agent does not auto-commit" rule in `AGENTS.md:219` was directly replaced with the new policy.

## Axis E — Agent-facing clarity

**Finding E-1: Missing `git diff` verification step.** The AGENTS.md commit hygiene rule (NON-NEGOTIABLE, line 74) requires: "(1) run `git diff` (not just `git diff --cached`) on every touched file before committing". The skill's Behavior section (steps 1-5) does not include a `git diff` verification before staging. The skill says "Stage only agent-changed files" but does not instruct the agent to verify the diff first. This creates a gap between the skill's behavior and the NON-NEGOTIABLE commit hygiene rule.

## Axis F — Pragmatism

No issues. The skill is minimal — one `SKILL.md` file, no TypeScript code, no CLI command. The `invocation: model` choice is justified (first skill to use it, explained in the RFC). `dependsOn: ['my-preferences']` is correct for language policy resolution.

## Axis G — Blind spots

No issues. Edge cases are covered: no changes (skip), workpiece not found (skip), workpiece commit failure (non-fatal). Concurrent agent scenario is addressed by the "stage only your files" rule.

## Spec compliance

| Requirement from RFC-0622 | Status | Evidence |
| --- | --- | --- |
| Skill file exists with correct frontmatter | Done | `packages/forge/skills/fo/fo-step-commit/SKILL.md:1-15` |
| `forge.skill.validate` passes | Done | Zero violations for `fo-step-commit` |
| `AGENTS.md` references auto-commit policy | Done | `AGENTS.md:75` |
| Skill covers monorepo + workpiece paths | Done | `SKILL.md:36-37`, steps 4-5 |
| Skill forbids `git add -A` / `git add .` | Done | `SKILL.md:34`, step 2 |
| `rfc.validate` passes | Done | `"ok": true` |

## Questions for the author

1. Should the skill use a binding reference for `mission.git.commit` instead of hardcoding the command name, to comply with the forge bindings contract (RFC-0393)?
2. Should the skill's Behavior section include a `git diff` verification step before staging, to align with the NON-NEGOTIABLE commit hygiene rule in `AGENTS.md:74`?
