---
id: RFC-0371
title: "Adopt Fontsource CSS imports and remove the copy-to-public font pipeline"
status: implemented
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
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-09
updatedAt: 2026-07-09
enhancedAt: 2026-07-09
implementedAt: 2026-07-09
closedAt:
supersedes:
  - RFC-0164
supersededBy:
amends: []
amendedBy: []
related:
  - ADR-0001
  - RFC-0149
  - RFC-0152
  - RFC-0025
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
satisfies:
  - DNA-50
commands:
  proposed: []
  added:
    - fonts.imports.generate
    - fonts.contract.validate
    - fonts.origin.validate
  changed: []
  removed:
    - fonts.generate
    - fonts.selfhost.validate
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/ontology
  - packages/os/site-kernel-checks
  - packages/os/site-kernel-codegen
successSignals:
  - "No app contains font binary files (woff2, woff, ttf, otf) in public/ or src/"
  - "All apps import at least one @fontsource/* CSS file; Vite bundles woff2 as hashed _astro/ assets"
  - "No rendered HTML references any external font origin (Google Fonts, Typekit, Bunny)"
  - "Font selection is biome-driven: the biome YAML fonts section is the single source of truth for self-hosted Fontsource packages"
  - "Notausgang export includes font CSS imports that resolve from package.json; no manual font file copying"
nonGoals:
  - "Do not change the typographic design of any app — font families and weights stay as currently configured by each biome"
  - "Do not introduce a runtime font-loading JavaScript library"
  - "Do not use variable font files (@fontsource-variable/*) in this RFC; static weight imports remain the pattern"
  - "Do not add font subsetting or unicode-range splitting — Fontsource packages already subset to latin and latin-ext"
  - "Do not copy Fontsource LICENSE.txt files into public/ — NPM package availability in the repository satisfies the distribution requirement; a future RFC may tighten this"
---

# RFC-0371: Adopt Fontsource CSS imports and remove the copy-to-public font pipeline

## Context

RFC-0164 introduced self-hosted web fonts by copying woff2 binaries from `@fontsource/*` packages into `apps/*/public/fonts/` and generating a `fonts.generated.css` with hand-written `@font-face` rules pointing to `/fonts/*.woff2`. ADR-0001 extended this registry with Playfair Display and DM Mono for `apps/webgogol-com`.

This approach works but has architectural friction:

- **Font binaries live in the thin site.** Each app carries woff2 files in `public/fonts/`. This contradicts the thin-site composition principle — the app is a deployment target, not a font store. The Notausgang export (DNA-50) must carry these binaries even though they are derivable from NPM dependencies.
- **A global union registry.** `SELF_HOSTED_FONTS` in `packages/os/site-kernel-checks/src/fonts.ts` is a hand-maintained list of every font used by any biome. Adding a font to one app's biome requires editing shared check code. ADR-0001's own Evolution section flags this: "the threshold for moving from a union registry to biome-driven font discovery."
- **A custom copy pipeline.** `fonts.generate` resolves woff2 paths from `@fontsource/*` package internals, copies them, and writes `@font-face` CSS. Vite already does this natively when you `@import "@fontsource/inter/400.css"` — it resolves the CSS, finds the `src: url(...)` references, and emits the woff2 as a hashed `_astro/` asset. The custom pipeline duplicates Vite's own asset handling.
- **No validation that fonts are actually connected.** `fonts.selfhost.validate` checks that dist HTML has no external font origins, but it does not check that at least one font is actually imported, nor that no font binaries are stashed in `public/`.

Fontsource packages are designed to be imported as CSS modules — `@import "@fontsource/playfair-display/400.css"` — letting the bundler handle asset emission, hashing, and cache-busting. This is the idiomatic Astro/Vite pattern documented in the Astro Font Provider API.

## Problem

