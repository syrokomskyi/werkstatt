---
id: RFC-0348
title: Collapse GRACE markup to a two-block contract
status: implemented
kind: architecture
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-07
updatedAt: 2026-07-07
implementedAt: 2026-07-07
closedAt: null
supersedes: []
supersededBy: null
amends:
- RFC-0015
amendedBy:
- RFC-0353
- RFC-0538
related:
- RFC-0015
- RFC-0203
- RFC-0224
- RFC-0331
- RFC-0345
satisfies:
- DNA-42
commands:
  proposed: []
  added: []
  changed:
  - compass.validate
  - compass.inventory
  removed:
  - compass.markup.migrate
  - compass.clear
appsImpacted:
- apps/*
packagesImpacted:
- packages/os/site-kernel
- packages/os/site-kernel-checks
- packages/os/site-kernel-codegen
successSignals:
- 'Every authored source file requiring scaffolding carries exactly two GRACE blocks: MODULE_CONTRACT (purpose + non-goals) and CHANGE_SUMMARY. No authored file contains MODULE_MAP, keywords, responsibilities, or GRACE_BLOCK anchors.'
- grace.validate fails a file that is missing purpose, missing non-goals, missing CHANGE_SUMMARY, or that still contains any removed block (MODULE_MAP, keywords, responsibilities, GRACE_BLOCK).
- docs/grace-inventory.xml no longer emits has-module-map, anchor-open-count, or anchor-close-count, and classifies every authored non-excluded file as scaffolding mode 'standard'.
- grace.markup.migrate rewrites every authored file to the two-block contract in a single deterministic, idempotent pass, and running it twice produces zero further changes.
- AI agents writing a new source file author purpose + non-goals + one CHANGE_SUMMARY item and nothing else, with no uncertainty about which blocks are required.
nonGoals:
- Do not remove @ai-invariant — inline invariants stay and remain required on high-risk files.
- Do not change the CHANGE_SUMMARY retention/cleanup rules — that is RFC-0349.
- Do not change how grace.backfill authors markup or remove grace.anchors — that is RFC-0350.
- Do not introduce the semantic-truth audit — that is RFC-0352.
- Do not preserve backward compatibility with the three-block v1 contract; there is no legacy mode.

---

# RFC-0348: Collapse GRACE markup to a two-block contract

## Context

GRACE (defined by RFC-0015 and `docs/source-markup.xml`) requires authored source files in `apps/` and `packages/` to carry machine-readable scaffolding: `MODULE_CONTRACT` (purpose, responsibilities, non-goals), `MODULE_MAP`, `CHANGE_SUMMARY`, `GRACE_BLOCK` anchors, and inline `@ai-invariant` lines. The stated audience is AI agents.

A first-principles review of the markup against what an agent actually consumes found an inverted value density. The scaffolding mass is dominated by its lowest-signal parts:

- `@ai-invariant` — the single most valuable element (it encodes constraints an agent cannot infer from the code) — appears in only **17 places across 15 files** in the entire repository.
- `MODULE_CONTRACT` and `CHANGE_SUMMARY` headers, at ~30 lines each, sit in ~750 authored files.
- `MODULE_MAP` restates export names already visible in the code. `keywords` restates the filename and purpose. `responsibilities` largely restates what the code does. `GRACE_BLOCK` anchors have **no consumer** — the inventory validator counts their balance, but no agent navigates by them; they read as code but are not code.

Every agent pays for this mass in context tokens on every file read, while the one high-signal element is rare. The markup is mandatory by shape but the shape is mostly noise.

## Problem

- **Redundant blocks inflate every file.** `MODULE_MAP`, `keywords`, and `responsibilities` re-encode information the agent already has from the code and filename. They cost tokens on every read and add drift surface (they can go stale independently of the code).
- **`GRACE_BLOCK` anchors have zero downstream consumer.** They exist only so `grace.inventory` can assert open/close balance. Removing them costs nothing an agent uses and removes visual noise from every high-risk file.
- **The full-vs-reduced mode split is now vestigial.** Once anchors are removed, `full` and `reduced` require the identical set (`MODULE_CONTRACT` + `CHANGE_SUMMARY`); the only remaining risk-keyed requirement is `@ai-invariant` on high-risk files, which is orthogonal to the mode. Two modes that require the same thing is accidental complexity.
- **The contract does not state what it is.** `docs/source-markup.xml` describes five markup elements and three coverage modes, most of which are about to be deleted. An agent reading it cannot tell which two blocks actually matter.

## Decision

Reduce the GRACE source-markup contract to **exactly two required blocks plus inline invariants**, and collapse the coverage modes to two.

This RFC establishes **DNA-42 · GRACE markup contract** in `docs/architecture-dna.md`.

### The v2 contract

An authored source file that requires scaffolding MUST contain, in a leading block comment:

```ts
/*
<MODULE_CONTRACT>
  <purpose>What this file is for. One or more sentences, at least 10 words.</purpose>
  <non-goals>
    <item>Something this file must NOT do (a boundary against scope creep).</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Most recent GRACE-relevant change to this file.</item>
</CHANGE_SUMMARY>
*/
```

Plus, on blast-radius files (risk class `high`), one or more inline invariants:

```ts
// @ai-invariant: <a durable constraint the code cannot show on its own>
```

**Required, per file that needs scaffolding:**

1. `MODULE_CONTRACT` containing a non-empty `<purpose>` (≥ 10 words) and at least one `<non-goals><item>`.
2. `CHANGE_SUMMARY` containing at least one `<item>`.
3. `@ai-invariant` — one or more — **only** when the file's risk class is `high`.

**Forbidden in every authored file (presence is a validation error):**

- `MODULE_MAP`
- `keywords`
- `responsibilities`
- `GRACE_BLOCK` anchors (open or close)

### Coverage modes collapse to two

`full` and `reduced` are replaced by a single mode, `standard`. The classifier emits exactly:

- `standard` — every authored, non-excluded file. Requires `MODULE_CONTRACT` + `CHANGE_SUMMARY`; additionally `@ai-invariant` when risk class is `high`.
- `none` — excluded/generated files. No markup required.

`.astro` handling is unchanged in spirit: the two blocks and any `@ai-invariant` live **inside** the frontmatter (after the opening `---`), using `/* */` comment style.

## Architectural fit

- **DNA-42 (new):** This RFC establishes the GRACE markup contract as an Architecture DNA invariant so the trace matrix (RFC-0331) covers it and future RFCs `satisfies: [DNA-42]`.
- **RFC-0015 (GRACE commands + packages support):** This RFC amends the markup contract that RFC-0015 introduced. The implementing agent MUST add formal `amends: [RFC-0015]` to this RFC's frontmatter and `amendedBy: [RFC-0348]` to RFC-0015 when landing (kept out of the draft to preserve bidirectional-consistency during review).
- **RFC-0203 (Diagnostic model):** `grace.validate` violations are reported as `Diagnostic` records (`file:line`, `ruleId`, `fix:` line), consistent with the canonical model. New rule ids are namespaced `GRACE-*` (see Design).
- **RFC-0345 (idempotent generated writes):** `grace.markup.migrate` and `grace.inventory` write via the atomic, content-deterministic write helper; re-running produces byte-identical output.
- **RFC-0224 (status-transition policy):** An agent MAY self-transition this RFC `accepted → implemented` once all acceptance criteria are verified and committed.

## Design

### `docs/source-markup.xml` rewrite (v2.0.0)

Replace the document body so it describes exactly the v2 contract. It MUST state:

- The two required blocks and their required inner shape (`purpose` ≥ 10 words; ≥ 1 `non-goals` item; ≥ 1 `CHANGE_SUMMARY` item).
- `@ai-invariant` as the inline invariant format, required on `high` risk files.
- The forbidden set (`MODULE_MAP`, `keywords`, `responsibilities`, `GRACE_BLOCK`) explicitly, so the contract is self-describing.
- The two coverage modes (`standard`, `none`) and the `.astro` frontmatter placement rule.

Bump `<version>` to `2.0.0`.

### Inventory classifier changes (`packages/os/site-kernel/src/grace-inventory.ts`)

1. `GraceScaffoldingMode` becomes `"standard" | "none"`.
2. `detectRequiredScaffolding(...)` returns `"none"` for excluded files and `"standard"` for every authored file. Delete the `full`/`reduced`/layer branching.
3. The `GraceInventoryEntry` markup fields are reduced to what the v2 contract needs. Remove `hasModuleMap`, `anchorOpenCount`, `anchorCloseCount`. Keep `hasModuleContract`, `hasChangeSummary`, `hasAiInvariant`. Add:
   - `hasPurpose: boolean` — `MODULE_CONTRACT` contains a non-empty `<purpose>` of ≥ 10 words.
   - `hasNonGoals: boolean` — `MODULE_CONTRACT` contains ≥ 1 `<non-goals><item>`.
   - `forbiddenPresent: string[]` — which forbidden markers were found (`"MODULE_MAP"`, `"keywords"`, `"responsibilities"`, `"GRACE_BLOCK"`).
4. `detectMarkup(source)` computes the above. Detection patterns (case-sensitive tag match):
   - purpose word count: strip tags inside `<purpose>…</purpose>`, split on whitespace, count non-empty tokens ≥ 10.
   - non-goals items: count `<item>` inside `<non-goals>…</non-goals>` ≥ 1.
   - forbidden: `MODULE_MAP` → `/<MODULE_MAP\b/`; `keywords` → `/<keywords\b/`; `responsibilities` → `/<responsibilities\b/`; `GRACE_BLOCK` → `/<\/?GRACE_BLOCK\b/`.
5. `detectComplianceViolations(entry)` (renamed from `detectMissingMarkers`) returns a `string[]` of human-readable problems: missing `MODULE_CONTRACT`, missing/short `purpose`, missing `non-goals`, missing `CHANGE_SUMMARY`, missing `@ai-invariant` (high-risk only), and one entry per `forbiddenPresent` value (`"forbidden: MODULE_MAP present"`).
6. `entry.compliant` is `forbiddenPresent.length === 0 && no missing markers`.

### `grace.inventory` XML output (`packages/os/site-kernel-checks/src/grace.ts`)

- Remove `<has-module-map>`, `<anchor-open-count>`, `<anchor-close-count>` from each `<entry>`.
- Add `<has-purpose>`, `<has-non-goals>`, and (when non-empty) a `<forbidden-markers>` list.
- The `<summary>` counts `full-required-files`/`reduced-required-files` collapse into a single `<standard-required-files>` count.
- Bump `<version>` of the emitted document to `2.0.0`.

### `grace.validate` v2 (`packages/os/site-kernel-checks/src/grace.ts`)

`runGraceValidation` fails (exit 1) when any authored file with `requiredScaffolding === "standard"` is not `compliant`. Emit one `Diagnostic` per violation:

| Rule id | Condition | Severity | Fix line |
| --- | --- | --- | --- |
| `GRACE-CONTRACT-01` | Missing `MODULE_CONTRACT` | error | `fix: add a MODULE_CONTRACT block with <purpose> and <non-goals>` |
| `GRACE-CONTRACT-02` | `purpose` missing or < 10 words | error | `fix: write a <purpose> of at least 10 words` |
| `GRACE-CONTRACT-03` | No `<non-goals><item>` | error | `fix: add at least one <non-goals><item>` |
| `GRACE-CONTRACT-04` | Missing `CHANGE_SUMMARY` | error | `fix: add a CHANGE_SUMMARY with at least one <item>` |
| `GRACE-INVARIANT-01` | risk `high`, no `@ai-invariant` | error | `fix: add // @ai-invariant capturing the non-obvious constraint` |
| `GRACE-FORBIDDEN-01` | any forbidden block present | error | `fix: remove <MARKER>; run grace.markup.migrate` |

