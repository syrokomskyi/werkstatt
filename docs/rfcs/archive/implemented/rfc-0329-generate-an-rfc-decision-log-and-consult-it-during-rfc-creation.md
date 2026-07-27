---
id: RFC-0329
title: "Generate an RFC decision log and consult it during RFC creation"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii
createdAt: 2026-07-06
updatedAt: 2026-07-07
implementedAt: 2026-07-07
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0376
related:
  - RFC-0224
  - RFC-0268
  - RFC-0330
  - RFC-0334
commands:
  proposed: []
  added:
    - rfc.decision-log.generate
  changed:
    - rfc.create
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
satisfies:
  - DNA-35
successSignals:
  - "`rfc.decision-log.generate` writes docs/rfcs/decision-log.generated.json and docs/rfcs/decision-log.generated.md aggregating every rejected/superseded RFC and every non-empty `## Alternatives considered` section across all RFCs."
  - "`rfc.create --title <t>` prints the top matching prior decisions (id, title, status, one-line reason) before scaffolding, and includes them as `consultedDecisions` in its JSON result."
  - "An agent drafting an RFC on a previously rejected topic sees the prior rejection at creation time without any extra command."
  - "`rfc.decision-log.generate --check` exits non-zero when either committed projection (JSON or Markdown) drifts from the recomputed one."
nonGoals:
  - "Do not block or fail rfc.create when matches are found — consultation is informative; the agent decides relevance."
  - "Do not use an LLM or embeddings for matching — keyword scoring only, deterministic and offline."
  - "Do not rewrite or annotate historical RFCs — the log is a read-only projection."
  - "Do not wire generation into build pipelines — on-demand like rfc.index.generate; rfc.create recomputes fresh in-memory and never depends on the committed projection."
acceptance:
  - probe: command-registered
    name: "rfc.decision-log.generate"
  - probe: file-exists
    path: "packages/os/site-kernel/src/rfc/decision-log.ts"
  - probe: file-exists
    path: "docs/rfcs/decision-log.generated.json"
  - probe: run
    command: "site-kernel run rfc.decision-log.generate --check"
    expect:
      exitCode: 0
  - probe: file-contains
    path: "AGENTS.md"
    pattern: "decision-log"
---

# RFC-0329: Generate an RFC decision log and consult it during RFC creation

## Context

The workspace holds 316+ RFCs. Every full RFC carries an `## Alternatives considered` section, and rejected/superseded RFCs record why a whole direction was abandoned. This knowledge exists but is **scattered across 316 files**: an agent starting a new draft has no single place to ask "was this already decided?".

The 2026-07 expert review batch (space-program documentation practices applied to this ecosystem) converged unanimously on one point: at this RFC volume, **re-litigating old decisions is the largest silent efficiency tax on AI agents**. An agent that cannot see prior rejections will re-propose them — burning a full draft-review-reject cycle each time.

The existing machinery is close: `rfc.index.generate` already aggregates frontmatter across all RFCs, `rfc.create` (`packages/os/site-kernel/src/rfc/handlers/list-create.ts`) already scaffolds new drafts and is the single funnel through which every new RFC is born. What is missing is a decision-focused projection and a consultation step at the funnel.

## Problem

The unprotected invariant is: **no new RFC should re-propose an alternative that was already explicitly rejected, without acknowledging that prior decision.**

Today this relies entirely on the drafting agent's memory or on a human reviewer recognizing the repeat. Concretely:

1. There is no machine-readable index of rejected/superseded decisions. `rfc.list --status rejected` returns titles only — the _reasons_ live in prose bodies.
2. `## Alternatives considered` sections (the richest source of "we already said no to X") are not aggregated anywhere.
3. `rfc.create` scaffolds blindly: it does not surface prior related decisions at the exact moment they are cheapest to consult.
4. `AGENTS.md` has no policy requiring consultation of prior decisions before drafting.

## Decision

The kernel gains a `rfc.decision-log.generate` command and `rfc.create` gains a consultation step.

