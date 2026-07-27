---
reviewId: REVIEW-CODE-2026-07-13-03
date: 2026-07-13
reviewer:
  skill: wg-review
  model: unknown
verdict: needs-revision
diffRange: 5e9b2c048...e44a8d846
filesReviewed:
  - packages/surface/src/module-context.ts
  - packages/surface/src/governance/index.ts
  - packages/os/site-kernel-checks/src/pseo-product.ts
  - packages/os/site-kernel-checks/src/pseo-module-context.ts
  - packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts
  - packages/os/site-kernel-checks/src/diagnostics/rules/content-surface.ts
  - docs/rfcs/archive/implemented/rfc-0277-govern-pseo-as-managed-visibility-program-with-proof-gates.md
---

# Code Review: 5e9b2c048...e44a8d846 (RFC-0277 implementation)

### Verdict: Needs revision

The diff implements the RFC-0277 command surface and schema fields correctly, but `pseo.experiment.plan` reads experiments from `surface.experiments` while the RFC specifies `pseoExperiments` as the YAML key — the command will always emit zero experiments in practice. Additionally, `pseo.product.validate` uses an overly broad Notausgang regex that matches any "export" mention, and PSEO-CTX-09/10 validation rules fire on all surface modules rather than PSEO-specific ones.

### Mechanical floor

Pass — `@warpgogol/surface` and `@warpgogol/site-kernel-checks` `build:check` (tsc --noEmit) pass. `rfc.validate RFC-0277` passes with 0 violations.

### Axis A — Structural correctness

- **FAIL — `readdir` imported inside function body.** `collectMdFiles` at `pseo-product.ts:138` does `const { readdir } = await import("node:fs/promises")` inside the function, while `readFile` is already imported at the top from the same module. `readdir` should be imported at the top alongside `readFile`.
- **PASS — Strict typing.** The `ExperimentConfig` interface uses `unknown[]` for `clusters`, which is acceptable for a passthrough shape. The `SystemMd`/`SystemMdSurface` local interfaces follow the same casting pattern used in `pseo-module-context.ts:49`.
- **PASS — Error handling.** `readFile` at line 163 uses `.catch(() => "")` to handle missing files gracefully. The empty-content guard at line 164 skips unreadable files.

### Axis B — DNA alignment

- **PASS — DNA-1 (monorepo boundary).** All imports flow `packages/os → packages/*`, no `apps/*` imports.
- **PASS — DNA-6 (kebab-case).** `pseo-product.ts` is kebab-case.
- **PASS — DNA-42 (Compass markup).** `pseo-product.ts` carries `MODULE_CONTRACT` and `CHANGE_SUMMARY`. `module-context.ts` CHANGE_SUMMARY updated with RFC-0277 item.

### Axis C — Ecosystem fit

- **FAIL — Command manifest not regenerated.** The RFC-0277 commit adds two new commands but does not regenerate `docs/command-manifest.generated.yaml`. The manifest was regenerated in a later commit (`4f5367569`), but the RFC-0277 commit itself should have included it. Per root AGENTS.md: "When workspace topology, root pipelines, or command surfaces change, update the generator/registries first, then run `ecosystem.manifest.generate`."
- **PASS — Package boundaries.** `pseo-product.ts` imports from `@warpgogol/site-kernel`, `@warpgogol/site-kernel-content`, and local helpers only.
- **PASS — Command lifecycle.** Both commands registered in `09b-build-artifacts-part2.ts` with correct scope, flags, and descriptions.

### Axis D — Forward-only compliance

- **PASS — No compatibility shims.** The `stage` and `urlPolicy` fields are optional in the Zod schema (`pseoStageSchema.optional()`) but enforced as required by PSEO-CTX-09/10 validation rules. This is the correct forward-only pattern: accept the new fields in the schema, then validate their presence in the check command. Existing sites without these fields will get errors and must add them.

### Axis E — Agent-facing clarity

- **PASS — Compass scaffolding.** `pseo-product.ts` has `MODULE_CONTRACT` with purpose and non-goals, `CHANGE_SUMMARY` with RFC-0277 item.
- **PASS — No ungrounded assertions.** All imports reference real modules and functions.
- **PASS — Readable names.** `runPseoExperimentPlan`, `runPseoProductValidate`, `collectOfferAndPricingFiles`, `FORBIDDEN_PROMISE_PATTERNS` are self-documenting.

### Axis F — Pragmatism

