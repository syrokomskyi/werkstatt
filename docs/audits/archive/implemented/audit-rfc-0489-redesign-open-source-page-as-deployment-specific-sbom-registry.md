---
rfcId: RFC-0489
auditId: AUDIT-RFC-0489-01
date: 2026-07-22
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0489

## Verdict: Needs revision

The RFC correctly identifies the problems with the current open-source page and proposes a sound high-level redesign. However, the core design gap — the exact mechanism for scoping `pnpm licenses list` to the deployment artifact — is underspecified, and several ecosystem-fit issues (command lifecycle metadata, redundant path helpers, UI block type ambiguity, `versionBump` inconsistency) need resolution before implementation.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0489 --json` exits 0 with no violations.

## Axis A — Structural completeness

1. **Pre-existing `ownerCommand` bug not mentioned.** The current page manifest template at `packages/os/site-kernel-codegen/src/service.ts:583` sets `ownerCommand: "material.credits.generate"` for the open-source page — a copy-paste bug. The RFC should note this and fix it to `open-source.generate` as part of the rewrite.

2. **Ownership map missing prose path.** `GENERATOR_OWNERSHIP_MAP` at `packages/os/site-kernel-checks/src/generator-ownership.ts:152` registers `src/content/pages/{lang}/open-source.md` but not `src/content/prose/{lang}/open-source.md`. The prose file is generated but unregistered — a pre-existing RFC-0081 violation. The RFC mentions adding `public/open-source/**` paths but does not mention adding the missing prose path.

3. **Ownership map comment references wrong RFC.** Line 151 says `// open-source.generate — RFC-0049` but RFC-0049 is about hreflang sitemaps (`docs/rfcs/archive/implemented/rfc-0049-generate-hreflang-sitemap-from-route-registry.md`). The actual originating RFC is RFC-0078 (superseded by RFC-0081). The RFC should fix this comment.

4. **CycloneDX schema validation not in validator design.** The Risks section (line 446) says "The generated CycloneDX JSON must be valid against the CycloneDX schema. A schema validation step should be included in the validator." But the validator section (lines 348–356) and failure modes (lines 408–417) do not list a CycloneDX schema validation check. This should be a `invalid-sbom-schema` failure mode.

5. **Missing `hasSystemPage` guard.** The current `runGenerateOpenSourcePage` does not check whether the `openSource` page is declared in `system.md` — unlike `runGenerateMaterialCreditsPage` which guards with `hasSystemPage(system, "credits")` (service.ts:829). The RFC should add this guard so that sites without an open-source page are not forced to generate one.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-11]` (language mirroring) is correctly addressed — the RFC generates page + prose files for every supported language, fixing the broken UK page.

## Axis C — Ecosystem fit

1. **`commands.proposed` includes existing command.** `open-source.generate` is listed in both `proposed` and `changed`. Per the command lifecycle contract, `proposed` is for new commands; `open-source.generate` already exists and is being modified — it should only appear in `changed`. `open-source.validate` is correctly in both `proposed` and `added`.

2. **Redundant path helper fields.** The RFC proposes `openSourcePageDirectory` (= `src/content/pages`) and `openSourceProseDirectory` (= `src/content/prose`). But `AstroSitePaths` already exports `contentPagesDirectory` (= `src/content/pages`) and `contentDirectory` (= `src/content`). The generator can use `path.join(paths.contentPagesDirectory, lang, "open-source.md")` and `path.join(paths.contentDirectory, "prose", lang, "open-source.md")` without new fields. Only `openSourceArtifactsDirectory` (= `public/open-source`) is potentially new, and even that can be derived from the existing `publicDirectory`. The RFC should either justify why dedicated fields are needed or use the existing fields.

3. **RFC-0078 reference is stale.** The RFC says "This RFC does not supersede the original generator architecture (RFC-0078)" (line 119) and lists RFC-0078 in `related[]`. But RFC-0078 is `status: superseded` by RFC-0081. The governing RFC for generated file governance is RFC-0081, not RFC-0078. The RFC should reference RFC-0081 as the active governance RFC.

4. **`packagesImpacted` may be incomplete.** The RFC says "or a new `open-source-registry` block type if the section requires structured data props" (line 342) and "if a new block type is needed, it follows the archetype contract pattern (RFC-0101..0107) and is registered in `@gogol/ontology`" (line 344). If a new block type is needed, `@gogol/ontology` must be in `packagesImpacted`. The RFC should resolve this ambiguity before implementation (see Axis F).

5. **Compass sync not addressed.** The RFC changes `AstroSitePaths` (a shared package contract) and adds a new UI section. Per root AGENTS.md Compass document duties, the RFC should identify which `docs/*.xml` files need synchronization (likely `docs/technology.xml` for the new package exports and `docs/source-markup.xml` for new source files).

## Axis D — Forward-only compliance

No issues. The old `openSourcePagePath`/`openSourceProsePath` fields are removed (not kept alongside new ones). The old 49K-line output format is replaced, not maintained behind a flag. No compatibility shims proposed.

## Axis E — Agent-facing policy

No issues. The RFC has `status: draft` and correctly states "Agents MAY implement code changes only when this RFC has status `accepted`." No self-authorizing language. Implementation notes reference the correct governance rules (RFC-0081 generated file governance, RFC-0154 idempotency).

## Axis F — Pragmatism

1. **Redundant path helper fields** — see Axis C item 2. The existing `contentPagesDirectory` and `contentDirectory` fields suffice.

2. **UI block type ambiguity.** The RFC says the section is embedded "via the existing `markdown` block's `contentRef` mechanism, or a new `open-source-registry` block type if the section requires structured data props" (line 342). The current page manifest uses `contentRef: "prose/open-source"` with `type: markdown` — so the existing `markdown` block type works. The RFC should commit to one approach. If the compact summary, license distribution, and component table are rendered as markdown (which the prose template shows), then no new block type is needed and `@gogol/ontology` can be dropped from scope. If structured data props are needed (passing JSON arrays to the section), a new block type is required.

3. **`open-source.validate` command is justified.** No existing command covers SBOM consistency, license normalization, or scope separation. The new command earns its existence.

## Axis G — Blind spots

1. **Deployment-specific inventory mechanism is underspecified.** The RFC's core problem statement is "Inventory is not deployment-specific" (problem 3, line 94). The solution (lines 240–265) says "analyze the dependency graph for the specific site workspace only" and describes a classification heuristic (runtime, browser-bundle, build-only, etc.). But the RFC does not specify the exact command or mechanism. The current generator runs `pnpm licenses list --prod --json` at the app root (service.ts:554). How will the new generator scope this to the deployment artifact? Options include: `pnpm licenses list --filter <workspace>`, `pnpm list --filter <workspace> --prod --json` + manual license resolution, or post-filtering the workspace-wide output. Each has different accuracy and performance trade-offs. The RFC must specify the exact approach.

2. **Performance cost of `open-source.validate` not specified.** The validator checks SBOM consistency, scope separation, license status, deduplication, and artifact existence. The RFC should estimate the cost (file scan count, JSON parse complexity) and specify `expectedDurationMs`/`timeoutMs` for the pipeline step, following the pattern in `SITES_BUILD_CHECK_PIPELINE` (e.g., `image.variants.validate` has `expectedDurationMs: 15_000`).

3. **CycloneDX schema validation not in validator design** — see Axis A item 4.

4. **SPDX normalization library not specified.** The RFC describes a 5-step SPDX normalization process (lines 268–277) but does not name the library or approach. Will it use `spdx-expression-parse`, `spdx-correct`, or a custom implementation? The choice affects false-positive rate and maintenance burden.

5. **Fingerprint cache invalidation.** The current fingerprint is based on `package.json`, app `pnpm-lock.yaml`, and root `pnpm-lock.yaml` (service.ts:484–488). The new generator adds downloadable artifacts and SBOM to the output. The fingerprint inputs may need to expand (e.g., include `system.md` for i18n config, label files for localized text). The RFC should specify the new fingerprint inputs to preserve RFC-0154 idempotency.

## Questions for the author

1. What exact command or mechanism will the generator use to scope the dependency inventory to the deployment artifact? The current `pnpm licenses list --prod` at the app root includes workspace-wide dependencies. Will it use `--filter`, post-filtering, or a different approach?
2. Why does `versionBump: minor` not require a migrator? RFC-0478 defines `minor` as Breaks-B (requires migrator). The RFC says "No authored content migration is needed — generated files are regenerated from source." Should this be `patch`, or should the RFC explicitly explain why the output contract change is Breaks-B but needs no migrator?
3. Will the UI section use the existing `markdown` block type (with `contentRef`) or a new `open-source-registry` block type? This determines whether `@gogol/ontology` is in scope.
4. Should the generator add a `hasSystemPage(system, "openSource")` guard to skip generation when the page is not declared in `system.md`?
5. What SPDX normalization library will be used, and what is the expected false-positive rate for common non-standard license strings?
