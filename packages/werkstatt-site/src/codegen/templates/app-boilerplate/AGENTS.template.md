{{GENERATED_HEADER}}

# {{APP_NAME_DISPLAY}} Site Agent Guide

This file defines the site-specific instruction layer for this app. Follow the root `AGENTS.md` and `docs/authoring/site-composition.md` first, then use the closest scoped guide in this workspace.

## Relation to the onboarding pipeline (RFC-0070..0078)

This site is an RFC-0047 compliant app. Its readiness gate is `sites-check.run --site {{APP_ID}}` plus `app.contract.full --site {{APP_ID}}`.

**Do not use this app as a copy source for new sites.** New sites are built exclusively via `.agents/workflows/00-prepare.md` → `06-handoff.md`. The correct way to start a new app is `onboarding.scaffold` inside the `02-scaffold` workflow, never `cp -r apps/{{APP_ID}} apps/<new-id>`.

RFC-0078 generation-first commands (`overlay.pages.generate`, `routes.generate`, `styles.global.generate`, `scripts.orchestrator.generate`, `public.infrastructure.generate`, `kernel.wire`) use **regenerate-on-marker** semantics (RFC-0081): they overwrite files that carry the `GENERATED. Do not change this line unless the file contains project specific changes.` marker and skip files without it. This means hand-maintained files in this app (`src/content/**`, `tools/kernel.config.ts`) are automatically protected from being overwritten on subsequent `pnpm build` runs. If you want an existing GENERATED file to stop being overwritten, remove its marker line.

## How this app is wired (one minute)

This site is a **composition shell**. The actual sections, components, runtime, and validators live in `packages/*`. Concretely:

```
{{APP_ID}}/
├─ src/content/system.md            ◄── single canonical manifest (pages/routes, planets, growth, passport, i18n)
├─ src/content/pages/{lang}/*.md    ◄── frontmatter-only block-declarative pages (blocks[].type — NOT use:)
├─ src/content/prose/{lang}/*.md    ◄── long-form prose (impressum, AGB, datenschutz, projekte, etc.)
├─ src/content/business-profile/{lang}/  ◄── consumed by @warpgogol/pbp
├─ src/content/navigation/{lang}/   ◄── navigation labels, order, groups, semantic targets
├─ src/content/site/{lang}/         ◄── shared shell/site UI labels, footer promo copy, layout config
├─ src/middleware/language-redirect.ts ◄── GENERATED (gitignored) — from system.md i18n via i18n:middleware:gen
├─ src/pages/index.astro            ◄── default-language home at / (self-canonical) + soft lang redirect
├─ src/pages/[...slug].astro        ◄── unprefixed default-language pages at /<slug> (RFC-0160)
├─ src/pages/[lang]/[...slug].astro ◄── non-default languages only, at /<lang>/<slug> (RFC-0160)
├─ src/utils/localization.ts        ◄── thin proxy over @warpgogol/site-kernel-content + @warpgogol/share/i18n
└─ tools/kernel.config.ts           ◄── site-kernel pipeline wiring
```

Adding a page means:

1. Add a `.md` file under `src/content/pages/{lang}/` (with `kind: page`, `pageId`, `cosmicStar`, and `blocks[]`).
2. Add a matching `pages[]` entry in `src/content/system.md` with `pageId`, `routes: { {{DEFAULT_LANG}}: ..., ... }`, `cosmicStar`, and `planets[]`.
3. No `.astro` file needed.

Swapping the analytics vendor means changing `growth.vendor.adapter` in `src/content/system.md` only (and adding the adapter package to `dependencies` if new). The route reads this from `system.md` at build time.

## Site invariants

