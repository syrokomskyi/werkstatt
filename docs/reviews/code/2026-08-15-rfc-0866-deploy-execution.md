# Code Review: RFC-0866 Deploy Execution Implementation

**Date:** 2026-08-15
**Reviewer:** fo-review (automated)
**Diff range:** `72cec9c5..HEAD` (6 commits)
**Files changed:** 9 (1,444 insertions, 58 deletions)

## Mechanical floor

- **Type check:** PASS (only pre-existing `axiom-cli.ts` ViewportProfile error, not in diff)
- **Tests:** PASS — 17/17 leitstand tests pass (10 existing + 7 new)
- **RFC validate:** Not run (RFC already accepted)

## Axis A — Structural correctness

### A-1: `as unknown as KernelCommandResult<T>` type bypass (FAIL)

**Severity:** medium
**Files:** `leitstand-commands.ts` (12 occurrences), `certify.ts` (4 occurrences)

Every command return uses `as unknown as KernelCommandResult<T>`. The returned object literal doesn't match `KernelCommandResult<T>` — it's missing required fields or has mismatched types. This is a type-safety escape hatch that hides structural mismatches. If the interface changes, TypeScript won't catch the breakage.

**Recommendation:** Either make the return type explicit (return a properly typed object), or define a helper function that constructs a valid `KernelCommandResult<T>` from the data/summary/exitCode/diagnostics fields.

### A-2: `fs.writeFile` instead of `writeFileIfChanged` in `certify.ts` (FAIL)

**Severity:** low
**File:** `@/packages/werkstatt/src/leitstand/certify.ts:309`

```typescript
await fs.writeFile(outputPath, JSON.stringify(gateDecision, null, 2), "utf8");
```

AGENTS.md (packages) mandates `writeFileIfChanged` for generated file writes to avoid git churn. The `GateDecisionV1` JSON is a generated artifact written to `systems-cache/`.

**Recommendation:** Import and use `writeFileIfChanged` from `@warpgogol/werkstatt` (re-exported from `@warpgogol/forge/utils`).

### A-3: Bare `catch` blocks without error context (PASS with note)

**Severity:** low
**File:** `@/packages/werkstatt/src/leitstand/deploy-execution.ts:434`

The outer `catch` at line 434 doesn't capture the error variable (`catch {` instead of `catch (err) {`). The error is silently discarded — the `failingPhase` is set but the error message is not included in the returned result. The `DeployExecutionResult` has no `errorMessage` field.

**Note:** This is consistent with the existing codebase pattern for non-fatal catches (lines 233, 380, 398), but the outer catch is the **fatal** path — the error message should be preserved.

### A-4: `healthInput` has empty strings for required fields (PASS with note)

**Severity:** low
**File:** `@/packages/werkstatt/src/leitstand/deploy-execution.ts:136-143`

```typescript
const healthInput: HealthInput = {
  systemId,
  deploymentUrl,
  channel,
  releaseId: "",
  expectedBehaviorSnapshotHash: "",
  workspaceRoot: "",
};
```

`releaseId`, `expectedBehaviorSnapshotHash`, and `workspaceRoot` are passed as empty strings. The `HealthInput` interface requires these fields, but the values are not populated from `ctx`. The `null` adapter ignores them, but the `cloudflare-workers` adapter may need them.

**Note:** This may be intentional during the restore phase — the old code may have had the same pattern. But it should be tracked as a follow-up.

### A-5: `propagateInput.expectedBehaviorSnapshotHash` is empty string (PASS with note)

**Severity:** low
**File:** `@/packages/werkstatt/src/leitstand/deploy-execution.ts:249`

Same pattern as A-4 — `expectedBehaviorSnapshotHash: ""` is passed to `adapter.propagate()`. The adapter may need this for verification.

### A-6: No dead code or unused exports (PASS)

All exports in `index.ts` have consumers. No unreachable branches detected.

### A-7: Fowler code smells — Duplicated Code (FAIL)

