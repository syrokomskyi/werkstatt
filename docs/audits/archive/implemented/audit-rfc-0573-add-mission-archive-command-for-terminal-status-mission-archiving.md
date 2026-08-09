---
rfcId: RFC-0573
auditId: AUDIT-RFC-0573-01
date: 2026-07-28
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0573

## Verdict: Needs revision

The RFC is structurally complete and well-aligned with the existing archive pattern (RFC-0367, RFC-0521). However, it contains a module placement inconsistency: the Design section says `mission.archive` is registered in `forgeCoreModule`, but the existing pattern uses separate forge modules (forgePlanModule, forgeAuditModule, etc.) each registering their own command, with `docs.archive` in `forgeCoreModule` importing handlers via dynamic import. The RFC must clarify whether a new `forgeMissionModule` is created or the command is registered directly in `forgeCoreModule`. Additionally, the `packages/forge/src/index.ts` and `tools/kernel.config.ts` changes needed for a new module are not mentioned.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

No issues. All required sections contain real content. Decision is a single present-tense statement. CLI surface shows exact invocations with flags. TypeScript contracts are minimal type signatures. File system responsibilities table names concrete paths. Output format documents the `--json` shape. Failure modes specify skip-vs-fail behavior. Rollout describes default behavior and adoption path. Alternatives section has four real alternatives with rejection reasons. Risks include agent misinterpretation risk. Acceptance criteria are checkable. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-46]` is correct — DNA-46 (Mission lifecycle) defines the `open → closed | aborted` lifecycle, and this RFC adds a post-terminal archiving step. The RFC body explains how it extends DNA-46 without changing the state machine. `related[]` entries (RFC-0355, RFC-0367, RFC-0480, RFC-0521) are all relevant and correctly referenced. No new DNA invariant is established — the RFC correctly extends an existing one.

## Axis C — Ecosystem fit

**Finding C-1: Module placement inconsistency.** The Architectural fit section (line 117) states: "`mission.archive` is registered in the `forgeCoreModule` (alongside `docs.archive`)." But the existing pattern for archive commands is:

- `plan.archive` is registered in `forgePlanModule` (`packages/forge/os/plan/plan.module.ts`)
- `audit.archive` is registered in `forgeAuditModule` (`packages/forge/os/audit/audit.module.ts`)
- `session.archive` is registered in `forgeSessionModule` (`packages/forge/os/session/session.module.ts`)
- `docs.archive` (in `forgeCoreModule`) imports the handlers via dynamic import and calls them

The RFC should follow this pattern: create a `forgeMissionModule` in `packages/forge/os/mission/mission.module.ts` that registers `mission.archive`, then `docs.archive` in `forgeCoreModule` imports `runMissionArchive` via dynamic import. The RFC's Design section (line 230–236) correctly shows `docs.archive` importing `runMissionArchive`, but the Architectural fit section (line 117) contradicts this by saying the command is registered in `forgeCoreModule`.

**Finding C-2: Missing `packages/forge/src/index.ts` export.** The RFC does not mention that `forgeMissionModule` must be exported from `packages/forge/src/index.ts` (line 128–139 currently exports all forge modules). This is required for the module to be consumable by `tools/kernel.config.ts`.

**Finding C-3: Missing `tools/kernel.config.ts` module loader entry.** The RFC does not mention that `tools/kernel.config.ts` needs a new module loader entry (e.g., `"forge-mission": async () => (await import("@warpgogol/forge/os/mission-module")).forgeMissionModule`). The existing pattern shows entries for `"forge-plan"`, `"forge-audit"`, `"forge-session"` (lines 79–82).

**Finding C-4: Missing `packages/forge/AGENTS.md` OS module table update.** The `packages/forge/AGENTS.md` OS modules table lists all forge modules and their commands. A new `forgeMissionModule` row must be added. The RFC does not mention this documentation update.

**Finding C-5: `docs.archive` description text update.** The `docs.archive` command description (line 271–275 of `core.module.ts`) says "runs rfc.archive, adr.archive, plan.archive, audit.archive, and session.archive in sequence." After adding `mission.archive`, this description must be updated to include `mission.archive`. The RFC does not mention this.

## Axis D — Forward-only compliance

No issues. The RFC is purely additive — it introduces a new command and extends an existing umbrella. No backward compatibility layers, no dual-paths, no deprecation of existing behavior. The `mission.list` and `mission.status` changes are forward-only modifications to existing functions.

## Axis E — Agent-facing policy

No issues. The RFC does not contain self-authorizing language. Implementation notes correctly reference RFC-0224 (accepted→implemented transition), RFC-0334 (supersede escalation), and RFC-0330 (verification evidence). The status gate is respected — the RFC is `draft` and implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."

## Axis F — Pragmatism

No issues. The command surface is minimal (`mission.archive` with `--dry-run` and `--status`). TypeScript contracts are lean — three interfaces with no speculative generality. The RFC reuses the existing archive pattern rather than inventing a new one. `packagesImpacted` lists only the two packages actually touched. `nonGoals` are explicit and meaningful.

## Axis G — Blind spots

**Finding G-1: `mission.yaml` parsing without `@warpgogol/ontology` schema validation.** The RFC says the handler "reads `mission.yaml` directly via `node:fs` and a YAML parser" (line 294) and "MUST NOT import from `@warpgogol/*` packages" (line 294). This means the handler will parse YAML and read the `state` field without schema validation via `missionManifestSchema` from `@warpgogol/ontology/operations`. This is consistent with how `rfc.archive` reads frontmatter without full schema validation, but the RFC should acknowledge this tradeoff: if `mission.yaml` has an unexpected shape (e.g., `state` field missing or misspelled), the handler will skip it with "unreadable manifest" rather than failing loudly. This is acceptable but should be explicit.

**Finding G-2: Concurrent execution with `mission.open` or `mission.close`.** The RFC mentions `fs.rename` ENOENT (line 226) but does not consider the case where `mission.archive` runs concurrently with `mission.open` or `mission.close`. If `mission.close` is writing `mission.yaml` while `mission.archive` is reading it, the archive handler might read a partially-written file. This is a TOCTOU race. The existing archive commands have the same risk, so it is not a blocker, but the RFC should acknowledge it.

## Questions for the author

1. Should a new `forgeMissionModule` be created in `packages/forge/os/mission/mission.module.ts` (following the `forgePlanModule` / `forgeAuditModule` pattern), or should `mission.archive` be registered directly in `forgeCoreModule`? The Architectural fit section says `forgeCoreModule` but the existing pattern says separate module.
2. Does the `packages/forge/src/index.ts` export list and `tools/kernel.config.ts` module loader need updating for the new module? These are not mentioned in the Design section.
3. Should the `docs.archive` command description text be updated to mention `mission.archive`? It currently lists only five sub-commands.
