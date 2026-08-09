---
id: RFC-0710
title: "Add explore mode for pre-specification idea exploration"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-06
updatedAt: 2026-08-06
enhancedAt: 2026-08-06
implementedAt: 2026-08-06
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0709
  - RFC-0711
  - RFC-0712
satisfies:
  - DNA-54
versionBump: minor
commands:
  proposed:
    - exploration.list
    - exploration.show
    - exploration.archive
  added:
    - exploration.list
    - exploration.show
    - exploration.archive
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/forge
successSignals:
  - "Operators use explore mode before creating RFCs for complex ideas"
  - "Exploration notes in docs/explorations/ are discoverable by future agents"
  - "RFCs created from explorations reference the exploration note in related field"
nonGoals:
  - "Does not replace fo-idea — explore is an optional pre-phase, not a replacement"
  - "Does not create RFCs or ADRs — exploration notes are not governance documents"
  - "Does not implement automated codebase analysis — the agent does exploration interactively"
  - "Does not persist exploration sessions — the note is the output, not a session log"
  - "Does not merge exploration.show into exploration.list as a flag — separate commands are justified by different output shapes (metadata list vs full content)"
---

# RFC-0710: Add explore mode for pre-specification idea exploration

## Context

The `fo-idea` skill immediately classifies an operator's description and routes to `fo-idea-create-rfc` or `fo-idea-create-adr`. There is no "thinking out loud" phase where the agent explores the codebase, weighs options, and assesses feasibility without committing to a governance document.

For ideas that are not yet fully formed, this leads to **premature formalization**: an RFC is created before the design space is understood. The RFC then goes through multiple amend cycles as the operator and agent discover constraints during audit and plan phases. This is wasteful — the exploration should happen before the RFC exists.

OpenSpec solves this with `/opsx:explore` — a "no-stakes thinking partner" that reads the code, weighs options, and shapes a plan before anything is written. Only when the operator is satisfied does `/opsx:propose` create the formal change.

## Problem

There is no low-commitment exploration phase in the Forge workflow. An operator with a half-formed idea must either:

1. **Create an RFC immediately** — risking premature formalization and multiple amend cycles.
2. **Discuss in chat without persistence** — losing the exploration context when the session ends.

The first option wastes architecture review time on RFCs that need significant revision. The second option loses valuable exploration work — the next agent starts from scratch.

## Decision

Add an **explore mode** to the Forge workflow. A new skill `fo-explore` does codebase exploration, option analysis, and feasibility assessment **without** creating an RFC or ADR. The output is a markdown exploration note in `docs/explorations/`. When the operator is ready, `fo-idea-create-rfc` formalizes the exploration into a governance document.

## Architectural fit

- **Forge bindings (DNA-54):** The new `fo-explore` skill enforces DNA-54 by requiring its skill body to reference paths and commands via `ref(forge.yaml bindings.*)` — no hardcoded project literals. The RFC's acceptance criteria include `skill.validate` passing on the new SKILL.md, which enforces SKILL-11 (no hardcoded literals). This is a direct compliance enforcement for the new skill, not merely decorative adherence.
- **OS module placement:** Exploration commands (`exploration.list/show/archive`) are registered in a new `forgeExplorationModule` in `packages/forge/os/exploration/`, following the pattern of `forgeRfcModule` (`os/rfc/`), `forgeAdrModule` (`os/adr/`), `forgeSessionModule` (`os/session/`), `forgePlanModule` (`os/plan/`), and `forgeAuditModule` (`os/audit/`). Exploration notes are forge-workflow artifacts (like RFCs, ADRs, plans, audits, sessions), not content validation checks — they belong in `packages/forge`, not in `packages/os/site-kernel-checks`.
- **RFC lifecycle:** Exploration notes are **not** part of the RFC lifecycle. They are informal artifacts that may precede an RFC but have no status transitions, no validation, and no acceptance step.
- **Skill taxonomy:** `fo-explore` is `category: fo`, `concern: document-only` — it produces `.md` files only and must not modify source code.
- **fo-idea routing:** `fo-idea` gains a new routing option: "explore" before "create RFC/ADR". The operator can request exploration explicitly, or `fo-idea` can suggest it when the idea is ambiguous.

## Design

### Skill: `fo-explore`

```yaml
name: fo-explore
description: Explore an idea in the codebase without creating an RFC or ADR. Produces a markdown exploration note in docs/explorations/.
invocation: user
category: fo
concerns: document-only
dependsOn: ['my-preferences']
bindings:
  requires: [paths.invariantsFile]
  optional: []
triggers: ["explore this idea", "let me think about this", "what are the options for"]
```

