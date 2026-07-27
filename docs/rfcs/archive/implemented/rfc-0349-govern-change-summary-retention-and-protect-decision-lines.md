---
id: RFC-0349
title: "Govern CHANGE_SUMMARY retention and protect decision lines"
status: implemented
kind: contract
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
  - RFC-0329
  - RFC-0348
satisfies:
  - DNA-42
commands:
  proposed: []
  added:
    - compass.changesummary.validate
    - compass.changesummary.tidy
  changed: []
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/os/site-kernel-checks
successSignals:
  - "Every CHANGE_SUMMARY item that references an RFC id or an internal code (RFC-XXXX, DNA-NN, AP-N, V-NN, VIS-BG-NN, or any UPPER-token-…-digits id) is preserved forever; no command or agent removes it."
  - "grace.changesummary.tidy removes backfill boilerplate items and caps the number of unprotected items to the newest 3, never touching a protected item."
  - "grace.changesummary.validate fails when an authored file's CHANGE_SUMMARY contains a known boilerplate item or more than 3 unprotected items."
  - "The accumulated CHANGE_SUMMARY of a long-lived file reads as a decision log of RFC-referenced changes, not a pile of 'Backfill GRACE scaffolding' lines."
nonGoals:
  - "Do not change which blocks are required — that is RFC-0348 (CHANGE_SUMMARY remains one of the two required blocks)."
  - "Do not audit the truthfulness of CHANGE_SUMMARY against code — that is RFC-0352."
  - "Do not delete protected (RFC/code-referencing) items under any circumstance, even if they also look like boilerplate."
  - "Do not attempt to reconstruct removed history from git — CHANGE_SUMMARY is a curated decision log, not a mirror of git log."
---

# RFC-0349: Govern CHANGE_SUMMARY retention and protect decision lines

## Context

RFC-0348 keeps `CHANGE_SUMMARY` as one of the two required GRACE blocks. It is the only element of the markup that can carry information git does not: _why_ a change was made and _which RFC changed the contract of this file_. Real examples already do this well — `packages/share/src/page.ts` carries a decision log referencing RFC-0091/0262/0263/0264, including why a constant was deleted. That is exactly what an agent wants before editing.

But the block has no governance. Two failure modes coexist:

1. **Boilerplate noise.** The vast majority of entries created by the LLM backfill are lines like `Backfill GRACE scaffolding`, `Wave 1: Initial creation`, or `Backfill revision to establish architectural scaffolding`. They carry no decision and cannot be trusted as a source of truth.
2. **Unbounded growth.** Nothing caps the block, so a busy file could accumulate dozens of low-value lines, re-inflating the very token cost RFC-0348 cut.

The founder's directive is explicit: keep `CHANGE_SUMMARY`, add cleanup rules, and hold one invariant — **never delete a line that references an RFC or an internal code.**

## Problem

- **No retention policy.** There is no rule for how many `CHANGE_SUMMARY` items to keep or which to drop, so cleanup is ad hoc and risks deleting valuable decision lines.
- **No protection for decision lines.** The most valuable entries (RFC/code references) have the same status as boilerplate. A naive "keep last N" cleanup would delete them.
- **Boilerplate is never removed.** The backfill junk stays forever because nothing removes it and no rule flags it.

## Decision

Introduce a retention contract for `CHANGE_SUMMARY`, one protected class of items that is never removed, and two commands: a validator and a deterministic tidier.

### Protected items (never removed, never capped)

A `CHANGE_SUMMARY` `<item>` is **protected** if its text contains an internal-code reference, matched by:

```
/\b([A-Z][A-Z0-9]*-)+\d+\b/
```

This matches `RFC-0348`, `DNA-42`, `AP-3`, `V-24`, `DNA-TRACE-01`, `VIS-BG-01`, `BIOME-TOKEN-01`, and any current or future `UPPER-token(-token)*-digits` identifier. Protected items are preserved verbatim and in original order, with no cap. This encodes the founder invariant: **a line referencing an RFC or internal code is never deleted.**

### Boilerplate items (removed by tidy, flagged by validate)

An `<item>` is **boilerplate** if it is **not protected** and its trimmed text matches (case-insensitive):

```
/^(Wave\s+\d|Backfill\b|Backfill GRACE|Backfill revision|Initial creation|GRACE scaffolding|Created as part of|Enhance .* with GRACE)/i
```

Protection always wins: an item that matches a boilerplate pattern **but is also protected** (e.g. `Wave 1 (RFC-0026): Initial creation`) is protected and kept.

