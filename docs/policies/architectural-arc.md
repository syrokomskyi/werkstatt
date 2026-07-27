# Architectural Arc: RFC-0025 → RFC-0029 + Extensions

These RFCs form the core architectural arc. Agents MUST read them before touching any of the listed paths. Code changes are gated on each RFC reaching `status: accepted` (human-only transition).

| RFC | Title | DNA established | Gate |
| --- | --- | --- | --- |
| [RFC-0025](../rfcs/rfc-0025-activate-cosmic-overlay-and-feature-first-app-layout.md) | Cosmic overlay + feature-first layout | DNA-21, 22, 23 | accepted |
| [RFC-0026](../rfcs/rfc-0026-block-declarative-pages-and-runtime-context.md) | Block-declarative pages + RuntimeContext | DNA-24, 25, 26 | accepted |
| [RFC-0027](../rfcs/rfc-0027-growth-layer-events-funnels-experiments.md) | Growth Layer (events, funnels, experiments) | DNA-27, 28, 29, 30 | accepted |
| [RFC-0028](../rfcs/rfc-0028-cosmic-passport-star-map-nebula-score.md) | Cosmic Passport + Star Map + Nebula Score | DNA-31, 32, 33, 34 | accepted |
| [RFC-0029](../rfcs/rfc-0029-greenfield-rebuild-and-client-onboarding-playbook.md) | Greenfield rebuild + onboarding playbook | DNA-35, 36 | accepted |
| [RFC-0036](../rfcs/rfc-0036-extend-blocks-renderer-to-support-shell-level-and-mooncatalog-components.md) | Shell-level blocks + MoonCatalog in BlocksRenderer | extends DNA-24, 25 | implemented |
| [RFC-0053](../rfcs/rfc-0053-image-resolution-contract-with-language-fallback.md) | Image resolution with language fallback | extends RFC-0008, RFC-0042 | implemented |

## Critical invariants agents MUST enforce

**Layout (DNA-21):**

- `apps/*/src/content.config.ts` lives at `src/` root — never inside `src/content/`.
- Per-feature files colocate under `src/content/<layer>/<name>/` (`.md`, `.client.ts`, `assets/`).
- `src/styles/<layer>/`, `src/scripts/<layer>/`, `src/assets/<layer>/` are **forbidden** — `app.layout.validate` exits non-zero.
- Per-feature `.css` files under `src/content/` are **ERROR level**, not a warning. Reject without exception.

**Client surface (DNA-22):**

- Client-editable whitelist: `src/content/{business,pages,prose,navigation,site}/**`, `src/content/**/assets/**`, `src/content/**/*.client.ts` (bounded feature-scoped client scripts, RFC-0031), and two keys in `system.md` (`identity.biome`, `release.passport.{enabled,indexable}`). Everything else in `apps/*/` is engineering-only.
- `client.edit.validate` runs as a deploy gate. Agents in a client-commit context MUST refuse to modify the engineering surface even when asked.

**Cosmic overlay (DNA-23):**

- Every `manifest.yaml` in `packages/ui/src/{pages,sections,components}/` must carry a distinct `cosmicName` drawn from the layer-appropriate catalog (`StarCatalog` → pages, `PlanetCatalog` → sections, `MoonCatalog` → components).
- Cosmic names are manifest/YAML fields and UI strings only — never in import paths, filenames, or directory names.
- One biome per app, permanently. `system.md identity.biome` is scalar.

**Block-declarative pages (DNA-24):**

- Every `apps/*/src/content/pages/**/*.md` is frontmatter-only with a `blocks[]` array. Markdown body is forbidden. Prose lives in a `prose-block` component.
- Every `blocks[].type` is an author-facing archetype name whose cosmicPlanet is pinned in `system.md pages[pageId].planets[]`. Unknown types fail `page.block.validate`.
- Every `blocks[].props` validates against the pinned manifest's propsSchema (strict, no extra keys).

**Shell-level blocks (RFC-0036):**

- Shell components (Background, Header, Footer) are declared in `system.md pages[route].shell`, not hardcoded in route files.
- Every `shell.<slot>.cosmicMoon` must exist in MoonCatalog manifests. Unknown moons fail `page.shell.validate`.
- Shell block props validate against the manifest's propsSchema (strict, no extra keys).
- Shell blocks bypass visibility evaluation — they are always rendered if `enabled` is not `false`.
- `BlocksRenderer` renders shell blocks with `layer: "shell"` before content blocks.
- Agents MUST NOT add shell component imports directly in route files — use `buildPage()` with `shellBlocks` option.

