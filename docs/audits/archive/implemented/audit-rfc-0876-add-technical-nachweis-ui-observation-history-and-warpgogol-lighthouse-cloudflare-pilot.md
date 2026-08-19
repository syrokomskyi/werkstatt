---
rfcId: RFC-0876
auditId: AUDIT-RFC-0876-01
date: 2026-08-18
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0876

## Verdict: Needs revision

The RFC has a clear architectural direction but is missing five required sections (Design, Rollout, Alternatives considered, Risks, Implementation notes for agents) and has unresolved type definition gaps. The discriminated union design is asymmetric — attestation cards lack a discriminant field. The data flow for dynamic homepage projection and observation history is unspecified.

## Mechanical validation (rfc.validate)

Pass with warnings. No errors. Six warnings:

- V-13: Missing `## Design`
- V-13: Missing `## Rollout`
- V-13: Missing `## Alternatives considered`
- V-13: Missing `## Risks`
- V-13: Missing `## Implementation notes for agents`
- V-19: `amends` includes RFC-0708 and RFC-0716, but neither RFC's `amendedBy` includes RFC-0876

## Axis A — Structural completeness

- **Missing required sections**: `## Design`, `## Rollout`, `## Alternatives considered`, `## Risks`, `## Implementation notes for agents` are all absent. The RFC has only Context, Decision, and Acceptance criteria.
- **No TypeScript contracts section**: Inline types in the Decision are partial — `NachweisAssessmentDimension` is referenced but never defined. The existing `AssessmentBundleV1["result"]["dimensions"]` type in `@/packages/werkstatt/src/nachweis/nachweis-io.ts:521-533` defines the dimension shape; the RFC should either reference it or define a UI-specific projection.
- **No file system responsibilities table**: The RFC touches component files in `packages/werkstatt-site/src/domain/ui/components/nachweis-*/`, content files in the warpgogol-com system, and route files in `nachweis-routes.ts`, but doesn't list them.
- **No failure modes**: No error conditions described for the UI layer (e.g. what happens when manifest data is missing, when a technical record references a non-existent series).
- **Acceptance criteria** are checkable but some conflate code changes with operational steps: "Lighthouse pilot is rerun canonically" and "Cloudflare pilot is rerun via API" require live execution, not just code.

## Axis B — DNA alignment

- **`satisfies: [DNA-24]`** — DNA-24 (Block-declarative pages) is listed but the RFC body never explains how it satisfies or extends it. The RFC says "Keep the existing routes and block-declarative model" which preserves DNA-24, but the audit needs the RFC to state this explicitly.
- **Missing DNA references**: The RFC touches UI components with semantic HTML and accessibility requirements (WCAG 2.2 AA, §13) but doesn't reference DNA-17 or DNA-23 (cosmic overlay/manifest). The components have `manifest.yaml` files with `cosmicName` entries — the RFC should confirm cosmic naming is preserved.
- **No DNA conflict** detected — the RFC extends existing components without superseding any DNA invariant.

## Axis C — Ecosystem fit

- **Package boundaries**: `packagesImpacted: ["@warpgogol/werkstatt-site"]` is correct for UI components. `appsImpacted: ["warpgogol-com"]` is listed but the RFC doesn't describe the content file changes needed in the warpgogol-com system (homepage blocks, footer, /nachweise/ page content).
- **Compass sync**: No mention of which `docs/*.xml` files need synchronization. If the RFC changes the `/nachweise/` page structure or adds new block types, `docs/verification-plan.xml` and `docs/source-markup.xml` may need updates.
- **AGENTS.md updates**: No mention of which AGENTS.md files need rule updates. `packages/werkstatt-site/AGENTS.md` should document the new technical-assessment variant.
- **`amendedBy` reciprocation**: RFC-0708 and RFC-0716 need `amendedBy: [RFC-0876]` added to their frontmatter. The RFC doesn't mention this.
- **Command lifecycle**: All command buckets are empty — correct for a UI-only RFC.

## Axis D — Forward-only compliance

