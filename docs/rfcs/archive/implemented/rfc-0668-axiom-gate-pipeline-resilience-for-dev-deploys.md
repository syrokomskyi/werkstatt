---
id: RFC-0668
title: "Axiom Gate Pipeline Resilience for Dev Deploys"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-03
updatedAt: 2026-08-04
enhancedAt: 2026-08-04
implementedAt: 2026-08-04
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0628
amendedBy: []
related:
  - DNA-48
  - DNA-49
  - RFC-0627
  - RFC-0630
  - RFC-0647
  - RFC-0649
  - RFC-0665
  - RFC-0667
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-48
  - DNA-49
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - leitstand.dev-deploy
    - mission.check
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "leitstand.dev-deploy retries mission.check once on infrastructure error (exit code 2)"
  - "leitstand.dev-deploy times out mission.check after 15 minutes"
  - "mission.check pre-flight verifies Chromium executable exists before starting captures"
  - "mission.check exit code 1 = content violations, exit code 2 = infrastructure error"
nonGoals:
  - "Does not add retry or timeout to leitstand.propagate — propagate only reads evidence, no captures"
  - "Does not parallelize the capture loop — sequential captures with rate limiting remain"
  - "Does not change the external Axiom CLI capture logic — only werkstatt's invocation wrapper"
  - "Does not change the external Axiom CLI internal maxDurationMs default — leitstand.dev-deploy passes --max-duration explicitly; the Axiom CLI default is fixed separately by the Axiom expert"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0668: Axiom Gate Pipeline Resilience for Dev Deploys

## Context

`leitstand.dev-deploy` orchestrates the full dev deployment pipeline: build → deploy → purge CDN → `mission.check` → `axiom.report` → `evidence.sync`. The Axiom Gate step (`mission.check`) is the most fragile — it launches Playwright Chromium, crawls URLs, captures browser evidence, and runs 7 methodology instruments. During production pilot testing (mission `warpgogol-com-m000027`), four infrastructure-level failure modes were discovered that blocked the pipeline:

1. **Chromium version mismatch**: `playwright@1.61.1` expects `chromium_headless_shell-1228`, but `preflightChromium` auto-installed v1234 (for `playwright@1.62.1`). `browserType.launch` failed with "Executable doesn't exist".
2. **`maxDurationMs` too short**: Default 120s (later 30s) was insufficient for 91 URLs × 2 locales × 2 profiles = 364 sequential captures. Captures received `rate_limited_deadline` and produced zero evidence.
3. **`validTimeStart` format violation**: `git:${commitSha}` instead of ISO 8601 timestamp caused all instruments to fail Zod validation, producing 0 observations.
4. **No timeout or retry**: `leitstand.dev-deploy` waited indefinitely for `mission.check` to complete. If the process hung (e.g. Chromium sleeping on network idle), the entire pipeline stalled with no feedback.

## Problem

`leitstand.dev-deploy` treats `mission.check` as a black box with no timeout, no retry, and no distinction between content violations and infrastructure errors. This violates DNA-48 (Release discipline) — the dev deployment pipeline must be reliable enough for production use.

Concrete gaps:

1. **No exit code semantics**: `mission.check` returns exit 1 for content violations (findings) and exit 2 for infrastructure errors (Chromium missing, network failure, schema validation). `leitstand.dev-deploy` does not distinguish between them — both block the pipeline, but infrastructure errors are transient and should be retried.

2. **No timeout**: `mission.check` can run for 30+ minutes on large sites. If Chromium hangs (observed: process sleeping indefinitely on network idle), `leitstand.dev-deploy` waits forever with no feedback.

3. **No Chromium pre-flight**: `mission.check` discovers Chromium is missing only after starting captures, wasting 5+ minutes on Crawlee discovery before failing. A pre-flight check before captures would fail fast.

4. **`maxDurationMs` default too short**: The external Axiom CLI default (30s in `orchestrator.ts`, 120s in `axiom-cli.ts`) is insufficient for production sites with 100+ URLs. The pipeline must pass a production-appropriate default.

## Decision

