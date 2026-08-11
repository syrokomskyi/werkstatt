---
id: RFC-0802
title: "Add interactive maturity mountain page with GSAP camera pan and marker animation"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-11
updatedAt: 2026-08-11
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-24
  - DNA-37
  - RFC-0026
  - RFC-0040
  - RFC-0047
  - RFC-0106
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-24
  - DNA-37
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "A new `mountain-journey` section archetype is registered in the archetype catalog with a cosmic name, semantic role, and props schema."
  - "The section renders a full static SVG scene (mountain background image + SVG overlay with route path, stage markers, and stage labels) server-side — no JS required for content access."
  - "GSAP MotionPathPlugin + ScrollTrigger animate the marker along the SVG path and zoom out the camera simultaneously when a score is returned from the form submission."
  - "The page `/reife` (de) / `/maturity` (uk) is accessible via footer navigation on warpgogol-com."
  - "`prefers-reduced-motion: reduce` and no-JS fallbacks show the full static scene with all content visible."
  - "The form submits a URL to a Cloudflare Worker endpoint and displays an error message on failure without performing the animation."
nonGoals:
  - "Does not define the HDRI scoring methodology — the methodology is an external artifact maintained outside the codebase."
  - "Does not implement the Cloudflare Worker scoring logic — the Worker service structure is covered by a separate ADR, and the Worker initially returns a stub score."
  - "Does not add scroll-driven pin animation — the camera pan is triggered by form submission, not by scroll position."
  - "Does not show numeric score, stage name, or stage description after animation — only the visual marker position on the mountain path."
  - "Does not replace or modify existing blocks on the warpgogol-com homepage or any other existing page."
  - "Does not introduce a new content collection — stage data is authored in block props."
  - "Does not add the page to header navigation — footer only."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0802: Add interactive maturity mountain page with GSAP camera pan and marker animation

## Context

The warpgogol-com site uses the block-declarative page system (DNA-24, RFC-0026) with 30+ section archetypes in the shared catalog (`packages/werkstatt-site/src/domain/ontology/archetypes/sections/`). All existing archetypes are static-content sections — their content is authored in page block props and rendered at build time. None provide client-side interactivity beyond the shared GSAP motion scripts (RFC-0040, RFC-0106: counter, reveal, parallax, stagger).

The operator wants a new page `/reife` (de) / `/maturity` (uk) that visualizes the HDRI (High-fidelity Digital Readiness Index) score of a website. The HDRI methodology is maintained outside the codebase. The page features:

- A wide raster illustration of a mountain (WebP) with five horizontal terraces representing maturity stages (Kritisch 0–<20, Basis 20–<40, Aufbau 40–<60, Fortgeschritten 60–<80, Vorbild 80–100).
- An SVG overlay with a winding route path from bottom to top and markers at each stage boundary.
- A form where the visitor enters a website URL.
- On form submission, a Cloudflare Worker returns an HDRI score (0–100). The marker animates along the route path to the score position while the camera simultaneously zooms out from the start to reveal the full mountain.
- The page is linked from the footer navigation only.

GSAP (v3.15.0) is already a root dependency. ScrollTrigger is used by existing scripts (`gsap-reveal.ts`, `gsap-parallax.ts`, `gsap-stagger.ts`). MotionPathPlugin is available in the GSAP bundle but not yet registered in the project.

## Problem

1. **No archetype for interactive scene visualization.** The existing archetype catalog has no section that combines a raster background, SVG overlay with a coordinate system, form-driven client-side animation, and GSAP MotionPathPlugin. Sites needing this pattern would have to build a site-local section — which violates the composition-only principle (RFC-0047).

2. **No MotionPathPlugin registration.** The project uses GSAP ScrollTrigger in shared scripts but has not registered MotionPathPlugin. A new shared script is needed to register and use MotionPathPlugin for marker-along-path animation.

3. **No form-driven animation pattern.** Existing GSAP scripts (RFC-0040, RFC-0106) are triggered by scroll position or viewport entry. The mountain scene requires animation triggered by a form submission result — a different trigger pattern not yet present in the shared script library.

4. **No page for HDRI visualization.** warpgogol-com has no `/reife` page. The page needs to be added to `system.md` pages[], navigation, and content files — an information-architecture change that requires an RFC.

## Decision

A new `mountain-journey` section archetype is added to the shared archetype catalog in `packages/werkstatt-site/src/domain/ui/sections/mountain-journey/`. The section renders a raster mountain background with an SVG overlay (route path, stage markers, stage labels) and a form. A new shared GSAP script (`gsap-mountain-journey.ts`) registers MotionPathPlugin and animates the marker along the path + zoom-out camera when a score is returned from form submission. A new page `/reife` (de) / `/maturity` (uk) is added to warpgogol-com with footer navigation. The Cloudflare Worker service structure is covered by a separate ADR.