- **Asymmetric discriminated union**: The RFC declares `type NachweisCardProps = NachweisAttestationCardProps | NachweisTechnicalAssessmentCardProps` but only the technical variant has `variant: "technical-assessment"`. The attestation variant has no discriminant field. "Existing attestation props remain compatible" implies attestation cards won't get a `variant` field — this is not a clean discriminated union. For forward-only correctness, the attestation variant should get `variant: "attestation"` and all existing call sites should be updated. The RFC should state this explicitly or justify the asymmetric design.
- **No compatibility shim proposed** — good. The RFC extends components directly.

## Axis E — Agent-facing policy

- **Missing `## Implementation notes for agents`**: This is a required section and critical for agent guidance. The RFC contains many implicit rules (don't seed screenshot values, don't call `nachweis.consent.update`, don't use `aktuell` for stale records) that belong in this section.
- **Operational vs code changes**: Acceptance criteria mix code changes (component extensions, registry sections) with operational steps (run Lighthouse, run Cloudflare API, complete N3 publication). The RFC should distinguish which acceptance criteria are code-verifiable and which require operator execution.
- **No self-authorizing language** — the RFC is in `draft` and doesn't grant implementation permission. OK.
- **No NEEDS CLARIFICATION markers** found.

## Axis F — Pragmatism

- **`NachweisAssessmentDimension` undefined**: The type is referenced in `NachweisTechnicalAssessmentCardProps` but never defined. It should either be defined inline or referenced from the existing `AssessmentBundleV1` schema in `@/packages/werkstatt/src/nachweis/nachweis-io.ts:521-533`.
- **`title: Record<string, string>` inconsistency**: The technical variant uses `title: Record<string, string>` (multi-language) while the existing attestation card uses `title: string` (single language, rendered per-locale by the page). This inconsistency needs justification — why does the technical card carry multi-language titles when the attestation card doesn't?
- **`sourceHashes: string[]`**: Unclear relationship to the Sichtpass hashes in `nachweis-detail`. Are these the same hashes? If so, why duplicate them in the card props? If not, what are they?
- **`kindFilter` on `NachweisListProps`**: The registry page renders two separate sections (technical + attestation). If the page just renders two separate lists, `kindFilter` is unnecessary. Justify its existence or remove it.

## Axis G — Blind spots

- **Data flow for dynamic homepage projection**: The RFC says "The component reads published records; no scores are copied manually into `home.md`" but doesn't describe how. Does the homepage block read from `public/nachweise/manifest.json`? From PBP entities via `getCollection("business-profile")`? From the nachweis routes enumerator? The build-time vs runtime distinction is critical — Astro is SSG, so "dynamic" means "resolved at build time from published data", not client-side fetching.
- **Observation history data source**: "Data comes from published immutable observations sharing `seriesId`" — but where are these stored? PBP entities? Bordbuch? The manifest? The `nachweis-routes.ts` enumerator currently filters by `status: published` but doesn't group by `seriesId`. The RFC doesn't describe how history rows are resolved.
- **Migration path for existing `/nachweise/` content**: The existing page has attestation-only content. How does it transition to the umbrella registry with two sections? Does existing content need to be restructured? The RFC doesn't describe this.
- **Empty state for technical section**: What happens when no technical assessments are published yet? The RFC says the homepage falls back to a "neutral process explanation", but the `/nachweise/` registry page should also handle the empty technical section gracefully.
- **`NachweisListProps.variant: "compact"`**: The RFC says compact "reduces explanatory detail for contextual projection" but doesn't define which fields are omitted. This is implementation-critical — the compact variant is used on the homepage.

## Questions for the author

1. How does the homepage block read published records at build time — from `manifest.json`, from PBP `getCollection`, or from the route enumerator? Specify the data flow.
2. Where are observation history rows stored and how are they queried by `seriesId`? PBP entities, Bordbuch, or the manifest?
3. Should the attestation variant get `variant: "attestation"` for a clean discriminated union, or is the asymmetric design (no discriminant on attestation) intentional?
