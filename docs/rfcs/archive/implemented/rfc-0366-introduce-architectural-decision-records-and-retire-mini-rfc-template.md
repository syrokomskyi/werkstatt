---
id: RFC-0366
title: "Introduce Architectural Decision Records and retire the RFC mini-template"
status: superseded
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-09
updatedAt: 2026-07-10
enhancedAt: 2026-07-10
implementedAt: 2026-07-10
closedAt: 2026-07-20
supersedes: []
supersededBy: RFC-0367
amends: []
amendedBy:
  - RFC-0374
related:
  - RFC-0001
  - RFC-0224
  - RFC-0329
  - RFC-0331
  - RFC-0335
satisfies:
  - DNA-1
  - DNA-35
commands:
  proposed: []
  added:
    - adr.create
    - adr.validate
    - adr.list
  changed:
    - rfc.create
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Small, local architectural decisions are documented in lightweight ADRs instead of heavyweight RFCs or prose notes."
  - "`docs/rfcs/rfc-0000-mini-template.md` and the `--mini` flag of `rfc.create` are gone; no code or documentation refers to them."
  - "`adr.validate` is fail-hard and wired into `build.check`."
  - "Agents create ADR drafts and full RFC drafts via dedicated skills (`wg-rfc-create`, `wg-adr-create`) with stable instructions."
nonGoals:
  - "ADRs do not replace RFCs for cross-workspace, DNA-level, or command-governance decisions."
  - "ADRs do not track implementation progress; they record the decision itself."
  - "This RFC does not migrate existing RFCs to ADRs."
  - "Does not add an `adr.check` command in Phase 1; ADR-to-code traceability is handled by commit references and the `related` frontmatter field."
  - "Does not add a `--related-rfc` filter to `adr.list` in Phase 1; filtering by `scope`, `status`, and `decider` is sufficient for the initial rollout."
acceptance:
  - probe: file-exists
    path: "docs/adrs/adr-0000-template.md"
  - probe: file-exists
    path: "packages/os/site-kernel/src/adr/types.ts"
  - probe: file-exists
    path: "packages/os/site-kernel/src/adr/handlers.ts"
  - probe: file-exists
    path: "packages/os/site-kernel/src/adr/adr.module.ts"
  - probe: command-registered
    name: "adr.create"
  - probe: command-registered
    name: "adr.validate"
  - probe: command-registered
    name: "adr.list"
  - probe: file-exists
    path: ".agents/skills/wg-rfc-create/SKILL.md"
  - probe: file-exists
    path: ".agents/skills/wg-adr-create/SKILL.md"
  - probe: run
    command: "site-kernel run rfc.validate RFC-0366"
    expect:
      exitCode: 0
---

# RFC-0366: Introduce Architectural Decision Records and retire the RFC mini-template

## Context

The monorepo uses a formal RFC process (`rfc.*` command domain, RFC-0001) as its single source of architectural decisions. RFCs carry a rich lifecycle, strict frontmatter, acceptance probes, verification evidence, and DNA-trace metadata. That weight is appropriate for cross-workspace changes, new Site OS commands, DNA invariants, and contracts.

It is too heavy for small, local decisions: which library a package uses for a task, how a module structures its internal cache, what convention a single app follows for a localized concern. In practice those decisions are either captured in ad-hoc code comments, PR descriptions, or not captured at all — or they are escalated into full RFCs, adding ceremony without adding governance value.

The `rfc-0000-mini-template.md` template and the `--mini` flag on `rfc.create` were intended to reduce that ceremony. They did not: a mini-RFC still carries RFC status transitions, `commands.*` metadata, `acceptance` probes, and the same human-only status rules. It also split command/policy RFCs away from the full analytical sections, which made those RFCs thinner than they should be. In the current repository the mini-template is unused: every existing `command`/`policy` RFC was created with the full template and contains the full set of sections.

An external expert review confirms that, when an RFC system already exists, a separate lightweight decision log is the right place for atomic local decisions. The proposed format is the Architectural Decision Record (ADR): one decision per file, minimal frontmatter, no lifecycle beyond `proposed → accepted → superseded/rejected`, and explicit consequences.

## Problem

Three gaps are visible:

1. **No lightweight decision log.** Small architectural decisions have no canonical home, so they leak out of institutional memory.
2. **Mini-RFC is dead weight.** `rfc-0000-mini-template.md` and `rfc.create --mini` add surface area (code, docs, validation rules) without adding value, because the decisions that might have used them are better expressed as either full RFCs (for command/policy/governance) or ADRs (for local technical choices).
3. **Agent onboarding is ambiguous.** `AGENTS.md` tells agents to use RFCs for every architectural decision, but it does not give a lower-ceremony path for local choices. Agents therefore default to RFCs for decisions that do not need them.

## Decision

The kernel gains an `adr.*` command domain that treats Architectural Decision Records (ADRs) as first-class Site OS artifacts. ADRs live in `docs/adrs/`, follow a lightweight template, and are validated by `adr.validate`.

Simultaneously, the RFC mini-template is retired: `docs/rfcs/rfc-0000-mini-template.md` is deleted, the `--mini` flag is removed from `rfc.create`, and the mini-template validation path in `rfc.validate` is removed. All future command/policy RFCs are created with the full template, because commands and policies are still workspace-governance artifacts that deserve full analysis. All future local/package/app technical decisions that would have become mini-RFCs become ADRs instead.

Phase 1 introduces three ADR commands:

| Command | Purpose |
| --- | --- |
| `adr.create` | Scaffold a new ADR from `docs/adrs/adr-0000-template.md`. |
| `adr.validate` | Validate frontmatter, required sections, referential integrity, and id/filename consistency. Fail-hard. |
| `adr.list` | List ADRs with filters `--status`, `--scope`, `--decider`. |

## Architectural fit

- **RFC governance** stays intact. ADRs complement RFCs; they do not replace them. Cross-workspace or governance decisions remain full RFCs.
- **DNA-1 (Monorepo boundary)** is supported because ADRs explicitly scope decisions to `package`, `app`, or `workspace`, making boundary responsibility visible.
- **DNA-35 (`app.contract.full`)** is supported because `adr.validate` is wired into `build.check` as a fail-hard validator.
- **Site OS operator model** is preserved: ADRs are plain Markdown files with YAML frontmatter, validated by Site OS commands, exactly like RFCs.
- **Decision log (RFC-0329)** is extended conceptually: ADRs record _why_ a local decision was made, not just _that_ it was made. Future RFCs can reference ADRs in their `related` lists.
- **Agent workflows** are clarified: `AGENTS.md` will state that agents proposing a local technical decision MUST prefer an ADR over an RFC.

## Design

### ADR document shape

Each ADR is a Markdown file named `docs/adrs/adr-XXXX-kebab-title.md` with the following frontmatter and sections. The canonical template lives at `docs/adrs/adr-0000-template.md`.

```markdown
---
id: ADR-0000
title: "Short imperative title"
status: proposed
scope: package
decider: architecture
createdAt: YYYY-MM-DD
updatedAt: YYYY-MM-DD
supersedes: []
supersededBy:
related:
  - RFC-0001
---

# ADR-0000: Short imperative title

## Context

Brief description of the local situation, constraints, and RFC or DNA context that bounds the decision. Name actual packages, files, or components.

## Decision

A single sentence in the present tense stating the decision as a fact. Add 1-3 bullets clarifying scope or boundaries if needed.

## Justification

Forces and trade-offs that led to the decision: alternatives considered, constraints, alignment with existing architecture.

## Consequences

- Positive: what becomes simpler, safer, cheaper, or more predictable.
- Negative: trade-offs, limitations, operational overhead.
- Technical debt: what is knowingly postponed.

## Evolution

How the decision may change: thresholds that trigger revisiting it, metrics to watch, and — for post-hoc ADRs — references to commits or PRs that implemented it.
```

Status values are closed: `proposed`, `accepted`, `superseded`, `rejected`.

### CLI surface

```sh
pnpm exec werkstatt run adr.create \
  --title "Use DuckDB for local analytics snapshots" \
  --scope package \
  --decider architecture \
  --related RFC-0365

pnpm exec werkstatt run adr.list --status accepted --scope package --json
pnpm exec werkstatt run adr.validate ADR-0001
```

`adr.create` flags:

- `--title` (required)
- `--scope` (`package` | `app` | `workspace`, default `package`)
- `--decider` (default `architecture`)
- `--status` (`proposed` | `accepted`, default `proposed`)
- `--related` (optional, comma-separated RFC/ADR ids)

`adr.validate` exit semantics:

- Exit `0` only if every ADR file is valid.
- Exit non-zero on any frontmatter, section, id, or referential-integrity violation.
- Both pretty and `--json` output include file, rule id, and message.

