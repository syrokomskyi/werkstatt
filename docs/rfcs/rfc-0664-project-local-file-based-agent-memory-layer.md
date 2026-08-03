---
id: RFC-0664
title: "Project-local file-based agent memory layer"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-03
updatedAt: 2026-08-03
enhancedAt: 2026-08-03
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0524
  - RFC-0660
  - RFC-0661
  - RFC-0662
  - RFC-0663
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-54
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - forge.create
    - forge.upgrade
    - forge.doctor
    - forge.agents.generate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - forge
successSignals:
  - "Any agent (IDE, CLI, or CI) can reconstruct project context by reading .agents/memory/MEMORY.md plus today and yesterday daily logs — no tool-specific API required"
  - "fo-session-retro routes Context insights to dated daily-log entries and curated MEMORY.md lines; MEMORY.md is committed, daily logs stay untracked"
  - "forge.create scaffolds .agents/memory/ with .gitignore covering daily/ and forge.doctor warns when MEMORY.md exceeds its hot budget"
nonGoals:
  - No replacement of tool-specific memory APIs — they remain as optional adapters behind the file layer
  - No semantic search or indexing over memory files — retrieval is convention (dated files) plus grep
  - No changes to AGENTS.md / ADR / DNA / forge-pattern routing — only the Context destination changes
  - No merge with operator-profile.md — private operator knowledge stays in its own git-ignored file
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0664: Project-local file-based agent memory layer

## Context

`fo-session-retro` triages session insights into six durable homes. Five of them are files in the project (AGENTS.md, ADRs, DNA, forge patterns, operator-profile). The sixth — **Context**, session-local knowledge like "pipeline state for mission X" or "the dev server on port 4321 is stale" — routes to a **Memory DB** via a tool-specific API (`create_memory`). That API exists only inside particular agent runtimes (the current IDE assistant). A different agent — a CLI agent, a CI bot, a future IDE — cannot read or write it. The knowledge is invisible in the project tree, unversioned, unreviewable, and effectively locked to one vendor's runtime.

This violates forge's founding constraints: projects of _any type_ (not only software), developed over _years_, by operators who may not be programmers, without wiring external services. A memory layer that depends on a specific tool's proprietary API fails all four.

The file-first precedent is proven at scale: OpenClaw's `MEMORY.md` (curated, human-editable) plus append-only daily logs loaded as "today + yesterday" gives agents continuity with zero infrastructure. Hermes shows the same shape with hard caps. The operator's grilling decision for this RFC: **the curated file is versioned in git; daily logs stay local** — team-visible vetted memory, private raw stream.

## Problem

1. **Context knowledge is not portable.** Routing to a runtime-specific Memory DB means the durable home disappears when the operator switches agents or works with multiple agents on one project — precisely the multi-agent reality `fo-memory-sync` already acknowledges.
2. **Context knowledge is not inspectable.** It cannot be reviewed in a diff, corrected by hand, or audited — violating the files-as-source-of-truth principle the rest of the routing table follows.
3. **No read discipline for session start.** Skills load their own knowledge files, but nothing tells an agent starting a session where the project's cross-session context lives. Each agent rediscovers current state from scratch.
4. **Retention is undefined.** Memory DB entries accumulate without expiry or archival semantics inside the project's governance.

## Decision

Forge projects gain a **file-based agent memory layer** at `.agents/memory/`: a curated, git-versioned `MEMORY.md` (the hot store) and append-only, git-ignored `daily/YYYY-MM-DD.md` logs (the warm stream). `fo-session-retro`'s Context category routes to these files — a dated bullet in today's daily log by default, promoted to a `MEMORY.md` line when the insight outlives the week — and tool-specific memory APIs (`create_memory` and equivalents) become optional adapters that mirror, never replace, the files. Agents read `MEMORY.md` plus today and yesterday daily logs at session start; everything older stays on disk for grep. `forge.create` scaffolds the directory and its `.gitignore` rules; `forge.doctor` checks the budget and gitignore health.

## Architectural fit

