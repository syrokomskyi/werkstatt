---
id: RFC-0712
title: "Add multi-persona design summit skill for complex RFC review"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-06
updatedAt: 2026-08-06
enhancedAt: 2026-08-06
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0709
  - RFC-0710
  - RFC-0711
satisfies:
  - DNA-54
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/forge
successSignals:
  - "Complex RFCs receive multi-perspective review before acceptance"
  - "Design summit findings are referenced in audit reports"
  - "Operators invoke fo-design-summit for high-risk architectural RFCs"
nonGoals:
  - "Does not replace fo-review — design summit is a pre-acceptance design review, fo-review is a post-implementation code review"
  - "Does not replace fo-idea-audit — audit is automated and mandatory, summit is interactive and optional"
  - "Does not introduce multi-agent infrastructure — personas are simulated by a single agent in one session"
  - "Does not run automatically — the operator or fo-idea-plan invokes it explicitly for complex RFCs"
  - "Does not apply to ADRs — ADRs use the accepted-decision fast path and do not need summit review"
---

# RFC-0712: Add multi-persona design summit skill for complex RFC review

## Context

The `grilling` step in `fo-idea-create-rfc` is one-on-one: operator vs agent. The `fo-idea-audit` skill provides a second perspective, but it is structured as a report with seven fixed axes — not an interactive discussion. For complex architectural RFCs, a single perspective misses issues that a security reviewer, QA engineer, or product manager would catch.

BMAD-METHOD solves this with "Party Mode" — multiple agent personas (architect, developer, QA, PM) assembled in one session for collective design discussion. Independent tests rated BMAD's mid-feature correction capability 5/5 — the highest score among all three external systems. The key insight is that different roles ask different questions, and those questions surface issues that a single-perspective review cannot.

## Problem

Complex architectural RFCs (e.g., introducing a new subsystem, changing a cross-workspace contract, modifying a DNA invariant) are reviewed by:

1. **`grilling`** — stress-tests the concept, but from a single architectural perspective.
2. **`fo-idea-audit`** — seven axes (ecosystem fit, DNA alignment, forward-only, agent policy, pragmatism, etc.), but produced as a report, not a discussion.

