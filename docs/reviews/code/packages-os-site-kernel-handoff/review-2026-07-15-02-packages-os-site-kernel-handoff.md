---
reviewId: REVIEW-CODE-2026-07-15-02
date: 2026-07-15
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: 89a3511e8...HEAD
filesReviewed:
  - packages/os/site-kernel-onboarding/src/templates.ts
  - packages/os/site-kernel-onboarding/src/index.ts
  - packages/os/site-kernel-onboarding/src/scaffold.ts
  - packages/os/site-kernel-onboarding/src/config-regenerate.ts
  - packages/os/site-kernel-onboarding/src/config-template-sync.ts
  - packages/os/site-kernel-handoff/package.json
  - packages/os/site-kernel-handoff/src/mission/mission-materialize.ts
  - docs/rfcs/rfc-0389-full-boilerplate-generation-for-missions.md
  - docs/plans/plan-rfc-0389-full-boilerplate-generation-for-missions.md
  - docs/audits/audit-rfc-0389-full-boilerplate-generation-for-missions.md
  - docs/reviews/code/packages-os-site-kernel-handoff/review-2026-07-15-01-packages-os-site-kernel-handoff.md
  - docs/rfcs/archive/implemented/rfc-0356-mission-materialization-from-pinned-sternsystem-bundles.md
---

# Code Review: 89a3511e8...HEAD (RFC-0389 full session — draft → implemented)

### Verdict: Approved

The session implements RFC-0389 end-to-end: audit, enhancement, planning, implementation (3 steps + 3 runtime fixes), review, and RFC stamping. The core change — replacing inline stub generation with full boilerplate generation via onboarding templates and codegen generators — is architecturally sound, follows the existing `onboarding.scaffold` pattern, and passes all mechanical checks. Three runtime fixes (undefined exitCode, unquoted domain, SITE_LINE alignment) were caught and fixed during live materialization testing. Minor findings below are non-blocking.

### Mechanical floor

- `pnpm --filter @gogol/site-kernel-handoff run build:check` — Pass
- `pnpm --filter @gogol/site-kernel-onboarding run build:check` — Pass
- `pnpm exec site-kernel run rfc.validate RFC-0389 --json` — Pass
- `pnpm exec site-kernel run mission.materialize --mission webgogol-com-m000003 --json` — Pass (37 files, 0 errors, 5s)

### Axis A — Structural correctness

**Finding A-1: Domain extraction via regex is fragile (non-blocking).** The regex `/^  domain:\s*"?([^"\s]+)"?/m` at `mission-materialize.ts:104` assumes 2-space indentation and a top-level `domain:` key in the YAML frontmatter. It works for the current `system.md` format but would fail if:

- The domain is nested under `identity:` (e.g. `identity:\n  domain: ...` becomes `identity:\n    domain: ...` with 4-space indent)
- The YAML uses single quotes (`domain: 'webgogol.com'`)
- The frontmatter uses CRLF line endings (the `^` anchor with `/m` flag handles `\r` correctly in JS, but the `---\n` delimiter at line 102 does not handle `\r\n`)

This is acceptable for now — the Sternsystem `system.md` format is controlled and the fallback (empty domain) is graceful. A future iteration should use `gray-matter` or a YAML parser.

**Finding A-2: `kernel.wire` output files are hardcoded (non-blocking).** Lines 172-178 hardcode 7 `tools/` file paths instead of reading from `runKernelWire` result. The `KernelWireResult` does expose a `generated` array, but the current code doesn't use it. If `kernel.wire` ever changes its output set, this list will be stale. Non-blocking because the list matches the current implementation exactly.

**Finding A-3: Bare `catch` block at line 109.** The `catch` block silently swallows all errors from `readFileSync` and regex matching with only a comment. While the fallback (empty domain) is intentional, logging a warning would help debugging if `system.md` exists but is malformed.

No other issues. The `generateFullBoilerplate` function is well-structured: sequential steps, clear comments, proper error propagation for generator failures, dynamic file collection.

### Axis B — DNA alignment

No issues.

- **DNA-42** (Compass markup): `templates.ts` carries `MODULE_CONTRACT` and `CHANGE_SUMMARY`. `mission-materialize.ts` `CHANGE_SUMMARY` updated with RFC-0389 entry.
- **DNA-47** (Materialization): Full boilerplate generation replaces stubs — Werkstück now has all required runtime files.
- **DNA-51** (Werkstatt primitives): Staging directory and atomic rename mechanism preserved unchanged. Lock acquisition unchanged.

### Axis C — Ecosystem fit

No issues.