- Keep routes thin and keep visitor-facing meaning in `src/content/`.
- There is **no feature graph** in this app (`src/content/features/` is gone — RFC-0047). Visibility lives on page blocks and shell/site settings.
- Keep navigation targets content-declared in `src/content/navigation/{lang}/navigation.md` (RFC-0044). Navigation owns labels, order, groups, and semantic targets. **It does NOT own canonical page URLs** — those live in `src/content/system.md pages[].routes` (RFC-0048).
- Route slugs are edited in `src/content/system.md pages[].routes`, not in `navigation.md`.
- Use shared navigation schema from `@warpgogol/share/schemas/navigation` (RFC-0046). Configure app-specific navigation groups in `src/content/schemas/navigation.ts` by editing the `appNavigationGroups` array.
- **Header navigation is explicitly filtered** via `header.navIds` inside `src/content/site/{lang}/labels.md`. The header does NOT automatically show all `group: navigation` items. To change which links appear in the header, edit the `header.navIds` array in labels.md — NOT the navigation.md group field. This is separate from `footer.navIds` which controls the footer links. Keep `header.navIds` and `footer.navIds` identical across all language versions of the same site (same IDs, same order); `labels.shape.hint` fails when localized menu destinations drift.
- Keep styling in `src/styles/` and use only `--ds-*` design tokens.
- Machine-readable outputs (JSON-LD, `llms.txt`, `llms-full.txt`) are projections built by the **shared semantic layer** (`@warpgogol/share/semantic` + the kernel `llms.generate` command) — this app carries no `src/semantic/`. See `docs/historical/rules/SEMANTIC_LAYER.md` (historical reference).
- Keep `lang` flowing from route to layout to children.
- Keep React limited to isolated hydrated islands.

## Build verification discipline

Agents **MUST NOT** run root `pnpm build` or `turbo run build` during fix, review, or implementation workflows for this app. These commands build every workspace in the monorepo via Turbo and are prohibitively expensive for iterative agent work.

**Scoped typecheck verification** is the correct substitute:

```sh
pnpm --filter {{APP_ID}} exec astro check
```

This runs Astro's typecheck (`.astro` + `.ts` files) without SSG build. For touched `packages/*` dependencies, run `pnpm --filter <package-name> run build:check` (`tsc --noEmit`).

**Exceptions** (scoped via `--filter`, never root `pnpm build`):

- Onboarding scaffold may run `pnpm --filter {{APP_ID}} run build` for the first build of a new app.
- Deploy workflow may run `pnpm --filter {{APP_ID}} run build:deploy:main` or `build:deploy:alt`.
- CI pipelines run their own build steps — not agent sessions.

See root AGENTS.md §Build verification discipline for the full policy.

## Mission commit discipline (RFC-0480)

When this workspace is a mission workpiece, agents MUST use `mission.git.commit` to commit edits — not direct `git commit`:

```sh
pnpm exec site-kernel run mission.git.commit --mission <missionId> --message "<descriptive message>"
```

- Agents MUST commit after completing a batch of edits, before ending the session.
- `mission.reconcile` and `mission.close` block if the workpiece has uncommitted changes.
- `mission.validate` warns if the workpiece is dirty after validation — commit generated artifacts too.

## Business layer (`@warpgogol/pbp`)

This app uses `@warpgogol/pbp` as the canonical business layer (RFC-0471):

- **Content collections** (`@warpgogol/pbp`): `pbpCollections` from `@warpgogol/pbp/astro` — registered in `content.config.ts` for PBP entity data from `src/content/business-profile/`.
- **Semantic profile** (`@warpgogol/pbp`): `buildPbpSemanticProfile` from `@warpgogol/pbp/semantic-profile` — used in page routes for JSON-LD generation.
- **People collection**: standalone `people` collection in `content.config.ts` for person records from `src/content/people/`.

| What you need | Import from |
| --- | --- |
| `pbpCollections` (Astro content collection) | `@warpgogol/pbp/astro` |
| `buildPbpSemanticProfile`, `buildPageSemanticModel` | `@warpgogol/pbp/semantic-profile` |

**Wiring steps (already done for this app):**

1. In `src/content.config.ts`, import and spread `pbpCollections` from `@warpgogol/pbp/astro`.
2. Page routes import `buildPbpSemanticProfile` from `@warpgogol/pbp/semantic-profile` and call it with `(lang, url, sourceDirectory)`.
3. PBP entity files live in `src/content/business-profile/<lang>/`.
4. Person records live in `src/content/people/<lang>/`.

### Business data → AI + JSON-LD projection

PBP entity files **project automatically** into per-page JSON-LD via `buildPbpSemanticProfile`. Offerings with pricing project into schema.org `Offer` + `PriceSpecification` nodes at the organization level.

## Content data references (RFC-0045)

Markdown files support `{collection.file.field}` syntax to reference frontmatter values from other content files. Language is auto-inferred from the referencing file's path. Invalid references cause build-time errors.

Examples: `{business-profile.legal-identity.legalName}`, `{business-profile.contact-points.main.email}`, `{business-profile.places.main.address.streetLocality}`