### Process

1. **Read the idea** — the operator describes what they want to explore.
2. **Explore the codebase** — the agent searches for relevant code, existing patterns, constraints, and dependencies. This is interactive — the agent may ask clarifying questions.
3. **Weigh options** — the agent presents 2–5 options with trade-offs (complexity, risk, alignment with DNA invariants, impact on existing code).
4. **Assess feasibility** — for each option, the agent identifies blockers, required RFCs, and estimated effort.
5. **Persist the exploration note** — write `docs/explorations/<slug>.md` with the exploration results.
6. **Suggest next steps** — recommend whether to create an RFC, an ADR, or shelve the idea.

### Exploration note format

```markdown
---
id: <slug>
title: "<exploration title>"
createdAt: 2026-08-06
status: open
related: []
---

# Exploration: <title>

## Idea

<operator's description>

## Codebase findings

<what the agent found in the codebase — relevant files, existing patterns, constraints>

## Options

### Option 1: <name>
- **Approach:** <description>
- **Trade-offs:** <pros/cons>
- **DNA alignment:** <which invariants are relevant>
- **Blockers:** <what needs to be resolved first>
- **Estimated effort:** <small/medium/large>

### Option 2: <name>
...

## Recommendation

<agent's recommendation with rationale>

## Open questions

- <unresolved questions for the operator>
```

### Frontmatter fields

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Kebab-case slug, matches filename |
| `title` | string | Human-readable title |
| `createdAt` | date | Creation date |
| `status` | enum | `open` (exploration in progress), `explored` (exploration complete, awaiting decision), `archived` (superseded by RFC or shelved) |
| `related` | string[] | RFC/ADR ids that materialized from this exploration |

### File system responsibilities

| Path                          | Role                                       |
| ----------------------------- | ------------------------------------------ |
| `docs/explorations/<slug>.md` | Exploration note (created by `fo-explore`) |
| `docs/explorations/`          | Directory for all exploration notes        |

### TypeScript contracts

```ts
interface ExplorationNote {
  id: string;
  title: string;
  createdAt: string;
  status: "open" | "explored" | "archived";
  related: string[];
  body: string;
}

interface ExplorationListResult {
  explorations: Array<Pick<ExplorationNote, "id" | "title" | "status" | "createdAt">>;
}

interface ExplorationShowResult {
  note: ExplorationNote;
}

interface ExplorationArchiveResult {
  id: string;
  previousStatus: string;
  newStatus: "archived";
  related: string[];
}
```

### Commands

#### `exploration.list`

```sh
pnpm exec werkstatt run exploration.list --json
```

Lists all exploration notes with `id`, `title`, `status`, `createdAt`. Supports `--status <status>` filter.

#### `exploration.show`

```sh
pnpm exec werkstatt run exploration.show --id <slug> --json
```

Returns the full exploration note content and frontmatter.

#### `exploration.archive`

```sh
pnpm exec werkstatt run exploration.archive --id <slug>
```

Transitions an exploration note to `archived` status. Used when the exploration is superseded by an RFC or shelved. Optionally accepts `--rfc <id>` to record which RFC materialized from the exploration (written to `related` field).

### fo-idea routing extension

`fo-idea` step 1 (analyze the request) gains a new sub-step:

> **1b. Explore suggestion.** If the operator's description is ambiguous, exploratory, or contains phrases like "what are the options", "let me think about", "explore", or "what if we", suggest using `fo-explore` before creating an RFC. Use `ask_user_question`:
>
> "This sounds like an exploration rather than a settled decision. Should I explore the codebase first, or create an RFC/ADR draft directly?"
>
> Recommended option: "Explore first" — because exploration is low-commitment and the results inform a better RFC.

### Output format

`exploration.list --json`:

```json
{
  "command": "exploration.list",
  "explorations": [
    {
      "id": "self-hosted-fonts",
      "title": "Self-hosted fonts vs CDN",
      "status": "explored",
      "createdAt": "2026-08-06"
    }
  ]
}
```

### Failure modes

