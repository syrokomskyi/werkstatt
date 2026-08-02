---
rfcId: RFC-0653
auditId: AUDIT-RFC-0653-01
date: 2026-08-02
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0653

## Verdict: Needs revision

RFC proposes three caching optimizations for `leitstand.dev-deploy`. The design is structurally sound and well-grounded in RFC-0390, but F-C1 is a correctness issue: the `reads` glob for `preview.images.generate` points to the wrong directory (`site-families/` instead of `biomes/`), which would cause stale preview images on biome palette changes.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

No issues. All required sections contain real content. Decision is present tense. CLI surface, TypeScript contracts, file system responsibilities, output format, failure modes, rollout, alternatives (5 real ones), risks, acceptance criteria, and implementation notes are all populated and checkable.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-49]` is correct — DNA-49 defines `leitstand.dev-deploy` as building from source and running the Axiom gate. The RFC optimizes the build phase without changing this contract. The "Architectural fit" section explains the relationship explicitly.

## Axis C — Ecosystem fit

**F-C1 (correctness): `preview.images.generate` `reads` glob is wrong.**

The RFC proposes `reads: ["packages/ontology/site-families/**/*.yaml"]` for `preview.images.generate`. However, the implementation at `@/packages/os/site-kernel-checks/src/preview-images.ts:169-186` reads biome palette from `packages/ontology/biomes/${biomeId}.yaml`, not `packages/ontology/site-families/**/*.yaml`. The correct glob is `packages/ontology/biomes/**/*.yaml`.

Impact: with the wrong glob, changes to biome palette YAML files would NOT invalidate the RFC-0390 cache, leading to stale preview images (old colors) after a biome palette edit. This is a false cache hit — the most dangerous failure mode of the caching mechanism.

## Axis D — Forward-only compliance

No issues. `print.pdf.generate` changes its output directory directly (no parallel path). `print.pdf.copy` is a new command, not a compatibility shim. `--force-build` is an escape hatch, not a legacy path. No backward compatibility layers.

## Axis E — Agent-facing policy

No issues. RFC is `draft`, no self-authorizing language. Implementation notes are explicit behavioral rules with escape hatches (`--force`, `--force-build`). No content authoring in acceptance criteria. No storage policy concerns.

## Axis F — Pragmatism

**F-F1: `.gitignore` entries not in file system responsibilities.**

The RFC states `missions/<missionId>/.dev-deploy-build-cache.json` is "(gitignored, ephemeral)" and `.cache/pdf/` "persists between builds", but neither path appears in the file system responsibilities table. The implementation needs to add these to `.gitignore` (monorepo root for `missions/`, workpiece `.gitignore` for `.cache/`). The RFC should list `.gitignore` updates explicitly so agents don't miss them.

`print.pdf.copy` earns its existence — it's the necessary bridge between `.cache/pdf/` and `dist/client/_print/` since `astro build` wipes `dist/`. Scope discipline is correct: `appsImpacted: []` for an all-sites optimization, `packagesImpacted` lists the two affected packages.

## Axis G — Blind spots

No issues. Performance costs are specified (~10-30s preview, ~120s PDF, ~1s copy). Failure modes cover cache hit with missing files for all three optimizations. Edge cases (first run, stale `dist/`, non-deterministic HTML) are addressed. The interaction between build-skip and pipeline caching is sound: if build is skipped, `build.post` doesn't run, and `dist/` from the previous build (including PDFs and preview images) is used as-is.

## Questions for the author

1. Should `print.pdf.generate` be registered in `GENERATOR_OWNERSHIP_MAP`? Currently it's not registered (unlike `preview.images.generate` which has entries for `public/og-image.png` and `public/preview/{lang}/{slug}.png`). If `ownership.sync.validate` or `generated.stale.validate` scan `dist/`, the new `.cache/pdf/` and `dist/client/_print/` paths may need ownership entries.
2. Using `<app>/dist/client/**/*.html` (build artifacts) as `reads` for RFC-0390 cache is a novel pattern — all existing cacheable commands use source files as `reads`. Is there a risk that the cache key becomes unstable across different build environments (e.g., different Node versions producing slightly different HTML)?
3. The `--force-build` flag bypasses the build-skip cache, but does NOT bypass the RFC-0390 pipeline cache for `preview.images.generate` and `print.pdf.generate`. If a user wants a fully fresh build, do they need to pass both `--force-build` AND `--force` (on the pipeline)? Should the RFC document this interaction?
