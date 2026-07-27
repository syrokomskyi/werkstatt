# Architecture DNA — Cross-Site Invariants

> **Scope.** This document defines the non-negotiable architectural invariants that every Sternsystem in the Warpgogol fleet must satisfy. Invariants are extracted from per-site documentation and rewritten here as cross-site OS requirements. Each site's own AGENTS.md may add site-specific extensions but may not weaken these invariants. The `apps/*` directory is retired (RFC-0381); deployable sites are Sternsystems registered in `systems/registry.yaml`.
>
> **Phase 2 note.** Items marked _enforceable later_ are candidates for new kernel validation commands. Items marked _enforceable now_ are already checked by existing OS commands.
>
> **Canonical numbered registry.** The authoritative `DNA-N` definitions live in [`docs/architecture-dna.md`](../../../../docs/architecture-dna.md). This file is a derived cross-site _enforcement view_ — when the two differ, the numbered registry wins, and a `DNA-N` must not be introduced here without also adding it to the registry (enforced by `dna.registry.validate`, RFC-0158).

---

## Enforcement key

| Symbol          | Meaning                                                      |
| --------------- | ------------------------------------------------------------ |
| ✅ **Now**      | Enforced by an existing OS command.                          |
| 🔜 **Later**    | Automatable — flagged as a phase 2 kernel command candidate. |
| 📖 **Doc only** | Verified by human review; automation not yet practical.      |

---

## Invariant 1 — File-based page ownership

Visitor-facing routes are owned by files in `src/pages/`. Adding a page means creating a route file in the correct place, not inventing a parallel router or page registry.

In Astro sites, visitor-facing pages live under `src/pages/[lang]/**/*.astro`.

| Enforcement | Command |
| --- | --- |
| 🔜 Later | `naming.pages.lint` — verify all `.astro` files under `src/pages/` follow the expected path structure |

---

## Invariant 2 — Language-prefixed URLs are first-class

Visitor-facing content routes carry a language prefix such as `/{lang}/...`. The default language is centralized in `src/configure/common.ts`.

Do not introduce language-free content routes that bypass this policy.

| Enforcement | Command                      |
| ----------- | ---------------------------- |
| 📖 Doc only | Verified during route review |

---

## Invariant 3 — Static generation strategy is coordinated

`getStaticPaths()` is part of the architecture, not a local page implementation detail. Only `defaultLanguageCode` is statically emitted at build time; middleware handles language-aware entry behavior.

Do not expand build-time language generation or switch to SSR page-by-page without reviewing the whole pipeline: middleware, sitemap, canonical URLs, content availability, and semantic discovery outputs.

| Enforcement | Command                                                |
| ----------- | ------------------------------------------------------ |
| 📖 Doc only | Architectural decision — requires full pipeline review |

---

## Invariant 4 — Canonical visitor-facing meaning lives in `src/content/`

Visitor-facing copy does not originate inside route files or reusable UI components. It originates in canonical content entries and is then loaded into routes and components.

This includes: headings, paragraphs, CTA labels, navigation labels, aria labels intended for visitors, repeated structured copy such as FAQs, stats, cards, or timelines.

**Content hierarchy (RFC-0004):** Component `.md` files hold generic defaults (stubs). Project-specific section copy lives in the page `.md` frontmatter under `componentOverrides`. At render time, overrides deep-merge over defaults. This keeps components portable and pages authoritative.

| Enforcement | Command                                                                         |
| ----------- | ------------------------------------------------------------------------------- |
| ✅ Now      | `thin-copy.validate` — detects hardcoded visitor-facing copy in Astro templates |

---

## Invariant 5 — Components with copy use three-way mirroring

Any component that owns canonical visitor-facing copy must mirror across:

```
src/components/X.astro
src/content/components/{lang}/X.md      ← generic defaults, not project-specific
src/content/schemas/components/X.ts
```

Path identity must remain aligned across component, content, and schema. Section `.md` files should contain portable placeholder content; project-specific overrides belong in the page frontmatter (see Invariant 4).

