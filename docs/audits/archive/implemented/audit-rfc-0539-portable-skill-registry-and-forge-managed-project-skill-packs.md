---
rfcId: RFC-0539
auditId: AUDIT-RFC-0539-01
date: 2026-07-26
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: approved
---

# Audit: RFC-0539

## Verdict: Approved

The RFC is architecturally sound, forward-only, and pragmatic. It cleanly separates portable from ecosystem-bound skills, extends existing commands rather than proposing new ones, and explicitly forbids aliases. Two minor findings on DNA-54 fit and Compass/AGENTS.md sync scope do not block acceptance.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

No issues. All sections contain real content:

- **Decision** is a single present-tense statement ("`FORGE_SKILLS` becomes a purely portable registry…").
- **CLI surface** documents exact command behavior changes in a table.
- **TypeScript contracts** are minimal (`ForgeSkillPack` with two fields, `ForgeConfig` extension).
- **File system responsibilities** names concrete paths.
- **Output format** shows `--json` violation shape.
- **Failure modes** specifies exit 1 and opt-in behavior for absent `skillPacks`.
- **Rollout** is a 5-step plan with default behavior for external consumers.
- **Alternatives** lists 3 real alternatives with rejection reasons.
- **Risks** includes agent misinterpretation risk and prefix squatting.
- **Acceptance criteria** are 9 checkable items.
- **Implementation notes** are explicit behavioral rules (MUST NOT re-add sync script, MUST update all references).

Minor: risks section does not estimate false-positive rate for SKILL-14/15 validators. Low impact — prefix matching is deterministic, not heuristic.

## Axis B — DNA alignment

Minor finding: `satisfies: [DNA-54]` is a loose fit. DNA-54 states "Canonical forge skill bodies must not contain hardcoded project-specific literals in instruction lines. Project-specific values are declared in the `bindings` section of `forge.yaml`." The RFC extends `forge.yaml` with a `skillPacks` section, which is a configuration extension adjacent to DNA-54 but not directly about de-hardcoding literals from skill bodies. The RFC's framing ("skill packs are the skill-level analogue of bindings") is defensible but the connection is analogical, not literal. Consider whether a new DNA invariant for "portability boundary" would be more precise, or strengthen the body's explanation of how `skillPacks` enforces DNA-54's de-hardcoding philosophy.

No conflict with any existing DNA invariant. No new DNA invariant is established by this RFC.

## Axis C — Ecosystem fit

- **Package boundaries**: `packages/wgogol-skills/` is the correct home for ecosystem-bound skills. No cross-package import violations proposed. ✓
- **Pipeline placement**: No new pipeline checks proposed — existing commands are extended. ✓
- **Compass sync**: The RFC does not identify which `docs/*.xml` files need synchronization. Since it changes forge's configuration contract (`forge.yaml` schema) and package relationships, `docs/technology.xml` and `docs/development-plan.xml` may need updates. Minor finding.
- **AGENTS.md updates**: The RFC mentions updating `packages/forge/AGENTS.md` and ADR-0003 (acceptance criterion 8). It does not mention `packages/AGENTS.md` (the shared packages guide), which lists `wgogol-skills` in its ownership table and would need the prefix/validation changes reflected. Minor finding.
- **Command lifecycle**: `commands.changed` lists 4 existing commands. No new commands proposed. Internally consistent. ✓

## Axis D — Forward-only compliance

No issues. Renames are forward-only with no aliases (explicitly in `nonGoals` and implementation notes). Old directories are deleted. The `wgogol-skills` sync script is removed, not maintained alongside `forge.init`. No compatibility shims proposed.

## Axis E — Agent-facing policy

No issues. Status gate is correct: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Implementation notes reference RFC-0334 (supersede escalation). No self-authorizing language. No content authoring claims. No persistence changes.

## Axis F — Pragmatism

No issues. No new commands proposed — all 4 changed commands are existing extensions. `ForgeSkillPack` type is minimal (2 fields). `nonGoals` are meaningful (no npm publication of packs, no marketplace, no aliases). `packagesImpacted` lists only `forge` and `wgogol-skills` — correct scope.

## Axis G — Blind spots

- **Performance**: `forge.skill.validate` will scan pack skill directories in addition to forge skills. Cost is low (project-local, small count) but not mentioned. Minor.
- **Edge cases**: `skillPacks` absent → all commands behave as today (opt-in). ✓ New projects get default behavior. ✓
- **Migration path**: External consumers unaffected until they opt in. ✓ This monorepo's 5-step rollout is documented. ✓
- **Security/privacy**: N/A — no user data touched.

## Questions for the author

1. Should `packages/AGENTS.md` (shared packages guide) be updated to reflect the `wg-` prefix requirement and `forge.skill.validate` coverage extension? Its ownership table currently describes `wgogol-skills` without mentioning prefix rules or validation.
2. Which `docs/*.xml` Compass files need synchronization when `forge.yaml`'s schema gains `skillPacks`? `docs/technology.xml` tracks the forge configuration contract.
3. SKILL-15 says "no skill outside forge may use the `fo-` prefix" — does `forge.skill.validate` scan only declared pack directories, or also scan `.agents/skills/` for undeclared skills with `fo-` prefix? The scan scope determines whether a stray copy survives validation.
