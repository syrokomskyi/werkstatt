---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 9980cdf16...HEAD
filesReviewed:
  - packages/ui/src/blocks-renderer.astro
  - packages/ui/src/generated-manifest-loader.ts
  - packages/ui/src/image-provider-init.ts
  - packages/ui/src/integration-routes/integration-inbound.api.ts
  - packages/ui/src/integration-routes/stripe-webhook.api.ts
  - packages/ui/src/live-video-manifest.ts
  - packages/ui/src/section-api-utils.ts
  - packages/ui/src/sections/hero-decision-card/hero-decision-card-section.manifest.yaml
  - packages/ui/src/sections/hero/hero-section.manifest.yaml
  - packages/ui/src/sections/markdown/markdown-section.astro
  - packages/ui/src/sections/markdown/prose-image-resolver.ts
  - packages/ui/src/sections/markdown/prose-pipeline.ts
  - packages/ui/src/sections/notausgang-block/notausgang-block-section.astro
  - packages/ui/src/sections/ownership-block/ownership-block-section.astro
  - packages/ui/src/sections/send-message/send-message-section.api.ts
  - packages/ui/src/sections/transparency/transparency-section.astro
  - packages/ui/src/sections/trust-strip/trust-strip-section.astro
  - packages/ui/src/video-manifest.ts
---

# Code Review: 9980cdf16...HEAD (packages/ui refactor — 4 architecture candidates)

### Verdict: Needs revision

The diff successfully extracts 4 internal seams (prose pipeline, manifest loader, manifest-driven numbering, shared API utils), but has one structural issue in the manifest-driven numbering approach (Axis A) and one agent-facing clarity gap (Axis E) that should be addressed before merging.

## Mechanical floor

Pass — `tsc --noEmit` exits 0 for `packages/ui`.

## Axis A — Structural correctness

1. **FAIL — Regex-based YAML parsing in `blocks-renderer.astro:38-50`.** The manifest-driven numbering discovery uses raw regex (`/^numbered:\s*false\s*$/m` and `/^cosmicName:\s*(\S+)\s*$/m`) to parse YAML manifests at build time. This is fragile: a manifest with `numbered: false` inside a nested block, or with `cosmicName: "Europa"` (quoted), or with a comment containing the string would produce false results. The codebase already has a YAML parser available through the manifest infrastructure. Using regex to parse YAML contradicts the repo's general discipline of using proper parsers (RFC-0120 upgraded `.astro` validators to AST-grade parsing for this exact reason). **Recommendation:** use `js-yaml` or the existing manifest parsing utility to load and inspect manifests structurally.

2. **PASS (minor) — `prose-pipeline.ts:95,114-116,122` uses `Record<string, unknown>` casts** to access `body` and `rendered.html` on prose entries. This is a pre-existing pattern from the original `markdown-section.astro` and is acceptable given Astro's content layer typing limitations.

3. **PASS — `prose-image-resolver.ts:58-64`** type narrowing via `Record<string, unknown>` with `"default" in imageModule` is correct and avoids the `as any` anti-pattern.

4. **PASS — No dead code or unreachable branches** detected in the new modules.

## Axis B — DNA alignment

1. **PASS — DNA-1 (monorepo boundary):** No `apps/* → apps/*` imports. All new modules import from `@gogol/share` or sibling files within `packages/ui`.

2. **PASS — DNA-6 (kebab-case):** All new filenames use kebab-case: `prose-image-resolver.ts`, `prose-pipeline.ts`, `generated-manifest-loader.ts`, `section-api-utils.ts`.

3. **PASS — DNA-42 (Compass markup):** All 4 new non-trivial source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks with adequate `<purpose>` and `<non-goals>`.

4. **PASS — DNA-23 (cosmic naming):** The `numbered: false` field added to `hero-section.manifest.yaml` and `hero-decision-card-section.manifest.yaml` does not alter `cosmicName` values. Three-way alignment is unchanged.

5. **PASS — DNA-37 (Universal SectionProps):** `markdown-section.astro` still accepts `SectionProps`; the refactor preserves the contract.

## Axis C — Ecosystem fit

1. **PASS — Package boundaries:** All imports flow correctly within `packages/ui` and from `@gogol/share`.

