---
id: RFC-0662
title: "Knowledge compaction command and distillation lifecycle for skill knowledge"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: command
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
  - RFC-0663
  - RFC-0664
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed:
    - forge.skill.knowledge.compact
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - forge
successSignals:
  - "`forge.skill.knowledge.compact --all --dry-run --json` reports archivable, expirable, and stale-markable entries with per-file counts and modifies nothing"
  - "A compact run moves aged L0 entries to qa-log.archive.md, marks unconfirmed L2 entries stale, and leaves active knowledge byte-identical"
  - "`forge skill fo-knowledge-distill` distills an L0 log into operator-approved L1/L2 candidates and bumps confirmations on re-confirmed principles"
nonGoals:
  - No semantic (LLM) rewriting inside the command — the command is deterministic; all meaning work lives in the fo-knowledge-distill skill
  - No scheduled or pipeline execution — compact runs only on explicit operator invocation
  - No deletion of knowledge — archival moves entries; nothing is destroyed
  - No compaction of non-knowledge files (sessions, audits, docs) — those have their own archive commands
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

# RFC-0662: Knowledge compaction command and distillation lifecycle for skill knowledge

## Context

RFC-0660 gave knowledge entries structure (identity, timestamps, status); RFC-0661 gave the layers budgets and made over-budget growth visible as warnings. What neither provides is the **act of reduction**: a sanctioned, repeatable way to move aged raw material out of live files, flag principles whose confirmations have gone cold, and distill raw Q&A logs into durable principles. Today every one of those acts is an agent hand-editing files with no audit trail, no dry-run, and no operator approval gate.

The trigger conditions already exist or are landing: L0 `qa-log.md` files grow every run (append-only by design); L2 principles that stopped being re-confirmed quietly decay; RFC-0661's SKILL-21 warnings fire when hot/warm layers exceed budget. This RFC closes the loop — it is the valve those indicators point at.

The split of labor follows a rule the whole series obeys: **deterministic code moves and marks entries; the agent (via a skill) decides meaning.** Archival by date and staleness by `lastConfirmedAt` are computable — a command does them. Distilling forty Q&A pairs into three principles is judgment — a skill does it, with operator approval.

## Problem

