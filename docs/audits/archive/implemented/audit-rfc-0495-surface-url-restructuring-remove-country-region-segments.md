---
rfcId: RFC-0495
auditId: AUDIT-RFC-0495-01
date: 2026-07-23
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0495

## Verdict: Needs revision

The RFC's core decision (remove `{country}/{region}` from depth-4 and depth-5 slug templates) is sound and well-motivated, but the document is structurally incomplete (6 missing required sections), does not mention updating the declarative C-contract (`url-schema.yaml`) despite declaring `breaksC: true`, and does not address the migrator requirement that `versionBump: minor` mandates per RFC-0479. These are fixable gaps, not fundamental flaws.

## Mechanical validation (rfc.validate)

**Pass** with 7 warnings:

- **V-13** (6×): Missing required sections: `## Architectural fit`, `## Design`, `## Rollout`, `## Alternatives considered`, `## Risks`, `## Implementation notes for agents`.
- **V-19**: `RFC-0495.amends` includes `RFC-0238`, but `RFC-0238.amendedBy` does not include `RFC-0495`. This will be resolved when the RFC is implemented and RFC-0238's `amendedBy` is updated.

## Axis A — Structural completeness

**Fail** — 6 of 10 required sections are missing. The RFC has `Context`, `Problem`, `Decision`, `Implementation plan`, `Acceptance criteria` but is missing:

- **`## Architectural fit`** — no DNA alignment discussion, no ecosystem fit narrative.
- **`## Design`** — the "Decision" section contains design-level detail (slug tables, redirect map, blueprint YAML) but is not structured as a Design section. No TypeScript contracts, no file system responsibilities table, no output format, no failure modes.
- **`## Rollout`** — the "Implementation plan" section has 6 bullet points but does not describe default behavior, adoption path for existing apps, or new-app compliance.
- **`## Alternatives considered`** — absent. No alternative URL structures or redirect strategies are discussed.
- **`## Risks`** — absent. No discussion of SEO disruption during redirect transition, redirect chain risks, or slug collision risks.
- **`## Implementation notes for agents`** — absent. No agent behavioral rules, no governance references (RFC-0224, RFC-0334, RFC-0330).

Additional structural gaps within existing sections:

- **CLI surface** — `surface.url.migrate` and `surface.redirect.validate` are named but no exact command invocations with flags, scope, or `--json` output shape are provided.
- **TypeScript contracts** — no type signatures for redirect map entries, migration data, or validation results.
- **File system responsibilities** — no table naming concrete paths. The RFC should name `packages/ontology/blueprints/website-local.yaml`, `packages/os/site-kernel-checks/src/surface-expand/expand.ts`, `packages/os/site-kernel-checks/src/surface-expand/bake.ts`, and the redirect map output path.
- **Failure modes** — no exit codes or warn-vs-fail behavior for the proposed commands.
- **Acceptance criteria** — checkable but insufficient: no criterion for C-contract (`url-schema.yaml`) update, no criterion for migrator existence, no criterion for `rfc.validate` passing.

## Axis B — DNA alignment

**Fail** — `satisfies: [DNA-24, DNA-53]` entries are decorative:

- **DNA-24 (Block-declarative pages)** — the RFC does not touch page entry frontmatter shape or block composition. The slug template change is orthogonal to block-declarative pages. The RFC body does not explain how it enforces or protects DNA-24.
- **DNA-53 (Semantic fingerprint governance)** — the RFC does not introduce new hashing or fingerprint computation. DNA-53 is not relevant to URL slug changes.

Missing `satisfies` entries that are actually relevant:

- **DNA-39 (Route registry is a merge of route sources)** — the URL pattern change directly affects the route registry output (`src/surface.generated.json`). The RFC should satisfy DNA-39.
- **DNA-16 (Semantic layer shares topology with navigation)** — changing URL structure affects sitemap, breadcrumbs, and JSON-LD output. The RFC should reference DNA-16 to ensure semantic outputs are updated consistently.

