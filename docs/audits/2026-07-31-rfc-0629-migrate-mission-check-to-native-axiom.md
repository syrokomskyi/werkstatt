# Audit Report: RFC-0629 — Migrate mission.check to native axiom capsules with automated-web-accessibility methodology

- **RFC**: RFC-0629
- **Status**: draft
- **Kind**: architecture
- **Scope**: workspace
- **Audit date**: 2026-07-31
- **Validator**: agent (fo-idea-audit)
- **rfc.validate**: pass (0 violations)

---

## Summary

RFC-0629 proposes rewriting `mission.check` to use native Axiom components (`PlaywrightEvidenceDriver`, `CrawleeDiscoveryExecutor`, `StagedCapsule`) instead of the current manual Playwright + CDN axe-core implementation. The motivation is sound — CSP blocking, double browser launch, and Playwright version mismatches are real production problems. However, the RFC has **critical blind spots**: it proposes removing `check-runner-node` files that are consumed by unrelated commands (`check.run`, `check.evidence.capture`), it changes the evidence format without addressing `leitstand.propagate`'s gate (which reads the old format), and it introduces a `MissionCheckResult` interface change that breaks `leitstand.dev-deploy`'s result parsing. The `versionBump: patch` is incorrect for the scope of breaking changes. These issues need resolution before proceeding to enhance.

---

## Axis 1: Structural completeness — ⚠️ Minor issues

| Check | Result |
| --- | --- |
| Frontmatter schema | ✅ All required fields present |
| Standard sections | ✅ Context, Problem, Decision, Architectural fit, Design, Rollout, Alternatives, Risks, Acceptance criteria, Implementation notes |
| `rfc.validate` | ✅ Pass (0 violations) |
| `commands` field | ⚠️ `changed` list incomplete — see [S-2] |
| `amends` field | ⚠️ Empty — should list RFC-0628 — see [S-1] |
| `packagesImpacted` | ⚠️ Missing `@warpgogol/site-kernel-handoff` — see [S-3] |

### Findings

- **[S-1] `amends` field should list RFC-0628.** The RFC explicitly states (line 124): "RFC-0628's nonGoal 'Does not change mission.check or Axiom evidence format' is superseded by this RFC." This is an amendment to RFC-0628's scope — the `amends` frontmatter array should include `RFC-0628`. Currently `amends: []`.

- **[S-2] `commands.changed` is incomplete.** The RFC's rollout section (line 251) and acceptance criteria (line 290) state that `leitstand.dev-deploy` evidence post-processing must be updated to read `staged-capsule.json` instead of `evidence-capsule.yaml`. Additionally, `leitstand.propagate` reads `evidence-capsule.yaml` and `findings.yaml` for its evidence gate — these files will no longer exist. Both commands' implementations change. The `commands.changed` array should include `leitstand.dev-deploy` and `leitstand.propagate` alongside `mission.check`.

- **[S-3] `packagesImpacted` missing `@warpgogol/site-kernel-handoff`.** `leitstand.dev-deploy` and `leitstand.propagate` live in `@warpgogol/site-kernel-handoff` (`packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`). The RFC changes evidence reading in both commands. The package should be listed in `packagesImpacted`.

---

## Axis 2: DNA alignment — ✅ Clean

| Check                                                   | Result                        |
| ------------------------------------------------------- | ----------------------------- |
| `satisfies` entries exist in `docs/architecture-dna.md` | ✅ DNA-48 and DNA-49 exist    |
| DNA invariant semantics match RFC scope                 | ✅ RFC strengthens the gate   |
| No DNA invariant changes                                | ✅ No new/modified invariants |

### Findings

No issues. The RFC claims to satisfy DNA-48 (Release discipline) and DNA-49 (Fleet propagation). The claims are reasonable: the RFC strengthens the Axiom verification gate that DNA-49 mandates, making it reliable. The gate still exists, still checks evidence, still requires zero errors — only the implementation of `mission.check` changes. No DNA invariant is modified or extended.

---

## Axis 3: Ecosystem fit — 🔴 Critical issues

| Check | Result |
| --- | --- |
| TypeScript contracts match actual axiom exports | ✅ All types/functions verified in pipelines/packages/axiom/ |
| `check-runner-node` consumer analysis | 🔴 Removing files breaks `check.run` and `check.evidence.capture` |
| `axiom-methodology` dependency declared | 🔴 Not in `site-kernel-checks/package.json` |
| `MissionCheckResult` interface compatibility | 🔴 Breaks `leitstand.dev-deploy` result parsing |
| `StagedCapsule` fields for gate verification | ⚠️ No `missionId`/`commitSha` in output format |