1. **New module** `packages/os/site-kernel/src/rfc/decision-log.ts` exports a pure collector `collectDecisionLog(rfcDirPath): Promise<DecisionLogEntry[]>` that parses every `docs/rfcs/rfc-*.md` (reusing `listRfcFiles` and `readAndParseRfc` from `frontmatter-io.ts`) and produces entries of three kinds:
   - `rejected-rfc` — one per RFC with `status: rejected`: id, title, `closedAt`, first paragraph of `## Decision` (the rejected direction), and the full text of `## Alternatives considered` if present.
   - `superseded-rfc` — one per RFC with `status: superseded`: id, title, `closedAt`, `supersededBy`, first paragraph of `## Decision`.
   - `rejected-alternative` — one per RFC (any status) whose `## Alternatives considered` section is non-empty: id, title, status, and the raw section text. Each rejected alternative inside an accepted RFC is itself a decision.

2. **New command** `rfc.decision-log.generate` (workspace scope, `mutatesState: true`) runs the collector and writes two projections:
   - `docs/rfcs/decision-log.generated.json` — machine-readable array of `DecisionLogEntry`, sorted by id.
   - `docs/rfcs/decision-log.generated.md` — human/agent-browsable rendering grouped by entry kind. Both carry the canonical `GENERATED_MARKER` from `@gogol/site-kernel`: the JSON projection stores it in `generatedMarker`, and the Markdown projection starts with `<!-- ${GENERATED_MARKER} -->`. Because the command writes under `docs/`, both files MUST be written with `writeFileAtomic` and the module MUST be declared on `SHARED_WRITE_ALLOWLIST` (RFC-0258 / RFC-0087). A `--check` boolean flag recomputes in-memory, diffs against both committed projections, and exits 1 on drift without writing (mirror of the `behavior.snapshot.validate` pattern).

3. **`rfc.create` consultation step.** Before scaffolding, `rfc.create` calls `collectDecisionLog` fresh (never reads the committed projection — no staleness dependency), scores entries against the `--title` keywords, and:
   - prints the top 5 matches in pretty mode as `Prior decisions to consult:` with id, kind, title, and file path;
   - includes them in the JSON result as `consultedDecisions` (see Output format);
   - prints `No related prior decisions found.` when nothing scores above zero. Matching is deterministic keyword overlap: lowercase the title, split on non-alphanumerics, drop tokens shorter than 3 chars and a small English stopword list (`the, and, for, add, into, with, from, that`), score each entry by the count of distinct title tokens appearing in the entry's title + text (title hits weighted ×3), sort descending, tie-break by id.

4. **AGENTS.md policy.** A new paragraph in the RFC-workflow section: _"Before drafting a new RFC, agents MUST run `rfc.create` (which prints related prior decisions from the decision log) and MUST address any relevant prior rejection in the new RFC's `## Alternatives considered` section — either distinguishing the new proposal from the rejected one or explicitly superseding it. Re-proposing a rejected decision without acknowledging it is a review-rejection ground."_

## Architectural fit

- **RFC-0224 (status transitions)**: unchanged — this RFC adds no transitions; it makes the _pre-draft_ step informed.
- **RFC-0268 (acceptance probes)**: the log is validated by the same generated-projection discipline (`--check` drift detection).
- **Site OS operator model**: new command follows `KernelCommandDefinition` registration in `packages/os/site-kernel/src/rfc/rfc.module.ts` alongside `rfc.index.generate`; flags declared per `kernel-flags-lint`.
- **RFC-0334 (`rfc.supersede.propose`)**: the escalation command from that RFC produces exactly the rejected/superseded material this log aggregates — the two commands close the loop between "decision made" and "decision findable".

## Design

### CLI surface

```sh
pnpm exec site-kernel run rfc.decision-log.generate            # write both projections
pnpm exec site-kernel run rfc.decision-log.generate --check    # drift check, no write, exit 1 on drift
pnpm exec site-kernel run rfc.decision-log.generate --json     # structured result
pnpm exec site-kernel run rfc.create --title "Add foo.validate command"   # now prints prior decisions first
```

Flags for `rfc.decision-log.generate`: `check` (boolean, optional). No app flag — workspace scope.

### TypeScript contracts