**Page routes (DNA-25):**

- Every `apps/*/src/pages/[lang]/[...slug].astro` calls `buildPage(entry, ctx)` from `@warpgogol/share` and iterates `ResolvedBlock[]`. No hand-assembled composition. Route must stay ≤ 40 lines.

**RuntimeContext (DNA-26):**

- `RuntimeContext` from `@warpgogol/share` has exactly three fields: `locale` (active), `segment` (null at build time), `flags` ({} at build time). Never construct build-time context with non-null `segment` or non-empty `flags`.
- `{ segment }` and `{ flag }` visibility clauses are valid to author today and will activate when RFC-0027 Growth lands. They do not fail parse; they always evaluate `false` at build time.

**Growth (DNA-27–30):**

- Never call vendor SDKs (`window.gtag`, `window.plausible`, etc.) directly in `packages/ui/` or `apps/*/src/`. Every emission goes through `emit(eventId, payload)` from `@warpgogol/growth`.
- Every event id must exist in `packages/ontology/growth/events/`. Adding a new event without a catalog entry fails `growth.events.validate`.
- `system.md growth.<concern>` is scalar — one vendor per concern, permanently. Multi-vendor per concern is forbidden.
- Default pre-hydration hiding for conditional blocks is `visibility: hidden` (preserves layout box). Opt-in `display: none` via `hideMode: collapse` is forbidden above the first two blocks of a page.

**Passport (DNA-31–34):**

- `dist/.well-known/cosmic-passport.json` is emitted on every build, regardless of `release.passport.enabled`.
- Private signing keys MUST NOT be committed to the repository. They live in GitHub Actions secrets only.
- `release.passport.indexable` defaults to `true` (transparency); opt-out via `false`.

**Readiness (DNA-35–36):**

- The only signal that an app is architecturally ready to deploy is `app.contract.full --site <id>` exiting 0.
- New apps are generated via `onboarding.scaffold`, not hand-crafted. Per-client divergence lives in `system.md` content. Scaffold output is the canonical shape.

## Storage policy & permanent nonGoals

