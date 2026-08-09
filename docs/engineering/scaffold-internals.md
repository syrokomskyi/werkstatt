# Engineering: Scaffold Internals

> RFC-0029 / RFC-0030 / DNA-36

This document explains how `onboarding.scaffold` works internally and how to maintain it as the canonical new-app generator.

---

## Overview

`onboarding.scaffold` lives in `packages/os/site-kernel-onboarding/src/scaffold.ts`. It reads template files from `packages/os/site-kernel-onboarding/src/templates/` and writes a fully compliant new app skeleton to `apps/<id>/`.

The scaffold is the single source of truth for new-app structure. Any drift between scaffold output and an existing app's structure is a defect in one or the other.

---

## Architecture

```
packages/os/site-kernel-onboarding/
├── src/
│   ├── scaffold.ts         — runOnboardingScaffold (main generator)
│   ├── checklist.ts        — runOnboardingChecklist (readiness reporter)
│   ├── module.ts           — createOnboardingModule (kernel registration)
│   ├── index.ts            — public exports
│   └── templates/
│       ├── system.md.template            ← metadata layer
│       ├── package.json.template
│       ├── index-page.md.template
│       ├── src/content/pages/{lang}/cosmic/passport.md.template
│       ├── src/content/pages/{lang}/cosmic/star-map.md.template
│       ├── wrangler.jsonc.template
│       └── runtime/                      ← runtime layer (RFC-0030)
│           ├── astro.config.mjs.template
│           ├── layout.astro.template
│           ├── catch-all.astro.template
│           ├── middleware.ts.template
│           ├── middleware-language-redirect.ts.template
│           ├── configure-common.ts.template
│           ├── configure-features.ts.template
│           ├── content.config.ts.template
│           ├── content-collections.ts.template
│           ├── blocks-renderer.astro.template
│           ├── gitignore.template
│           └── github-deploy.yml.template
└── package.json
```

---

## Template token system

Templates use `{{TOKEN_NAME}}` substitution. Available tokens:

| Token                  | Value                                        |
| ---------------------- | -------------------------------------------- |
| `{{CLIENT_ID}}`        | App identifier (kebab-case)                  |
| `{{DOMAIN}}`           | Client FQDN (e.g. `example.de`)              |
| `{{BIOME_ID}}`         | Biome identifier                             |
| `{{CONSTELLATION_ID}}` | Constellation identifier                     |
| `{{DEFAULT_LANG}}`     | Default language code (e.g. `de`)            |
| `{{SYSTEM_STAR}}`      | Star name for primary page (default: `Vega`) |
| `{{TAGLINE}}`          | App tagline                                  |

Tokens that do not resolve are left as-is (`{{UNKNOWN}}`) in the output. This is intentional — unresolved tokens surface clearly in the generated files.

---

## Generated files

### Metadata layer

| Path | Description |
| --- | --- |
| `src/content/system.md` | App manifest with identity, pages, growth, release blocks |
| `package.json` | App scripts and dependencies |
| `tsconfig.json` | Inherits from workspace `tsconfig.base.json` |
| `wrangler.jsonc` | Cloudflare Pages config |
| `tools/kernel.config.ts` | Kernel command registration stub |
| `src/styles/global.css` | Empty global CSS stub |
| `src/content/pages/<lang>/index.md` | Home page stub |
| `src/content/pages/<lang>/cosmic/passport.md` | Passport page |
| `src/content/pages/<lang>/cosmic/star-map.md` | Star map page |
| `public/.well-known/cosmic-passport-key.json` | Active public key (real, generated fresh) |

### Runtime layer (RFC-0030)

| Path | Template | Description |
| --- | --- | --- |
| `astro.config.mjs` | `astro.config.mjs.template` | Static SSG config with React + Vite chunk splitting |
| `src/layouts/layout.astro` | `layout.astro.template` | HTML shell with `data-biome` attribute + global CSS |
| `src/pages/<lang>/[...slug].astro` | `catch-all.astro.template` | Thin catch-all route calling `buildPage` |
| `src/middleware.ts` | `middleware.ts.template` | Middleware chain entry point |
| `src/middleware/language-redirect.ts` | `middleware-language-redirect.ts.template` | Language-prefix redirect |
| `src/configure/common.ts` | `configure-common.ts.template` | `defaultLanguageCode` constant |
| `src/configure/features.ts` | `configure-features.ts.template` | Empty feature registry stub |
| `src/content.config.ts` | `content.config.ts.template` | Astro content collection definitions |
| `src/utils/content-collections.ts` | `content-collections.ts.template` | `getPageEntryWithFallback` utility |
| `src/components/BlocksRenderer.astro` | `blocks-renderer.astro.template` | Block dispatcher (add imports as sections are pinned) |
| `.gitignore` | `gitignore.template` | Standard ignores including `biome.generated.css` |
| `.github/workflows/deploy-<id>.yml` | `github-deploy.yml.template` | Cloudflare Pages deploy workflow |

---

## Keypair generation

`onboarding.scaffold` calls `generateKeypair()` from `@warpgogol/passport/sign`. This generates a random Ed25519 keypair using `@noble/ed25519`. The public key is multibase-encoded and written to the key file. The private key hex is printed to stdout exactly once — it is never written to any file.

The scaffold does NOT call `passport.key.rotate` — that command is for rotating an existing key. Initial generation is scaffold-only.

