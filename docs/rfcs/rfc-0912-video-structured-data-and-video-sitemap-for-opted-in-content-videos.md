---
id: RFC-0912
title: "Video structured data and video sitemap for opted-in content videos"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-21
updatedAt: 2026-08-21
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0172
  - RFC-0210
  - RFC-0498
  - RFC-0907
  - RFC-0909
  - RFC-0910
  - RFC-0911
batch: seo-indexing-hardening
dependsOn: []
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: minor
commands:
  proposed:
    - video.structured-data.validate
  added: []
  changed:
    - sitemap.generate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/werkstatt-site"
  - "@warpgogol/werkstatt-shared"
successSignals:
  - "A block with seo.videoObject: true renders a valid VideoObject JSON-LD node with name, description, uploadDate, thumbnailUrl and duration from the variant manifest"
  - "sitemap-video.xml lists every opted-in video and is referenced from the sitemap index"
  - "video.structured-data.validate fails an opted-in video block missing any required VideoObject field"
  - "Hero and background videos never produce VideoObject nodes or video-sitemap entries"
nonGoals:
  - Video hosting, transcoding, or playback changes (RFC-0210 owns the playback contract).
  - Automatic VideoObject for every rendered <video> — markup is strictly opt-in per block.
  - YouTube/third-party embed markup — only self-hosted videos from the variant pipeline.
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
acceptance:
  - probe: command-registered
    name: "video.structured-data.validate"
  - probe: run
    command: "werkstatt run video.structured-data.validate --site warpgogol-com"
    expect:
      exitCode: 0
---

# RFC-0912: Video structured data and video sitemap for opted-in content videos

## Context

The 2026-08-21 SEO audit found that the workshop operates a full video pipeline — `video.variants.generate` produces MP4/WebM/AV1/HLS variants, posters, and a variant manifest that already includes `durationSec`, `width`, `height`, `hasAudio`, poster URL and captions (probed via ffprobe at build time). None of this reaches search engines: there is no `VideoObject` JSON-LD anywhere in the semantic builders (`packages/werkstatt-site/src/domain/share/semantic/jsonld/` covers Article, Breadcrumb, FAQ, Organization, Person, Service, WebPage, WebSite — no video), and the sitemap index (content, legal, images) has no video sitemap.

Google's video best practices make pages with primary video content eligible for video search results, previews, and rich badges — but only with valid `VideoObject` markup and, ideally, a video sitemap. The gap matters the moment any site publishes a content video (demos, explainers, Ratgeber videos).

The audit also identified the inverse risk: hero/background videos are decorative and MUST NOT be marked up — indiscriminate VideoObject emission is a spam signal. Hence opt-in.

## Problem

1. **No VideoObject emission** — the semantic layer has no video node type, so even a perfect content video is invisible to video search.
2. **No video sitemap** — `sitemap.xml` references content, legal, and image sitemaps; video entries (`video:video`) are not generated.
3. **No field validation** — VideoObject requires `name`, `description`, `uploadDate`, `thumbnailUrl`; nothing would enforce these if an author hand-wrote markup tomorrow.
4. **Decorative-video hazard is unguarded** — without an explicit opt-in contract, a future change could markup background videos and trigger a spam signal.

## Decision

Video-bearing content blocks gain an explicit opt-in (`seo.videoObject: true` plus required editorial fields `name`, `description`, `uploadDate` in the block props schema); opted-in videos emit a `VideoObject` JSON-LD node built from the variant manifest (duration, poster, sources) and are listed in a generated `sitemap-video.xml` referenced from the sitemap index; a new `video.structured-data.validate` command enforces the contract on rendered HTML. Hero/background videos are structurally excluded — their block schemas never receive the opt-in prop.

## Architectural fit

- **RFC-0210 (related)** — owns the video playback/variant contract; this RFC consumes its variant manifest (duration, poster, sources) and changes nothing about encoding.
- **RFC-0172 (related)** — the image sitemap is the template: `sitemap-video.xml` follows the same harvest → generate → ownership pattern, with generator-ownership registration so cleanup never deletes files owned by other generators.
- **RFC-0498 (related)** — structured-data policy for surfaces; VideoObject joins the declared per-depth policy rather than appearing ad hoc.
- **RFC-0907 (related)** — sitemap integrity validators will cover the new sitemap like any other (placeholder/coverage rules apply to `sitemap-video.xml` too).
- **Site OS operator model** — the validator is app-scoped postbuild; generation rides the existing `sitemap.generate` step (changed command), so no new pipeline step is added beyond the validator.

## Design

### CLI surface

```sh
# Validates: every opted-in video block renders a complete VideoObject;
# every VideoObject in rendered HTML traces to an opted-in block;
# sitemap-video.xml entries match opted-in videos.
pnpm exec werkstatt run video.structured-data.validate --site warpgogol-com

# Existing command, extended: also emits sitemap-video.xml when opted-in videos exist.
pnpm exec werkstatt run sitemap.generate --site warpgogol-com
```

App scope. The validator reads `dist/client/**/*.html`, `dist/client/sitemap-video.xml`, and page frontmatter; it skips gracefully when `dist/` is not built (postbuild pattern).

### TypeScript contracts