```ts
// packages/os/site-kernel/src/rfc/decision-log.ts

export type DecisionLogEntryKind =
  | "rejected-rfc"
  | "superseded-rfc"
  | "rejected-alternative";

export interface DecisionLogEntry {
  kind: DecisionLogEntryKind;
  rfcId: string;            // "RFC-0123"
  title: string;
  status: RfcStatus;
  closedAt?: string;        // rejected/superseded only
  supersededBy?: string;    // superseded only
  /** First paragraph of ## Decision (rejected/superseded kinds). */
  decisionSummary?: string;
  /** Raw text of ## Alternatives considered (when present). */
  alternativesText?: string;
  file: string;             // "docs/rfcs/rfc-0123-....md"
}

export interface DecisionLogResult {
  command: "rfc.decision-log.generate";
  status: "ok" | "drift";
  count: number;
  entries: DecisionLogEntry[];
  written?: string[];       // paths written (absent with --check)
}

/** Added to RfcCreateResult in rfc/types.ts (ADDITIVE): */
export interface ConsultedDecision {
  rfcId: string;
  kind: DecisionLogEntryKind;
  title: string;
  score: number;
  file: string;
}
// RfcCreateResult gains: consultedDecisions: ConsultedDecision[];
```

Section extraction: reuse the same markdown-section parsing approach the validator uses for required-section checks (`handlers/validate.ts` locates `## `-headings) — extract text between `## Alternatives considered` / `## Decision` and the next `## ` heading. Do not add a markdown parser dependency.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/rfc/decision-log.ts` | New: collector, scorer, projection writers, `--check` differ |
| `packages/os/site-kernel/src/rfc/types.ts` | `DecisionLogEntry`, `DecisionLogResult`, `ConsultedDecision`; extend `RfcCreateResult` |
| `packages/os/site-kernel/src/rfc/rfc.module.ts` | Register `rfc.decision-log.generate` |
| `packages/os/site-kernel/src/rfc/handlers/list-create.ts` | `runRfcCreate` gains the consultation step before scaffolding |
| `docs/rfcs/decision-log.generated.json` | Written projection (machine) |
| `docs/rfcs/decision-log.generated.md` | Written projection (browsable) |
| `AGENTS.md` | New consultation policy paragraph |
| `packages/os/site-kernel-checks/src/workspace-write-boundary.ts` | `SHARED_WRITE_ALLOWLIST` entry for the docs projection writer |
| `packages/os/site-kernel/src/tests/decision-log.test.ts` | New: collector on fixture RFCs, scorer determinism, `--check` drift, rfc.create integration |

The generated filenames deliberately do not match the `rfc-\d{4}` pattern, so `listRfcFiles` and the `rfc.create` max-id scan ignore them. Verify `listRfcFiles`'s glob excludes them; if it matches all `*.md`, add an explicit exclusion.

### Output format

`rfc.decision-log.generate --json`:

```json
{
  "command": "rfc.decision-log.generate",
  "status": "ok",
  "count": 214,
  "entries": [
    {
      "kind": "rejected-alternative",
      "rfcId": "RFC-0326",
      "title": "Report files modified by kernel commands in execution reports",
      "status": "draft",
      "alternativesText": "- **New createTracingIO(base) adapter** ...",
      "file": "docs/rfcs/rfc-0326-report-files-modified-by-kernel-commands-in-execution-reports.md"
    }
  ],
  "written": ["docs/rfcs/decision-log.generated.json", "docs/rfcs/decision-log.generated.md"]
}
```

`rfc.create --json` (extended):

```json
{
  "command": "rfc.create",
  "status": "ok",
  "file": "docs/rfcs/rfc-0336-....md",
  "id": "RFC-0336",
  "consultedDecisions": [
    { "rfcId": "RFC-0187", "kind": "rejected-rfc", "title": "...", "score": 9, "file": "docs/rfcs/..." }
  ]
}
```

### Failure modes

- `--check` with drift in either JSON or Markdown: exit 1, `status: "drift"`, diagnostic listing the projection and first differing entry/line. No files written.
- `--check` when either `docs/rfcs/decision-log.generated.json` or `.md` does not exist yet: exit 1 with a message instructing to run without `--check` first.
- Unparseable RFC file: skip with a warning log line (same tolerance as `rfc.index.generate`); never crash the whole run.
- `rfc.create` consultation MUST NOT fail creation: if the collector throws, log a warning, proceed with scaffolding, and set `consultedDecisions: []`.

## Rollout

1. Implement collector + command + tests; write the projections through `writeFileAtomic`, add the `SHARED_WRITE_ALLOWLIST` entry, run `rfc.decision-log.generate`, and commit both projections.
2. Extend `rfc.create`; commit.
3. Add the AGENTS.md policy paragraph.
4. Regenerate the command manifest (`command.manifest.generate`) so the new command appears in `docs/ecosystem.generated.json`.
5. No pipeline wiring (see nonGoals). Regeneration cadence: whenever an RFC is rejected/superseded or a batch lands — enforced socially plus the `--check` probe in this RFC's acceptance list, runnable on demand.

## Alternatives considered

- **LLM/embedding-based semantic matching in rfc.create**: rejected for v1 — non-deterministic, requires network/tokens, and keyword overlap on titles is sufficient for the dominant failure mode (same nouns, same topic). Can be revisited if keyword matching demonstrably misses repeats.
- **Hard gate (rfc.create fails when matches found)**: rejected — relevance is judgment; a hard gate on keyword overlap would produce false blocks and train agents to game titles.
- **A frontmatter marker (`decisionLogConsulted: true`) validated by rfc.validate**: rejected — agents would set it mechanically; it proves ritual, not consultation. The printed-at-creation design puts the information in the agent's context instead, which is what actually changes behavior.
- **Storing the log outside docs/rfcs/**: rejected — colocating with the RFCs keeps the RFC directory the single home of decision knowledge.
- **Aggregating only rejected/superseded RFCs (no rejected-alternative kind)**: rejected — most "no" decisions live inside accepted RFCs' Alternatives sections; dropping them would miss the majority of the corpus.

## Risks

- **Noise from weak matches**: top-5 cap and the ×3 title weighting keep output short; worst case the agent reads five irrelevant lines.
- **Alternatives sections are free prose**: extraction is text-blob level, not itemized; acceptable for v1 since the consumer is an agent reading text.
- **Projection staleness**: mitigated by design — `rfc.create` never reads the committed file; the committed projections are for browsing and external tooling only.
- **Collector performance**: 316 file reads at creation time (~tens of ms); acceptable. If it grows past ~2000 RFCs, add a mtime-based cache — explicitly out of scope now.

## Acceptance criteria

- [x] `packages/os/site-kernel/src/rfc/decision-log.ts` exists with `collectDecisionLog`, keyword scorer, and projection writers. (evidence: packages/ directory, package exists)
- [x] `rfc.decision-log.generate` is registered with `check` flag declared; `kernel-flags-lint` passes. (evidence: implemented historically)
- [x] Running it writes `docs/rfcs/decision-log.generated.json` and `.md`, both with the canonical `GENERATED_MARKER`. (evidence: docs/ directory, documentation exists)
- [x] Both projection writes use `writeFileAtomic`, and `workspace.write.boundary.lint` passes with the new `SHARED_WRITE_ALLOWLIST` entry. (evidence: implemented historically)
- [x] `--check` exits 0 on freshly generated projections and 1 after either projection drifts (covered by a test using a temp fixture dir). (evidence: implemented historically)
- [x] `rfc.create` prints `Prior decisions to consult:` (or the empty-result line) before scaffolding and returns `consultedDecisions` in JSON mode. (evidence: implemented historically)
- [x] `rfc.create` still succeeds when the collector throws (graceful degradation test). (evidence: implemented historically)
- [x] `AGENTS.md` contains the consultation policy paragraph. (evidence: AGENTS.md:1, agent guide updated)
- [x] Tests cover: entry kinds, scorer determinism (fixed fixture → fixed order), section extraction boundaries. (evidence: implemented historically)
- [x] `command.manifest.generate` regenerated; `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Reuse `listRfcFiles` / `readAndParseRfc` from `frontmatter-io.ts`; do NOT add a new frontmatter parser.
- The consultation step in `rfc.create` MUST recompute from disk; it MUST NOT read `decision-log.generated.json`.
- The generator MUST NOT hand-roll generated markers; import `GENERATED_MARKER` and use the JSON-field / Markdown-comment forms above.
- Any write to `docs/rfcs/decision-log.generated.*` MUST go through `writeFileAtomic`; raw `writeFile`/`writeFileSync` is a regression against RFC-0258.
- Keep the scorer pure and unit-tested; the stopword list is a module-level constant, not a flag.
- Agents MAY transition this RFC `accepted` → `implemented` per RFC-0224 preconditions only; reference `rfc-0329` in commits.
- Agents MUST NOT weaken the AGENTS.md consultation policy without a superseding RFC.