### Findings

- **[E-1] 🔴 Removing `check-runner-node` files breaks unrelated commands.** The RFC's file system responsibilities table (lines 194–195) and implementation notes (line 307) instruct removing `packages/check-runner-node/src/playwright-adapter.ts` and `browser-capture-port.ts`. However, `captureSiteEvidenceGraph` in `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/check-runner-node/src/index.ts:53` imports `PlaywrightCaptureAdapter` from `playwright-adapter.ts` (line 24) and `BrowserCapturePort` from `browser-capture-port.ts` (line 23). This function is consumed by `check.run` (`@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel-check-warpgogol/src/commands/deploy.ts:193`) and `check.evidence.capture` (`@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel-check-warpgogol/src/commands/evidence.ts:62`). Removing these files would break both commands. The RFC should either: (a) not remove the files (scope the migration to `mission-check.ts` only), or (b) also migrate `check-runner-node` to use axiom-capture components, which is a much larger change requiring its own RFC.

- **[E-2] 🔴 `@syrokomskyi/axiom-methodology` is not a declared dependency.** The RFC imports `MethodologyPackage` and `findingsForObservation` from `@syrokomskyi/axiom-methodology` (line 158, 283). However, `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel-checks/package.json:86-87` only declares `@syrokomskyi/axiom-study` and `@syrokomskyi/axiom-capture` as dependencies. `@syrokomskyi/axiom-methodology` is missing. The rollout section does not mention adding it. An agent following the RFC would get a module-not-found error at implementation time. The RFC should list the dependency addition in the rollout.

- **[E-3] 🔴 `MissionCheckResult` interface change breaks `leitstand.dev-deploy`.** The current `MissionCheckResult` has `findings: { errors: number; warnings: number; total: number }` (`@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel-checks/src/mission-check.ts:44-48`). The RFC's new interface (lines 167-178) replaces this with `findingsCount: { critical: number; high: number; medium: number; low: number; info: number }`. `leitstand.dev-deploy` reads `data.findings.errors` and `data.findings.warnings` from the result (`@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:537-540`). With the new interface, `data.findings` is undefined, and the Axiom error/warning counts will silently default to 0. The RFC should either: (a) keep the `findings: { errors, warnings, total }` field for backward compatibility, or (b) explicitly list `leitstand.dev-deploy` result parsing as a change in the rollout.

- **[E-4] ⚠️ `StagedCapsule` may not carry `missionId`/`commitSha` fields.** The RFC's output format example (lines 204-212) shows `schema`, `classification`, `closureDecision` — no `missionId` or `commitSha`. But `leitstand.propagate`'s evidence gate (`@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:660-677`) reads `missionId` and `commitSha` from `evidence-capsule.yaml`. The RFC does not specify how these fields will be present in or injected into the `StagedCapsule` JSON. The `LocalCaptureContract` has `origins: [baseUrl]` but no `missionId` field. The RFC should specify how `missionId` and `commitSha` are carried in the new capsule format.

---

## Axis 4: Forward-only compliance — 🔴 Critical issues

| Check                       | Result                                         |
| --------------------------- | ---------------------------------------------- |
| No supersedes/amends        | ⚠️ Should `amends: [RFC-0628]` — see [S-1]     |
| `versionBump` appropriate   | 🔴 `patch` incorrect for breaking changes      |
| No DNA invariant changes    | ✅ No invariant changes                        |
| Breaking changes identified | 🔴 Local mode removal + evidence format change |

### Findings

- **[F-1] 🔴 `versionBump: patch` is incorrect.** The RFC removes the local build+static-server mode (lines 147-150), making `--external-preview --base-url` required. This is a breaking command interface change (Breaks-B). Additionally, the evidence format changes from YAML (`evidence-capsule.yaml`, `findings.yaml`) to JSON (`staged-capsule.json`, `observation-bundle.json`, `study-run.json`), which breaks file consumers (`leitstand.propagate` gate, tests). Per RFC-0478, breaking command interface changes require `versionBump: minor` and a migrator. The RFC should declare `versionBump: minor`.