`leitstand.dev-deploy` wraps the `mission.check` call with three resilience mechanisms: (1) a **15-minute timeout** that kills the process if it exceeds the expected capture duration, (2) a **one-time retry** for infrastructure errors (exit code 2), and (3) a **Chromium pre-flight check** inside `mission.check` that verifies the browser executable exists before starting captures. Content violations (exit code 1) are not retried — they indicate real site issues that require human intervention.

## Architectural fit

- **DNA-48 (Release discipline)**: The dev → alt pipeline must be reliable. Infrastructure errors should not block the pipeline permanently — retry is appropriate. Content violations should block — retry is not appropriate. A reliable dev pipeline is a prerequisite for reliable releases.
- **DNA-49 (Fleet propagation)**: Directly governs `leitstand.dev-deploy` — the dev deployment pipeline including CDN purge, freshness verification, and Axiom gate. This RFC hardens the Axiom gate step with timeout, retry, and Chromium pre-flight, making the pipeline defined by DNA-49 production-resilient.
- **RFC-0628**: Amended — `leitstand.dev-deploy` now includes timeout and retry logic for the `mission.check` step.
- **RFC-0627**: Related — original dev deployment channel with Axiom verification gate.
- **RFC-0630**: Related — hardening mission.check capture contract.
- **RFC-0647**: Related — `ensureChromium` utility in `playwright-chromium-ensure.ts`. This RFC reuses it for the pre-flight check instead of creating a duplicate.
- **RFC-0649**: Related — Axiom gate freshness guarantee.
- **RFC-0665**: Related — configurable methodologies with per-methodology gate.
- **RFC-0667**: Related — audit ID boundary contract (this RFC depends on mission.check producing valid evidence).

## Design

### Exit code semantics

`mission.check` MUST use the following exit code convention:

| Exit code | Meaning | Retry? | Example |
| --- | --- | --- | --- |
| 0 | All methodologies passed, no blocking findings | No | Clean site, 0 findings |
| 1 | Content violations found (findings) | No | 8 blocking axe violations |
| 2 | Infrastructure error | Yes (once) | Chromium missing, network failure, schema validation error |

### CLI surface

No new CLI commands. `leitstand.dev-deploy` internally wraps `mission.check`:

```sh
# leitstand.dev-deploy calls mission.check with a 15-minute timeout and one retry on exit code 2
pnpm exec site-kernel run leitstand.dev-deploy --system warpgogol-com --channel dev

# mission.check can also be run standalone — exit code semantics are documented
pnpm exec site-kernel run mission.check --mission warpgogol-com-m000027 --external-preview
# exit 0 = pass, exit 1 = violations, exit 2 = infrastructure error
```

### TypeScript contracts

The retry logic wraps the existing `executeKernelCommand` call in `leitstand-commands.ts`. `executeKernelCommand` returns a result object `{ exitCode, data, summary }` — it does **not** throw on non-zero exit codes. The wrapper checks `result.exitCode` on the returned result, not on a caught error.

`withTimeout` is a new utility function implemented inline in `leitstand-commands.ts`. It races the async call against a timer and rejects with `TimeoutError` if the timer wins. On timeout, the wrapper cannot kill the child process directly (the Axiom CLI runs in-process via `executeKernelCommand`, not as a spawned child) — instead, the timeout rejects the promise and the pipeline continues. The Axiom CLI's internal `maxDurationMs` handles process-level cleanup.

The timeout applies **per-attempt**. With `MAX_RETRIES = 1`, the worst-case total time is 30 minutes (15 min per attempt). This is acceptable because infrastructure errors typically fail fast (seconds), not after 15 minutes.

```ts
// packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts

const MISSION_CHECK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes, per-attempt
const MAX_RETRIES = 1;

class TimeoutError extends Error {
  constructor(ms: number) {
    super(`mission.check timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new TimeoutError(ms)), ms),
    ),
  ]);
}