- **Exploration note already exists:** If `<slug>.md` already exists, `fo-explore` appends a new exploration section with a timestamp header instead of overwriting.
- **Invalid slug:** Slugs must be kebab-case, lowercase, latin-only (matching DNA-6). Invalid slugs are rejected by `exploration.archive` — exit code 1.
- **No codebase access:** If the agent cannot explore the codebase (e.g., empty repo), the exploration note documents the constraint and focuses on option analysis without codebase findings.
- **Slug not found:** `exploration.show` and `exploration.archive` return exit code 1 if the slug does not exist in `docs/explorations/`.
- **Already archived:** `exploration.archive` is idempotent — if the note is already `archived`, it returns exit code 0 with `previousStatus: "archived"` (no-op). This follows the pattern of existing archive commands (`rfc.archive`, `plan.archive`) which skip already-archived items.
- **Empty directory:** `exploration.list` returns `{ explorations: [] }` with exit code 0 when `docs/explorations/` is empty or does not exist.

## Rollout

- **Default behavior:** `fo-explore` is available immediately after implementation. It is opt-in — operators request it explicitly or accept the suggestion from `fo-idea`.
- **No migration:** Existing RFCs are unaffected. Exploration notes are a new artifact type.
- **Pipeline integration:** None — exploration notes are not part of any build or validation pipeline. They are discoverable via `exploration.list` and by browsing `docs/explorations/`.
- **Skill sync:** `fo-explore` is synced to `.agents/skills/` by `forge create` / `forge upgrade`, same as other fo-skills.
- **AGENTS.md update:** `packages/forge/AGENTS.md` skill count must be updated (from "36 fo skills" to "37 fo skills") and the new `forgeExplorationModule` must be added to the OS modules table.

## Alternatives considered

- **Explore inside fo-idea (no new skill):** Rejected — `fo-idea` is already complex with classification, decomposition, and routing. Adding exploration logic would bloat it further. A separate skill keeps concerns separated.
- **Use fo-architecture instead:** Rejected — `fo-architecture` does deepening scans of existing code, not forward-looking exploration of new ideas. Different purpose.
- **Store explorations in docs/rfcs/ with a special prefix:** Rejected — pollutes the RFC directory with non-governance documents. Separates concerns cleanly.
- **No persistence (chat-only exploration):** Rejected — loses context across sessions. The whole point is persistence for future agents.

## Risks

- **Exploration note rot:** Notes may become stale as the codebase evolves. Mitigation: `status: explored` notes are informational, not authoritative. Agents reading an old note should verify findings against current code.
- **Scope creep:** `fo-explore` might evolve into a mini-RFC. Mitigation: the skill instructions explicitly state "exploration notes are not governance documents — they do not define contracts, commands, or policies."
- **Operator confusion:** Operators might think an exploration note is an RFC. Mitigation: the note format is visually distinct (no RFC frontmatter fields like `kind`, `scope`, `satisfies`).

## Acceptance criteria

- [x] `fo-explore` skill created in `packages/forge/skills/fo/fo-explore/` with SKILL.md (evidence: packages/forge/skills/fo/fo-explore/SKILL.md:2)
- [x] `fo-explore` synced to `.agents/skills/fo-explore/SKILL.md` (evidence: .agents/skills/fo-explore/SKILL.md:2)
- [x] `docs/explorations/` directory created with a `.gitkeep` or README (evidence: docs/explorations/.gitkeep:1)
- [x] `forgeExplorationModule` registered in `packages/forge/os/exploration/` with `exploration.list`, `exploration.show`, `exploration.archive` commands (evidence: packages/forge/os/exploration/exploration.module.ts:15)
- [x] `exploration.list` command registered and returns JSON output (evidence: packages/forge/os/exploration/exploration.module.ts:24)
- [x] `exploration.show` command registered and returns note content (evidence: packages/forge/os/exploration/exploration.module.ts:44)
- [x] `exploration.archive` command registered and transitions status (idempotent for already-archived) (evidence: packages/forge/os/exploration/exploration.module.ts:65)
- [x] `fo-idea` skill instructions updated with explore suggestion (step 1b) (evidence: packages/forge/skills/fo/fo-idea/SKILL.md:42)
- [x] `packages/forge/AGENTS.md` updated with new skill count and `forgeExplorationModule` in OS modules table (evidence: packages/forge/AGENTS.md:10, packages/forge/AGENTS.md:28)
- [x] `skill.validate` passes on `fo-explore` SKILL.md (evidence: forge.skill.validate output — status: pass, 0 violations)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0710 — exitCode: 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT create RFCs or ADRs from `fo-explore` — that is the job of `fo-idea-create-rfc` / `fo-idea-create-adr`. `fo-explore` produces exploration notes only.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- `fo-explore` is `concern: document-only` — it must not modify, create, or delete source code files.
- Exploration notes are discoverable artifacts, not governance documents. They have no lifecycle, no validation, and no acceptance step.