- **DNA-54 (Forge bindings contract):** the layer adds no hardcoded project literals — paths (`.agents/memory/`) are forge-level conventions identical for every project, and gitignore scaffolding lives in `forge.create` templates. A new binding key `bindings.memory.budget` (default 4096) declares the MEMORY.md hot budget; it is distinct from `bindings.knowledge.budgets.hot` (RFC-0661) because project memory and skill knowledge are independent budgets with different write rates.
- **`.agents/**` convention:** root AGENTS.md currently states «Keep `.agents/**` as reference or historical documentation, not as the primary active instruction layer.» This RFC adds `.agents/memory/` as an active, frequently-written context directory — not reference, not historical, not instruction. The rule is amended (in the Rollout section) to recognise `.agents/memory/` as an active context store alongside the existing exceptions (`.agents/skills/` synced by forge, `.agents/operator-profile.md` written by `fo-session-retro`). `fo-session-retro`'s constraint «`.agents/**` is reference/historical only» is similarly amended.
- **RFC-0524 / RFC-0660..0663:** the memory layer is _project_ knowledge, deliberately distinct from _skill_ knowledge (which lives in skills and stays portable). It borrows the hot/cold discipline (RFC-0661) but not the entry schema — memory entries are dated bullets, not K-id records, because their write rate (multiple per session) must stay cheaper than their read value.
- **Boundary with `docs/sessions/`:** `docs/sessions/` holds structured session records imported by `fo-memory-sync` from external tools (Codex, Claude Code). `.agents/memory/daily/` holds agent-written Context bullets from `fo-session-retro` during the current session. Different sources, different formats, different consumers. Both stay; neither is deprecated.
- **fo-session-retro:** exactly one routing-table cell changes (Context → `.agents/memory/`); the other five destinations are untouched.
- **operator-profile.md:** unchanged and complementary — private operator knowledge stays in its git-ignored file; project context goes to the memory layer. The two never merge.
- **OpenClaw alignment:** adopting the proven `MEMORY.md` + daily-log shape means agents arriving from that ecosystem (and humans) already know how to read it.

## Design

### Layout

```
.agents/
  memory/
    MEMORY.md              # curated hot store — VERSIONED in git
    daily/
      2026-08-03.md        # append-only warm stream — GIT-IGNORED
      2026-08-02.md
      ...
```

`forge.create` (and `forge.upgrade` for existing projects) scaffolds:

- `.agents/memory/MEMORY.md` — template with a header and empty `## Current focus` / `## Decisions in flight` / `## Environment notes` sections.
- `.agents/memory/daily/.gitkeep`.
- Root `.gitignore` additions (idempotent, marker-delimited):

```gitignore
# forge-agent-memory
.agents/memory/daily/
# /forge-agent-memory
```

`forge.doctor` warns when: the gitignore block is missing while daily files exist (privacy leak risk), or `MEMORY.md` exceeds its hot budget (`bindings.memory.budget`, default 4096). All memory-layer warnings are **advisory** — `forge.doctor` never changes its exit code for memory-layer issues, matching RFC-0661's warn-never-fail semantics.

### Write contract

- **Daily logs** — append-only, one file per day (`daily/YYYY-MM-DD.md`), entries are dated bullets grouped under `## HH:MM` or thematic headings, written by `fo-session-retro` (Context insights), `fo-handoff` (pointers), or any agent noting session state. Never edited after the day ends except to redact. **Redaction discipline:** any agent appending to a daily log MUST redact API keys, passwords, and PII before writing — the same redaction pattern that `fo-handoff` applies. Daily logs are local-only (git-ignored), but redaction prevents sensitive material from persisting on disk indefinitely.
- **MEMORY.md** — curated; entries are concise bullets under stable section headings. Promotion from daily to MEMORY.md happens inside `fo-session-retro` with the same operator confirmation as every other route. `MEMORY.md` is a hot file with a 4096-character budget (RFC-0661 semantics; `forge.doctor` warns, never fails). Over-budget pressure resolves by distilling or dropping lines during retro — no separate compaction command (the volume is human-scale).

### Read discipline (agent session start)

Agents read, in order: `MEMORY.md` (always), `daily/<today>.md` and `daily/<yesterday>.md` (if present). Older daily files are cold — reached via grep when a task references past context. This discipline lands as an AGENTS.md agent rule and in the relevant skill bodies (`fo-session-retro`, `fo-handoff`, `fo-memory-sync`). The read discipline is **purely advisory** — no mechanical enforcement (no hook, no doctor check for read compliance). It follows the same enforcement model as all other AGENTS.md rules: agent compliance is expected, not verified. Adding mechanical enforcement would over-engineer a human-scale convention.