### Retention cap (unprotected, non-boilerplate items)

Among items that are neither protected nor boilerplate, keep the **newest 3** (the last 3 in file order, which is chronological — newest last). Older ones beyond the cap are dropped by `grace.changesummary.tidy`.

### `grace.changesummary.tidy` (mutating, deterministic, no LLM)

For each authored file (`authoringStatus === "authored"`), rewrite its `CHANGE_SUMMARY` to:

1. All protected items, verbatim, in original order.
2. Drop every boilerplate item.
3. Of the remaining unprotected items, keep the newest 3 (drop older ones).

Order in the rewritten block: preserve the original relative order of all kept items (protected and unprotected interleaved as they appeared). Write atomically only if changed. Report `{ path, removed: string[], kept: number }`. Idempotent.

If a file's `CHANGE_SUMMARY` would become empty (all items were boilerplate and there were no protected/kept items), tidy inserts a single item: `Tidied by grace.changesummary.tidy; see git history for prior entries.` — so the required block (RFC-0348) is never emptied.

### `grace.changesummary.validate` (fast, side-effect-free)

For each authored file, fail (exit 1) with a `Diagnostic` when its `CHANGE_SUMMARY`:

| Rule id | Condition | Severity | Fix |
| --- | --- | --- | --- |
| `GRACE-CS-01` | Contains a boilerplate item | error | `fix: run grace.changesummary.tidy` |
| `GRACE-CS-02` | More than 3 unprotected non-boilerplate items | error | `fix: run grace.changesummary.tidy (cap is 3 unprotected items)` |

Protected items never trigger a violation regardless of count.

## Architectural fit

