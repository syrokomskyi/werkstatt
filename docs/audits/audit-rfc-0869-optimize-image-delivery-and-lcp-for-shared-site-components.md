---
rfcId: RFC-0869
auditId: AUDIT-RFC-0869-01
date: 2026-08-17
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0869

## Verdict: Needs revision

The RFC correctly identifies the root causes of the Lighthouse image-delivery failure and proposes a sound default quality change. However, it lists `image.variants.generate` in `commands.changed` without proposing any code changes to the command, lists `werkstatt-shared` in `packagesImpacted` while explicitly stating no changes to it, and includes two speculative investigation tasks (CSP, forced reflow) without concrete decisions. The default quality change affects 13 `ResponsiveImage` call sites but the RFC only addresses 3.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0869 --json` returned 0 violations.

## Axis A — Structural completeness

- **Decision is not a single decision for CSP and reflow.** The Decision says "The CSP in `_headers.template` is investigated and corrected" and "The forced reflow source is identified and fixed." These are investigation tasks, not decisions. A decision must state what will change, not that something will be investigated. The RFC should either make a concrete decision (e.g. "The `resolveCspScriptSrcExtra` function is removed when proxyBaseUrl is same-origin") or defer these to separate RFCs/ADRs after investigation.
- **Acceptance criteria for CSP and reflow are not checkable.** "CSP issue investigated and fixed (or documented as non-actionable)" and "Forced reflow source identified and fixed (or documented as third-party)" contain escape hatches that make them unverifiable. An acceptance criterion must have a clear pass/fail condition.
- **`commands.changed` lists `image.variants.generate` but no code change is described.** The command already exists (`packages/werkstatt-site/src/checks/image-variants.ts`), already runs in `build.prepare` (`checks/pipelines/build-prepare.ts:133`), and the RFC explicitly says "The provider algorithm itself is unchanged." The `commands.changed` bucket should be empty — the issue is operational (manifest not committed), not a code change.

## Axis B — DNA alignment

- **DNA-67 is correctly referenced.** The RFC explains how it addresses `image-delivery-insight`, `largest-contentful-paint`, `inspector-issues`, and `forced-reflow-insight` audits. The `satisfies: [DNA-67]` entry is valid and exists in `docs/architecture-dna.md:283-285`.
- No issues with DNA alignment.

## Axis C — Ecosystem fit

- **`packagesImpacted` includes `werkstatt-shared` but the RFC says no changes to it.** The file system responsibilities table states `packages/werkstatt-shared/src/share/image-provider.ts | No changes — provider algorithm is unchanged`. `werkstatt-shared` should be removed from `packagesImpacted`.
- **No AGENTS.md updates identified.** Changing the `ResponsiveImage` default quality from `"max"` to `90` is a shared component contract change. The RFC should identify whether `packages/werkstatt-site/AGENTS.md` needs a rule update (e.g. "content images MUST pass `quality='max'` explicitly").
- **No Compass sync identified.** If the default quality change affects `docs/styling.xml` or `docs/source-markup.xml`, the RFC should list them.
- **`commands.changed` bucket is incorrect.** See Axis A — the command code is unchanged.

## Axis D — Forward-only compliance

- No issues. The default quality change is a direct replacement, not a dual-path. No backward compatibility layers proposed.

## Axis E — Agent-facing policy

- **Status gate is correct.** The RFC is `draft` and states "Agents MAY implement code changes ONLY when this RFC has status: accepted."
- **No NEEDS CLARIFICATION markers.** None found.
- **Implementation notes are mostly clear** but the instruction "audit all ResponsiveImage call sites and add `quality='max'` where fidelity matters" is vague — it doesn't list which call sites need `quality="max"` and which are decorative. With 13 files using `ResponsiveImage`, this is a significant scope gap.

## Axis F — Pragmatism

- **CSP and forced reflow are speculative scope.** Including investigation tasks in an architecture RFC blurs the line between decision and exploration. If the investigation outcome is unknown, these should be split into a separate ADR or deferred until the investigation completes. The core RFC (quality default + widths/sizes + manifest) is self-sufficient.
- **`commands.changed` is imprecise.** Listing `image.variants.generate` implies code changes to the command, but the RFC only wants the manifest to be committed. The actual change is operational (commit the generated file), not a command code change.

## Axis G — Blind spots

- **13 `ResponsiveImage` call sites affected by default quality change, only 3 addressed.** The grep found 13 `.astro` files using `ResponsiveImage`: `live-photo.astro` (5 matches), `footer-component.astro` (4), `media.astro` (4), `hero-section.astro` (4), `section-image.astro` (3), `hero-decision-card-section.astro` (3), `brand-label-component.astro` (2), `footer-promo-component.astro` (2), `section-card-grid.astro` (2), `section-shell.astro` (2), `site-background-component.astro` (2), `credits-gallery-section.astro` (2), `women-section.astro` (2). The RFC must audit all 13 and specify which get `quality="max"` and which use the new default.
- **Manifest commitment mechanism unspecified.** The RFC says `image-variants.generated.yaml` "must be committed in the Sternsystem cache clone" but doesn't describe how. The `image.variants.generate` command writes to `src/image-variants.generated.yaml` in the app directory. Who commits it — `mission.git.commit`? Is it automatic or manual? The `generator-ownership.ts` registry (`checks/generator-ownership.ts:692-698`) already lists `public/_img/**/*.webp` as owned by `image.variants.generate` with `markerPolicy: "registry-only"`, but `src/image-variants.generated.yaml` is not listed there. The RFC should clarify the ownership and commit flow.
- **Cross-site impact of quality default change.** All Sternsystemen using `werkstatt-site` will have image quality change from 100 to 90. The RFC frames this as warpgogol-com-specific but the change affects every site. The rollout section should acknowledge this and confirm no site has content images that would visibly degrade.
- **Forced reflow suppression.** If the reflow source is third-party (Matomo), the RFC says "documented as third-party" but doesn't specify whether a suppression mechanism exists (e.g. `.lighthouse-budget-ignore` or a CSP-level script deferral).

## Questions for the author

1. Which of the 13 `ResponsiveImage` call sites need `quality="max"` and which are decorative? The RFC must list them explicitly — "audit all call sites" is an instruction to the agent, not a decision.
2. What is the concrete CSP decision? If `proxyBaseUrl` is same-origin, will `resolveCspScriptSrcExtra` be removed or made to return `""` for same-origin? If cross-origin, is the CSP correct and the issue is elsewhere?
3. How does `image-variants.generated.yaml` get committed in the cache clone? Is it via `mission.git.commit` after `build.prepare`, or does `generator-ownership.ts` need a new entry for `src/image-variants.generated.yaml`?
