---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: unknown
verdict: needs-revision
diffRange: fc5652fab...HEAD
filesReviewed:
  - packages/share/src/astro/site-content-handlers.ts
  - packages/share/src/astro/content.ts
  - packages/share/src/content/merge.ts
  - packages/share/src/dev-props-validator.ts
  - packages/share/src/feature-policy.ts
  - packages/share/src/integration/index.ts
  - packages/share/src/integration/orchestration.ts
  - packages/share/package.json
  - packages/share/AGENTS.md
  - packages/os/site-kernel-checks/src/share-utility.ts
  - pnpm-lock.yaml
---

# Code Review: fc5652fab...HEAD — `@warpgogol/share` refactoring C1–C5

### Verdict: Needs revision

The diff successfully deepens five modules (registry dispatch, unified deep-merge, split integration barrel, sync feature-policy, ajv validator) with a net −694 lines and no public API breaks. Two Axis E failures (missing `CHANGE_SUMMARY` entries on two touched files) and one Axis A finding (`@ts-ignore` + `any` in the new handler module) require revision before merge.

### Mechanical floor

- `@warpgogol/share` tsc --noEmit: **pass**
- `@warpgogol/site-kernel-checks` tsc --noEmit: **pass**
- Pre-existing `workspace-write-boundary.test.ts` failures (2 tests) are in uncommitted changes from a separate session — not introduced by this diff.

### Axis A — Structural correctness

- **`@ts-ignore` + `any` in `site-content-handlers.ts:39–41`** — FAIL. The dynamic `getCollection(collectionName)` call uses `@ts-ignore` and casts entries to `any`. The `ContentSourceProvider` port likely has a typed `getCollection` overload or a `Record<string, unknown>` return. Replace `@ts-ignore` with a minimal typed wrapper or `as` cast to `Record<string, unknown>[]`.

  Evidence:

  ```ts
  // @ts-ignore - dynamic collection name
  const all = await getCollection(collectionName);
  _knownIds.set(collectionName, new Set(all.map((e: any) => e.id)));
  ```

- **`Record<string, any>` in `SiteContentContext` interface (`site-content-handlers.ts:56`)** — FAIL. The `labels` field is typed `Record<string, any> | undefined`. This propagates `any` to every handler. Type it as `Record<string, unknown> | undefined` — handlers already narrow with `as` where needed.

- **Minimalism** — PASS. The registry dispatch, unified `deepMerge`, and split barrel each reduce duplication without speculative abstraction.
- **Dead code** — PASS. No unreachable branches or unused exports detected.
- **Error handling** — PASS. `resolveSchema` swallows infrastructure errors with `console.warn` — documented as intentional in `MODULE_CONTRACT`.

### Axis B — DNA alignment

- **DNA-1** (monorepo boundary) — PASS. No `apps/* → apps/*` imports. `site-content-handlers.ts` imports from `@warpgogol/content-source/astro` (package boundary).
- **DNA-6** (kebab-case) — PASS. `site-content-handlers.ts`, `orchestration.ts` — all kebab-case.
- **DNA-42** (Compass markup) — PASS for new files. `site-content-handlers.ts` and `orchestration.ts` both carry `MODULE_CONTRACT` + `CHANGE_SUMMARY`.

### Axis C — Ecosystem fit

- **Package boundaries** — PASS. `@warpgogol/share` imports from `@warpgogol/content-source` and `@warpgogol/ontology` — correct direction.
- **AGENTS.md updates** — PASS. `packages/share/AGENTS.md` updated: table entries for `content`, `feature-policy`, `dev-props-validator`, `astro`, and Integration hub section now reference `orchestration.ts`.
- **Compass sync** — N/A. `docs/*.xml` are generated snapshots; regeneration is a separate command (`compass.inventory.generate`). Not a blocker for this diff.
- **Command lifecycle** — PASS. `deepMerge` added to `CANONICAL_EXPORTS` in `share-utility.ts`.

### Axis D — Forward-only compliance

- **`deepMergeEntryData` / `mergeComponentContent` thin wrappers** — PASS. These are not compatibility shims — they are the same function with a configured option. The old names are the public API; the unified `deepMerge` is the new internal implementation. No dual-path.
- **`resolveFeaturePolicySync` alias** — PASS. It is a true alias calling `resolveFeaturePolicy`, not a duplicate implementation. The public API name is preserved.
- **`integration/index.ts` → `orchestration.ts` split** — PASS. The barrel re-exports `orchestration.ts` transparently. No parallel import path.
- **ajv replacement** — PASS. The hand-rolled `validateShape` is fully deleted, not kept behind a flag.