No conflict with existing DNA invariants. The RFC amends RFC-0238 (changing slug templates) rather than superseding it — this is correct since the five-axis cascade structure is preserved.

## Axis C — Ecosystem fit

**Fail** — missing C-contract update and several ecosystem gaps:

- **C-contract drift** — the RFC declares `breaksC: true` but does not mention updating `packages/ontology/src/external-surfaces/url-schema.yaml`. Per RFC-0480, `breaksC: true` requires the RFC to update the declarative C-contract. The current `url-schema.yaml` already has a pattern `/:locale?/:industry/:city` (without country/region) — this is **already out of sync** with the actual blueprint which has `{country}/{region}/{city}`. The RFC should note this existing drift and update `url-schema.yaml` to match the new slug templates. V-30 should fire on this RFC.
- **Pipeline placement** — the RFC does not name which pipeline `surface.url.migrate` and `surface.redirect.validate` belong to (`build.prepare`, `build.check`, `sites-check`, `sites-check-postbuild`). `surface.redirect.validate` appears to be a runtime check (verifies 301 responses on a deployed site) — this is unusual for the build-time-focused ecosystem and needs justification.
- **Compass sync** — the RFC does not identify which `docs/*.xml` files need synchronization. Changing URL structure likely affects `docs/requirements.xml` (req-22, req-24) and `docs/verification-plan.xml`.
- **AGENTS.md updates** — not mentioned. If the URL schema changes, site-composition docs may need updates.
- **Command lifecycle** — `commands.proposed` and `commands.added` both list `surface.url.migrate` and `surface.redirect.validate`; `commands.changed` lists `surface.generate` and `surface.validate`. Internally consistent.

Package boundaries are correct: `@gogol/surface` (blueprint types), `@gogol/ontology` (blueprint YAML + C-contract), `@gogol/site-kernel-checks` (surface generation), `@gogol/share` (route registry). No `apps/* → apps/*` or `apps/* → services/*` violations.

## Axis D — Forward-only compliance

**Pass** — the RFC is forward-only:

- Old depth-4 and depth-5 URLs are redirected (301), not maintained alongside new URLs. No dual-path or compatibility shim.
- The blueprint slug templates are changed directly (amending RFC-0238), not parallel-interpreted.
- Depth-2 and depth-3 URLs are preserved as navigation hubs — this is not a compatibility shim, those levels were always `navigation-noindex` hubs.

**However**: `versionBump: minor` implies Breaks-B (per RFC-0478), which requires a migrator (RFC-0479). The RFC does not mention the migrator registry, `mission.migrate`, or what the migrator would do. This is a forward-only compliance gap — the migrator system is the mechanism for applying breaking changes to existing Sternsystem data. The migrator would need to update `system.pin.json`'s `migratorCursor` and any cached/generated surface artifacts.

## Axis E — Agent-facing policy

**Fail** — no `## Implementation notes for agents` section:

- No statement that agents may implement only after `status: accepted`.
- No reference to RFC-0224 (accepted→implemented transition), RFC-0334 (supersede escalation), or RFC-0330 (verification evidence for probe-bearing RFCs).
- No agent behavioral rules (e.g., "agents MUST update `url-schema.yaml` in the same change", "agents MUST run `surface.url.migrate` before `surface.generate`").
- No anti-fabrication guidance — not directly relevant since this RFC is about URL structure, not content.
- No self-authorizing language found — the RFC is `status: draft` and does not claim implementation permission. OK.

## Axis F — Pragmatism

**Issues**:

