---
rfcId: RFC-0521
auditId: AUDIT-RFC-0521-01
date: 2026-07-24
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: approved
---

# Audit: RFC-0521

## Verdict: Approved

The RFC is structurally sound, architecturally aligned with RFC-0367 and RFC-0374, and forward-only. Two findings need attention during enhance: the `fo-idea-audit` skill will re-introduce `rfcPath` into new audit files unless updated, and the TypeScript contracts section omits module definitions (`forgeAdrModule`, `forgePlanModule`, `forgeAuditModule`) that the acceptance criteria reference.

## Mechanical validation (rfc.validate)

Pass — no violations targeting RFC-0521.

## Axis A — Structural completeness

1. **Module definitions missing from TypeScript contracts.** The acceptance criteria reference `forgePlanModule` (line 353), `forgeAuditModule` (line 354), and `forgeCoreModule` (line 355), and the implementation notes reference `forgeAdrModule` (line 377). The TypeScript contracts section (lines 163–226) defines `PlanArchiveResult`, `AuditArchiveResult`, `DocsArchiveResult`, `ArchiveMove`, `ArchiveSkip`, and `getRfcStatusById` — but does not define the `ForgeModule` registrations for the three new modules (`forgePlanModule`, `forgeAuditModule`, `forgeAdrModule`). The file system responsibilities table (lines 240–242) names the directories but not the module export names. An implementer would need to infer the module naming convention from existing modules (`forgeRfcModule`, `forgeCoreModule`, etc.).

2. **`fo-idea-audit` skill not mentioned in rollout.** The `fo-idea-audit` skill at `packages/forge/skills/fo/fo-idea-audit/SKILL.md:210` writes `rfcPath: docs/rfcs/rfc-XXXX-*.md` into the frontmatter of every audit file it produces. The RFC proposes removing `rfcPath` from the audit template (line 246) and all existing audit files (line 247), but does not mention updating the skill. Without the skill update, new audits will re-introduce the `rfcPath` field, contradicting the acceptance criterion on line 363. The skill is in `packages/forge` which is listed in `packagesImpacted`, so the scope is correct — the omission is in the rollout steps.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-35]` is thin — the RFC does not change readiness gates — but consistent with RFC-0367's precedent for the same claim. The architectural fit section (line 122) correctly states archive commands are manual housekeeping, not pipeline gates.

## Axis C — Ecosystem fit

1. **`fo-idea-audit` skill gap** (see Axis A #2). The skill is part of `@wgogol/forge` (listed in `packagesImpacted`), but the RFC does not list it in the rollout or file system responsibilities. This is an ecosystem fit issue because the skill and the audit template must stay synchronized.

2. **ADR module type change.** The current `adrModule` in `packages/os/site-kernel/src/adr/adr.module.ts:15` is of type `KernelModule` (site-kernel). After migration to `packages/forge/os/adr/`, it would become `ForgeModule` (forge). The RFC states "site-kernel re-exports preserve existing imports" (line 322) but does not address whether `ForgeModule` is structurally compatible with `KernelModule` for consumers that import `adrModule` directly. The existing forge modules (`forgeRfcModule`, etc.) are already registered alongside kernel modules in `tools/kernel.config.ts`, so the registration path works — but consumers importing the type `KernelModule` from site-kernel would get `ForgeModule` instead. This should be clarified.

3. **Command lifecycle consistency.** `commands.proposed` lists `plan.archive`, `audit.archive`, `docs.archive`; `commands.added` lists the same three. `commands.changed` lists `adr.archive`, `adr.list`, `adr.validate`, `adr.create` — these are existing commands whose registration location changes from site-kernel to forge. The `changed` bucket is appropriate because the module registration changes, even though behavior is preserved via re-exports.

## Axis D — Forward-only compliance

No issues. The ADR module migration deletes the old code from site-kernel and re-exports from forge — no compatibility shim, no dual-path. The `rfcPath` removal is a clean deletion, not a deprecation period.

## Axis E — Agent-facing policy

No issues. The RFC does not contain self-authorizing language. Implementation notes reference RFC-0224, RFC-0330, RFC-0334 correctly. No content authoring is claimed as auto-generated. No persistence or cookie concerns.

## Axis F — Pragmatism

1. **Scope bundling.** The RFC bundles four concerns: (a) `plan.archive`/`audit.archive` commands, (b) `docs.archive` umbrella, (c) ADR module migration from site-kernel to forge, (d) `rfcPath` removal from 78 existing audit files + template, (e) ADR-0002 status update. Concerns (c)–(e) are tangentially related to archiving — they are cleanup tasks that happen to be done alongside the archive rollout. The RFC justifies (c) as completing the forge migration started by RFC-0374, (d) as removing stale references created by archiving, and (e) as a manual housekeeping task. This is coherent but broad. Not a failure — the RFC is well-structured — but an implementer should be aware of the scope.

2. **`getRfcStatusById` as a shared helper.** Good pragmatism — the helper avoids duplicating RFC status lookup logic in both `plan.archive` and `audit.archive`. The interface is minimal.

## Axis G — Blind spots

1. **`getRfcStatusById` performance.** The helper (line 219) "scans `docs/rfcs/` recursively (including archive/) for the RFC with the given id." With ~500 RFC files (including archived) and ~80 plan + ~80 audit files to process, this is ~160 full directory scans if called per-file. The RFC should mention caching or batch-loading the RFC status map (load all RFC statuses once, then look up by id). The overhead is not a bottleneck for a manual housekeeping command, but the design should avoid O(n×m) scans.

2. **Bidirectional movement for plans/audits with inherited status.** The RFC states "All commands are bidirectional" (line 157) — terminal-status files in root move into `archive/`, non-terminal files in `archive/` move back. For plans/audits, "terminal" is inherited from the parent RFC's status. If a plan is in `archive/implemented/` but the parent RFC's status has been reverted to `accepted` (non-terminal), the plan should move back to root. The RFC does not explicitly describe this edge case. It is implied by "bidirectional" but should be stated.

3. **`docs.archive --status` pass-through.** The CLI surface (line 150) shows `docs.archive --status implemented`, but the RFC does not explicitly state that `--status` is passed to all four sub-commands. This is the natural interpretation, but should be documented.

## Questions for the author

1. Will `forgeAdrModule`, `forgePlanModule`, and `forgeAuditModule` be exported from `@wgogol/forge` alongside `forgeRfcModule` and `forgeCoreModule`? If so, should they be defined in the TypeScript contracts section?
2. Will the `fo-idea-audit` skill be updated to stop writing `rfcPath` into new audit frontmatter? If not, how will the `rfcPath` removal be maintained over time?
3. Should `getRfcStatusById` cache/batch-load RFC statuses, or is per-file scanning acceptable for a manual housekeeping command?
