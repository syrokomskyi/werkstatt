---
reviewId: REVIEW-CODE-2026-07-13-13
date: 2026-07-13
reviewer:
  skill: wg-review
  model: unknown
verdict: needs-revision
diffRange: HEAD (uncommitted)
filesReviewed:
  - packages/os/site-kernel-checks/src/module.ts
  - packages/os/site-kernel-observability/src/module.ts
  - packages/os/site-kernel-onboarding/src/module.ts
  - packages/os/site-kernel/package.json
  - packages/os/site-kernel-handoff/package.json
  - packages/os/site-kernel-handoff/src/handoff.module.ts
  - packages/os/site-kernel-handoff/src/sternsystem/sternsystem.module.ts
  - packages/os/site-kernel-handoff/src/mission/mission.module.ts
  - packages/os/site-kernel-handoff/src/bordbuch/bordbuch.module.ts
  - packages/os/site-kernel-handoff/src/artifact-store/artifact-store.module.ts
  - packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot.module.ts
  - packages/os/site-kernel-handoff/src/release/release.module.ts
  - packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts
  - packages/os/site-kernel-handoff/src/notausgang/notausgang.module.ts
  - tools/kernel.config.ts
  - docs/command-manifest.generated.yaml
---

# Code Review: HEAD (uncommitted) — Lazy module loading refactor

### Verdict: Needs revision

The diff successfully converts all 24 kernel modules to use dynamic imports inside async `register()` methods, achieving a ~7x speedup for manifest-driven single-module command execution. However, 9 new source files lack the required Compass scaffolding (DNA-42), and the checks module retains top-level runtime imports from `@gogol/site-kernel` that partially defeat the lazy-loading goal for that package.

### Mechanical floor

Pass — all 5 affected packages pass `build:check` (`tsc --noEmit`):

- `@gogol/site-kernel` ✓
- `@gogol/site-kernel-checks` ✓
- `@gogol/site-kernel-observability` ✓
- `@gogol/site-kernel-onboarding` ✓
- `@gogol/site-kernel-handoff` ✓
- `@gogol/forge` ✓

### Axis A — Structural correctness

- **Checks module partial lazy loading**: `packages/os/site-kernel-checks/src/module.ts` still has top-level runtime imports from `@gogol/site-kernel` (lines 32–37: `executeKernelCommand`, `appendStepTelemetry`, `loadPipelineBudgets`, `lookupExpectedDurationMs`) and from `./pipelines/index.ts` (lines 40–49). These are used by the pipeline driver functions (`runCommandSequence`, `runAppsCheckImpl`, etc.) defined at module scope. While `ALL_COMMANDS` and `runMirroringValidation` are now correctly lazy-loaded inside `register()`, the pipeline constants and runtime utilities are still eagerly loaded. This is acceptable for the pipeline driver functions (they need these at call time, not registration time), but it means the checks module is only partially lazy — the `./pipelines/index.ts` barrel and `@gogol/site-kernel` runtime imports are still loaded when the module file is imported. **Finding: minor** — the heaviest import (`ALL_COMMANDS` with 17+ command tables) is successfully lazy-loaded, so the performance goal is achieved, but the module is not fully lazy.
- **No dead code introduced** — the original barrel files (`index.ts`) are retained for their export surfaces, which is correct.
- **No duplicated logic** — each new `*.module.ts` file faithfully reproduces the command registrations from the original barrel `index.ts` files (verified for handoff, sternsystem, mission, bordbuch, artifact-store, behavior-snapshot, release, leitstand, notausgang).

### Axis B — DNA alignment

