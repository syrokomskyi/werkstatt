---
rfcId: RFC-0375
auditId: AUDIT-RFC-0375-01
date: 2026-07-12
auditor:
  skill: wg-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0375

## Verdict: Needs revision

The RFC introduces a well-designed two-category generated-file detection system, but it was drafted before RFC-0376 (JSON→YAML migration, status: accepted) and extensively references `.generated.json` files and `buildGeneratedJsonAdvisory()` that RFC-0376 removes. It also omits several generators that write to `public/` from both the marker-removal list and `GENERATOR_OWNERSHIP_MAP`, leaving them in a detection gap.

## Mechanical validation (rfc.validate)

Pass — 2 V-19 warnings (RFC-0081 and RFC-0336 `amendedBy` not yet synced). Expected for a draft RFC.

## Axis A — Structural completeness

No issues. All required sections contain real content. Decision is present tense ("Extend the generated-file governance…"). CLI surface shows exact `pnpm exec werkstatt run` invocations with flags. TypeScript contracts are minimal type signatures. File system responsibilities table names concrete paths. Output format documents `--json` shapes. Failure modes specifies exit codes. Rollout describes adoption path. Alternatives are honest with rejection reasons. Risks includes agent misinterpretation. Acceptance criteria are checkable. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues. `satisfies: []` is empty — the RFC does not declare a new DNA invariant, which is correct: it amends the existing RFC-0081/RFC-0336 governance protocol rather than establishing a new invariant. The RFC does not conflict with any existing DNA invariant.

## Axis C — Ecosystem fit

**FAIL — RFC-0376 (accepted) conflict.** RFC-0376 migrates all `.generated.json` to `.generated.yaml` and removes `buildGeneratedJsonAdvisory()` from `generated-marker.ts`. RFC-0375 extensively references the pre-RFC-0376 world:

- Line 64 `successSignals`: `*.generated.json` → should be `*.generated.yaml`
- Line 95: `command.manifest.generated.json` → `.generated.yaml` (RFC-0376 line 351)
- Line 97: `*.generated.json` → `*.generated.yaml`
- Line 142: "`buildGeneratedJsonAdvisory` remains for `*.generated.json` files" → RFC-0376 line 426 removes this function entirely
- Line 276: `command.manifest.generated.json` `writes` globs → `.generated.yaml`
- Lines 312–314: `src/image-variants.generated.json`, `src/video-manifest.generated.json`, `src/live-video-manifest.generated.json` → all `.generated.yaml` per RFC-0376
- Line 321: `docs/command-manifest.generated.json` → `.generated.yaml`
- Line 328: `src/entitlements.generated.json` → already `.generated.yaml` in the live codebase (`generator-ownership.ts:94`)
- Line 460: `buildGeneratedJsonAdvisory()` (JSON) → removed by RFC-0376

The `related[]` list does not include RFC-0376, but RFC-0376 line 36 lists RFC-0375 in its `related[]`. This is a bidirectional reference gap.

**FAIL — Missing generators from the marker-removal list.** The RFC lists generators that must stop emitting markers into `public/**` files (lines 289–306), but omits several generators that write to `public/`:

- `agent.manifest.generate` → `public/.well-known/agent.json` (`command-tables/29-agent-surface.ts:58`)
- `agent.openapi.generate` → `public/.well-known/agent.openapi.json` (`command-tables/29-agent-surface.ts:78`)
- `agent.knowledge.generate` → `public/api/agent/v1/*.json` (`command-tables/29-agent-surface.ts:29`)
- `surface.generate` → `public/.well-known/pseo-manifest.json`, `public/**/*.md` (`command-tables/09b-build-artifacts-part2.ts:57-60`)
- `surface.starmap.generate` → `public/.well-known/pseo-star-map.svg` (`command-tables/09b-build-artifacts-part2.ts:103`)
- `feed.generate` → also writes `public/feed.json` (JSON Feed, `command-tables/09b-build-artifacts-part2.ts:361`)
- `warpgogol.check.hints.generate` → `public/.well-known/warpgogol-check.json` (`command-tables/30-check-warpgogol.ts:184`)
- `passport.key.rotate` → `public/.well-known/cosmic-passport-key.json` (`command-tables/06-growth-passport.ts:140`)

Some of these may not currently emit markers (e.g. JSON files using `buildGeneratedJsonAdvisory` field-based markers rather than `buildGeneratedHeader` comment markers). The RFC should explicitly address each: either list them as "no change needed (already no comment marker)" or add them to the removal list.

**FAIL — Missing generators from `GENERATOR_OWNERSHIP_MAP`.** The RFC proposes adding `markerPolicy` and `module` to `OwnershipEntry`, but many generators that write to `public/` are not registered in `GENERATOR_OWNERSHIP_MAP` at all (`generator-ownership.ts:42-154`):

