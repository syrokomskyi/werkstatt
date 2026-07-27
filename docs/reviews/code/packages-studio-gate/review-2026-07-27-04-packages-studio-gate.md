---
reviewId: REVIEW-CODE-2026-07-27-01
date: 2026-07-27
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: c998e87...HEAD
filesReviewed:
  - packages/studio-gate/src/build-queue.ts
  - packages/studio-gate/src/index.ts
  - packages/studio-gate/src/tests/build-queue.test.ts
  - packages/studio-gate/AGENTS.md
  - packages/AGENTS.md
  - docs/adrs/adr-0005-werkstatt-vm-deployment-model-single-node-js-process-no-docker-for-tier-1-scale-by-vm-count.md
---

# Code Review: c998e87...HEAD (ADR-0005 build queue)

### Verdict: Approved

The diff implements ADR-0005's in-memory build queue cleanly and minimally. The BuildQueue is a well-typed semaphore with FIFO ordering, proper error propagation, and env-var configurability. One minor finding on Axis B (DNA-40 env-example documentation) and one cosmetic finding on Axis A (type cast style) — neither blocks approval.

### Mechanical floor

Pass — `pnpm --filter @gogol/studio-gate run build:check` exits 0; `pnpm --filter @gogol/studio-gate run test` passes 12/12 tests; `adr.validate ADR-0005` passes.

### Axis A — Structural correctness

- **Minor — type casts in `BuildQueue.run`**: `fn as () => Promise<unknown>` and `resolve as (value: unknown) => void` at `build-queue.ts:53-54` use double type casts to work around the `QueuedTask` interface erasure. This is structurally correct but slightly noisy. An alternative would be to make `QueuedTask` generic and use `QueuedTask<unknown>` with a wrapper that captures the typed resolve. Not blocking — the current approach is safe and the casts are localized.
- No dead code, no magic numbers (default concurrency 2 is named `DEFAULT_BUILD_CONCURRENCY`), no swallowed errors, no over-engineering.

### Axis B — DNA alignment

- **Minor — DNA-40 (env-example)**: `STUDIO_GATE_BUILD_CONCURRENCY` is a new env var documented in `packages/studio-gate/AGENTS.md` but not in `.env.example` (root or package-level). However, the existing `WERKSTATT_ROOT` env var (RFC-0555) also is not in `.env.example`, establishing a precedent that studio-gate env vars are documented in AGENTS.md, not `.env.example`. This is a consistency observation, not a violation. Not blocking.
- **DNA-42 (Compass markup)**: `build-queue.ts` and `build-queue.test.ts` both carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. Pass.
- **DNA-6 (kebab-case)**: `build-queue.ts` uses kebab-case filename. Pass.
- No other DNA invariants are directly touched by this diff.

### Axis C — Ecosystem fit

- **Package boundaries**: `build-queue.ts` is internal to `studio-gate` — no cross-package imports added. Pass.
- **AGENTS.md updates**: `packages/studio-gate/AGENTS.md` and `packages/AGENTS.md` both updated with ADR-0005 build queue documentation. Pass.
- **Compass sync**: `docs/source-markup.xml` does not contain `studio-gate` entries (pre-existing — RFC-0555 also did not add them). Not this diff's responsibility to fix. Pass.

### Axis D — Forward-only compliance

No compatibility shims, no dual paths, no legacy code retained. The `BuildQueue` is a new module — there is no old build queue to deprecate. Pass.

### Axis E — Agent-facing clarity

- **Compass scaffolding**: both new files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`. Pass.
- **No ungrounded assertions**: `MODULE_CONTRACT` references ADR-0005 and DNA-22 correctly. The `isBuildTriggeringTool` set references `mission.validate` and `mission.build` which are real commands. Pass.
- **Readable by another agent**: `BuildQueue`, `resolveBuildConcurrency`, `isBuildTriggeringTool` — all names reveal purpose. Pass.

### Axis F — Pragmatism

- **Minimal command surface**: no new commands — `BuildQueue` is an internal module. Pass.
- **Lean contracts**: `BuildQueueOptions` and `QueueSlotInfo` are minimal. Pass.
- **Existing patterns**: no existing build queue or concurrency limiter in the repo — this is a new concept. Pass.
- **Scope discipline**: the diff touches only `studio-gate` package and documentation. Pass.

### Axis G — Blind spots

- **Performance**: the build queue limits concurrent builds to prevent VM resource exhaustion — this is the explicit purpose. The default (2) is conservative. Pass.
- **Edge cases**: `maxConcurrency < 1` throws on construction. Empty queue drains harmlessly. Error propagation tested. Pass.
- **Security / privacy**: no user data, PII, or external services touched. Pass.

### Spec compliance

| Requirement from ADR-0005 | Status | Evidence |
| --- | --- | --- |
| In-memory build queue for concurrent mission builds | Done | `build-queue.ts:38-83` — `BuildQueue` class with semaphore-based `run()` |
| No Docker for Tier 1 | Done (negative) | No Docker code added — ADR decision is to NOT add Docker |
| No message brokers | Done (negative) | No broker code added — ADR decision is to NOT add brokers |
| Scale by VM count | Done (architectural) | Per-process queue, per-VM — each studio-gate process has its own queue |
| Single Node.js process | Done | `index.ts:77-79` — single `BuildQueue` instance in `main()` |

### Questions for the author

1. Should `STUDIO_GATE_BUILD_CONCURRENCY` be documented in `.env.example` or a package-level `.env.example`? The existing `WERKSTATT_ROOT` precedent suggests AGENTS.md is sufficient, but DNA-40 may warrant a package-level `.env.example` for studio-gate.
2. Is `mission.build` intentionally included in `BUILD_TRIGGERING_TOOLS` alongside `mission.validate`? `mission.build` is not exposed as an MCP tool in `tools.ts` (only 12 tools, `mission.build` is not among them) — it is a Site OS command but not projected through studio-gate. Including it is harmless (defensive) but technically dead code in the studio-gate context.
