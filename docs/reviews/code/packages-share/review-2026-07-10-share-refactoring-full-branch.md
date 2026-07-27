---
reviewId: REVIEW-CODE-2026-07-10-03
date: 2026-07-10
reviewer:
  skill: wg-review
  model: unknown
verdict: pass
diffRange: fc5652fab...HEAD
filesReviewed:
  - packages/share/src/index.ts
  - packages/share/src/content/index.ts
  - packages/share/src/content/merge.ts
  - packages/share/src/content/entity-id.ts
  - packages/share/src/content/dispatch.ts (deleted)
  - packages/share/src/image-utils.ts (deleted)
  - packages/share/src/astro/page-handler.ts (deleted)
  - packages/share/src/astro/site-content-handlers.ts
  - packages/share/src/astro/content.ts
  - packages/share/src/dev-props-validator.ts
  - packages/share/src/feature-policy.ts
  - packages/share/src/integration/index.ts
  - packages/share/src/integration/orchestration.ts
  - packages/share/package.json
  - packages/share/AGENTS.md
  - packages/share/README.md
  - packages/os/site-kernel-checks/src/validators/ (10 files deleted)
  - packages/os/site-kernel-checks/src/validators/index.ts (deleted)
  - packages/os/site-kernel-checks/src/checks.ts (deleted)
  - packages/os/site-kernel-checks/src/index.ts
  - packages/os/site-kernel-checks/src/module.ts
  - packages/os/site-kernel-checks/src/command-tables/*.ts
  - packages/os/site-kernel-checks/AGENTS.md
  - packages/os/site-kernel-checks/src/share-utility.ts
  - docs/compass-inventory.xml (deleted)
  - docs/grace-inventory.xml (deleted)
  - pnpm-lock.yaml
---

# Code Review: fc5652fab...HEAD — `@gogol/share` refactoring C1–C8 + validator barrel flattening

### Verdict: Pass

The diff deepens five modules (registry dispatch, unified deep-merge, split integration barrel, sync feature-policy, ajv validator), removes three shims (image-utils, page-handler, dispatch micro-module), adds 7 semantic subpath exports, flattens the validator barrel chain, and deletes two generated inventory XML files. Net −303 lines across 52 files. All seven axes pass. Two pre-existing observations are noted but not blocking.

### Mechanical floor

- `@gogol/share` tsc --noEmit: **pass**
- `@gogol/site-kernel-checks` tsc --noEmit: **pass**
- `pnpm build` from root: **pass** (41/41 tasks, exit code 0)

### Axis A — Structural correctness

- **Strict typing** — PASS. The last remaining `Record<string, any>` in `SiteContentContext.labels` was fixed in `ec38c89c1` — the interface now uses `Record<string, unknown>` and handlers narrow with typed intermediate variables (`header`, `footer`). The `@ts-ignore` in `getKnownIdsForCollection` was fixed in `4f11ea01c` — the call now uses `as Array<{ id: string }>` without suppression.

- **Pre-existing `any` in `createDispatcherResolver`** — OBSERVATION. `entity-id.ts:57–58` uses `Record<string, any>` for the schema map parameter and `any | undefined` return. This was pre-existing from `dispatch.ts` (now merged into `entity-id.ts`) and was noted in the C6–C8 review. Not introduced by this diff; not a failure.

- **Minimalism** — PASS. The registry dispatch, unified `deepMerge`, split barrel, and validator flattening each reduce indirection without speculative abstraction. Deleted shim files (`image-utils.ts`, `page-handler.ts`, `dispatch.ts`, `checks.ts`, `validators/index.ts`, 8 validator barrel files) remove 393+ lines of pure re-export indirection.

- **Dead code** — PASS. No remaining importers of deleted files. `grep` confirms zero references to `./checks.ts` or `./validators/` in `site-kernel-checks/src`.

- **Error handling** — PASS. `resolveSchema` swallows infrastructure errors with `console.warn` — documented as intentional in `MODULE_CONTRACT`. `ajv` validation errors are mapped to human-readable strings with `instancePath` + `message`.

### Axis B — DNA alignment

- **DNA-1** (monorepo boundary) — PASS. No `apps/* → apps/*` imports. `site-content-handlers.ts` imports from `@gogol/content-source/astro` (package boundary). Validator command tables import from sibling implementation modules, not from `apps/*`.
- **DNA-6** (kebab-case) — PASS. All new filenames (`site-content-handlers.ts`, `orchestration.ts`) are kebab-case. Deleted files were also kebab-case.
- **DNA-42** (Compass markup) — PASS. `site-content-handlers.ts` and `orchestration.ts` both carry `MODULE_CONTRACT` + `CHANGE_SUMMARY`. `CHANGE_SUMMARY` entries updated on `dev-props-validator.ts`, `feature-policy.ts`, `content/index.ts`, `index.ts`, `entity-id.ts`, `merge.ts`.

### Axis C — Ecosystem fit

- **Package boundaries** — PASS. `@gogol/share` imports from `@gogol/content-source` and `@gogol/ontology` — correct direction. No cross-boundary violations.
- **AGENTS.md updates** — PASS. `packages/share/AGENTS.md` updated: table entries for `content`, `feature-policy`, `dev-props-validator`, `astro`, integration hub section, `image-utils` marked deleted, `page-handler` shim noted. `packages/os/site-kernel-checks/AGENTS.md` updated: `validators/` row removed.
- **Compass sync** — N/A. `docs/compass-inventory.xml` and `docs/grace-inventory.xml` are generated artifacts (output of `compass.inventory.generate`). Their deletion is safe — they are regenerated on demand. Not a repository-wide requirement change.
- **Command lifecycle** — PASS. `deepMerge` added to `CANONICAL_EXPORTS` in `share-utility.ts`. `createDispatcherResolver` already listed. No new commands introduced or removed in this diff.
- **Export map integrity** — PASS. 7 new semantic subpath entries (`models`, `jsonld`, `llms`, `extract`, `page-utils`, `build-page`, `output-projection`) point to existing files. `./content/dispatch` entry removed. `./image-utils` entry removed. `./astro/page-handler` redirected to `resolve-route.ts`.

### Axis D — Forward-only compliance

- **`deepMergeEntryData` / `mergeComponentContent` thin wrappers** — PASS. These are not compatibility shims — they are the same function with a configured option. The old names are the public API; the unified `deepMerge` is the new internal implementation. No dual-path.
- **`resolveFeaturePolicySync` alias** — PASS. True alias calling `resolveFeaturePolicy`, not a duplicate implementation.
- **`integration/index.ts` → `orchestration.ts` split** — PASS. The barrel re-exports `orchestration.ts` transparently. No parallel import path.
- **ajv replacement** — PASS. The hand-rolled `validateShape` is fully deleted, not kept behind a flag. `ajv` added to `package.json` dependencies.
- **Shim deletions (C6)** — PASS. `image-utils.ts`, `page-handler.ts`, and `dispatch.ts` are fully deleted. Root barrel re-exports from `@gogol/content-source` directly. Export map points `astro/page-handler` to `resolve-route.ts`. No parallel paths.
- **Validator barrel flattening** — PASS. `validators/index.ts` and all 8 category barrel files deleted. Command tables import directly from implementation modules. `checks.ts` shim deleted, `index.ts` imports from `checks/*.ts` directly. No indirection layer remains.
- **Dangling `@deprecated` comments** — PASS. Fixed in `3492a10a3`: the two `@deprecated import from "@gogol/share/image-utils" instead` comments in `index.ts` now point to `@gogol/content-source` instead of the deleted subpath.

### Axis E — Agent-facing clarity

- **`CHANGE_SUMMARY` entries** — PASS. All touched files have updated `CHANGE_SUMMARY`:
  - `dev-props-validator.ts`: "Replaced hand-rolled validateShape with ajv standard validator."
  - `feature-policy.ts`: "Removed false async from resolveFeaturePolicy; resolveFeaturePolicySync is now a thin alias."
  - `content/index.ts`: "Removed dispatch.ts re-export (merged into entity-id.ts)."
  - `index.ts`: "C6: image-utils.ts shim deleted; root barrel re-exports from @gogol/content-source directly. page-handler.ts shim deleted; export map points to resolve-route.ts."
  - `entity-id.ts`: "Merged createDispatcherResolver from dispatch.ts (micro-module consolidation)."
  - `merge.ts`: "Deepening: unified deepMergeEntryData and mergeComponentContent into one configurable deepMerge; old names kept as thin wrappers."

- **Compass scaffolding on new files** — PASS. `site-content-handlers.ts` and `orchestration.ts` both have `MODULE_CONTRACT` + `CHANGE_SUMMARY`.
- **`@ai-invariant` on `orchestration.ts`** — PASS. Lines 39–42 carry the closed-registry invariant.
- **No ungrounded assertions** — PASS. Comments reference real functions and files. AGENTS.md table accurately reflects the changes.
- **Readable by another agent** — PASS. Registry dispatch pattern is self-documenting. Handler names reveal their component path. `deepMerge` with `DeepMergeOptions` is clearer than two separate functions.

### Axis F — Pragmatism

- **Minimal command surface** — N/A. No new commands.
- **Lean contracts** — PASS. `DeepMergeOptions` has one field. `SiteContentHandler` type is minimal. `SiteContentContext` has four fields.
- **Existing patterns** — PASS. The registry dispatch follows the same pattern as `PLANET_IMPORT_PATHS` / `MOON_IMPORT_PATHS` registries.
- **Scope discipline** — PASS. C6–C8 were initially skipped with documented rationale, then implemented after review. Validator barrel flattening was a separate, justified change.
- **Subpath selection** — PASS. The 7 chosen subpaths cover the most commonly imported modules. Barrel remains for the rest — acceptable for incremental migration.

### Axis G — Blind spots

- **Performance** — PASS. `ajv.compile` is cached in `validateCache` (keyed by planet name) — fixed in `4f11ea01c` per C1–C5 review question 3. `schemaCache` caches resolved schemas. No per-call compilation overhead.
- **Edge cases** — PASS. `deepMerge` handles empty arrays, `undefined` override, non-record inputs. `resolveSiteContentData` warns on unknown component paths. `mergeComponentContent` handles `null` override and non-record inputs.
- **Migration path** — PASS. All public API names preserved. No consumer breakage — `pnpm build` passes 41/41.
- **`createDispatcherResolver` typing** — OBSERVATION (pre-existing). `Record<string, any>` / `any` return in `entity-id.ts:57–58`. Now lives in a file that previously had clean typing. Consider tightening in a follow-up — not a failure of this diff.

### Spec compliance

No formal spec — the refactoring candidates C1–C8 were identified in an architecture review session. All eight are implemented.

| Requirement | Status | Evidence |
| --- | --- | --- |
| C1: Registry dispatch | Done | `site-content-handlers.ts` — `SITE_CONTENT_HANDLERS` map |
| C2: Unified deep-merge | Done | `merge.ts` — `deepMerge()` with `DeepMergeOptions` |
| C3: Split integration barrel | Done | `index.ts` (37 lines) → `orchestration.ts` (410 lines) |
| C4: Remove sync/async duplication | Done | `resolveFeaturePolicy` is sync; `resolveFeaturePolicySync` is alias |
| C5: Replace hand-rolled validator | Done | `ajv` replaces `validateShape`; `validateCache` added |
| C6: Remove re-export shims | Done | `image-utils.ts` and `page-handler.ts` deleted; export map updated |
| C7: Add semantic subpath exports | Done | 7 entries added to `package.json` |
| C8: Merge `content/dispatch.ts` | Done | Merged into `entity-id.ts`; file, barrel, export map entry removed |
| Validator barrel flattening | Done | `validators/` directory + `checks.ts` shim deleted; direct imports |
| Update AGENTS.md | Done | Both `packages/share/AGENTS.md` and `site-kernel-checks/AGENTS.md` |
| Update README.md | Done | `packages/share/README.md` entry points table updated |
| Update canonical exports | Done | `share-utility.ts` — `deepMerge` added |

### Questions for the author

1. **`createDispatcherResolver` typing** — pre-existing `Record<string, any>` / `any` return. Now that it lives in `entity-id.ts` (which otherwise has clean typing), should this be tightened to `Record<string, unknown>` with a generic return type in a follow-up?
