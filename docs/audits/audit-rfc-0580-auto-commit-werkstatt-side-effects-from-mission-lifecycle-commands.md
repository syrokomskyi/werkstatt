---
rfcId: RFC-0580
auditId: AUDIT-RFC-0580-01
date: 2026-07-29
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0580

## Verdict: Needs revision

The RFC correctly identifies a real hygiene gap and proposes a well-scoped helper with idempotent, specific-file staging. However, several findings need resolution before implementation: `gitExec` is private and not exported from `bordbuch-io.ts`, the design example doesn't match actual handler flow, the `mission.migrate` and `mission.materialize` handlers lack `commitAndPushBordbuch` calls (pre-existing gap that creates asymmetry), and the foreign-changes-in-same-files edge case is not addressed.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **`gitExec` is private, not exported.** The RFC says the helper uses "`gitExec` for git operations" and the alternatives section rejects `simple-git` because "`gitExec` is already used in the codebase (`bordbuch-io.ts`)." However, `gitExec` is a private function in `bordbuch-io.ts:319` — it is not exported. The RFC must specify whether to (a) export `gitExec` from `bordbuch-io.ts` and import it in the new helper, or (b) define a new `gitExec` in `werkstatt-commit.ts`. Option (a) is cleaner but changes `bordbuch-io.ts`'s export surface; option (b) duplicates a small utility.

- **Design example doesn't match actual handler flow.** The RFC's example (lines 152–163) shows `writeRegistry` → `writeMissionManifest` → `commitWerkstattSideEffects`. But in `mission-open.ts:140-155`, the actual order is `writeMissionManifest` → `appendBordbuchEntry` → `commitAndPushBordbuch` → `writeRegistry`. The example should either show the real flow or explicitly note it's simplified. More importantly, the RFC must specify where `commitWerkstattSideEffects` fits relative to the existing `commitAndPushBordbuch` call — before or after.

- **Missing `werkstatt/index.ts` export.** The file system responsibilities table lists `werkstatt-commit.ts` as a new file but doesn't mention updating `werkstatt/index.ts` to export the new helper. The existing pattern (line 28–29 of `index.ts`) exports all werkstatt utilities from the barrel.

## Axis B — DNA alignment

No issues. DNA-45 (fleet registry), DNA-46 (mission lifecycle), and DNA-51 (werkstatt consistency primitives) are all real invariants in `docs/architecture-dna.md`. The RFC explains how auto-commit extends each: DNA-45 ensures registry mutations are persisted (not left dirty), DNA-46 ensures manifest writes are durable, DNA-51 extends the shared-primitives contract to include git commit hygiene. No conflicts with existing DNA.

## Axis C — Ecosystem fit

- **Package placement** — `packages/os/site-kernel-handoff/src/werkstatt/werkstatt-commit.ts` is the correct package and directory. All lifecycle handlers already import from `../werkstatt/index.ts`. ✓

- **AGENTS.md update not identified.** `packages/os/site-kernel-handoff/AGENTS.md` has a section "Bordbuch git synchronization (RFC-0477)" documenting the auto-commit pattern for bordbuch. The RFC should identify that this section needs updating to document the parallel werkstatt auto-commit pattern, or note that a new section should be added.

- **No Compass sync needed** — this is an internal change to command handlers, not a repository-wide contract change. ✓

- **Command lifecycle buckets** — `commands.changed` lists 6 existing commands. All are registered in `mission.module.ts`. ✓

## Axis D — Forward-only compliance

No issues. No backward compatibility layers, no deprecation, no legacy code paths. The change is always-on with no opt-out.

## Axis E — Agent-facing policy

No issues. No self-authorizing language. Implementation notes are explicit behavioral rules. No content authoring. No storage/persistence concerns.

## Axis F — Pragmatism

- **`packagesImpacted`** — only `@warpgogol/site-kernel-handoff` is listed, which is correct. All modified files are in this package. ✓