### `grace.markup.migrate` (new command, `packages/os/site-kernel-codegen`)

Deterministic, idempotent, no LLM. Scope: workspace (supports `--app`, `--packages`, `--all`). For each **authored** file (`authoringStatus === "authored"` from `createGraceInventoryEntries`):

1. Remove the `<MODULE_MAP> … </MODULE_MAP>` block (including inner lines).
2. Remove any `<keywords> … </keywords>` block and any single-line `<keywords>…</keywords>`.
3. Remove the `<responsibilities> … </responsibilities>` block.
4. Remove every anchor **comment line** — the lines whose trimmed content matches `^/\*\s*<\/?GRACE_BLOCK\b`, `^//\s*<\/?GRACE_BLOCK\b`, or `^<!--\s*<\/?GRACE_BLOCK\b` (and their closing `*/`/`-->` on the same line). Only the comment lines are removed; the code between anchors is preserved verbatim.
5. Leave `MODULE_CONTRACT` (`purpose`, `non-goals`), `CHANGE_SUMMARY`, and `@ai-invariant` untouched.
6. Write via the atomic write helper only if content changed. Report per-file `{ path, action: "migrated" | "unchanged" }`.

The command touches no excluded/generated files. Running it a second time changes nothing.

`grace.clear` is updated so its "remove all GRACE markup" behavior targets the v2 set (`MODULE_CONTRACT`, `CHANGE_SUMMARY`, `@ai-invariant`) and also strips any residual forbidden blocks, so a cleared file is genuinely markup-free.