References resolve in **block props** too (RFC-0138): a `{collection.file.field}` written inside a block's `props` is substituted at render time by the shared page handler — it does not ship as a literal brace string.

**Rules agents must follow:**

- **Never hardcode business data** (email, address, bank details, URLs) in prose files or component props — use the PBP business-profile collection instead.
- When adding new business information, add it to the appropriate PBP entity file in `src/content/business-profile/<lang>/`.
- The default language directory must always exist (RFC-0008 fallback anchor).
- Unsourced guarantee/legal/price claims stay `NEED_THIS_*` markers until a human sources them (RFC-0136); never substitute them as live facts.
- Referencing an array element by numeric index is coupled to the array's order — `content.references.validate` warns about it; prefer keyed fields where stability matters.

**See also:** `packages/pbp/AGENTS.md`

## Shared utilities (`@warpgogol/share`)

This app consumes `@warpgogol/share` (`packages/share/`). Before writing entity-ID, i18n, or base-schema utilities, check that package:

| What you need                                             | Import from               |
| --------------------------------------------------------- | ------------------------- |
| `toDataEntryId`, `getEntryLanguage`, `stripEntryLanguage` | `@warpgogol/share/content` |
| `createLocalizationHelpers` factory                       | `@warpgogol/share/i18n`    |
| `componentOverridesSchema`, `ComponentOverrides`          | `@warpgogol/share/schemas` |

App-local files that previously contained this logic are now **thin proxies** — do not add logic back into them:

- `src/content/schemas/entity-id.ts` — proxy for `@warpgogol/share/content`
- `src/content/schemas/pages/base.ts` — proxy for `@warpgogol/share/schemas`
- `src/utils/localization.ts` — owns `LANGUAGE_MAPPING`; i18n helpers come from the factory

See `packages/share/AGENTS.md` for the full guide.

## Content architecture — block-declarative pages (RFC-0026 / DNA-24 / RFC-0047)

Page content files (`src/content/pages/{lang}/{slug}.md`) use **block-declarative shape** with CMS-friendly `type:` names (not `use: PlanetName`). Prose blocks reference `prose/{lang}/<slug>.md` via `contentRef`.

```yaml
kind: page
pageId: privacyPolicy
cosmicStar: Fomalhaut
lang: {{DEFAULT_LANG}}
blocks:
  - id: page-content
    type: markdown
    props:
      heading: "Page Heading"
      contentRef: "prose/page-slug"
```

> **Breadcrumbs are automatic (RFC-0229).** Do **not** author a `breadcrumbs` block. The shared
> page pipeline injects the visible breadcrumbs section **and** the matching `BreadcrumbList`
> JSON-LD on every non-home page from one canonical trail. See "Breadcrumbs" below.

**Rules agents must follow:**

- **Never use `use: PlanetName`** (retired RFC-0047). Use `type: <archetype>`.
- **Never add a markdown body** — prose lives in `src/content/prose/{lang}/`.
- **Never hand-assemble blocks in route files** — use `buildPage()` + `BlocksRenderer`.
- `blocks[].props` must conform to the section manifest's `propsSchema` (strict).
- **Every `.md` must carry a `pageId`** matching `system.md`.
- Pin each used `cosmicPlanet` in `system.md pages[pageId].planets[]`.

**See also:** `docs/authoring/block-declarative-pages.md`

## Standard page composition for this biome

This site uses the **{{BIOME_DISPLAY_NAME}} biome** (`{{BIOME_ID}}`). The default language is `{{DEFAULT_LANG}}`; supported languages: `{{SUPPORTED_LANGS}}`.

### Invariants that apply to ALL non-home pages

1. **Breadcrumbs are automatic (RFC-0229)** — never author a `breadcrumbs` block and never pin `Thebe`. The shared pipeline injects the trail. See "Breadcrumbs" below.
2. **Section numbers by default** — content sections show their generated section number unless the block is navigation chrome, breadcrumbs, a hero, or an intentionally unnumbered service/passport block.
3. **`markdown` for prose** — rich text content lives in `src/content/prose/{lang}/<slug>.md` and is rendered via `type: markdown` with `contentRef: "prose/<slug>"`. Never use card or stats blocks to approximate prose content.
4. **`lead` on markdown** — when the reference page shows an introductory sentence below the heading, pass it as `lead:` prop on the `markdown` block, not as a separate section.
5. **`system.md` must be kept in sync** — every block type used in a page's `blocks[]` must map to a cosmicPlanet pinned in `src/content/system.md pages[pageId].planets[]`. (Breadcrumbs are the exception — they are injected at render, so they carry no content block and no pin.)