- **[F-2] 🔴 Evidence format change has no migration path for `leitstand.propagate`.** `leitstand.propagate` reads `evidence-capsule.yaml` and `findings.yaml` (`@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:646-710`). The RFC replaces these with `staged-capsule.json` and `study-run.json`. The RFC's rollout (line 251) only mentions updating `leitstand.dev-deploy` post-processing — it does not mention updating `leitstand.propagate`'s evidence gate. Without an update, `leitstand.propagate` will fail with "no Axiom evidence found" on any release that used the new `mission.check`. The RFC must address this in the rollout.

---

## Axis 5: Agent-facing policy — ⚠️ Issues

| Check                          | Result                                                      |
| ------------------------------ | ----------------------------------------------------------- |
| Implementation notes present   | ✅ Clear "MAY/MUST" rules                                   |
| Status gate enforced           | ✅ "MAY implement ONLY when status: accepted"               |
| Removal instructions safe      | 🔴 Removing `check-runner-node` files is unsafe — see [Q-1] |
| Dependency additions mentioned | ⚠️ `axiom-methodology` not mentioned — see [Q-2]            |

### Findings

- **[Q-1] 🔴 Instruction to remove `check-runner-node` files is dangerous.** The implementation notes (line 307) state: "Agents MUST remove `mission-check-converter.ts`, `playwright-adapter.ts`, and `browser-capture-port.ts`." An agent following this instruction would break `check.run` and `check.evidence.capture` commands (see [E-1]). The RFC should either: (a) remove the instruction to delete `playwright-adapter.ts` and `browser-capture-port.ts`, or (b) scope it to only `mission-check-converter.ts` which is safe to remove.

- **[Q-2] ⚠️ `@syrokomskyi/axiom-methodology` dependency addition not mentioned.** The RFC imports from `@syrokomskyi/axiom-methodology` but it is not in `package.json`. The implementation notes should mention adding `"@syrokomskyi/axiom-methodology": "link:../../../../pipelines/packages/axiom/axiom-methodology"` to `site-kernel-checks/package.json`.

---

## Axis 6: Pragmatism — ⚠️ Scope too large

| Check | Result |
| --- | --- |
| Core migration (PlaywrightEvidenceDriver) | ✅ Addresses real problems |
| `mission-check-converter.ts` removal | ✅ Reasonable — findings projection moves to axiom-methodology |
| `check-runner-node` file removal | 🔴 Unnecessary and breaks other commands |
| Evidence format change (YAML → JSON) | ⚠️ Large ripple effect for unclear immediate value |

### Findings

- **[P-1] ⚠️ Removing `check-runner-node` files is out of scope.** The RFC's goal is to fix `mission.check`. Removing `check-runner-node`'s `playwright-adapter.ts` and `browser-capture-port.ts` is a separate concern that affects `check.run` and `check.evidence.capture`. The RFC should not touch `check-runner-node` at all — `mission-check.ts` already imports `PlaywrightCaptureAdapter` from `@syrokomskyi/axiom-capture`, not from `check-runner-node`.

- **[P-2] ⚠️ Evidence format change creates unnecessary ripple.** Changing from YAML (`evidence-capsule.yaml`, `findings.yaml`) to JSON (`staged-capsule.json`, `observation-bundle.json`, `study-run.json`) forces updates to `leitstand.dev-deploy` post-processing, `leitstand.propagate` gate logic, and all related tests. The RFC rejects the "hybrid" approach (use `PlaywrightEvidenceDriver` for capture, keep current evidence format) saying the ad-hoc format "lacks digest-backed integrity" (line 262). But the current dev-deploy pipeline works with the existing format; the integrity gap is aspirational, not a current blocker. A more pragmatic approach: (a) migrate to `PlaywrightEvidenceDriver` + `CrawleeDiscoveryExecutor` (fixes CSP, CDN, double-launch), (b) keep the YAML evidence format (avoids ripple), (c) plan the capsule format migration as a separate RFC. This reduces the RFC's blast radius significantly.

---

## Axis 7: Blind spots — 🔴 Critical gaps

### Findings

- **[B-1] 🔴 `leitstand.propagate` evidence gate not addressed.** The RFC only mentions updating `leitstand.dev-deploy` post-processing (line 251, 290). But `leitstand.propagate` reads `evidence-capsule.yaml` for `missionId` + `commitSha` verification (`@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:646-677`) and `findings.yaml` for `summary.errors === 0` verification (lines 680-710). With the new format, these files won't exist. `leitstand.propagate` will fail with "no Axiom evidence found" on every release. The RFC must specify how the gate reads the new `staged-capsule.json` and `study-run.json` files, including: where `missionId` and `commitSha` are stored in the `StagedCapsule`, and how error counts are derived from `StudyRun` findings.