- **Cookies are forbidden** repository-wide (first-party code). No `document.cookie`, `Set-Cookie`, or cookie-based middleware in `apps/*` or `packages/*`. Use `localStorage` (client) or `unstorage` (server) for persistence. This prohibition is absolute — no exception (RFC-0177 clause 1).
- **Consent-gated third-party widgets** (RFC-0177 clause 2): a third-party chat widget MAY set its own storage, ONLY because it is **click-to-load** (loads solely on explicit user activation, RFC-0175) and the storage is set by the vendor's origin, never by our code. No third-party script/iframe/network/storage may exist before activation (`consent.activation.validate`). No cookie banner / CMP is introduced — activation is the consent gate.
- **Server-side storage** (RFC-0177 clause 4): client API tokens + OAuth refresh tokens MAY be stored (encrypted, secret-scoped, on the client's deploy). Visitor/lead PII and conversation history MUST NOT be persisted — the RFC-0176 delivery queue is in-flight only; dedup state is a short-TTL key. The studio does not become a CRM/datastore of leads.
- Server-side language detection: URL prefix + `Accept-Language` header only.
- Other nonGoals (never acceptable without superseding RFC): server-side edge functions for manifests/growth/passport, multiple biomes per app, multiple vendors per growth concern, component-swap experiment variants, free-form event ids, per-section CSS in `apps/*/src/content/`, partial-migration certification.

## Build output invariant (RFC-0049)

**Never generate files directly into `dist/` and never validate against `dist/`.**

All generated artifacts must be produced by `APPS_BUILD_PREPARE_PIPELINE` commands that write into the project tree (e.g., `public/`, `src/content/`, `src/styles/`). Astro's static build then copies them into `dist/`.

Examples of the correct pattern:

- `open-source.generate` → writes `src/content/prose/{lang}/open-source.md`
- `icons.generate` → writes `src/components/icons/gen/**`
- `biome.css.generate` → writes `src/styles/biome.generated.css`
- `sitemap.generate` → writes `public/sitemap.xml` (Astro copies to `dist/sitemap.xml`)

Why: `dist/` is an ephemeral build output. Writing there directly bypasses Astro's asset pipeline, breaks incremental builds, and makes validation dependent on a full build having already run.

## Turbo cache contract for app builds (RFC-0259)

`turbo.json` declares `"cache": false` for the `warpgogol-com`/`nicaragua-projekt` `build` and `build:check` tasks, and a root `//#registry:build` task (`uni.registry.build` + `archetype.registry.build`, declared outputs, cached) that both apps' build tasks depend on. This is deliberate: an app build self-mutates far beyond `dist/**`/`.astro/**` (image/video variants, `src/*.generated.json`, `sitemap.xml`, …), so a turbo cache hit would restore only the declared outputs and leave every other generated artifact stale or missing.

**Agents MUST NOT re-enable turbo caching for app `build`/`build:check` tasks** (i.e. remove or flip `"cache": false` back to `true`/omitted on `warpgogol-com#build`, `nicaragua-projekt#build`, or their `build:check` counterparts) **without both**:

1. rfc-0266-generated task `outputs` (the command manifest's declared read/write paths — hand-listing outputs is explicitly rejected, see rfc-0259 Alternatives), and
2. a green `pipeline.cache.parity --site <name>` run cited in the same change, for both apps.

`pipeline.cache.parity` (`packages/os/site-kernel-checks/src/pipeline-cache-parity.ts`) proves cold-vs-warm build byte-equivalence. It runs a real cold + warm turbo build cycle per app — expensive, so it is a weekly scheduled CI job (`.github/workflows/cache-parity.yml`), not a per-PR gate, and is not part of `PACKAGES_CHECK_PIPELINE`.

## Biome token validation (RFC-0201)

- `biome.tokens.validate` runs in `APPS_BUILD_CHECK_PIPELINE` after `biome.css.generate` (in `APPS_BUILD_PREPARE_PIPELINE`) has produced the generated CSS. It scans shared UI CSS and app CSS for `var(--ds-*)` references and validates them against the active biome YAML, generated biome CSS, and default tokens.
- **Agents MUST NOT fix `BIOME-TOKEN-*` violations by editing generated app CSS files** (e.g., `src/styles/biome.generated.css`, `src/styles/global.css`) that carry the `GENERATED_MARKER`. Fixes belong in:
  1. `packages/ontology/biomes/<id>.yaml` — add the missing token mapping.
  2. The biome CSS generator mapping in `packages/os/site-kernel-codegen` — update `buildExpectedBiomeCss` or the generator source.
  3. Shared UI component CSS — change the component to use an adaptive token that works across both light and dark biomes.
- App-local authored CSS (e.g., `src/styles/local.css`) MAY define `--ds-*` tokens as a temporary workaround, but these trigger `BIOME-TOKEN-03` warnings and should eventually be promoted to the biome YAML.

## Font pipeline (RFC-0371)

Fonts are self-hosted via Fontsource CSS imports — no external CDN (Google Fonts, Typekit, etc.) is permitted.

- **Biome-driven**: each biome YAML has a `fonts` section listing font families, weights, and italic weights. `fonts.imports.generate` reads this section and emits `src/styles/fonts.imports.css` with `@import "@fontsource/<pkg>/<weight>.css"` lines.
- **Vite bundling**: Vite resolves the `@import` statements at build time and bundles woff2 files as hashed `_astro/` assets. No font binary files are copied to `public/`.
- **Author-time validation**: `fonts.contract.validate` enforces 4 rules: (1) no font binaries in `public/`, (2) at least one `@fontsource/*` import in `src/styles/`, (3) each imported package is in `package.json` dependencies, (4) each package has an approved license (OFL-1.1, Apache-2.0, MIT, BSD-3-Clause, CC-BY-4.0).
- **Postbuild validation**: `fonts.origin.validate` fails if any rendered HTML references an external font origin (`fonts.googleapis.com`, `fonts.gstatic.com`, `use.typekit.net`, `fonts.bunny.net`).
- **App dependencies**: each consuming app must declare `@fontsource/*` packages in its `package.json` dependencies.
- **License obligations**: Fontsource packages include `LICENSE.txt` in their NPM packages. The repository satisfies OFL distribution requirements by retaining these packages in `node_modules`. A future RFC may tighten this by copying license files to `public/licenses/`.
- **ADR-0001** (self-host Playfair Display and DM Mono) is superseded by this RFC. The font choices remain valid; only the delivery mechanism changed from copy-to-public to CSS imports.