- `preview.images.generate` (`public/og-image.png`)
- `image.variants.generate` (`public/_img/**/*.webp`)
- `video.variants.generate` (`public/_video/**`)
- `live.variants.generate` (`public/_video/**`)
- `surface.generate` (`public/.well-known/pseo-manifest.json`)
- `bordbuch.generate` (`public/.well-known/bordbuch.json`, `public/.well-known/bordbuch/index.html`)
- `agent.manifest.generate` (`public/.well-known/agent.json`)
- `agent.openapi.generate` (`public/.well-known/agent.openapi.json`)
- `agent.knowledge.generate` (`public/api/agent/v1/*.json`)
- `cms.schema.generate` (`public/admin/index.html`, `public/admin/config.yml`)
- `warpgogol.check.hints.generate` (`public/.well-known/warpgogol-check.json`)
- `passport.key.rotate` (`public/.well-known/cosmic-passport-key.json`)

Without registration, `generated.file.lookup` will report these files as non-generated, and `generated.edit.guard` will not protect them. The RFC's rollout step 1 says "Update all `public/**` entries in `GENERATOR_OWNERSHIP_MAP`" but doesn't acknowledge that many entries are missing entirely.

**Compass sync not addressed.** The RFC changes repository-wide generated-file governance but does not identify which `docs/*.xml` files need synchronization (root AGENTS.md Compass document duties). `docs/source-markup.xml` and `docs/technology.xml` may reference `.generated.json` or the marker protocol.

## Axis D — Forward-only compliance

No issues. The RFC is forward-only: markers are removed from public files without a transition period, `generated.marker.validate` is scoped (not parallelized), and no backward compatibility layer is proposed.

Minor: Line 433 says `stripMarker` function in `semantic-parity.ts` is "kept for backward compatibility but becomes identity." This is a minor dead-code artifact — forward-only would remove it. Not a structural issue, but the implementation should delete the function rather than keep it as a no-op.

## Axis E — Agent-facing policy

No issues. The RFC does not contain self-authorizing language. "Agents MAY implement code changes ONLY when this RFC has status `accepted`" is correct.

Minor: Implementation notes (lines 453–462) reference RFC-0375 but don't reference RFC-0224 (accepted→implemented transition), RFC-0330 (verification evidence for probe-bearing RFCs), or RFC-0334 (supersede escalation on invariant conflict). Since this RFC has acceptance probes, RFC-0330 is relevant for verification evidence emission.

## Axis F — Pragmatism

No issues. Two new commands each earn their existence: `generated.file.lookup` is an agent-facing query (no existing equivalent), `generated.files.validate` is a batch existence check (distinct from `generated.marker.validate` which checks marker presence). The `OwnershipEntry` extension is minimal — two optional fields. `nonGoals` are explicit and meaningful.

## Axis G — Blind spots

**Performance not specified for `generated.files.validate`.** The command checks existence of all registry-declared files. With glob-based entries like `public/_img/**/*.webp` (RFC-0204: 57 variants for one app), this could be hundreds of files across all apps. The RFC should specify how glob patterns are expanded and estimate the cost.

**Transition state for partially-migrated public files.** The RFC says markers are removed "as each generator is next run" (line 73). But `generated.marker.validate` will be scoped to Category A only. Public files that still have markers because their generator hasn't been run yet will be in a transition state: they carry a marker (Category A behavior) but are registered as `markerPolicy: "registry-only"` (Category B). The validator will skip them, but the marker will still be visible to external consumers. The RFC should specify whether `generated.marker.validate` should also flag Category B files that still carry a stale marker (a "GEN-MARK-STALE-01" rule).

**False positives for binary file regeneration.** Binary generated files (e.g. `public/og-image.png`) are regenerated by deletion + re-running the generator (RFC-0150). `generated.edit.guard` will see the file as "changed" but the owner module may not have changed (the generator reads the same content). The RFC should clarify whether deletion + regeneration triggers `GEN-EDIT-01` and how to suppress it.

## Questions for the author

1. RFC-0376 (accepted) migrates all `.generated.json` to `.generated.yaml` and removes `buildGeneratedJsonAdvisory()`. Will you update all file references in this RFC to reflect the post-RFC-0376 world, and add RFC-0376 to `related[]`?

2. At least 12 generators that write to `public/` are not in `GENERATOR_OWNERSHIP_MAP` (e.g. `agent.manifest.generate`, `surface.generate`, `bordbuch.generate`, `image.variants.generate`). Will you register them as part of this RFC's rollout, or explicitly acknowledge that `generated.file.lookup` and `generated.edit.guard` will miss unregistered generators?

3. During the transition period after `markerPolicy: "registry-only"` is set but before each generator is re-run, public files will still carry stale markers. Should `generated.marker.validate` flag Category B files that still carry a marker as a "stale marker" warning, or is the transition silently ignored?
