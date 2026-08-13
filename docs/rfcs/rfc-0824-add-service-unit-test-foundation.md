---
id: RFC-0824
title: "Add service unit test foundation"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-13
updatedAt: 2026-08-13
enhancedAt: 2026-08-13
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-41
  - DNA-66
  - RFC-0249
  - RFC-0251
  - RFC-0823
satisfies:
  - DNA-66
versionBump: patch
commands:
  proposed: []
  added:
    - service.test.run
  changed:
    - test.signal.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "All services/*/package.json have a test script"
  - "test.signal.validate scans services/* and reports diagnostics"
  - "service.test.run executes vitest for a service"
  - "CI runs service unit tests via turbo run test"
nonGoals:
  - "Does not add integration or E2E tests for services — those are RFC-0826 and RFC-0828"
  - "Does not modify existing package-level test signal logic for packages/*"
  - "Does not add test coverage requirements — test.signal.policy.validate handles that"
batch: testing-architecture
dependsOn:
  - RFC-0823
---

# RFC-0824: Add service unit test foundation

## Context

The workshop has ~550+ unit tests in `packages/` enforced by `test.signal.validate` (RFC-0249) and `test.signal.policy.validate` (RFC-0251). However, `services/*` is completely outside the test signal radar:

- No `services/*/package.json` has a `test` script.
- `test.signal.validate` scans only `packages/` — the `classifyTier` function in `packages/werkstatt-site/src/checks/test-signal.ts` has no branch for `services/`.
- `turbo run test` (the CI test gate) only runs tests for workspaces that declare a `test` script, so services are silently skipped.

This means service logic (rate fetching, QStash delivery, Supabase writes, health endpoints) has zero automated test coverage at the unit level.

## Problem

Services contain real business logic — rate adapters, QStash signature verification, Supabase buffer writes, health endpoint responses. This logic is currently tested only manually (or not at all). The QStash `bad-signature` bug (2026-08-13) was a unit-testable issue (URL construction for signature verification) that would have been caught by a unit test in seconds.

DNA-66 (established by RFC-0823) requires a five-level testing pyramid. L1 (unit) is the foundation — without it, higher levels (L2 integration, L3 contract) have nothing to build on.

## Decision

The workshop extends L1 unit testing to `services/*`:

1. **New command `service.test.run`** runs vitest for a specific service and returns structured `--json` results. This follows the existing `services.check.run` pattern — a kernel command that wraps test execution for a specific workspace type. The structured output (`ServiceTestRunResult` with `testFiles`, `testsPassed`, `testsFailed`, `failures[]`) is consumed by pipeline gates in RFC-0829. `pnpm --filter <service> run test` works for manual invocation, but the kernel command provides the structured result type needed for programmatic pipeline integration.
2. **`classifyTier` extended** with a `services/` branch. `collectPackageTestSignals` already discovers services via `discoverWorkspacePackages` (which reads `pnpm-workspace.yaml` — `services/*` is already listed). The actual gap is that `classifyTier` in `packages/werkstatt-site/src/checks/test-signal.ts` has no `services/` branch, so services fall through to the default tier 2. The extension adds `if (signal.directory.startsWith("services/")) return 1;` before the existing branches.
3. **`test.signal.policy.validate` requires no extension.** The existing `policyDiagnosticForSignal` function already enforces owner/rationale/reviewAfter for ALL workspaces with `signal === "skipped"`, regardless of directory. Once `classifyTier` returns a tier for services, the policy validator applies automatically.
4. **All `services/*/package.json` get a `test` script** pointing to `vitest run`.
5. **Service unit tests live in `packages/werkstatt-site/src/testing/unit/services/<service-id>/`** per DNA-66 (tests in packages, not in services).

## Architectural fit

- **DNA-41 (PBT):** Service unit tests may include PBT tests for pure functions (e.g. rate calculation, signature verification).
- **DNA-66 (testing pyramid):** This RFC implements the L1 layer for services.
- **DNA-64 (engine/plugin boundary):** The `service.test.run` command is registered by the site plugin (`@warpgogol/werkstatt-site`), not the engine.
- **RFC-0249 (test signal):** Extended, not superseded. The same diagnostic structure applies.
- **turbo.json:** The existing `test` task (`dependsOn: ["^test"]`, `outputs: []`) already covers all workspaces. Adding `test` scripts to services makes them visible to `turbo run test` automatically.

## Design

### CLI surface

```sh
pnpm exec werkstatt run service.test.run --service lagebild-sync
pnpm exec werkstatt run service.test.run --service lagebild-sync --json
pnpm exec werkstatt run test.signal.validate --json
```

`service.test.run` resolves the service's test directory in `packages/werkstatt-site/src/testing/unit/services/<service-id>/` and runs vitest against it. The `--json` flag returns structured results.

### TypeScript contracts

```ts
interface ServiceTestRunInput {
  service: string;
  json?: boolean;
}

interface ServiceTestRunResult {
  command: "service.test.run";
  status: "pass" | "fail";
  service: string;
  testFiles: number;
  testsPassed: number;
  testsFailed: number;
  durationMs: number;
  failures?: {
    testName: string;
    message: string;
    file: string;
  }[];
}
```

### Test signal extension

The `classifyTier` function in `packages/werkstatt-site/src/checks/test-signal.ts` gains a branch:

```ts
function classifyTier(signal: PackageTestSignal): TestSignalTier {
  if (TIER_0_PACKAGES.has(signal.packageName)) return 0;
  if (signal.directory.startsWith("apps/")) return 3;
  if (signal.directory.startsWith("services/")) return 1;  // NEW — services with business logic are tier 1
  // ... existing branches
}
```