1. **L0 grows without bound.** `qa-log.md` is append-only by contract. After a year of `grilling` runs it holds hundreds of Q&A pairs that have already been distilled (or will never be). No mechanism moves them out.
2. **Staleness is uncomputed.** RFC-0660's `lastConfirmedAt` exists, but nothing reads it. A principle last confirmed 14 months ago looks identical to one confirmed yesterday.
3. **Expired and superseded entries linger.** `expiresAt` and `supersedes` (RFC-0660) are inert metadata until something acts on them.
4. **Distillation is ad-hoc.** The L0→L2 meta-analysis step lives as prose inside individual skills (`grilling` does it at session end, others don't). There is no dedicated, reusable distillation flow with an operator approval gate and confirmation-counter maintenance.
5. **Legacy sections have no migration path.** RFC-0660 grandfathered pre-schema freeform content as legacy sections with warnings; nothing converts them.

## Decision

Forge gains a deterministic command **`forge.skill.knowledge.compact`** that compacts cumulative skill knowledge: it archives aged L0 entries to `qa-log.archive.md`, archives expired and superseded entries to per-file `<name>.archive.md` companions, and marks L2 entries stale when `lastConfirmedAt` exceeds the staleness window — all atomic, dry-runnable, and operator-invoked only. Alongside it, forge gains a skill **`fo-knowledge-distill`** that performs the AI half of the lifecycle: reading L0 (including archives), proposing L1/L2 candidates, bumping `confirmations` on re-confirmed principles, migrating legacy sections to the RFC-0660 format, and recommending a compact run — every mutation gated by explicit operator approval.

## Architectural fit

- **RFC-0524:** implements the lifecycle the original pattern implied ("grown by AI per operator direction", "distill L2 from L0 at the end") as concrete, governed mechanics.
- **RFC-0660:** the command is the first writer of `status: stale`/`archived` and the first consumer of `expiresAt`/`supersedes`; all mutations go through `parseKnowledgeFile`/`serializeKnowledgeFile` so format drift is impossible.
- **RFC-0661:** compact is the documented `fixHint` target of SKILL-21 budget warnings — archiving non-active entries is exactly what brings layers back under budget.
- **RFC-0663:** distillation is also the promotion vehicle; this RFC defines the skill, RFC-0663 defines the shared layer it promotes into.
- **Site OS operator model:** one new workspace-scope command in `forgeCoreModule`; one new user-invoked fo-skill. No pipeline integration — compaction is maintenance, not verification.
- **DNA-60 (proposed by this series):** this RFC is the "explicit compaction" clause.

## Design

### CLI surface

```sh
# Preview everything that would change — the default first run
pnpm exec site-kernel run forge.skill.knowledge.compact --all --dry-run --json

# Compact one skill's knowledge files
pnpm exec site-kernel run forge.skill.knowledge.compact --skill grilling

# Compact all skills (forge + pack) with custom windows
pnpm exec site-kernel run forge.skill.knowledge.compact --all --retention-days 120 --stale-days 90
```

Scope: `workspace`. Flags:

| Flag | Default | Meaning |
| --- | --- | --- |
| `--skill <name>` | — | Compact a single skill's declared knowledge files. Mutually exclusive with `--all`. |
| `--all` | — | Compact all forge and pack skills declaring `knowledge:` files. |
| `--dry-run` | off | Report planned mutations; write nothing. |
| `--json` | off | Machine-readable report. |
| `--retention-days <n>` | 90 | L0 entries with `created` older than this are archived. Overridable via `bindings.knowledge.retentionDays`. |
| `--stale-days <n>` | 90 | L2 entries with `lastConfirmedAt` older than this become `status: stale`. Overridable via `bindings.knowledge.staleDays`. |

Exactly one of `--skill` / `--all` is required (KERNEL-ARG error otherwise).

### Command operations

Applied per skill, per knowledge file, in order. Every operation is computed from `parseKnowledgeFile` and applied via `serializeKnowledgeFile`; the command exits non-zero and writes nothing if any target file has SKILL-19/SKILL-20 parse issues (compacting a malformed file would entrench the corruption).

1. **Expiry archive (all layers).** Entries with `expiresAt < today` move to the file's archive companion: `qa-log.archive.md`, `fix-patterns.archive.md`, `learned-principles.archive.md` (created on demand with a preamble noting RFC-0662 provenance). Moved entries keep their metadata with `status` rewritten to `archived`.
2. **Supersession archive (L1, L2).** Entries whose `status` is `superseded` (set when a newer entry lists them in `supersedes`) move to the archive companion, preserving the `supersedes` chain for archaeology.
3. **L0 retention archive.** L0 entries with `created < today - retentionDays` move to `qa-log.archive.md`. Rationale: distilled value has long been extracted by meta-analysis; the raw pair is archaeological.
4. **L2 staleness marking.** L2 entries with `status: active` and `lastConfirmedAt < today - staleDays` become `status: stale` **in place** (not archived — a stale principle is still readable knowledge, just untrusted). `confirmations` is left untouched; the skill treats `stale` as "re-confirm before applying autonomously". Re-confirmation by the operator (via fo-knowledge-distill or any grilling run) restores `status: active` with a fresh `lastConfirmedAt`.
5. **Legacy section report.** Files containing RFC-0660 legacy sections are listed in the report with entry counts and a pointer to `fo-knowledge-distill` (which performs the actual migration with operator approval). The command never rewrites legacy prose.

Active, non-expired entries are byte-identical after a run — the serializer round-trips them unchanged (guarded by the RFC-0660 round-trip PBT).

### The `fo-knowledge-distill` skill

New user-invoked fo-skill at `packages/forge/skills/fo/fo-knowledge-distill/`:

```yaml
name: fo-knowledge-distill
description: Distill raw knowledge logs (L0) into durable fix patterns (L1) and learned principles (L2), maintain confirmation counters, and migrate legacy sections — with operator approval on every mutation.
invocation: user
category: fo
concerns: document-only
dependsOn: ['my-preferences', 'grilling']
```

Process outline (the SKILL.md spells out each step with completion criteria):

1. **Scope selection.** Operator picks one skill or all; the skill parses that skill's knowledge files via the RFC-0660 parser (in-process import of `packages/forge/src/knowledge/`).
2. **Read cold material.** Read L0 (`qa-log.md`) and, if present, `qa-log.archive.md`. This is the sanctioned wholesale read of the cold layer (RFC-0661).
3. **Propose distillations.** Group recurring Q&A themes; for each, propose either an L2 principle (with `confirmations` seeded from observed recurrences) or an L1 fix pattern. Present as a table; operator confirms/edits/drops each via `ask_user_question` (same confirmation-format rules as fo-session-retro).
4. **Re-confirmation pass.** For existing L2 entries whose themes appear in the new material: propose `confirmations + 1` and `lastConfirmedAt: today`, restoring `stale` → `active` where applicable. Operator confirms per entry.
5. **Legacy migration.** For each RFC-0660 legacy section: propose a structured entry (id, metadata, body preserved verbatim). Operator approves each.
6. **Write.** Apply approved mutations via the serializer; never touch unapproved entries.
7. **Recommend compact.** If retention/expiry candidates remain, recommend `forge.skill.knowledge.compact --skill <name>` and offer to run it.
8. **Commit.** Commit only the mutated knowledge files (fo-pipeline commit discipline).

### TypeScript contracts

`packages/forge/src/knowledge/compact.ts` (pure planning, no I/O decisions hidden):

```ts
interface CompactOptions {
  retentionDays: number;  // default 90
  staleDays: number;      // default 90
  today: string;          // YYYY-MM-DD, injectable for tests
}

interface CompactAction {
  kind: "archive-expired" | "archive-superseded" | "archive-l0-retention" | "mark-stale";
  file: string;           // knowledge file path
  entryId: string;        // K-NNNN
  reason: string;         // human-readable, e.g. "lastConfirmedAt 2026-03-01 older than 90 days"
}

interface CompactFilePlan {
  file: string;
  archiveFile: string;    // companion archive path
  actions: CompactAction[];
  legacySectionCount: number;
}

// Pure: parsed files in, plans out. No filesystem access.
function planCompaction(files: ParsedKnowledgeFile[], options: CompactOptions): CompactFilePlan[];

// Executes plans via parse → mutate metadata/move entries → serialize.
// Atomic per file: staging write + rename; failure mid-run leaves prior files intact.
function executeCompaction(plans: CompactFilePlan[], dryRun: boolean): CompactReport;
```

Command handler `packages/forge/os/core/handlers/knowledge-compact.ts` wraps the pure functions in the kernel command contract (flags parsing, `KernelCommandResult<CompactReport>`, exit codes).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/src/knowledge/compact.ts` | Pure planning + execution |
| `packages/forge/os/core/handlers/knowledge-compact.ts` | Command handler |
| `packages/forge/os/core/core.module.ts` | Registers `forge.skill.knowledge.compact` |
| `packages/forge/skills/<name>/*.archive.md` | Created on demand; receive archived entries |
| `packages/forge/skills/fo/fo-knowledge-distill/SKILL.md` | New skill |
| `packages/forge/skills/**/{qa-log,fix-patterns,learned-principles}.md` | Mutation targets (via serializer only) |

### Output format

```json
{
  "command": "forge.skill.knowledge.compact",
  "status": "pass",
  "dryRun": true,
  "skills": [
    {
      "skill": "grilling",
      "files": [
        {
          "file": "qa-log.md",
          "actions": [
            { "kind": "archive-l0-retention", "entryId": "K-0003", "reason": "created 2026-04-12 older than 90 days" }
          ],
          "legacySectionCount": 0
        },
        {
          "file": "learned-principles.md",
          "actions": [
            { "kind": "mark-stale", "entryId": "K-0002", "reason": "lastConfirmedAt 2026-04-30 older than 90 days" }
          ],
          "legacySectionCount": 2
        }
      ]
    }
  ],
  "totals": { "archived": 1, "markedStale": 1, "legacyFiles": 1 }
}
```

### Failure modes

- **Target file has SKILL-19/SKILL-20 parse issues** → command exits 1, names the file and issue, writes nothing (refuses to compact malformed files).
- **Neither `--skill` nor `--all`** → argument error, exit 1.
- **`--skill` names a skill without knowledge files** → pass with an explicit "nothing to compact" summary, exit 0.
- **Archive companion exists with hand edits** → append-merge only; the command never rewrites existing archive content.
- **Mid-run I/O failure** → per-file atomic write (staging + rename); already-processed files stay consistent, unprocessed files untouched, non-zero exit with per-file status in the report.

## Rollout

- **Phase 1 (this RFC's implementation):** `compact.ts` + handler + `fo-knowledge-distill` skill. First real run: `--all --dry-run` on this monorepo, operator review, then the live run — which also performs the RFC-0660 legacy migration via the distill skill, closing the migration window on forge's own files.
- **Trigger discipline (documented, not automated):** run compact when (a) a SKILL-21 budget warning appears, (b) a session-end retro notices knowledge growth, or (c) roughly monthly on long-lived projects. `forge.doctor` prints "last compact: never/N days ago" once compaction state is observable from file mtimes — informational only.
- **New projects:** `forge.create` needs nothing new — empty knowledge files compact to a no-op report.
- **No pipeline integration:** the command is never wired into `build.check` or CI gates. Operators may add it to their own maintenance scripts; forge does not prescribe cadence.

## Alternatives considered

- **Extend fo-session-retro with distillation** — rejected: retro already triages six routing targets; adding per-skill knowledge distillation overloads it and mixes project-knowledge routing with skill-self-maintenance. A dedicated skill keeps both predictable.
- **Fully deterministic distillation** (no skill) — rejected: grouping forty Q&A pairs into principles is semantic judgment; a regex cannot do it, and shipping a half-working heuristic violates the pragmatism bar.
- **Cron/CI-scheduled compaction** — rejected: silent, unattended mutation of knowledge files contradicts the operator-approval contract the whole series enforces. External schedulers remain free to invoke the command explicitly.
- **Single archive file per skill instead of per-layer companions** — rejected: per-layer companions (`qa-log.archive.md` next to `qa-log.md`) keep co-location (definition beside its source) and let distillation read one layer's archaeology without the others'.

## Risks

- **Over-eager archival** hiding raw material before it was distilled. Mitigation: 90-day default retention is generous; `--dry-run` is the documented first run; distill reads archives too, so archived material remains reachable for meta-analysis.
- **Stale-marking churn.** A principle marked stale during an inactive month flaps back on next confirmation. Mitigation: flapping is cheap and truthful — `stale` is a trust signal, not a penalty; the distill skill restores `active` on re-confirmation.
- **Agent misinterpretation: running compact as part of unrelated tasks.** Mitigation: the command is operator-invoked by contract; skill bodies may _recommend_ it but the implementation notes forbid agents from treating recommendations as standing permission in projects where the operator has not opted in.
- **Serializer regressions corrupting live files.** Mitigation: mutation only via RFC-0660's round-trip-tested serializer; per-file atomic writes; refusal to touch files with parse issues.

## Acceptance criteria

- [ ] `planCompaction` is pure and unit-tested: expiry, supersession, L0 retention, and L2 staleness each produce the documented action kinds with correct reasons
- [ ] `executeCompaction` round-trips active entries byte-identically (guarded by PBT), writes per-layer archive companions on demand, and uses per-file atomic writes
- [ ] `forge.skill.knowledge.compact` is registered in `forgeCoreModule` with `--skill`/`--all`/`--dry-run`/`--json`/`--retention-days`/`--stale-days`; missing scope flag exits 1
- [ ] The command refuses (exit 1, no writes) when any target file has SKILL-19/SKILL-20 parse issues
- [ ] `fo-knowledge-distill` skill exists with the documented process; every mutation path asks for operator approval; concerns: document-only; validated by `forge.skill.validate`
- [ ] A full `--all --dry-run` on this monorepo reports current state accurately, and the subsequent live run + distill pass leaves `forge.skill.validate` at zero legacy-section warnings
- [ ] `docs/command-manifest.generated.yaml` regenerated via `command.manifest.generate`
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Before stamping `implemented`, run `site-kernel run rfc.verification.emit --id RFC-0662` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT wire `forge.skill.knowledge.compact` into build pipelines, CI gates, or automatic session-end hooks — invocation is operator-explicit.
- Agents MUST NOT put LLM/semantic logic into the command handler or into `src/knowledge/` — deterministic planning only; meaning work lives in `fo-knowledge-distill`.
- Agents MUST mutate knowledge files only through the RFC-0660 serializer — never string-splice markdown.
- This RFC depends on RFC-0660 (parser/serializer/schema) — implement RFC-0660 first.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0662 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