- **Lean contract** — the `commitWerkstattSideEffects` signature is minimal. ✓

- **Existing patterns** — reuses the `gitExec` + `commitAndPushBordbuch` pattern from `bordbuch-io.ts`. ✓ (subject to the export issue in Axis A)

## Axis G — Blind spots

- **`mission.migrate` does not call `commitAndPushBordbuch`.** Looking at `mission-migrate.ts:219-232`, the handler calls `appendBordbuchEntry` but never calls `commitAndPushBordbuch`. This means the bordbuch entry is appended to `events.ndjson` in the cache clone but not committed. The RFC adds `commitWerkstattSideEffects` to `mission.migrate` (committing `mission.yaml` to the werkstatt tree), but the bordbuch entry remains uncommitted in the cache clone. The RFC should note this pre-existing gap and either address it or explicitly scope it out.

- **`mission.materialize` does not call `commitAndPushBordbuch`** for the main materialization. It only calls `appendBordbuchEntry` for the preflight-skipped case (`mission-materialize.ts:811-823`), and even that is not followed by `commitAndPushBordbuch`. The RFC adds `commitWerkstattSideEffects` to `mission.materialize` (committing `mission.yaml` + `pnpm-lock.yaml`), but the bordbuch entry remains uncommitted. Same as above.

- **`mission.reconcile` does not call `appendBordbuchEntry` or `commitAndPushBordbuch`.** The reconcile handler (`mission-materialization-commands.ts:532-823`) does git merge + push on the cache clone but does not append a bordbuch entry. The RFC adds `commitWerkstattSideEffects` (committing `mission.yaml`), but there's no bordbuch entry to commit. This is a pre-existing gap — reconcile doesn't record a bordbuch entry. The RFC should note this.

- **Foreign changes in same files.** The failure modes table says "Foreign uncommitted changes in same files → `git add <specific paths>` stages only the named files; foreign changes in other files are not touched." This is misleading. `git add <specific paths>` stages ALL changes in those files, including foreign ones. If someone manually edited `registry.yaml` before the lifecycle command, `git add systems/registry.yaml` would stage both the lifecycle command's changes AND the manual edits. The RFC should clarify this edge case and explain the mitigation (locks serialize access, so concurrent manual edits are unlikely but not impossible).

- **`sternsystem.sync` boundary.** `sternsystem-sync.ts:241` also calls `commitAndPushBordbuch`. The RFC's scope is "mission lifecycle commands" only, so `sternsystem.sync` is out of scope. The RFC should note this boundary explicitly — `sternsystem.sync` also leaves werkstatt-level files dirty (if it mutates `registry.yaml`), but is not covered by this RFC.

- **Conditional `registry.yaml` writes.** In `mission-close.ts:285-288` and `mission-abort.ts:148-151`, `writeRegistry` is only called when `entry.currentMission === missionId`. If the condition is false, `registry.yaml` is not modified. The RFC says these handlers call the helper with `registry.yaml` + `mission.yaml`. The helper's `git add` on an unchanged `registry.yaml` is a no-op (harmless), but the RFC should note this conditional behavior.

## Questions for the author

1. Should `gitExec` be exported from `bordbuch-io.ts` and reused in `werkstatt-commit.ts`, or should a new `gitExec` be defined in the new file? If exported, this changes `bordbuch-io.ts`'s export surface — is that acceptable?
2. Where does `commitWerkstattSideEffects` fit relative to the existing `commitAndPushBordbuch` call? Should the werkstatt commit happen before or after the bordbuch commit? The design example doesn't show the bordbuch commit at all.
3. `mission.migrate` and `mission.materialize` do not call `commitAndPushBordbuch` — should this RFC also add `commitAndPushBordbuch` calls to these handlers, or is that a separate concern? The asymmetry means bordbuch entries from these handlers remain uncommitted in the cache clone while `mission.yaml` is committed in the werkstatt tree.