| Enforcement | Command                                                                    |
| ----------- | -------------------------------------------------------------------------- |
| 🔜 Later    | `mirroring.validate` — verify component/content/schema triples are in sync |

---

## Invariant 6 — Page content is schema-validated

Page shell data must be validated by Zod schemas mirrored under `src/content/schemas/pages/` and registered through the page schema dispatcher.

Routes consume validated content; they do not hand-parse untrusted frontmatter.

| Enforcement | Command                                                                          |
| ----------- | -------------------------------------------------------------------------------- |
| ✅ Now      | `content.validate` — checks required base fields in page frontmatter             |
| 🔜 Later    | `schema.validate` — verify every page content entry has a matching schema module |

---

## Invariant 7 — Routes stay thin

Routes are orchestrators. They may: load canonical content, evaluate feature visibility, compose sections in reading order, pass `lang` and normalized data downward, hand prepared semantic models to layout or endpoint layers.

They must not: store visitor-facing labels inline, build ad hoc navigation systems, become content-processing engines, generate schema graphs inline.

| Enforcement | Command |
| --- | --- |
| ✅ Now | `thin-copy.validate` — flags inline copy in routes |
| ✅ Now | `mirror.quartet.validate` — QP-01 (RFC-0014): slug in `getPageEntryWithFallback` must match route file stem |
| 🔜 Later | `thin-routes.validate` — detect large inline arrays, ad hoc link maps, raw schema logic |

---

## Invariant 8 — Sections are reusable page building blocks

Pages are assembled from sections in reading order. Section components accept `lang`, optionally `sectionNumber?` and `pageOverride?`, load their default content via shared content infrastructure, and keep visual complexity in dedicated CSS files under `src/styles/`.

If the same meaning structure is reused across pages, reuse the section and vary content before inventing a new section type.

| Enforcement | Command                          |
| ----------- | -------------------------------- |
| 📖 Doc only | Verified during component review |

---

## Invariant 9 — Styling is token-based and file-based

All design values must come from `--ds-*` custom properties. Styles live in `src/styles/`, not inside `.astro` files.

Conventions:

- global/shared styles in `src/styles/global.css`
- component styles in `src/styles/components/**`
- page styles in `src/styles/pages/**`

No raw colors, no hardcoded spacing values, no inline `<style>` blocks, no inline `style="..."` attributes as architectural defaults.

| Enforcement | Command                                                                       |
| ----------- | ----------------------------------------------------------------------------- |
| ✅ Now      | `tokens.ds.lint` — enforces `--ds-*` naming for all CSS custom properties     |
| ✅ Now      | `tokens.colors.lint` — rejects raw `rgba(...)` and `#hex` colors in CSS files |

---

## Invariant 10 — Shared base CSS is loaded centrally

Base classes consumed by slotted children must be loaded once from the layout shell. `layout.astro` links `src/styles/global.css` explicitly via `?url` and `<link rel="stylesheet">`.

Do not duplicate foundational utility/base classes across components.

| Enforcement | Command                       |
| ----------- | ----------------------------- |
| 📖 Doc only | Verified during layout review |

---

## Invariant 11 — React/TSX exists only at hydration boundaries

React or TSX is allowed only where actual client-side interactivity exists. Interactive code must be isolated into hydrated islands rather than leaked into the static shell.

Heavy interactive dependencies must not be imported from `.astro` files or generic server-side utilities.

| Enforcement | Command                                                                        |
| ----------- | ------------------------------------------------------------------------------ |
| 🔜 Later    | `hydration.validate` — detect heavy interactive imports in server-side modules |

---

## Invariant 12 — Feature visibility is centralized

All visitor-facing visibility decisions belong to `src/configure/features.ts` or an equivalent central registry. The registry must distinguish between: page existence, section existence, and shared reusable section flags.

Do not define feature flags ad hoc in routes or components.

