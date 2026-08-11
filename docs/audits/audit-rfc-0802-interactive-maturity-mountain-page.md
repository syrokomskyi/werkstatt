---
rfcId: RFC-0802
auditId: AUDIT-RFC-0802-01
date: 2026-08-11
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0802

## Verdict: Needs revision

The RFC is architecturally sound — additive, forward-only, follows the block-declarative page system. However, it contains a factual error about `PLANET_IMPORT_PATHS` (claims manual entry is needed when the registry auto-discovers it), omits the cosmic name assignment (a blocking gap for `section.scaffold`), bypasses the orchestrator pattern for GSAP script integration, and makes an incorrect LFS tracking claim. Four findings require revision before implementation.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **Missing cosmic name declaration.** The RFC does not specify which cosmic name from the PlanetCatalog will be assigned to the `mountain-journey` archetype. All 57 existing archetypes in `packages/werkstatt-site/src/domain/ontology/archetypes/index.yaml` declare `acceptedCosmicNames`. The `section.scaffold` command requires `--cosmicName`. The archetype YAML requires `cosmicName`. This is a blocking structural gap.

2. **`section.scaffold` CLI example is incomplete.** The RFC shows `pnpm exec werkstatt run section.scaffold --name mountain-journey --archetype mountain-journey` but the command accepts `--cosmicName` and `--role` flags (confirmed in `packages/werkstatt-site/src/checks/command-tables/01-codegen.ts:447-478`). The example should include all required flags.

3. **`MountainJourneyProps` doesn't show `SectionProps` composition.** The TypeScript contract shows a flat interface, but DNA-37 / RFC-0035 establishes that sections receive `SectionProps` (`lang`, `sectionNumber`, `linkRegistry`, `pageOverride`). The contract should show `type MountainJourneySectionProps = SectionProps & { pageOverride: MountainJourneyProps }` or equivalent, matching the existing `SectionPageOverride<T>` helper at `packages/werkstatt-site/src/domain/share/page.ts:133`.

4. **File path error.** The file system responsibilities table lists `packages/werkstatt-site/src/domain/share/src/page.ts` but the actual path is `packages/werkstatt-site/src/domain/share/page.ts` (no `src/` subdirectory after `share/`).

## Axis B — DNA alignment

1. **DNA-37 composition not shown.** The RFC claims the section "accepts a single unified `SectionProps` interface, composing through the standard section framework" but the TypeScript contract does not reflect this. The `MountainJourneyProps` interface should be wrapped in `SectionProps.pageOverride`, not presented as a standalone prop shape. Existing sections like `hero` compose `propsSchemaCompose: [section-visual, section-header]` — the RFC should show the same composition.

## Axis C — Ecosystem fit

1. **`PLANET_IMPORT_PATHS` claim is factually wrong.** The RFC states "requires a manual entry for the new cosmic name" in `PLANET_IMPORT_PATHS`. Since RFC-0091, `PLANET_IMPORT_PATHS` is registry-derived from manifest files via `archetype.registry.build` (confirmed at `packages/werkstatt-site/src/domain/share/page.ts:160-163`: `...registryPlanetImportPaths`). No manual entry is needed — the registry auto-discovers the manifest's `cosmicName`. The RFC contradicts itself by also stating "registry-derived (RFC-0091)" in the same paragraph.

2. **Orchestrator integration bypassed.** All existing GSAP scripts are integrated into `OrchestrationOptions` in `packages/werkstatt-site/src/domain/share/scripts/orchestrator.ts` and dispatched by the orchestrator with `prefers-reduced-motion` guards and DOM guards (`has(selector)`). The RFC proposes a `mountain-journey-section.client.ts` that calls `initMountainJourneyAnimation` directly — this bypasses the orchestrator pattern. The RFC should either add an orchestrator option (`mountainJourney?: boolean`) or justify why the section-level client script is architecturally different from the existing GSAP scripts.

3. **LFS tracking claim is incorrect.** The RFC states ".gitattributes already tracks `*.webp` patterns; the asset is committed to the workpiece `public/assets/` directory." The actual `.gitattributes` only tracks `apps/**/*.webp` — there is no pattern for `missions/**/*.webp` or `packages/**/*.webp`. The mountain WebP asset in `missions/<active>/workpiece/public/assets/` would NOT be LFS-tracked by the current patterns. A new `.gitattributes` pattern is needed, or the asset should be placed under a path that is already tracked.

## Axis D — Forward-only compliance

No issues. The RFC is purely additive — new archetype, new script, new page. No backward compatibility layers, no shims, no dual-paths.

## Axis E — Agent-facing policy

1. **Missing `ecosystem.commit` guidance.** The RFC says "Agents MUST use `mission.git.commit` to commit edits in the warpgogol-com workpiece" but does not mention that platform-scope changes (`packages/werkstatt-site/**`) must be committed via `ecosystem.commit`, not `git commit`. The pre-commit hook blocks direct `git commit` for `packages/**`. The implementation notes should state this explicitly.

2. No NEEDS CLARIFICATION markers found. Status gate language is correct.

## Axis F — Pragmatism

1. **Animation config in block props is over-authored.** `cameraInitialZoom`, `cameraFinalZoom`, and `animationDuration` are GSAP animation parameters that content authors should not need to understand or configure per-page. These should be constants in `gsap-mountain-journey.ts` with sensible defaults (e.g. `initialZoom: 2.5`, `finalZoom: 1.0`, `duration: 3`), not block props. Only `backgroundImage`, `svgViewBox`, `routePath`, `stages`, `form`, and `workerEndpoint` are genuinely content-authored.

## Axis G — Blind spots

1. **Worker endpoint per-channel configuration.** The `workerEndpoint` prop is a string URL authored in block props. The RFC doesn't address how this endpoint varies across dev/alt/main channels. If the Worker URL differs per environment, hardcoding it in content means different content per channel — which violates the single-content principle. The endpoint should be resolved from environment configuration, not block props.

2. **Form submission security.** The RFC mentions native HTML5 `type="url"` validation but doesn't address rate limiting, CSRF protection, or payload size limits on the Worker endpoint. A publicly accessible POST endpoint that accepts `{ url: string }` is an abuse vector.

3. **SVG coordinate system coupling.** The `routePath` `d` attribute and `stages[].position` values are authored in block props but must match the mountain image dimensions. The RFC doesn't document how authors determine these coordinates or what happens when the image is replaced. A brief authoring guide reference would mitigate this.

4. **MotionPathPlugin bundle size.** The RFC mentions bundle size impact but doesn't estimate it. MotionPathPlugin is ~5KB minified+gzipped — worth noting for the risk assessment.

## Questions for the author

1. Which cosmic name from the PlanetCatalog will be assigned to `mountain-journey`? The `section.scaffold` command requires `--cosmicName`, and the archetype YAML requires `acceptedCosmicNames`.
2. Should the GSAP script be integrated into the orchestrator (`OrchestrationOptions.mountainJourney?: boolean`) like all other GSAP scripts, or is there a principled reason for the section-level client script pattern?
3. How will the `workerEndpoint` be resolved per-channel (dev/alt/main) without requiring different content per channel?
