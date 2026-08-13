---
reviewId: REVIEW-CODE-2026-08-13-01
date: 2026-08-13
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 6cacda24...HEAD
filesReviewed:
  - packages/werkstatt-site/src/testing/test-evidence.ts
  - packages/werkstatt-site/src/testing/test-evidence.test.ts
  - packages/werkstatt-site/src/testing/module.ts
  - packages/werkstatt-site/src/testing/index.ts
  - packages/werkstatt-site/src/checks/service-test-run.ts
  - packages/werkstatt-site/src/checks/command-tables/20-ecosystem.ts
  - packages/werkstatt/src/leitstand/leitstand-commands.ts
  - packages/werkstatt/src/leitstand/service-promote.ts
  - packages/werkstatt/src/leitstand/service-deploy-helpers.ts
  - services/AGENTS.md
  - AGENTS.md
---

# Code Review: 6cacda24...HEAD (RFC-0829 test evidence gates)

### Verdict: Needs revision

Three findings across axes A, C, and F. The implementation is functionally correct and well-structured, but has duplicated code (reimplemented `atomicWriteFile`, copy-pasted gate blocks) and a silent-skip path that should fail loudly after the grace period.

### Mechanical floor

Pass — `@warpgogol/werkstatt-site` typecheck clean, 11/11 tests pass. One pre-existing error in `delivery-handler.ts` (not from this diff).

### Axis A — Structural correctness

1. **Duplicated Code (Fowler)** — The test evidence gate block (~20 lines) is copy-pasted across three sites: `leitstand-commands.ts:1879-1905`, `leitstand-commands.ts:2319-2347`, `service-promote.ts:161-201`. Each block: dynamic import `executeKernelCommand`, call `test.evidence.verify`, cast result, check `data.status`, log, throw on `exitCode === 1`. Extract a shared helper (e.g. `runTestEvidenceGate`) to eliminate the triplication.

2. **Bare catch without context** — `service-promote.ts:171`: `catch { logger.warn(...) }` swallows all `execSync` errors with a generic message. A `try/catch` that catches everything and only logs "could not resolve git HEAD" loses the actual error (ENOENT, permission, etc.). Include the error message in the warning.

### Axis B — DNA alignment

No issues. DNA-66 (testing pyramid) is correctly implemented. DNA-64 (engine stack-agnostic) is respected — `test-evidence.ts` lives in the plugin (`werkstatt-site`), not the engine. The engine calls it via `executeKernelCommand`, which is the correct inversion pattern.

### Axis C — Ecosystem fit

1. **Reimplemented `atomicWriteFile`** — `test-evidence.ts:100-106` reimplements atomic write (temp file + rename) locally. The codebase already has `atomicWriteFile` in `@warpgogol/werkstatt` (re-exported from `./werkstatt/atomic.ts`), used by `artifact-store-commands.ts`, `notausgang-commands.ts`, `release-commands.ts`, `sternsystem-pin.ts`, and others. The plugin can import from the engine — `module.ts` already imports `@warpgogol/werkstatt/kernel`. Replace the local implementation with `import { atomicWriteFile } from "@warpgogol/werkstatt"`.

### Axis D — Forward-only compliance

No issues. The grace period is a time-bounded rollout strategy with a hard end date (`GRACE_PERIOD_END = "2026-09-10"`), not a backward compatibility shim. After that date, failures are fatal. No dual code paths, no feature flags.

### Axis E — Agent-facing clarity

No issues. `test-evidence.ts` carries proper `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. Types are well-named and self-documenting. Log messages include context (command name, target, commit SHA). The `gracePeriod` field on `TestEvidenceVerifyResult` makes the grace period state machine-readable.

### Axis F — Pragmatism

1. **Duplicated gate logic** — Same finding as Axis A.1. Three copies of the same ~20-line block. A shared helper would reduce maintenance burden and the risk of divergent behavior across gates.

2. **Reimplemented utility** — Same finding as Axis C.1. `atomicWriteFile` is already available from `@warpgogol/werkstatt`. The local reimplementation is unnecessary code.

### Axis G — Blind spots

1. **Silent gate bypass after grace period** — `service-promote.ts:171-174`: if `git rev-parse HEAD` fails, the test evidence gate is silently skipped. During the grace period this is acceptable. After 2026-09-10, this means a service can be promoted to production without any test evidence verification — the gate is bypassed, not failed. After the grace period, the `catch` block should throw instead of warn, or at minimum set `testEvidenceVerified: false` and let the downstream logic decide.

### Spec compliance

| Requirement from RFC-0829 | Status | Evidence |
| --- | --- | --- |
| `test.evidence.verify` command | Done | `module.ts:632`, `test-evidence.ts:119` |
| `test.evidence.list` command | Done | `module.ts:683`, `test-evidence.ts:232` |
| Evidence recording in 5 test commands | Done | `module.ts:100,193,289,364`, `service-test-run.ts:185` |
| `leitstand.propagate` gate (L4+L5) | Done | `leitstand-commands.ts:1877` |
| `leitstand.promote` gate (L4+L5) | Done | `leitstand-commands.ts:2319` |
| `leitstand.service.promote` gate (L1+L2+L5) | Done | `service-promote.ts:161` |
| Grace period until 2026-09-10 | Done | `test-evidence.ts:80` |
| Atomic writes for evidence files | Done | `test-evidence.ts:100` (but reimplemented) |
| `services/registry.yaml` unchanged | Done | No diff in registry.yaml |

### Questions for the author

1. Why reimplement `atomicWriteFile` locally instead of importing from `@warpgogol/werkstatt`? The plugin already imports from the engine via `@warpgogol/werkstatt/kernel`.
2. After the grace period ends, should `git rev-parse HEAD` failure in `service-promote.ts` still silently skip the gate, or should it block promotion?
3. Could the three gate blocks in `leitstand-commands.ts` and `service-promote.ts` be extracted into a shared helper to avoid divergence?
