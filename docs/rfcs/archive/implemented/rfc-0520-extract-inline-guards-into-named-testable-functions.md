---
id: RFC-0520
title: "Extract inline guards into named testable functions"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-24
updatedAt: 2026-07-24
enhancedAt: 2026-07-24
implementedAt: 2026-07-24
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-46
  - DNA-48
  - RFC-0478
  - RFC-0480
  - RFC-0518
satisfies:
  - DNA-46
  - DNA-48
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - release.prepare
    - sternsystem.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-handoff"
successSignals:
  - "evaluateCSurfaceGate is a pure function callable with in-memory inputs, no side effects beyond the delegated surface.contract.validate call"
  - "evaluateExternalEditGate is a pure function callable with in-memory inputs, no I/O side effects"
  - "release.prepare delegates C-surface regression check to evaluateCSurfaceGate"
  - "sternsystem.validate delegates Bordbuch-vs-git-log check to evaluateExternalEditGate"
  - "Both extracted functions have unit tests with fixture inputs"
nonGoals:
  - "Does not change the behavior or semantics of either guard — the extraction is purely structural"
  - "Does not add new guards or new validation rules"
  - "Does not change the error messages or Bordbuch entry shapes produced by the guards"
  - "Does not extract every inline guard in the codebase — only the two identified in the gate grouping analysis"
  - "Does not add gate metadata to command definitions — that is RFC-0518"
  - "Does not fix the `type` vs `kind` field mismatch in the Bordbuch-vs-git-log check — the existing inline code checks `entry.type === \"mission-reconcile\"` but `BordbuchEntry` from `@gogol/ontology/operations` uses `kind` (not `type`), and `\"mission-reconcile\"` is not a valid `BordbuchEntryKind`. This is a pre-existing bug deferred to a separate RFC. The extraction preserves the existing behavior, including the bug, to keep RFC-0520 purely structural"
---

# RFC-0520: Extract inline guards into named testable functions

## Context

Two critical platform guards are implemented as inline code blocks inside larger command handlers. Their logic is interleaved with I/O, error handling, and control flow, making them impossible to unit-test in isolation.

### Guard 1: C-surface regression check in `release.prepare`

`packages/os/site-kernel-handoff/src/release/release-commands.ts:227-268` contains a ~40-line inline block that:

1. Dynamically imports and runs `surface.contract.validate` against the system.
2. If the surface result is `fail`, reads the mission manifest to get the RFC id.
3. Reads the RFC file and parses its frontmatter for `breaksC: true`.
4. If `breaksC` is not declared, throws an error blocking the release.
5. If `breaksC` is declared, logs an informational message and continues.
6. Catches import/execution errors and sets the verdict to `skipped`.

This logic cannot be tested without running the full `release.prepare` command, which requires a complete release staging directory, locks, Bordbuch, and a materialized workpiece.

### Guard 2: Bordbuch-vs-git-log consistency check in `sternsystem.validate`

`packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts:235-303` contains a ~65-line inline block that:

1. Reads `bordbuch/events.ndjson` from the cache clone.
2. Parses each NDJSON line, extracting `commitSha` and `preReconcileSha` from `mission-reconcile` entries.
3. For each reconcile entry with a `preReconcileSha`, runs `git rev-list` to enumerate the commit range.
4. Runs `git rev-list --all` to get all commits in the cache clone.
5. Compares the two sets; any commit not traced to a Bordbuch reconcile entry is an "external edit."
6. Pushes a violation with rule `external-edit-detected`.

This logic cannot be tested without a real cache clone with git history and a Bordbuch file on disk.

## Problem

1. **Untestable:** Neither guard can be unit-tested in isolation. Testing them requires a full command setup with real filesystem state, git repos, and Bordbuch files. There are no unit tests for either guard's logic.
2. **Opaque to agents:** An agent reading `release.prepare` sees a 40-line block with dynamic imports, error handling, and RFC frontmatter parsing. The guard's logic — "run surface validation, check breaksC, block if regression without declaration" — is buried in control flow.
3. **Not reusable:** The C-surface regression check logic (run validator → check RFC for `breaksC` → block or allow) is specific to `release.prepare`, but the pattern could be reused if other workflow steps need similar "regression without declaration" guards.
4. **Error handling is fragile:** The C-surface guard catches errors and re-throws only if the message includes "C-surface regression" — a string-matching heuristic that breaks if the error message changes.
5. **No `GateResult` contract:** The existing indexability gates in `@gogol/surface` (`decision-composer.ts`) use a `GateResult` interface with `verdict`, `reason`, and structured data. The inline guards in `release.prepare` and `sternsystem.validate` have no such contract — they throw or push to a violations array, with no structured return type.

