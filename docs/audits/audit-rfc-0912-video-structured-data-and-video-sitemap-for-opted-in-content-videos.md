---
rfcId: RFC-0912
auditId: AUDIT-RFC-0912-01
date: 2026-08-22
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0912

## Verdict: Needs revision

Two findings block implementation: a pipeline-ordering conflict that makes the proposed `sitemap.generate` extension infeasible as written, and a stale package path (`werkstatt-site` instead of `werkstatt-shared`) for the JSON-LD builder location.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0912 --json` returned 0 violations.

## Axis A — Structural completeness

- **Unnamed archetypes.** The RFC refers to "content-video block archetypes" (lines 128, 161, 185) without naming a single concrete archetype. The implementer cannot know which props schemas to extend. The file system responsibilities table entry "Video-capable block archetype YAMLs" is equally vague.
- **`contentUrl` resolution unspecified.** The `VideoObjectNode.contentUrl` is described as "canonical MP4 variant" (line 146), but `VideoManifestSources` (`@warpgogsky/werkstatt-shared/share/schemas/media`) has `mp4`, `webm`, `av1`, `hls` — no "canonical" designation. The RFC must specify which source field maps to `contentUrl` and how multi-rendition MP4s are selected.
- **`embedUrl` condition unclear.** `embedUrl` is "page URL with player, when applicable" (line 148) — no guidance on when it is applicable. If the video is inline (not an embed), should `embedUrl` be omitted? Google's spec treats `contentUrl` and `embedUrl` as distinct signals.

## Axis B — DNA alignment

- **No `satisfies` entries.** Not required for `command` kind RFCs (RFC-0331), but DNA-16 (Semantic layer shares topology with navigation) is directly relevant: VideoObject must be derived from the same page topology as navigation and other JSON-LD nodes. The RFC should at minimum list DNA-16 in `related` or explain why it doesn't apply.
- No DNA conflicts detected. The RFC does not alter any existing invariant.

## Axis C — Ecosystem fit

- **CRITICAL — Pipeline ordering conflict.** `sitemap.generate` runs at step 114 in `SITES_BUILD_PREPARE_PIPELINE` (`packages/werkstatt-site/src/checks/pipelines/build-prepare.ts:114`), BEFORE `video.variants.generate` at step 136 (`build-prepare.ts:136`). The RFC proposes extending `sitemap.generate` to emit `sitemap-video.xml` from the variant manifest, but the variant manifest (`src/video-manifest.generated.yaml`) does not exist yet when `sitemap.generate` runs. RFC-0172 solved the analogous problem by creating a separate post-build `dist.sitemap.images.generate` — this RFC should either follow that pattern (new `dist.sitemap.video.generate` command) or explicitly reorder the pipeline and justify the change.
- **Stale package path for JSON-LD builder.** The file system responsibilities table (line 158) and Context section (line 84) reference `packages/werkstatt-site/src/domain/share/semantic/jsonld/`, but RFC-0868 moved all jsonld builders to `packages/werkstatt-shared/src/share/semantic/jsonld/`. The `buildJsonLd` function and all existing node builders (article.ts, breadcrumb.ts, etc.) live in `werkstatt-shared`. The RFC must point to `packages/werkstatt-shared/src/share/semantic/jsonld/video.ts`.
- **File system table missing `werkstatt-shared` paths.** `packagesImpacted` correctly lists `@warpgogol/werkstatt-shared`, but the file system responsibilities table (lines 156–163) lists only `werkstatt-site` paths. The jsonld builder row should be under `werkstatt-shared`.
- Validator path `packages/werkstatt-site/src/checks/audit/validators/` is correct — the directory exists and houses analogous validators (`seo-structured-data.ts`, `jsonld.ts`).
- `SITES_CHECK_POSTBUILD_PIPELINE` correctly identified for validator placement.
- Generator ownership registration mentioned (line 187) — follows RFC-0172 pattern, good.

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual paths, no legacy preservation. The RFC is cleanly forward-only.

## Axis E — Agent-facing policy

- Status is `draft` — no self-authorizing language found.
- Implementation notes correctly reference RFC-0224 (accepted→implemented), RFC-0330 (verification evidence), RFC-0334 (supersede escalation).
- `uploadDate` explicitly called out as authored editorial metadata, not auto-generated (line 223) — good anti-fabrication discipline.
- No `NEEDS CLARIFICATION` markers.
- No cookies or client-side persistence introduced.

## Axis F — Pragmatism

- **`sitemap.generate` extension vs. separate command.** The RFC extends `sitemap.generate` to avoid a new pipeline step, but the pipeline ordering issue (Axis C) may force a separate post-build generator anyway. If so, the `commands` frontmatter should list a new `proposed` command (e.g. `dist.sitemap.video.generate`) instead of only `changed: sitemap.generate`.
- `VideoSeoProps` interface is minimal — no speculative fields. Good.
- `video.structured-data.validate` earns its existence — distinct validation domain, not a flag on an existing command.

## Axis G — Blind spots

- **Pipeline ordering** (also Axis C) — the RFC does not acknowledge that `sitemap.generate` runs before `video.variants.generate`. This is the most significant blind spot.
- **Multi-language videos.** The variant manifest is keyed by origin (content-relative path including language, e.g. `/src/content/pages/uk/assets/promo.mp4`). Does each language version get its own VideoObject? Does `sitemap-video.xml` list per-language entries? The RFC is silent.
- **Performance cost.** `sitemap.generate` scanning for opted-in videos adds work to the pre-build step. No cost estimate provided (how many blocks to scan, how the opt-in is detected).
- **Empty state** — handled: "a site with zero opted-in videos produces no `sitemap-video.xml` and no index entry" (line 180). Good.
- **Concurrent execution** — not addressed, but likely not relevant since build.prepare is sequential.

## Questions for the author

1. How will `sitemap.generate` emit `sitemap-video.xml` when it runs BEFORE `video.variants.generate` in `SITES_BUILD_PREPARE_PIPELINE`? Should a separate post-build `dist.sitemap.video.generate` be created (mirroring RFC-0172's `dist.sitemap.images.generate`), or should the pipeline be reordered?
2. Which concrete block archetypes are "content-video"? Name them so the implementer knows which props schemas to extend.
3. Which field from `VideoManifestSources` maps to `VideoObjectNode.contentUrl`, and how is the "canonical MP4" selected when multiple renditions exist?