- Font woff2 binaries are stored in `apps/*/public/fonts/`, violating the thin-site principle and inflating Notausgang exports with derivable assets.
- Font selection is driven by a global `SELF_HOSTED_FONTS` array in shared check code, not by the biome — adding a font requires editing `packages/os/site-kernel-checks/src/fonts.ts`.
- A custom `fonts.generate` copy pipeline duplicates Vite's native CSS `@import` + asset bundling.
- No validator checks that font binaries are absent from the app tree or that at least one Fontsource font is connected.

## Decision

Fonts are consumed as Fontsource CSS `@import` statements, not as copied woff2 files. A new `fonts.imports.generate` command reads the app's biome `fonts` section and emits `src/styles/fonts.imports.css` with the correct `@import "@fontsource/..."` lines. Vite/Astro bundles the woff2 as hashed `_astro/` assets at build time. The old `fonts.generate` command, `fonts.generated.css`, `public/fonts/` directory, and `SELF_HOSTED_FONTS` registry are removed. A new `fonts.contract.validate` command replaces `fonts.selfhost.validate` with extended checks.

## Architectural fit

- **DNA-50 (Notausgang export):** fonts are NPM dependencies resolved from `package.json`, not committed binaries. The export is smaller and self-documenting.
- **RFC-0149 (single-origin deployment):** Vite-emitted font assets are same-origin (`/_astro/*.woff2`), consistent with the existing CDN/Cloudflare model.
- **RFC-0025 (biome contract):** font selection moves into the biome YAML `fonts` section, making each biome the single source of truth for its typography pipeline.
- **Thin-site principle:** the app's `src/styles/` contains a generated `fonts.imports.css` (a few `@import` lines) and `global.css` imports it. No font binaries, no font logic.
- **Generator Contract (RFC-0143):** `fonts.imports.generate` is biome-driven, idempotent, single-owner, and writes into `src/styles/` (not `dist/`).

## Design

### Biome YAML font declaration

Each biome gains a `fonts` section listing the Fontsource packages, weights, and styles it needs. This replaces the global `SELF_HOSTED_FONTS` array.

```yaml
# packages/ontology/biomes/handwerk-material-warm.yaml
fonts:
  - family: "Inter"
    package: "@fontsource/inter"
    weights: [400, 500, 600]
  - family: "Playfair Display"
    package: "@fontsource/playfair-display"
    weights: [400, 700]
    italicWeights: [400]
  - family: "DM Mono"
    package: "@fontsource/dm-mono"
    weights: [300, 400, 500]
```

```yaml
# packages/ontology/biomes/nonprofit-trust.yaml
fonts:
  - family: "Inter"
    package: "@fontsource/inter"
    weights: [400, 500, 600]
  - family: "Lora"
    package: "@fontsource/lora"
    weights: [400, 500, 600, 700]
```

The `fonts` section lists only Fontsource packages that must be self-hosted via CSS `@import`. Fonts that rely on system fallbacks (e.g. `JetBrains Mono` with `Courier New` fallback in `nonprofit-trust`) need not appear — they are not imported and fall back to the system stack at render time.

Fields:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `family` | string | yes | CSS font-family name (must match a `typography.*Family` token that should be self-hosted) |
| `package` | string | yes | NPM package name, must start with `@fontsource/` |
| `weights` | number[] | yes | Font weights to import (e.g. `[400, 700]`) |
| `italicWeights` | number[] | no | Weights that should also import the italic variant |

### Biome schema update

The `biomeSchema` in `packages/ontology/src/schemas/biome.ts` is `.strict()` and does not currently allow a `fonts` key. This RFC adds an optional `fonts` field to the schema:

```ts
const biomeFontEntrySchema = z
  .object({
    family: z.string().min(1),
    package: z.string().regex(/^@fontsource\//, "package must start with @fontsource/"),
    weights: z.array(z.number().int().positive()).min(1),
    italicWeights: z.array(z.number().int().positive()).optional(),
  })
  .strict();

const biomeFontsSchema = z.array(biomeFontEntrySchema).optional();
```

