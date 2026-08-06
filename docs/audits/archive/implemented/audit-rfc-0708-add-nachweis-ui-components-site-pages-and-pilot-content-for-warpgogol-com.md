---
rfcId: RFC-0708
auditId: AUDIT-RFC-0708-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0708

## Verdict: Needs revision

The RFC has a clear architectural fit with the block-declarative page model and PBP trust layer, but has a mechanical V-24 violation (empty `satisfies[]`), several gaps in component manifest/archetype registration, contradictory statements about route files, and unaddressed integration points for JSON endpoints and dynamic route static path generation.

## Mechanical validation (rfc.validate)

**Fail** — 1 violation:

- **V-24:** `satisfies: []` is empty. Architecture RFCs created on or after 2026-07-07 must declare at least one DNA invariant in `satisfies` (RFC-0331). Candidates: DNA-24 (block-declarative pages), DNA-17 (Mirror Quintet manifest contract), DNA-23 (cosmic overlay).

## Axis A — Structural completeness

1. **Manifest filename convention mismatch.** The file system table lists `nachweis-card.manifest.yaml`, but `packages/ui/AGENTS.md` requires `<slug>-component.manifest.yaml` for new components. The correct filenames are `nachweis-card-component.manifest.yaml`, `nachweis-list-component.manifest.yaml`, etc.

2. **Missing `cosmicName` assignment.** Each component manifest requires a `cosmicName` from `MoonCatalog` (DNA-17, DNA-23). The RFC does not assign moon names to any of the 4 components. Five moon names are passport-reserved (Methone, Bianca, Klarissa, Adrastea, Despina) and must not be used.

3. **Missing `archetype` field for manifests.** Component manifests require an `archetype` field that resolves to an entry in `packages/ontology/archetypes/`. No `nachweis` archetype exists. The RFC does not explain whether these components register under an existing archetype or whether a new archetype must be created (which would require `section.scaffold` / `component.scaffold` or a manual archetype entry).

4. **Contradictory route file statements.** The architectural fit section states "No `.astro` route files needed for static pages; dynamic routes use `[...slug].astro` pattern." But the Risks section says "add specific route files `src/pages/nachweise/[slug].astro` and `src/pages/nachweise/verify/[version].astro` that take precedence over the catch-all." These two statements contradict each other.

5. **`commands.changed: [routes.generate]` is unexplained.** The RFC lists `routes.generate` as changed but does not describe what changes are needed. If Nachweis pages are standard `system.md` page entries, `routes.generate` already handles them. If JSON endpoints or dynamic param resolution require changes, the RFC must specify them.

6. **`nachweis-status` and `nachweis-manifest` are not block-declarative pages.** These are a JSON endpoint and a static file serve, respectively. Listing them as `system.md` page entries with `blocks: []` does not fit the block-declarative page model (DNA-24 requires `kind: page` with ≥1 block). The RFC does not explain how the route registry or `[...slug].astro` would handle JSON output or static file serving.

## Axis B — DNA alignment

1. **Empty `satisfies[]` (V-24).** The RFC body references DNA-23 ("Component three-way mirror") and DNA-24 ("Block-declarative pages") but does not list them in `satisfies[]`. Both are directly enforced by this RFC's component and page design.

2. **No DNA conflict detected.** The RFC extends the existing page and component model without contradicting any invariant.

## Axis C — Ecosystem fit

1. **Missing archetype registry registration.** New components under `packages/ui/src/components/` are discovered by `deriveImportPathMaps` (in `packages/os/site-kernel-checks/src/archetype/shared.ts`) which reads manifests and feeds `planetImportPaths` and `blockTypeToCosmicName`. The RFC does not mention running `archetype.registry.build` or how the import paths for `nachweis-list`, `nachweis-detail`, `nachweis-verify` will be registered so `buildPage` can resolve them.

2. **Incomplete surface module declaration.** The RFC mentions `entitlement: "nachweis"` and `blueprints: [nachweis-list, nachweis-detail, nachweis-verify]` but the `surfaceModuleContextSchema` (in `packages/surface/src/module-context.ts`) requires additional fields: `masterLocale`, `publishedLocales`, and optionally `context`, `indexBudget`, `generation`, `approval`, `localization`. The RFC does not provide the full `surface.modules` declaration.

