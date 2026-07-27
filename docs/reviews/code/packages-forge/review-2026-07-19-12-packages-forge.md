---
reviewId: REVIEW-CODE-2026-07-19-01
date: 2026-07-19
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: 90bf370bb^...HEAD
filesReviewed:
  - packages/forge/src/config/forge-config.ts
  - packages/forge/src/onboarding/init.ts
  - packages/forge/src/onboarding/agents-generate.ts
  - packages/forge/src/onboarding/doctor.ts
  - packages/forge/src/index.ts
  - packages/forge/os/core/core.module.ts
  - packages/forge/os/rfc/index.ts
  - packages/forge/package.json
  - packages/forge/src/tests/forge-config.test.ts
  - packages/forge/src/tests/doctor-autonomy.test.ts
  - packages/os/site-kernel/src/adr/handlers/validate.ts
  - packages/os/site-kernel/src/cache/rfc-cache.ts
  - packages/os/site-kernel/src/index.ts
  - packages/os/site-kernel/src/tests/rfc-acceptance.test.ts
  - packages/os/site-kernel/src/tests/rfc-create.test.ts
  - packages/os/site-kernel/src/tests/rfc-validate.test.ts
  - packages/os/site-kernel/package.json
  - AGENTS.md
  - packages/forge/AGENTS.md
  - forge.yaml
---

# Code Review: 90bf370bb^...HEAD (RFC-0391 implementation)

### Verdict: Approved

The implementation is clean, forward-only, and well-aligned with the forge autonomy goals. All new files carry Compass scaffolding, the duplicated `src/rfc/` tree is fully deleted with all imports redirected in one commit, and the autonomy guard is correctly scoped to import specifiers only. One minor finding on the `init.ts` require() pattern and one observation on the doctor scan scope.

### Mechanical floor

Pass — `@warpgogol/forge` build:check, `@warpgogol/site-kernel` build:check, and forge vitest (75 tests) all pass.

### Axis A — Structural correctness

- **Minor — `init.ts` line 50**: `loadForgeConfig` is imported at the top via ES module import but also referenced through a `require()` call in a catch block. The `require` is not used in the final version (the top-level import is used instead). This is dead code from an earlier draft — the `require` path is unreachable since `loadForgeConfig` is already imported. No functional impact, but should be cleaned up.
- No `any` types, no magic numbers, no dead code (besides the above), error handling is contextual with fix hints.

### Axis B — DNA alignment

- **DNA-1 (monorepo boundary)**: No `apps/*` imports. `@warpgogol/forge` is a `packages/*` workspace package. ✅
- **DNA-2 (pnpm workspace)**: `@warpgogol/forge` added as `workspace:*` dependency to `@warpgogol/site-kernel`. ✅
- **DNA-42 (Compass markup)**: All 3 new source files (`forge-config.ts`, `agents-generate.ts`, tests) carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`. ✅
- No DNA violations found.

### Axis C — Ecosystem fit

- **Package boundaries**: `@warpgogol/site-kernel` now imports from `@warpgogol/forge/os/rfc` — this is correct since forge owns RFC governance (RFC-0374). The dependency direction is site-kernel → forge, which is the intended inversion. ✅
- **AGENTS.md updates**: Both root and `packages/forge/AGENTS.md` updated with `forge.yaml` documentation and `forge.agents.generate` command. ✅
- **Command lifecycle**: `forge.agents.generate` registered in `forgeCoreModule` with correct metadata. ✅
- **Compass sync**: No `docs/*.xml` updates needed — `forge.yaml` is a project config file, not a workspace technology entry (confirmed during audit). ✅

### Axis D — Forward-only compliance

- The duplicated `packages/os/site-kernel/src/rfc/` tree is fully deleted in one commit with all 7 import sites redirected in the same commit. No transitional re-exports, no compatibility shims. ✅
- `forge.init` is reworked in-place, not parallel-maintained. ✅
- No dual code paths anywhere in the diff.

### Axis E — Agent-facing clarity

- All new files carry `MODULE_CONTRACT` with `<purpose>` and `<non-goals>`. ✅
- `CHANGE_SUMMARY` entries reference RFC-0391. ✅
- Error messages include fix hints ("Run 'forge init' to create project configuration"). ✅
- No ungrounded assertions — all referenced functions and types exist. ✅
- The `agents-generate.ts` non-goal says "Do not read or modify forge.yaml — only read it via loadForgeConfig" which is slightly misleading (it does read forge.yaml via `loadForgeConfig`), but the intent is clear: don't read it directly. Minor wording issue, not a failure.

### Axis F — Pragmatism

- `forge.agents.generate` earns its existence — it's a distinct concern from `forge.init` (regeneration vs initial deployment). ✅
- `ForgeConfig` interface is minimal — no speculative fields. The `bindings` passthrough is correctly reserved for RFC-0393. ✅
- The `resolveForgeRoot` function is the single place that decides monorepo vs npm layout — no duplicated path logic. ✅
- Scope is tight — no unrelated changes.

### Axis G — Blind spots

- **Performance**: `scanForForbiddenImports` recursively scans `packages/forge/src/` and `os/` directories. Cost is trivial (~30 .ts files). ✅
- **False positives**: The regex `FORBIDDEN_IMPORT_PATTERN` correctly matches `import ... from "@warpgogol/..."` and `require("@warpgogol/...")` specifiers only, not comment text. Test fixture confirms comment-only mentions are ignored. ✅
- **Edge cases**: `resolveForgeRoot` throws with a clear error listing both checked paths. `loadForgeConfig` handles missing file, invalid YAML, and schema violations separately. ✅
- **Doctor scan scope**: The scan skips `tests/` directories. This means test files with `@warpgogol/*` imports won't be flagged. This is intentional — tests may legitimately import from kernel packages for integration testing. ✅

### Spec compliance

| Requirement from RFC-0391 | Status | Evidence |
| --- | --- | --- |
| `forge-config.ts` exports ForgeConfig, zod schema, loadForgeConfig, resolveForgeRoot | Done | `packages/forge/src/config/forge-config.ts` |
| `forge.agents.generate` registered, produces marker-carrying AGENTS.md | Done | `packages/forge/os/core/core.module.ts:176-185`, `agents-generate.ts:85-89` |
| `forge.init` creates forge.yaml, uses resolveForgeRoot, never overwrites | Done | `init.ts:44-75`, idempotent checks throughout |
| `forge.doctor` fails on @warpgogol/* imports, passes on current tree | Done | `doctor.ts:45-76`, test confirms 0 violations on clean tree |
| `forge.yaml` at Warpgogol root | Done | `forge.yaml` |
| `packages/os/site-kernel/src/rfc/` deleted, imports redirected | Done | 7 import sites redirected, 20 files deleted |
| Unit tests for config and doctor guard | Done | 11 tests across 2 test files |
| Root AGENTS.md documents forge.yaml | Done | `AGENTS.md:21-27` |

### Questions for the author

1. The `init.ts` catch block on line 50 references `loadForgeConfig` via a `require()` call, but `loadForgeConfig` is already imported at the top. Is this dead code from an earlier draft that should be removed?
2. The `agents-generate.ts` non-goal says "Do not read or modify forge.yaml — only read it via loadForgeConfig" — should this be reworded to "Do not read forge.yaml directly — use loadForgeConfig" for clarity?