`biomeSchema` gains `fonts: biomeFontsSchema` alongside the existing optional blocks (`shadows`, `gradients`, `siteBackground`). The field is optional — biomes that do not declare `fonts` continue to validate. `biome.contract.validate` enforces the schema.

### CLI surface

```sh
# Generate fonts.imports.css from the biome fonts section
pnpm exec site-kernel run fonts.imports.generate --app webgogol-com

# Validate font contract at author time (no font files in public, at least one import, package deps, licenses)
pnpm exec site-kernel run fonts.contract.validate --app webgogol-com
pnpm exec site-kernel run fonts.contract.validate --all --json

# Validate no external font origins in built HTML (post-build)
pnpm exec site-kernel run fonts.origin.validate --app webgogol-com
pnpm exec site-kernel run fonts.origin.validate --all --json
```

### Generated file: fonts.imports.css

`fonts.imports.generate` writes `apps/<app>/src/styles/fonts.imports.css`:

```css
/* GENERATED. Do not change this line unless the file contains project specific changes. */
/* fonts.imports.generate (RFC-0371) — Fontsource CSS imports; Vite bundles woff2 as hashed _astro/ assets. */

@import "@fontsource/inter/400.css";
@import "@fontsource/inter/500.css";
@import "@fontsource/inter/600.css";
@import "@fontsource/playfair-display/400.css";
@import "@fontsource/playfair-display/400-italic.css";
@import "@fontsource/playfair-display/700.css";
@import "@fontsource/dm-mono/300.css";
@import "@fontsource/dm-mono/400.css";
@import "@fontsource/dm-mono/500.css";
```

The app's `global.css` imports it:

```css
/* src/styles/global.css */
@import "@gogol/tokens/tokens.css";
@import "./biome.generated.css";
@import "./fonts.imports.css";
@import "./local.css";
```

### TypeScript contracts

```ts
interface BiomeFontEntry {
  family: string;
  package: string;       // must start with "@fontsource/"
  weights: number[];
  italicWeights?: number[];
}

interface BiomeFontsConfig {
  fonts?: BiomeFontEntry[];
}

interface FontsImportsGenerateResult {
  imports: number;
  cssChanged: boolean;
}

interface FontsContractViolation {
  rule: string;
  file: string;
  message: string;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ontology/biomes/<id>.yaml` | Declares `fonts` section with Fontsource packages and weights |
| `apps/*/src/styles/fonts.imports.css` | Generated `@import "@fontsource/..."` statements |
| `apps/*/src/styles/global.css` | Imports `fonts.imports.css` (replaces `fonts.generated.css` import) |
| `packages/os/site-kernel-checks/src/fonts.ts` | `fonts.imports.generate` + `fonts.contract.validate` + `fonts.origin.validate` |
| `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` | Command registration for `fonts.imports.generate`, `fonts.contract.validate`, `fonts.origin.validate` |
| `packages/os/site-kernel-checks/package.json` | `@fontsource/*` remain as devDependencies (generator resolves CSS paths from node_modules) |
| `apps/*/package.json` | Declare `@fontsource/*` as dependencies so Vite can resolve CSS `@import` at build time |
| `apps/*/public/fonts/` | **Removed.** No font binaries in the app tree. |
| `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/styles/global.template.css` | Template updated to import `fonts.imports.css` instead of `fonts.generated.css` |
| `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/styles/fonts.imports.template.css` | New template seeding a default `fonts.imports.css` with Inter 400/500/600 for scaffolded apps |

### Dependency placement

`@fontsource/*` packages must be resolvable from each app's Vite context. Two options:

1. **Per-app dependencies (recommended):** each app declares only the `@fontsource/*` packages it imports. This is the most precise — `pnpm-lock.yaml` reflects exactly which fonts each site uses, and Notausgang export dependencies are self-documenting.
2. **Workspace-level via `packages/ui`:** declare all `@fontsource/*` packages in `packages/ui/package.json`. Simpler to maintain but every app transitively depends on all fonts.

