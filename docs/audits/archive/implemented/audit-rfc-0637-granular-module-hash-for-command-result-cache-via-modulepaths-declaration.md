---
rfcId: RFC-0637
auditId: AUDIT-RFC-0637-01
date: 2026-08-01
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0637

## Verdict: Needs revision

RFC корректно решает реальную проблему (изменение одного файла инвалидирует кэш всех 200+ команд) и органично вписывается в существующую архитектуру `computeModuleHash` (RFC-0390). Однако есть несколько мелких находок: `commands.changed` содержит не-команду, не упомянуто обновление AGENTS.md, и `packagesImpacted` включает пакет, затронутый только в Phase 2.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0637` reported 0 violations.

## Axis A — Structural completeness

No issues. All required sections present with real content. Decision is in present tense. TypeScript contracts are minimal type signatures. File system responsibilities table names concrete paths. Failure modes cover non-existent paths, empty arrays, omitted dependencies, and directories. Rollout describes default behavior, Phase 1–3, and explicitly states the full-`src/` fallback is permanent. Alternatives considered has 3 real alternatives with rejection reasons. Risks includes agent misinterpretation risk and false-positive rate. Acceptance criteria are checkable and sufficient. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-53]` — DNA-53 ("Semantic fingerprint governance") requires all hashes to use `@warpgogol/fingerprint`. The RFC body (§Architectural fit) explicitly states "All hashing uses `@warpgogol/fingerprint`. `computeModuleHash` already uses `fingerprintTree` from this package. The granular hash continues to use the same fingerprint primitives." The proposed `computeModuleHash` code uses `fingerprintTree`, `fingerprintFile`, `stableJsonHash`, and `byteHash` — all from `@warpgogol/fingerprint`. Alignment is correct.

## Axis C — Ecosystem fit

**Finding C1: `commands.changed` contains a non-command entry.** The frontmatter lists `command-result cache (computeModuleHash)` in the `changed` bucket. This is not a registered kernel command name — `computeModuleHash` is an internal function in `packages/os/site-kernel/src/cache/command-result-cache.ts`. The `changed` bucket should list registered command names whose CLI behavior changes. This RFC changes internal cache logic, not any command's CLI interface. The RFC itself states "No output format changes" and "`kernel.cache.status` command output is unchanged." The `changed` bucket should be empty or list `kernel.cache.status` / `kernel.cache.clear` if their output semantics change (they don't).

**Finding C2: Missing AGENTS.md update.** `packages/os/site-kernel/AGENTS.md` has a "Command-result cache (RFC-0390)" section that documents `computeModuleHash` and the `moduleHashCache` Map. This section needs updating to mention the `modulePaths` parameter and the cache key change. The RFC doesn't mention this documentation update in its file system responsibilities table or rollout.

## Axis D — Forward-only compliance

No issues. The full-`src/` fallback is a permanent design choice (commands without `modulePaths` use it forever), not a deprecation path or compatibility shim. No dual-path — commands either declare `modulePaths` (granular hash) or don't (full-`src/` hash). Both paths use the same `@warpgogol/fingerprint` primitives.

## Axis E — Agent-facing policy

No issues. RFC is `draft` with no self-authorizing language. Implementation notes reference the correct governance rules: RFC ID in commits, `rfc.supersede.propose` on invariant conflict. Anti-fabrication: no content authoring involved. Storage policy: no persistence changes.

## Axis F — Pragmatism

**Finding F1: `packagesImpacted` scope mismatch with acceptance criteria.** The RFC lists `packages/os/site-kernel-checks` in `packagesImpacted`, but all 9 acceptance criteria only cover changes to `packages/os/site-kernel` (Phase 1). `site-kernel-checks` is only touched in Phase 2 (incremental command migration), which is explicitly separate and not part of this RFC's acceptance criteria. Either narrow `packagesImpacted` to `packages/os/site-kernel` for Phase 1, or add a Phase 2 acceptance criterion clarifying that no command migrations are required by this RFC.

## Axis G — Blind spots

No issues. Performance is addressed in Risks (hash computation overhead, mitigated by `moduleHashCache`). False cache hits from incomplete `modulePaths` is the primary risk and is well-mitigated. Edge cases (empty array, non-existent paths) are covered in Failure modes. The RFC correctly identifies that `execute-pipeline.ts` has two `moduleHashCache` usage sites (`tryCacheRead` and `tryCacheWrite`) — both need the cache key change, which is covered by the single file system responsibilities entry.

## Questions for the author

1. Should `commands.changed` be empty since no registered kernel command's CLI interface changes? Or should it list `kernel.cache.status` / `kernel.cache.clear` if their output semantics are considered changed?
2. Should `packagesImpacted` be narrowed to `packages/os/site-kernel` only, given that Phase 2 (command migration in `site-kernel-checks`) is not covered by the acceptance criteria?
3. Should the RFC add `packages/os/site-kernel/AGENTS.md` to the file system responsibilities table for the "Command-result cache (RFC-0390)" section update?