## Architectural fit

- **DNA-24 (Block-declarative pages):** The new page `/reife` is a frontmatter-only `.md` file with `blocks[].type: mountain-journey`. No `.astro` file is needed in the site — the section is rendered by the shared `buildPage` pipeline.
- **DNA-37 (Universal Section Props Contract):** The `mountain-journey` section accepts a single unified `SectionProps` interface, composing through the standard section framework (`SectionShell` + `SectionHeader` + body).
- **RFC-0026 (Block-declarative pages):** The archetype participates in the standard block composition pipeline. Its `propsSchema` composes shared section-props fragments.
- **RFC-0040 (GSAP motion library):** GSAP is already a root dependency. The new script follows the existing pattern of dynamic `import("gsap")` and `import("gsap/ScrollTrigger")` — no new npm dependency.
- **RFC-0047 (Thin apps):** The section implementation lives in `packages/werkstatt-site/src/domain/ui/sections/mountain-journey/`. Sites reference it via `type: mountain-journey` — no site-local code.
- **RFC-0106 (GSAP native motion primitives):** The new script extends the shared GSAP script library with MotionPathPlugin registration, following the same `prefers-reduced-motion` guard pattern.
- **Layer C:** No URL, JSON-LD, or sitemap changes beyond the new page route — `breaksC: false`.

## Design

### CLI surface

No new commands. The section is materialized by the existing `section.scaffold` command:

```sh
pnpm exec werkstatt run section.scaffold --name mountain-journey --archetype mountain-journey
```

After scaffolding, run `archetype.registry.build` to regenerate `index.yaml` and `index.json`. `PLANET_IMPORT_PATHS` in `packages/werkstatt-site/src/domain/share/src/page.ts` is registry-derived (RFC-0091) and requires a manual entry for the new cosmic name.

The new page is added to warpgogol-com by:

1. Creating `src/content/pages/{de,uk}/reife.md` with `kind: page`, `pageId: reife`, `cosmicStar`, and one `mountain-journey` block.
2. Adding a `pages[]` entry in `src/content/system.md` with `pageId: reife`, `routes: { de: reife, uk: maturity }`, `cosmicStar`, and `planets[]`.
3. Adding a navigation entry in `src/content/navigation/{de,uk}/navigation.md` with `group: footer`.

### TypeScript contracts

```ts
// Archetype propsSchema (Zod shape)
interface MountainJourneyProps {
  // Composed from section-visual + section-header
  backgroundImage: string;              // Asset key for the mountain WebP image
  svgViewBox: { width: number; height: number };  // SVG coordinate system dimensions
  routePath: string;                    // SVG path `d` attribute for the route line
  stages: Array<{
    id: string;                         // e.g. "kritisch", "basis", "aufbau", "fortgeschritten", "vorbild"
    label: string;                      // e.g. "Kritisch", "Basis", "Aufbau", "Fortgeschritten", "Vorbild"
    scoreRange: string;                 // e.g. "0–<20", "20–<40", "40–<60", "60–<80", "80–100"
    description: string;                // Short description of the stage
    position: number;                   // 0–1 along the route path (start = 0, summit = 1)
  }>;
  form: {
    inputLabel: string;                 // e.g. "Website-URL" / "URL сайту"
    inputPlaceholder: string;           // e.g. "https://example.com"
    submitLabel: string;                // e.g. "Indizes berechnen" / "Розрахувати індекс"
    errorMessage: string;               // Shown on Worker error
  };
  workerEndpoint: string;              // URL of the maturity-score Worker
  cameraInitialZoom: number;            // Initial zoom level (e.g. 2.5 = zoomed in on start)
  cameraFinalZoom: number;              // Final zoom level (e.g. 1.0 = full mountain visible)
  animationDuration: number;            // Duration in seconds for marker + camera animation
}
```

```ts
// Shared GSAP script: gsap-mountain-journey.ts
interface MountainJourneyAnimationOptions {
  containerSelector: string;           // Root element selector for the scene
  routePathSelector: string;           // SVG path element selector
  markerSelector: string;              // Marker element selector
  cameraSelector: string;              // Camera/scene container selector for zoom
  formSelector: string;                // Form element selector
  workerEndpoint: string;              // POST endpoint for score calculation
  initialZoom: number;
  finalZoom: number;
  duration: number;                    // Animation duration in seconds
  prefersReducedMotion?: boolean;
}

async function initMountainJourneyAnimation(
  options: MountainJourneyAnimationOptions,
): Promise<void>;
```