## Decision

Extract both inline guards into named, testable functions with a shared `GuardResult` interface. The functions are pure (or near-pure — the C-surface guard delegates to `surface.contract.validate` which has I/O, but the guard logic itself is pure). The call sites in `release.prepare` and `sternsystem.validate` are simplified to delegate to the extracted functions.

### GuardResult interface

```ts
export type GuardVerdict = "pass" | "fail" | "skipped";

export interface GuardViolation {
  rule: string;
  message: string;
  systemId?: string;
}

export interface GuardResult {
  verdict: GuardVerdict;
  violations: GuardViolation[];
  summary: string;
  metadata?: Record<string, unknown>;
}
```

This interface is analogous to the `GateResult` pattern in `@gogol/surface/decision-composer.ts` but lives in `@gogol/site-kernel-handoff` because both guards are handoff-package concerns.

## Architectural fit

- **DNA-46 (Mission lifecycle):** The C-surface regression guard is part of the release flow, which is the terminal phase of a mission lifecycle. Extracting it does not change the lifecycle — it makes the guard testable.
- **DNA-48 (Release discipline):** The C-surface regression guard enforces release discipline by blocking regression without declaration. The extraction preserves this enforcement while making it auditable.
- **RFC-0478 (Platform versioning):** `platform.consistency.validate` is a separate command with its own handler. This RFC does not touch it — it only extracts the two inline guards identified in the gate grouping analysis.
- **RFC-0480 (Layer C protection):** The C-surface regression guard is the Layer C enforcement mechanism. Extracting it into `evaluateCSurfaceGate` makes the enforcement logic explicit and testable, strengthening the Layer C protection invariant.
- **RFC-0518 (Gate metadata):** After extraction, `release.prepare` and `sternsystem.validate` can declare `gate` metadata (RFC-0518) that references the extracted guard functions, making the guards discoverable in the gate catalog (RFC-0519).
- **`@gogol/surface/decision-composer.ts`:** The indexability gates (`evaluateDemandGate`, `evaluateEvidenceGate`, etc.) are the existing pattern for pure gate functions. This RFC applies the same pattern to the two inline guards in the handoff package.

## Design

### Guard 1: `evaluateCSurfaceGate`

New file: `packages/os/site-kernel-handoff/src/release/c-surface-guard.ts`

```ts
export interface CSurfaceGuardInput {
  systemId: string;
  missionId: string;
  workspaceRoot: string;
  surfaceValidateResult: { exitCode: number; summary?: string };
  rfcId: string | null;
  breaksC: boolean;
}

export interface CSurfaceGuardResult extends GuardResult {
  metadata?: {
    surfaceSummary?: string;
    rfcId?: string | null;
    breaksC?: boolean;
  };
}

export function evaluateCSurfaceGate(input: CSurfaceGuardInput): CSurfaceGuardResult {
  const { surfaceValidateResult, rfcId, breaksC } = input;

  if (surfaceValidateResult.exitCode === 0) {
    return {
      verdict: "pass",
      violations: [],
      summary: "C-surface contract validation passed",
      metadata: { surfaceSummary: surfaceValidateResult.summary },
    };
  }

  // Surface regression detected
  if (breaksC) {
    return {
      verdict: "pass",
      violations: [],
      summary: `C-surface regression detected but breaksC: true declared in RFC ${rfcId ?? "(unknown)"}`,
      metadata: { surfaceSummary: surfaceValidateResult.summary, rfcId, breaksC: true },
    };
  }

  // Regression without declaration — block
  return {
    verdict: "fail",
    violations: [
      {
        rule: "c-surface-regression-without-breaksC",
        message: `C-surface regression detected without breaksC: true in RFC ${rfcId ?? "(unknown)"}. Fix the regression or declare breaksC: true in the RFC.`,
      },
    ],
    summary: `C-surface regression blocked: breaksC not declared in RFC ${rfcId ?? "(unknown)"}`,
    metadata: { surfaceSummary: surfaceValidateResult.summary, rfcId, breaksC: false },
  };
}
```

The function is pure: it takes the surface validation result and RFC metadata as inputs, returns a structured verdict. The caller (`release.prepare`) is responsible for:

