---
reviewId: REVIEW-CODE-2026-07-26-03
date: 2026-07-26
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: ea391b347...HEAD
filesReviewed:
  - packages/forge/src/onboarding/create.ts
  - packages/forge/os/core/core.module.ts
  - packages/forge/bin/cli.ts
  - packages/forge/src/types.ts
  - packages/forge/src/onboarding/init.ts
  - packages/forge/src/onboarding/scaffold-project.ts
  - packages/forge/profiles/forge-shell.yaml
  - packages/forge/src/tests/create.test.ts
  - packages/forge/AGENTS.md
  - packages/forge/README.md
---

# Code Review: ea391b347...HEAD (RFC-0544 forge.create implementation)

### Verdict: Approved

Clean implementation that follows existing forge command patterns. The `forgeRoot` addition to `ForgeRuntimeContext` is a well-justified additive change that solves the composition problem without modifying `forge.init` or `forge.scaffold` contracts. All 239 tests pass, typecheck passes. Two minor findings on axis A and F — neither blocks.

### Mechanical floor

Pass — `pnpm --filter @wgogol/forge run build:check` exits 0. `pnpm --filter @wgogol/forge run test` — 239 tests pass (25 files).

### Axis A — Structural correctness

**Minor finding — double cast on `runInit` return.** `create.ts:150` casts the `runInit` return value via `as unknown as { status: string; created: string[]; errors: string[] }` because `InitResult` is not exported from `init.ts`. This is a pre-existing pattern (`runInit` types its context as `unknown`), but exporting `InitResult` would eliminate the cast and improve type safety.

No other issues. No `any` types, no magic numbers, no dead code, no swallowed errors (the post-processing `catch` is documented as best-effort with a comment).

### Axis B — DNA alignment

No issues.

- **DNA-6** (kebab-case): All new filenames are kebab-case (`create.ts`, `create.test.ts`, `forge-shell.yaml`) ✓
- **DNA-42** (Compass markup): `create.ts` and `create.test.ts` both carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks ✓
- **DNA-54** (Forge bindings): No skill bodies modified — no hardcoded literals introduced ✓

### Axis C — Ecosystem fit

No issues.

- **Package boundaries**: All imports in `create.ts` are within `packages/forge/src/` — no cross-package or kernel imports ✓
- **Command lifecycle**: `forge.create` registered in `forgeCoreModule`, AGENTS.md command list updated, shipped profiles list updated ✓
- **Import rules**: `src/` has no `@gogol/*` imports ✓

### Axis D — Forward-only compliance

No issues.

- `forge.create` is a new command — no legacy paths, no compatibility shims ✓
- `forgeRoot` on `ForgeRuntimeContext` is additive (optional field) — existing callers are unaffected ✓
- `init.ts` and `scaffold-project.ts` changes check `context.forgeRoot` first, then fall back to `resolveForgeRoot` — no dual paths ✓

### Axis E — Agent-facing clarity

No issues.

- `create.ts` has `MODULE_CONTRACT` with clear `<purpose>` and `<non-goals>` ✓
- `CHANGE_SUMMARY` references RFC-0544 ✓
- Variable names are self-documenting (`targetDir`, `childContext`, `filesCreated`, `passNextSteps`, `failNextSteps`) ✓
- No ungrounded assertions ✓

### Axis F — Pragmatism

**Minor finding — `nextSteps` redundancy in `createWrapper`.** `core.module.ts:283-296` re-derives `nextSteps` from `result.data?.status` and overrides them via `{ ...result, nextSteps }`, but `runCreate` already populates `nextSteps` on all return paths. This is consistent with the `initWrapper` and `scaffoldWrapper` patterns, so it's a pre-existing convention rather than a new issue. The wrapper could simply return `result` directly since `nextSteps` are already set.

`forge.create` earns its existence — it composes scaffold+init+post-processing into one command, which is a genuinely new workflow (the RFC explains why `forge.init` cannot be overloaded with directory creation).

### Axis G — Blind spots

No issues.

- **Performance**: `forge-shell` profile has no install commands — default path is fast. Heavier profiles inherit `forge.scaffold`'s 60s timeout ✓
- **Edge cases**: empty directory, non-empty directory, invalid name, missing name — all handled with explicit error messages ✓
- **Migration path**: N/A — new command, no existing consumers to migrate ✓

### Spec compliance

| Requirement from RFC-0544 | Status | Evidence |
| --- | --- | --- |
| `forge.create` registered in `forgeCoreModule` | Done | `core.module.ts:296-314` |
| Accepts `<name>`, `--profile`, `--package-manager` | Done | `create.ts:46-49` reads positional arg + flags |
| Creates dir with `forge.yaml`, skills, docs dirs | Done | `create.test.ts` test 1 passes |
| `forge.yaml` has non-null forge-CLI bindings + `syncedVersion` | Done | `create.test.ts` tests 7-8 pass |
| Default profile is `forge-shell` | Done | `create.ts:48` defaults to `forge-shell` |
| Non-empty target refused with exit 1 | Done | `create.test.ts` test 2 passes |
| `nextSteps` + IDE recommendation in pretty and `--json` | Done | `create.ts` all return paths + `cli.ts:277` |
| Unit tests cover creation, refusal, default, delegation | Done | 10 test cases, all passing |
| README documents `forge create` as first command | Done | `README.md` Quick start section |
| `rfc.validate` passes | Done | Zero RFC-0544-specific errors |

### Questions for the author

1. Should `InitResult` be exported from `init.ts` to eliminate the `as unknown as` double cast in `create.ts:150`? This would improve type safety but changes the module's export surface.
2. The `createWrapper` in `core.module.ts` re-derives `nextSteps` that `runCreate` already sets — should the wrapper just return `result` directly, or is the explicit re-derivation preferred for consistency with `initWrapper`/`scaffoldWrapper`?
