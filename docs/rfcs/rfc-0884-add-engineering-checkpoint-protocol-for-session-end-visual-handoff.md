---
id: RFC-0884
title: "Add Engineering Checkpoint protocol for session-end visual handoff"
status: draft
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-19
updatedAt: 2026-08-19
enhancedAt: 2026-08-19
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0581
  - RFC-0537
  - DNA-54
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - session.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/forge"
successSignals:
  - "Closing block after substantial sessions includes System Delta, Verification, and Remaining Issues sections"
  - "Mermaid diagrams appear in session-end output when structural changes warrant them"
  - "Sessions with no structural changes explicitly state no diagram is needed"
  - "Session frontmatter includes checkpoint metadata when agent fills it"
nonGoals:
  - "Do not create a new fo-engineering-checkpoint skill — the checkpoint is integrated into the existing session-end pipeline"
  - "Do not make Mermaid diagrams mandatory for every session — lightweight sessions need no diagram"
  - "Do not replace narrative summaries entirely — small fixes use a lightweight checkpoint"
  - "Do not add quantitative chart rendering infrastructure — charts are markdown tables only"
  - "Do not auto-generate diagrams programmatically — the agent authors them from session context"
---

# RFC-0884: Add Engineering Checkpoint protocol for session-end visual handoff

## Context

The workshop's session-end pipeline (`fo-session-retro` → closing block → `fo-handoff`) produces a narrative summary: 1–3 sentences of what was done, plus 1–3 next-step slash commands. This format is sufficient for trivial sessions but fails for substantial engineering work where the operator needs to verify that the project transitioned from state N to state N+1.

The current closing block (`packages/forge/skills/_shared/fo-session-summary.md`) answers "what did the agent do?" but not "what is the resulting state of the system?" — the latter is what an engineer with an analytical mindset needs. The expert recommendation is clear: after each substantial working session, leave a visually verifiable map of what changed in the system, using diagrams only where they reduce cognitive load compared to text.

The existing infrastructure is well-suited for this enhancement:

- `fo-session-retro` already controls the session-end flow and produces the closing block.
- `session.save` already extracts metadata (`relatedRfcs`, `commits`, `files`, `commands`) from the raw transcript.
- `SessionFrontmatter` (`packages/forge/os/session/types.ts:65-77`) already holds structured session metadata.
- Mermaid diagrams are textual and Git-versionable, fitting naturally into markdown closing blocks and session files.

The gap is that no protocol defines _what_ the closing block must contain for substantial sessions, _when_ a diagram is warranted, or _how_ the session file captures the engineering checkpoint metadata.

## Problem

Three concrete gaps in the current session-end protocol:

1. **No state-transition proof.** The closing block says "RFC-XXXX implemented, 3 commits" but does not show what the system looked like before, what changed, and what it looks like now. An engineer cannot verify the project transitioned from state N to N+1 without reading the full session transcript.

2. **No visual system delta.** When a session changes architecture, runtime flow, state machines, or persistence models, a text-only summary forces the reader to reconstruct the mental model from prose. A Mermaid diagram of the _resulting state_ would reduce cognitive load — but no protocol defines when to include one or which diagram type to use.

3. **No remaining-uncertainty section.** The closing block ends with "next steps" (slash commands to run), but never states what is unverified, what assumptions remain open, or what known limitations were introduced. This leaves the operator without a clear picture of technical debt created during the session.

## Decision

The workshop adopts the **Engineering Checkpoint** protocol as the mandatory closing block format for substantial sessions, replacing the current narrative-only closing block defined in `fo-session-summary.md`.

The protocol has two modes:

- **Lightweight checkpoint** — for sessions that do not change system structure (typo fixes, small refactors, document edits). Uses the existing 2-section format (Completed + Next Step) with an explicit "no diagram" statement.
- **Full checkpoint** — for sessions that change architecture, runtime flow, state machines, persistence models, or public contracts. Uses a 6-section format with an optional Mermaid diagram.