The script dynamically imports `gsap`, `gsap/ScrollTrigger`, and `gsap/MotionPathPlugin`. It registers both plugins. On form submission, it POSTs `{ url: string }` to `workerEndpoint`, receives `{ score: number }`, and animates:

1. The marker along the route path to `score / 100` of the path length using `gsap.to(marker, { motionPath: { path: routePath, end: score / 100 } })`.
2. The camera container from `initialZoom` to `finalZoom` using `gsap.to(camera, { scale: finalZoom, duration })`.

Both animations run simultaneously in the same GSAP timeline. On Worker error, the form shows `errorMessage` and no animation runs.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/domain/ui/sections/mountain-journey/mountain-journey-section.astro` | Section component — server-renders SVG scene + form |
| `packages/werkstatt-site/src/domain/ui/sections/mountain-journey/mountain-journey-section.css` | Section styles — layout, responsive, form |
| `packages/werkstatt-site/src/domain/ui/sections/mountain-journey/mountain-journey-section.client.ts` | Client script entry — calls `initMountainJourneyAnimation` |
| `packages/werkstatt-site/src/domain/ui/sections/mountain-journey/mountain-journey-section.manifest.yaml` | Manifest — cosmic name, semantic role, props schema |
| `packages/werkstatt-site/src/domain/ui/sections/mountain-journey/mountain-journey-section.types.generated.ts` | Generated prop types |
| `packages/werkstatt-site/src/domain/share/scripts/gsap-mountain-journey.ts` | Shared GSAP script — MotionPathPlugin + camera animation |
| `packages/werkstatt-site/src/domain/ontology/archetypes/sections/mountain-journey.yaml` | Archetype catalog entry |
| `packages/werkstatt-site/src/domain/share/src/page.ts` | `PLANET_IMPORT_PATHS` — add new cosmic name |
| `missions/<active>/workpiece/src/content/pages/{de,uk}/reife.md` | Page content files |
| `missions/<active>/workpiece/src/content/system.md` | Add `reife` page entry |
| `missions/<active>/workpiece/src/content/navigation/{de,uk}/navigation.md` | Add footer nav entry |
| `missions/<active>/workpiece/src/content/site/{de,uk}/labels.md` | Add `footer.navIds` entry for `reife` |
| `missions/<active>/workpiece/public/assets/mountain-journey.webp` | Mountain illustration asset (LFS-tracked) |

### Output format

Not applicable — this RFC introduces no new CLI command. The section renders HTML/SVG at build time and animates via client-side GSAP.

### Failure modes

1. **Worker unreachable / timeout:** The client script catches the fetch error, shows `form.errorMessage` below the input, and resets the submit button. No animation runs.

2. **Worker returns invalid score:** If the response is not `{ score: number }` where `0 ≤ score ≤ 100`, the script treats it as an error — same behavior as Worker unreachable.

3. **Invalid URL input:** The form uses native HTML5 `type="url"` validation. If the browser rejects the URL, the form does not submit.

4. **prefers-reduced-motion: reduce:** The script skips GSAP animation entirely. The full static SVG scene with all stages and the route path is visible. The form still submits to the Worker, but the marker is placed directly at the score position without animation.

5. **No JavaScript:** The full static SVG scene is server-rendered with all content visible. The form is non-functional without JS — it degrades to a visible-but-inactive element. A `<noscript>` message informs the visitor that JavaScript is required for the interactive score calculation.

6. **MotionPathPlugin import failure:** If `gsap/MotionPathPlugin` fails to load (network issue, bundle error), the script falls back to `path.getPointAtLength()` for static marker placement and skips the animation.

## Rollout

- **Default behavior on introduction:** The `mountain-journey` archetype is available to all sites via the standard block-declarative page composition pipeline. No flag day — existing sites are unaffected because they do not reference `type: mountain-journey`.
- **warpgogol-com adoption:** The page `/reife` is added in a mission workpiece. The mountain WebP asset is committed to the workpiece `public/assets/` directory (LFS-tracked). The page entry is added to `system.md` and navigation.
- **New sites:** Automatically have access to the archetype via the shared catalog. They can use `type: mountain-journey` in any page block configuration.
- **GSAP MotionPathPlugin:** Registered at runtime by the shared script — no global registration side effects. The plugin is only loaded on pages that contain the `mountain-journey` section (DOM guard in the client script).
- **Worker endpoint:** The `workerEndpoint` prop is configured per-site in block props. For warpgogol-com, the endpoint points to the maturity-score Worker (covered by a separate ADR). Until the Worker is deployed, the endpoint can point to a stub that returns a fixed score.
- **Build pipeline integration:** No new pipeline step. The section is validated by existing `page.block.validate` and `mirror.quintet.validate` during `build.check`.

## Alternatives considered

1. **PixiJS for GPU-accelerated 2D rendering.** Rejected — the use case (one image, one SVG path, one marker, one zoom animation) does not require GPU acceleration. PixiJS adds significant bundle size and complexity for no visual benefit over SVG + GSAP.

2. **CSS-only animation (transforms + transitions).** Rejected — CSS cannot animate an element along an arbitrary SVG path without JavaScript. The `offset-path` CSS property has limited browser support and no GSAP integration for timeline control.

3. **Scroll-driven animation (ScrollTrigger pin + horizontal pan).** Rejected by the operator — the camera pan is triggered by form submission (interactive), not by scroll position. The visitor enters a URL, the Worker returns a score, and the animation plays once to that position.

4. **Site-local section in warpgogol-com.** Rejected — violates the composition-only principle (RFC-0047). The `mountain-journey` archetype is reusable across sites and belongs in the shared package.

5. **SVG-only mountain (no raster image).** Rejected — the operator provided a specific raster illustration (WebP) with rich visual detail that cannot be reproduced as vector SVG without significant artistic effort. The raster + SVG overlay approach preserves the visual quality while keeping the route path and markers as scalable vector elements.

## Risks

1. **Bundle size impact.** MotionPathPlugin adds to the client bundle. Mitigation: the script is dynamically imported only on pages with `mountain-journey` sections (DOM guard), same as existing GSAP scripts.

2. **Worker availability.** The page depends on an external Cloudflare Worker. If the Worker is down, the form shows an error message. Mitigation: the error message is authored in block props and can be customized per-site.

3. **SVG path coordinate drift.** The `routePath` `d` attribute and `stages[].position` values must match the mountain image. If the image is replaced, the path and positions need recalculation. Mitigation: the path and positions are authored in block props (not hardcoded in the component), making them editable without code changes.

4. **Accessibility.** The interactive scene is inherently visual. Mitigation: full static SVG with all content is server-rendered; `prefers-reduced-motion` disables animation; `<noscript>` message explains JS requirement; stage labels are DOM text (not SVG `<text>`).

5. **Agent misinterpretation risk.** Agents may confuse this with scroll-driven animation (RFC-0106 pattern). Mitigation: the `nonGoals` section explicitly states "Does not add scroll-driven pin animation" and the Design section describes form-triggered animation.

6. **LFS tracking.** The mountain WebP asset must be LFS-tracked. Mitigation: `.gitattributes` already tracks `*.webp` patterns; the asset is committed to the workpiece `public/assets/` directory.

## Acceptance criteria

- [ ] `mountain-journey` section archetype created in `packages/werkstatt-site/src/domain/ui/sections/mountain-journey/` with Mirror Quintet files (`.astro`, `.css`, `.client.ts`, `.manifest.yaml`, `.types.generated.ts`)
- [ ] Archetype catalog entry created at `packages/werkstatt-site/src/domain/ontology/archetypes/sections/mountain-journey.yaml`
- [ ] `PLANET_IMPORT_PATHS` in `packages/werkstatt-site/src/domain/share/src/page.ts` updated with the new cosmic name
- [ ] Shared GSAP script `gsap-mountain-journey.ts` created in `packages/werkstatt-site/src/domain/share/scripts/` with MotionPathPlugin registration and form-triggered animation
- [ ] Page `reife.md` created in both `de` and `uk` content directories with one `mountain-journey` block
- [ ] `system.md` updated with `reife` page entry (routes: `de: reife, uk: maturity`)
- [ ] Footer navigation updated in `navigation.md` and `labels.md` for both languages
- [ ] Mountain WebP asset placed in workpiece `public/assets/` and LFS-tracked
- [ ] `prefers-reduced-motion: reduce` disables animation and shows full static scene
- [ ] No-JS fallback: full static SVG scene server-rendered with `<noscript>` message
- [ ] `pnpm --filter warpgogol-com exec astro check` passes
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST use `mission.git.commit` to commit edits in the warpgogol-com workpiece — not direct `git commit`.
- Agents MUST NOT run root `pnpm build` or `turbo run build` — use `pnpm --filter warpgogol-com exec astro check` for scoped typecheck.
- Agents MUST register MotionPathPlugin in the shared script, not in the section component — the section component only calls `initMountainJourneyAnimation`.
- Agents MUST NOT hardcode the SVG path `d` attribute or stage positions in the component — these are authored in block props.
- Agents MUST NOT add the page to header navigation — footer only (per operator decision).
- Agents MUST NOT show numeric score, stage name, or stage description after animation — only the visual marker position.
- Agents MUST ensure the mountain WebP asset is LFS-tracked before committing.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0802 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