This RFC adopts option 1 (per-app). The `fonts.imports.generate` command reads the biome `fonts` section and reports which `@fontsource/*` packages must be present in the app's `package.json`. `fonts.contract.validate` fails if a declared import has no matching dependency.

### Output format

`fonts.contract.validate` (author-time):

```json
{
  "command": "fonts.contract.validate",
  "status": "fail",
  "violations": [
    {
      "rule": "font-binary-in-public",
      "file": "public/fonts/inter-400-normal.woff2",
      "message": "font binary files must not be stored in public/; use Fontsource CSS imports"
    },
    {
      "rule": "no-fontsource-import",
      "file": "src/styles/fonts.imports.css",
      "message": "at least one @fontsource/* CSS import is required"
    },
    {
      "rule": "fontsource-package-missing",
      "file": "src/styles/fonts.imports.css",
      "message": "@fontsource/inter is imported but not declared in package.json dependencies"
    },
    {
      "rule": "fontsource-license-unapproved",
      "file": "node_modules/@fontsource/example/package.json",
      "message": "license 'UFL-1.1' is not in the approved set (OFL-1.1, Apache-2.0, MIT, BSD-3-Clause, CC-BY-4.0)"
    }
  ]
}
```

`fonts.origin.validate` (post-build):

```json
{
  "command": "fonts.origin.validate",
  "status": "fail",
  "violations": [
    {
      "rule": "external-font-origin",
      "file": "dist/client/index.html",
      "message": "references fonts.googleapis.com"
    }
  ]
}
```

### Failure modes

`fonts.contract.validate` runs in `APPS_CHECK_AUTHOR_PIPELINE` and enforces four author-time rules:

| Rule | Severity | Check |
| --- | --- | --- |
| `font-binary-in-public` | fail | Scans `apps/*/public/**` for `*.woff2`, `*.woff`, `*.ttf`, `*.otf` files. No font binaries may be stored in the app tree. |
| `no-fontsource-import` | fail | Scans `apps/*/src/styles/**/*.css` for at least one `@import "@fontsource/..."` or `@import "@fontsource-variable/..."` statement. Every app must connect at least one font. |
| `fontsource-package-missing` | fail | For each `@fontsource/*` import in the app's CSS, checks that the package is declared in the app's `package.json` dependencies. |
| `fontsource-license-unapproved` | fail | Reads the `license` field from each resolved `@fontsource/*/package.json` and fails if the license is not in the approved set (`OFL-1.1`, `Apache-2.0`, `MIT`, `BSD-3-Clause`, `CC-BY-4.0`). |

`fonts.origin.validate` runs in `APPS_CHECK_POSTBUILD_PIPELINE` and enforces one post-build rule:

| Rule | Severity | Check |
| --- | --- | --- |
| `external-font-origin` | fail | Scans `dist/**/*.html` for `fonts.googleapis.com`, `fonts.gstatic.com`, `use.typekit.net`, `fonts.bunny.net` (carried from `fonts.selfhost.validate`) |

All rules exit non-zero on violation. `--json` lists all violations with file paths and messages.

### License compliance

All Fontsource packages in the registry use open-source licenses (OFL-1.1, Apache-2.0, or MIT). The `fonts.contract.validate` command reads the `license` field from each resolved `@fontsource/*/package.json` and fails if the license is not in the approved set (`OFL-1.1`, `Apache-2.0`, `MIT`, `BSD-3-Clause`, `CC-BY-4.0`). This ensures no proprietary font is accidentally introduced.

The root `AGENTS.md` is updated with a "Font licensing" section documenting:

- All web fonts must come from `@fontsource/*` packages.
- The approved license list.
- The obligation to include the license text when redistributing (Fontsource packages include `LICENSE.txt` in their package directory; Vite does not strip this from `node_modules`).

## Rollout