### Canonical page types for this site

**Prose page** (legal, about text, project descriptions):

```yaml
# Page blocks — no breadcrumbs block; it is injected automatically (RFC-0229).
blocks:
  - id: <slug>-markdown
    type: markdown
    props:
      heading: "<H1 heading>"
      lead: "<Optional intro sentence>"
      contentRef: "prose/<slug>"

# system.md — matching pages[] entry. Pin only the planets the content blocks use.
# `parentPageId` is optional: set it to nest the breadcrumb trail under another page.
- pageId: <camelCaseId>
  routes: { {{DEFAULT_LANG}}: <slug-{{DEFAULT_LANG}}> }
  cosmicStar: <Star>
  parentPageId: <parentCamelCaseId> # optional — omit for a top-level Home → Self trail
  planets:
    - { cosmicPlanet: Hyperion, pin: "1.2.0" }
```

### What NOT to do

- **Do not use `use: PlanetName`** in page blocks (retired RFC-0047). Use `type: <archetype>`.
- **Do not author a `breadcrumbs` block or pin `Thebe`** — breadcrumbs are injected automatically (RFC-0229). A hand-authored block suppresses the auto trail and downgrades it to a flat two-level one.
- **Do not suppress section numbers** on content sections unless the design explicitly calls for an unnumbered service/passport block.
- **Do not inline large text** in `blocks[].props` — use `prose/{lang}/` with `contentRef`.
- **Do not edit route slugs in `navigation.md`** — canonical slugs live in `system.md pages[pageId].routes` (RFC-0048).

## Pages and routing (RFC-0048)

- Routes are orchestrators: thin, no hardcoded copy. All text from content collections via `buildPage()`.
- Canonical routes declared in `system.md pages[pageId].routes`. `[...slug].astro` reads the route registry and resolves by `pageId`.
- No `src/configure/features.ts` (RFC-0047) — visibility from block `props` and shell/site settings only.
- Localized sibling URLs via `getLocalizedSiblingPath()` from `@warpgogol/share`.
- JSON-LD, breadcrumbs, and `llms` are produced by the **shared semantic layer** (`@warpgogol/share/semantic` + the kernel `llms.generate`); the route only renders the already-built JSON-LD. Do not add an in-app `src/semantic/`.

### Standalone pages (dedicated `.astro` routes)

When a page is rendered by a dedicated `.astro` file (e.g. `src/pages/check.astro`) instead of the catch-all `[...slug].astro`, set `standalone: true` on its `pages[]` entry in `system.md`:

```yaml
pages:
  - pageId: check
    routes: { de: "check" }
    cosmicStar: Polaris
    standalone: true
```

The `standalone` flag keeps the page in the route registry for semantic target resolution and link validation, but **excludes it from `[...slug].astro` static path generation** — preventing route conflict warnings when both the dedicated `.astro` and the catch-all would emit the same path. The page's content entry (`src/content/pages/{lang}/check.md`) is still required for block rendering and breadcrumb resolution.

Standalone pages should also set `output.robots: { index: false }` (or a `<meta name="robots" content="noindex">` tag in the `.astro` file) when the page is a tool/utility not meant for search engines. Post-build validators (`seo.structured-data.validate`, `first-party-data.validate`, `dist.content-references.validate`) skip noindex pages, so tool forms and JS template literals won't trigger false positives.

## Breadcrumbs (RFC-0229)

Breadcrumbs are **fully automatic** — there is nothing to add to a page. The shared page pipeline
(`@warpgogol/share` `buildBreadcrumbTrail`) builds **one** canonical trail per non-home page and projects
it into **both** the visible breadcrumbs section **and** the `BreadcrumbList` JSON-LD, so they can
never drift. The home page is a single node and is intentionally suppressed.

- **The trail is `Home → …ancestors… → current page`.** Crumb names come from page titles (the
  `| Site` suffix is stripped); the Home label and the nav `aria-label` come from
  `site/{lang}/labels.md` → `breadcrumbs.homeLabel` / `breadcrumbs.navAriaLabel`.
- **Build a hierarchy with `parentPageId`.** On a page's `system.md pages[]` entry, set
  `parentPageId: <otherPageId>` to nest it: `Home → <Parent> → <Self>`. Chains may be several deep;
  they must reference an existing page and be acyclic (`breadcrumb.trail.validate` enforces this).
  Omit `parentPageId` for a top-level `Home → Self` trail.
