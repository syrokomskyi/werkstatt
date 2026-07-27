---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: da112793d^...afbe0ab7e
filesReviewed:
  - packages/star-map/src/types.ts
  - packages/star-map/src/render.ts
  - packages/star-map/src/layout.ts
  - packages/star-map/src/index.ts
  - packages/star-map/README.md
  - packages/star-map/AGENTS.md
  - packages/passport/src/emit.ts
  - packages/os/site-kernel-checks/src/passport.ts
---

# Code Review: star-map architecture fix (da112793d...afbe0ab7e)

### Verdict: Needs revision

The refactor successfully deepens `renderStarMap` behind `StarMapInput`, removes phantom `theme`, dead RNG, and aligns the return type with documentation. However, one ungrounded assertion in `render.ts` violates Axis E, and the `as unknown as` type cast in the site-kernel-checks consumer masks a real type incompatibility that should be addressed.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/star-map build:check` and `pnpm --filter @warpgogol/site-kernel-check-warpgogol build` both succeed with zero errors.

### Axis A — Structural correctness

- **Type-unsafe cast in consumer** — `packages/os/site-kernel-checks/src/passport.ts:257` uses `manifest as unknown as Parameters<typeof manifestToStarMapInput>[0]` to bridge `SystemManifest` from `@warpgogol/site-kernel-content` (structurally different) to `@warpgogol/ontology/schemas`. This cast silences the compiler but masks potential field incompatibilities (e.g. `sharedContext.requiredPageIds` optionality mismatch that already caused a build failure in this session). The `passport/emit.ts` consumer has the same pattern at line 113. Both casts are pre-existing, but the diff moves and reuses them without fixing the root cause: the two `SystemManifest` types should be unified or the adapter should accept a structural subset.

- **Unused `zod` dependency** — `packages/star-map/package.json:26` lists `"zod": "^4.4.3"` in `dependencies`, but no file in `packages/star-map/src/` imports `zod` directly. `SystemManifest` is imported as a type-only import from `@warpgogol/ontology/schemas`, which itself depends on `zod`. The dependency is technically transitive and could be removed or moved to `devDependencies`. Pre-existing, not introduced by this diff.

- **Hardcoded hex colors in SVG** — `NODE_COLORS` (`#6366f1`, `#f59e0b`, `#10b981`, `#94a3b8`), `svgEdge` (`#334155`), and the background rect (`#0f172a`) use raw hex values. DNA-10 forbids hardcoded tokens in CSS, but this is SVG attribute generation, not CSS — technically not a violation. Still, the colors are magic numbers that could be named constants with a comment explaining the palette choice.

### Axis B — DNA alignment

- **DNA-1** (monorepo boundary) — Pass. All imports flow `packages/* → packages/*`.
- **DNA-6** (kebab-case) — Pass. No new filenames introduced.
- **DNA-23** (cosmic naming) — N/A. No new manifests or cosmic names.
- **DNA-32** (Star Map as SSG-rendered SVG) — Pass. The deterministic SVG contract is maintained; output is still byte-stable for identical inputs.
- **DNA-42** (Compass markup) — Pass. `MODULE_CONTRACT` and `CHANGE_SUMMARY` present in all modified `.ts` files.

### Axis C — Ecosystem fit

- **Package boundaries** — Pass. `@warpgogol/passport` and `@warpgogol/site-kernel-checks` both import from `@warpgogol/star-map/render` (package → package).
- **AGENTS.md / README.md** — Pass. Both updated with `manifestToStarMapInput` and `emitStarMap` in the entry-point table and usage examples.
- **Compass sync** — N/A. This is a package-internal refactor; no repository-wide contracts, `docs/*.xml`, or app-package relationships changed.
- **Export map** — Pass. `package.json` `exports` already maps `./render` → `src/render.ts`; new exports are accessible.

### Axis D — Forward-only compliance

- Pass. `StarMapOptions`, `BiomeId`, and the old `renderStarMap(manifest, registry, options): string` signature are removed, not kept behind a flag. No compatibility shims or dual-paths. The `theme` parameter is deleted, not deprecated.

### Axis E — Agent-facing clarity