- Package boundaries: `@gogol/site-kernel-handoff` imports from `@gogol/site-kernel`, `@gogol/site-kernel-codegen`, `@gogol/site-kernel-onboarding` — all `packages/*` dependencies. No `apps/* → apps/*` or cross-service imports.
- Template helper extraction is clean: `templates.ts` is the single source of truth, `scaffold.ts` and `config-regenerate.ts` import from it, duplicates removed.
- Package exports: `@gogol/site-kernel-onboarding` properly exports `readTemplate`, `readRuntimeTemplate`, `applyTokens`, `TEMPLATES_DIR`, `RUNTIME_TEMPLATES_DIR` from `index.ts`.
- Dependencies: `@gogol/site-kernel-handoff/package.json` correctly declares 3 new workspace dependencies.

### Axis D — Forward-only compliance

No issues. The inline stub generation is completely replaced — no dual-path, no compatibility shim, no flag to toggle between old and new behavior. The old stub code (`pkgJson` object, `astroConfig` string) is deleted, not maintained behind a flag.

### Axis E — Agent-facing clarity

No issues.

- `templates.ts` has proper `MODULE_CONTRACT` with purpose and non-goals.
- `generateFullBoilerplate` has a clear docstring referencing RFC-0389 and explaining the pattern.
- Variable names are descriptive: `stagingDir`, `systemId`, `regeneratedFiles`, `templateFiles`, `generators`.
- Step comments (Step 1-4) make the function easy to follow.
- The `CHANGE_SUMMARY` in `mission-materialize.ts` references both RFC-0356 (original) and RFC-0389 (this change).

### Axis F — Pragmatism

**Finding F-1: `generatorInput` flags use `domain` which may be empty string.** At line 161, `flags: { app: systemId, domain }` passes `domain: ""` when no domain is found. The `public.infrastructure.generate` generator uses this flag and would fail with "missing domain" — but this is the correct behavior (fail fast on missing domain). The code is pragmatic: it doesn't add speculative fallback logic for a case that should fail.

No other issues. Template helper extraction is minimal — 33 lines, no speculative generality. The `generateFullBoilerplate` function is focused and doesn't over-abstract.

### Axis G — Blind spots

**Finding G-1: No `system.md` presence validation before running generators (non-blocking).** The code catches missing `system.md` for domain extraction (lines 99-111) but doesn't fail early. If `system.md` is missing, the codegen generators will fail with a less clear error from inside `loadSystemManifestSync`. The RFC's failure modes section mentions this should be validated with a clear error message. Recommendation: add an explicit check after the domain extraction block:

```typescript
if (!existsSync(systemMdPath)) {
  throw new Error(`[mission.materialize] system.md not found in staging directory — Sternsystem data set is incomplete`);
}
```

**Finding G-2: Concurrent execution safety preserved.** The existing lock mechanism (`acquireLock` for `system:` and `mission:`) is unchanged. No new concurrency issues introduced.

**Finding G-3: Performance.** The materialization took 5 seconds for webgogol-com (7 templates + kernel.wire + 9 generators). This is within the RFC's 3-8 second estimate. No performance concerns.

### Spec compliance

| Requirement from RFC-0389 | Status | Evidence |
| --- | --- | --- |
| Write package.json from template | Done | `readTemplate("package.template.json")` with token substitution |
| Write astro.config.mjs from template | Done | `readRuntimeTemplate("astro.config.template.mjs")` with SITE_LINE aligned to scaffold.ts |
| Write wrangler.jsonc, tsconfig.json, .gitignore, postcss.config.cjs, deploy.yml | Done | All in `templateFiles` array (7 files) |
| Run kernel.wire against staging | Done | `runKernelWire(generatorInput, appContext)` |
| Run 9 codegen generators | Done | `generators` array with all 9 functions in scaffold order |
| Dynamic regeneratedFiles in report | Done | Collected from template writes + kernel.wire + generator results |
| No passport keypair generation | Done | No keypair code in `generateFullBoilerplate` |
| No seed content pages | Done | No content page creation |
| Preserve staging/atomic rename | Done | Unchanged from original code |
| Export template helpers | Done | `templates.ts` created, exported from index |
| Unify duplicates | Done | `scaffold.ts`, `config-regenerate.ts`, `config-template-sync.ts` all import from `templates.ts` |
| Add workspace dependencies | Done | 3 deps added to `@gogol/site-kernel-handoff/package.json` |
| rfc.validate passes | Done | Verified |
| mission.materialize succeeds | Done | Verified with webgogol-com-m000003 (37 files, 0 errors) |

### Questions for the author

1. Should the domain extraction use `gray-matter` (already a dependency of `@gogol/site-kernel-content`) instead of regex, to handle edge cases in `system.md` frontmatter formatting? This would require adding `gray-matter` to `@gogol/site-kernel-handoff` dependencies or re-exporting a parser from an existing package.
2. Should `system.md` presence be explicitly validated before running generators, with a clear error message pointing to the Sternsystem bundle as the source of the problem? (Finding G-1)
3. Should the `kernel.wire` output files be read from the `KernelWireResult.generated` array instead of being hardcoded? (Finding A-2)