- **Programmatic Surface (PSEO) pages nest automatically** by their depth
  (`Home → landing → industry → city`), derived from the page's surface tuple.
- **Person/team profiles nest automatically** under the `semanticType: about` page.
- **Do not author a `breadcrumbs` block.** It would suppress the automatic trail. Authoring an
  explicit block is an advanced escape hatch for a bespoke trail only; prefer `parentPageId`.
- **Validation:** `breadcrumb.trail.validate` (part of the app check pipeline) fails on an
  unknown/cyclic `parentPageId` and on a live PSEO ancestor whose route does not resolve.
- Keep AGENTS.md out of `src/pages/` (rename to `_AGENTS.md` to avoid Astro routing).

## Generated files (do not edit manually)

See `docs/authoring/site-composition.md §Build prepare pipeline` for the cross-site rules. App-local quick reference:

| File | Script | When to rerun in dev |
| --- | --- | --- |
| `src/middleware/language-redirect.ts` | `pnpm i18n:middleware:gen` | After changing `i18n.supported` / `i18n.default` in `system.md` |
| `src/styles/biome.generated.css` | (auto via `build.prepare`) | After changing brand colors |
| `src/content/pages/*/open-source.md` | `pnpm open-source:gen` | After updating production dependencies |
| `src/content/prose/*/credits.md` | `material.credits.generate` | After editing any `*.credits.yaml` sidecar |
| `AGENTS.md` | `pnpm exec site-kernel run agents.generate --site {{APP_ID}}` | After shared AGENTS.md patterns change (RFC-0079) |

All run automatically in `pnpm build`. Deployment is a single **Cloudflare Workers** target via the `@astrojs/cloudflare` adapter (RFC-0149): the site stays `output: "static"` (SSG by default) and only routes declaring `export const prerender = false` (section API endpoints under `src/pages/api/`) render on demand in the Worker. Section endpoints are portable Astro `APIRoute`s reading secrets via `astro:env/server` — never Cloudflare Pages Functions or `onRequest*` handlers. Language detection is currently client-side via `src/pages/index.astro` → `RootRedirectContent` (the language entry remains prerendered); request-time detection is available by opting that route into `prerender = false`.

## Agent Surface (RFC-0286..0290)

Every app publishes a machine-consumable **Agent Surface**: one generated capability manifest per site, from which every protocol (static knowledge JSON, OpenAPI, MCP) is projected. Invariants AS-1..AS-7 (full text: `docs/rfcs/rfc-0286-*.md`):

- **AS-1 — one manifest, many projections.** Every protocol surface derives from `src/agent-surface.generated.json`. No protocol surface is ever hand-authored.
- **AS-2 — human parity.** The agent surface never exposes a fact or action absent from the visible site.
- **AS-3 — privacy boundary.** `BUSINESS_DOMAIN_VISIBILITY` applies verbatim — `none`/`pageMeta` domains never reach agent outputs.
- **AS-6 — static reads, minimal runtime.** Knowledge/OpenAPI/discovery are static `public/` files; only the action routes and the MCP endpoint run at request time.

**Agent rules:**