- **DNA-42 (RFC-0348):** CHANGE_SUMMARY is part of the markup contract; this RFC governs its content and is traced to the same invariant.
- **RFC-0329 (RFC decision log):** The protection rule mirrors the ecosystem's treatment of decisions as durable, machine-referenced records. CHANGE_SUMMARY becomes a per-file decision log with the same "RFC-referenced lines are load-bearing" principle.
- **RFC-0203 (Diagnostic model):** Violations are `Diagnostic` records with `file`, `ruleId`, and `fix:` lines.
- **Pipeline placement:** `grace.changesummary.validate` runs in the standard GRACE pipeline right after `grace.validate`. `grace.changesummary.tidy` is a mutating fixer, not in any pipeline (mirrors the ecosystem's validate/fix separation).

## Design

### CLI surface

```sh
# Flag boilerplate + over-cap CHANGE_SUMMARY blocks (fast, read-only)
pnpm exec site-kernel run grace.changesummary.validate --all

# Deterministically tidy every authored file's CHANGE_SUMMARY
pnpm exec site-kernel run grace.changesummary.tidy --all

# Scope to one app or the packages
pnpm exec site-kernel run grace.changesummary.tidy --app webgogol-com
pnpm exec site-kernel run grace.changesummary.tidy --packages
```

### TypeScript contracts

```ts
type ChangeSummaryItemClass = "protected" | "boilerplate" | "unprotected";

interface ChangeSummaryTidyResult {
  command: "grace.changesummary.tidy";
  status: "ok";
  files: Array<{ path: string; removed: string[]; kept: number }>;
}

interface ChangeSummaryValidateResult {
  command: "grace.changesummary.validate";
  status: "pass" | "fail";
  diagnostics: Diagnostic[]; // GRACE-CS-01, GRACE-CS-02
  checkedFiles: number;
}
```

### Classification helper (single source of truth)

Both commands share one pure function so they cannot disagree:

```ts
const PROTECTED_RE = /\b([A-Z][A-Z0-9]*-)+\d+\b/;
const BOILERPLATE_RE = /^(Wave\s+\d|Backfill\b|Backfill GRACE|Backfill revision|Initial creation|GRACE scaffolding|Created as part of|Enhance .* with GRACE)/i;

function classifyChangeSummaryItem(text: string): ChangeSummaryItemClass {
  if (PROTECTED_RE.test(text)) return "protected";
  if (BOILERPLATE_RE.test(text.trim())) return "boilerplate";
  return "unprotected";
}
```

This function is a pure string→enum mapping and MUST have property-based coverage per DNA-41 (protection dominates boilerplate; classification is stable under whitespace).

### Failure modes

- **A legitimate change happens to match a boilerplate prefix but has no code reference** (e.g. `Backfill the missing alt text`). It would be classed boilerplate and removed by tidy. Mitigation: the boilerplate patterns are anchored to the specific GRACE-generation phrases, not general English; `Backfill\b` is intentionally narrow, and authors are told to reference the RFC/ticket (which makes the item protected).
- **Protected items grow without bound.** By design — protected items are the decision log the founder wants preserved. The cap applies only to unprotected chatter.

## Rollout

### Phase 1 — Commands (this RFC)

1. Implement the shared `classifyChangeSummaryItem` helper + `grace.changesummary.validate` + `grace.changesummary.tidy` in `packages/os/site-kernel-checks`.
2. Register both in the command table and `index.ts`.
3. Register `grace.changesummary.validate` in `STANDARD_GRACE_PIPELINE` and `APPS_CHECK_AUTHOR_PIPELINE` after `grace.validate`.

### Phase 2 — One-time tidy (same commit)

4. Run `grace.changesummary.tidy --all` to strip the accumulated backfill boilerplate across the repo.
5. Run `grace.changesummary.validate --all` — must be green.

### Default behavior

- **Fail-hard** for `grace.changesummary.validate` (boilerplate/over-cap is an error) once the one-time tidy has cleaned the repo in the same commit.

## Alternatives considered

- **Replace CHANGE_SUMMARY with a `git log` reference.** Rejected. `git log` gives commit messages, not "which RFC changed this file's contract and why"; the curated decision log is strictly more useful to an agent and is what the founder chose to keep.
- **Cap by total item count regardless of class.** Rejected. It would eventually delete protected decision lines, violating the founder invariant.
- **LLM-summarize old items into one.** Rejected — non-deterministic, needs an API key, and manufactures prose with the authority of a decision record but no provenance (the exact anti-pattern this whole series removes).

## Risks

- **Over-aggressive boilerplate removal.** A `tidy` run could drop an unprotected item an author considered meaningful. Mitigation: the boilerplate patterns are anchored to the specific GRACE-generation phrases (not general English), the cap keeps the newest 3 unprotected items, and any item referencing an RFC/ticket is protected — authors are told to reference the driver, which both documents and protects the line.
- **Regex drift as new id schemes appear.** A future internal-code scheme that does not match `PROTECTED_RE` would leave its lines unprotected. Mitigation: `PROTECTED_RE` is deliberately generic (`UPPER-token(-token)*-digits`), covering `RFC/DNA/AP/V/DNA-TRACE/VIS-BG/BIOME-TOKEN` and any similar id; new schemes should follow that shape.
- **One-time tidy churn.** The initial `tidy --all` touches many files. Mitigation: it is a single deterministic pass committed once; re-running is a no-op, so the diff is verifiable by re-execution.

## Acceptance criteria

- [x] `classifyChangeSummaryItem` implemented as a shared pure function with property-based tests (DNA-41). (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `grace.changesummary.validate` emits `GRACE-CS-01` (boilerplate) and `GRACE-CS-02` (over-cap) and fails on either. (evidence: implemented historically)
- [x] `grace.changesummary.tidy` preserves all protected items, drops boilerplate, caps unprotected to newest 3, never empties the block, is idempotent. (evidence: implemented historically)
- [x] Both registered in the command table + `index.ts`; validate wired into `STANDARD_GRACE_PIPELINE` and `APPS_CHECK_AUTHOR_PIPELINE`. (evidence: packages/os/site-kernel-checks/src/pipelines/, pipeline integration)
- [x] `grace.changesummary.tidy --all` executed; `grace.changesummary.validate --all` green. (evidence: implemented historically)
- [x] No protected (RFC/code-referencing) CHANGE_SUMMARY item was removed by the tidy pass (verify by diffing that removed lines never match `PROTECTED_RE`). (evidence: implemented historically)
- [x] `rfc.validate` and `rfc.dna.trace.validate` pass. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted` or `implemented`. Depends on RFC-0348 being implemented first (CHANGE_SUMMARY shape).
- Agents MAY transition `accepted → implemented` per RFC-0224; reference `RFC-0349` in commits.
- When you add a `CHANGE_SUMMARY` item, reference the RFC or ticket that motivated the change (`RFC-XXXX: …`). This both documents the decision and makes the line permanently protected.
- Never hand-delete a `CHANGE_SUMMARY` item that references an RFC or internal code. If it is wrong, correct it in place (still referencing the code); do not drop it.
- Use `grace.changesummary.tidy` to clean boilerplate — never delete lines by hand in bulk.