- **[B-2] 🔴 `StagedCapsule` integrity vs `commitSha` injection conflict.** `StagedCapsule` is a digest-backed capsule type (verified: `closureDecisionSchema`, `capabilityManifestSchema` in `axiom-capture/src/contracts.ts`). `leitstand.dev-deploy` post-processes the evidence to inject `commitSha` (`@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:555-574`). Modifying a digest-backed JSON capsule after creation may invalidate its integrity signature. The RFC does not address whether `StagedCapsule` supports post-hoc field injection without invalidating its digest, or whether `commitSha` must be part of the capsule at creation time.

- **[B-3] 🔴 Severity mapping transition not addressed.** The current converter maps axe-core violations to `error` severity and incomplete results to `warning` severity (`@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel-checks/src/mission-check-converter.ts:36-74`). `leitstand.propagate` checks `summary.errors === 0` (`@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:705-709`). The RFC introduces a quintary severity scale (`critical`, `high`, `medium`, `low`, `info`) and says the gate fails when findings have severity `high` or `critical` (line 242, 286). But `leitstand.propagate` currently checks for `errors > 0`. The RFC does not specify how `leitstand.propagate`'s error check transitions to the new severity model. If `leitstand.propagate` is not updated, it will look for `summary.errors` in `findings.yaml` (which no longer exists) and fail.

- **[B-4] ⚠️ Test updates not mentioned in acceptance criteria.** The existing tests (`mission-check.test.ts`, `leitstand-0628-dev-deploy.test.ts`) will need significant updates: the evidence file names change, the result interface changes, the severity model changes, and the test helpers (`writeEvidenceCapsule`, `writeAxiomFindings`) write YAML files that will no longer be produced. The acceptance criteria (lines 279-294) mention `build:check` passing but not test updates. The RFC should add an acceptance criterion for test updates.

- **[B-5] ⚠️ Playwright version bump impact on `independent-qa.ts` not in `packagesImpacted`.** The RFC requires bumping `playwright` to `^1.62.1` (line 252, 305). The risks section (line 270) mentions `independent-qa.ts` as an affected consumer, but `packagesImpacted` does not list `@warpgogol/site-kernel-checks` for this impact (it is listed for the mission.check change, but the Playwright bump affects `independent-qa.ts` separately). The RFC should acknowledge that the Playwright version bump is a workspace-wide change affecting all Playwright consumers.

---

## Open questions for the operator

1. **[Q-E-1]** Should the RFC keep `check-runner-node` files intact and scope the migration to `mission-check.ts` only? Or does the operator want a full `check-runner-node` migration to axiom-capture components (separate RFC)?

2. **[Q-F-1]** Should `versionBump` be corrected to `minor`? The removal of local mode and evidence format change are breaking changes.

3. **[Q-B-1]** How should `leitstand.propagate`'s evidence gate be updated? Options: (a) read `missionId`/`commitSha` from `StagedCapsule` JSON fields, (b) keep a thin YAML sidecar with `missionId`/`commitSha`/`errors` for the gate, (c) have `mission.check` write a compatibility `evidence-capsule.yaml` alongside the native capsule files.

4. **[Q-P-2]** Would the operator prefer a phased approach: (1) fix `mission.check` to use `PlaywrightEvidenceDriver` + `CrawleeDiscoveryExecutor` while keeping the YAML evidence format, then (2) migrate to native capsule format in a separate RFC? This reduces the blast radius significantly.

---

## Summary table

| Axis                       | Severity     | Count |
| -------------------------- | ------------ | ----- |
| 1. Structural completeness | Minor        | 3     |
| 2. DNA alignment           | Clean        | 0     |
| 3. Ecosystem fit           | **Critical** | 4     |
| 4. Forward-only compliance | **Critical** | 2     |
| 5. Agent-facing policy     | **Critical** | 2     |
| 6. Pragmatism              | Minor        | 2     |
| 7. Blind spots             | **Critical** | 5     |

**Total findings: 18** (8 critical, 10 minor)

**Recommendation:** Address critical findings (E-1, E-2, E-3, F-1, F-2, Q-1, B-1, B-2, B-3) before proceeding to enhance. The most impactful issues are: (1) the `check-runner-node` file removal that breaks unrelated commands, (2) the `leitstand.propagate` evidence gate that will fail with the new format, and (3) the `MissionCheckResult` interface change that silently breaks `leitstand.dev-deploy`'s result parsing. Consider the phased approach described in [Q-P-2] to reduce blast radius.