`collectPackageTestSignals` already discovers services — it calls `discoverWorkspacePackages(workspaceRoot)` which reads `pnpm-workspace.yaml`. The workspace file already includes `services/*`, so service `package.json` files are already scanned. No change to `collectPackageTestSignals` is needed.

`test.signal.policy.validate` also requires no change — the existing `policyDiagnosticForSignal` function enforces owner/rationale/reviewAfter for all workspaces with `signal === "skipped"`, regardless of directory. Once `classifyTier` returns tier 1 for services, the policy validator applies automatically.

### Service test script convention

Each `services/*/package.json` gets:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Each service has a local `vitest.config.ts` that points to the package-level test directory:

```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: [resolve(__dirname, "../../packages/werkstatt-site/src/testing/unit/services/<service-id>/**/*.test.ts")],
  },
});
```

This keeps each service workspace self-contained — `vitest run` from the service directory finds its tests without a `--service` flag or shared config mapping. The relative path is stable because `services/*` and `packages/*` are siblings in the monorepo.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/testing/unit/services/<service-id>/*.test.ts` | Unit test files for each service |
| `services/*/vitest.config.ts` | Per-service vitest config pointing to package-level test directory |
| `packages/werkstatt-site/src/checks/test-signal.ts` | `classifyTier` extended with `services/` branch |
| `services/*/package.json` | Gets `test` and `test:watch` scripts |
| `services/AGENTS.md` | Updated with test requirement |

### Output format

```json
{
  "command": "service.test.run",
  "status": "pass",
  "service": "lagebild-sync",
  "testFiles": 3,
  "testsPassed": 15,
  "testsFailed": 0,
  "durationMs": 1200
}
```

### Pipeline placement

`service.test.run` is a standalone kernel command — it is not wired into `build.prepare`, `build.check`, or `services.check.run`. It is invoked manually by operators/agents and by CI via `turbo run test`. The `test.signal.validate` and `test.signal.policy.validate` commands remain in their existing pipeline positions (PACKAGES_CHECK_PIPELINE).

### Failure modes

- **No test files found:** `service.test.run` exits with a warning (not an error) if the service's test directory exists but is empty. This allows incremental adoption. Note: `test.signal.validate` will classify a service with a `test` script but no test files as having a "real" signal (the script exists). The gap between "has test script" and "has actual test files" is not addressed by this RFC — it is a known limitation. Future RFCs may add a test-file-count check.
- **No test directory:** `service.test.run` exits with an error if `packages/werkstatt-site/src/testing/unit/services/<service-id>/` does not exist. Services must have at least a directory placeholder.
- **test.signal.validate:** Services without a `test` script emit `test.signal.validate` diagnostics with severity `warning` (tier 1, not tier 0). Services with a noop test script emit `error`.

## Rollout

- **Default behavior:** `test.signal.validate` starts scanning `services/*` immediately after `classifyTier` is extended. Services without test scripts get `warning` diagnostics (not errors) for a grace period of 2 weeks.
- **Grace period mechanism:** The grace period is implemented via a date-based check in `diagnosticForSignal` — services with `signal === "absent"` emit `warning` severity before the cutoff date and `error` severity after. The cutoff date (2026-08-27) is documented in `services/AGENTS.md`. After the cutoff, the date check is removed and services with absent test scripts always emit `error`.
- **After grace period:** `test.signal.validate` escalates service test signal warnings to errors. `CI_LOCAL_CHECKED_COMMANDS` already includes `test.signal.validate`.
- **New services:** `onboarding.scaffold` for services (or manual creation) includes a `test` script in `package.json` from day one.
- **turbo.json:** No changes needed — the existing `test` task covers all workspaces with a `test` script.
- **CI cost:** Services currently have zero tests. The CI time impact is proportional to the number of test files added. With one health-endpoint test per service (~8 services), the impact is negligible (~2-3 seconds total).

## Alternatives considered

- **Tests in `services/*/src/`:** Rejected by operator directive. Tests must live in packages.
- **Separate test runner for services:** Rejected. vitest is already the workshop runner (DNA-41). Using a different runner for services adds complexity without value.
- **Extend `packages-check.run` instead of new command:** Rejected. `packages-check.run` is for structural validation, not test execution. Test execution needs a dedicated command that returns test results, not diagnostics.

## Risks

- **Grace period enforcement:** The 2-week grace period relies on agent discipline to escalate warnings to errors. Mitigated by documenting the escalation date in `services/AGENTS.md`.
- **Shared vitest config complexity:** A single config handling multiple services may become complex. Mitigated by keeping the config simple (filter by service id) and splitting into per-service configs if needed.
- **Test directory mapping drift:** If a service is renamed, the test directory mapping must be updated. Mitigated by `service.naming.validate` which already enforces naming conventions.

## Acceptance criteria

- [ ] `service.test.run` command registered in `packages/werkstatt-site/src/checks/` module
- [ ] `test.signal.validate` scans `services/*/package.json` and emits diagnostics
- [ ] `test.signal.policy.validate` enforces owner/rationale/reviewAfter for services
- [ ] All `services/*/package.json` have `test` and `test:watch` scripts
- [ ] At least one unit test exists for each service (health endpoint test as minimum)
- [ ] `turbo run test` includes service tests
- [ ] `services/AGENTS.md` updated with unit test requirement
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- Implementation should start with the `service.test.run` command, then extend `test.signal.validate`, then add `test` scripts to all services.
- Each service should get at least a health endpoint unit test as a starting point.
