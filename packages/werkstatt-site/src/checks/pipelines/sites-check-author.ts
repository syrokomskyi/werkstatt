/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not access apps/&lt;id&gt;/dist/ or rendered HTML.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from module.ts to shrink the registration surface.</item>
  <item>RFC-0600: added generated.stale.validate after generated.files.validate.</item>
</CHANGE_SUMMARY>
*/

import type { KernelPipelineStep } from "@warpgogol/werkstatt/kernel";

export const SITES_CHECK_AUTHOR_PIPELINE: KernelPipelineStep[] = [
  // Wave 0 (RFC-0023): Uni UI Ontology manifest contract + registry freshness
  // NOTE: manifest.contract.validate and mirror.quintet.validate are workspace-scoped (packages/ui only)
  // and run in STANDARD_BUILD_PREPARE_PIPELINE before uni.registry.build
  { command: "uni.registry.validate" },
  // Wave 0 (RFC-0025): Cosmic overlay + feature-first layout contract
  { command: "app.layout.validate" },
  { command: "system.manifest.validate" },
  { command: "biome.contract.validate" },
  { command: "cosmic.catalog.validate" },
  { command: "cosmic.name.unique" },
  { command: "constellation.compose.validate" },
  { command: "client.edit.validate" },
  // RFC-0047: CMS-friendly thin app content surface
  { command: "content.surface.validate" },
  // RFC-0248: shared runtime/static content-asset resolution contract.
  { command: "content.asset.contract.validate" },
  // RFC-0141: Content Source Provider seam — fs/on-disk parity guard (fail-hard) and
  // asset-reference resolution (warning mode until all apps are clean).
  { command: "content.source.parity" },
  { command: "asset.reference.validate" },
  // RFC-0250: semantic page targets must fail as diagnostics before Astro render warnings.
  { command: "semantic.targets.validate" },
  // Wave 0 (RFC-0026): Block-declarative pages + RuntimeContext pipeline
  { command: "page.block.validate" },
  // RFC-0205: localized twin prop parity (deepMergeEntryData array-replacement guard)
  { command: "page.blocks.mirror.validate" },
  { command: "shared.context.validate" },
  // RFC-0036: Shell-level block validation (background, header, footer)
  { command: "page.shell.validate" },
  { command: "visibility.expr.validate" },
  { command: "page.pipeline.contract" },
  { command: "runtime.context.shape" },
  // Wave 0 (RFC-0027): Growth layer — events, funnels, experiments, vendor adapter
  { command: "growth.events.validate" },
  { command: "growth.funnel.validate" },
  { command: "growth.experiment.validate" },
  { command: "growth.experiment.archive" },
  { command: "growth.adapter.contract" },
  { command: "growth.vendor.resolve" },
  // Wave 0 (RFC-0028): Cosmic Passport — author-time emission only.
  // passport.verify (which reads dist/.well-known/cosmic-passport.json) lives in SITES_CHECK_POSTBUILD_PIPELINE.
  { command: "nebula.score.compute" },
  { command: "star-map.render" },
  { command: "passport.emit" },
  // Wave 1-2: structural integrity
  { command: "naming.convention.lint" },
  // RFC-0030: envelope lint — prevent regression to flat result shape
  { command: "kernel.result.envelope.lint" },
  // Wave 3: semantic integrity
  { command: "route.thin.validate" },
  // RFC-0160: unprefixed default-language routing topology (author-time; reads
  // system.md + route files, no dist access).
  { command: "route.topology.validate" },
  // RFC-0183: Feature Policy in existing RFC-0047 content domains.
  { command: "feature.policy.validate" },
  { command: "feature.visibility.validate" },
  // Wave 3.5: RFC-0019 page hierarchy integrity
  { command: "structure.hierarchy.validate" },
  { command: "navigation.section.validate" },
  // Wave 4: layer-specific naming
  { command: "naming.pages.lint" },
  // Wave 4.5: RFC-0020 layer-suffix contract enforcement
  { command: "naming.suffixes.lint" },
  { command: "naming.layouts.lint" },
  // Wave 4.6: RFC-0021 layouts content layer validation
  { command: "content.layouts.validate" },
  // Wave 5: layer-specific placement
  { command: "naming.components.lint" },
  { command: "naming.styles.lint" },
  { command: "assets.structure.lint" },
  { command: "scripts.placement.validate" },
  // Schema integrity (RFC-0033, RFC-0034)
  { command: "schema.drift.validate" },
  { command: "content-types.validate" },
  // RFC-0169: resolved entitlements match the closed feature catalog
  { command: "entitlements.validate" },
  // RFC-0193: blueprints validate against schema + app datasets (before surface.validate's artifact check)
  { command: "blueprint.validate" },
  // RFC-0271: module-owned Blueprint contexts (master locale, entitlement, generation policy)
  { command: "surface.context.validate" },
  // RFC-0272/RFC-0273: translated artifacts require approved notes/glossaries and sourceHash lineage
  { command: "surface.translation.notes.validate" },
  { command: "surface.translation.glossary.validate" },
  { command: "surface.translation.validate" },
  { command: "surface.translation.qa.validate" },
  // RFC-0278/RFC-0279/RFC-0285: autonomy levels, review logs, and escalation budgets
  { command: "autonomy.level.validate" },
  { command: "surface.review.validate" },
  { command: "escalation.budget.validate" },
  // RFC-0473: append-only operational ledger integrity (workspace-scoped, --system injected from site context)
  { command: "bordbuch.validate" },
  // RFC-0237: shared geo catalog integrity (country, region, city slugByLang)
  { command: "geo.catalog.validate" },
  // RFC-0192: the generated Programmatic Surface artifact is internally consistent
  { command: "surface.validate" },
  // RFC-0490: depth-0 pillar hub configuration and commercial-promise guard
  { command: "surface.hub.validate" },
  // RFC-0500: ratgeber editorial knowledge hub validation
  { command: "ratgeber.hub.validate" },
  // RFC-0492: depth-1 industry dossier publication gate + claim policy (warn mode initially)
  { command: "surface.industry.validate" },
  // RFC-0496: depth-1 service dossier publication gate + claim policy (warn mode initially)
  { command: "surface.service.validate" },
  // RFC-0497: depth-5 intersection gate + substance independence (warn mode initially)
  { command: "surface.intersection.validate" },
  // RFC-0497: depth-5 intersection diagnostic report (advisory, always exits 0)
  { command: "surface.intersection.report" },
  // RFC-0492: depth-4 city page doorway risk diagnostic (warn unless threshold exceeded)
  { command: "surface.doorway-risk.report" },
  // RFC-0492: depth-1 industry duplicate-content report (blocks when similarity > threshold)
  { command: "surface.duplicate-content.report" },
  // RFC-0280/RFC-0281: demand signals and Werk records must be valid before evidence gates read them
  { command: "demand.signal.validate" },
  { command: "werk.record.validate" },
  // RFC-0274: evidence and duplicate gates harden PSEO indexability beyond structural substance
  { command: "surface.evidence.validate" },
  { command: "surface.duplicate.validate" },
  // RFC-0282/RFC-0283: realized visibility loop and breaker reflex (offline snapshots only)
  { command: "visibility.reconcile" },
  { command: "visibility.action.plan" },
  { command: "pseo.proof.validate" },
  { command: "surface.breaker.evaluate" },
  // RFC-0194: substance / thin-content / budget / orphan-link quality gate
  { command: "pseo.validate" },
  // RFC-0238: demand records must not use intent-modifier slugs (price, urgent, near, best, etc.)
  { command: "demand.modifier.lint" },
  // RFC-0244: demand records must sit at canonical folder levels (1/2/3 segments) with collision-free derived slugs
  { command: "demands.hierarchy.validate" },
  // RFC-0239: offer pages must not declare a foreign provider
  { command: "offer.provider.validate" },
  // RFC-0240: compiled modules must be covered by resolved entitlements
  { command: "entitlement.module.validate" },
  // RFC-0240: trust rating only on Sternsystem with provenance-backed reviews
  { command: "trust.rating.validate" },
  // RFC-0241: HDRI must be cited as external, never presented as a studio project/brand
  { command: "hdri.firewall.validate" },
  // RFC-0242: Bodenstation voice enforcement (no LocalBusiness, no aggregateRating, no impersonation)
  { command: "bodenstation.voice.validate" },
  // RFC-0229: breadcrumb hierarchy integrity (authored parent chain + surface ancestor routes)
  { command: "breadcrumb.trail.validate" },
  // RFC-0197: enriched content provenance + approval shape
  { command: "enrich.validate" },
  // RFC-0171: the selected content-source adapter is implemented
  { command: "content.source.validate" },
  // RFC-0171: the generated Decap CMS config must not drift from the content schemas
  // (no-op pass for filesystem-adapter apps).
  { command: "cms.schema.parity" },
  // RFC-0167: article contract (dates, tags, author) for the sellable blog module
  { command: "blog.validate" },
  // RFC-0325: dated editorial article substance (word floor, heading content, feed/twin parity)
  { command: "article.depth.validate" },
  // RFC-0508: canonical Participant record contract for the People module
  { command: "participant.validate" },
  // RFC-0509: team hub page structure and founder retirement validation
  { command: "team.hub.validate" },
  // RFC-0510: human profile page structure (six-block, prose files, consent gating)
  { command: "participant.profile.validate" },
  // RFC-0511: AI-agent profile page structure (seven-block, accountable human, prose files)
  { command: "participant.ai-agent.validate" },
  // RFC-0513: team lifecycle validation (status transitions, CTA removal, review cadence)
  { command: "team.lifecycle.validate" },
  // RFC-0475: canonical FAQ entry contract
  { command: "faq.validate" },
  // RFC-0202: living-photos media contract (live image ⇒ sibling .webm; .webm ⇒ sibling poster)
  { command: "live.media.validate" },
  // RFC-0210: unified media contract — explicit-source governance (feature/background)
  { command: "video.media.validate" },
  // RFC-0220: published materials must carry deploy-blocking credits.
  { command: "material.credits.validate" },
  // RFC-0236: catch manual edits in generated credits.md before they reach CI.
  { command: "material.credits.drift.validate" },
  // RFC-0226: embedded content credentials (graceful skip when exiftool/c2patool absent).
  { command: "material.metadata.validate" },
  // RFC-0168: Integration Port governance — adapter ids ∈ catalog; required secrets declared
  { command: "integration.config.validate" },
  { command: "integration.secrets.validate" },
  // RFC-0287: Agent Knowledge files — privacy boundary, envelope validity, generator parity
  { command: "agent.knowledge.validate" },
  // RFC-0288: closed capability catalog — schema, human parity (AS-2), entitlement/section gating
  { command: "agent.capability.validate" },
  // RFC-0286: Agent Surface Manifest invariants (privacy boundary, bijection, entitlement gating)
  { command: "agent.surface.validate" },
  // RFC-0289: OpenAPI projection — well-formedness + manifest↔document bijection
  { command: "agent.openapi.validate" },
  // RFC-0783: API Catalog — well-formedness + manifest↔linkset bijection
  { command: "agent.api-catalog.validate" },
  // RFC-0783: MCP Server Card — well-formedness + manifest↔card bijection
  { command: "agent.mcp-card.validate" },
  // RFC-0308: verify detached Ed25519 proofs on agent surface artifacts (non-failing when unsigned).
  { command: "agent.surface.verify" },
  // RFC-0186: Lagebild shared sync worker validation (no per-site Workers)
  { command: "lagebild.validate" },
  // RFC-0188: Visitor Sales Funnel governance. funnel.stage.validate always self-tests the
  // platform graph; the rest no-op pass until a site enables the funnel block / funnel content.
  { command: "funnel.contract.validate" },
  { command: "funnel.stage.validate" },
  { command: "funnel.copy.validate" },
  { command: "funnel.lagebild.validate" },
  // RFC-0190: the org graph is written through the supabase-buffer destination.
  { command: "funnel.org.validate" },
  // RFC-0191: Stripe billing wiring + secrets (no-op pass until Stripe is a funnel source).
  { command: "billing.config.validate" },
  { command: "billing.secrets.validate" },
  // RFC-0181: forbid Cloudflare KV/Queues (cannot be EU-pinned) — EU delivery is Upstash
  { command: "cloudflare.residency.validate" },
  // RFC-0182: live Cloudflare Regional Services validation per hostname
  // TEMPORARILY EXCLUDED from pipeline: Cloudflare API token permission model does not expose
  // a read-only permission for the regional hostnames endpoint (returns 403 even with Zone:Read).
  // Re-enable after Cloudflare adds Regional Services read permission or when using Zone:Edit.
  // { command: "cloudflare.regional-services.validate" },
  // RFC-0175: chat widget config — adapter id ∈ catalog; required public options present
  { command: "chat.config.validate" },
  // RFC-0177: processor + recipients disclosure + DPA reference when a widget/destination is configured
  { command: "legal.processors.validate" },
  // RFC-0168 (Session C): gentle live/dormant secrets advisory — never fails the build
  { command: "integration.secrets.audit" },
  // RFC-0168 (Session C): leak guard — .env.example values must stay empty
  { command: "env.example.validate" },
  // RFC-0346 (DNA-40): env-and-deploy contract — .env.example presence, comments, README reference
  { command: "env.contract.validate" },
  // RFC-0388 (DNA-40): deploy scripts — canonical scripts in systems and services package.json
  { command: "deploy.scripts.validate" },
  // RFC-0317: source-backed update stamps — no build-date or mtime lastmod
  { command: "content.update-stamps.validate" },
  // Accepted public-readiness RFCs: generated public artifacts and declarations.
  { command: "indexnow.key.validate" },
  { command: "humans.validate" },
  { command: "ai.policy.validate" },
  { command: "security.txt.validate" },
  { command: "public.icons.validate" },
  { command: "not-found.validate" },
  { command: "headers.security.validate" },
  { command: "public.artifact.validate" },
  { command: "public.declaration.validate" },
  { command: "redirect.map.validate" },
  { command: "public.surface.lint" },
  // RFC-0078: app boilerplate freshness gate (warn-level by default; hard-fail in --strict)
  { command: "app.boilerplate.validate" },
  // RFC-0081: generated-file marker protocol — author-time generated files only here.
  // RFC-0085: build-only files (public/sitemap.xml, public/llms.txt, public/llms-full.txt)
  // are checked in SITES_CHECK_POSTBUILD_PIPELINE via the same command with --phase=postbuild.
  { command: "generated.marker.validate", args: ["--phase=author"] },
  // RFC-0375: verify all registry-declared generated files exist on disk
  { command: "generated.files.validate" },
  // RFC-0612: detect registry drift between GENERATOR_OWNERSHIP_MAP and files on disk
  { command: "ownership.sync.validate" },
  // RFC-0600: detect orphaned files in public/ not produced by any registered generator
  { command: "generated.stale.validate" },
  // RFC-0150: content-driven OG preview image validation
  { command: "preview.images.validate" },
  // RFC-0073: content discipline validators
  { command: "pbp.content.validate" },
  { command: "offer.capacity.validate" },
  // RFC-0570: warn-level hardcoded formula detection (before reference validation)
  { command: "content.formula.lint" },
  { command: "content.references.validate" },
  // RFC-0487: B2B-only business model compliance (no-op when businessModel absent)
  { command: "b2b.model.validate" },
  // RFC-0212: Content Knowledge Lifecycle — claim sidecar shape + field-path resolution
  { command: "content.claim.validate" },
  // RFC-0323: comparative commercial claims require source, Stand date, and review gate
  { command: "comparative.claim.validate" },
  // RFC-0213: authored-content freshness (expired blocking claims fail; rest warn/info)
  { command: "content.freshness.validate" },
  // RFC-0215: derived-content staleness (translations/copies drifted from source)
  { command: "content.derived.validate" },
  // RFC-0214: source descriptor registry + claim sourceRef resolution + monitor divergences
  { command: "source.binding.validate" },
  // RFC-0206: content link and anchor validation
  { command: "content.links.validate" },
  // DNA-13/9: feature link/projection integrity (feature.graph.validate excluded —
  // src/content/features removed by RFC-0047/RFC-0183; links+projections still valid)
  { command: "feature.references.validate" },
  { command: "feature.links.validate" },
  { command: "feature.projections.validate" },
  // DNA-20: business layer completeness
  { command: "pbp.profile.validate" },
  // ADR-0032: RFC-0468 migration register and coverage report validation
  { command: "pbp.migration.validate" },
  // RFC-0156: validate authored effects[] assignments (target×kind, duplicate-stack)
  { command: "effects.contract.validate" },
  { command: "content.voice.lint" },
  // RFC-0235: advisory — surface AI-authorship typographic signals present in authored
  // source so authors may clean them (the egress adapter normalizes output regardless).
  { command: "text.normalize.report" },
  { command: "content.coverage.validate" },
  // RFC-0095: DE/EU locales must link Impressum + Datenschutz from the footer
  { command: "footer.legal.validate" },
  // RFC-0174: binding-language policy for translated legal documents is consistent
  { command: "legal.translation.validate" },
  // RFC-0095: soft warning on brandTagline length (header truncates with ellipsis)
  { command: "labels.shape.hint" },
  // RFC-0074: author-safe deterministic audit validators only (these read system.md /
  // onboarding configs, not rendered HTML). The dist-scanning audit validators
  // (seo.structured-data.validate, seo.internal-linking.validate, first-party-data.validate)
  // live in SITES_CHECK_POSTBUILD_PIPELINE + build.post — running them here validated the
  // PREVIOUS build's dist (or skipped entirely on a clean tree). LLM audits run inside app.qa.validate.
  { command: "analytics.config.validate" },
  // RFC-0305: Messkanon + Matomo Binding are workspace-owned, but production
  // app analytics config depends on them being present and valid.
  { command: "analytics.messkanon.validate" },
  { command: "analytics.binding.validate" },
  { command: "infra.brief.validate" },
  // RFC-0032: Shared utility usage in apps must come from @warpgogol/werkstatt-site/share
  { command: "share.utility.lint" },
  // Styling
  { command: "tokens.ds.lint" },
  { command: "tokens.colors.lint" },
  { command: "css.important.lint" },
  // RFC-0071: advisory — surface biome-coverage gaps without blocking the build
  { command: "biome.coverage.hint" },
  // Content naming and mirroring
  { command: "naming.content.lint" },
  { command: "mirroring.validate" },
  // RFC-0090: Page filenames must derive from pageId via pageIdToContentFileSlug
  { command: "content.filename.validate" },
  // SEO
  { command: "semantic.drift.validate" },
  // RFC-0111: per-app section framework guards
  { command: "section.motion.contract.validate" },
  { command: "site.background.contract.validate" },
  { command: "layout.orchestrator.lint" },
  // Compass scaffolding
  { command: "compass.validate" },
  { command: "compass.changesummary.validate" },
  // RFC-0352: warn-only audit gate (never blocks build.check)
  { command: "compass.audit.validate" },
  // RFC-0371: font contract validator (author-time, 4 rules)
  { command: "fonts.contract.validate" },
  // Performance lint that runs against source — heavy lighthouse runs live in postbuild.
  { command: "lighthouse.validate" },
];