Neither mechanism simulates the perspective of a **security engineer** (is this attack surface?), a **QA engineer** (how do we test this? what are the failure modes?), a **product manager** (does this solve the user problem? what's the rollout impact?), or a **developer advocate** (can new agents understand and follow this?).

For routine RFCs, this is fine — the audit axes are sufficient. For high-risk RFCs where the cost of error is substantial, the absence of multi-perspective review is a quality gap.

## Decision

Add a `fo-design-summit` skill that simulates a multi-persona design discussion for complex RFCs. Each persona reviews the RFC from its professional perspective and raises concerns. The operator sees all perspectives and makes the final decision.

The skill is **optional** — invoked manually by the operator or suggested by `fo-idea-plan` for RFCs that meet complexity criteria. It is not part of the default pipeline (`fo-idea-i-just-want-to-see-the-result`).

## Architectural fit

- **Forge bindings (DNA-54):** The `fo-design-summit` skill follows the Forge bindings contract — no hardcoded project literals in skill instruction lines.
- **Skill taxonomy:** `fo-design-summit` is `category: fo`, `concern: document-only` — it reads the RFC and produces a discussion report in `docs/summits/`. It does not modify the RFC or any source code.
- **Audit complement:** The summit is a pre-acceptance design review. `fo-idea-audit` remains the mandatory automated audit. The summit is an optional, interactive, multi-perspective layer on top of the audit.
- **Review pipeline:** The summit is distinct from `fo-review` (post-implementation code review) and `fo-idea-audit` (automated RFC audit). It fills the gap between audit and acceptance — a human-like design discussion.

## Design

### Skill: `fo-design-summit`

```yaml
name: fo-design-summit
description: Simulate a multi-persona design discussion for complex RFCs. Each persona reviews from its professional perspective and raises concerns. Optional, invoked for high-risk architectural RFCs.
invocation: user
category: fo
concern: document-only
dependsOn: ['fo-idea-audit']
bindings:
  requires: [paths.invariantsFile]
  optional: []
triggers: ["design summit", "multi-persona review", "party mode"]
```

### Personas

The summit simulates five personas. Each persona has a distinct review focus:

| Persona | Focus | Key questions |
| --- | --- | --- |
| **Architect** | Structural integrity, DNA alignment, coupling | Does this create hidden dependencies? Which DNA invariants are affected? Will this be reversible? |
| **Security Engineer** | Attack surface, data exposure, trust boundaries | What new trust boundaries does this create? Are there unauthenticated paths? Does this leak sensitive data? |
| **QA Engineer** | Testability, failure modes, edge cases | How do we test this? What are the failure modes? What happens under partial failure? |
| **Product Manager** | User impact, rollout risk, scope | Does this solve the stated problem? What is the rollout impact on existing users? Is the scope right? |
| **Developer Advocate** | Agent clarity, onboarding, documentation | Can a new agent understand and implement this? Is the RFC self-contained? Are there implicit assumptions? |

### Process

1. **Read the RFC** — the skill reads the target RFC file and its related context (`ref(forge.yaml bindings.paths.invariantsFile)` for DNA invariants, related RFCs, affected packages).
2. **Read the audit report** — if `fo-idea-audit` has been run, the skill reads the audit report to avoid duplicating findings.
3. **Run each persona** — for each persona, the agent: a. Adopts the persona's perspective and review focus. b. Reads the RFC from that perspective. c. Produces a persona report with findings (concerns, questions, recommendations).
4. **Synthesize** — the agent presents all persona reports in a single summit document, highlighting:
   - **Consensus findings** — concerns raised by 2+ personas (high priority).
   - **Unique findings** — concerns raised by a single persona (medium priority).
   - **No concerns** — personas that found no issues (confidence signal).
5. **Persist the summit report** — write `docs/summits/summit-<rfc-id>.md` with the full discussion.
6. **Suggest actions** — recommend whether to proceed to acceptance, revise the RFC, or run `fo-explore` for unresolved questions.

### Summit report format

```markdown
---
rfc: RFC-0711
createdAt: 2026-08-06
personas: [architect, security, qa, pm, dev-advocate]
consensusFindings: 2
uniqueFindings: 5
---

# Design Summit: RFC-0711

## Architect

### Findings
- **A1 (concern):** The living spec merge assumes heading-based matching, but RFCs may use slightly different headings for the same concept. This could cause silent content duplication.
- **A2 (question):** What happens if two RFCs with `liveSpec: nachweis` are archived in the same `docs.archive` run? Is the merge order deterministic?

### No concerns
- DNA-55 alignment is correct — living specs are internal, vendored specs are external.

## Security Engineer

### Findings
- **S1 (concern):** Living specs in `docs/specs/live/` may contain sensitive design details. Are these committed to public repos? If the Sternsystem mirror is public, living specs would be visible.
- **S2 (recommendation):** Add a `visibility: internal` field to living spec frontmatter. `sternsystem.validate` should check that internal living specs are not mirrored to external repos.

## QA Engineer

### Findings
- **Q1 (concern):** `spec.live.merge` is semi-automatic with operator confirmation, but there is no test for the merge logic itself. How do we verify that deltas are classified correctly?
- **Q2 (question):** What is the regression test for `spec.live.validate`? Do we have a fixture living spec with all V-LS-01..05 violations?

## Product Manager

### Findings
- **P1 (concern):** The `liveSpec` frontmatter field is optional, but adoption depends on authors remembering to add it. Without it, the living spec system is a no-op. Consider auto-suggesting the field in `fo-idea-create-rfc`.

## Developer Advocate

### Findings
- **D1 (question):** The RFC says "semi-automatic with operator confirmation" but does not describe the confirmation UI. Is it `ask_user_question`? A review step in `docs.archive`?
- **D2 (concern):** The delta classification heuristics are described in prose but not formalized. A new agent implementing `spec.live.merge` might interpret them differently.

## Consensus findings

- **A1 + D2 (2 personas):** Heading matching and delta classification are underspecified. Recommendation: add a formal heading-matching algorithm and delta classification rules to the RFC.
- **S1 + P1 (2 personas):** Visibility and adoption of living specs need more thought. Recommendation: add `visibility` field and auto-suggestion in `fo-idea-create-rfc`.

## Recommendation

Revise RFC-0711 to address consensus findings A1+D2 and S1+P1 before acceptance. Unique findings should be resolved during enhance or noted as open questions.
```

### File system responsibilities

| Path                              | Role                                             |
| --------------------------------- | ------------------------------------------------ |
| `docs/summits/summit-<rfc-id>.md` | Summit report (created by `fo-design-summit`)    |
| `docs/summits/`                   | Directory for all summit reports                 |
| `docs/rfcs/rfc-*.md`              | Read by the skill (target RFC)                   |
| `docs/audits/audit-*.md`          | Read by the skill (existing audit, if available) |

### Invocation criteria

`fo-design-summit` is invoked explicitly by the operator or suggested by `fo-idea-plan` when the RFC meets **any** of these criteria:

- `kind: architecture` AND `scope: workspace`
- `satisfies[]` includes 2+ DNA invariants
- The RFC introduces a new package, new command family, or new lifecycle
- The RFC supersedes an implemented RFC
- The operator explicitly requests it

`fo-idea-plan` step 5 (grill the plan) gains a sub-step:

> **5b. Summit suggestion.** If the RFC meets summit criteria, suggest using `fo-design-summit` before acceptance. Use `ask_user_question`:
>
> "This RFC is complex (architecture, workspace scope, 2+ DNA invariants). Should I run a multi-persona design summit before acceptance?"
>
> Recommended option: "Run summit" — because complex RFCs benefit from multi-perspective review.

### No new Site OS commands

Unlike RFC-0709, RFC-0710, and RFC-0711, this RFC does **not** introduce new Site OS commands. The summit is a skill-only feature — it produces a markdown report in `docs/summits/` and does not require command registration, pipeline integration, or validation rules. The summit report is an informational artifact, not a governance document.

### Failure modes

- **RFC not found:** The skill errors if the target RFC does not exist.
- **Audit not run yet:** The skill proceeds without the audit report — persona findings may overlap with future audit findings. The skill notes this in the report.
- **RFC is too small for a summit:** If the RFC body is less than 500 words, the skill warns that a summit may be overkill and proceeds only if the operator confirms.
- **Persona findings overlap:** Multiple personas may raise the same concern. The synthesis step deduplicates and marks consensus findings.

## Rollout

- **Default behavior:** `fo-design-summit` is available immediately after implementation. It is opt-in — operators request it explicitly or accept the suggestion from `fo-idea-plan`.
- **No migration:** Existing RFCs are unaffected. Summit reports are a new artifact type.
- **Pipeline integration:** None — summit reports are not part of any build or validation pipeline. They are informational artifacts for the operator.
- **Skill sync:** `fo-design-summit` is synced to `.agents/skills/` by `forge create` / `forge upgrade`, same as other fo-skills.
- **AGENTS.md update:** `packages/forge/AGENTS.md` currently states "44 skills" in the Skills section. Adding `fo-design-summit` makes it 45 — update the count during implementation.
- **fo-idea-i-just-want-to-see-the-result:** The orchestrator skill does **not** invoke `fo-design-summit` by default. It may be added as an optional step via a `summit: true` flag in the future.

## Alternatives considered

- **Real multi-agent infrastructure (separate agent processes):** Rejected — introduces significant infrastructure complexity (inter-agent communication, session management, state synchronization). Simulated personas in a single session capture 90% of the value at 10% of the complexity.
- **Add personas to fo-idea-audit:** Rejected — the audit is automated and structured with seven fixed axes. Adding persona perspectives would bloat the audit and make it less deterministic. The summit is interactive and separate.
- **Use fo-review for design review:** Rejected — `fo-review` is a post-implementation code review. The summit is a pre-acceptance design review. Different timing, different input, different output.
- **Make summit mandatory for architecture RFCs:** Rejected — adds overhead to every architecture RFC, including routine ones. The criteria-based suggestion in `fo-idea-plan` is sufficient.

## Risks

- **Persona caricature:** The agent might produce shallow persona findings instead of genuinely different perspectives. Mitigation: the skill instructions include persona-specific review checklists and example findings. The operator can reject the summit report if personas are too similar.
- **Summit report rot:** Summit reports in `docs/summits/` may become stale if the RFC is amended after the summit. Mitigation: the summit report includes the RFC status at summit time. If the RFC is amended, a new summit may be run.
- **False confidence:** A clean summit (no findings) might create false confidence. Mitigation: the summit report explicitly states "no findings does not mean no issues — it means no issues were found from these five perspectives."
- **Operator fatigue:** Running summits for every RFC would be exhausting. Mitigation: the criteria-based suggestion in `fo-idea-plan` limits suggestions to genuinely complex RFCs.

## Acceptance criteria

- [x] `fo-design-summit` skill created in `packages/forge/skills/fo/fo-design-summit/` with SKILL.md (evidence: packages/forge/skills/fo/fo-design-summit/SKILL.md:1)
- [x] `fo-design-summit` synced to `.agents/skills/fo-design-summit/SKILL.md` (evidence: .agents/skills/fo-design-summit/SKILL.md:1)
- [x] `docs/summits/` directory created with a README explaining the purpose (evidence: docs/summits/README.md:1)
- [x] Skill implements 5 personas (architect, security, QA, PM, developer advocate) with distinct review focuses (evidence: packages/forge/skills/fo/fo-design-summit/SKILL.md:68)
- [x] Summit report includes consensus findings (2+ personas) and unique findings (1 persona) (evidence: packages/forge/skills/fo/fo-design-summit/SKILL.md:127)
- [x] Summit report persisted to `docs/summits/summit-<rfc-id>.md` (evidence: packages/forge/skills/fo/fo-design-summit/SKILL.md:135)
- [x] `fo-idea-plan` skill instructions updated with summit suggestion (step 5b) (evidence: packages/forge/skills/fo/fo-idea-plan/SKILL.md:171)
- [x] `fo-idea-i-just-want-to-see-the-result` does NOT invoke summit by default (evidence: grep search for "design-summit" in fo-idea-i-just-want-to-see-the-result/SKILL.md returned no matches)
- [x] `skill.validate` passes on `fo-design-summit` SKILL.md (evidence: forge.skill.validate --skill fo-design-summit — 0 violations for fo-design-summit)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0712 — All 1 RFC(s) passed validation)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- `fo-design-summit` is `concern: document-only` — it must not modify the RFC, source code, or any file except the summit report in `docs/summits/`.
- Personas are **simulated** by a single agent in one session. This is not multi-agent infrastructure. Each persona is a perspective shift, not a separate process.
- The summit report is an informational artifact, not a governance document. It does not block RFC acceptance — the operator decides whether to act on its findings.
- Summit findings that warrant RFC changes should be routed through `fo-idea-enhance` as audit-style findings, not applied directly by the summit skill.