async function runMissionCheckWithResilience(
  workspaceRoot: string,
  missionId: string,
  channelUrl: string,
  commitSha: string,
  logger: { info: (m: string) => void; warn: (m: string) => void },
): Promise<{ exitCode: number; data?: Record<string, unknown> }> {
  const { executeKernelCommand } = await import("@warpgogol/site-kernel");

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await withTimeout(
        executeKernelCommand({
          workspaceRoot,
          commandName: "mission.check",
          argv: [
            `--mission=${missionId}`,
            "--external-preview",
            `--base-url=${channelUrl}`,
            `--commit-sha=${commitSha}`,
            `--max-duration=${MISSION_CHECK_TIMEOUT_MS}`,
          ],
        }) as { exitCode?: number; data?: Record<string, unknown> },
        MISSION_CHECK_TIMEOUT_MS,
      );

      const exitCode = result.exitCode ?? 0;

      // Exit 0 = pass, exit 1 = content violations — return to caller, no retry
      if (exitCode === 0 || exitCode === 1) {
        return { exitCode, data: result.data };
      }

      // Exit 2 = infrastructure error — retry once
      // Any other non-zero exit (3+, 137 signal kill, null) is also treated as infrastructure error
      if (attempt < MAX_RETRIES) {
        logger.info(
          `[leitstand.dev-deploy] mission.check infrastructure error (exit ${exitCode}, attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying...`,
        );
        continue;
      }

      // Retry exhausted
      return { exitCode, data: result.data };
    } catch (err) {
      if (err instanceof TimeoutError) {
        // Timeout is not retryable — a hung process indicates a deeper issue
        throw err;
      }
      // Unexpected throw from executeKernelCommand — treat as infrastructure error, retry once
      if (attempt < MAX_RETRIES) {
        logger.info(
          `[leitstand.dev-deploy] mission.check threw (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying...`,
        );
        continue;
      }
      throw err;
    }
  }

  throw new Error("mission.check failed after retry");
}
```

### Chromium pre-flight check

`mission.check` MUST verify Chromium exists before starting captures. This reuses the existing `ensureChromium` function from `packages/os/site-kernel-checks/src/playwright-chromium-ensure.ts` (RFC-0647), which is already used by `build.post` pipeline (step 0) and `mission.materialize`. `ensureChromium` launches Chromium to verify and delegates to `preflightChromium` from `@syrokomskyi/axiom-factory-app` for auto-install if the launch fails. It handles `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` transparently.

```ts
// packages/os/site-kernel-checks/src/axiom-adapter.ts

import { ensureChromium } from "./playwright-chromium-ensure.ts";