3. **`packagesImpacted` over-declared.** `@warpgogol/pbp` is listed but this RFC creates PBP content files, not package changes (schema extensions are in RFC-0706). `@warpgogol/share` is listed but the RFC does not explain what changes to the package are needed. Only `@warpgogol/ui` is genuinely impacted (new components).

4. **`cosmicStar: Fomalhaut` reused for all 5 pages.** `Fomalhaut` is a valid `StarCatalog` entry (confirmed), but using the same star for 5 distinct page entries is unusual. The RFC should justify this or assign distinct stars.

5. **No AGENTS.md update identified.** The RFC does not mention whether `packages/ui/AGENTS.md` needs updates for the new Nachweis component conventions (e.g., accessibility requirements, public copy constraints).

## Axis D — Forward-only compliance

No issues. All components, pages, and content are new. No compatibility layers, no dual paths, no legacy code maintained behind flags.

## Axis E — Agent-facing policy

1. **Status gate is correct.** The RFC states "Agents MAY implement code changes ONLY when this RFC has status: accepted" and references RFC-0224 for the accepted→implemented transition.

2. **Operator consent for publication is explicit.** "Agents MUST NOT publish pilot records without explicit operator consent" — good.

3. **Content authoring is structured, not prose.** PBP content files are YAML frontmatter with defined schemas. The SHA-256 hashes are provided. Agents can create these without human authoring. Pass.

4. **Storage policy.** No cookies, no client-side persistence. Pass.

## Axis F — Pragmatism

1. **JSON endpoint as block-declarative page is over-engineering.** `nachweis-status` (`/nachweise/status/[id].json`) is a JSON API endpoint. In Astro, this requires a dedicated route file (e.g., `src/pages/nachweise/status/[id].json.ts`), not a `system.md` page entry with `blocks: []`. Similarly, `nachweis-manifest` serves a static file from `public/` — it does not need a page entry at all. Including both as `system.md` pages adds route registry complexity for no benefit.

2. **4 components is justified.** Card, list, detail, and verify have distinct data shapes and responsibilities. The alternatives section adequately justifies not combining them.

3. **`nonGoals` are explicit and meaningful.** The deferral of contextual projections, redacted PDF generation, and consent form templates is well-scoped.

## Axis G — Blind spots

1. **Dynamic route `getStaticPaths` not addressed.** `/nachweise/[slug]/` requires `getStaticPaths` to enumerate all slugs. For preview records, detail pages should not be generated. But the route registry iterates `system.md pages[]` entries, not PBP content. The RFC does not explain how `getStaticPaths` will resolve Nachweis slugs from PBP content, or how preview records are excluded from path generation.

2. **404 behavior for preview records.** The RFC says "detail pages are not generated for preview records" but does not explain what happens when a visitor navigates to `/nachweise/nicaragua-projekt/` — is it a 404, a redirect, or a "not yet published" message?

3. **Route conflict with `[...slug].astro` not resolved.** The RFC identifies the risk but the mitigation (specific route files) contradicts the architectural fit statement (no route files needed). The actual behavior of Astro's routing priority between `[...slug].astro` and more specific routes like `[lang]/nachweise/[slug].astro` is not analyzed.

4. **Entitlement gating of routes.** The RFC says "Nachweis pages are only generated when the `nachweis` entitlement is resolved." But the route registry (`getRouteRegistry` in `packages/share/src/astro/routes/registry.ts`) gates routes by checking `entitledFeatures` for specific patterns (e.g., `blog` gates `semanticType: "article"`). The RFC does not explain how Nachweis routes are gated — is it by `semanticType`, by a page-level flag, or by the surface module entitlement check?

5. **Component reusability and hardcoded copy.** The RFC acknowledges the risk of hardcoding "Verfahren dokumentiert durch Warpgogol" but the mitigation ("use `system.md` site name variable") is vague — no concrete i18n label mechanism is specified.

## Questions for the author

1. What archetype will the 4 Nachweis components register under? Does a new archetype need to be created in `packages/ontology/archetypes/`, and if so, does it require an RFC or can it be added as part of this RFC?

2. How will `getStaticPaths` for `/nachweise/[slug]/` enumerate slugs from PBP content, and how will preview records be excluded from path generation?

3. How will `nachweis-status` (JSON endpoint) and `nachweis-manifest` (static file) be served — as dedicated Astro route files outside the `system.md` page model, or does `routes.generate` need changes to support non-HTML page entries?