| Enforcement | Command                        |
| ----------- | ------------------------------ |
| 📖 Doc only | Verified during feature review |

---

## Invariant 13 — Disabled content disappears everywhere

If a page or section is disabled, it must disappear from every visitor-facing or discovery-facing surface: header, footer, CTAs, cards, breadcrumbs, sitemap consumers, semantic discovery outputs.

Hidden content must not remain discoverable through stale links or machine-readable exports.

| Enforcement | Command                                 |
| ----------- | --------------------------------------- |
| 📖 Doc only | Verified during feature toggling review |

---

## Invariant 14 — Navigation is content-driven but config-resolved

Navigation labels belong to canonical content. Concrete href resolution, canonical path mapping, and feature-aware availability belong to configuration/helpers.

Prefer semantic link targets in content and resolve real URLs centrally. Do not scatter raw href logic across routes and components.

| Enforcement | Command                           |
| ----------- | --------------------------------- |
| 📖 Doc only | Verified during navigation review |

---

## Invariant 15 — Middleware is architectural infrastructure

Middleware ordering and scope are architectural, not incidental. Language redirection must run first; middleware must stay lightweight.

Do not move heavy business logic into middleware or casually reorder handlers.

| Enforcement | Command                                                  |
| ----------- | -------------------------------------------------------- |
| 📖 Doc only | Architectural decision — requires full middleware review |

---

## Invariant 16 — Semantic outputs are projections, not a second content system

JSON-LD, `llms.txt`, `llms-full.txt`, metadata exports, and future machine-readable outputs must be derived from normalized canonical meaning.

That means: no AI-only hidden content tree, no schema generation inside UI components, no duplicated entity facts across routes and layouts, no discovery outputs that ignore feature visibility.

| Enforcement | Command                                                                        |
| ----------- | ------------------------------------------------------------------------------ |
| 🔜 Later    | `semantic.drift.validate` — detect semantic outputs that disagree with content |

---

## Invariant 17 — Cross-page facts belong in dedicated semantic helpers

Organization, person, contact, donation, initiative, and other cross-page facts must be normalized in shared semantic helpers under `src/semantic/`.

They must not be re-authored page by page in routes, sections, or layout files.

| Enforcement | Command                               |
| ----------- | ------------------------------------- |
| 📖 Doc only | Verified during semantic layer review |

---

## Invariant 18 — Scripts follow responsibility and placement boundaries

Operational or generation scripts belong in `tools/modules/` (service domain). Verification and architecture checks belong in `tools/modules/` (check domain). All commands are invoked through the `site-kernel` CLI bin.

Client-side scripts in `src/` and `public/scripts/` must follow the **script placement contract** defined in RFC-0011. Every `<script>` or `<script src>` belongs to exactly one placement class:

| Class | Description | Canonical form |
| --- | --- | --- |
| **S-1** | Component-colocated — only meaningful when the owning component is present | `src/scripts/components/{name}.ts` + Astro `<script>` with `import` inside the owning `.astro`; vanilla-JS fallback: `public/scripts/components/{name}.js` + `<script is:inline src=... defer>` inside the owning `.astro` only |
| **S-2** | Layout-global — applies to the whole document | `src/scripts/layout-scroll.ts` (or equivalent) + Astro `<script>` with `import` in `layout.astro`; MUST use `has()` DOM guard + `await import()` per sub-feature |
| **S-3** | Page-scoped inline — page-specific, ≤ 10 lines, runs before first render | `<script is:inline>` in `src/pages/` route files only; extract to `src/scripts/pages/` if larger |
| **S-X** | Data island — `type="application/ld+json"` or `type="application/json"` | Governed by semantic output contracts; exempt from placement rules |

Key prohibitions:

- S-1 scripts MUST NOT appear in `layout.astro` or any parent layout (AP-18).
- Bare `<script is:inline>` blocks for behavioral logic are forbidden everywhere — use `src/scripts/` + `import` (AP-19).
- `public/scripts/layout/` MUST NOT be created — S-2 logic lives in `src/scripts/`.
- `public/scripts/components/` paths MUST NOT be referenced from `layout.astro`.

