---
id: ADR-0015
title: "Enable Turbo cache for site-specific builds with declared inputs"
status: accepted
scope: package
decider: architecture
createdAt: 2026-08-01
updatedAt: 2026-08-01
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0585
  - RFC-0635
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0015: Enable Turbo cache for site-specific builds with declared inputs

## Context

`turbo.json` declares `cache: false` for all site-specific build tasks (`warpgogol-com#build`, `nicaragua-projekt#build`, `check-warpgogol-com#build`, and their `build:check` variants). This means Turbo never caches build outputs — every `turbo build` invocation runs the full build pipeline from scratch, even when no inputs have changed.

Site build scripts (e.g., `missions/warpgogol-com-m000024/workpiece/package.json:15`) run:

```
site-kernel pipeline build.prepare --site warpgogol-com && pnpm -s astro:check && astro build && site-kernel pipeline build.post --site warpgogol-com
```

The `cache: false` was likely set because `build.prepare` generates files that Turbo cannot predict from source inputs alone. However, these generated files are a deterministic function of the site's content files and platform packages. If Turbo's `inputs` declaration captures all source files that influence the build, the generated files don't need to be inputs — they're derived from the same sources.

## Decision

Remove `cache: false` from site-specific build tasks in `turbo.json` and declare explicit `inputs` that cover all source files influencing the build output.

- `inputs` include: `src/content/**`, `src/pages/**`, `src/styles/**`, `src/scripts/**`, `public/**`, `src/system.md`, `astro.config.*`, `tsconfig.json`, `package.json`, `tools/kernel.config.ts`
- Platform package sources are covered by the `^build` dependency — Turbo hashes upstream package outputs automatically
- `outputs` remain `["dist/**", ".astro/**"]` (unchanged)

## Justification

- **Generated files are deterministic:** `build.prepare` produces generated files from content + platform packages. If content hasn't changed (same hash), generated files are identical. Turbo's input hashing captures the source files; generated files are a derived artifact.
- **`^build` covers platform changes:** When any `packages/*` dependency changes, Turbo detects it via the `^build` task dependency and invalidates the cache.
- **Experiment-first approach:** Before merging, run a validation experiment: enable turbo cache, run `turbo build` twice, compare `dist/` byte-for-byte. If outputs differ, the inputs declaration is incomplete and the ADR is rejected.
- **Alternatives considered:** Caching only `build:check` (less benefit, `build:check` is fast), incremental mtime-based caching (still invalidates on any change), keeping `cache: false` (no benefit).

## Consequences

- **Positive:** Repeated `turbo build` invocations with unchanged inputs complete in seconds (cache hit) instead of 3-4 minutes. CI pipelines benefit when multiple jobs build the same site.
- **Positive:** Turbo's remote cache (if configured) shares build artifacts across machines.
- **Negative:** Risk of false cache hits if `inputs` is incomplete — a source file that influences the build but isn't listed in `inputs` would not invalidate the cache. Mitigated by the experiment-first validation and conservative `inputs` declaration.
- **Negative:** Turbo cache storage grows — `dist/` and `.astro/` are cached per input hash. Mitigated by Turbo's automatic cache eviction.
- **Technical debt:** If new source file types are added to the build pipeline (e.g., a new `src/templates/**` directory), `inputs` must be updated. This is a maintenance burden but low risk — missing inputs cause false cache hits, which are detectable via the experiment.

## Evolution

- **Validation gate:** This ADR is accepted only after a successful experiment: `turbo build` twice with identical `dist/` output. If the experiment fails, the ADR is rejected and `cache: false` is restored.
- **Monitoring:** Watch for CI failures where build output doesn't match expected state. If false cache hits are detected, add the missing source to `inputs` or restore `cache: false` for the affected task.
- **Revisit when:** New site workspaces are added — each new `<site>#build` task in `turbo.json` must declare `inputs` instead of `cache: false`.
- **RFC-0635 interaction:** If RFC-0635 (distribution reuse in `mission.validate`) is implemented, Turbo cache and distribution reuse coexist — Turbo caches the `turbo build` task, while distribution reuse caches the `mission.validate` build cycle. They operate at different layers.
