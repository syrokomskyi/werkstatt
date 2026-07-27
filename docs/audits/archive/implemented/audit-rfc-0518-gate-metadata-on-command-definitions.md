---
rfcId: RFC-0518
auditId: AUDIT-RFC-0518-01
date: 2026-07-24
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
rfcPath: docs/rfcs/rfc-0518-gate-metadata-on-command-definitions.md
---

# Audit: RFC-0518

## Verdict: Needs revision

The RFC's core design (optional `gate?: GateMetadata` on `KernelCommandMetadata`) is sound and well-motivated. However, the "File system responsibilities" table contains incorrect file paths for 5 of the 10 commands in the initial population, and `packagesImpacted` omits two packages that must be touched. These are fixable accuracy issues, not design flaws.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0518 --json` returned 0 violations.

## Axis A — Structural completeness

- **FAIL — File system responsibilities table has incorrect paths for multiple commands.** The RFC states gate metadata is added to "curated commands in the command-tables" (`packages/os/site-kernel-checks/src/command-tables/*.ts`), but 5 of the 10 commands in the initial population are NOT registered there:
  - `platform.consistency.validate` is registered in `packages/os/site-kernel-handoff/src/platform-module.ts` (line 22), not in command-tables.
  - `surface.contract.validate` is registered in `packages/os/site-kernel-handoff/src/sternsystem/sternsystem.module.ts` (line 145), not in command-tables.
  - `sternsystem.validate` is registered in `packages/os/site-kernel-handoff/src/sternsystem/sternsystem.module.ts` (line 60), not in command-tables.
  - `mission.validate` is registered in `packages/os/site-kernel-handoff/src/mission/mission.module.ts` (line 164) and `packages/os/site-kernel-handoff/src/mission/index.ts` (line 156), not in `mission-materialize.ts` as the RFC states. The RFC hedges with "(if registered there)" which confirms the uncertainty.
  - `compass.audit.validate` is registered in `packages/forge/os/compass/compass.module.ts` (line 176), not in command-tables.
- **FAIL — CLI surface section missing.** The RFC changes `ecosystem.manifest.generate` and `ecosystem.manifest.validate` but does not show exact command invocations with flags and scope.
- **FAIL — Output format section missing.** The RFC does not document the `--json` shape for the changed commands.
- **FAIL — Failure modes section missing.** No exit codes or warn-vs-fail behavior specified for the changed commands.

## Axis B — DNA alignment

- **PASS — DNA-1 (Monorepo boundary).** The RFC body at line 109 explains how `gate` is a type-level addition to the shared kernel types package, inherited by all packages that register commands. This is a valid DNA-1 alignment.

## Axis C — Ecosystem fit

- **FAIL — `packagesImpacted` is incomplete.** The RFC lists `@gogol/site-kernel` and `@gogol/site-kernel-checks`, but:
  - `@gogol/site-kernel-handoff` is impacted — `platform.consistency.validate`, `surface.contract.validate`, `sternsystem.validate`, and `mission.validate` are all registered there and need `gate` metadata added to their registrations.
  - `@wgogol/forge` is impacted — `compass.audit.validate` is registered in `packages/forge/os/compass/compass.module.ts` and needs `gate` metadata added there.
- **FAIL — File system responsibilities table omits registration files.** The table does not list `packages/os/site-kernel-handoff/src/platform-module.ts`, `packages/os/site-kernel-handoff/src/sternsystem/sternsystem.module.ts`, `packages/os/site-kernel-handoff/src/mission/mission.module.ts`, or `packages/forge/os/compass/compass.module.ts` — all of which need `gate` metadata added to command registrations.
- **PASS — Package boundaries.** The `gate` field follows the existing optional-metadata pattern (`mutatesState`, `cacheable`, `reads`, `writes`). No boundary violations.
- **PASS — Command lifecycle.** `commands.changed` lists `ecosystem.manifest.generate` and `ecosystem.manifest.validate` — both are existing registered commands being changed. Correct bucket.
- **WARNING — Compass sync not addressed.** Adding `gate` metadata to the ecosystem manifest changes the ACP manifest shape. The RFC should identify whether `docs/technology.xml` or `docs/knowledge-graph.xml` need synchronization (root AGENTS.md Compass document duties).
- **WARNING — AGENTS.md updates not addressed.** The RFC should mention updating `packages/AGENTS.md` or package-level AGENTS.md files to document the `gate` field convention for command registrations.

## Axis D — Forward-only compliance

- **PASS.** The `gate` field is optional and additive. No compatibility shims, no dual-path, no legacy maintenance. Existing commands without `gate` are unaffected.

## Axis E — Agent-facing policy

- **PASS.** The RFC correctly states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" (line 281) and references RFC-0224 for the accepted→implemented transition (line 282). No self-authorizing language.
- **PASS — Anti-fabrication.** The RFC's acceptance criteria are code changes an agent can make (type additions, metadata population, manifest projection). No content authoring claims.

## Axis F — Pragmatism

- **WARNING — `GateConditional.kind` includes `"biome"` with no initial consumer.** None of the 10 commands in the initial population use `kind: "biome"`. This is speculative generality. Either add a command that uses it to the initial population, or remove it and add it when a consumer arrives (forward-only principle).
- **PASS — Existing patterns.** The RFC correctly follows the existing optional-metadata pattern (`cacheable`, `reads`, `writes`). The alternatives section honestly evaluates and rejects a separate gate registry file, required field, and pipeline-file placement.
- **PASS — Scope discipline.** `appsImpacted: []` is correct — this is a package-level type change. `nonGoals` are explicit and meaningful.

## Axis G — Blind spots

- **WARNING — Orphaned gate metadata not considered.** What happens when a command has `gate` metadata but is not in any validation pipeline? The RFC doesn't address this edge case. RFC-0519's `gate.catalog.validate` (GATE-CAT-04) cross-checks declared phase against pipeline placement, but RFC-0518 itself doesn't mention the risk.
- **PASS — Performance.** Projecting `gate` metadata into the ecosystem manifest is in-memory projection during `buildEcosystemManifest()`. Negligible cost — no file scanning beyond what the manifest generator already does.

## Questions for the author

1. The initial population lists `platform.consistency.validate`, `surface.contract.validate`, `sternsystem.validate`, `mission.validate`, and `compass.audit.validate` — all registered outside `command-tables/`. Will gate metadata be added directly to the `registry.registerCommand()` calls in `platform-module.ts`, `sternsystem.module.ts`, `mission.module.ts`, and `forge/os/compass/compass.module.ts`? If so, the file system responsibilities table and `packagesImpacted` must be updated.
2. `GateConditional.kind` includes `"biome"` — which command in the initial population uses it? If none, should it be removed until a consumer exists?
3. Does adding `gate` metadata to the ecosystem manifest require updates to `docs/technology.xml` or `docs/knowledge-graph.xml` (Compass document duties)?