**Severity:** medium
**Files:** `leitstand-commands.ts:795-825`, `leitstand-commands.ts:957-985`, `leitstand-commands.ts:1119-1147`

The three deploy command handlers (`dev-deploy`, `propagate`, `promote`) have near-identical blocks for:
1. Reading system config + checking `deployment` exists
2. Resolving adapter + channel config + secretsFilePath
3. Dynamic import of `executeDeployPhases`
4. Constructing `DeployExecutionContext`
5. Mapping `deployResult` to command-specific return type

This is **Shotgun Surgery** — any change to the context construction or adapter resolution must be applied in 3 places. Consider extracting a helper function `prepareDeployContext(input, context, channel)`.

## Axis B — DNA alignment

### B-1: DNA-49 (Fleet propagation) (PASS)

The Leitstand deployment pipeline is restored. `dev-deploy`, `propagate`, and `promote` execute real deploys through the `DeploymentAdapter` interface.

### B-2: DNA-73 (Sequential deployment pipeline) (PASS)

Dev → alt → main sequencing is enforced via separate gate decisions per channel. `propagate` requires `gate: "propagate-alt"`, `promote` requires `gate: "promote-main"` + `--main-verification-decision`.

### B-3: DNA-59 (Evidence preservation) (PASS)

Evidence sync to R2 is restored as a best-effort phase (phase 10) in `executeDeployPhases`. `--skip-evidence-sync` flag bypasses it.

### B-4: DNA-52 (Artifact store immutability) (PASS)

`GateDecisionV1` JSON is written to `systems-cache/{id}/gate-decisions/` — outside the release artifact store.

## Axis C — Ecosystem fit

### C-1: Package boundaries (PASS)

All new code is in `packages/werkstatt/src/leitstand/`. No imports from `apps/*` or `services/*`. No stack plugin imports (DNA-64).

### C-2: Node-only imports not re-exported from barrel (PASS)

`deploy-execution.ts` imports `node:fs/promises`, `node:path`, `node:child_process` but these are not re-exported from `index.ts`.

### C-3: `writeFileIfChanged` rule (FAIL)

Same as A-2. `certify.ts:309` uses `fs.writeFile` instead of `writeFileIfChanged`.

### C-4: Subpath exports (PASS)

`deploy-execution.ts` imports from `@warpgogol/werkstatt/fingerprint/semantic` and `@warpgogol/werkstatt/schemas` — both are declared subpath exports in `package.json`.

## Axis D — RFC contract alignment

### D-1: RFC-0866 acceptance criteria — gate decision conventional path (FAIL)

**Severity:** medium
**RFC:** `@/docs/rfcs/rfc-0866-restore-deploy-execution-through-certification-pipeline.md:175,431`

The RFC states:
> Deploy commands resolve the gate decision at `systems-cache/{systemId}/gate-decisions/{releaseId}-{gate}.json` by default. `--gate-decision <path>` overrides the conventional path for non-standard workflows.

**Implementation:** `--gate-decision` is still `required: true` in the module registration and the handler throws if it's missing. There is no conventional-path fallback. This means the operator must always pass `--gate-decision` explicitly, even though `leitstand.certify` writes to a predictable path.

**Acceptance criterion:** "Deploy commands resolve gate decision at conventional path by default, `--gate-decision` overrides" — NOT MET.

### D-2: RFC-0866 acceptance criteria — `leitstand.certify` reads dev deployment URL from effect records (FAIL)

**Severity:** medium
**RFC:** `@/docs/rfcs/rfc-0866-restore-deploy-execution-through-certification-pipeline.md:433-444`

The RFC states:
> `leitstand.certify` reads dev deployment URL from `systems-cache/{systemId}/deployment-operations/` effect records. If no dev effect record exists (first deploy), certify requires `--base-url` flag and logs a warning.

**Implementation:** `certify.ts` does not read effect records or accept `--base-url`. The producer handler is a stub that returns synthetic evidence without calling `mission.check` against any URL.

**Acceptance criterion:** NOT MET.