2. **PASS — Pipeline placement:** No new commands or pipelines introduced. The changes are internal refactors.

3. **PASS — Compass sync:** No `docs/*.xml` updates needed — the changes don't alter repository-wide requirements or shared package contracts.

4. **PASS — `package.json` exports:** The 4 new files are internal seams, not exported through `package.json` exports. No export map changes needed.

## Axis D — Forward-only compliance

1. **PASS — No compatibility shims.** The old `UNNUMBERED_SECTION_IMPORT_PATHS` set was deleted, not kept behind a flag. The old `json()` functions were removed from all 3 API route files. The old inline prose functions were removed from `markdown-section.astro`.

2. **PASS — No dual-paths.** The `SectionList` import path change replaced the old path in all 4 files; no fallback to the old `list.astro` path remains.

3. **PASS — Legacy code paths deleted.** The old `import.meta.glob` + comment-strip + `JSON.parse` pattern was removed from `video-manifest.ts` and `live-video-manifest.ts`, not maintained alongside the new loader.

## Axis E — Agent-facing clarity

1. **FAIL — `prose-pipeline.ts:56-59` exports `ProseRenderResult` with `Component: unknown`.** The type comment says `{ kind: "component"; Component: unknown }`, but `markdown-section.astro:225` renders it as `<proseResult.Component as any />`. The `as any` cast is an anti-pattern flagged by `local-rules/no-as-any` in `packages/**/*.ts` (DNA-42 / AGENTS.md type-safety discipline). While `.astro` files may not be covered by the ESLint rule, the pattern is still architecturally wrong — the type should be specific enough to render without `as any`. **Recommendation:** type `Component` as `Astro.Component` or use a generic that preserves the renderable type from `astro:content`'s `render()` return.

2. **PASS — `MODULE_CONTRACT` blocks** are present on all new files with accurate `<purpose>` and `<non-goals>`.

3. **PASS — No ungrounded assertions.** Comments reference real RFCs (RFC-0045, RFC-0041, RFC-0204, RFC-0210, RFC-0234, RFC-0181) and real functions.

4. **PASS — Log messages carry context** (`[generated-manifest-loader]`, `[RFC-0204]`).

## Axis F — Pragmatism

1. **PASS — Minimal command surface:** No new commands introduced.

2. **PASS — Lean contracts:** `ProsePipelineOptions` and `ProseRenderResult` are minimal. `section-api-utils.ts` exports only `json()` and `INTEGRATION_CALLBACK_PATH`.

3. **PASS — Existing patterns extended:** `loadGeneratedManifest<T>` generalizes the existing pattern without over-engineering.

4. **PASS — Scope discipline:** The diff touches only `packages/ui` files. No scope creep.

## Axis G — Blind spots

1. **PASS — Performance:** The manifest glob in `blocks-renderer.astro` runs at build time only (Astro SSG). The regex scan over ~20 manifest files is negligible.

2. **PASS — Edge cases:** `loadGeneratedManifest` returns `null` on missing/unparseable files; callers handle null. `renderProse` returns `{ kind: "slot" }` when no prose entry exists.

3. **PASS — Migration path:** Existing apps need no changes — the `numbered: false` manifest field is optional and defaults to numbered.

4. **PASS — Security/privacy:** No user data, PII, or cookies touched. `section-api-utils.ts` only builds JSON responses.

## Spec compliance

No spec available — spec compliance skipped. The work originates from an architecture review identifying 4 improvement candidates.

## Questions for the author

1. **`blocks-renderer.astro:38-50` — why regex instead of YAML parser?** The repo uses `js-yaml` elsewhere for manifest parsing. Regex-based YAML field extraction is fragile (quoted values, nested blocks, comments). Can this use the existing manifest parsing infrastructure?

2. **`prose-pipeline.ts:58` — can `Component` be typed more specifically?** The `unknown` type forces `as any` in the `.astro` consumer. Is there a type from `astro:content` or `astro` that can be used instead?

3. **`blocks-renderer.astro:44` — `path` variable unused.** The `for (const [path, mod] of ...)` loop destructures `path` but never uses it. Should it be `for (const [, mod] of ...)` or should `path` be used for debugging?