The agent decides which mode to use based on the diagram selection rules below. The decision is made by the agent during `fo-session-retro` step 7 (Report), not by a command or automated tool.

### Engineering Checkpoint closing block (full mode)

```
---

**<Completed label in aiLanguage>**

<1–3 sentences: what was implemented — concretely, with document ids, commit count, review verdict. No filler.>

**<System Delta label in aiLanguage>**

<Changed public contracts, schemas, APIs, state machines, invariants, persistence models, file surfaces. Grouped by category. Each item links to the source file or commit.>

**<Resulting Architecture label in aiLanguage>**

<Mermaid diagram of the system state AFTER changes — only when it reduces cognitive load vs text. See diagram selection rules. If no diagram is warranted, state: "No diagram: this session did not change system structure, runtime flow, state transitions, persistence relationships, or other relationships that would be clearer visually.">

**<Verification label in aiLanguage>**

<Tests executed, type checking, build status, relevant deterministic/recovery/integration checks, important observed results. Each claim links to evidence: test file:line, command output, or commit.>

**<Remaining Issues label in aiLanguage>**

<Known limitations, unverified assumptions, open questions, technical debt introduced. Be honest — this is the uncertainty map.>

**<Next Step label in aiLanguage>**

- `/fo-idea-audit RFC-XXXX` — <one line in aiLanguage: why>
- `/fo-idea-enhance RFC-XXXX` — <one line in aiLanguage: why>
```

### Engineering Checkpoint closing block (lightweight mode)

```
---

**<Completed label in aiLanguage>**

<1–3 sentences: what was done.>

**<Verification label in aiLanguage>**

<Tests/typecheck/build status — one line.>

**<Next Step label in aiLanguage>**

- `/fo-idea-status` — <one line in aiLanguage: why>
```

### Diagram selection rules

The agent MUST analyze the session's changes to determine if a diagram is warranted. The decision is based on **what changed in the system**, not on the session's chronology.

| Change type | Diagram type | When to use |
| --- | --- | --- |
| Architecture / component relationships | `flowchart` | Components, modules, packages, and their dependencies changed |
| Runtime interaction / request flow | `sequenceDiagram` | New or changed runtime interaction between components, services, or external systems |
| Lifecycle / state machine | `stateDiagram-v2` | State transitions, mission lifecycle, release states, or protocol states changed |
| Entities / persistence model | `erDiagram` | Data models, entity relationships, schema changes, storage contracts |
| Pipeline / dependency chain | `flowchart` | Build pipeline, validation pipeline, deployment pipeline changed |
| Quantitative results (performance, coverage, benchmarks) | markdown table | Measurable data exists that is clearer as a table than prose |
| No structural change | _(none)_ | Session did not change system structure, runtime flow, state, or persistence |

**Rules:**

1. **Do not draw a diagram merely to satisfy the requirement.** If no meaningful visualization is warranted, explicitly state: "No diagram: this session did not change system structure, runtime flow, state transitions, persistence relationships, or other relationships that would be clearer visually."
2. **Diagram shows resulting state, not work chronology.** The diagram depicts the system AFTER changes, not the sequence of edits the agent made.
3. **At most one diagram per closing block.** If multiple structural changes occurred, pick the one that most reduces cognitive load. Additional diagrams may appear in the session file or handoff document.
4. **CURRENT vs SESSION DELTA.** For large systems where the full architecture is too complex, the agent may draw a session-delta diagram (only the changed subgraph) instead of the full current-system diagram. If a delta diagram is used, label it as "session delta" and reference the full system context.
5. **Mermaid syntax only.** Diagrams use Mermaid text syntax (`flowchart`, `sequenceDiagram`, `stateDiagram-v2`, `erDiagram`) so they are Git-versionable and diffable.
6. **Quantitative charts are markdown tables.** No image rendering infrastructure is added. If measurable data exists (test counts, coverage %, performance ms), present it as a markdown table with a caption.