- **`surface.url.migrate`** — could this be a flag on `surface.generate` (e.g., `surface.generate --emit-redirects`)? The RFC does not justify why a separate command is needed. A redirect map is a natural byproduct of changing slug templates — `surface.generate` already knows both old and new patterns.
- **`surface.redirect.validate`** — this is a runtime check (verifies 301 responses on a deployed site). The ecosystem is build-time-focused. The RFC does not explain how this command connects to the deployed site (HTTP requests? Playwright? checking the `_redirects` file?). If it checks the `_redirects` file statically, it could be a flag on `surface.validate`. If it checks live URLs, it needs a target URL parameter and is closer to a fleet probe than a build check.
- **No TypeScript contracts** — the RFC provides no type signatures for redirect map entries, migration data, or validation results.
- **Existing patterns** — the RFC does not check whether `surface.generate` or `surface.validate` can be extended before proposing new commands.
- **Scope discipline** — `appsImpacted: [webgogol-com]` is correct (only webgogol-com uses `website-local`). `packagesImpacted` is correct. `nonGoals` are explicit and meaningful. OK.

## Axis G — Blind spots

**Issues**:

- **City slug uniqueness** — the RFC mentions disambiguation (`stuttgart-de` vs `stuttgart-us`) but does not specify the mechanism. Is this a geo provider responsibility? A blueprint validation? The current dataset only covers Germany, but the RFC should specify the rule for future expansion.
- **UK locale prefix** — the url-schema.yaml has `/:locale?/:industry/:city` with `localePrefix.strategy: optional-prefix`. The blueprint has `uk: sait/{industry}/{city}`. How does the locale prefix interact with the `sait` root segment? The RFC does not address this.
- **Demand pages with noindex** — do noindex depth-5 pages get redirects too? The RFC says "All existing depth-4 and depth-5 URLs change" but doesn't distinguish between indexable and noindex pages.
- **Redirect map deployment** — the RFC says the redirect map is "emitted as a static `_redirects` file (or equivalent) consumed by the hosting layer." Where is it emitted? `public/_redirects`? `dist/_redirects`? The RFC should name the path.
- **`surface.redirect.validate` false positives** — what if a redirect is temporarily unavailable? The RFC doesn't address retry logic or timeout behavior.
- **Performance** — `surface.url.migrate` cost is not estimated. For the current dataset (12 city pages + N demand pages), the redirect map is small, but the RFC should state this.
- **Migration path** — "Deploy with redirect map active before new URLs go live" is vague. What is the deployment sequence? Is the redirect map deployed in a separate step before the new pages are generated?
- **Migrator** — the RFC does not address the migrator registry (RFC-0479). `versionBump: minor` requires a migrator. What does the migrator do? Update `system.pin.json`? Regenerate surface artifacts? The RFC is silent.

## Questions for the author

1. **C-contract update**: The `url-schema.yaml` already has `/:locale?/:industry/:city` (without country/region) but the actual blueprint still has `{country}/{region}/{city}`. Should the RFC note this existing drift and explicitly update `url-schema.yaml` to match the new slug templates? What patterns should `url-schema.yaml` declare for depth-4 (`/website/{industry}/{city}/`) and depth-5 (`/website/{industry}/{city}/{demand}/`)?

2. **Migrator**: `versionBump: minor` implies Breaks-B, which requires a migrator per RFC-0479. What is the migrator-id? What does the migrator do — update `system.pin.json`'s `migratorCursor`? Regenerate `src/surface.generated.json`? Clear cached surface artifacts? Is the migrator idempotent (PBT f(f(x))==f(x))?

3. **Command pragmatism**: Can `surface.url.migrate` be a flag on `surface.generate` (`--emit-redirects`) since the redirect map is a natural byproduct of changing slug templates? Can `surface.redirect.validate` be a static check of the `_redirects` file (flag on `surface.validate`) instead of a runtime HTTP probe? If runtime probing is intended, how does the command connect to the deployed site?

4. **City slug uniqueness mechanism**: The RFC mentions disambiguation by appending country code (`stuttgart-de`). Where is this implemented — in `@gogol/geo`? In the blueprint? In `expand.ts`? What happens when two cities with the same slug exist in the same country?

5. **Redirect map deployment path**: Where is the `_redirects` file emitted — `public/_redirects`, `dist/_redirects`, or a mission artifact? How is it consumed by the hosting layer (Cloudflare Pages `_redirects` format)? Is this path already established by an existing RFC or is it new?
