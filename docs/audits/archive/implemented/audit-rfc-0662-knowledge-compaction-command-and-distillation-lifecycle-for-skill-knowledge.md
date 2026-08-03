---
rfcId: RFC-0662
auditId: AUDIT-RFC-0662-01
date: 2026-08-03
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0662

## Verdict: Needs revision

The RFC is architecturally sound and well-integrated with the RFC-0660..0664 series. The deterministic-command vs. semantic-skill split is clean and consistent with the series' design principle. Three findings require clarification before implementation: an ambiguity in archive companion merge strategy, an unreliable mtime-based "last compact" signal, and a missing `forge.yaml` binding snippet for the new override keys.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0662 --json` reports zero violations.

## Axis A — Structural completeness

1. **Archive companion merge strategy is ambiguous.** The RFC states both "all mutations go through `parseKnowledgeFile`/`serializeKnowledgeFile`" (§Command operations, line 140) and "append-merge only; the command never rewrites existing archive content" (§Failure modes, line 257). These are in tension: if the archive companion is parsed and re-serialized to merge new entries, existing archive content may be reformatted; if entries are appended as raw text, the serializer contract is bypassed for archives. The RFC must clarify which strategy applies to archive companions and whether the serializer round-trip guarantee extends to them.

2. **Missing `forge.yaml` binding snippet.** The flag table (lines 133–134) mentions `bindings.knowledge.retentionDays` and `bindings.knowledge.staleDays` as override paths, but unlike RFC-0661 (which shows the `bindings.knowledge.budgets` YAML snippet at line 132–138), this RFC does not show the YAML shape. An implementer would need to infer the structure. Adding a 4-line YAML example would close the gap.

## Axis B — DNA alignment

No issues. `satisfies: []` is correct for a `command` kind RFC (RFC-0331 requires `--satisfies` only for `architecture` and `contract` kinds). The RFC body references "DNA-60 (proposed by this series)" as context, not as a `satisfies` entry — this is consistent with the series' convention (RFC-0660 proposes DNA-60; RFC-0662 contributes to it without claiming to satisfy it).

## Axis C — Ecosystem fit

No issues. The command registers in `forgeCoreModule` (line 215), following the existing pattern in `packages/forge/os/core/core.module.ts`. The pure function in `packages/forge/src/knowledge/compact.ts` stays portable (no kernel imports), consistent with the `src/` import rule in `packages/forge/AGENTS.md`. The `fo-knowledge-distill` skill at `packages/forge/skills/fo/fo-knowledge-distill/` follows the canonical skill directory layout. No pipeline integration — compaction is maintenance, not verification.

## Axis D — Forward-only compliance

No issues. Legacy sections are migrated (not maintained alongside). The command reports them; the distill skill migrates them with operator approval. No dual-paths, no compatibility shims. Archive companions are per-layer and co-located — no parallel format persists after migration.

## Axis E — Agent-facing policy

No issues. Status gate is explicit (line 294: "Agents MAY implement code changes ONLY when this RFC has status: accepted"). Implementation notes reference RFC-0224, RFC-0330, RFC-0334 correctly. The RFC explicitly forbids agents from wiring the command into pipelines or session-end hooks (line 297). The `fo-knowledge-distill` skill gates every mutation behind operator approval (line 287).

## Axis F — Pragmatism

No issues. One new command + one new skill is the minimal surface for the lifecycle gap. The deterministic/semantic split is well-justified and rejected alternatives are real (extending `fo-session-retro`, fully deterministic distillation, cron-scheduled compaction). `packagesImpacted: [forge]` and `appsImpacted: []` are accurate. Non-goals are meaningful (no LLM in the command, no scheduled execution, no deletion).

## Axis G — Blind spots

1. **`forge.doctor` "last compact" via file mtimes is unreliable.** The rollout section (line 263) says: "`forge.doctor` prints 'last compact: never/N days ago' once compaction state is observable from file mtimes — informational only." File mtimes are reset by `git checkout`, `git pull`, and CI environments. In a git-based workflow, mtimes reflect the last checkout, not the last compaction. This signal will be misleading in practice. Alternatives: (a) a state file (e.g. `.agents/knowledge-compaction-state.json`), (b) git log inspection for compact commits, or (c) drop the "last compact" signal entirely and rely on SKILL-21 budget warnings as the trigger. The RFC should pick one or acknowledge the limitation.

2. **Concurrent compaction runs.** The RFC does not address what happens if two operators (or two agents) run `forge.skill.knowledge.compact` concurrently on the same repository. Per-file atomic writes protect individual files, but two runs could produce overlapping archive appends. A lock file or "already running" guard would prevent this. This is low-risk (compaction is operator-invoked and rare) but should be acknowledged.

## Questions for the author

1. When an archive companion already exists with hand-edited content, does the command parse + re-serialize the merged file (risking reformatting), or does it append new entries as raw text (bypassing the serializer)? The RFC states both contracts simultaneously — which one governs?
2. How will `forge.doctor` compute "last compact: N days ago" reliably when file mtimes are reset by every `git checkout` and `git pull`? Should a state file or git log inspection be used instead, or should this signal be dropped in favor of SKILL-21 budget warnings?
3. Should `bindings.knowledge.retentionDays` and `bindings.knowledge.staleDays` sit alongside `bindings.knowledge.budgets` (from RFC-0661) under a unified `bindings.knowledge` section in `forge.yaml`? If so, adding a YAML snippet would make the shape explicit for implementers.
