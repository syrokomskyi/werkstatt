---
id: RFC-0661
title: "Hot, warm, and cold knowledge layers with token budgets for skill knowledge"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: policy
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-03
updatedAt: 2026-08-03
enhancedAt: 2026-08-03
implementedAt: 2026-08-03
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0524
  - RFC-0660
  - RFC-0662
  - RFC-0663
  - RFC-0664
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
    - forge.skill.validate
    - forge.doctor
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - forge
successSignals:
  - "`forge.skill.validate` emits SKILL-21 warnings naming layer, budget, and actual size when a hot or warm knowledge file exceeds its budget"
  - "Every skill body that reads knowledge files states the layer read discipline (hot always, warm on pointer, cold on demand) in one line"
  - "A project can override budgets via forge.yaml bindings and forge.doctor validates the override shape"
nonGoals:
  - No hard failures on budget exceed — budgets are warnings, never build gates
  - No token-accurate measurement — character counts are the deterministic proxy; tokenizer dependencies are rejected
  - No automatic truncation or summarization of over-budget files — reduction flows through RFC-0662 compaction and RFC-0663 promotion with operator approval
  - No budgets on non-knowledge files (AGENTS.md, operator-profile, docs) — out of scope
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0661: Hot, warm, and cold knowledge layers with token budgets for skill knowledge

## Context

RFC-0524 defined the three knowledge layers (L0 qa-log, L1 fix-patterns, L2 learned-principles) by _role_, but never by _reading discipline_ or _cost_. In practice, skill bodies say "read the knowledge files at the start of each run" — all of them, in full, every run. RFC-0660 made entries structured and countable; this RFC uses that foundation to control what each run actually pays for.

Two external reference points frame the problem. Hermes caps its always-loaded memory at ~3600 characters: brutal, but the insight is correct — the hot layer must have a predictable, bounded token cost. OpenClaw loads only "today + yesterday" daily logs automatically and keeps the full archive on disk: the correct cold-layer instinct. Forge currently has neither bound: every layer is hot, and nothing is cold.

Skills that run frequently (`grilling` is a dependency of 8+ skills and runs in almost every RFC session) multiply the cost. Over a multi-year project, an unbounded L2 file would be loaded thousands of times — the sediment failure mode from `writing-great-skills`, measured in tokens.

## Problem

1. **Every layer is effectively hot.** `grilling/SKILL.md` instructs reading `learned-principles.md` at session start; `fo-memory-sync` reads L1 and L2 every run; L0 is appended blindly and re-read for meta-analysis. There is no documented discipline for _when_ a layer should be loaded.
2. **No budget, no signal.** Nothing tells the operator or the agent that a hot file grew from 2 KB to 20 KB. The cost increase is silent until context pressure degrades runs.
3. **No reduction path.** Even when growth is noticed, there is no sanctioned way to shrink a file — compaction is RFC-0662, promotion is RFC-0663, and neither has a trigger condition today.
4. **Character cost is unmeasured.** Without a deterministic size metric (per entry, per layer), "budget" cannot be defined, let alone enforced. RFC-0660's parser now makes entries countable; this RFC spends that capability.

## Decision