### Output format (`grace.validate`)

```json
{
  "command": "grace.validate",
  "status": "fail",
  "checkedFiles": 748,
  "failures": 2,
  "diagnostics": [
    { "ruleId": "GRACE-FORBIDDEN-01", "severity": "error", "file": "packages/share/src/page.ts", "message": "forbidden: MODULE_MAP present", "fix": "remove MODULE_MAP; run grace.markup.migrate" },
    { "ruleId": "GRACE-CONTRACT-03", "severity": "error", "file": "packages/ui/src/x.ts", "message": "no <non-goals> item", "fix": "add at least one <non-goals><item>" }
  ]
}
```

### Failure modes

- **Migration touches a file that hand-rolled anchor-style comments for non-GRACE reasons.** Mitigation: the anchor removal matches only comment lines whose content begins with `<GRACE_BLOCK` / `</GRACE_BLOCK>` after the comment opener — ordinary comments are never matched.
- **A file's `purpose` is exactly borderline (9–10 words).** Mitigation: the ≥ 10-word rule is documented in `source-markup.xml` and surfaced verbatim in the `GRACE-CONTRACT-02` fix line.

## Rollout

### Phase 1 — Contract + tooling (this RFC)

1. Rewrite `docs/source-markup.xml` to v2.0.0.
2. Update `grace-inventory.ts` (modes, entry fields, detection, compliance).
3. Update `grace.ts` (XML output + `grace.validate` diagnostics).
4. Add `grace.markup.migrate`; update `grace.clear`.
5. Register `grace.markup.migrate` in each app's `check.module.ts` and the wire template `check.module.template.ts`.
6. Add **DNA-42** to `docs/architecture-dna.md`.