### D-3: RFC-0866 acceptance criteria — `leitstand.certify` works without open mission (PASS with note)

The handler always registers `astro-mission-check` producer and always produces evidence. It doesn't check for an open mission — the producer handler is a stub that returns pass regardless. The RFC says it should skip the producer and return `status: "incomplete"` when no mission exists.

**Note:** The stub handler means the certify command is not fully functional — it produces `GateDecisionV1` JSON but the evidence is synthetic. This is acceptable as a first implementation step but should be tracked.

### D-4: RFC-0866 — `failingPhase` in effect record metadata (PASS)

The `DeployExecutionResult` includes `failingPhase` and it's propagated to all command result interfaces.

### D-5: RFC-0866 — 13 phases implemented (PASS)

All 13 phases are present in `executeDeployPhases`: build, wrangler deploy, build-identity, cache purge, freshness, health, mission.check (dev), Axiom evidence gate (alt), main verification (main, no-op), evidence sync, bordbuch, system-state, effect record update.

## Axis E — Forward-only discipline

### E-1: No legacy state labels reintroduced (PASS)

The code uses the new `DeploymentOperationState` values (`authorized`, `deploying`, `deployed`, `failed`). No legacy labels (`published`, `dev-deployed`, etc.) in the new code.

### E-2: `determineNextStep` uses new states (PASS)

`determineNextStep` handles `dev-deployed`, `alt-deployed`, `main-deployed`, `failed` — these are pipeline states derived from effect records, not legacy release manifest fields.

## Axis F — Agent clarity

### F-1: `CHANGE_SUMMARY` entries (PASS)

All new and modified files have `CHANGE_SUMMARY` blocks with RFC-0866 entries.

### F-2: `MODULE_CONTRACT` blocks (PASS)

`certify.ts` and `deploy-execution.ts` have proper `MODULE_CONTRACT` blocks with purpose, non-goals.

### F-3: Error messages are actionable (PASS)

Error messages include the command name, flag name, and expected format (e.g., `"sha256:... format"`).

## Axis G — Test coverage

### G-1: New tests cover flag validation (PASS)

`leitstand-0866-certify.test.ts` tests all 4 required flags.
`leitstand-0866-deploy-execution.test.ts` tests 3 channels.

### G-2: No test for conventional path resolution (PASS with note)

Since the conventional path resolution is not implemented (D-1), there's no test for it.

### G-3: No test for failure paths (PASS with note)

The deploy-execution tests only test the happy path. No tests for build failure, wrangler failure, health check failure, etc. This is acceptable for an initial implementation but should be tracked.

## Summary

| Axis | Findings |
|------|----------|
| A — Structural | 2 FAIL (type bypass, writeFile), 1 note (bare catch), 1 FAIL (duplicated code) |
| B — DNA | 4 PASS |
| C — Ecosystem | 1 FAIL (writeFileIfChanged) |
| D — RFC contract | 2 FAIL (conventional path, certify URL from effect records), 1 note (stub producer) |
| E — Forward-only | 2 PASS |
| F — Agent clarity | 3 PASS |
| G — Tests | 3 PASS (with notes) |

## Findings requiring action

1. **[medium] D-1:** Deploy commands don't resolve gate decision at conventional path by default — `--gate-decision` is still required. RFC acceptance criterion not met.
2. **[medium] D-2:** `leitstand.certify` doesn't read dev deployment URL from effect records or accept `--base-url`. RFC acceptance criterion not met.
3. **[medium] A-1:** `as unknown as KernelCommandResult<T>` pattern hides type mismatches in 16 places.
4. **[medium] A-7:** Duplicated deploy context construction across 3 command handlers — Shotgun Surgery smell.
5. **[low] A-2/C-3:** `certify.ts:309` uses `fs.writeFile` instead of `writeFileIfChanged`.
6. **[low] A-3:** Outer `catch` in `executeDeployPhases` discards error message — add `errorMessage` to result or capture the error.
7. **[low] A-4/A-5:** `HealthInput` and `PropagateInput` have empty strings for required fields — track as follow-up.