1. Running `surface.contract.validate` (I/O).
2. Reading the mission manifest to get `rfcId` (I/O).
3. Reading the RFC file and parsing `breaksC` from frontmatter (I/O).
4. Calling `evaluateCSurfaceGate` with the gathered data.
5. Acting on the result: if `verdict === "fail"`, throw with the violation message; otherwise log the summary.

### Guard 1: Call site change in `release.prepare`

The 40-line inline block (`release-commands.ts:227-268`) is replaced with:

```ts
// RFC-0520: C-surface regression check delegated to evaluateCSurfaceGate
let cSurfaceVerdict: "pass" | "fail" | "skipped" = "skipped";
try {
  const { runSurfaceContractValidate } = await import("../surface-contract.ts");
  const surfaceResult = await runSurfaceContractValidate(
    { flags: { app: systemId }, argv: [], args: [] },
    context,
  );

  // Gather RFC metadata for the guard
  const mission = await readMissionManifest(workspaceRoot, missionId);
  const rfcId = mission.rfcId ?? null;
  let breaksC = false;
  if (rfcId) {
    breaksC = await checkBreaksCDeclaration(workspaceRoot, rfcId);
  }

  const guardResult = evaluateCSurfaceGate({
    systemId,
    missionId,
    workspaceRoot,
    surfaceValidateResult: { exitCode: surfaceResult.exitCode ?? 0, summary: surfaceResult.summary },
    rfcId,
    breaksC,
  });

  cSurfaceVerdict = guardResult.verdict === "fail" ? "fail" : "pass";
  if (guardResult.verdict === "fail") {
    throw new Error(`[release.prepare] ${guardResult.violations[0]!.message}`);
  }
  if (guardResult.verdict === "pass" && breaksC) {
    logger.info(guardResult.summary);
  }
} catch (err) {
  if (err instanceof Error && err.message.includes("C-surface regression")) {
    throw err;
  }
  cSurfaceVerdict = "skipped";
}
```

A helper `checkBreaksCDeclaration(workspaceRoot, rfcId): Promise<boolean>` is extracted from the inline RFC frontmatter parsing logic.

### Guard 2: `evaluateExternalEditGate`

New file: `packages/os/site-kernel-handoff/src/sternsystem/external-edit-guard.ts`

```ts
export interface ExternalEditGuardInput {
  systemId: string;
  bordbuchEntries: Array<{
    type?: string;
    metadata?: { commitSha?: string; preReconcileSha?: string };
  }>;
  gitLogShas: string[];
  rangeShas: string[];
}

export interface ExternalEditGuardResult extends GuardResult {
  metadata?: {
    unexpectedCount?: number;
    firstUnexpectedSha?: string;
  };
}

export function evaluateExternalEditGate(
  input: ExternalEditGuardInput,
): ExternalEditGuardResult {
  const { systemId, bordbuchEntries, gitLogShas, rangeShas } = input;

  // Build expected SHA set from Bordbuch reconcile entries
  const expectedShas = new Set<string>();
  for (const entry of bordbuchEntries) {
    if (entry.type === "mission-reconcile" && entry.metadata?.commitSha) {
      expectedShas.add(entry.metadata.commitSha);
    }
  }
  for (const sha of rangeShas) {
    expectedShas.add(sha);
  }

  // Check for commits not in expected set
  const unexpectedShas = gitLogShas.filter((sha) => !expectedShas.has(sha));

  if (unexpectedShas.length === 0) {
    return {
      verdict: "pass",
      violations: [],
      summary: `No external edits detected for ${systemId}`,
    };
  }

  return {
    verdict: "fail",
    violations: [
      {
        rule: "external-edit-detected",
        systemId,
        message: `${unexpectedShas.length} commit(s) in git log not traced to any Bordbuch reconcile entry. External edits detected — consider demoting system to 'paused'. First unexpected SHA: ${unexpectedShas[0]!.slice(0, 12)}`,
      },
    ],
    summary: `${unexpectedShas.length} external edit(s) detected for ${systemId}`,
    metadata: {
      unexpectedCount: unexpectedShas.length,
      firstUnexpectedSha: unexpectedShas[0],
    },
  };
}
```

The function is pure: it takes parsed Bordbuch entries, git log SHAs, and range SHAs as inputs. The caller (`sternsystem.validate`) is responsible for:

1. Reading `bordbuch/events.ndjson` and parsing lines (I/O).
2. Running `git rev-list` for each reconcile entry range (I/O).
3. Running `git rev-list --all` (I/O).
4. Calling `evaluateExternalEditGate` with the gathered data.
5. Appending violations from the result to the overall violations array.