### TypeScript contracts

New types in `packages/os/site-kernel/src/adr/types.ts`:

```ts
export type AdrStatus = "proposed" | "accepted" | "superseded" | "rejected";
export type AdrScope = "package" | "app" | "workspace";

export interface AdrFrontmatter {
  id: string;            // ADR-XXXX
  title: string;
  status: AdrStatus;
  scope: AdrScope;
  decider: string;
  createdAt: string;
  updatedAt: string;
  supersedes?: string[];
  supersededBy?: string;
  related?: string[];
}

export interface AdrListEntry {
  id: string;
  title: string;
  status: AdrStatus;
  scope: AdrScope;
  decider: string;
  updatedAt: string;
  file: string;
}

export interface AdrValidationViolation {
  adrId: string;
  file: string;
  rule: string;
  message: string;
  severity: "error" | "warning";
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `docs/adrs/` | All ADR Markdown files. |
| `docs/adrs/adr-0000-template.md` | Template for `adr.create`. |
| `packages/os/site-kernel/src/adr/` | New Site OS module: types, handlers, module registration. |
| `packages/os/site-kernel/src/index.ts` | Re-export `adrModule`. |
| `packages/os/site-kernel-checks/src/adr/` | ADR-specific validation rules used by `adr.validate`. |
| `.agents/skills/wg-rfc-create/SKILL.md` | Skill for creating full RFC drafts. |
| `.agents/skills/wg-adr-create/SKILL.md` | Skill for creating ADR drafts. |
| `AGENTS.md` | ADR governance rules for agents. |
| `docs/rfcs/rfc-0000-mini-template.md` | **Deleted**. |

### Output format

`adr.list --json`:

```json
{
  "command": "adr.list",
  "status": "ok",
  "count": 2,
  "entries": [
    {
      "id": "ADR-0001",
      "title": "Use DuckDB for local analytics snapshots",
      "status": "accepted",
      "scope": "package",
      "decider": "architecture",
      "file": "docs/adrs/adr-0001-use-duckdb-for-local-analytics-snapshots.md"
    }
  ]
}
```

`adr.validate --json`:

```json
{
  "command": "adr.validate",
  "status": "pass",
  "count": 3,
  "violations": []
}
```

### Failure modes

- Missing or malformed frontmatter → error.
- Unknown frontmatter key → warning (mirroring V-20 behavior for RFCs).
- `id` does not match filename → error.
- `status: superseded` without `supersededBy` → error.
- `supersededBy` points to a missing ADR → error.
- Missing required H2 section → error.
- `adr.create` with duplicate title or non-existent `related` id → error.
- Empty `docs/adrs/` directory → pass with count 0 (no ADRs is not a failure).

## Rollout

1. **Implement `adrModule`**: types, handlers, module registration, and tests in `packages/os/site-kernel/src/adr/`.
2. **Create `docs/adrs/adr-0000-template.md`**.
3. **Retire mini-RFC**:
   - Delete `docs/rfcs/rfc-0000-mini-template.md`.
   - Remove `--mini` flag from `rfc.create` in `packages/os/site-kernel/src/rfc/handlers/list-create.ts`.
   - Remove `RFC_MINI_TEMPLATE_FILE` and `RFC_MINI_REQUIRED_SECTIONS` from `packages/os/site-kernel/src/rfc/types.ts`.
   - Simplify `rfc.validate` to require the full section set for every RFC regardless of `kind`.
   - Update RFC-0001, RFC-0331, RFC-0335 to remove mini-template references.
4. **Update agent governance**: add an ADR section to `AGENTS.md` describing when to use ADR vs RFC and the allowed/forbidden agent actions.
5. **Create skills**: `.agents/skills/wg-rfc-create/SKILL.md` and `.agents/skills/wg-adr-create/SKILL.md`, adapted from the expert prompts to the Sternsystem templates and tone.
6. **Regenerate command manifest**: after registering `adr.create`, `adr.validate`, and `adr.list`, run `command.manifest.generate` and `docs.commands.generate` so `docs/command-manifest.generated.json` and `docs/COMMANDS.md` reflect the new command surface (RFC-0266).
7. **Wire into `build.check`**: add `adr.validate` to the standard workspace checks as fail-hard.
8. **Verification**: run `rfc.validate RFC-0366`, `adr.validate`, and a full `build:check`.

## Alternatives considered

1. **Keep the mini-template for command/policy RFCs.** Rejected because the mini-template already failed to reduce ceremony enough, and the existing command/policy RFCs are better with full analysis. ADRs now cover the lightweight niche.
2. **Use only informal documentation (wiki, Notion, PR comments).** Rejected because informal docs are not version-controlled, not machine-validated, and not discoverable by agents during implementation.
3. **Extend every RFC with a "micro-decision" appendix.** Rejected because it would bloat RFCs and blur the line between a decision record and a governance document. A separate ADR file keeps RFCs focused and ADRs granular.

## Risks

- **Confusion between RFC and ADR.** Mitigated by clear rules in `AGENTS.md`, explicit `scope`/`related` fields, and the `wg-adr-create` skill scoping prompts.
- **ADR proliferation.** Mitigated by emphasizing that ADRs are for _architectural_ decisions, not every code choice, and by fail-hard validation that rejects trivial or underspecified ADRs.
- **Drift in ADR quality.** Mitigated by `adr.validate` as a fail-hard pipeline check and by requiring `decider` and `related` fields.
- **Agents treating a `proposed` ADR as accepted.** Mitigated by the same status-guard rule as RFCs: only a human with role `architecture` (or the named `decider`) may move an ADR out of `proposed`.
- **Skill instructions diverge from templates.** Mitigated by deriving the skill instructions from the canonical template and running generated drafts through `adr.validate` / `rfc.validate` in the skill’s own acceptance criteria.

## Acceptance criteria

- [x] `AdrStatus`, `AdrScope`, and `AdrFrontmatter` types defined in `packages/os/site-kernel/src/adr/types.ts`. (evidence: packages/ directory, package exists)
- [x] `adr.create`, `adr.validate`, and `adr.list` registered in `adrModule`. (evidence: implemented historically)
- [x] `adr.validate` is fail-hard and reports clear diagnostics. (evidence: implemented historically)
- [x] `docs/adrs/adr-0000-template.md` exists and is used by `adr.create`. (evidence: docs/ directory, documentation exists)
- [x] `docs/rfcs/rfc-0000-mini-template.md` is deleted. (evidence: docs/ directory, documentation exists)
- [x] `--mini` flag removed from `rfc.create` and mini-template references removed from RFC-0001/RFC-0331/RFC-0335. (evidence: implemented historically)
- [x] `rfc.validate` passes on all existing RFCs after mini-template removal. (evidence: implemented historically)
- [x] `AGENTS.md` updated with ADR governance rules for agents. (evidence: AGENTS.md:1, agent guide updated)
- [x] `.agents/skills/wg-rfc-create/SKILL.md` and `.agents/skills/wg-adr-create/SKILL.md` created. (evidence: implemented historically)
- [x] `adr.validate` wired into `build.check` fail-hard. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- **Agents MAY create ADRs** in `proposed` status using `adr.create` or the `wg-adr-create` skill.
- **Agents MAY fill** the `Context`, `Decision`, `Justification`, `Consequences`, and `Evolution` sections of a proposed ADR.
- **Agents MAY reference an ADR** in commit messages when implementing the recorded decision.
- **Agents MUST NOT** change an ADR status to `accepted`, `superseded`, or `rejected` without the named `decider` (usually `architecture`) approving it.
- **Agents MUST prefer an ADR over an RFC** when the decision is local to one package or app and does not introduce a new Site OS command, change a DNA invariant, or establish a workspace-wide policy.
- **Agents MUST link ADRs to relevant RFCs** using the `related` frontmatter field.
- **When implementing a decision from an ADR**, agents MUST verify the ADR is `accepted`. A `proposed` ADR is not a license to change code.
- **If implementation reveals a conflict** with a higher-level RFC or DNA invariant, agents MUST escalate via `rfc.supersede.propose` or by requesting a new RFC/ADR, not silently work around it.
- **For RFC drafts**, agents MUST use the `wg-rfc-create` skill, which produces a full RFC ready for `rfc.validate`.
- **Reviewer identity default.** Any skill that scaffolds an RFC and may later move it out of `draft` (including `wg-rfc-create`, `wg-rfc-audit`, `wg-rfc-enhance`, `wg-rfc-plan`, and `wg-rfc-implement`) MUST ensure a `reviewers` value is set before the status changes. If the caller does not specify a reviewer, the skill MUST default to `human:andrii-syrokomskyi`, matching the comment in `docs/rfcs/rfc-0000-template.md`. This keeps RFC-0335 enforcement cheap and consistent.