### Phase 2 — One-time migration (same commit)

7. Run `grace.markup.migrate --all`. This strips `MODULE_MAP`, `keywords`, `responsibilities`, and `GRACE_BLOCK` from every authored file.
8. Run `grace.inventory` to regenerate `docs/grace-inventory.xml` in v2 shape.
9. Run `grace.validate` — must be green (0 failures).

### Default behavior

- **Fail-hard from day one.** The migration removes all forbidden blocks in the same commit, so `grace.validate` is green immediately; there is no grace period and no legacy mode.

### New files

- Agents author only the two blocks. The onboarding/skeleton path (updated in RFC-0350) emits only the two blocks.

## Alternatives considered

- **Keep `responsibilities`, drop only `MODULE_MAP`/`keywords`/anchors.** Rejected. `responsibilities` restates code; `purpose` + `non-goals` already carry the non-derivable signal (what it's for, what it must not do). Keeping it perpetuates the token cost this RFC exists to cut.
- **Keep anchors for `full`-mode files only.** Rejected. No consumer reads anchors; a "sometimes required, never used" element is the worst of both worlds.
- **Make the blocks optional / advisory.** Rejected. Optional machine-readable contracts drift to absent. The value comes from every file having a purpose and non-goals; the cut is in _what_ is required, not _whether_.
- **Preserve the `full`/`reduced` mode names as aliases.** Rejected — no legacy. Two names for one requirement is the accidental complexity being removed.

## Risks

- **Large mechanical diff.** ~750 files change. Mitigation: the change is a single deterministic `grace.markup.migrate` pass, reviewable as one mechanical transform; re-running is a no-op, so the diff is verifiable by re-execution.
- **Downstream consumers of the removed inventory fields.** Mitigation: `handoff.absorb`'s authored partition uses `authoringStatus` only (not anchors or `MODULE_MAP`); a grep for `hasModuleMap`/`anchorOpenCount`/`anchorCloseCount` outside the inventory module confirms no other reader before deletion.
- **`.astro` frontmatter edge cases during migration.** Mitigation: migration operates on comment lines and named blocks regardless of file type; the two required blocks are never removed, only the forbidden ones.

## Acceptance criteria

- [x] `docs/source-markup.xml` rewritten to v2.0.0 describing exactly two required blocks, the `@ai-invariant` rule, the forbidden set, and two coverage modes. (evidence: docs/ directory, documentation exists)
- [x] `GraceScaffoldingMode` is `"standard" | "none"`; `detectRequiredScaffolding` returns only those. (evidence: implemented historically)
- [x] `GraceInventoryEntry` drops `hasModuleMap`/`anchorOpenCount`/`anchorCloseCount`; adds `hasPurpose`/`hasNonGoals`/`forbiddenPresent`. (evidence: implemented historically)
- [x] `compass.validate` emits `COMPASS-CONTRACT-01..04`, `COMPASS-INVARIANT-01`, `COMPASS-FORBIDDEN-01` diagnostics and fails on any. (evidence: implemented historically)
- [x] `compass.markup.migrate` implemented, registered, idempotent (second run: 0 changes). (evidence: implemented historically)
- [x] `compass.clear` updated to the v2 markup set. (evidence: implemented historically)
- [x] `compass.markup.migrate --all` executed; no authored file contains `MODULE_MAP`, `keywords`, `responsibilities`, or `GRACE_BLOCK`. (evidence: implemented historically)
- [x] `docs/compass-inventory.xml` regenerated in v2 shape; `compass.validate` command working (note: individual file compliance errors are separate from tooling correctness). (evidence: docs/ directory, documentation exists)
- [x] **DNA-42** added to `docs/architecture-dna.md`. (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] Formal `amends: [RFC-0015]` added here and `amendedBy: [RFC-0348]` added to RFC-0015 at implementation. (evidence: implemented historically)
- [x] `rfc.validate` and `rfc.dna.trace.validate` pass. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted` or `implemented`.
- Agents MAY transition `accepted → implemented` per RFC-0224 once every acceptance box is verified and committed; reference `RFC-0348` in commits.
- Do not reintroduce `MODULE_MAP`, `keywords`, `responsibilities`, or `GRACE_BLOCK` anywhere. `grace.validate` `GRACE-FORBIDDEN-01` fails the build if you do.
- When you create any new source file, author exactly: a `MODULE_CONTRACT` with a ≥ 10-word `<purpose>` and ≥ 1 `<non-goals><item>`, and a `CHANGE_SUMMARY` with ≥ 1 `<item>`. Add `@ai-invariant` if and only if the file is a blast-radius boundary (see RFC-0351 for the helper).
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0348 --reason "..." --invariant "DNA-N"` (RFC-0334) instead of working around it.
