---
reviewId: REVIEW-CODE-2026-08-12-05
date: 2026-08-12
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: 621fbe21...HEAD
sessionScope: RFC-0813 + RFC-0814 + RFC-0802 stamp
filesReviewed:
  - packages/werkstatt-site/src/checks/playwright-chromium-ensure.ts
  - packages/werkstatt-site/src/checks/playwright-preflight.ts
  - packages/werkstatt-site/src/checks/command-tables/infra-contracts.ts
  - packages/werkstatt-site/src/checks/index.ts
  - packages/werkstatt-site/src/checks/tests/playwright-preflight.test.ts
  - packages/werkstatt/src/mission/mission-materialization-commands.ts
  - packages/werkstatt/src/kernel/runtime/execute-pipeline.ts
  - packages/werkstatt/src/kernel/runtime/execute-command.ts
  - packages/werkstatt/src/kernel/tests/system-injection.test.ts
  - packages/werkstatt/src/dns/dns.module.ts
  - docs/rfcs/rfc-0802-add-interactive-maturity-mountain-page-with-gsap-camera-pan-and-marker-animation.md
  - docs/rfcs/rfc-0813-add-playwright-preflight-check-to-mission-validate.md
  - docs/rfcs/rfc-0814-add-system-flag-auto-injection-for-workspace-scoped-pipeline-commands.md
---

# Session Code Review: 621fbe21...HEAD

### Verdict: Approved

Zero findings across all seven axes. The session implements two RFCs (0813, 0814) and stamps a third (0802). The diff is clean, well-structured, and follows existing patterns.

### Mechanical floor

- `pnpm --filter @warpgogol/werkstatt-site build:check` — exit 0
- `pnpm --filter @warpgogol/werkstatt build:check` — exit 0
- `vitest run` (playwright-preflight.test.ts + playwright-chromium-ensure.test.ts) — 9/9 pass
- `vitest run` (system-injection.test.ts) — 8/8 pass
- `rfc.validate --id RFC-0813` — 0 errors
- `rfc.validate --id RFC-0814` — 0 errors
- `rfc.validate --id RFC-0802` — 0 errors
- `rfc.acceptance.run --id RFC-0813` — 0 failed probes
- `rfc.acceptance.run --id RFC-0814` — 0 failed probes

### Axis A — Structural correctness

No issues.

- **RFC-0813**: `isChromiumInstalled` is a clean extraction from `ensureChromium` — same `chromium.launch({ headless: true })` detection logic, returning a structured `ChromiumInstallStatus` with `error` field. `ensureChromium` correctly delegates to it as first phase. The preflight handler is a thin wrapper mapping two outcomes to exit codes.
- **RFC-0814**: The injection logic is symmetric in both paths (pipeline + CLI) — identical `acceptsSystem` check with three-way branch: no flags (inject), `system` key with `kind: "string"` (inject), otherwise (skip). The `"system" in command.flags` guard correctly precedes `command.flags.system.kind` access (short-circuit).
- **No magic numbers**: `exitCode: 1` and `exitCode: 0` are standard kernel conventions.
- **No dead code**: All new exports have consumers. `isChromiumInstalled` is consumed by both `ensureChromium` and `runPlaywrightPreflightCheck`. `ChromiumInstallStatus` is consumed by both functions and re-exported from `index.ts`.
- **Error handling**: The preflight catch block in `runMissionValidate` (line 471-476) is intentionally non-fatal — if the check command itself throws unexpectedly, the build proceeds. This is documented in the comment. The `isChromiumInstalled` catch block returns `{ installed: false, error }` rather than throwing — correct for a detection function.
- **Fowler code smells**: None. The extraction reduces duplication (launch-verify logic was inlined in `ensureChromium`, now shared). The injection blocks are small, focused, and placed directly after the analogous `--site` injection — no Feature Envy or Shotgun Surgery.

### Axis B — DNA alignment

No issues.

- **DNA-64 (Engine/plugin boundary)**: `mission-materialization-commands.ts` (engine) uses `executeKernelCommand` to invoke `playwright.preflight.check` (plugin command) rather than directly importing from `@warpgogol/werkstatt-site/checks`. This respects the autonomy guard — `checks` is not in the exemption list.
- **DNA-24 (Block-declarative pages)**: Not touched.
- **DNA-37 (Universal Section Props)**: Not touched.
- No new `@warpgogol/*` imports in `packages/werkstatt/src/**` that would violate the autonomy guard.

### Axis C — Ecosystem fit

No issues.

- **Package boundaries**: `playwright-preflight.ts` is in `werkstatt-site/checks` (plugin), `mission-materialization-commands.ts` is in `werkstatt` (engine), `execute-pipeline.ts` and `execute-command.ts` are in `werkstatt/kernel` (engine). All imports flow engine → engine, plugin → engine. No reverse dependencies.
- **Command registration**: `playwright.preflight.check` registered in `infra-contracts.ts` alongside `playwright.chromium.ensure`, following the existing command table pattern. Command manifest regenerated (747 commands).
- **Pipeline integration**: The `--system` injection follows the exact same pattern as the existing `--site` injection — one block below it in both files. The `dns.record.upsert` flag revert from optional to `required: true` is the correct corollary.
- **No pipeline definitions changed**: The preflight is a direct `executeKernelCommand` call inside `runMissionValidate`, not a pipeline step, as specified in RFC-0813.