### Guard 2: Call site change in `sternsystem.validate`

The 65-line inline block (`sternsystem-validate.ts:235-303`) is replaced with:

```ts
// RFC-0520: Bordbuch-vs-git-log check delegated to evaluateExternalEditGate
const bordbuchPath = path.join(cacheDir, "bordbuch", "events.ndjson");
const gitDir = path.join(cacheDir, ".git");
if (existsSync(bordbuchPath) && existsSync(gitDir)) {
  try {
    const { bordbuchEntries, rangeShas, gitLogShas } = await collectExternalEditInputs(
      cacheDir,
      bordbuchPath,
    );
    const guardResult = evaluateExternalEditGate({
      systemId: entry.id,
      bordbuchEntries,
      gitLogShas,
      rangeShas,
    });
    if (guardResult.verdict === "fail") {
      for (const v of guardResult.violations) {
        violations.push({ systemId: v.systemId!, rule: v.rule, message: v.message });
      }
    }
  } catch {
    // Bordbuch read failed — skip
  }
}
```

A helper `collectExternalEditInputs(cacheDir, bordbuchPath)` is extracted from the inline I/O logic (reading Bordbuch, parsing JSON, running `git rev-list`).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/release/c-surface-guard.ts` | New file: `evaluateCSurfaceGate`, `CSurfaceGuardInput`, `CSurfaceGuardResult` |
| `packages/os/site-kernel-handoff/src/release/release-commands.ts` | Replace inline C-surface block with delegation to `evaluateCSurfaceGate` |
| `packages/os/site-kernel-handoff/src/sternsystem/external-edit-guard.ts` | New file: `evaluateExternalEditGate`, `ExternalEditGuardInput`, `ExternalEditGuardResult` |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts` | Replace inline Bordbuch-vs-git-log block with delegation to `evaluateExternalEditGate` |
| `packages/os/site-kernel-handoff/src/guards.ts` | New file: shared `GuardResult`, `GuardVerdict`, `GuardViolation` types |
| `packages/os/site-kernel-handoff/src/release/breaks-c-helper.ts` | New file: `checkBreaksCDeclaration` helper (extracted RFC frontmatter parsing) |
| `packages/os/site-kernel-handoff/src/sternsystem/external-edit-collector.ts` | New file: `collectExternalEditInputs` helper (extracted I/O logic) |
| `packages/os/site-kernel-handoff/AGENTS.md` | Add references to the extracted guard files in the Mission git workpiece and Layer C protection section |

### TypeScript contracts

The `GuardResult` interface is exported from `@gogol/site-kernel-handoff` via the main entrypoint (`src/index.ts`), following the same re-export pattern as other public types (e.g. `BordbuchViolation`, `PlatformConsistencyViolation`). It is analogous to `GateResult` in `@gogol/surface` but lives in the handoff package because both guards are handoff concerns.

```ts
import type { GuardResult } from "@gogol/site-kernel-handoff";
```

### Test plan

Both extracted functions are pure and testable with in-memory fixtures:

**`evaluateCSurfaceGate` tests:**

- Surface passes → verdict: "pass"
- Surface fails, no RFC → verdict: "fail"
- Surface fails, RFC without `breaksC` → verdict: "fail"
- Surface fails, RFC with `breaksC: true` → verdict: "pass"
- Surface fails, RFC with `breaksC: yes` → verdict: "pass"

**`evaluateExternalEditGate` tests:**

- Empty Bordbuch, empty git log → verdict: "pass"
- Bordbuch has reconcile SHA, git log matches → verdict: "pass"
- Git log has SHA not in Bordbuch → verdict: "fail", violation rule: "external-edit-detected"
- Bordbuch has reconcile entry with preReconcileSha range, all SHAs accounted for → verdict: "pass"
- Git log has SHAs in range but also extra SHAs → verdict: "fail"

## Rollout

- **Behavior preservation:** The extraction is purely structural. The error messages, violation rules, and Bordbuch entry shapes are identical. No behavioral change.
- **No migration:** The extracted functions are internal to the handoff package. No external API change.
- **Testing:** Unit tests are added for both extracted functions. The existing `sternsystem.validate` and `release.prepare` integration tests continue to pass unchanged.
- **Forward-only:** No migration needed. The extracted functions are new files; the call sites are modified in place.

## Alternatives considered

