---
id: RFC-0692
title: "Editframe composition skill pack: ef-composition-review and ef-render-verify"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-05
updatedAt: 2026-08-05
enhancedAt: 2026-08-05
implementedAt: 2026-08-05
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-54
  - RFC-0641
  - RFC-0642
  - RFC-0674
  - RFC-0677
  - RFC-0678
  - RFC-0691
satisfies:
  - DNA-54
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/forge
successSignals:
  - "`ef-composition-review` skill exists in `packages/forge/skills/ef-composition-review/SKILL.md`"
  - "`ef-render-verify` skill exists in `packages/forge/skills/ef-render-verify/SKILL.md`"
  - "`forge.skill.validate` passes on both skills"
  - "`forge.skill.list` includes both skills"
  - "`forge.create` with `editframe-html` profile syncs both skills to `.agents/skills/`"
  - "Composition AGENTS.md template references time model concepts and both skills"
nonGoals:
  - "Do not create skills under a project-specific skill pack prefix — these are forge-level skills for the editframe-html profile"
  - "Do not implement Editframe CLI functionality — skills guide the agent, the CLI does the work"
  - "Do not add new forge commands — skills use existing `forge.validate`, `forge.build`, `forge.determinism.check`"
  - "Do not modify the invariant engine or profile schema — that is RFC-0691"
  - "Do not add profile-annotation to `forge.skill.list` output — skills appear in the flat list without profile binding; profile association is declared in the profile YAML, not in the skill list command"
  - "Do not establish a new DNA invariant — DNA-54 is referenced in `satisfies[]` as compliance, not as a new invariant established by this RFC"
---

# RFC-0692: Editframe composition skill pack: ef-composition-review and ef-render-verify

## Context

RFC-0641 declared two Editframe-specific skills — `ef-composition-review` and `ef-render-verify` — in the `editframe-html` profile's `workspaceTypes[].skills` array. The profile references them:

```yaml
workspaceTypes:
  - id: composition
    skills:
      - ef-composition-review
      - ef-render-verify
```

RFC-0641 explicitly stated: "Do not create Editframe-specific skills in this RFC — that is RFC-0642." However, RFC-0642 became a domain-neutral skill language audit (SKILL-18) and did not create new skills. This left a gap: the profile references skills that don't exist.

## Problem

An operator creating an Editframe project with `forge create --profile editframe-html` gets a project where:

1. **`forge.doctor` reports missing skills**: The profile declares `ef-composition-review` and `ef-render-verify` as associated skills, but they don't exist in `packages/forge/skills/`. `forge.doctor` may report drift or missing skill files.
2. **No composition review guidance**: The agent operating on an Editframe project has no skill to guide it through reviewing a composition for time model correctness, accessibility, and best practices.
3. **No render verification guidance**: The agent has no skill to guide it through verifying a render — checking determinism, comparing output hashes, validating the MP4 file.
4. **Template is minimal**: The `composition-agents.md` template mentions the skills by name but doesn't explain the time model concepts or how to use the skills.

## Decision

Two new skills are created in `packages/forge/skills/`:

1. **`ef-composition-review`** — a `read-only` skill that guides the agent through reviewing an Editframe HTML composition for time model correctness, accessibility, asset references, and best practices.

2. **`ef-render-verify`** — a `read-only` skill that guides the agent through verifying an Editframe render: running `forge.validate`, `forge.build`, `forge.determinism.check`, and inspecting the output MP4.

The `composition-agents.md` template is enriched with time model concepts and skill usage guidance.

## Architectural fit

- **DNA-54 (Forge bindings contract)**: Skills do not contain hardcoded project-specific literals in instruction lines. They reference forge CLI commands (`forge validate`, `forge build`, `forge determinism check`) directly — these are forge-level commands, not project-specific literals. SKILL-18 compliance: skills do not reference software-specific binding keys (`typecheck`, `scopedBuild`, `test`); they use forge CLI commands which are domain-neutral.
- **RFC-0641 (editframe profile)**: The profile already declares these skills in `workspaceTypes[].skills`. This RFC creates them.
- **RFC-0642 (skill language audit)**: Skills use domain-neutral language per SKILL-18 — no software-specific binding keys are referenced.
- **RFC-0674 (lifecycle commands)**: Skills reference `forge.validate`, `forge.build`, `forge.determinism.check` — all profile-driven commands.
- **RFC-0677 (artifact validation)**: `ef-render-verify` uses `forge.validate` which is profile-driven.
- **RFC-0678 (determinism verification)**: `ef-render-verify` uses `forge.determinism.check` for reproducible render verification.
- **RFC-0691 (time model invariants)**: `ef-composition-review` references the VIDEO-* invariants as part of the review checklist.

