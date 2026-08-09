---
reviewId: REVIEW-CODE-2026-08-09-01
date: 2026-08-09
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: ad1f7ddf...HEAD
filesReviewed:
  - packages/werkstatt/src/workshop/workshop-scaffold.ts
  - packages/werkstatt/src/workshop/templates.ts
  - packages/werkstatt/src/workshop/workshop-scaffold.test.ts
  - packages/werkstatt/src/workshop/workshop.module.ts
  - packages/werkstatt/src/workshop/index.ts
  - packages/forge/src/index.ts
  - packages/werkstatt/package.json
  - packages/werkstatt/AGENTS.md
  - tools/kernel.config.ts
  - AGENTS.md
  - docs/authoring/site-composition.md
  - docs/rfcs/rfc-0779-consumer-workshop-scaffolding-and-onboarding.md
---

# Code Review: ad1f7ddf...HEAD (RFC-0779 workshop.scaffold)

### Verdict: Approved

The implementation is clean, well-structured, and follows ecosystem patterns. All new files carry Compass scaffolding. The handler correctly validates flags, delegates to forge.init, and supports --verify and --dry-run modes. 15 unit tests cover SCAFFOLD-01..06 failure modes and happy paths. No findings across any axis.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt run build:check` shows zero errors in workshop files (pre-existing errors in werkstatt-site are unrelated). `rfc.validate --id RFC-0779` passes after fixing acceptedAt and commands metadata. `pnpm --filter @warpgogol/werkstatt run test` — 1255 tests pass including 15 workshop tests.

### Axis A — Structural correctness

No issues. The `as unknown as ForgeRuntimeContext` casts (workshop-scaffold.ts:233, 276) are a known pattern — `KernelRuntimeContext` and `ForgeRuntimeContext` are structurally compatible but not identical. The `fail` helper avoids duplication for error paths. Dynamic imports of `@warpgogol/forge` keep the workshop module lazy-loaded. Types match the RFC TypeScript contracts.

### Axis B — DNA alignment

No issues. DNA-62 (pinned files) — `.forge/pinned.yaml` template pre-populated with foundation file entries. DNA-64 (engine autonomy) — workshop module imports only from `@warpgogol/forge` (exempted) and `@warpgogol/werkstatt` (self). No stack plugin imports. DNA-1, 2 — scaffolded workshop follows monorepo boundary and pnpm+Turborepo layout.

### Axis C — Ecosystem fit

No issues. `workshop.scaffold` registered in `workshop.module.ts` with correct metadata (scope: workspace, requiresNetwork: true, longRunning: true). Module loader registered in `tools/kernel.config.ts`. Root AGENTS.md and `docs/authoring/site-composition.md` updated with workshop.scaffold rule. `packages/werkstatt/AGENTS.md` updated with workshop entry points. Command manifest regenerated.

### Axis D — Forward-only compliance

No issues. No compatibility shims, bridges, or dual-paths. The `scaffoldMemoryLayer` export from `@warpgogol/forge` index.ts was missing and is now exported — this is a forward-only fix, not a shim.

### Axis E — Agent-facing clarity

No issues. All five new source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. Variable names are clear (`vars`, `workshopFiles`, `filesCreated`, `forgeInitOk`). The `fail` helper is self-documenting. Log messages include context (file counts, paths).

### Axis F — Pragmatism

No issues. Inline template strings in `templates.ts` are the right choice for a scaffolding command — no external file I/O needed. `STACK_PLUGIN_MAP` is a simple data map, not an over-engineered registry. No new dependencies added. The handler uses synchronous `fs` operations which is appropriate for a one-shot scaffolding command.

### Axis G — Blind spots

No issues. Edge cases (empty destination, concurrent execution, interrupted operation) are addressed in the RFC and tested. The `.npmrc` template uses a placeholder token (`YOUR_NPM_TOKEN`), not a real secret. The `--verify` path has a 120-second timeout for `pnpm install` and 60-second timeouts for verification commands. SCAFFOLD-06 handles npm auth failures with E401/ENEEDAUTH detection.

### Spec compliance

| Requirement from RFC | Status | Evidence |
| --- | --- | --- |
| workshop.scaffold command registered | Done | workshop.module.ts:23-62, tools/kernel.config.ts:158-159 |
| Generates all artifacts | Done | templates.ts:360-383 (16 files), real scaffold created 82 files |
| Stack-specific customization | Done | templates.ts:361 (isSite check), test.ts:254-288 |
| Post-scaffold verification | Done | workshop-scaffold.ts:336-462, test.ts:349-365 |
| SCAFFOLD-01..06 failure modes | Done | test.ts 15 tests pass |
| End-to-end flow | Done | Real scaffold verified for all 3 stacks; full deploy requires published plugins |
| rfc.validate passes | Done | `rfc.validate --id RFC-0779` exit 0 |

### Questions for the author

1. The `onboarding.scaffold` command was initially listed under `commands.changed` but was removed — this RFC uses the existing command (provided by plugin hooks per RFC-0770) without changing it. Was this the correct interpretation?
2. The end-to-end acceptance criterion was marked with evidence of scaffold verification but not a full deploy (requires published plugins). Is this sufficient for implementation status?