- **FAIL — PSEO-CTX-09/10 fire on all surface modules.** The `stage` and `urlPolicy` checks at `pseo-module-context.ts:173-191` are inside the `for (const module of moduleList)` loop, which iterates over ALL surface modules, not just PSEO modules. The RFC title is "Govern PSEO as managed visibility program" — `stage` and `urlPolicy` are PSEO-specific lifecycle concepts. A future site with a non-PSEO surface module (e.g., a `blog` module) would be forced to declare PSEO stage and URL policy. These rules should be scoped to modules whose `entitlement` is `pseo` or whose `id` matches a PSEO module pattern.
- **PASS — Minimal command surface.** `pseo.experiment.plan` and `pseo.product.validate` are distinct commands with distinct purposes, as specified by the RFC.
- **PASS — Existing patterns.** The result builders (`diagnosticsResult`, `passResult`) and the `loadSurfaceModuleContexts` / `loadSystemManifest` patterns are reused from existing code.

### Axis G — Blind spots

- **FAIL — `pseo.experiment.plan` reads wrong YAML key.** The RFC (line 125) specifies `pseoExperiments:` as a top-level key in system.md, but the code at `pseo-product.ts:87` reads `surface.experiments`. No `pseoExperiments` key exists anywhere in the codebase. The command will always emit zero experiments unless someone adds `surface.experiments` to system.md, which contradicts the RFC spec. This is a spec compliance gap, not just a blind spot.
- **PASS — False positives (PSEO-PROD-01).** The 8 forbidden-promise regex patterns are specific enough (German + English, specific keyword combinations). False-positive risk is low.
- **FAIL — False negatives (PSEO-PROD-02).** The `NOTAUSGANG_PSEO_PATTERNS` regex at `pseo-product.ts:47` is `/notausgang|export|emergency\s+export/i`. The bare `export` alternative matches any mention of "export" in any context (e.g., "export data", "export settings"), causing the Notausgang check to pass even when the export statement doesn't cover PSEO records specifically. The pattern should require "Notausgang" or "export" near PSEO-related terms.
- **PASS — Edge cases.** If `src/content/business/` and `src/content/pages/` don't exist, `collectOfferAndPricingFiles` returns an empty array and `passResult` is returned with "0 file(s) scanned". Correct behavior for new/empty sites.
- **PASS — Windows path handling.** `relPath` at `pseo-product.ts:165` uses `app.directory + "\\"` then normalizes with `.replace(/\\/g, "/")`. Windows-only per AGENTS.md, and the normalization produces forward-slash paths for diagnostics.

### Spec compliance

| Requirement from RFC-0277 | Status | Evidence |
| --- | --- | --- |
| PSEO stages defined in module/product context | Done | `pseoStageSchema` with 3 stages, `stage` field in `surfaceModuleContextSchema` |
| URL non-destruction policy declared and validated | Done | `urlPolicySchema` with `nonDestruction`, PSEO-CTX-10 rule |
| `pseo.experiment.plan` registered | Done | Registered in `09b-build-artifacts-part2.ts:171-183` |
| `pseo.proof.validate` registered | Done | Pre-existing, registered in same table |
| `pseo.product.validate` registered | Done | Registered in `09b-build-artifacts-part2.ts:185-193` |
| Customer-facing copy cannot describe index budget, guaranteed indexation, rankings, or leads | Done | PSEO-PROD-01 with 8 regex patterns covering DE + EN |
| Proof validation consumes observability data or reports "not enough data" | Done | Pre-existing `pseo.proof.validate` implementation |
| PSEO records included in Notausgang/export policy | Partial | PSEO-PROD-02 checks for Notausgang/export mention but regex is too broad — matches any "export" word, not PSEO-specific export statements |
| Experiment plan reads `pseoExperiments` from system.md | Missing | Code reads `surface.experiments` instead of `pseoExperiments` — key mismatch with RFC spec |
| `rfc.validate` passes | Done | Verified, 0 violations |

### Questions for the author

1. The RFC specifies `pseoExperiments:` as the YAML key for experiment config, but `pseo.experiment.plan` reads `surface.experiments`. Was this intentional (renaming the key during implementation), or should the code read `pseoExperiments` from the top-level manifest?
2. PSEO-CTX-09 and PSEO-CTX-10 fire on all surface modules, not just PSEO modules. Should these rules be scoped to modules with `entitlement: pseo`, or is it intentional that every surface module must declare a PSEO stage and URL policy?
3. The `NOTAUSGANG_PSEO_PATTERNS` regex matches any "export" mention. Should it be tightened to require "Notausgang" or "export" near PSEO-related terms (e.g., `/notausgang|pseo.*export|export.*pseo/i`)?
4. `collectMdFiles` imports `readdir` via dynamic `import()` inside the function body while `readFile` is a static top-level import from the same module. Should `readdir` be moved to the top-level import?
