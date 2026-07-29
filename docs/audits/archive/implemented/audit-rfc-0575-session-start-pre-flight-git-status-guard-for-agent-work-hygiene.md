---
rfcId: RFC-0575
auditId: AUDIT-RFC-0575-01
date: 2026-07-28
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0575

## Verdict: Needs revision

Four minor findings: incorrect `packagesImpacted`, empty `nonGoals`, singular "the mission workpiece directory" should be plural, and `versionBump` should be `none` (prose-only). The RFC's core concept — a soft guard pre-flight check — is sound, well-scoped, and correctly targets the two highest-risk skills.

## Mechanical validation (rfc.validate)

Pass — zero RFC-0575-specific violations.

## Axis A — Structural completeness

No issues. All sections contain real content. Decision is present tense ("Agents MUST perform a pre-flight..."). Design section appropriately replaces CLI surface / TypeScript contracts / Output format with policy-specific subsections (pre-flight procedure, agent obligations, AGENTS.md rule placement, fo-skill modifications, failure modes). Alternatives section has 5 real alternatives with rejection reasons. Risks has 4 risks with mitigations. Acceptance criteria are checkable and sufficient.

## Axis B — DNA alignment

No issues. `satisfies: []` is correct for a policy RFC — no DNA invariant is created or modified. `related: [RFC-0265, RFC-0476, RFC-0480]` are all real and relevant: RFC-0480 establishes commit discipline (this RFC extends it), RFC-0476 governs RFC implementation transitions (this RFC reduces RFC-IMP-04 occurrences), RFC-0265 governs commit messages (pre-flight prevents contamination).

## Axis C — Ecosystem fit

**Finding C-1: `packagesImpacted` is incorrect.** The RFC lists `["@warpgogol/forge"]` in frontmatter, but the RFC modifies `.agents/skills/fo-idea-implement/SKILL.md`, `.agents/skills/fo-fix/SKILL.md`, and `AGENTS.md` — none of which are in `packages/forge/`. The `.agents/skills/` directory is not part of any npm package. `packagesImpacted` should be `[]` (empty).

## Axis D — Forward-only compliance

No issues. No compatibility shim, no dual-path, no legacy maintained. The rule is additive — it adds a pre-flight check without preserving any "old way" of skipping it.

## Axis E — Agent-facing policy

No issues. No self-authorizing language ("may proceed while draft"). Implementation notes reference correct governance rules (RFC-0224 for accepted→implemented, RFC-0334 for supersede escalation). No storage policy or PII concerns. The RFC correctly states agents MAY implement only when status is `accepted` or `implemented`.

## Axis F — Pragmatism

**Finding F-1: `nonGoals` is empty.** The RFC would benefit from explicit non-goals to prevent scope creep: "No new Site OS command", "No new DNA invariant", "No automated validator or tooling-level enforcement — the guard is agent-discipline-based". The Alternatives section covers what was rejected, but `nonGoals` in frontmatter should be populated.

**Finding F-2: `versionBump: patch` should be `none`.** The RFC is prose-only — it modifies only `.md` files (`AGENTS.md`, `SKILL.md`). No code, types, APIs, or generated artifacts change. The template comment says `none (prose-only)` for this case.

## Axis G — Blind spots

**Finding G-1: Singular "the mission workpiece directory" should be plural.** The pre-flight procedure (§Design → Pre-flight check procedure, step 2) says "run `git status --short` in the mission workpiece directory (`missions/<missionId>/workpiece/`)." But `systems/registry.yaml` can have multiple Sternsystems, each with its own `currentMission`. The procedure should say "each active mission workpiece directory" and iterate over all `currentMission` entries.

No other blind spots. Edge cases (missing workpiece, file conflict, no foreign changes) are covered in Failure modes. Performance is N/A (no build-time command). Security/privacy is N/A.

## Questions for the author

1. Should `packagesImpacted` be empty `[]` since the RFC modifies `.agents/skills/` and `AGENTS.md`, not any `packages/*` workspace?
2. Should `versionBump` be `none` (prose-only) rather than `patch`, given that no code or types change?
3. Should the pre-flight procedure iterate over all `currentMission` entries in `systems/registry.yaml`, not just one?