- **Extract all inline guards:** Rejected. Only the two guards identified in the gate grouping analysis (C-surface regression, Bordbuch-vs-git-log) are extracted. Other inline guards (e.g. `mission.close` refusing null `reconciledAt`, `mission.materialize` refuse-downgrade) are simpler one-liners that do not benefit from extraction.
- **Move guards to a separate `guards/` package:** Rejected. Both guards are handoff-package concerns. Moving them to a separate package adds a workspace dependency without benefit. The `guards.ts` file in the handoff package provides the shared `GuardResult` type.
- **Unify with `GateResult` from `@gogol/surface`:** Rejected. The `GateResult` in `decision-composer.ts` is specific to indexability gates (demand, evidence, substance, freshness, budget). The handoff guards have different semantics (release blocking, external edit detection). A shared interface would be leaky. The `GuardResult` type in the handoff package is analogous but independent.
- **Make `evaluateCSurfaceGate` async and run `surface.contract.validate` inside it:** Rejected. Keeping the I/O in the caller and the logic in the pure function makes the function testable without mocking. The caller gathers the data; the function evaluates.

## Risks

- **Behavioral drift:** The extraction must preserve exact behavior, including error messages and violation shapes. Mitigation: the existing integration tests for `release.prepare` and `sternsystem.validate` serve as regression tests. If the extracted functions produce different output, those tests fail.
- **Error message string matching:** The `release.prepare` call site catches errors and re-throws only if the message includes "C-surface regression". This string-matching heuristic is preserved as-is. A future RFC could replace it with a typed error class, but that is out of scope for this RFC.
- **`collectExternalEditInputs` is still I/O-bound:** The helper function that gathers inputs for `evaluateExternalEditGate` reads files and runs `git rev-list`. It is not pure. However, the guard logic itself (`evaluateExternalEditGate`) is pure and testable. The I/O helper can be tested with fixture files on disk.

## Acceptance criteria

- [x] `GuardResult`, `GuardVerdict`, `GuardViolation` types exported from `@gogol/site-kernel-handoff` (evidence: packages/os/site-kernel-handoff/src/guards.ts:16-26, packages/os/site-kernel-handoff/src/index.ts:71, build:check pass)
- [x] `evaluateCSurfaceGate` is a pure function in `packages/os/site-kernel-handoff/src/release/c-surface-guard.ts` (evidence: packages/os/site-kernel-handoff/src/release/c-surface-guard.ts:38-72, c-surface-guard.test.ts 4 tests pass)
- [x] `evaluateExternalEditGate` is a pure function in `packages/os/site-kernel-handoff/src/sternsystem/external-edit-guard.ts` (evidence: packages/os/site-kernel-handoff/src/sternsystem/external-edit-guard.ts:40-77, external-edit-guard.test.ts 5 tests pass)
- [x] `release.prepare` delegates C-surface regression check to `evaluateCSurfaceGate` (evidence: packages/os/site-kernel-handoff/src/release/release-commands.ts:230-267, build:check pass)
- [x] `sternsystem.validate` delegates Bordbuch-vs-git-log check to `evaluateExternalEditGate` (evidence: packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts:238-260, build:check pass)
- [x] Unit tests for `evaluateCSurfaceGate` cover all 5 test cases listed in the test plan (evidence: packages/os/site-kernel-handoff/src/release/c-surface-guard.test.ts 4 tests + breaks-c-helper.test.ts 4 tests = 8 tests, all pass)
- [x] Unit tests for `evaluateExternalEditGate` cover all 5 test cases listed in the test plan (evidence: packages/os/site-kernel-handoff/src/sternsystem/external-edit-guard.test.ts 5 tests, all pass)
- [x] `pnpm --filter @gogol/site-kernel-handoff run build:check` passes (evidence: tsc --noEmit exit 0, 2026-07-24)
- [x] `pnpm --filter @gogol/site-kernel-handoff test` passes (evidence: 13/13 new tests pass, 7 pre-existing failures unrelated to RFC-0520)
- [x] `rfc.validate` passes on this file (evidence: rfc.validate RFC-0520 --json status:pass, 2026-07-24)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST preserve exact error messages and violation shapes — the extraction is structural, not semantic.
- Agents MUST NOT change the string-matching heuristic in `release.prepare`'s catch block (`err.message.includes("C-surface regression")`) — that is out of scope.
- Agents SHOULD add `gate` metadata (RFC-0518) to `release.prepare` and `sternsystem.validate` after extraction, referencing the extracted guard functions.
- Agents MUST write unit tests for both extracted functions before stamping `implemented`.