### Session file frontmatter extension

`SessionFrontmatter` in `packages/forge/os/session/types.ts` gains optional checkpoint fields. `session.save` (deterministic) does not populate them — they are filled by the agent during `fo-session-save` or manually. `session.validate` warns (SES-06) if checkpoint fields are absent in sessions with type `implementation` or `mission`, but does not error.

```ts
interface SessionCheckpoint {
  before: string;       // state N description (1-2 sentences)
  change: string;       // what was done (1-2 sentences)
  after: string;        // state N+1 description (1-2 sentences)
}

interface SessionDiagram {
  type: "flowchart" | "sequenceDiagram" | "stateDiagram-v2" | "erDiagram" | "none";
  scope: "current-system" | "session-delta";
  caption: string;
  mermaid: string;      // Mermaid syntax, or empty string when type is "none"
}

interface SessionEvidenceEntry {
  claim: string;
  source?: string;      // file:line reference
  test?: string;        // test file:line reference
  command?: string;     // command that was run and its result
}

interface SessionSystemDelta {
  changedContracts: string[];     // API endpoints, schema changes
  changedSchemas: string[];        // Zod schemas, TypeScript types
  changedStateMachines: string[];  // state transitions
  changedInvariants: string[];     // DNA invariants
  changedPersistence: string[];    // entity models, storage
}

interface SessionFrontmatter {
  // ... existing fields ...
  systemDelta?: SessionSystemDelta;
  diagrams?: SessionDiagram[];
  evidence?: SessionEvidenceEntry[];
  remainingIssues?: string[];
  checkpoint?: SessionCheckpoint;
}
```

### Quality test self-check

During `fo-session-retro` step 7 (Report), after composing the Engineering Checkpoint, the agent performs a self-check:

> "Can another engineer understand the resulting system state from this checkpoint alone, without reading the full session transcript?"

If the answer is no, the agent improves the checkpoint before presenting it. This is a semantic check performed by the agent, not an automated validation.

## Architectural fit

- **RFC-0581 (Session-end discipline):** This RFC extends the session-end protocol defined by RFC-0581. It does not replace `fo-session-retro` — it enhances the report format produced in step 7. The blocked-gate enforcement remains unchanged.
- **RFC-0537 (Session documentation domain):** This RFC extends `SessionFrontmatter` with optional checkpoint fields. The existing `session.save` deterministic extraction is not modified — checkpoint fields are agent-populated.
- **DNA-54 (Forge bindings contract):** Skill body changes in `fo-session-summary.md`, `fo-session-retro/SKILL.md`, `fo-handoff/SKILL.md`, and `fo-session-save/SKILL.md` must comply with the bindings contract — no hardcoded project-specific literals in instruction lines.
- **`fo-session-summary.md`:** The closing block template is restructured. The existing 2-section format (Summary + Next steps) becomes the lightweight mode. The full mode adds System Delta, Resulting Architecture, Verification, and Remaining Issues sections.
- **`fo-handoff`:** The handoff document gains a **System State Transition** section with three prose subsections — **Before** (state N, from `checkpoint.before`), **Change** (what was done, from `checkpoint.change`), **After** (state N+1, from `checkpoint.after`) — plus the diagram selection rules. The handoff is the primary artifact for the next agent picking up the work — it benefits most from the visual system delta. The three subsections are a prose rendering of the `SessionCheckpoint` interface fields, not separate frontmatter entries.
- **`fo-session-save`:** The skill's frontmatter generation step is extended to populate checkpoint fields when the agent provides them.
- **Site OS operator model:** No new commands are introduced. `session.validate` gains a non-blocking SES-06 warning for missing checkpoint fields in implementation/mission sessions.

## Design

### CLI surface

No new commands. Existing commands with changes:

```sh
# session.validate now warns (SES-06) when implementation/mission sessions lack checkpoint fields
pnpm exec werkstatt run session.validate
```

### TypeScript contracts