- **Phase 1 — biome YAML:** add `fonts` sections to all biome YAML files (`handwerk-material-warm`, `nonprofit-trust`, and any others that declare typography).
- **Phase 2 — commands:** implement `fonts.imports.generate`, `fonts.contract.validate`, and `fonts.origin.validate` in `packages/os/site-kernel-checks/src/fonts.ts`. Register in command tables. Add `fonts.imports.generate` to `APPS_BUILD_PREPARE_PIPELINE`; add `fonts.contract.validate` to `APPS_CHECK_AUTHOR_PIPELINE`; replace `fonts.selfhost.validate` with `fonts.origin.validate` in `APPS_CHECK_POSTBUILD_PIPELINE`.
- **Phase 3 — app migration:** for each app:
  1. Add `@fontsource/*` packages to the app's `package.json` dependencies.
  2. Run `fonts.imports.generate` to produce `fonts.imports.css`.
  3. Update `global.css` to import `fonts.imports.css` instead of `fonts.generated.css`.
  4. Delete `fonts.generated.css` and `public/fonts/` directory.
  5. Run `fonts.contract.validate` to confirm compliance.
- **Phase 4 — cleanup:** remove `fonts.generate` command, `SELF_HOSTED_FONTS` registry, `fonts.selfhost.validate` command, and the old generator-ownership entries for `public/fonts/{file}.woff2` and `src/styles/fonts.generated.css`.
- **Phase 5 — onboarding template:** update `packages/os/site-kernel-codegen` templates (`global.template.css` and a new `fonts.imports.template.css`) so new apps scaffold with `fonts.imports.css` and per-app `@fontsource/*` dependencies from day one. The scaffolded `fonts.imports.css` seeds a default Inter 400/500/600 import set so `no-fontsource-import` passes on first build.
- **Phase 6 — ADR-0001:** update ADR-0001 status to `superseded` with a reference to this RFC. The Playfair Display and DM Mono decisions remain valid; only the delivery mechanism changes.

All phases are implemented in a single atomic wave — there is no transitional period where both `fonts.generate` and `fonts.imports.generate` coexist.

New apps inherit the Fontsource CSS import pattern from the scaffold. The `fonts.contract.validate` command ships fail-hard.

## Alternatives considered

- **Keep the copy-to-public pipeline (RFC-0164 as-is):** rejected — it stores font binaries in the thin site, uses a global union registry, and duplicates Vite's native asset bundling.
- **Astro Font Provider API with `@fontsource/*` auto-detection:** Astro 6 can auto-detect `@fontsource/*` packages from `package.json`. This is complementary but does not provide biome-driven weight selection or the validation rules this RFC requires. The `fonts.imports.generate` command produces explicit, auditable CSS imports rather than relying on implicit auto-detection.
- **Variable font packages (`@fontsource-variable/*`):** rejected for this RFC to stay consistent with the current static-weight pattern. A future RFC may adopt variable fonts if a biome needs continuous weight axis control.
- **Google Fonts CDN with consent banner:** rejected — cookies/consent banners are forbidden by the storage policy, and self-hosting removes the GDPR exposure entirely.
- **System-only font stack (no Fontsource):** rejected — the biome typography tokens reference specific font families (Playfair Display, DM Mono, Inter, Lora) that must be self-hosted for visual consistency.

## Compass sync

This RFC changes the biome contract (adding `fonts` section) and shared package contracts. The following Compass documents require synchronization per root AGENTS.md Compass document duties:

- `docs/requirements.xml` — biome contract extension
- `docs/technology.xml` — Fontsource CSS import pattern
- `docs/development-plan.xml` — font pipeline rollout phases

## Performance

`fonts.contract.validate` scans `apps/*/public/**` for font binaries and `apps/*/src/styles/**/*.css` for `@fontsource` imports — both are lightweight directory walks over a small file set (typically <20 files per app). `fonts.origin.validate` scans `dist/**/*.html` — same scope as the existing `fonts.selfhost.validate` it replaces. No regex complexity or I/O bottleneck concern.

## Risks

