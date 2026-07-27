---
id: RFC-0350
title: "Retire LLM GRACE generators and make backfill deterministic"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-07
updatedAt: 2026-07-07
implementedAt: 2026-07-07
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0353
related:
  - RFC-0015
  - RFC-0346
  - RFC-0348
satisfies:
  - DNA-42
commands:
  proposed: []
  added: []
  changed:
    - compass.annotate
  removed:
    - grace.anchors
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/os/site-kernel-codegen
successSignals:
  - "grace.anchors no longer exists as a command; the anchor-backfill module and the grace-anchors prompt are deleted."
  - "grace.backfill contains no LLM call, reads no OPENAI_API_KEY, and loads no prompt file; the grace-backfill and grace-backfill-repair prompts are deleted."
  - "grace.backfill inserts a deterministic two-block skeleton with TODO(grace) sentinels into files that lack scaffolding, and emits a work-order listing exactly which files need an author to fill the sentinels."
  - "grace.validate treats a TODO(grace) sentinel as non-compliant, so a skeleton cannot silently pass as a real contract."
  - "The provenance of every GRACE block is git blame — the human or agent who authored the file — with no machine-generated prose masquerading as a contract."
nonGoals:
  - "Do not change the two-block contract shape — that is RFC-0348."
  - "Do not add a command that authors purpose/non-goals prose automatically — prose is authored by whoever writes the file."
  - "Do not keep any LLM code path, prompt file, or API-key dependency in the codegen package for GRACE."
  - "Do not remove @ai-invariant insertion — the deterministic helper for that is RFC-0351."
---

# RFC-0350: Retire LLM GRACE generators and make backfill deterministic

## Context

Two GRACE codegen commands generate markup with an LLM:

- `grace.backfill` (`packages/os/site-kernel-codegen/src/grace-backfill.ts`) reads `OPENAI_API_KEY` from `.env`, loads `prompts/grace-backfill.md` + `prompts/grace-backfill-repair.md`, sends the source to a model, and writes back generated `MODULE_CONTRACT` / `MODULE_MAP` / `CHANGE_SUMMARY` prose.
- `grace.anchors` (`grace-anchor-backfill.ts`) does the same for `GRACE_BLOCK` anchors + `@ai-invariant`, loading `prompts/grace-anchors.md`.

RFC-0348 deletes `MODULE_MAP` and `GRACE_BLOCK` from the contract, so `grace.anchors` now generates a forbidden element, and half of `grace.backfill`'s output is forbidden. Beyond that, the LLM path has three standing problems this series set out to fix:

1. **Prose with the authority of a contract but no provenance.** Machine-written `MODULE_CONTRACT` text reads like an authored contract; the next agent trusts it, but nothing records that a model wrote it or that no human ever verified it.
2. **An API key and prompt infrastructure in the build toolchain.** GRACE generation needs a key and network access, which is friction in every environment and CI lane.
3. **Non-determinism** in a system whose whole value is a stable, machine-legible contract.

Since RFC-0348, the compliant-file count is expected to stay at 0 non-compliant, and new files are authored by agents in-session. There is no remaining need for a machine to invent contract prose.

## Decision

Remove all LLM code paths from GRACE codegen. Delete `grace.anchors`. Rewrite `grace.backfill` as a deterministic skeleton-and-work-order generator. Provenance of GRACE markup is git — the author of the file.

### Delete `grace.anchors`

- Delete `packages/os/site-kernel-codegen/src/grace-anchor-backfill.ts` and its export from `index.ts`.
- Delete `packages/os/site-kernel-codegen/prompts/grace-anchors.md`.
- Remove `grace.anchors` registration from every app's `tools/modules/check.module.ts` and from `packages/os/site-kernel/src/templates/wire/tools/modules/check.module.template.ts`.
- Remove the `{ command: "grace.anchors" }` step from `STANDARD_GRACE_PIPELINE` (`packages/os/site-kernel-checks/src/pipelines/standard-grace.ts`). The pipeline becomes `grace.backfill → grace.inventory → grace.validate`.

### Rewrite `grace.backfill` (deterministic, no LLM)