```ts
// Block props extension (only on content-video block archetypes; NEVER on hero/background):
interface VideoSeoProps {
  seo?: {
    videoObject: true;             // literal true — presence is the opt-in
    name: string;                  // VideoObject.name (required by Google)
    description: string;           // VideoObject.description (required)
    uploadDate: string;            // ISO 8601 date (required)
  };
}

// JSON-LD node, built from the variant manifest (video-variants.ts probe data):
interface VideoObjectNode {
  "@type": "VideoObject";
  name: string;
  description: string;
  uploadDate: string;
  thumbnailUrl: string;            // poster.webp from the manifest
  duration?: string;               // ISO 8601 duration, from durationSec
  contentUrl: string;              // canonical MP4 variant
  embedUrl?: string;               // page URL with player, when applicable
}

// Sitemap entries follow the Google video sitemap schema:
// <video:video> with thumbnail_loc, title, description, content_loc, duration, publication_date.
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/domain/share/semantic/jsonld/` | New `video.ts` node builder |
| `packages/werkstatt-site/src/checks/sitemap*.ts` | `sitemap.generate` extended to emit `sitemap-video.xml` + index entry |
| `packages/werkstatt-site/src/checks/audit/validators/` | Home of `video.structured-data.validate` |
| Video-capable block archetype YAMLs | `seo` opt-in props added to propsSchema (content-video blocks only) |
| `public/sitemap-video.xml` (workpiece) | Generated, ownership-registered |
| Hero/background section schemas | Explicitly untouched — decorative video never opts in |

### Output format

Standard Diagnostic envelope. Rules:

| Rule | Severity | Condition |
| --- | --- | --- |
| `VIDEO-SEO-01` | error | Opted-in block missing a required VideoObject field (`name`, `description`, `uploadDate`). |
| `VIDEO-SEO-02` | error | Opted-in video has no corresponding VideoObject node in rendered HTML. |
| `VIDEO-SEO-03` | error | Rendered VideoObject traces to a non-opted-in or hero/background block. |
| `VIDEO-SEO-04` | error | `sitemap-video.xml` entry missing for an opted-in video, or entry present for a non-opted-in video. |
| `VIDEO-SEO-05` | warning | VideoObject `duration` absent (variant manifest lacks `durationSec`) — degrades rich-result eligibility. |

### Failure modes

- Error diagnostics exit 1 — error from day one (operator decision 2026-08-21). warpgogol-com currently has no opted-in videos, so the site passes trivially; the gate protects the first future content video.
- A site with zero opted-in videos produces no `sitemap-video.xml` and no index entry — absence is valid, not a violation.
- Missing variant-manifest metadata (e.g. undeterminable duration) degrades to VIDEO-SEO-05 warning, never to a build crash.

## Rollout

1. Extend the props schemas of content-video block archetypes with the `seo` opt-in; hero/background archetypes are deliberately skipped (structural exclusion).
2. Add the `video.ts` JSON-LD builder and wire it into `buildJsonLd` for pages containing opted-in videos.
3. Extend `sitemap.generate` to emit `sitemap-video.xml` + index entry when opted-in videos exist; register generator ownership.
4. Add `video.structured-data.validate` to `SITES_CHECK_POSTBUILD_PIPELINE` as error.
5. warpgogol-com needs no content change until its first content video is authored; the first opted-in video is exercised through a mission and validated end-to-end.

## Alternatives considered

- **Automatic VideoObject for all non-hero videos** — rejected (operator decision 2026-08-21): required fields (`name`, `description`, `uploadDate`) would have to be synthesized, and exclusion of individual videos would be impossible. Explicit opt-in keeps markup intentional.
- **Dedicated video page type only** — rejected: too narrow; content videos live inside regular pages (Ratgeber articles, service dossiers), not only on standalone watch pages.
- **Defer until a site actually has video content** — rejected: the workshop's goal is that no site can ever ship an unmarked content video; the contract must exist before the content does.
- **Warning-first adoption** — rejected by the operator with the rest of the batch: error from day one; with zero opted-in videos the gate is green by construction.

## Risks

- **Spam-signal inversion** — the main risk is not missing markup but wrong markup (marking decorative videos). Mitigated structurally: hero/background schemas never receive the opt-in prop, and VIDEO-SEO-03 catches markup that appears without opt-in.
- **Google video-sitemap schema drift** — the `video:video` namespace is stable but historically quirky; the validator checks our own contract, not Google's full schema, so maintenance is bounded.
- **Manifest coupling** — the JSON-LD builder depends on variant-manifest fields (`durationSec`, poster). A manifest format change must update the builder; VIDEO-SEO-05 degrades gracefully in the interim.
- **Agent misinterpretation** — agents must not add the opt-in prop to hero/background archetypes "for completeness"; the exclusion is deliberate.

## Acceptance criteria

- [ ] Content-video block archetypes expose the `seo.videoObject` opt-in with required `name`/`description`/`uploadDate`; hero/background archetypes do not (evidence: archetype YAMLs)
- [ ] `VideoObject` JSON-LD node emitted from the variant manifest for opted-in videos (evidence: `jsonld/video.ts` + rendered HTML test)
- [ ] `sitemap.generate` emits `sitemap-video.xml` and a sitemap-index entry when opted-in videos exist; generator ownership registered (evidence: sitemap generator + ownership map)
- [ ] `video.structured-data.validate` registered (app scope, postbuild) with VIDEO-SEO-01..05 (evidence: command table + handler)
- [ ] Validator wired into `SITES_CHECK_POSTBUILD_PIPELINE` as error (evidence: pipeline definition)
- [ ] Unit tests: opt-in emits node, hero video never emits, missing field fails, sitemap parity (evidence: test file)
- [ ] warpgogol-com passes the validator (evidence: probe run output)
- [ ] `AGENTS.md` updated where agent behavior rules changed
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0912` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT add the `seo.videoObject` prop to hero, background, or ambient-video archetypes — decorative video exclusion is a deliberate contract, not an oversight.
- Agents MUST NOT synthesize `uploadDate` from build time — it is authored editorial metadata declared in the block props.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0912 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