### Routing table change (`fo-session-retro`)

| Category | Old destination | New destination |
| --- | --- | --- |
| Context | Memory DB (`create_memory` tool) | `.agents/memory/daily/<today>.md` (default) or `MEMORY.md` (when durable); Memory DB optional mirror |

All other categories unchanged. The skill's confirmation prompt gains a per-insight choice: daily (ephemeral, weeks) vs MEMORY.md (durable, curated).

### Tool-specific memory APIs as adapters

When the running agent's runtime offers a native memory store, the agent MAY mirror Context entries there for its own recall — but the files are the source of truth, and a fresh agent must be able to reconstruct context from files alone. `fo-memory-sync` gains the memory layer as a first-class **import source** — daily logs are material that `fo-memory-sync` reads and presents to the operator for import decisions, same direction as Codex memories today. No bidirectional sync is introduced; the word «export» is avoided to prevent implying a new write direction.

### TypeScript contracts

`packages/forge/src/onboarding/memory-scaffold.ts` (used by `forge.create`/`forge.upgrade`):

```ts
interface MemoryScaffoldResult {
  created: string[];      // paths scaffolded (empty when already present)
  gitignoreUpdated: boolean;
  skipped: string[];      // existing files left untouched
}

// Idempotent: existing MEMORY.md / daily files are never overwritten.
function scaffoldMemoryLayer(workspaceRoot: string): MemoryScaffoldResult;

// forge.doctor checks:
interface MemoryLayerHealth {
  memoryMdChars: number;
  budget: number;               // default 4096
  gitignoreCoversDaily: boolean;
  dailyFileCount: number;
}
```

No new commands. Changes land in `forge.create`, `forge.upgrade`, `forge.doctor` (extended behavior) and skill bodies.

### CLI surface

```sh
# Existing commands, extended behavior
pnpm exec site-kernel run forge.create        # scaffolds .agents/memory/ idempotently
pnpm exec site-kernel run forge.upgrade       # adds the layer to existing projects
pnpm exec site-kernel run forge.doctor --json # memory-layer health checks
```

### File system responsibilities

| Path                                                 | Role                               |
| ---------------------------------------------------- | ---------------------------------- |
| `packages/forge/src/onboarding/memory-scaffold.ts`   | Scaffold + health-check logic      |
| `.agents/memory/MEMORY.md`                           | Curated hot store (versioned)      |
| `.agents/memory/daily/`                              | Append-only logs (git-ignored)     |
| `packages/forge/skills/fo/fo-session-retro/SKILL.md` | Context routing change             |
| `packages/forge/skills/fo/fo-handoff/SKILL.md`       | Memory pointer in handoffs         |
| `packages/forge/skills/fo/fo-memory-sync/SKILL.md`   | Memory layer as sync source/target |
| `AGENTS.md` (generated, consumer projects)           | Session-start read rule            |

### Output format

`forge.doctor --json` fragment:

```json
{
  "memoryLayer": {
    "memoryMdChars": 2310,
    "budget": 4096,
    "gitignoreCoversDaily": true,
    "dailyFileCount": 12
  },
  "warnings": []
}
```

With a leak risk:

```json
{
  "warnings": [
    {
      "type": "memory-gitignore-missing",
      "message": ".agents/memory/daily/ contains 3 files but .gitignore does not cover it — run forge.upgrade",
      "fixHint": "Add the forge-agent-memory .gitignore block so daily logs stay local"
    }
  ]
}
```

### Failure modes

- **MEMORY.md hand-edited into a mess** → no schema to violate (dated bullets); doctor budget warning is the only guard (advisory, never fails the exit code). Curation pressure is the retro's job.
- **Daily file for today already exists** → append, never rewrite.
- **Project opted to version daily logs** (operator removes the gitignore block deliberately) → doctor stays silent: the block's absence with zero daily files, or a deliberate removal, is not a violation — the warning fires only when untracked daily files exist AND gitignore lacks coverage.
- **Multiple agents writing the same daily file concurrently** → at human scale, the realistic scenario is sequential appends within a single session or across sessions on the same day. Last-write-wins on append is the accepted risk; entries are bullets, conflicts merge cleanly in practice. Truly simultaneous writes (two agents appending at the same millisecond) are extremely rare and may lose an entry — accepted because daily logs are a warm stream (not source of truth) and MEMORY.md is curated separately.