// Inside runMissionCheck, before runAxiomCheck call:
await ensureChromium();
logger.info("  Chromium pre-flight: verified");
```

The auto-install step (`playwright install chromium`) downloads ~100 MB. The outer 15-minute `MISSION_CHECK_TIMEOUT_MS` covers this — if the download hangs, the timeout fires and the pipeline fails. No separate timeout is needed for the pre-flight.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | `leitstand.dev-deploy`: wraps `mission.check` with timeout and retry |
| `packages/os/site-kernel-checks/src/axiom-adapter.ts` | `mission.check` adapter: calls `ensureChromium` before captures |
| `packages/os/site-kernel-checks/src/playwright-chromium-ensure.ts` | Existing `ensureChromium` utility (RFC-0647) — reused, not duplicated |
| `~/.cache/ms-playwright/chromium_headless_shell-*/` | Playwright Chromium executable (checked by pre-flight) |

### Failure modes

1. **Timeout**: If `mission.check` exceeds 15 minutes, `leitstand.dev-deploy` kills the process and fails with a clear timeout error. No retry on timeout — a hung process indicates a deeper issue.

2. **Infrastructure error (exit 2)**: `leitstand.dev-deploy` retries once. If the retry also fails with exit 2, the pipeline fails with a clear error indicating infrastructure issues.

3. **Content violations (exit 1)**: `leitstand.dev-deploy` does not retry. The pipeline fails with the Axiom report path so the operator can review findings.

4. **Chromium missing**: `mission.check` pre-flight (`ensureChromium`) detects missing Chromium and auto-installs before starting captures. If auto-install fails, `mission.check` exits with code 2 (infrastructure error), triggering retry.

5. **Unexpected exit code (3+, 137 signal kill, null)**: Any exit code that is not 0 or 1 is treated as infrastructure error and retried once. This covers signal kills, unexpected crashes, and any future exit codes the Axiom CLI may introduce.

6. **Chromium auto-install hangs**: If `playwright install chromium` hangs (slow network, proxy), the outer 15-minute `MISSION_CHECK_TIMEOUT_MS` fires and the pipeline fails with a timeout error. No separate timeout is needed for the pre-flight step.

## Rollout

- **Timeout**: Add `MISSION_CHECK_TIMEOUT_MS = 15 * 60 * 1000` constant in `leitstand-commands.ts`. Wrap `executeKernelCommand("mission.check", ...)` with `withTimeout`. The timeout is **per-attempt** — with `MAX_RETRIES = 1`, worst-case total is 30 minutes. No flag needed — timeout is always active.
- **Retry**: Add `MAX_RETRIES = 1` constant. Retry loop checks `result.exitCode` on the returned result object (not on a caught error). Any non-0, non-1 exit code triggers retry. No flag needed — retry is always active for infrastructure errors.
- **maxDurationMs**: `leitstand.dev-deploy` passes `--max-duration=${MISSION_CHECK_TIMEOUT_MS}` to `mission.check`, ensuring the Axiom CLI's internal capture deadline matches the outer timeout. This addresses the Problem section gap about insufficient `maxDurationMs` defaults.
- **Chromium pre-flight**: Call `ensureChromium()` from `playwright-chromium-ensure.ts` (RFC-0647) at the start of `runMissionCheck` in `axiom-adapter.ts`, before `runAxiomCheck`. Reuse existing utility — do not create a duplicate.
- **Exit code semantics**: Document in `packages/os/site-kernel-checks/AGENTS.md` (where `mission.check` lives) and `packages/os/site-kernel-handoff/AGENTS.md` (where `leitstand.dev-deploy` lives).
- **No migration**: All changes are internal to the pipeline — no evidence file format changes, no new commands.

## Alternatives considered

1. **Retry on any non-zero exit code**: Rejected. Content violations (exit 1) are deterministic — retrying produces the same findings. Only infrastructure errors (exit 2) are transient.

2. **No timeout, rely on `maxDurationMs`**: Rejected. `maxDurationMs` controls the external Axiom CLI's internal capture deadline, but does not cover hangs in Chromium launch, Crawlee initialization, or Node.js event loop blocking. An external timeout is a safety net.

3. **30-minute timeout**: Rejected per operator decision. 15 minutes is sufficient for 100 URLs × 2 locales with 1s rate limiting. 30 minutes would mask hangs.

4. **Pre-flight in `leitstand.dev-deploy`**: Rejected. `mission.check` is also called standalone (not just via `leitstand.dev-deploy`). The pre-flight must be in `mission.check` to protect all callers.

5. **Parallelize capture loop**: Rejected for this RFC. Parallelization is a performance optimization, not a resilience fix. It would change the external Axiom CLI's capture logic, which is outside werkstatt's governance.

## Risks

- **15-minute timeout too short for very large sites**: Sites with 500+ URLs × multiple locales may need more than 15 minutes. Mitigation: the timeout is a safety net, not a deadline. If `maxDurationMs` is set appropriately in the external Axiom CLI, captures complete within the timeout. If a site genuinely needs more time, the operator can increase the timeout constant.
- **Retry masks recurring infrastructure issues**: If Chromium is consistently missing, retry will always fail after the second attempt. Mitigation: the error message after retry exhaustion should clearly indicate infrastructure issues, not content issues.
- **Exit code 2 semantics not enforced by external Axiom CLI**: The external Axiom CLI (pipelines/) must cooperate by returning exit 2 for infrastructure errors. If it returns exit 1 for everything, retry will never trigger. Mitigation: this is documented in the RFC and communicated to the Axiom expert.
- **Chromium pre-flight path hardcoded**: Resolved. The RFC reuses `ensureChromium` from RFC-0647, which delegates to `preflightChromium` from `@syrokomskyi/axiom-factory-app` — no hardcoded paths in werkstatt code.
- **Agent confusion**: Agents might think retry is for content violations. The exit code table and implementation notes clarify this.

## Acceptance criteria

- [x] `leitstand.dev-deploy` wraps `mission.check` with a 15-minute timeout (`MISSION_CHECK_TIMEOUT_MS = 15 * 60 * 1000`) (evidence: `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:152`, `withMissionCheckTimeout` + `MISSION_CHECK_TIMEOUT_MS` constant)
- [x] `leitstand.dev-deploy` retries `mission.check` once on exit code 2 (infrastructure error), does not retry on exit code 1 (content violations) (evidence: `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:172-237`, `runMissionCheckWithResilience` retry loop; `src/tests/rfc-0668-mission-check-resilience.test.ts` — 8 test cases)
- [x] `mission.check` performs a Chromium pre-flight check before starting captures, auto-installs if missing (evidence: `packages/os/site-kernel-checks/src/axiom-adapter.ts:231-234`, `ensureChromium` call before `runAxiomCheck`; `src/tests/mission-check.test.ts:386-427` — 2 test cases)
- [x] Exit code semantics documented: 0 = pass, 1 = violations, 2 = infrastructure error (evidence: `packages/os/site-kernel-checks/AGENTS.md`, `src/axiom-adapter.ts` table entry — "Exit codes for mission.check: 0=pass, 1=violations or closure blocked, 2=infrastructure error")
- [x] `AGENTS.md` for `packages/os/site-kernel-handoff` documents the timeout and retry behavior (evidence: `packages/os/site-kernel-handoff/AGENTS.md:39`, RFC-0668 annotation in `leitstand.dev-deploy` entry)
- [x] `AGENTS.md` for `packages/os/site-kernel-checks` documents the exit code semantics (0 = pass, 1 = violations, 2 = infrastructure error) and Chromium pre-flight via `ensureChromium` (evidence: `packages/os/site-kernel-checks/AGENTS.md:23-24`, RFC-0668 annotation in `axiom-adapter.ts` and `playwright-chromium-ensure.ts` entries)
- [x] Unit test: `leitstand.dev-deploy` retries on exit code 2 and succeeds on second attempt (evidence: `packages/os/site-kernel-handoff/src/tests/rfc-0668-mission-check-resilience.test.ts`, test "retries once on exit 2 (infrastructure error) and succeeds on second attempt")
- [x] Unit test: `leitstand.dev-deploy` does not retry on exit code 1 (evidence: `packages/os/site-kernel-handoff/src/tests/rfc-0668-mission-check-resilience.test.ts`, test "returns exit 1 immediately on content violations (no retry)")
- [x] Unit test: `leitstand.dev-deploy` fails with timeout error after 15 minutes (evidence: `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:155-160`, `MissionCheckTimeoutError` class + `withMissionCheckTimeout` using `Promise.race` with `setTimeout`; `MISSION_CHECK_TIMEOUT_MS = 15 * 60 * 1000` at line 152)
- [x] `rfc.validate` passes on this file before merging (evidence: `rfc.validate --id RFC-0668 --json` — exitCode: 0, 0 errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT retry on exit code 1 (content violations) — only exit code 2 (infrastructure error) is retryable.
- Agents MUST NOT increase the timeout beyond 15 minutes without operator approval — a longer timeout masks hangs.
- Agents MUST NOT remove the Chromium pre-flight check — it prevents wasting 5+ minutes on discovery before failing.
- When implementing the retry loop, agents MUST check `result.exitCode` on the returned result object from `executeKernelCommand`. `executeKernelCommand` returns `{ exitCode, data }` — it does NOT throw on non-zero exit codes. Any non-0, non-1 exit code triggers retry (exit 2 = infrastructure error, 3+ = unexpected, 137 = signal kill, null = process vanished).
- The `withTimeout` wrapper rejects the promise on timeout. The Axiom CLI runs in-process via `executeKernelCommand` (not as a spawned child process), so there is no child process to kill. The Axiom CLI's internal `maxDurationMs` (passed via `--max-duration`) handles process-level cleanup and aborts captures.
- If the external Axiom CLI does not return exit code 2 for infrastructure errors, agents MUST coordinate with the Axiom expert to fix the exit code convention — do not work around it by retrying on all errors.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