## Design

### Skill: ef-composition-review

```yaml
# packages/forge/skills/ef-composition-review/SKILL.md
---
name: ef-composition-review
description: Review an Editframe HTML composition for time model correctness, accessibility, and best practices
category: review
concerns: read-only
dependsOn: []
---
```

The skill guides the agent through:

1. **Time model review**: Check that the root `ef-timegroup` declares `duration` or uses `mode="contain"`/`mode="fit"`. Check that all `duration` and `offset` values are valid CSS time strings. Check that `mode` values are valid (`sequence`, `fixed`, `contain`, `fit`). Check that `fps` is a positive integer. Check that `loop` is only on the root timegroup.
2. **Accessibility review**: Check that all `ef-audio` elements with speech have corresponding `ef-captions` elements. Check that `ef-text` elements have sufficient contrast (foreground vs background).
3. **Asset reference review**: Check that all `src` attributes in `ef-video`, `ef-audio`, `ef-image` elements point to files that exist in the `assets/` directory. Check that asset filenames use kebab-case.
4. **Invariant check**: Run `forge doctor` to check all VIDEO-* invariants automatically. This covers VIDEO-01 (kebab-case filenames), VIDEO-02 (contain/fit mode), VIDEO-03 (captions), and VIDEO-04..09 (time model invariants from RFC-0691, when implemented).
5. **Manual best practices**: Review aspects not covered by automated invariants — e.g. scene composition quality, narrative pacing, visual hierarchy. Do not duplicate checks that `forge doctor` already performs.
6. **Empty state**: If no compositions are found in `compositions/`, report "No compositions found — nothing to review" and stop. Do not report false positives on an empty project.

### Skill: ef-render-verify

```yaml
# packages/forge/skills/ef-render-verify/SKILL.md
---
name: ef-render-verify
description: Verify an Editframe render — validate, build, check determinism, inspect output
category: verify
concerns: read-only
dependsOn: []
---
```

The skill guides the agent through:

1. **Pre-render validation**: Run `forge validate` to check the composition with `editframe check`.
2. **Render**: Run `forge build` to produce the MP4 output.
3. **Determinism check**: Run `forge determinism check` to verify the render is reproducible (two builds produce identical output).
4. **Output inspection**: Check that the output MP4 file exists at the expected path (`dist/{composition}.mp4`). Check that the file size is non-zero. Check that the duration matches the root timegroup's `duration` attribute.
5. **Report**: Summarize the verification results — pass/fail for each step, with details on any failures.

### Template enrichment: composition-agents.md

The `composition-agents.md` template is enriched with:

- **Time model concepts**: Brief explanation of `ef-timegroup`, modes, duration, offset, fps, loop.
- **Invariant reference**: List of VIDEO-01 through VIDEO-03 invariants (always present). VIDEO-04 through VIDEO-09 are included only after RFC-0691 is implemented — the template uses conditional sections or a note pointing to `forge doctor` for the full invariant list.
- **Skill usage**: How to invoke `ef-composition-review` and `ef-render-verify`.
- **Workflow**: The typical development workflow — create composition, preview, review, render, verify.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/skills/ef-composition-review/SKILL.md` | New — skill definition |
| `packages/forge/skills/ef-render-verify/SKILL.md` | New — skill definition |
| `packages/forge/profiles/editframe-html-templates/composition-agents.md` | Extended — time model concepts, invariant reference, skill usage |
| `packages/forge/src/tests/skill-validate.test.ts` | Extended — tests for both new skills |

### Output format

`forge.skill.validate --json` returns `{ violations: [], warnings: [] }` — both skills must produce zero violations. `forge.skill.list --json` returns `{ skills: [{ name, category, concerns, pack? }] }` — both skills appear with `name: "ef-composition-review"` and `name: "ef-render-verify"`, no `pack` field (forge-level skills).

### Failure modes

- **Skills not synced**: If `forge.create` or `forge.upgrade` is not run after adding the skills, `.agents/skills/` will be stale. Mitigation: `forge.doctor` detects stale skill copies.
- **Skill validation failure**: If the skills don't pass `forge.skill.validate` (SKILL-01..21), they won't be accepted. Mitigation: skills are validated during implementation.
- **Template rendering issues**: The enriched template must not break `forge.agents.generate`. Mitigation: template uses standard markdown.

## Rollout

- **Skill creation**: Both skills are created in `packages/forge/skills/`. `forge.create` and `forge.upgrade` sync them to `.agents/skills/`. This step does not depend on RFC-0691.
- **Template update**: The `composition-agents.md` template is enriched. New Editframe projects get the enriched template. Existing projects get it on `forge.upgrade`. The template enrichment with VIDEO-04..09 invariants is contingent on RFC-0691 being implemented — if RFC-0691 is not yet implemented, the template references only VIDEO-01..03 and notes that `forge doctor` checks the full invariant set.
- **Coordination with RFC-0691**: Both RFCs modify `composition-agents.md` — RFC-0691 adds VIDEO-04..09 to the profile YAML, RFC-0692 enriches the template that references them. If both are implemented in the same session, apply RFC-0691 changes first (profile YAML + invariant engine), then RFC-0692 changes (skills + template enrichment).
- **No migration**: existing projects are unaffected. The skills and template are additive.
- **Integration**: `forge.skill.list` includes the new skills. `forge.doctor` checks for their presence.

## Alternatives considered

- **Project-specific skill pack (RFC-0539)**: Rejected — these skills are forge-level, not project-specific. They are referenced by the `editframe-html` profile which ships with forge. A project-specific skill pack would require each Editframe project to declare the pack in `forge.yaml`.
- **Single combined skill**: Rejected — composition review and render verification are distinct activities with different triggers. Combining them would make the skill too large and reduce clarity.
- **Delegate to existing fo-skills**: Rejected — `fo-review` and `fo-fix` are generic. Editframe-specific skills provide domain-specific guidance that generic skills can't.

## Risks

- **Skill drift**: If the skills are updated in `packages/forge/skills/` but not synced to `.agents/skills/`, `forge.doctor` reports drift. Mitigation: `forge.upgrade` syncs skills; `forge.doctor` detects drift.
- **Template bloat**: The enriched `composition-agents.md` template may be too long. Mitigation: keep it concise — time model concepts in a few bullet points, invariant reference as a table, skill usage as a short list.
- **Skill naming conflict**: If a project declares a skill pack with skills named `ef-composition-review` or `ef-render-verify`, `forge.create` skips the conflicting pack skills (RFC-0552). Mitigation: the `ef-` prefix is forge-level; project packs should use their own prefix.

## Acceptance criteria

- [x] `packages/forge/skills/ef-composition-review/SKILL.md` exists with valid frontmatter (evidence: `packages/forge/skills/fo/ef-composition-review/SKILL.md` created, passes `forge.skill.validate`)
- [x] `packages/forge/skills/ef-render-verify/SKILL.md` exists with valid frontmatter (evidence: `packages/forge/skills/fo/ef-render-verify/SKILL.md` created, passes `forge.skill.validate`)
- [x] `forge.skill.validate` passes on both skills (evidence: zero violations for both skills in validation run)
- [x] `forge.skill.list` includes both skills (evidence: both skills appear in `forge.skill.list` output)
- [x] `composition-agents.md` template includes time model concepts, invariant reference, and skill usage (evidence: template enriched with Time model concepts, Quality invariants table, Skill usage, and updated Workflow sections)
- [x] Unit test verifies both skills pass `validateSkill` schema validation (evidence: 4 tests added in `packages/forge/src/tests/skill-validate.test.ts`, all pass)
- [x] `packages/forge/AGENTS.md` updated with new skill count (evidence: updated from 33 to 35 skills, 26 to 28 fo skills)
- [x] `rfc.validate` passes on this file before merging (evidence: `rfc.validate --id RFC-0692` returns ok: true)

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
-->
