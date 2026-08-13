---
reviewId: REVIEW-CODE-2026-08-13-01
date: 2026-08-13
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: fec5315e...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/service-test-run.ts
  - packages/werkstatt-site/src/checks/command-tables/20-ecosystem.ts
  - packages/werkstatt-site/src/testing/unit/services/cf-analytics-poller/pusher-factory.test.ts
  - packages/werkstatt-site/src/testing/unit/services/check-runner/config.test.ts
  - packages/werkstatt-site/src/testing/unit/services/fleet-probe-runner/config.test.ts
  - packages/werkstatt-site/src/testing/unit/services/lagebild-sync/health-endpoint.test.ts
  - packages/werkstatt-site/src/testing/unit/services/matomo-proxy/health-endpoint.test.ts
  - packages/werkstatt-site/src/testing/unit/services/maturity-score/health-endpoint.test.ts
  - packages/werkstatt-site/src/testing/unit/services/observability-stack/validate-command.test.ts
  - packages/werkstatt-site/src/testing/unit/services/rate-fetcher/health-endpoint.test.ts
  - packages/werkstatt-site/src/testing/unit/services/telegram-alert-bridge/health-endpoint.test.ts
  - services/AGENTS.md
  - services/*/vitest.config.ts
  - services/*/package.json
  - docs/rfcs/rfc-0824-add-service-unit-test-foundation.md
---

# Code Review: fec5315e...HEAD (RFC-0824 service unit test foundation)

### Verdict: Needs revision

The implementation is architecturally sound and all 9 service tests pass. However, there is a duplicated code block (failure extraction logic appears twice in `service-test-run.ts`), the `serviceDir` variable is unused, and the inner catch-block error swallowing is imprecise. These are minor structural issues but should be fixed before stamping.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt-site run build:check` exits 0.

### Axis A — Structural correctness

- **Duplicated Code** — The failure-extraction loop (iterate `parsed.testResults`, iterate `assertionResults`, push failures) appears twice in `service-test-run.ts`: once at lines 164–175 and again at lines 200–211. Extract into a helper function `extractFailures(parsed: VitestJsonResult): ServiceTestRunResult["failures"]`.
- **Dead code** — `serviceDir` is declared at line 125 and used as `cwd` at line 143, but `pnpm --filter` already resolves the service directory from the workspace root. The `cwd: serviceDir` is redundant — `pnpm --filter <service>` works from any directory in the workspace. Consider removing `serviceDir` and using `context.workspaceRoot` as cwd.
- **Error handling** — The inner catch block at line 148–153 swallows errors based on a fragile heuristic (`!error.stdout && !error.message?.includes("exit")`). If `pnpm exec vitest` fails for a non-exit reason (e.g., `pnpm` not found, permission error), the error is swallowed and the code falls through to the JSON file read, which will then throw a confusing "file not found" error. The condition should be more precise: check for `error.code === 1` (vitest exit code for test failures) or simply always attempt to read the JSON file regardless of the exec error.

### Axis B — DNA alignment

- **DNA-66 (testing pyramid)** — Aligned. L1 unit tests live in `packages/werkstatt-site/src/testing/unit/services/<service-id>/`, not in `services/*`. Tests are versioned with the platform.
- **DNA-64 (engine/plugin boundary)** — Aligned. `service.test.run` is registered by the site plugin, not the engine.

### Axis C — Ecosystem fit

- **Package boundaries** — Aligned. Tests import from `@service/*` (vitest alias to `services/<id>/src/`), not from other services or apps.
- **Command lifecycle** — `service.test.run` is registered in `command-tables/20-ecosystem.ts` with correct flags, reads, and execute handler. `test.signal.validate` and `test.signal.policy.validate` reads updated to include `services/*/package.json`.
- **AGENTS.md updates** — `services/AGENTS.md` updated with "Unit tests (RFC-0824 / DNA-66)" section documenting all requirements.

### Axis D — Forward-only compliance

No issues. No compatibility shims or legacy paths.

### Axis E — Agent-facing clarity

- **Compass scaffolding** — `service-test-run.ts` has `MODULE_CONTRACT` and `CHANGE_SUMMARY`. Test files are small and self-explanatory.
- **No ungrounded assertions** — All test imports reference real exports (`createPollerPusher`, `loadRunnerConfig`, `loadConfig`, worker `fetch` handlers).

### Axis F — Pragmatism

- **Minimal command surface** — `service.test.run` earns its existence: it provides structured JSON results that `pnpm --filter <service> run test` does not.
- **Existing patterns** — Follows the existing `services.check.run` pattern of wrapping execution in a kernel command.
- **Scope discipline** — Diff touches only service test infrastructure, no scope creep.

### Axis G — Blind spots

- **Edge cases** — Empty test directory is handled (returns pass with 0 tests). Missing test directory is handled (returns fail with error summary). Temp file cleanup is in a `finally` block.
- **Concurrent execution** — Temp file uses `Date.now()` in the filename, which could collide if two invocations happen in the same millisecond. Consider adding a random suffix or using `pid`.

### Spec compliance

| Requirement from RFC-0824 | Status | Evidence |
| --- | --- | --- |
| `service.test.run` command registered | Done | command-tables/20-ecosystem.ts:274 |
| `classifyTier` extended with services/ branch | Done | test-signal.ts |
| `test.signal.policy.validate` enforces for services | Done | 0 errors on all 9 services |
| All services have test scripts | Done | services/*/package.json |
| At least one unit test per service | Done | 9 test files, all pass |
| `turbo run test` includes service tests | Done | All 9 services pass vitest run |
| `services/AGENTS.md` updated | Done | "Unit tests (RFC-0824 / DNA-66)" section |
| `rfc.validate` passes | Done | All 1 RFC(s) passed validation |

### Questions for the author

1. Should the duplicated failure-extraction logic in `service-test-run.ts` be extracted into a helper before stamping, or is it acceptable for the initial implementation?
2. The `serviceDir` variable is used as `cwd` for `pnpm --filter`, but `pnpm --filter` resolves from the workspace root — is the `cwd: serviceDir` intentional or redundant?
3. The temp file name uses `Date.now()` — is concurrent invocation a realistic scenario for `service.test.run`?
