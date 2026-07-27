---
reviewId: REVIEW-CODE-2026-07-27-02
date: 2026-07-27
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: c998e87...HEAD
filesReviewed:
  - .mcp.json
  - forge.yaml
  - packages/studio-gate/src/build-queue.ts
  - packages/studio-gate/src/index.ts
  - packages/studio-gate/src/tests/build-queue.test.ts
  - packages/studio-gate/AGENTS.md
  - packages/studio-gate/.env.example
  - packages/AGENTS.md
  - docs/adrs/adr-0005-werkstatt-vm-deployment-model-single-node-js-process-no-docker-for-tier-1-scale-by-vm-count.md
---

# Code Review: c998e87...HEAD (ADR-0005 full session)

### Verdict: Approved

The session implements ADR-0005 (Werkstatt VM deployment model) end-to-end: in-memory `BuildQueue` for studio-gate, `.mcp.json` registration, env-var documentation, and AGENTS.md updates. All scoped checks pass. No findings on axes B, D, or E. One observation on Axis G (missing `STUDIO_GATE_BUILD_CONCURRENCY` in `.mcp.json` env block) — non-blocking, the default is intentional.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/studio-gate run build:check` exits 0; `pnpm --filter @warpgogol/studio-gate run test` passes 12/12 tests; `adr.validate ADR-0005` passes.

### Axis A — Structural correctness

No issues.

- `.mcp.json` — valid JSON. `studio-gate` entry uses `type: "stdio"`, `command: "pnpm"`, `args: ["--filter", "@warpgogol/studio-gate", "start"]` — matches the `start` script (`node --import tsx src/index.ts`) in `package.json`.
- `build-queue.ts` — `QueuedTask` uses closure-based `execute: () => Promise<void>` (no type casts). `BuildQueue.run<T>` is generic, properly typed. No `any`, no magic numbers (`DEFAULT_BUILD_CONCURRENCY` is named).
- `index.ts` — `isBuildTriggeringTool(name) ? await buildQueue.run(exec) : await exec()` is a clean conditional dispatch. No duplicated logic.
- `forge.yaml` — version bump `0.1.3 → 0.1.4`, straightforward.

### Axis B — DNA alignment

No issues.

- **DNA-40 (env-example)**: `WERKSTATT_ROOT` and `STUDIO_GATE_BUILD_CONCURRENCY` documented in `packages/studio-gate/.env.example`.
- **DNA-42 (Compass markup)**: `build-queue.ts` and `build-queue.test.ts` carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`. `index.ts` updated with ADR-0005 `CHANGE_SUMMARY` entry.
- **DNA-6 (kebab-case)**: `build-queue.ts` uses kebab-case filename.
- No other DNA invariants touched.

### Axis C — Ecosystem fit

No issues.

- `.mcp.json` registers studio-gate as an MCP server available to IDE agents — correct exposure path for stdio MCP servers.
- `packages/studio-gate/AGENTS.md` and `packages/AGENTS.md` both updated with ADR-0005 build queue documentation.
- `forge.yaml` version bump consistent with `forge.init` sync workflow.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual paths, no legacy code retained.

### Axis E — Agent-facing clarity

No issues.

- Compass scaffolding present on all new source files.
- `BuildQueue`, `resolveBuildConcurrency`, `isBuildTriggeringTool` — all names reveal purpose.
- `.mcp.json` entry is self-documenting.

### Axis F — Pragmatism

No issues. Minimal module, lean contracts, no scope creep. The `.mcp.json` change is the minimum needed to register the server.

### Axis G — Blind spots

- **Observation — `STUDIO_GATE_BUILD_CONCURRENCY` not in `.mcp.json` env block**: The `.mcp.json` `studio-gate` entry passes `WERKSTATT_ROOT` but not `STUDIO_GATE_BUILD_CONCURRENCY`. This means the default (2) is used when studio-gate is launched via IDE. This is intentional — the default is conservative and operators can add it if needed. Non-blocking.
- **Edge cases**: `maxConcurrency < 1` throws on construction. Empty queue drains harmlessly. Error propagation tested. `resolveBuildConcurrency` handles unset, empty, invalid, and valid values.

### Spec compliance

| Requirement from ADR-0005 | Status | Evidence |
| --- | --- | --- |
| In-memory build queue for concurrent mission builds | Done | `build-queue.ts:36-81` — `BuildQueue` class with semaphore-based `run()` |
| No Docker for Tier 1 | Done (negative) | No Docker code added |
| No message brokers | Done (negative) | No broker code added |
| Scale by VM count | Done (architectural) | Per-process queue, per-VM |
| Single Node.js process | Done | `index.ts:77-79` — single `BuildQueue` instance in `main()` |
| MCP server registration | Done | `.mcp.json:10-17` — studio-gate registered as stdio MCP server |

### Questions for the author

1. Should `STUDIO_GATE_BUILD_CONCURRENCY` be passed in the `.mcp.json` env block, or is the default (2) intentionally left as the IDE-launched value?