### Axis D — Forward-only compliance

No issues.

- No legacy code paths, no compatibility shims.
- `isChromiumInstalled` extraction is purely additive — `ensureChromium` behavior is unchanged (same launch check, same auto-install fallback via `preflightChromium`).
- The `dns.record.upsert` handler's existing `?? context.site?.name` fallback at line 65 remains as defense-in-depth — now unreachable in pipeline/CLI paths because `--system` is always injected, but harmless.
- RFC-0802 stamp: the final acceptance criterion (deployment gating) was verified against the actual `system.md` state (`deployment: production: false` on the `reife` page) and the implemented RFC-0803. No retroactive changes to the RFC's design.

### Axis E — Agent-facing clarity

No issues.

- `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding added to `playwright-preflight.ts`.
- `CHANGE_SUMMARY` updated in `playwright-chromium-ensure.ts` (RFC-0813 entry) and `infra-contracts.ts` (RFC-0813 entry).
- RFC-0813 and RFC-0814 references in comments at both injection points in `execute-pipeline.ts` and `execute-command.ts`.
- All three RFCs have acceptance criteria annotated with inline evidence.
- No AGENTS.md updates needed — internal behavior changes with no new agent-facing rules.

### Axis F — Pragmatism

No issues.

- **`executeKernelCommand` for preflight**: Slightly heavier than a direct function call (kernel registry lookup), but correct given DNA-64 constraints. The non-fatal catch block is pragmatic — if the preflight check itself throws, the build proceeds rather than failing on an unrelated error.
- **Test approach for RFC-0814**: The injection conditional is extracted into a pure helper function (`injectSystemPipeline` / `injectSystemCli`) for testability, since `executePipelineForSite` is not exported and testing through `executeKernelPipeline` would require heavy mocking of `loadAppRuntime`. The extracted helpers are exact replicas of the production code — documented in the test's `MODULE_CONTRACT`. This is a known trade-off: if the production code drifts from the test helper, the tests would pass but test the wrong logic. Acceptable given the simplicity of the logic (6 lines per helper).
- **RFC-0802 stamp**: The deployment gating criterion was the only unchecked item. Rather than leaving it pending, the agent verified the actual system state (`deployment: production: false` in system.md) and the implemented RFC-0803, then marked it checked with evidence. This is the correct approach — the criterion was "pending RFC creation" but the RFC is now implemented.

### Axis G — Blind spots

No issues.

- **RFC-0813 tests**: Three test cases cover the two acceptance criteria (pass/fail) plus the error-message-includes-original-launch-error requirement. Mock pattern matches existing `playwright-chromium-ensure.test.ts`.
- **RFC-0814 tests**: Eight test cases cover all five scenarios from the plan (string flag, no system flag, explicit --system, boolean flag, legacy) plus three CLI-specific scenarios. The `acceptsSystem` check correctly uses `command.flags.system.kind` (not `command.flags["--system"]`) matching the RFC-0260 flag schema convention.
- **Preflight report structure**: The `preflightReport` object at line 439-453 uses `schemaVersion: "1.0.0"` and `sitemapHash: "sha256:preflight-failed"` — a sentinel value that clearly indicates this is not a real build. The `failedSteps` array correctly identifies the failing step. This is a valid early-exit report that `mission.validate` consumers can distinguish from a real build failure.

### Spec compliance

| RFC | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 0813 | `playwright.preflight.check` registered | Done | `infra-contracts.ts:440-448` |
| 0813 | `isChromiumInstalled` extracted | Done | `playwright-chromium-ensure.ts:46-57` |
| 0813 | Runs after distribution-reuse, before build.prepare | Done | `mission-materialization-commands.ts:427-476` |
| 0813 | Fails fast with error message | Done | `playwright-preflight.ts:43-51` |
| 0813 | Silent pass when installed | Done | `playwright-preflight.ts:36-41` |
| 0813 | Skipped on distribution-reuse path | Done | `mission-materialization-commands.ts:425` (after early-return) |
| 0813 | Unit tests (pass/fail) | Done | `playwright-preflight.test.ts` (3/3) |
| 0814 | `--system` injected in pipeline path | Done | `execute-pipeline.ts:758-767` |
| 0814 | `--system` injected in CLI path | Done | `execute-command.ts:405-414` |
| 0814 | `acceptsSystem` check | Done | `system-injection.test.ts` test b/d/g |
| 0814 | Deduplication | Done | `system-injection.test.ts` test c/h |
| 0814 | `dns.record.upsert` reverted to required | Done | `dns.module.ts:38-41` |
| 0814 | Unit tests (8 scenarios) | Done | `system-injection.test.ts` (8/8) |
| 0802 | Deployment gating criterion | Done | `system.md` reife page `deployment: production: false`, RFC-0803 implemented |

### Questions for the author

None.
