---
rfcId: RFC-0635
auditId: AUDIT-RFC-0635-01
date: 2026-08-01
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0635

## Verdict: Needs revision

The RFC has a critical factual error in its `--force` flag claim: the kernel CLI strips `--force` via `consumeCommonFlags` but never passes it to `executeKernelCommand` for individual command invocations — it is only wired for pipeline execution. The implementation would require either CLI changes or a command-level flag schema addition. Additionally, the RFC does not address the `mission.close` inline validation interaction, and the `MissionValidateData` type change is breaking without a migration note.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0635 --json` returned exit code 0 with no violations.

## Axis A — Structural completeness

No issues. All required sections are present: Context, Problem, Decision, Architectural fit, Design (CLI surface, TypeScript contracts, File system responsibilities, Output format, Failure modes), Rollout, Alternatives considered, Risks, Acceptance criteria, Implementation notes for agents. The frontmatter is well-formed with correct `satisfies: DNA-47`, `commands.changed`, and `packagesImpacted` entries.

## Axis B — DNA alignment

- **DNA-47 (Materialization):** Correctly cited as `satisfies`. The RFC extends `mission.validate` behavior within the materialization lifecycle. Distribution reuse when inputs haven't changed is consistent with the Werkstück validation contract — a hash-matched distribution is provably identical to what `mission.build` produced. No conflict.

- **DNA-46 (Mission lifecycle):** Correctly cited as `related`. The RFC correctly states the lifecycle state machine is unchanged — only the validation path is shortened. No conflict.

- **DNA-53 (Semantic fingerprint governance):** Not cited in `related` or `satisfies`, but the RFC correctly states it reuses `computeBuildInputHash` from `build-pipeline-helpers.ts` (which uses `@warpgogol/fingerprint` internally). No violation, but DNA-53 could be referenced for completeness since the RFC depends on fingerprint governance for hash correctness.

## Axis C — Ecosystem fit

- **Finding C-1 (Medium):** The RFC proposes adding `build.check` to `mission.build` between `build.prepare` and `astro build`. This is a behavioral change that may cause `mission.build` to fail on content validation errors that were previously only caught by `mission.validate`. The RFC acknowledges this in the Rollout section. However, the current `runMissionBuild` implementation at `@/packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:498-538` uses `runPipelinePhase` (which throws on failure), while `runMissionValidate` uses `executeKernelPipeline` directly (which returns a report). The implementation should use `executeKernelPipeline` for `build.check` in `mission.build` to provide consistent error reporting and avoid throwing.

- **Finding C-2 (Low):** The RFC references `release.prepare` (RFC-0585) as the precedent for distribution reuse. The existing `release.prepare` code at `@/packages/os/site-kernel-handoff/src/release/release-commands.ts:220-230` implements the exact same hash comparison pattern. The RFC correctly identifies this as the same logic, promoting code reuse via `computeBuildInputHash`. Good ecosystem fit.

- **Finding C-3 (Low):** The RFC does not mention RFC-0628 (dev-deploy workflow) in `related`. Since `leitstand.dev-deploy` builds the workpiece directly (bypassing `mission.validate`), the distribution reuse optimization doesn't affect dev-deploy. But `mission.validate` is part of the mission close lifecycle, and RFC-0628 changed the relationship between dev deploys and mission validation. A brief note clarifying that distribution reuse only affects the `mission.validate` → `mission.close` path, not dev-deploy, would improve ecosystem clarity.

## Axis D — Forward-only compliance

No issues. The RFC is purely additive — it adds a hash check before the build cycle and adds `build.check` to `mission.build`. No existing behavior is removed; the full build path is preserved as fallback. The `--force` flag provides an escape hatch. No downgrade path is needed.

## Axis E — Agent-facing policy

- **Finding E-1 (High):** The RFC states: "The `--force` flag is already accepted by the kernel CLI and passed through to `ExecuteKernelPipelineOptions.force`. `mission.validate` reads it from `input.flags.force`." This is **factually incorrect** for command execution. The CLI's `consumeCommonFlags` (`@/packages/os/site-kernel/src/cli/index.ts:87-89`) strips `--force` from argv, but the command execution path at `@/packages/os/site-kernel/src/cli/index.ts:195` does NOT destructure `force` from the result, and `executeKernelCommand` (`@/packages/os/site-kernel/src/runtime/execute-command.ts:313-322`) does NOT accept a `force` option — it is absent from `EXECUTE_KERNEL_COMMAND_OPTION_KEYS`. The `--force` flag is only wired for pipeline execution (`executeKernelPipeline`), not individual command execution. An operator running `mission.validate --force` would have the flag silently discarded. The implementation must either: (a) add `force` to the `mission.validate` command's flag schema in `mission.module.ts` AND modify `consumeCommonFlags` to not strip `--force` for command invocations, or (b) pass `force` through to `executeKernelCommand` and set it on `input.flags`. The RFC should document which approach is taken.

- **Finding E-2 (Medium):** The RFC adds `distributionReused: boolean` and `buildInputHash: string | null` to the `MissionValidateData` interface. The current `MissionValidateData` at `@/packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:72-76` has a different shape (`missionId`, `contractFull`, `build`). The RFC's proposed interface is a superset, but the existing `report` object constructed at lines 376-396 is cast as `unknown` to `MissionValidateData`. The RFC should note that the existing `report` object structure (with `contractFull.validators`, `build.succeeded`, etc.) must be retained alongside the new fields — the proposed interface in the RFC shows only the new fields with a comment "existing fields retained", but the actual `MissionValidateData` type definition needs to be updated to include both old and new fields.

- **Finding E-3 (Medium):** The RFC's implementation notes say "Agents MUST check `distributionReused` in the `mission.validate` JSON output before assuming a full build ran." This is a new agent-facing rule. However, `mission.close` calls `runMissionValidate` internally via `runInlineValidate` (`@/packages/os/site-kernel-handoff/src/mission/mission-close.ts:106-130`) with a synthetic input that does NOT include `force: true`. This means `mission.close` would also benefit from distribution reuse, skipping the build cycle when the hash matches. The RFC does not address this interaction — it should explicitly state whether `mission.close`'s inline validation should also respect distribution reuse (and if so, whether `mission.close` should ever force a full rebuild).

## Axis F — Pragmatism

- **Finding F-1 (Low):** The RFC claims `mission.validate` takes "3–4 minutes" on warpgogol-com-m000024. This is consistent with measured performance (see memory: `mission.validate` runs 30+ `build.prepare` validators plus `bordbuch.generate` and `bordbuch.commit`). The optimization is well-motivated.

- **Finding F-2 (Low):** The acceptance criteria include 4 unit tests (hash match, hash mismatch, `--force`, `build.check` in `mission.build`). This is sufficient coverage. The existing test files (`mission-validate-dist-cleanup.test.ts`, `mission-validate-snapshot-auto-regen.test.ts`, `mission-validate-cache-clone-warning.test.ts`) will need to be updated to account for the new distribution reuse path. The RFC should mention this.

- **Finding F-3 (Low):** The `mission.validate` command registration in `@/packages/os/site-kernel-handoff/src/mission/mission.module.ts:193-208` does not declare `cacheable: false`. Since `mission.validate` depends on external state (file system, build tools, git), it should arguably be `cacheable: false` like `mission.build`. However, since `mission.validate` is a workspace-scoped command never executed as a pipeline step, the command-result cache (RFC-0390) would never cache it. This is not a blocker but is worth noting for consistency.

## Axis G — Blind spots

- **Finding G-1 (Medium):** The RFC does not address what happens when `mission.build` is called but `build.check` fails. The failure mode section says "mission.build fails with the check error. distribution/ is not created, so mission.validate will run the full cycle." But the current `runMissionBuild` writes `build-input-hash.json` only when `buildSucceeded` is true (line 553). If `build.check` is added and fails, `buildSucceeded` would be false, so `build-input-hash.json` would not be written. This is correct behavior, but the RFC should explicitly state that `build-input-hash.json` is only written on successful builds (including `build.check`).

- **Finding G-2 (Low):** The `computeBuildInputHash` function at `@/packages/os/site-kernel-handoff/src/build-pipeline-helpers.ts:65-81` hashes only `src/content/` (via `fingerprintTree` with `mode: "semantic"`). Changes to files outside `src/content/` (e.g., `src/pages/`, `astro.config.mjs`, `package.json`) would NOT change the hash. The RFC's Risks section mentions "platform package change not reflected in `platformSemanticHash`" but doesn't mention non-content file changes. For mission workpieces, these files are generated by `build.prepare` from the platform, so `platformSemanticHash` should capture them. But if an operator manually edits a non-content file in the workpiece, the hash would not change. The RFC should acknowledge this edge case or state that manual edits to non-content files are already discouraged by the mission lifecycle.

- **Finding G-3 (Low):** The RFC does not mention the `mission.validate` gate metadata in `mission.module.ts` (`gate: { severity: "error", phase: "mission", blocks: ["mission.close", "release.prepare"] }`). Distribution reuse does not change the gate semantics — `mission.validate` still blocks `mission.close` and `release.prepare` regardless of whether the build was reused or run fresh. But the RFC should briefly confirm that the gate metadata remains unchanged.

## Questions for the author

1. How will `--force` be delivered to the `runMissionValidate` handler? The CLI currently strips `--force` for command invocations — will you modify `consumeCommonFlags` to pass it through, or add `force` to the `mission.validate` flag schema and adjust the CLI to not strip it?
2. Should `mission.close`'s inline validation (`runInlineValidate`) also benefit from distribution reuse, or should it always force a full rebuild? If the former, what happens if the operator wants `mission.close` to guarantee a fresh build?
3. The current `MissionValidateData` interface has `contractFull` and `build` fields. The RFC's proposed interface adds `distributionReused`, `buildInputHash`, and `fullBuildRan`. Will the final type merge old and new fields, or replace the structure? If merged, how does `fullBuildRan: false` interact with the existing `build.succeeded: true` field when the distribution is reused?
