---
reviewId: REVIEW-CODE-2026-08-09-01
date: 2026-08-09
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 753a666e...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/generated-files-validate.ts
  - packages/werkstatt-site/src/checks/public-surface/aggregate.ts
  - packages/werkstatt-site/src/codegen/templates/service/src/middleware/markdown-negotiation.ts.template
---

# Code Review: 753a666e...HEAD (3 files in packages/werkstatt-site)

### Verdict: Needs revision

Three findings: one behavioral change (dead `if` branch), one missing test coverage, and one missing CHANGE_SUMMARY entry. The fixes are correct in intent and the deployment pipeline passed, but the `resolveCacheClonePath` return type change from `string | null` to `string` leaves a dead branch that silently changes error behavior.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt-site build:check` (tsc --noEmit) exit 0.

### Axis A — Structural correctness

**A1 — Dead branch after `resolveCacheClonePath` return type change (Fowler: Dead Code).**
`resolveCacheClonePath` in `@warpgogol/werkstatt/sternsystem` returns `string` (always resolves a path, never `null`). The old local `resolveCacheClonePath` returned `string | null`. After the migration, the `if (cachePath)` guard at `generated-files-validate.ts:240` is always truthy — the `else` fall-through path (lines 254+) is now unreachable for the `systemId`-resolved case. This means: if the cache clone directory does not exist on disk, the validator now proceeds to check `join(cachePath, restAfterSystemId)` and reports a GEN-FILES-01 error ("file does not exist on disk") instead of the previous behavior of silently skipping. This is a **behavioral change**: previously a missing cache clone was silently skipped; now it produces a false-positive error because `resolveCacheClonePath` returns a path regardless of existence.

Evidence: `@/packages/werkstatt/src/sternsystem/registry-io.ts:43` — `export function resolveCacheClonePath(...): string`; `@/packages/werkstatt-site/src/checks/generated-files-validate.ts:238-240` — `const cachePath = allCacheClones.get(systemId) ?? resolveCacheClonePathSync(...); if (cachePath) {`.

### Axis B — DNA alignment

No issues. DNA-1 (monorepo boundary) — the diff correctly replaces `systems/registry.yaml` IO with convention-based discovery per RFC-0790. DNA-64 (engine/plugin boundary) — `werkstatt-site` (plugin) imports from `werkstatt` (engine) via the `@warpgogol/werkstatt/sternsystem` subpath export, which is the correct direction.

### Axis C — Ecosystem fit

No issues. Package boundaries are correct (plugin → engine). The new `routePaths` entries in `aggregate.ts` match the agent surface endpoints established by RFC-0783 and linked from `llms.txt` per RFC-0789. The `export default onRequest` addition to the middleware template follows the same pattern already used in `retired-tombstones.ts.template` and `language-redirect.ts.template`.

### Axis D — Forward-only compliance

No issues. The old `RegistryMirror`, `RegistrySystem`, `RegistryFile` interfaces and the local `resolveCacheClonePath` function are fully removed — no dual-path or compatibility shim. The `yaml` import (`parse as yamlParse`) is removed since it's no longer needed.

### Axis E — Agent-facing clarity

**E1 — Missing CHANGE_SUMMARY entry in `aggregate.ts`.**
The `routePaths.add` lines for RFC-0789 agent discovery routes at `@/packages/werkstatt-site/src/checks/public-surface/aggregate.ts:173-176` have an inline comment (`// RFC-0789: agent discovery surface files linked from llms.txt.`) but the file's `CHANGE_SUMMARY` block is not updated to record this change. The `generated-files-validate.ts` file correctly added a `CHANGE_SUMMARY` entry for RFC-0790 — `aggregate.ts` should follow the same pattern.

**E2 — Missing CHANGE_SUMMARY entry in `markdown-negotiation.ts.template`.**
The `export default onRequest` addition at `@/packages/werkstatt-site/src/codegen/templates/service/src/middleware/markdown-negotiation.ts.template:62` fixes a build error but the template's `CHANGE_SUMMARY` block (lines 16-19) is not updated to record the fix. The existing entries only mention RFC-0785 generation — a new entry should note the default export addition.

### Axis F — Pragmatism

No issues. All three changes are minimal and targeted:
- `generated-files-validate.ts`: 46 lines removed, 10 added — net simplification by delegating to shared `sternsystem` utilities.
- `aggregate.ts`: 4 lines added — minimum needed to register the 3 new routes.
- `markdown-negotiation.ts.template`: 2 lines added — `export default onRequest` is the standard Astro middleware export pattern.

### Axis G — Blind spots

**G1 — No test coverage for the `resolveCacheClonePathSync` behavioral change.**
The old `resolveCacheClonePath` returned `null` when `systems/registry.yaml` was missing or unreadable. The new `resolveCacheClonePathSync` always returns a path string. This changes the error behavior of `generated.files.validate` when the cache clone directory does not exist (see A1). There is no test verifying the new behavior — the `mission.validate` pipeline passed because the cache clone exists in the local environment, but CI or a fresh checkout without `systems-cache/` may produce false-positive GEN-FILES-01 errors.

### Spec compliance

No spec available — these are deployment fixes made during the RFC-0789 deployment pipeline. The fixes address three distinct errors encountered during `mission.validate` and `astro build`. Skipped.

### Questions for the author

1. Should `resolveCacheClonePathSync` check for directory existence and return `null` when the cache clone doesn't exist, restoring the original skip-on-missing behavior? Or should the validator explicitly check `existsSync(cachePath)` before proceeding to file checks?
2. Are there CI environments where `systems-cache/` is absent? If so, the behavioral change in A1 will produce false-positive GEN-FILES-01 errors on every run.
3. Should the `markdown-negotiation.ts.template` regeneration be triggered for existing sites, or is the manual edit to the workpiece sufficient until the next `routes.generate` run?
