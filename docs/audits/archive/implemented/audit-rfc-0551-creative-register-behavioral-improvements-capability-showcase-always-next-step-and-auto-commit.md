---
rfcId: RFC-0551
auditId: AUDIT-RFC-0551-01
date: 2026-07-27
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0551

## Verdict: Needs revision

The RFC addresses three real behavioral gaps in the creative register, but contains a factual error in its file system responsibilities (references a non-existent `behavioral-layer.ts` file), and the auto-commit policy does not address interactions with existing commit discipline rules (separate implementation/stamp commits, mission git workflow, verify-before-commit). The always-next-step policy overlaps with RFC-0549's existing "anticipatory suggestions" without acknowledging the relationship.

## Mechanical validation (rfc.validate)

Pass — 3 V-19 warnings (amendedBy backreferences missing on RFC-0547/0548/0549). Expected for a draft amending RFC; backreferences are added when this RFC is accepted.

## Axis A — Structural completeness

- **Decision** is present tense and concrete — three distinct behavioral changes. Pass.
- **File system responsibilities** table lists `packages/forge/src/onboarding/behavioral-layer.ts` — **this file does not exist**. The core behavioral layer is generated inline by the `generateBehavioralLayer()` function in `agents-generate.ts` (lines 71–276). There is no separate `behavioral-layer.ts` file. The RFC's Design §3 and the file system table are factually wrong about where the core behavioral layer lives. **Fail.**
- **Failure modes** covers register switching, auto-commit failure, and no-next-step edge cases. Pass.
- **Rollout** describes default behavior and existing-project path. Pass.
- **Alternatives considered** — three honest alternatives with rejection reasons. Pass.
- **Risks** includes agent misinterpretation and auto-commit of unwanted changes. Pass.
- **Acceptance criteria** — 8 items, all checkable. However, criteria 5 and 6 ("In creative register, the agent auto-commits without asking" / "In business register, the agent asks before committing") describe runtime agent behavior, not statically verifiable file content. The criteria should be reframed as "the generated AGENTS.md includes a register-conditional commit policy stating that in creative register the agent auto-commits without asking, and in business register the agent asks before committing." **Minor.**
- **Implementation notes** reference RFC-0224, RFC-0334. Pass.

## Axis B — DNA alignment

- **DNA-54 (Forge bindings contract)** — listed in `satisfies[]`. DNA-54 requires that canonical forge skill bodies must not contain hardcoded project-specific literals. The RFC adds capability showcase text to the SKILL.md and policy text to behavioral layer files. The capability text ("Describe an idea and watch it come to life…") is generic Forge capability description, not project-specific literals — so it does not violate DNA-54. However, the RFC does not *enforce, protect, or extend* DNA-54; it operates within its constraints. The `satisfies: [DNA-54]` entry is decorative rather than substantive — the RFC amends RFCs that satisfy DNA-54, but does not itself change the bindings contract. **Minor.**
- No conflicts with other DNA invariants.

## Axis C — Ecosystem fit

- **Package boundaries** — all changes are within `packages/forge`. Pass.
- **AGENTS.md updates** — the RFC changes behavioral layer content generated into `AGENTS.md` by `forge.agents.generate`. The RFC does not mention that `packages/forge/AGENTS.md` may need updating to document the new behavioral policies. **Minor.**
- **Command lifecycle** — `commands.proposed/added/changed/removed` all empty. Correct — no new commands. Pass.
- **Compass sync** — no `docs/*.xml` changes needed. Pass.

## Axis D — Forward-only compliance

- No backward compatibility layers, no shims, no dual-paths. The RFC amends three implemented RFCs directly. Pass.
- The auto-commit policy replaces the implicit "ask before committing" behavior in creative register — this is a direct change, not a parallel path. Pass.

## Axis E — Agent-facing policy