Forge adopts a **hot/warm/cold reading discipline with character budgets** for cumulative skill knowledge. L2 (`learned-principles.md`) is the hot layer: read in full at the start of every skill run, budgeted at 4096 characters by default. L1 (`fix-patterns.md`) is the warm layer: read only when the run's branch matches the skill's documented pointer conditions, budgeted at 8192 characters by default. L0 (`qa-log.md`) is the cold layer: never read wholesale during a run — only appended to, and read only by meta-analysis, distillation (RFC-0662), or explicit debugging — and carries no budget. Budgets count only `status: active` entries (parsed via RFC-0660's `parseKnowledgeFile`), are overridable per project via `forge.yaml` bindings, and are enforced by `forge.skill.validate` as **warnings** (new rule SKILL-21) — never errors, never build gates.

## Architectural fit

- **DNA-54 (Forge bindings contract):** budget defaults live in forge; per-project overrides live in `forge.yaml` bindings (`bindings.knowledge.budgets`), following the established bindings pattern instead of hardcoded per-project literals.
- **RFC-0524:** formalizes the reading discipline the original RFC left implicit. The three layers and their roles are unchanged; only _when_ and _at what cost_ they are loaded is new.
- **RFC-0660:** depends on it directly — budget accounting uses `parseKnowledgeFile` and counts only `active` entries, so archived/superseded content stops costing immediately after compaction.
- **RFC-0662 / RFC-0663:** SKILL-21 warnings are the trigger signal for compaction and promotion runs. This RFC deliberately creates the pressure valve indicator; the valves themselves are the next two RFCs.
- **writing-great-skills:** the hot/warm/cold discipline joins the information-hierarchy vocabulary — a knowledge file's layer is its rank on the ladder, and the budget is the pruning discipline for that rank.
- **DNA-60 (proposed by this series):** this RFC is the "budgeted layers" clause of the invariant. DNA-60 does not yet exist in `docs/architecture-dna.md` (the registry currently ends at DNA-59); its establishment is gated on RFC-0660's implementation, which adds the DNA-60 entry linking RFC-0660..0662.

## Design

### Reading discipline

| Layer | File | When loaded | Budget (default) |
| --- | --- | --- | --- |
| Hot | `learned-principles.md` (L2) | Start of every skill run, in full | 4096 chars |
| Warm | `fix-patterns.md` (L1) | Only when the run reaches a branch whose pointer names it (e.g. "if the violation matches a known pattern, consult fix-patterns") | 8192 chars |
| Cold | `qa-log.md` (L0) | Never wholesale during a run. Append-only during runs; read only by meta-analysis, RFC-0662 distillation, or explicit operator-directed debugging | none |

Skill bodies that read knowledge files state this discipline in one line (e.g. "Read `learned-principles.md` (hot) at start; consult `fix-patterns.md` (warm) only when step 3a matches; never read `qa-log.md` (cold) wholesale — append only"). The `writing-great-skills` § Cumulative knowledge pattern documents the table above as the canonical discipline.

### Budget semantics

- The size of a knowledge file is the **sum of characters of its `status: active` entries** — heading, metadata block, and body — as returned by RFC-0660's parser. Preamble and non-active entries (`stale`, `superseded`, `archived`) are excluded: stale entries are already flagged for compaction, and archived/superseded entries are awaiting it.
- Character count is the deterministic proxy for token cost. Tokenizer-accurate measurement is rejected (non-deterministic across models, adds a dependency).
- Budgets apply to the hot and warm layers only. The cold layer is unbudgeted by design — its growth is bounded by RFC-0662 archival, not by read cost.

### Configuration

Defaults ship in forge. Projects override in `forge.yaml`:

```yaml
bindings:
  knowledge:
    budgets:
      hot: 4096    # L2, characters of active entries
      warm: 8192   # L1, characters of active entries
```

`forge.doctor` validates the override shape (positive integers, `hot <= warm` recommended but not enforced) and reports the effective budgets. Absent the override, defaults apply. Pack skills inherit project budgets.

### Layer resolution for custom-named files

Skills may declare custom knowledge file names (not `qa-log.md`, `fix-patterns.md`, or `learned-principles.md`). RFC-0660's `parseKnowledgeFile` returns a `ParsedKnowledgeFile` with a `layer: KnowledgeLayer` field, resolved from the `<!-- knowledge-layer: LN -->` preamble comment or the file-name mapping fallback. `computeLayerBudgets` uses this `layer` field — not the file name directly — to determine which budget applies. Files whose layer cannot be determined (no preamble, no conventional name) are skipped for budget enforcement with an informational note in the doctor summary.

### Performance

SKILL-21 runs `parseKnowledgeFile` on every hot/warm knowledge file of every skill (forge + pack) during `forge.skill.validate`. At current scale (4 skills with knowledge files, 11 files total, typically <10 KB each), the incremental cost over the existing SKILL-13 existence check is negligible. As knowledge files grow and more skills adopt the pattern, the parser cost is linear in total knowledge file size. Validation is operator-invoked, not pipeline-integrated — the cost is paid on explicit runs, not on every build.

### Enforcement

New rule **SKILL-21** in `forge.skill.validate`: for each knowledge file of a hot or warm layer, compute the active-entry size via `parseKnowledgeFile`; if it exceeds the effective budget, emit a **warning** naming skill, file, layer, budget, and actual size, with a `fixHint` pointing at the RFC-0662 compaction command and RFC-0663 promotion. SKILL-21 never fails validation and never affects exit codes.

`forge.doctor` reports a knowledge-budget summary table (skill → layer → size/budget → headroom %) as informational output, so the operator sees pressure building before warnings appear.

### TypeScript contracts

Extension to `packages/forge/src/knowledge/` (RFC-0660 module):

```ts
interface KnowledgeBudgets {
  hot: number;   // default 4096
  warm: number;  // default 8192
}

interface LayerBudgetReport {
  skill: string;
  file: string;
  layer: "L1" | "L2";
  activeChars: number;
  budget: number;
  exceededBy: number;   // 0 when within budget
}

// Pure: takes parsed files + effective budgets, returns per-file reports.
function computeLayerBudgets(
  files: ParsedKnowledgeFile[],
  budgets: KnowledgeBudgets,
): LayerBudgetReport[];

// Reads forge.yaml bindings.knowledge.budgets; falls back to defaults.
function resolveKnowledgeBudgets(workspaceRoot: string): KnowledgeBudgets;
```

### CLI surface

```sh
# Existing commands, extended behavior — no new commands
pnpm exec werkstatt run forge.skill.validate --all      # adds SKILL-21 warnings
pnpm exec werkstatt run forge.doctor --json             # adds knowledge budget summary
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/src/knowledge/budgets.ts` | `computeLayerBudgets`, `resolveKnowledgeBudgets` |
| `packages/forge/src/config/forge-config.ts` | Extend `forgeBindingsSchema` with optional `knowledge.budgets` field |
| `packages/forge/src/validators/skill-validate.ts` | SKILL-21 rule; add `warnings` field to `SkillValidateResult` |
| `packages/forge/os/core/handlers/doctor.ts` | Budget summary + override shape validation |
| `packages/forge/skills/shared/writing-great-skills/SKILL.md` | Canonical hot/warm/cold discipline documentation |
| `packages/forge/skills/**/SKILL.md` (adopting skills) | One-line read-discipline statements replacing "read the knowledge files" |
| `forge.yaml` (consumer projects) | Optional `bindings.knowledge.budgets` override |

### Output format

`forge.skill.validate --json` with a SKILL-21 warning:

```json
{
  "command": "forge.skill.validate",
  "status": "pass",
  "violations": [],
  "warnings": [
    {
      "skill": "fo-memory-sync",
      "rule": "SKILL-21",
      "file": "learned-principles.md",
      "layer": "L2",
      "severity": "warning",
      "message": "Hot layer exceeds budget: 5230 of 4096 characters (28% over)",
      "fixHint": "Run the knowledge compaction command (RFC-0662) to archive stale entries, or promote duplicated principles to the shared layer (RFC-0663)"
    }
  ]
}
```

**Output shape coordination:** SKILL-21 warnings go in a separate `warnings` array, not inside `violations` with `severity: "warning"`. This is because the current `SkillValidateResult` interface sets `status: "fail"` when `violations.length > 0` — mixing warnings into `violations` would incorrectly fail validation for warnings-only runs. RFC-0660's output format (which puts legacy-section warnings inside `violations` with `severity: "warning"`) should be updated to match this pattern during RFC-0660's enhancement: errors in `violations` (status: fail), warnings in `warnings` (status: pass). The `SkillValidateResult` interface gains a `warnings: Warning[]` field and the `Violation` interface gains `file`, `line`, and `fixHint` optional fields (shared with RFC-0660's SKILL-19/SKILL-20 needs).

### Failure modes

- **Over-budget hot file** → SKILL-21 warning only; validation still passes. Repeated warnings across runs are the operator's signal to compact.
- **Malformed budget override** (non-integer, negative) → `forge.doctor` warning naming the bad key; defaults apply.
- **Knowledge file failing RFC-0660 parse** → SKILL-21 skips the file (schema errors are already reported by SKILL-19; no double-reporting).
- **Skill with no L2 file** → no hot-layer check; discipline table simply has no hot row for that skill.

## Rollout

- **Phase 1 (this RFC's implementation):** budgets module, SKILL-21 warnings, doctor summary, `writing-great-skills` discipline documentation, and read-discipline one-liners in the knowledge-adopting forge skills (`grilling`, `fo-session-save`, `fo-memory-sync`, `windows-ai-tooling`). Defaults are set so all current forge skills are _within_ budget at introduction — the first warnings should signal future growth, not punish the status quo.
- **Adoption by pack skills:** automatic on next `forge.skill.validate` run — warnings appear if pack knowledge files exceed defaults; projects tune via `forge.yaml`.
- **No pipeline integration:** SKILL-21 runs inside `forge.skill.validate` only, which is already operator-invoked. Budgets never gate builds.
- **Trigger loop:** once RFC-0662 lands, a SKILL-21 warning becomes the documented trigger for a compaction run; once RFC-0663 lands, repeated cross-skill duplication warnings become the trigger for promotion.

## Alternatives considered

- **Hard caps with validation errors** (Hermes-style) — rejected: a knowledge file that grows past a limit would break validation for unrelated work, punishing the wrong change. Knowledge growth is a maintenance signal, not a correctness failure. Warnings preserve the signal without the blast radius.
- **Token-accurate budgets via a tokenizer dependency** — rejected: non-deterministic across models, adds a dependency to a portable package, and the precision buys nothing at this scale. Characters correlate well enough at 4–8 KB granularity.
- **Automatic truncation/summarization when over budget** — rejected: silent loss of knowledge violates the files-as-source-of-truth philosophy. Reduction is a human-approved act (RFC-0662/0663).
- **Per-entry budgets instead of per-file** — rejected: a per-entry cap does not bound total read cost, which is the actual problem. Per-entry length is already implicitly bounded by what a useful principle looks like.

## Risks

- **Warning fatigue.** If defaults are too tight, every run warns and the signal dies. Mitigation: defaults calibrated so all current forge skills pass with ≥50% headroom; doctor shows headroom trends so calibration can be revisited with data.
- **Agents ignoring the warm-layer discipline** and reading L1 wholesale anyway. Mitigation: the one-line discipline statements live in the skill bodies the agent is already executing; `writing-great-skills` documents why (context load economics), which is the vocabulary agents already respect.
- **False precision.** Character budgets feel arbitrary. Mitigation: documented as a proxy with explicit rejection of tokenizer accuracy; overrides exist for projects that disagree.
- **Agent misinterpretation: treating warnings as errors.** Mitigation: SKILL-21 documentation and this RFC state explicitly that warnings never affect exit codes; implementation notes below repeat it.

## Acceptance criteria

- [x] `packages/forge/src/knowledge/budgets.ts` exports `computeLayerBudgets` and `resolveKnowledgeBudgets`; sizes count only `status: active` entries via RFC-0660's parser (evidence: `packages/forge/src/knowledge/budgets.ts:62-96`, `packages/forge/src/tests/budgets.test.ts:75-82`)
- [x] `forge.skill.validate` enforces SKILL-21 as warnings for hot (default 4096) and warm (default 8192) layers; warnings never change the exit code (evidence: `packages/forge/src/validators/skill-validate.ts:248-268`, `packages/forge/src/tests/skill-validate.test.ts:209-219`)
- [x] `forge.doctor` validates `bindings.knowledge.budgets` override shape and prints the knowledge-budget summary table (evidence: `packages/forge/src/onboarding/doctor.ts:347-457`, `packages/forge/src/onboarding/doctor.ts:878-880`)
- [x] `writing-great-skills` documents the hot/warm/cold reading discipline as the canonical pattern (evidence: `packages/forge/skills/shared/writing-great-skills/SKILL.md:172-178`)
- [x] Knowledge-adopting forge skills state the read discipline in one line (hot always, warm on pointer, cold append-only) (evidence: `packages/forge/skills/shared/grilling/SKILL.md:16`, `packages/forge/skills/fo/fo-memory-sync/SKILL.md:67`, `packages/forge/skills/fo/fo-session-save/SKILL.md:38`)
- [x] All current forge skills validate within default budgets at introduction (evidence: `packages/forge/src/tests/skill-validate.test.ts:233-237` — zero SKILL-21 warnings)
- [x] Unit tests cover: budget override resolution, active-only counting (stale/superseded/archived excluded), warning content, and skip-on-parse-failure (evidence: `packages/forge/src/tests/budgets.test.ts:32-57`, `packages/forge/src/tests/budgets.test.ts:75-82`, `packages/forge/src/tests/budgets.test.ts:120-132`, `packages/forge/src/tests/skill-validate.test.ts:202-238`)
- [x] `rfc.validate` passes on this file (evidence: `rfc.validate --id RFC-0661 --json` → status: pass, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Before stamping `implemented`, run `site-kernel run rfc.verification.emit --id RFC-0661` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT make SKILL-21 fail validation or affect exit codes — budget pressure is a signal, not a gate. Changing this requires a superseding RFC.
- Agents MUST NOT add tokenizer or embedding dependencies for budget measurement.
- Agents MUST NOT auto-reduce over-budget files from validators; reduction flows only through RFC-0662 compaction or RFC-0663 promotion with operator approval.
- This RFC depends on RFC-0660's parser — implement RFC-0660 first or in the same change series.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0661 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
