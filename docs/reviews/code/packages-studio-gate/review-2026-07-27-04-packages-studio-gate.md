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
  - packages/studio-gate/.env.example
  - packages/AGENTS.md
  - docs/adrs/adr-0005-werkstatt-vm-deployment-model-single-node-js-process-no-docker-for-tier-1-scale-by-vm-count.md
---

# Code Review: c998e87...HEAD (ADR-0005 build queue)

### Verdict: Approved

The diff implements ADR-0005's in-memory build queue cleanly and minimally. After fo-fix, the two minor findings (type cast style, DNA-40 env-example) are resolved. No remaining findings.

### Mechanical floor

Pass — `pnpm --filter @gogol/studio-gate run build:check` exits 0; `pnpm --filter @gogol/studio-gate run test` passes 12/12 tests; `adr.validate ADR-0005` passes.

### Axis A — Structural correctness

No issues. Type casts removed — `QueuedTask` now uses a closure-based `execute: () => Promise<void>` function that captures typed `resolve`/`reject` from the `Promise<T>` constructor. No casts needed.

### Axis B — DNA alignment

No issues. `STUDIO_GATE_BUILD_CONCURRENCY` and `WERKSTATT_ROOT` documented in `packages/studio-gate/.env.example` (DNA-40). `build-queue.ts` and `build-queue.test.ts` carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` (DNA-42). Kebab-case filename (DNA-6).

### Axis C — Ecosystem fit

No issues. `build-queue.ts` is internal to `studio-gate` — no cross-package imports. AGENTS.md files updated.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual paths.

### Axis E — Agent-facing clarity

No issues. Compass scaffolding present. All names reveal purpose.

### Axis F — Pragmatism

No issues. Minimal module, lean contracts, no scope creep.

### Axis G — Blind spots

No issues. `maxConcurrency < 1` throws on construction. Default (2) is conservative. Error propagation tested.

### Spec compliance

| Requirement from ADR-0005 | Status | Evidence |
| --- | --- | --- |
| In-memory build queue for concurrent mission builds | Done | `build-queue.ts:36-81` — `BuildQueue` class with semaphore-based `run()` |
| No Docker for Tier 1 | Done (negative) | No Docker code added — ADR decision is to NOT add Docker |
| No message brokers | Done (negative) | No broker code added — ADR decision is to NOT add brokers |
| Scale by VM count | Done (architectural) | Per-process queue, per-VM — each studio-gate process has its own queue |
| Single Node.js process | Done | `index.ts:77-79` — single `BuildQueue` instance in `main()` |

### Questions for the author

1. Is `mission.build` intentionally included in `BUILD_TRIGGERING_TOOLS` alongside `mission.validate`? `mission.build` is not exposed as an MCP tool in `tools.ts` (only 12 tools, `mission.build` is not among them) — it is a Site OS command but not projected through studio-gate. Including it is harmless (defensive) but technically dead code in the studio-gate context.