| Enforcement | Command                                                                        |
| ----------- | ------------------------------------------------------------------------------ |
| 📖 Doc only | Verified by presence of `tools/kernel.config.ts` in each app                   |
| 🔜 Later    | `scripts.placement.validate` (RFC-0011) — enforces S-1/S-2/S-3 placement rules |

---

## Invariant 19 — Typed event catalog (DNA-27)

All client-side event tracking uses the closed `EventName` union from `@warpgogol/growth/adapter`. Application code calls `emit(name, payload)` from `@warpgogol/growth/emit` — it never imports adapter modules directly or constructs raw analytics calls.

Rules:

- `emit()` call sites may only pass event names from `EventName` (validated by `growth.events.validate`).
- Event catalog files live in `packages/ontology/growth/events/<id>.yaml` — one file per event.
- New event names require updating both `EventName` in `adapter.ts` AND the ontology YAML catalog.
- `payload` types are declared in `EventPayloadMap`; unknown keys are forbidden at runtime.
- The `locale` field is injected automatically by `emit()` — callers must not include it.

| Enforcement | Command |
| --- | --- |
| ✅ Now | `growth.events.validate` — scans emit() call sites and validates ontology event YAML |

---

## Invariant 20 — Content-declared funnels (DNA-28)

Conversion funnels are declared in `packages/ontology/growth/funnels/<id>.yaml` as ordered event sequences. Application code does not hard-code funnel logic — funnels are data, not code.

Rules:

- Every funnel file has `id`, `label`, `steps[]` (≥ 2 steps), each step referencing a valid `EventName`.
- The funnel `id` must match the filename (without extension).
- Active funnels are declared in `system.yaml growth.funnels[]` — all referenced ids must resolve.
- Funnel tracking configuration is forwarded to the adapter via `GrowthConfig.activeFunnels`.

| Enforcement | Command                                                                           |
| ----------- | --------------------------------------------------------------------------------- |
| ✅ Now      | `growth.funnel.validate` — validates funnel YAML and system.yaml cross-references |

---

## Invariant 21 — Client-editable experiments (DNA-29)

A/B experiments are declared in `packages/ontology/growth/experiments/<id>.yaml` with a closed lifecycle: `draft → active → concluded → archived`. Experiments are content, not code.

Rules:

- Experiment files declare `id`, `label`, `hypothesis`, `status`, `variants[]` (≥ 2; first must be `"control"`).
- Only `active` experiments may appear in `system.yaml growth.experiments[]`.
- `concluded` experiments must have `concludedAt` date and must be removed from `system.yaml`.
- Assignment logic (which visitor gets which variant) is a future RFC — at MVP all visitors receive `control` implicitly.

| Enforcement | Command |
| --- | --- |
| ✅ Now | `growth.experiment.validate` — validates experiment YAML and system.yaml cross-references |
| ✅ Now | `growth.experiment.archive` — validates archival hygiene (concludedAt, no stale refs in system.yaml) |

---

## Invariant 22 — Vendor-agnostic GrowthAdapter (DNA-30)

Analytics vendors are isolated behind the `GrowthAdapter` interface from `@warpgogol/growth/adapter`. Application code only calls `emit()` — it never imports vendor SDKs directly.

Rules:

- Every adapter package (`packages/growth-adapter-*/`) exports a `default GrowthAdapter` with `id`, `init()`, `track()`.
- `track()` must never throw — adapters catch all errors internally.
- Adapters must not expose vendor-specific methods on the interface object.
- The active adapter is declared in `system.yaml growth.vendor.adapter` — must match a known registered id.
- Swapping vendors = changing `system.yaml growth.vendor.adapter` + `GrowthProvider` props. No application code changes.