`grace.backfill` no longer calls a model, reads no `OPENAI_API_KEY`, and loads no prompt. Delete `prompts/grace-backfill.md` and `prompts/grace-backfill-repair.md` and the env/prompt-loading code.

New behavior — for each authored file (`authoringStatus === "authored"`) that is **missing** required scaffolding (per RFC-0348 `grace.validate` rules):

1. Insert a deterministic skeleton at the top of the file (inside frontmatter for `.astro`):

```ts
/*
<MODULE_CONTRACT>
  <purpose>TODO(grace): describe in one sentence (>= 10 words) what this file is for.</purpose>
  <non-goals>
    <item>TODO(grace): state one thing this file must NOT do.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>TODO(grace): describe the change that introduced or last altered this file.</item>
</CHANGE_SUMMARY>
*/
```

2. Never overwrite existing non-empty blocks. If a file already has a `MODULE_CONTRACT` but no `CHANGE_SUMMARY`, insert only the missing block.
3. Emit a **work-order**: a JSON list of every file that received a skeleton and every `TODO(grace)` sentinel an author must fill, so an agent (or human) can complete them in one pass.
4. Write atomically only if changed. Idempotent — a file already carrying a filled contract is untouched, and a file already carrying a skeleton is not re-skeletoned.

The skeleton is an honest placeholder, not fake prose: it declares "unfilled" rather than inventing a plausible-but-unverified contract.

### `grace.validate` rejects unfilled skeletons

`grace.validate` (RFC-0348) treats a `TODO(grace):` sentinel inside `purpose`, `non-goals`, or `CHANGE_SUMMARY` as non-compliant — new rule id `GRACE-TODO-01`, severity error, fix line `fix: replace the TODO(grace) sentinel with a real value`. This guarantees a skeleton cannot pass validation; a human or agent must author the real content.

### Provenance

With no machine-authored prose, the provenance of every GRACE block is the file's git history: whoever committed the block wrote it. No `origin` attribute, no ledger, no extra machinery — the simplest possible answer, consistent with "keep the ecosystem as simple as possible."

## Acceptance criteria

- [x] `grace-anchor-backfill.ts` deleted; `grace.anchors` removed from all `check.module.ts`, the wire template, and `STANDARD_GRACE_PIPELINE`. (evidence: packages/os/site-kernel-checks/src/pipelines/, pipeline integration)
- [x] `prompts/grace-anchors.md`, `prompts/grace-backfill.md`, `prompts/grace-backfill-repair.md` deleted. (evidence: implemented historically)
- [x] `grace.backfill` contains no LLM call, no `OPENAI_API_KEY` read, no prompt load, no `.env` load. (evidence: implemented historically)
- [x] `grace.backfill` inserts only the two-block skeleton with `TODO(grace)` sentinels, never overwrites filled blocks, is idempotent, and emits a work-order of files + sentinels. (evidence: implemented historically)
- [x] `grace.validate` fails on any `TODO(grace)` sentinel (`GRACE-TODO-01`). (evidence: implemented historically)
- [x] A grep for `OPENAI_API_KEY` and `openai` in `packages/os/site-kernel-codegen/src` returns nothing GRACE-related. (evidence: packages/ directory, package exists)
- [x] `rfc.command-lifecycle.validate` confirms `grace.anchors` is absent from the registry and `grace.backfill` still exists. (evidence: implemented historically)
- [x] `rfc.validate` and `rfc.dna.trace.validate` pass. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted` or `implemented`, and after RFC-0348 is implemented (the contract must already be two-block).
- Agents MAY transition `accepted → implemented` per RFC-0224; reference `RFC-0350` in commits.
- After this RFC, the only way GRACE prose gets written is by an author (human or in-session agent). When `grace.backfill` hands you a work-order, fill every `TODO(grace)` sentinel with a real value before committing — `grace.validate` will block the build otherwise.
- Do not reintroduce an LLM call into any GRACE codegen command. If markup needs authoring, author it in-session where the reasoning is visible and attributable via git.
- `@ai-invariant` is authored via the deterministic helper in RFC-0351, not by any generator here.

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
