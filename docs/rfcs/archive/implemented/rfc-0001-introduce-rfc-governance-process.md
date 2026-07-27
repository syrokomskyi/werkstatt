---
id: RFC-0001
title: "Introduce RFC governance process"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-12
updatedAt: 2026-06-04
implementedAt: 2026-04-12
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0003
commands:
  proposed:
    - rfc.create
    - rfc.list
    - rfc.validate
  added:
    - rfc.create
    - rfc.list
    - rfc.validate
  changed: []
  removed: []
appsImpacted:
  - main
  - my-main
  - nicaragua-projekt
packagesImpacted:
  - site-kernel
successSignals:
  - "Every architectural decision has a traceable RFC with a clear status"
  - "Agents check rfc.list before making structural changes"
  - "New RFCs are created via rfc.create and pass rfc.validate"
  - "Rejected ideas are recorded with reasons, preventing re-litigation"
nonGoals:
  - "Does not replace AGENTS.md — RFC governs decisions, AGENTS.md governs agent behavior"
  - "Does not require an RFC for every code change — only for architectural/structural changes"
  - "Does not implement Phase 2+ commands (rfc.show, rfc.close, rfc.todo, rfc.index.generate)"
---

# RFC-0001: Introduce RFC governance process

## Context

The Site OS has grown to 8 packages, 20+ typed commands, and 7 architectural documents (DNA, anti-patterns, contracts, scaling playbook). Decisions about architectural changes are made informally — there is no single place that records what was decided, what was rejected, and what is still under discussion.

As the platform expands to include brand compliance, quality auditing, and legal document verification, the lack of a formal decision lifecycle creates three risks:

1. **Institutional memory loss** — in 3 years, no one will remember why `thin-copy.validate` works the way it does.
2. **No governance gate for agents** — AI agents follow `AGENTS.md` but have no workflow contract for checking existing decisions before proposing changes.
3. **Scope creep** — without a formal process, every new rule is either "immediately coded" or "hangs in chat forever."

## Decision

The kernel gains an `rfc.*` command domain that treats RFC documents as first-class Site OS artifacts. Each RFC is a Markdown file with strict YAML frontmatter in `docs/rfcs/`, following the single full template (`RFC-0000-template.md`) with 10 required sections. Lightweight local decisions (package/app scoped, no command or DNA change) are recorded as Architectural Decision Records (ADRs) in `docs/adrs/` instead of mini-RFCs. See RFC-0366.

Phase 1 introduces three commands:

| Command        | Purpose                                                           |
| -------------- | ----------------------------------------------------------------- |
| `rfc.create`   | Create a new RFC draft from a template                            |
| `rfc.validate` | Validate frontmatter, required sections, referential integrity    |
| `rfc.list`     | List RFCs with optional filters (`--status`, `--kind`, `--owner`) |

The RFC lifecycle has 6 statuses: `draft → reviewing → accepted → implemented`, with branches to `rejected` and `superseded`. Only humans with role `architecture` may change status. Agents may create drafts and implement accepted RFCs.

Key simplifications over the initial proposal (per expert audit):

- No `decision` field — derived from `status` deterministically.
- No per-RFC `agentPolicy` — global rules in `AGENTS.md`.
- No `index.json` — `rfc.list` parses frontmatter on the fly.
- 3 commands instead of 7 — the rest are added via future RFCs.

## Acceptance criteria

- [x] RFC types defined in `packages/os/site-kernel/src/rfc/types.ts` (evidence: packages/forge/os/rfc/types.ts:1, types extracted to forge per RFC-0374)
- [x] `rfc.create` command registered and implemented (evidence: packages/forge/os/rfc/rfc.module.ts:65, command registered)
- [x] `rfc.validate` command with 15 validation rules (V-01 through V-15) (evidence: packages/forge/os/rfc/handlers/validate-rules.ts:73-339, rules V-01 through V-15 implemented)
- [x] `rfc.list` command with `--status`, `--kind`, `--owner` filters (evidence: packages/forge/os/rfc/rfc.module.ts:41, command registered with filters)
- [x] RFC template in `docs/rfcs/rfc-0000-template.md` (evidence: docs/rfcs/rfc-0000-template.md:1, file exists)
- [x] RFC agent protocol added to root `AGENTS.md` (evidence: AGENTS.md:1, RFC governance protocol documented in Active instruction model)
- [x] `yaml` dependency installed and lockfile updated (evidence: packages/forge/package.json:77, "yaml": "^2.5.0")
- [x] TypeScript compilation passes (`pnpm --filter @gogol/site-kernel build:check`) (evidence: pnpm --filter forge run build:check — exitCode=0)
- [x] At least one app registers `rfcModule` in its `kernel.config.ts` (evidence: tools/kernel.config.ts:61, forgeRfcModule registered)
- [x] All apps register `rfcModule` in their `kernel.config.ts` (evidence: tools/kernel.config.ts:61, single kernel config used by all apps)

## Implementation notes for agents

- This RFC bootstraps the governance process itself.
- Agents MUST NOT change the `status` field of this or any RFC.
- Agents implementing future Phase 2+ commands (rfc.show, rfc.close, rfc.todo, rfc.index.generate) MUST create a new RFC for each addition.
- The `rfcModule` must be imported from `@gogol/site-kernel` and added to `modules` in an app's `kernel.config.ts` to activate rfc.\* commands.
- RFC files are stored in `docs/rfcs/` at the workspace root, not inside any package or app directory.

## Backfilled sections (RFC-0366)

The following headings were added when the RFC mini-template was retired. The original command/policy RFC used the mini form, which recorded only Context, Decision, Acceptance criteria, and Implementation notes. These sections satisfy the unified full-template contract without altering the original decision.

## Problem

See the Context section above for the problem this RFC addresses. (This section is required by the unified RFC template; the original mini-RFC recorded the problem within Context.)

## Architectural fit

This RFC aligns with the DNA invariants and related RFCs listed in the frontmatter. (Backfilled during mini-template retirement; original mini-RFC did not include a separate Architectural fit section.)

## Design

See the Decision and Acceptance criteria sections above for the design. (Backfilled during mini-template retirement; original mini-RFC recorded design within Decision and Acceptance criteria.)

## Rollout

Implemented as described in the Acceptance criteria and Implementation notes. (Backfilled during mini-template retirement.)

## Alternatives considered

No alternatives were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)

## Risks

No additional risks were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)