## Rollout

- **Phase 1 (this RFC's implementation):** scaffold logic in `forge.create`/`forge.upgrade`, doctor checks, routing change in `fo-session-retro`, pointer in `fo-handoff`, sync source in `fo-memory-sync`, AGENTS.md read rule (via `forge.agents.generate` template for generated files; hand-written note for this monorepo). Root AGENTS.md and `fo-session-retro` constraint text are amended to recognise `.agents/memory/` as an active context store (not «reference/historical only»).
- **Existing projects:** `forge.upgrade` adds the layer without touching existing content; Context insights start flowing to files from the next retro onward. Historical Memory DB entries stay where they are; `fo-memory-sync` can import them on demand.
- **New projects:** the layer exists from day one via `forge.create` / `forge-bootstrap`.
- **No pipeline integration:** the memory layer is agent-facing state, never build input.

## Alternatives considered

- **Keep Memory DB as the primary Context home** — rejected: locks project knowledge to one agent runtime, invisible to other agents and unreviewable in git; fails the any-project-type, multi-agent, years-long constraints.
- **Version everything, including daily logs** — rejected: raw daily streams are noisy, may contain transient sensitive context, and create commit churn; the operator chose the hybrid (curated versioned, raw local) during grilling.
- **Git-ignore everything (like operator-profile)** — rejected: curated project context is exactly what a team (or a future agent clone) needs from the repo; privacy-sensitive material already has a home in operator-profile.md.
- **Full RFC-0660 entry schema for memory entries** — rejected: K-id metadata per memory bullet costs more to write than the entries are worth at this write rate; the dated-file convention provides identity (file = day) and ordering for free.
- **External memory SaaS (Mem0 and peers)** — rejected permanently: external service, cost, privacy, install complexity (series-wide non-goal, RFC-0660).

## Risks

- **MEMORY.md becomes a junk drawer.** Mitigation: 4096-char budget with doctor warnings; curation happens only through retro with operator confirmation; section headings give structure from day one.
- **Sensitive content lands in the versioned MEMORY.md.** Mitigation: retro's redaction discipline already applies; MEMORY.md is curated-by-definition (nothing lands there without operator approval); daily logs — where raw content goes first — are git-ignored.
- **Agents skip the session-start read.** Mitigation: the rule lands in AGENTS.md (loaded into every agent's system prompt in this ecosystem) and in the skill bodies that produce/consume handoffs.
- **Dual-write drift** between files and a tool-specific Memory DB mirror. Mitigation: files are declared source of truth; mirrors are best-effort caches agents may drop at any time.

## Acceptance criteria

- [ ] `scaffoldMemoryLayer` is idempotent and creates `MEMORY.md` template, `daily/.gitkeep`, and the marker-delimited `.gitignore` block; wired into `forge.create` and `forge.upgrade`
- [ ] `forge.doctor` reports memory-layer health (budget usage, gitignore coverage, daily count) and warns on untracked-daily leak risk
- [ ] `fo-session-retro` routes Context insights to daily logs (default) or MEMORY.md (operator-confirmed durable), with Memory DB demoted to optional mirror
- [ ] `fo-handoff` references the memory layer; `fo-memory-sync` treats it as an import/export source
- [ ] Generated `AGENTS.md` template gains the session-start read rule (MEMORY.md + today/yesterday); this monorepo's hand-written AGENTS.md gains the equivalent note
- [ ] A fresh agent following only the documented read discipline can reconstruct current project context from files (dogfooded in a live session)
- [ ] Unit tests cover scaffold idempotency, gitignore marker handling, and doctor warning conditions
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Before stamping `implemented`, run `site-kernel run rfc.verification.emit --id RFC-0664` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST treat `.agents/memory/` files as the source of truth for project context; tool-specific memory stores are disposable mirrors.
- Agents MUST NOT write to `MEMORY.md` outside the operator-confirmed flows (retro curation); daily logs accept direct appends.
- Agents MUST NOT commit daily logs — the gitignore block is the privacy boundary; removing it is an operator decision.
- Agents MUST NOT move private operator knowledge into the memory layer — that stays in operator-profile.md.
- Agents MUST redact API keys, passwords, and PII before appending to daily logs — same redaction discipline as `fo-handoff`.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0664 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