- **DNA-42 (Compass markup) — FAIL**: 9 new source files lack `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding:
  - `packages/os/site-kernel-handoff/src/handoff.module.ts`
  - `packages/os/site-kernel-handoff/src/sternsystem/sternsystem.module.ts`
  - `packages/os/site-kernel-handoff/src/mission/mission.module.ts`
  - `packages/os/site-kernel-handoff/src/bordbuch/bordbuch.module.ts`
  - `packages/os/site-kernel-handoff/src/artifact-store/artifact-store.module.ts`
  - `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot.module.ts`
  - `packages/os/site-kernel-handoff/src/release/release.module.ts`
  - `packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts`
  - `packages/os/site-kernel-handoff/src/notausgang/notausgang.module.ts`

  DNA-42 requires: "Every authored source file in `apps/` and `packages/` that requires semantic scaffolding MUST carry exactly two Compass blocks: `MODULE_CONTRACT` (with `<purpose>` ≥ 10 words and ≥ 1 `<non-goals>` item) and `CHANGE_SUMMARY` (with ≥ 1 item)." These files are authored source files in `packages/` and must carry scaffolding. The existing barrel `index.ts` files they parallel all carry scaffolding.

- **DNA-1 (monorepo boundary)** — Pass. No cross-app imports.
- **DNA-6 (kebab-case)** — Pass. All new filenames use kebab-case.
- **DNA-51 (Werkstatt primitives)** — Pass. No mutation logic changed; only import structure.

### Axis C — Ecosystem fit

- **Package boundaries** — Pass. All imports flow `packages/* → packages/*` and `tools/* → packages/*`.
- **Deep export paths** — Pass. `package.json` exports maps in `@gogol/site-kernel` and `@gogol/site-kernel-handoff` correctly declare the new `-module` deep paths alongside the existing barrel paths.
- **Command lifecycle** — Pass. All 571 commands are registered in the manifest; no command metadata changed.
- **AGENTS.md updates** — Not applicable. The refactor is internal (import structure only); no new rules or patterns are introduced.
- **Compass sync** — Not applicable. No repository-wide requirements or shared package contracts changed.

### Axis D — Forward-only compliance

- **No compatibility shims** — Pass. The new `*.module.ts` files are the canonical lazy-loading entry points. The kernel config (`tools/kernel.config.ts`) is updated to use `-module` deep paths directly, not through a bridge.
- **Legacy barrels retained** — The original `index.ts` barrels are retained because they export types and utilities consumed by other packages. This is correct — they are not legacy code paths, they are the package's public API surface. The module files are a parallel entry point for the kernel runtime, not a replacement for the barrel.
- **No dual-paths** — Pass. The `moduleLoaders` in `kernel.config.ts` all point to the new `-module` deep paths. There is no fallback to the old barrel-based module loading.

### Axis E — Agent-facing clarity

- **Compass scaffolding** — FAIL (same as Axis B). The 9 new files have no `MODULE_CONTRACT` or `CHANGE_SUMMARY`. An agent navigating to these files has no semantic context about their purpose or non-goals.
- **No ungrounded assertions** — Pass. Dynamic import paths reference real files that exist in the workspace.
- **Readable by another agent** — Pass. Function names (`createHandoffModule`, `createSternsystemModule`, etc.) are clear. The pattern is consistent across all 9 new files.
- **Log-driven development** — Not applicable. No logging changes.

### Axis F — Pragmatism

- **Minimal command surface** — Pass. No new commands introduced.
- **Lean contracts** — Pass. No new types or interfaces; the `KernelModule` type is reused.
- **Existing patterns** — Pass. The dynamic-import-in-`register()` pattern follows the established convention from previously refactored modules (forge, site-kernel rfc, adr, etc.).
- **Scope discipline** — Pass. The diff touches only import structure and package.json export paths. No unrelated changes.

### Axis G — Blind spots

- **Performance** — Pass. The diff claims ~7x speedup for `rfc.list` (1187ms vs ~8s baseline). The manifest-driven fast path loads only the needed module. The `command.manifest.generate` command still takes ~112s because it must load all 24 modules — this is expected and unchanged.
- **Edge cases** — The `handoff.module.ts` initially had incorrect relative import paths (`../handoff-absorb.ts` instead of `./handoff-absorb.ts`), which was caught and fixed during the session. No remaining edge cases identified.
- **Concurrent execution** — Not applicable. Module loading is per-command-execution, not concurrent.
- **Migration path** — The original barrel `index.ts` files are retained, so any code that imports from the barrel (e.g., `createHandoffModule` from `@gogol/site-kernel-handoff/handoff`) still works. The kernel config uses the new `-module` paths. No migration needed for external consumers.

### Spec compliance

No spec available — the refactor was driven by a performance optimization request, not an RFC or PRD. Skipped.

### Questions for the author

1. Should the 9 new `*.module.ts` files carry Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42)? They are authored source files in `packages/` — the existing barrel `index.ts` files they parallel all carry scaffolding.
2. The checks module (`packages/os/site-kernel-checks/src/module.ts`) still eagerly imports `executeKernelCommand`, `appendStepTelemetry`, `loadPipelineBudgets`, `lookupExpectedDurationMs`, and all pipeline constants at the top level. Is this acceptable since the heaviest import (`ALL_COMMANDS`) is now lazy, or should the pipeline driver functions also be moved into a separate file that is dynamically imported?
3. The `handoff.pack` command has `writes: ["../handoff/{site}/**"]` — is this relative path correct for a workspace-rooted write glob, or should it be `handoff/{site}/**` (without the `../` prefix)?