- **Never hand-edit** `src/agent-surface.generated.json`, `public/.well-known/agent.json`, `public/.well-known/agent.openapi.json`, or any file under `public/api/agent/`. Rerun `agent.manifest.generate` (and its siblings) instead.
- `agent.manifest.generate` runs in `build.prepare` after `entitlements.resolve` and the final route set is known; `agent.surface.validate` runs in `sites-check.author` (rules `AGS-01`..`AGS-07`).
- Disable the whole surface for a site with `agent: { enabled: false }` in `system.md`; absent ⇒ enabled (the read tier is free visibility, like `llms.txt`).
- **Knowledge tier (RFC-0287).** `agent.knowledge.generate` projects the business layer — through the same projectors that feed `llms-full.txt` and JSON-LD — into one static JSON file per public domain under `public/api/agent/v1/`. A domain with no authored content simply has no file (safe default). Withhold a populated domain with `agent: { knowledgeDisabled: [...] }`. `agent.knowledge.validate` enforces the privacy boundary, envelope validity, and generator↔artifact parity (rules `AGK-01`..`AGK-05`).
- **Action tier (RFC-0288).** The closed capability catalog lives at `packages/ontology/capabilities/*.yaml` — **never author a capability inside an app**. A capability is active on a site only when it holds the `agent.actions` entitlement, every extra `requires.entitlements` is also held, and its `humanEquivalent.sectionType` actually renders on some page (AS-2 — no invisible side doors into the client's CRM). Withhold an otherwise-active capability with `agent: { actionsDisabled: [...] }`. `agent.capability.validate` enforces the catalog schema and this gating (rules `AGC-01`..`AGC-05`); `agent.manifest.generate` lists each active capability as an `AgentActionRef`.
- **OpenAPI projection (RFC-0289).** `agent.openapi.generate` mechanically projects the manifest into a static OpenAPI 3.1 document at `public/.well-known/agent.openapi.json` — one `GET` per knowledge domain, one `POST` per active action, with the capability's schemas copied verbatim (never transformed). `agent.openapi.validate` enforces manifest↔document bijection and schema fidelity (rules `AGO-01`..`AGO-04`).
- **Runtime tier — the Agent Gate (RFC-0290).** `agent.routes.generate` emits `src/pages/api/agent/mcp.ts` (always, when the agent surface is enabled) and `src/pages/api/agent/actions/[id].ts` (only when at least one capability is active) as thin re-exports into `@warpgogol/agent-gate/astro` — **never hand-edit these files or add logic to them**; all MCP/action handling lives once in `@warpgogol/agent-gate`. The MCP endpoint speaks a pinned Streamable HTTP subset (`PINNED_MCP_PROTOCOL_VERSION`); action invocation (HTTP and MCP `tools/call` alike) goes through the same closed-schema interpreter and the same Integration Port delivery substrate as the human `send-message` form — no second delivery path. `agent.gate.fixtures.run` (workspace-scoped, `packages-check.run`) is the regression gate for any protocol change; `agent.surface.validate`'s `AGS-07` checks the generated routes stay in sync with the manifest.

## Universal authored import/export contract

- For generator-owned TypeScript files in this app, change the owning template or generator under `packages/*`, not the generated file here.
- Do not infer app import rules from package source files. `packages/**/*.ts(x)` uses the `.ts/.tsx` authored-source contract enforced by `import.extensions.lint`; app files follow the owning generator template and Astro/Vite runtime contract.
- When a generated app file needs an import-style change, update the template or generator first, regenerate the file, then validate the app.

## Local rule map

- `src/content/AGENTS.md` for canonical content ownership
- `docs/historical/rules/SEMANTIC_LAYER.md` for semantic projection rules (historical reference, shared, not in-app)
- `src/styles/AGENTS.md` for styling constraints
- `scripts/AGENTS.md` for script layout responsibilities

## Shared architecture documentation

- `packages/os/site-kernel/docs/architecture-dna.md` — architectural invariants
- `packages/os/site-kernel/docs/naming-conventions.md` — file naming rules
- `packages/os/site-kernel/docs/anti-patterns.md` — forbidden patterns
- `packages/os/site-kernel/docs/page-contracts.md` — page archetypes
- `packages/os/site-kernel/docs/component-contracts.md` — component contracts
- `docs/historical/rules/AGENT_QUICKSTART.md` — orientation before any change (historical)
- `docs/historical/rules/AGENT_RULES.md` — repeatable workflows (historical)
- `docs/historical/rules/SEMANTIC_LAYER.md` — semantic projection architecture (historical)

## Script placement rules (RFC-0011)

| Class | When to use | Canonical form |
| --- | --- | --- |
| **S-1** | Component-specific | `src/scripts/components/{name}.ts` + `<script>import</script>` in owning `.astro` |
| **S-2** | Layout-global | `src/scripts/layout-orchestrator.ts` + `<script>import</script>` in `layout.astro` |
| **S-3** | Page-specific, ≤ 10 lines, must precede render | `<script is:inline>` in route file only |
| **S-X** | JSON-LD / JSON schema | Exempt — governed by semantic output rules |

Key prohibitions: No bare `<script is:inline>` for behavioral logic (AP-19). No loading component scripts from `layout.astro` (AP-18). S-2 scripts stay in `src/scripts/`, not `public/`. `public/scripts/components/` is fallback-only for zero-import vanilla JS.

## Site-specific notes

<!-- Add site-specific rules that cannot be captured by the shared template here. -->
<!-- This section is preserved by agents.generate and never overwritten. -->
