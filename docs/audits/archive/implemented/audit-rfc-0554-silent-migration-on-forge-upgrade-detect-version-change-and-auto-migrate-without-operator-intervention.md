---
rfcId: RFC-0554
auditId: AUDIT-RFC-0554-01
date: 2026-07-27
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0554

## Verdict: Needs revision

The RFC duplicates functionality already implemented by RFC-0543 (`forge.upgrade` command + `forge.syncedVersion` field) without acknowledging it. It proposes a new `forgeVersion` field that collides with the existing `forge.syncedVersion`, and claims to reuse the transplant migration-adapter registry (RFC-0546) for upgrade migration without explaining how adapters designed for source-code migration (`detect`/`analyze`/`migrate`/`postSetup` on external directories) apply to skill-and-binding sync. The RFC must either amend RFC-0543 to make `forge.upgrade` silent/session-start-triggered, or justify why a parallel mechanism is needed.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0554 --json` returns status: pass, 0 violations.

## Axis A — Structural completeness

- **Decision** is present-tense and clear: "Forge detects version changes at the start of any Forge session… silently runs the migration-adapter registry." Pass.
- **CLI surface** — missing. The RFC proposes no new commands but changes `forge-bootstrap` SKILL.md behavior. The `commands` frontmatter is empty (`proposed: []`, `added: []`, `changed: []`, `removed: []`). The RFC should list `forge-bootstrap` skill as changed, or clarify that no command surface changes.
- **TypeScript contracts** — missing. The RFC proposes a version-check function and registry extension but provides no type signatures. The `forgeVersion` field type, the version-comparison function, and the upgrade-adapter interface are unspecified.
- **File system responsibilities** table names concrete paths. Pass.
- **Output format** — missing. The RFC says migration is silent, but the version-check function still needs a machine-readable result shape (did migration run? what changed?) for agent consumption.
- **Failure modes** specifies behavior but mixes silent failure with operator-visible consequences. Pass with note.
- **Rollout** describes default behavior and existing-project path. Pass.
- **Alternatives considered** — the three alternatives do not include "amend `forge.upgrade` to be silent" or "use existing `forge.syncedVersion`", which are the most obvious alternatives given RFC-0543.
- **Risks** includes agent misinterpretation. Pass.
- **Acceptance criteria** — 8 items, all checkable. But criterion 1 (`forgeVersion` field) conflicts with existing `forge.syncedVersion` — see Axis C.
- **Implementation notes** are explicit behavioral rules. Pass.

## Axis B — DNA alignment

- **DNA-54 satisfaction is weak.** DNA-54 is the Forge bindings contract: "Canonical forge skill bodies must not contain hardcoded project-specific literals." The RFC's version-check mechanism does not extend, enforce, or protect DNA-54. The connection is tangential — the RFC is about version detection and migration, not about de-hardcoding literals from skill bodies. The `satisfies: [DNA-54]` entry appears decorative. The RFC should either justify the DNA-54 connection concretely or remove it.
- No new DNA invariant is established by this RFC.
- No conflict with existing DNA invariants.

## Axis C — Ecosystem fit

- **Critical: `forgeVersion` duplicates `forge.syncedVersion`.** RFC-0543 (implemented) already added `forge.syncedVersion` to `forgeConfigSchema` (`packages/forge/src/config/forge-config.ts:173`) and `forge.upgrade` already compares installed version vs `syncedVersion` (`packages/forge/src/onboarding/upgrade.ts:265-284`). The RFC proposes a new `forgeVersion` field without acknowledging the existing field. This is either:
  - A redundant second field (both track the same thing) — violates pragmatism.
  - An unacknowledged rename of `forge.syncedVersion` → `forgeVersion` — a breaking schema change requiring `versionBump: minor` and a migrator, not `patch`.
- **Critical: `forge.upgrade` already exists.** RFC-0543 (implemented) registered `forge.upgrade` in `forgeCoreModule` (`packages/forge/AGENTS.md:16`). It does exactly what RFC-0554 proposes: version detection, skill sync, binding defaults, version update. The RFC's non-goal "Adding a separate forge.migrate CLI command" sidesteps this, but the RFC never acknowledges that `forge.upgrade` already exists as the upgrade mechanism. The RFC should either:
  - Amend RFC-0543 to make `forge.upgrade` silent and session-start-triggered (forward-only: change the existing command, don't add a parallel path).
  - Justify why a session-start mechanism is needed alongside the existing CLI command.
- **Migration-adapter registry reuse is unclear.** The RFC says "The migration-adapter registry from RFC-0546 is extended to support upgrade migrations." But RFC-0546's adapters are designed for transplant: `detect(sourceDir)`, `analyze(sourceDir)`, `migrate(sourceDir, targetDir)`, `postSetup(targetDir)`. Upgrade migration is fundamentally different — it syncs `.agents/skills/` and binding defaults, not source code. The RFC does not explain how transplant adapters would be reused or what the upgrade-adapter interface looks like.
- **Package boundaries** — `packagesImpacted: [forge]` is correct.
- **Compass sync** — the RFC does not identify which `docs/*.xml` files need synchronization. If `forge.yaml` schema changes, `docs/technology.xml` may need updating.
- **AGENTS.md updates** — the RFC does not identify which `AGENTS.md` files need rule updates. `packages/forge/AGENTS.md` would need the session-start version check documented.

## Axis D — Forward-only compliance

- **Parallel path risk.** If the RFC adds a `forgeVersion` field alongside `forge.syncedVersion` and a session-start check alongside `forge.upgrade`, it creates a dual-path: two fields tracking the same thing, two mechanisms doing the same job. Forward-only discipline says: change the existing mechanism, don't add a parallel one. The RFC should amend RFC-0543, not create a second path.
- No backward compatibility shim is proposed. Pass.
- No deprecation grace period. Pass.

## Axis E — Agent-facing policy

- **Status gate** — the RFC is `draft` and does not contain self-authorizing language. Pass.
- **Implementation notes** reference RFC-0224, RFC-0334. Pass.
- **Anti-fabrication** — not applicable (no content authoring).
- **Storage policy** — not applicable (no persistence changes beyond `forge.yaml`).
- **Silent auto-commit in creative register** — the RFC says "Commit the migration changes silently (in creative register) or ask to commit (in business register)." This conflicts with the commit discipline in `_shared/fo-pipeline-conventions.md`: "Stage only the files this skill produces or modifies." Silent auto-commits of migration changes (which touch `.agents/skills/`, `forge.yaml`, potentially `AGENTS.md`) could conflict with other agents working in the same session. The RFC should specify the commit scope explicitly.

## Axis F — Pragmatism

- **Redundant field.** `forgeVersion` duplicates `forge.syncedVersion`. No justification is given for the new field name.
- **Redundant mechanism.** Session-start version check duplicates `forge.upgrade`. The RFC should extend the existing command, not create a new trigger.
- **Registry extension is speculative.** The RFC says "adapters are idempotent" but does not define what an upgrade adapter does. The existing transplant adapters cannot be reused as-is — their interface is source-directory-oriented.
- **Scope discipline** — `packagesImpacted: [forge]` is correct. `nonGoals` are meaningful. Pass.

## Axis G — Blind spots

- **"Session start" is undefined.** The RFC says "at the start of any Forge session (when the agent reads forge.yaml)" but there is no explicit session-start event in the Forge architecture. Forge sessions are agent-driven — the agent reads `forge.yaml` when a skill runs. Which skill triggers the check? Is it every skill? Only `forge-bootstrap`? A new meta-skill? The RFC must specify the trigger point.
- **Performance** — the RFC says version check is "a single file read and string comparison — negligible overhead." But if the check triggers on every skill invocation, it also involves reading `node_modules/@warpgogol/forge/package.json` (I/O) and potentially running migration adapters. The performance claim is only true for the no-op case.
- **Concurrent execution** — two agents in the same project could trigger migration simultaneously. The RFC does not address this.
- **Migration failure during session** — the RFC says "report the error silently in the session log, continue with the old configuration." But if skills were partially synced, the project could be in an inconsistent state. The RFC should specify atomicity or recovery.
- **Edge case: `forge.yaml` missing `forge.syncedVersion`** — the RFC says "treat as first-time setup, run all adapters." But `forge.upgrade` already handles this case (`fromVersion === null` → full sync). The RFC should acknowledge this existing behavior.

## Questions for the author

1. **Why does this RFC not acknowledge `forge.upgrade` (RFC-0543)?** The existing command already implements version detection, skill sync, binding defaults, and version tracking via `forge.syncedVersion`. Should this RFC amend RFC-0543 to make `forge.upgrade` silent and session-start-triggered, rather than creating a parallel mechanism?

2. **What is the relationship between `forgeVersion` and `forge.syncedVersion`?** If they track the same thing, why the new field? If `forgeVersion` is a rename, is this not a breaking schema change requiring `versionBump: minor` and a migrator?

3. **How are transplant migration adapters (RFC-0546) reused for upgrade migration?** The existing `MigrationAdapter` interface is `detect(sourceDir)` / `analyze(sourceDir)` / `migrate(sourceDir, targetDir)` / `postSetup(targetDir)` — all source-directory-oriented. Upgrade migration syncs skills and binding defaults, not source code. What is the upgrade-adapter interface?