- **Status gate** — the RFC is `draft` and does not contain self-authorizing language. Pass.
- **Anti-fabrication** — the capability showcase text is prose authored in the RFC, not content requiring human authoring. The acceptance criteria distinguish between code changes (SKILL.md, behavioral layer files) and runtime behavior. Pass.
- **Auto-commit and existing commit discipline** — the PREFERENCES.md and system memories establish a strict commit discipline: "edit → verify → commit → respond", separate implementation and stamp commits, `mission.git.commit` for mission workpieces. The RFC's auto-commit policy says "the agent commits all changes automatically after each completed action" but does not address:
  - How auto-commit interacts with the requirement for separate implementation commit and RFC stamp commit (PREFERENCES.md §RFC implementation completion rules).
  - How auto-commit interacts with mission workpiece commits (which must use `mission.git.commit`, not direct `git commit`).
  - Whether "after each completed action" means after each file edit, after each logical step, or after each task — the granularity is unspecified.
  - How the verify-before-commit step applies in creative register (does the agent still typecheck before auto-committing?).
  **Fail** — the auto-commit policy is under-specified relative to existing commit discipline.

## Axis F — Pragmatism

- **Minimal command surface** — no new commands. Pass.
- **Lean contracts** — no TypeScript types proposed. Pass.
- **Existing patterns** — the RFC extends existing files (SKILL.md, extended-behavioral-layer.ts) rather than creating new ones. But it invents a non-existent file (`behavioral-layer.ts`) in its file system table. **Fail** (see Axis A).
- **Scope discipline** — `packagesImpacted: [forge]` is correct. `nonGoals` are meaningful. Pass.

## Axis G — Blind spots

- **Always-next-step vs anticipatory suggestions** — RFC-0549's "Creative partnership" section already includes "Offer one anticipatory suggestion after completing a task" (at most one per session). The RFC's always-next-step policy is much stronger ("MUST always propose a concrete next step after any pause point"). The RFC does not acknowledge the existing anticipatory suggestions policy or explain whether always-next-step replaces, extends, or supersedes it. If both policies exist, the agent receives conflicting instructions: "at most one per session" vs "always after any pause point". **Fail.**
- **Auto-commit and undo/rollback** — the core behavioral layer's "Safety net" section says "the agent offers undo or rollback for significant changes." Auto-commit makes undo harder — a committed change requires `git reset` or `git revert`, while an uncommitted change is trivially undone. The RFC's Risks section mentions `git reset` as mitigation, but does not address how auto-commit changes the undo/rollback UX. **Minor.**
- **Auto-commit and companion mode** — RFC-0549's companion mode is "pure creative exploration without code changes." Auto-commit should not fire in companion mode (no changes to commit). The RFC does not address this edge case. **Minor.**
- **Capability showcase maintenance** — the Risks section mentions staleness if Forge gains new capabilities, but the mitigation ("updated with each Forge release") is vague. No mechanism ensures the capability list stays current. **Minor.**
- **Performance** — no build-time commands proposed. Pass.
- **False positives** — no validators proposed. Pass.

## Questions for the author

1. The file system responsibilities table lists `packages/forge/src/onboarding/behavioral-layer.ts` as the file to modify for the core behavioral layer commit policy. This file does not exist — the core behavioral layer is generated inline by `generateBehavioralLayer()` in `agents-generate.ts`. Should the RFC (a) correct the path to `agents-generate.ts`, or (b) propose extracting the core behavioral layer into a new `behavioral-layer.ts` file (matching the `extended-behavioral-layer.ts` pattern)?

2. The auto-commit policy says "the agent commits all changes automatically after each completed action." How does this interact with the existing commit discipline that requires (a) separate implementation commit and RFC stamp commit, (b) `mission.git.commit` for mission workpieces instead of direct `git commit`, and (c) verify (typecheck/build) before commit? Does auto-commit skip verification? Does it apply to mission workpieces?

3. RFC-0549's "Creative partnership" section already includes "Offer one anticipatory suggestion after completing a task" (at most one per session). The always-next-step policy says "MUST always propose a concrete next step after any pause point." These are conflicting instructions ("at most one per session" vs "always"). Does always-next-step replace anticipatory suggestions, or are they intended to coexist? If coexist, how does the agent resolve the conflict?