---

## Input validation

The scaffold validates inputs before writing any files:

| Rule    | Check                                                   |
| ------- | ------------------------------------------------------- |
| `OS-01` | `--client` is required                                  |
| `OS-02` | `--client` must match `/^[a-z][a-z0-9-]*$/`             |
| `OS-03` | `--domain` is required                                  |
| `OS-04` | `--domain` must be a valid FQDN (parsed as URL)         |
| `OS-05` | `--biome` is required                                   |
| `OS-06` | `--biome` must be in `KNOWN_BIOMES` set                 |
| `OS-07` | `--constellation` is required                           |
| `OS-08` | `--constellation` must be in `KNOWN_CONSTELLATIONS` set |
| `OS-09` | Target `apps/<id>/` must not already exist              |

If any input fails, no files are written and the command exits non-zero.

---

## Adding a new biome or constellation

When a new biome is added to `packages/ontology/biomes/<id>.yaml`:

1. Add the id to `KNOWN_BIOMES` in `scaffold.ts`.
2. Verify `onboarding.scaffold --biome <new-id>` generates valid output.
3. Run `app.contract.full` against the scaffold output in a throwaway app.

Same process for constellations (`KNOWN_CONSTELLATIONS`).

---

## Extraction-parity discipline (RFC-0030)

The runtime templates are extracted from `apps/<reference-app>/` with `{{TOKEN}}` substitution for client-specific values. The discipline is:

**If `apps/<reference-app>/` evolves, the corresponding template must evolve.**

This is verified by an extraction-parity test that applies `<reference-app>` tokens to each template and asserts the output matches the actual file. If the reference app's layout, middleware, or route changes, the template change is required in the same PR or the extraction-parity test will fail CI.

To run the extraction-parity check manually:

```bash
# (when the test suite is wired up — RFC-0030 Phase B)
rtk pnpm --filter @warpgogol/site-kernel-onboarding test
```

---

## Adding a new generated file

To add a new file to the scaffold output:

1. Create the file in the reference app first (it is the reference implementation).
2. Create `src/templates/runtime/<filename>.template` with `{{TOKEN}}` substitutions for all client-specific values.
3. In `scaffold.ts`, add a `writeFile(...)` call in the runtime layer section using `applyTokens(readRuntimeTemplate("<filename>.template"), tokens)`.
4. Add the extraction-parity test for the new file.
5. Update this document and the onboarding guide.
6. Run the smoke test (see below).

---

## Template version sync (RFC-0137)

The root `upgrade-packages` script automatically invokes `config.template.sync` after `pnpm up --latest` so that templates stay current without manual steps:

```sh
rtk pnpm run upgrade-packages
```

This runs `config.template.sync --site warpgogol-com` automatically, which blindly overwrites:

- `dependencies` and `devDependencies` in `packages/os/site-kernel-onboarding/src/templates/package.template.json`
- `optimizeDeps` and `ssr` blocks in `packages/os/site-kernel-onboarding/src/templates/runtime/astro.config.template.mjs`

To run the sync manually (e.g. after a selective app-only upgrade):

```sh
rtk pnpm exec werkstatt run config.template.sync --site <reference-app>
```

Use `--dry-run` to preview changes without writing. See RFC-0137 for the full contract.

---

## Smoke test

The scaffold output should always pass `app.contract.full`. The CI smoke test runs automatically on every PR touching the onboarding package:

```bash
# Run locally:
rtk node packages/werkstatt/bin/werkstatt.mjs run onboarding.scaffold \
  --client __scaffold-test__ \
  --domain scaffold-test.example.de \
  --biome nonprofit-trust \
  --constellation nonprofit-donation-funnel

rtk pnpm install
rtk pnpm --filter __scaffold-test__ build.prepare
rtk node packages/werkstatt/bin/werkstatt.mjs run app.contract.full \
  --site __scaffold-test__

# Inspect results, then clean up:
rm -rf apps/__scaffold-test__
```

The CI workflow is at `.github/workflows/scaffold-smoke.yml`. It triggers on PRs that touch `packages/os/site-kernel-onboarding/`, `packages/os/site-kernel-checks/`, or `apps/<reference-app>/`.

Any new RFC that adds a validator to `app.contract.full` will immediately surface if the scaffold is not updated to satisfy the new validator — the smoke test is the load-bearing acceptance signal for RFC-0029 and RFC-0030 jointly.

---

## Maintaining parity with the reference app

`apps/<reference-app>/` is the reference implementation for a fully compliant app. After any scaffold change, verify that:

1. The scaffold-generated structure matches the reference app's structure where applicable (allowing for content-specific differences).
2. `app.contract.full --site <reference-app>` still passes.
3. Any new file category required by a new RFC is added to both the scaffold and the reference app before the RFC is marked `implementedAt`.
4. The extraction-parity test passes (templates reproduce the reference app's runtime files).

---

## Security invariants

- **Never write a private key to disk.** The `generateKeypair()` call returns a `privateKeyHex` string — print it to stdout and discard it.
- **Never commit a private key.** The `.gitignore` in each scaffolded app excludes `*.private-key` and `.env*`, but the strongest protection is simply never writing the key to a file.
- **`tools/kernel.config.ts` is not a secret.** It contains only command registrations and is safe to commit.