- **FAIL: Ungrounded assertion** — `packages/star-map/src/render.ts:22` states `Verified by snapshot test`, but no snapshot test exists. The `testSignal` in `package.json:34` is `"skipped"` with rationale `"direct package tests are deferred until SVG fixture snapshots are added."` This is a direct contradiction: the comment claims verification that does not exist. An agent reading this comment would trust the determinism contract is tested when it is not.

- **Type cast reduces agent readability** — The `as unknown as Parameters<typeof manifestToStarMapInput>[0]` pattern in `passport.ts:257` is opaque to agents. An agent cannot determine which fields are actually compatible without manually comparing the two `SystemManifest` interfaces.

- **CHANGE_SUMMARY** — Pass. All modified files have updated `<CHANGE_SUMMARY>` blocks describing the architecture review changes.

### Axis F — Pragmatism

- **`emitStarMap`** — Pass. Both consumers needed the same `renderStarMap → mkdir → writeFile` sequence; collapsing into one helper is justified.
- **`manifestToStarMapInput`** — Pass. The adapter is the seam between manifest traversal and the resolved hierarchy; it earns its existence.
- **`StarMapInput` interface** — Pass. Minimal fields (`appId`, `constellation`, `depth`, `stars`, `width?`, `height?`); no speculative generality.
- **Scope discipline** — Pass. The diff touches only `star-map` package and its two consumers; no scope creep.

### Axis G — Blind spots

- **No tests for `hash` or determinism** — The `StarMapOutput.hash` field is computed via SHA-256 but never validated by any test. If SVG generation changes, the hash would change silently. The `testSignal` defers tests to `"2026-10-01"`. This is acceptable per the package's current contract, but the `render.ts:22` comment should not claim verification that doesn't exist.

- **`--depth=4` in site-kernel-checks is non-functional for moons** — `passport.ts:258` passes `{}` as the registry, meaning `resolveMoons` will always return `[]` because `Object.values({})` is empty. The `--depth=4` flag in the check command produces a graph with stars and planets but no moons. This is pre-existing (the old code also passed `{}`), but the new adapter makes the empty-registry path more visible. The check command should either load the real registry or document that `--depth=4` only adds moon _edges_ when a registry is available.

- **Empty state** — If `manifest.pages` is empty, `stars` is `[]`, and the SVG contains only the constellation node. This is handled correctly — no crash, valid SVG output.

### Spec compliance

| Requirement from the architecture review | Status | Evidence |
| --- | --- | --- |
| Candidate 1: Deepen `renderStarMap` behind `StarMapInput` | Done | `render.ts:212` — `renderStarMap(input: StarMapInput): StarMapOutput` |
| Candidate 2: Remove phantom `theme` | Done | `StarMapOptions` and `BiomeId` deleted from `types.ts`; both consumers updated |
| Candidate 3: Remove dead RNG | Done | `mulberry32`, `strToSeed`, `_rng` removed from `layout.ts`; determinism contract updated |
| Candidate 4: Collapse render-to-file duplication | Done | `emitStarMap(input, outPath)` in `render.ts:267`; both consumers use it |
| Candidate 5: Align with `{ svg, hash }` return | Done | `renderStarMap` returns `StarMapOutput { svg, hash }` at `render.ts:256` |
| Update README/AGENTS | Done | Both files updated with `manifestToStarMapInput` and `emitStarMap` |
| Green build | Done | `pnpm build` — 41/41 tasks successful |

### Questions for the author

1. The comment at `render.ts:22` says "Verified by snapshot test" but no test exists and `testSignal` is `"skipped"`. Should the comment be corrected to reflect reality, or should a snapshot test be added before merging?
2. The `as unknown as Parameters<typeof manifestToStarMapInput>[0]` cast in `passport.ts:257` masks a structural mismatch between two `SystemManifest` types. Should the adapter accept a structural subset interface instead of the full `SystemManifest` from `@warpgogol/ontology/schemas`, eliminating the cast?
3. The `--depth=4` flag in `site-kernel-checks/passport.ts` passes `{}` as the registry, making moon resolution a no-op. Should the check command load the real `uni.registry.json`, or should the flag be documented as depth-3-only for the check path?