### Axis E — Agent-facing clarity

- **Missing `CHANGE_SUMMARY` entry in `dev-props-validator.ts`** — FAIL. The file was substantially changed (hand-rolled validator replaced with `ajv`), but `CHANGE_SUMMARY` still reads only `RFC-0262: initial implementation.`. Add:

  ```
  <item>Replaced hand-rolled validateShape with ajv standard validator.</item>
  ```

- **Missing `CHANGE_SUMMARY` entry in `feature-policy.ts`** — FAIL. The function signature changed from `async` to sync and `resolveFeaturePolicySync` became an alias, but `CHANGE_SUMMARY` still reads only `RFC-0183: Initial runtime resolver...`. Add:

  ```
  <item>Removed false async from resolveFeaturePolicy; resolveFeaturePolicySync is now a thin alias.</item>
  ```

- **Compass scaffolding on new files** — PASS. `site-content-handlers.ts` and `orchestration.ts` both have `MODULE_CONTRACT` + `CHANGE_SUMMARY`.
- **`@ai-invariant` on `orchestration.ts`** — PASS. Lines 39–42 carry the closed-registry invariant.
- **No ungrounded assertions** — PASS. Comments reference real functions and files.

### Axis F — Pragmatism

- **Minimal command surface** — N/A. No new commands.
- **Lean contracts** — PASS. `DeepMergeOptions` has one field. `SiteContentHandler` type is minimal.
- **Existing patterns** — PASS. The registry dispatch follows the same pattern as `PLANET_IMPORT_PATHS` / `MOON_IMPORT_PATHS` registries.
- **Scope discipline** — PASS. C6–C8 were correctly skipped with documented rationale.

### Axis G — Blind spots

- **Performance** — PASS. `ajv.compile` is called per-validation; for dev-only use this is acceptable. The `schemaCache` already caches resolved schemas.
- **Edge cases** — PASS. `deepMerge` handles empty arrays, `undefined` override, non-record inputs. `resolveSiteContentData` warns on unknown component paths.
- **Migration path** — PASS. All public API names preserved; no consumer breakage.

### Spec compliance

No formal spec available — the refactoring candidates C1–C8 were identified in an architecture review session. C1–C5 implemented, C6–C8 skipped with rationale.

| Requirement | Status | Evidence |
| --- | --- | --- |
| C1: Registry dispatch | Done | `site-content-handlers.ts` — `SITE_CONTENT_HANDLERS` map |
| C2: Unified deep-merge | Done | `merge.ts` — `deepMerge()` with `DeepMergeOptions` |
| C3: Split integration barrel | Done | `index.ts` (37 lines) → `orchestration.ts` (410 lines) |
| C4: Remove sync/async duplication | Done | `resolveFeaturePolicy` is sync; `resolveFeaturePolicySync` is alias |
| C5: Replace hand-rolled validator | Done | `ajv` replaces `validateShape`; `ajv` added to `package.json` |
| C6: Remove re-export shims | Scope creep (skipped) | Correctly skipped — all are public API with consumers |
| C7: Split semantic barrel | Scope creep (skipped) | Correctly skipped — speculative, no demonstrated pain |
| C8: Consolidate micro-modules | Scope creep (skipped) | Correctly skipped — all have external consumers |
| Update AGENTS.md | Done | `packages/share/AGENTS.md` — table + integration hub section |
| Update canonical exports | Done | `share-utility.ts` — `deepMerge` added |

### Questions for the author

1. **`@ts-ignore` in `site-content-handlers.ts:39`** — can `getCollection` from `@warpgogol/content-source/astro` accept a typed `string` collection name without `@ts-ignore`? If the port's type is too narrow, should the port be widened rather than suppressed at the call site?
2. **`Record<string, any>` in `SiteContentContext.labels`** — why `any` instead of `unknown`? Every handler already narrows with optional chaining and `as` casts; `unknown` would force the same narrowing without leaking `any` into handler return types.
3. **`ajv.compile` per call** — `createDevPropsValidator` returns a closure that calls `ajv.compile(schema)` on every invocation. The `schemaCache` caches the _resolved_ schema, but `ajv.compile` still runs each time. Should the compiled validator be cached too (keyed by planet name)?