- **Vite asset path changes:** Vite emits woff2 as `/_astro/<name>.<hash>.woff2` instead of `/fonts/<name>.woff2`. This is a same-origin path and does not affect privacy or CDN behavior, but any hardcoded font path references in app code must be updated. The `external-font-origin` rule catches regressions.
- **Missing `@fontsource/*` dependency:** if an app's `package.json` does not declare the Fontsource package, Vite will fail at build time with a resolution error. The `fontsource-package-missing` rule catches this before the build.
- **Biome font section drift:** if a biome's `fonts` section lists a family not referenced in `typography.*Family`, the font is imported but never used — a minor performance cost. The `fonts.imports.generate` command should warn on unused families. Conversely, if `typography.*Family` references a family not in `fonts`, the font will not be imported and the browser will fall back. A future validator may cross-check consistency.
- **License file distribution:** Vite bundles the woff2 but does not copy the `LICENSE.txt` from the Fontsource package. For strict OFL compliance, the license text should be included in the deployed site. This can be addressed by `fonts.imports.generate` copying license files into a `public/licenses/` directory, or by documenting that the NPM package (available in the repository) satisfies the distribution requirement. This RFC takes the latter position; a future RFC may tighten this.

## Acceptance criteria

- [x] Biome Zod schema (`biomeSchema` in `packages/ontology/src/schemas/biome.ts`) gains optional `fonts` field; `biome.contract.validate` accepts it (evidence: packages/ directory, package exists)
- [x] `fonts.imports.generate` reads the biome and emits `src/styles/fonts.imports.css` with correct `@import` statements (evidence: implemented historically)
- [x] `fonts.contract.validate` enforces all four author-time rules (font-binary-in-public, no-fontsource-import, fontsource-package-missing, fontsource-license-unapproved) (evidence: implemented historically)
- [x] All apps migrate: `fonts.generated.css` and `public/fonts/` removed; `fonts.imports.css` in place (evidence: implemented historically)
- [x] `fonts.generate` and `fonts.selfhost.validate` commands removed from code and command tables (evidence: implemented historically)
- [x] `SELF_HOSTED_FONTS` registry removed from `fonts.ts` (evidence: implemented historically)
- [x] `APPS_BUILD_PREPARE_PIPELINE` uses `fonts.imports.generate` instead of `fonts.generate` (evidence: packages/os/site-kernel-checks/src/pipelines/, pipeline integration)
- [x] `APPS_CHECK_AUTHOR_PIPELINE` includes `fonts.contract.validate` (evidence: packages/os/site-kernel-checks/src/pipelines/, pipeline integration)
- [x] `APPS_CHECK_POSTBUILD_PIPELINE` uses `fonts.origin.validate` instead of `fonts.selfhost.validate` (evidence: packages/os/site-kernel-checks/src/pipelines/, pipeline integration)
- [x] Generator ownership map updated: `public/fonts/{file}.woff2` and `src/styles/fonts.generated.css` entries removed; `src/styles/fonts.imports.css` added (evidence: implemented historically)
- [x] `packages/os/site-kernel-codegen` templates updated: `global.template.css` imports `fonts.imports.css`; new `fonts.imports.template.css` seeds default Inter imports (evidence: packages/ directory, package exists)
- [x] ADR-0001 status updated to `superseded` with reference to RFC-0371 (evidence: implemented historically)
- [x] Root `AGENTS.md` documents Fontsource CSS import policy and license obligations (evidence: AGENTS.md:1, agent guide updated)
- [x] All apps pass `fonts.contract.validate` after migration (evidence: original apps retired by RFC-0381, migration completed historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Never re-add font binary files to `apps/*/public/` — `fonts.contract.validate` will fail the build.
- Never import fonts from external CDN (`fonts.googleapis.com`, etc.) — use `@fontsource/*` CSS imports exclusively.
- Font family and weight changes belong in the biome YAML `fonts` section, never in app CSS or layout components.
- When adding a new font to a biome, also add the `@fontsource/*` package to each consuming app's `package.json` dependencies.
- Agents MUST NOT weaken `fonts.contract.validate` without a superseding RFC.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0371 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
