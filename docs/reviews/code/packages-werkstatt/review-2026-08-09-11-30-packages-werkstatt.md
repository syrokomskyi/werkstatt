---
reviewId: REVIEW-CODE-2026-08-09-01
date: 2026-08-09
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: e1a27d63...HEAD
filesReviewed:
  - packages/werkstatt/package.json
  - packages/werkstatt/tsconfig.json
  - packages/werkstatt/src/plugin-contract.ts
  - packages/werkstatt/src/plugin-registry.ts
  - packages/werkstatt/src/index.ts
  - packages/werkstatt/src/validate/plugin-validate.ts
  - packages/werkstatt/src/validate/plugin-validate.test.ts
  - packages/werkstatt/os/werkstatt-plugin.module.ts
  - tools/kernel.config.ts
  - AGENTS.md
  - docs/PACKAGE_GRAPH.md
---

# Code Review: e1a27d63...HEAD (RFC-0770 implementation)

### Verdict: Needs revision

The implementation is architecturally sound and covers all RFC-0770 acceptance criteria. Two minor findings: missing `packages/werkstatt/AGENTS.md` and missing ownership table entry in `packages/AGENTS.md`.

### Mechanical floor

Pass — `build:check` (exit 0), `test` (9/9 passed), `rfc.validate --id RFC-0770` (exit 0), `werkstatt.plugin.validate` (exit 0, warn status).

### Axis A — Structural correctness

No issues. Types are clean — no `any`, justified `as unknown as Record<string, unknown>` cast (KernelModule lacks index signature). Error handling is intentional: the silent catch in the module loader scan loop (line 125-126) is documented with a comment explaining PLUGIN-03 catches plugin loader failures separately. `DeployAdapterFactory = unknown` is an intentional placeholder per RFC-0770 §Design (re-homed by RFC-0772).

### Axis B — DNA alignment

No issues. DNA-64 (engine/plugin/workshop boundary) is enforced: `@warpgogol/werkstatt` is stack-agnostic, imports only from `@warpgogol/site-kernel`, does not import any stack plugin. The package defines the contract types and validation — the full engine migration is RFC-0772.

### Axis C — Ecosystem fit

**Finding C-1:** `packages/werkstatt/AGENTS.md` is missing. All other packages in `packages/*` have a package-specific AGENTS.md with entry points, scripts, and dependencies. The new package should follow the same pattern.

**Finding C-2:** `packages/AGENTS.md` ownership table does not list `@warpgogol/werkstatt`. The table should be updated with the package's responsibility.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no legacy code paths, no dual-paths.

### Axis E — Agent-facing clarity

No issues. All new source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. Variable and function names are self-documenting. The pure function + thin kernel handler pattern is correctly applied (`validatePlugin` + `forgeWerkstattPluginModule`).

### Axis F — Pragmatism

No issues. The validate command is minimal and focused. The test mocking approach (mocking `tsx/esm/api`) is pragmatic — avoids the fragility of writing real `.ts` files to temp dirs that can't resolve `@warpgogol/site-kernel` imports. The `cacheable: false` flag is correct for a validator that dynamically imports modules.

### Axis G — Blind spots

No issues. Performance: `tsImport` loads the kernel config dynamically — same pattern as `discovery.ts`. False positives: warn-only transition (PLUGIN-01 as warning when no `profile` field) handles the no-plugin case during migration. Edge cases: missing `kernel.config.ts` (PLUGIN-05), empty `moduleLoaders`, missing `forge.yaml`, missing `registry.yaml` all handled gracefully.

### Spec compliance

| Requirement from RFC-0770 | Status | Evidence |
| --- | --- | --- |
| `WerkstattPlugin`, `WerkstattPluginHooks`, `PluginRegistry` types defined | Done | `packages/werkstatt/src/plugin-contract.ts`, `packages/werkstatt/src/plugin-registry.ts` |
| `werkstatt.plugin.validate` registered (workspace scope) | Done | `packages/werkstatt/os/werkstatt-plugin.module.ts`, registered in `tools/kernel.config.ts` |
| PLUGIN-01..05 failure modes covered by unit tests | Done | `packages/werkstatt/src/validate/plugin-validate.test.ts` (9 tests) |
| Profile binding cross-check implemented | Done | `validatePlugin()` PLUGIN-02 check |
| Warn-only behavior for PLUGIN-01 implemented and tested | Done | `validatePlugin()` + test "PLUGIN-01 (warn-only)" |
| Root `AGENTS.md` documents the plugin contract | Done | `AGENTS.md` §Werkstatt plugin contract (RFC-0770) |
| `rfc.validate` passes | Done | exit 0, "All 1 RFC(s) passed validation" |

### Questions for the author

1. Should `packages/werkstatt/AGENTS.md` be created now or deferred to RFC-0772 when the full engine is composed?
2. Should the `packages/AGENTS.md` ownership table be updated as part of this RFC or the next?
