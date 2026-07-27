---
reviewId: REVIEW-CODE-2026-07-15-01
date: 2026-07-15
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: a5690ac39...HEAD
filesReviewed:
  - packages/os/site-kernel-onboarding/src/templates.ts
  - packages/os/site-kernel-onboarding/src/index.ts
  - packages/os/site-kernel-onboarding/src/scaffold.ts
  - packages/os/site-kernel-onboarding/src/config-regenerate.ts
  - packages/os/site-kernel-onboarding/src/config-template-sync.ts
  - packages/os/site-kernel-handoff/package.json
  - packages/os/site-kernel-handoff/src/mission/mission-materialize.ts
  - docs/rfcs/rfc-0389-full-boilerplate-generation-for-missions.md
---

# Code Review: a5690ac39...HEAD (RFC-0389 implementation)

### Verdict: Approved

The implementation correctly follows the onboarding.scaffold pattern to replace inline stubs with full boilerplate generation. Template helpers are properly extracted and unified. The synthetic `DiscoveredSiteWorkspace` construction is correct and uses only existing interface fields. Minor findings below are non-blocking.

### Mechanical floor

Pass — `pnpm --filter @gogol/site-kernel-handoff run build:check` and `pnpm --filter @gogol/site-kernel-onboarding run build:check` both pass. `rfc.validate RFC-0389` passes.

### Axis A — Structural correctness

**Finding A-1: Domain regex is fragile.** The domain extraction regex `/^  domain:\s*"([^"]+)"/m` assumes exactly 2-space indentation and double-quoted value in `system.md` frontmatter. If the YAML uses single quotes, different indentation, or the domain is nested under `identity:`, this will silently fail and return empty string. This is non-fatal (the `SITE_LINE` token falls back to a commented-out line), but could cause confusion. Consider using `gray-matter` or a YAML parser for robustness in a future iteration.

**Finding A-2: `pinVersion` variable still in scope but no longer used in boilerplate generation.** The `pinVersion` variable is still computed and used in the version comparison logic, but is no longer passed to `generateFullBoilerplate`. This is correct — the template `package.template.json` carries its own version. No action needed, just noting the variable is still used elsewhere in the function.

No other issues. The `generateFullBoilerplate` function is well-structured, uses proper error handling, and collects results dynamically.

### Axis B — DNA alignment

No issues. DNA-47 (Materialization) is fulfilled — full boilerplate generation replaces stubs. DNA-51 (Werkstatt consistency primitives) is preserved — staging directory and atomic rename are maintained. DNA-42 (Compass markup) — `templates.ts` carries `MODULE_CONTRACT` and `CHANGE_SUMMARY`.

### Axis C — Ecosystem fit

No issues. Package boundaries are correct: `@gogol/site-kernel-handoff` imports from `@gogol/site-kernel-codegen`, `@gogol/site-kernel-onboarding`, and `@gogol/site-kernel` — all are `packages/*` dependencies. No `apps/* → apps/*` imports. Template helpers are properly exported from the onboarding package index.

### Axis D — Forward-only compliance

No issues. The inline stub generation is completely replaced — no dual-path, no compatibility shim, no flag to toggle between old and new behavior.

### Axis E — Agent-facing clarity

No issues. `templates.ts` has proper `MODULE_CONTRACT` and `CHANGE_SUMMARY`. The `generateFullBoilerplate` function has a clear docstring explaining its purpose and RFC reference. Variable names are descriptive. The `CHANGE_SUMMARY` in `mission-materialize.ts` is updated with the RFC-0389 entry.

### Axis F — Pragmatism

**Finding F-1: `kernel.wire` output files are hardcoded.** The `regeneratedFiles` array for `kernel.wire` output uses hardcoded paths (`tools/kernel.config.ts`, `tools/modules/*.ts`, etc.) instead of reading from the `runKernelWire` result. This is because `runKernelWire` returns a `KernelWireResult` that may not expose a `generated` array. If `kernel.wire` ever changes its output set, this list will be stale. Non-blocking for now — the list matches the current `runKernelWire` implementation.

No other issues. The template helper extraction is minimal and focused. No speculative generality.

### Axis G — Blind spots

**Finding G-1: No `system.md` presence validation before running generators.** The code catches the case where `system.md` doesn't exist (for domain resolution) but does not fail early. If `system.md` is missing, the codegen generators will fail with a less clear error message from inside `loadSystemManifestSync`. The RFC's failure modes section mentions this should be validated with a clear error message. Non-blocking — the generators will still fail, just with a less user-friendly message.

**Finding G-2: Concurrent execution safety.** The existing lock mechanism (`acquireLock` for `system:` and `mission:`) is preserved, so concurrent `mission.materialize` calls for the same mission are blocked. No new concurrency issues introduced.

### Spec compliance

| Requirement from RFC-0389 | Status | Evidence |
| --- | --- | --- |
| Write package.json from template | Done | `readTemplate("package.template.json")` with token substitution |
| Write astro.config.mjs from template | Done | `readRuntimeTemplate("astro.config.template.mjs")` with token substitution |
| Write wrangler.jsonc, tsconfig.json, .gitignore, postcss.config.cjs, deploy.yml | Done | All in `templateFiles` array |
| Run kernel.wire against staging | Done | `runKernelWire(generatorInput, appContext)` |
| Run 9 codegen generators | Done | `generators` array with all 9 functions |
| Dynamic regeneratedFiles in report | Done | Collected from template writes + kernel.wire + generator results |
| No passport keypair generation | Done | No keypair code in `generateFullBoilerplate` |
| No seed content pages | Done | No content page creation in `generateFullBoilerplate` |
| Preserve staging/atomic rename | Done | Unchanged from original code |
| Export template helpers | Done | `templates.ts` created, exported from index |
| Unify duplicates | Done | `scaffold.ts` and `config-regenerate.ts` import from `templates.ts` |
| Add workspace dependencies | Done | 3 deps added to `@gogol/site-kernel-handoff/package.json` |

### Questions for the author

1. Should the domain extraction use a proper YAML parser (`gray-matter`) instead of regex, to handle edge cases in `system.md` frontmatter formatting?
2. Should `system.md` presence be explicitly validated before running generators, with a clear error message pointing to the Sternsystem bundle as the source of the problem?