See the `SessionCheckpoint`, `SessionDiagram`, `SessionEvidenceEntry`, and `SessionSystemDelta` interfaces in the Decision section. These are added to `packages/forge/os/session/types.ts` as optional fields on `SessionFrontmatter`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/skills/_shared/fo-session-summary.md` | Closing block template restructured with lightweight and full modes |
| `packages/forge/skills/fo/fo-session-retro/SKILL.md` | Step 7 (Report) updated to produce Engineering Checkpoint + quality test self-check |
| `packages/forge/skills/fo/fo-handoff/SKILL.md` | Handoff document template gains BEFORE/CHANGE/AFTER + diagram selection rules |
| `packages/forge/skills/fo/fo-session-save/SKILL.md` | Frontmatter generation step extended with checkpoint fields |
| `packages/forge/os/session/types.ts` | `SessionFrontmatter` gains optional checkpoint fields; `SESSION_KNOWN_KEYS` extended |
| `packages/forge/os/session/handlers/validate.ts` | SES-06 warning rule added |
| `.agents/skills/*/SKILL.md` | Synced copies updated for all modified skills |
| `AGENTS.md` | Session-end discipline section references Engineering Checkpoint protocol |

### Output format

`session.validate` gains SES-06:

```json
{
  "command": "session.validate",
  "status": "pass",
  "violations": [
    {
      "rule": "SES-06",
      "file": "docs/sessions/2026-08-19-18-38-00-a1b2c3.md",
      "message": "Implementation session missing checkpoint frontmatter fields (systemDelta, diagrams, evidence, remainingIssues, checkpoint). Agent should populate these during fo-session-save.",
      "severity": "warning"
    }
  ],
  "checked": 42
}
```

### Failure modes

- **SES-06 is a warning, not an error.** Sessions without checkpoint fields still pass validation. The warning is a nudge, not a gate.
- **No diagram syntax validation.** The agent is responsible for producing valid Mermaid syntax. `session.validate` does not parse or render Mermaid — it only checks for the presence of the `diagrams` field.
- **Quality test self-check is semantic.** The agent performs it during `fo-session-retro`. There is no automated check for "can another engineer understand this?" — it is an agent discipline rule.

## Rollout

- **Default behavior:** The Engineering Checkpoint protocol is active immediately upon implementation. All `fo-*` skills that emit closing blocks use the new format.
- **Lightweight vs full mode:** The agent decides based on the diagram selection rules. No flag or configuration is needed.
- **Existing sessions:** Unaffected. Sessions saved before this RFC do not have checkpoint frontmatter and are not retroactively modified.
- **`session.validate` SES-06:** Non-blocking warning. Existing sessions without checkpoint fields trigger SES-06 but pass validation. The warning is a signal to the agent to populate checkpoint fields in future sessions.
- **SES-06 noise for existing sessions:** Sessions saved before this RFC was implemented will not have checkpoint fields and will trigger SES-06 warnings. This is acceptable and temporary — the warnings are non-blocking, and old sessions are archived over time by `session.archive` (default 30-day threshold). No date-based exemption is added to avoid over-engineering. The noise decreases naturally as pre-RFC sessions age into the archive.
- **SES-06 multi-type sessions:** SES-06 triggers when the `types` array contains `"implementation"` or `"mission"` (using `Array.includes`). A session with `types: ["implementation", "freeform"]` triggers the warning; a session with `types: ["freeform"]` does not. This matches the existing `session.validate` pattern of iterating the `types` array.
- **Skill sync:** After modifying skill files in `packages/forge/skills/`, the synced copies in `.agents/skills/` must be updated in the same commit.
- **No migration path needed.** The closing block format is agent-authored, not machine-generated. There is no generated file to regenerate.

## Alternatives considered

1. **New `fo-engineering-checkpoint` skill.** Rejected — it would fragment the session-end pipeline. The checkpoint is the closing block, not a separate step. `fo-session-retro` already controls the session-end flow.

2. **Auto-generate diagrams from session metadata.** Rejected — `session.save` extracts file paths and commands, but cannot determine architectural semantics (which components depend on which, what state machine changed). Diagram generation requires agent understanding of the session's impact, not just file lists.

3. **Make diagrams mandatory for all sessions.** Rejected — the expert explicitly states "do not draw a diagram merely to satisfy the requirement." Mandatory diagrams would produce noise for typo-fix sessions.

4. **Add Mermaid rendering infrastructure.** Rejected — Mermaid is textual and renders in GitHub, GitLab, IDEs, and most markdown viewers. No rendering pipeline is needed in the workshop.

5. **Add a new `session.checkpoint` command.** Rejected — the checkpoint is a protocol, not a command. It is produced by the agent during `fo-session-retro` and optionally persisted in the session file by `fo-session-save`. A command would add ceremony without value.

## Risks

- **Agent compliance.** The protocol relies on agent discipline. An agent may skip the diagram or produce a shallow checkpoint. Mitigation: the quality test self-check in `fo-session-retro` step 7, plus SES-06 warning in `session.validate`.
- **Diagram quality.** A poorly authored Mermaid diagram can be misleading. Mitigation: the diagram shows resulting state (not chronology), and the agent is instructed to use diagrams only when they reduce cognitive load.
- **Closing block length.** The full checkpoint is longer than the current 2-section format. Mitigation: the lightweight mode is used for non-structural sessions, keeping the closing block short for the common case.
- **Mermaid syntax errors.** Invalid Mermaid syntax renders as raw text in some viewers. Mitigation: the agent is responsible for valid syntax. No automated validation is added (would require a Mermaid parser dependency).
- **Frontmatter bloat.** Session files gain 5 new optional fields. Mitigation: all fields are optional. Sessions without checkpoint fields are valid (SES-06 warning only).

## Acceptance criteria

- [ ] `fo-session-summary.md` restructured with lightweight and full checkpoint modes, diagram selection rules table, and quality test self-check instructions
- [ ] `fo-session-retro/SKILL.md` step 7 (Report) updated to produce Engineering Checkpoint closing block with mode selection
- [ ] `fo-handoff/SKILL.md` updated with BEFORE/CHANGE/AFTER structure and diagram selection rules
- [ ] `fo-session-save/SKILL.md` updated with checkpoint frontmatter field generation guidance
- [ ] `SessionFrontmatter` in `packages/forge/os/session/types.ts` extended with `systemDelta`, `diagrams`, `evidence`, `remainingIssues`, `checkpoint` optional fields
- [ ] `SESSION_KNOWN_KEYS` in `packages/forge/os/session/types.ts` extended with new field names
- [ ] `session.validate` handler updated with SES-06 warning for missing checkpoint fields in implementation/mission sessions
- [ ] `AGENTS.md` session-end discipline section references Engineering Checkpoint protocol
- [ ] `.agents/skills/` synced copies updated for all modified skills
- [ ] `rfc.validate` passes on this RFC file
- [ ] `forge.skill.validate` passes after skill modifications

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove the diagram selection rules or the "do not draw a diagram merely to satisfy the requirement" rule without a new RFC that supersedes this one.
- The Engineering Checkpoint protocol is a **semantic protocol**, not a mechanical one. The agent must understand the session's impact to choose the right mode and diagram type. No automated tool can substitute for this judgment.
- When implementing, modify skill files first (`fo-session-summary.md`, `fo-session-retro/SKILL.md`, `fo-handoff/SKILL.md`, `fo-session-save/SKILL.md`), then TypeScript types (`types.ts`), then validation handler (`validate.ts`), then sync `.agents/skills/`, then update `AGENTS.md`.
- The `session.save` handler (`packages/forge/os/session/handlers/save.ts`) is NOT modified — it remains a deterministic extractor. Checkpoint fields are agent-populated via `fo-session-save` or manual editing.