| Enforcement | Command |
| --- | --- |
| ✅ Now | `growth.adapter.contract` — structural check of all adapter packages |
| ✅ Now | `growth.vendor.resolve` — cross-references system.yaml adapter id against known adapters |

---

## Invariant 23 — Cosmic Passport — signed build provenance (DNA-31)

Every app in `apps/*` with `release.passport.enabled: true` must produce a signed `cosmic-passport.json` artifact during CI. The artifact is signed with an Ed25519 Verifiable Credential (`Ed25519Signature2020`) using a key stored in `public/.well-known/cosmic-passport-key.json`.

Rules:

- Private keys are never committed — they are stored as CI secrets (`PASSPORT_PRIVATE_KEY`).
- The public key file is committed; key rotation uses `passport.key.rotate`.
- `passport.verify` must pass post-deploy before the release is considered complete.
- The VC `credentialSubject` covers `appId`, `systemHash`, and `commitSha` — tampering with any of these fields is detectable.

| Enforcement | Command                                                    |
| ----------- | ---------------------------------------------------------- |
| ✅ Now      | `passport.emit` — generates and signs cosmic-passport.json |
| ✅ Now      | `passport.verify` — verifies VC signature and system hash  |

---

## Invariant 24 — Cosmic Star Map — deterministic architecture diagram (DNA-32)

The `cosmic-star-map.svg` artifact must be byte-stable for identical inputs. It is generated from the system manifest + UI component registry using a seeded PRNG (mulberry32, seeded by `djb2(appId)`). No timestamps, random values, or non-deterministic state may enter the SVG output fields.

Rules:

- SVG node positions are determined solely by `appId` and the component registry state.
- `git diff` on the SVG is meaningful — a position change = a real architectural change.
- The artifact is stored at `dist/.well-known/cosmic-star-map.svg`.

| Enforcement | Command                                                                |
| ----------- | ---------------------------------------------------------------------- |
| ✅ Now      | `star-map.render` — generates byte-stable SVG from manifest + registry |

---

## Invariant 25 — Nebula Score — composite quality metric (DNA-33)

The Nebula Score (0–100) is a weighted composite of four pillars: Performance (30 %), Accessibility (30 %), Content Health (20 %), Architectural Compliance (20 %). Weights are frozen in `packages/nebula/src/weights.ts` and validated to sum exactly to 1.0 at module load time.

Rules:

- Weights must not be changed without a new RFC and a version bump to `NEBULA_WEIGHTS_VERSION`.
- All four pillar inputs must be available for a valid score; missing inputs produce a `0` for that pillar (not a skip).
- The score is stored in `dist/.well-known/nebula-score.json` and summarised in `cosmic-passport.json`.

| Enforcement | Command                                                        |
| ----------- | -------------------------------------------------------------- |
| ✅ Now      | `nebula.score.compute` — computes and writes Nebula Score JSON |

---

## Invariant 26 — Pulsar — build freshness heartbeat (DNA-34)

The Pulsar moon component (Despina) reads `passport.provenance.builtAt` and classifies the build as `fresh` (< 24 h), `recent` (< 7 days), or `stale` (≥ 7 days). For apps with `release.passport.heartbeatUrl` configured, `pulsar.heartbeat` POSTs a freshness ping to the configured endpoint after each successful release.

Rules:

- The Pulsar component is purely server-rendered (SSG) — no client JS is required for display.
- `heartbeatUrl` must use HTTPS and be rate-limited on the server side.
- `pulsar.heartbeat` is idempotent — repeated calls within the same build are no-ops.

| Enforcement | Command                                                               |
| ----------- | --------------------------------------------------------------------- |
| ✅ Now      | `pulsar.heartbeat` — POSTs freshness ping to configured heartbeat URL |

---

## Invariant 27 — Composite readiness gate (DNA-35)

An app is deployable only when `app.contract.full` exits zero. This command runs every validator from RFC-0023 through RFC-0028 in dependency order and aggregates results. It is the single canonical CI signal for app readiness.

Rules:

- No validator may be skipped, muted, or disabled in CI.
- `app.contract.full` automatically includes any new validator registered via `CONTRACT_FULL_VALIDATORS` — no per-RFC edits needed to the command itself.
- `app.contract.full` is **not** in `APPS_CHECK_PIPELINE` (avoiding recursion); it is the final gate, run separately after the standard pipeline.

| Enforcement | Command                                                           |
| ----------- | ----------------------------------------------------------------- |
| ✅ Now      | `app.contract.full` — composite readiness gate (DNA-35, RFC-0029) |

---

## Invariant 28 — Canonical new-app scaffold (DNA-36)

Every new app in `apps/*` must be created via `onboarding.scaffold --client <id> --domain <fqdn> --biome <id> --constellation <id>`. The scaffold output is the single canonical shape for new apps. Deviation between scaffold output and an existing app's structure is a defect.

Rules:

- Agents MUST NOT create new apps by copying an existing app's directory.
- Agents MUST NOT branch the scaffold per client — `system.yaml` handles per-client variation (composition), not the scaffold (structure).
- After scaffolding, run `onboarding.checklist --client <id>` to confirm each onboarding step, then `app.contract.full` as the readiness gate.
- `onboarding.scaffold` generates an Ed25519 keypair; the private key is printed to stdout once for engineer capture — it is never written to disk.

| Enforcement | Command                                                     |
| ----------- | ----------------------------------------------------------- |
| ✅ Now      | `onboarding.scaffold` — generate canonical new-app skeleton |
| ✅ Now      | `onboarding.checklist` — readiness report (never fails)     |

---

## Summary table

| # | Invariant | Enforcement |
| --- | --- | --- |
| 1 | File-based page ownership | 🔜 Later |
| 2 | Language-prefixed URLs | 📖 Doc only |
| 3 | Coordinated static generation | 📖 Doc only |
| 4 | Canonical meaning in `src/content/` | ✅ `thin-copy.validate` |
| 5 | Three-way component mirroring | 🔜 Later |
| 6 | Schema-validated page content | ✅ `content.validate` / 🔜 Later |
| 7 | Thin routes | ✅ `thin-copy.validate`, `mirror.quartet.validate` QP-01 / 🔜 Later |
| 8 | Reusable section building blocks | 📖 Doc only |
| 9 | Token-based, file-based styling | ✅ `tokens.ds.lint`, `tokens.colors.lint` |
| 10 | Centralized base CSS | 📖 Doc only |
| 11 | React at hydration boundaries only | 🔜 Later |
| 12 | Centralized feature visibility | 📖 Doc only |
| 13 | Disabled content disappears everywhere | 📖 Doc only |
| 14 | Content-driven, config-resolved navigation | 📖 Doc only |
| 15 | Lightweight ordered middleware | 📖 Doc only |
| 16 | Semantic outputs as projections | 🔜 Later |
| 17 | Cross-page facts in semantic helpers | 📖 Doc only |
| 18 | Scripts follow responsibility + placement | 📖 Doc only / 🔜 `scripts.placement.validate` |
| 19 | Typed event catalog | ✅ `growth.events.validate` |
| 20 | Content-declared funnels | ✅ `growth.funnel.validate` |
| 21 | Client-editable experiments | ✅ `growth.experiment.validate`, `growth.experiment.archive` |
| 22 | Vendor-agnostic GrowthAdapter | ✅ `growth.adapter.contract`, `growth.vendor.resolve` |
| 23 | Cosmic Passport — signed provenance | ✅ `passport.emit`, `passport.verify` |
| 24 | Star Map — deterministic architecture diagram | ✅ `star-map.render` |
| 25 | Nebula Score — composite quality metric | ✅ `nebula.score.compute` |
| 26 | Pulsar — build freshness heartbeat | ✅ `pulsar.heartbeat` |
| 27 | Composite readiness gate | ✅ `app.contract.full` |
| 28 | Canonical new-app scaffold | ✅ `onboarding.scaffold` |
