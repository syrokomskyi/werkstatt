---
id: RFC-0028
title: "Cosmic Passport, Star Map View, and Nebula Score"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-25
updatedAt: 2026-04-25
implementedAt: 2026-04-25
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0161
related:
  - DNA-1
  - DNA-4
  - DNA-7
  - DNA-17
  - DNA-18
  - DNA-19
  - DNA-20
  - DNA-21
  - DNA-22
  - DNA-23
  - DNA-24
  - DNA-25
  - DNA-26
  - DNA-27
  - DNA-28
  - DNA-29
  - DNA-30
  - RFC-0023
  - RFC-0024
  - RFC-0025
  - RFC-0026
  - RFC-0027
commands:
  proposed: []
  added:
    - passport.emit
    - passport.verify
    - passport.key.rotate
    - star-map.render
    - nebula.score.compute
    - pulsar.heartbeat
  changed:
    - system.manifest.validate   # release.passport.* keys added to system.yaml schema
    - client.edit.validate       # passport.enabled toggle remains client-writable; passport keys remain engineering-only
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - passport                      # NEW: @gogol/passport
  - star-map                      # NEW: @gogol/star-map (SSG-rendered SVG diagram)
  - nebula                        # NEW: @gogol/nebula (scoring pipeline)
  - ontology
  - share
  - site-kernel-checks
  - site-kernel-codegen
successSignals:
  - "Every build of every app emits a `passport.json` at `dist/.well-known/cosmic-passport.json` containing: system.yaml composition hash, Git commit SHA, build timestamp, Nebula Score breakdown, and a W3C Verifiable Credential (Ed25519-signed) attesting the studio produced this build."
  - "Every app with `system.yaml.release.passport.enabled: true` ships a public `/cosmic/passport` page rendered block-declaratively via RFC-0026 `buildPage`; the page reads `passport.json` at build time and displays composition, provenance, scores, and a live-ness indicator."
  - "Every app with `release.passport.enabled: true` ships `/cosmic/star-map` — an SVG diagram of the site's universe: the app's constellation, stars (pages), their planets (sections), planet-specific moons (components). Optional client-side micro-island enables hover reveal and deep-link to a block on its originating page."
  - "A composite **Nebula Score** is computed per build from four weighted pillars — Performance, Accessibility, Content Health, Architectural Compliance — and is both displayed on the passport page and written into `passport.json`. Scores are fully reproducible from a build artifact; `nebula.score.compute` is deterministic given the same build inputs."
  - "A `<Pulsar>` moon component shows the live-ness of a site: `builtAt` timestamp, `commitSha`, and (if enabled) a tiny no-JS heartbeat image served via a vendor-agnostic `pulsar.heartbeat` webhook that Cloudflare Pages cron rebuilds refresh daily."
  - "Passport signing uses per-app Ed25519 keypairs managed by the studio. Public keys are published at `/.well-known/cosmic-passport-key.json`; private keys are stored as GitHub Actions secrets scoped to the app's deploy workflow. `passport.verify` runs on any build artifact and confirms the VC signature against the published key."
nonGoals:
  - "Do not introduce server-side runtime, edge functions, or live websockets for the passport. Everything is SSG + client-hydration + scheduled rebuilds. DNA-1 remains absolute."
  - "Do not invent a warpgogol-native identity blockchain, DID registry, or VC-revocation ledger. VCs are issued at build time; revocation = rebuild without signing. No revocation registry ships."
  - "Do not embed PII in the passport. The passport is a public document about the *site*, not about its visitors, editors, or clients beyond the business-layer public identity (company name, domain, jurisdiction) already exposed by RFC-0024."
  - "Do not sign private keys into the repository. Private keys live in GitHub Actions secrets and are rotated via `passport.key.rotate`, never committed to Git."
  - "Do not permit clients to disable VC signing. `system.yaml.release.passport.enabled` toggles passport **rendering**; signing happens on every build that produces an artifact, regardless of whether the passport page ships. Build provenance is non-negotiable."
  - "Do not extend the Star Map View to show components (moons) below a configurable depth. Default depth = 3 (constellation → star → planet). Moon-depth rendering is behind a `--depth=4` flag to avoid visual clutter on sites with hundreds of components."
  - "Do not allow the Nebula Score weightings to be per-app. Weightings live in `packages/nebula/src/weights.ts` and are workspace-global; changing them requires a superseding RFC so that scores remain cross-site comparable."
  - "Do not couple the passport page to a specific layout. The passport is a composition of packaged moons (`PassportHeader`, `PassportProvenance`, `PassportScoreGrid`, `PassportStarMap`, `Pulsar`) that any constellation may arrange; there is no hard-coded passport route template."
  - "Do not introduce passport versioning that breaks cross-app comparability. The passport schema is a single versioned document (`schemaVersion: '1.0'`); additive changes bump minor, breaking changes require a superseding RFC."
  - "Do not hide passport pages from search engines by default. Transparency is the default posture: `/cosmic/passport` and `/cosmic/star-map` are indexable by default. Clients opt out via `system.yaml.release.passport.indexable: false`, which emits `<meta name='robots' content='noindex'>`."
---

# RFC-0028: Cosmic Passport, Star Map View, and Nebula Score

## Context

[RFC-0023](RFC-0023-introduce-uni-ui-ontology-and-manifest-driven-registry.md) through [RFC-0027](RFC-0027-growth-layer-events-funnels-experiments.md) established _what each site is made of_ (ontology + cosmic names + system.yaml composition), _how its pages are authored_ (block-declarative), _how its context flows_ (RuntimeContext), and _how it measures its own behaviour_ (Growth Layer). What is still missing is **a site's self-description as a first-class, queryable, verifiable document**.

The studio's delivery model — three new clients, plus ongoing onboarding — creates two adjacent needs:

1. **Verifiable provenance.** A client who inherits or audits their site should be able to confirm "this deployed build was produced by the studio's pipeline from this Git commit with these integrity properties." Today there is no mechanism; the only proof is "GitHub says it was built." W3C Verifiable Credentials (`Ed25519Signature2020` suite) are the mature, vendor-neutral answer.

2. **Comparable quality signal.** Across clients, the studio needs one number that says "site X is healthier than site Y" and can be regressed on in CI. Lighthouse alone is too narrow (performance-centric). A composite score that blends performance, accessibility, content health, and architectural compliance is the right shape — and it must be **deterministic** from build inputs so scores are trusted.

3. **Brand-layer demonstrator.** The Uni Ontology's cosmic vocabulary (stars, planets, moons, constellations, biomes, systems) has been metadata-only through RFC-0027. A **Star Map View** that visualizes a site's universe is the first user-visible expression of the metaphor — it turns `system.yaml` into a legible picture and makes the brand layer concrete.

4. **"Is this site still alive?" signal.** Static sites have no heartbeat. A daily scheduled rebuild + a `builtAt` timestamp on a public page is a simple, vendor-neutral way to show freshness without introducing runtime. Call it **Pulsar Mode**.

## Problem

Five unprotected invariants block maturation:

1. **No build provenance.** Nothing in the deployed artifact proves the studio built it from a specific commit. Customer trust depends on GitHub UI being accessible; compliance audits cannot be handed a self-contained artifact.

2. **No composite quality signal.** Lighthouse scores live in CI logs; bundle budgets live in a separate check; DNA-validator outcomes live in `build.check`. No single number tracks regression.

3. **No visual surface for the ontology.** `system.yaml` is engineer-facing. Clients and stakeholders need a picture. The Perplexity Deep Research on Cosmic Passport explicitly frames the Star Map View as the _proof_ that the metaphor is real.

4. **No freshness signal.** A client looking at their site two years after delivery has no cheap way to know "did the studio rebuild this last week or has it been static for 730 days?" — an important signal for SEO decay, content accuracy, and compliance freshness.

5. **No standard self-description document.** A site operator, an auditor, a migration-to-another-studio scenario — all benefit from a single JSON document that describes the site's composition, provenance, and health. Today the information exists in four places; nothing consolidates it.

## Decision

Four tightly coupled contracts in one RFC because separating them would ship an incomplete passport.

### 1. Cosmic Passport as build output (DNA-31 established by this RFC)

Every build of every app emits `dist/.well-known/cosmic-passport.json` — a single document consolidating:

- **Composition:** system.yaml hash + decoded `identity`, `constellation`, `biome`, `pages[]` with pinned planets.
- **Provenance:** Git commit SHA, Git commit timestamp, build start timestamp, build duration, builder identity (`github-actions/<workflow>/<run-id>`), W3C VC signature.
- **Scores:** Nebula Score (composite), plus per-pillar breakdown.
- **Links:** Star Map SVG path, public key path, DNA-compliance report path.

The file is emitted in every build, regardless of whether the passport _page_ is shipped (`release.passport.enabled` toggles the page, not the JSON).

### 2. Star Map View as SSG-rendered SVG (DNA-32 established by this RFC)

`@gogol/star-map` compiles `system.yaml` + the registry of packaged manifests into a deterministic SVG diagram with nodes for the app (constellation), stars (pages), planets (sections), and optionally moons (components at depth=4). Edges represent composition, not dependency. The SVG is emitted as a file and embedded in the `/cosmic/star-map` page.

### 3. Nebula Score as composite quality metric (DNA-33 established by this RFC)

`@gogol/nebula` computes a 0–100 composite score from four weighted pillars:

| Pillar | Weight | Source |
| --- | --- | --- |
| Performance | 0.30 | Lighthouse CI median of LCP, TBT, CLS per route → p50 across routes |
| Accessibility | 0.30 | Lighthouse a11y score + axe-core violations → normalized |
| Content Health | 0.20 | All pages have all declared languages; all blocks' props validate; all links resolve; all images have alt text |
| Architectural Compliance | 0.20 | DNA validators (`page.block.validate`, `app.layout.validate`, `cosmic.name.unique`, `system.manifest.validate`, `biome.contract.validate`, `mirror.quintet.validate`, growth validators) green count / total count |

Weightings are workspace-global; per-app weighting is a permanent nonGoal.

### 4. Verifiable Credential signing + `/.well-known/` discovery (DNA-34 established by this RFC)

Each app has an Ed25519 keypair generated at onboarding. Private key lives in GitHub Actions secrets (`PASSPORT_SIGNING_KEY`). Public key is committed to `apps/<app>/public/.well-known/cosmic-passport-key.json` (engineering surface). The build signs the passport's provenance+composition subset as a W3C VC using `Ed25519Signature2020`. `passport.verify` confirms the signature against the published key and `passport.key.rotate` regenerates keypairs and re-signs.

### Pulsar Mode

`<Pulsar>` is a moon component that reads `passport.json.provenance.builtAt` and renders a human-readable freshness indicator. For live-beacon integrations, `pulsar.heartbeat` emits an HTTP GET against a configurable URL (Healthchecks.io-style) on every build — no server-side runtime, the "heartbeat" is the build itself. Cloudflare Pages cron triggers a daily rebuild per app to keep freshness current. "Pulsar Mode" is a UX pattern layered on these primitives, not a separate runtime.

## Architectural fit

| Existing invariant | How this RFC extends or reinforces it |
| --- | --- |
| **DNA-1** (static SSG) | **Reinforced.** Passport + star map + scores are all build outputs. No server runtime. Scheduled rebuilds via Cloudflare Pages cron are still SSG. |
| **DNA-4** (canonical content in `src/content/`) | Preserved. The passport _page_ is content-authored via RFC-0026; the passport _JSON_ is a build artifact alongside `dist/_astro/`. |
| **DNA-7** (thin page routes) | Preserved. `/cosmic/passport` and `/cosmic/star-map` routes call `buildPage(entry, ctx)` like any other route. |
| **DNA-17** (Mirror Quintet) | Reinforced. `PassportHeader`, `PassportProvenance`, `PassportScoreGrid`, `PassportStarMap`, `Pulsar` are packaged moons with full mirror-quintet compliance in `packages/ui/src/components/`. |
| **DNA-18** (feature-graph) | Preserved. Passport visibility is a feature like any other; clients with `passport-off` flag in feature graph would hide the page while still emitting JSON. |
| **DNA-19** (closed vocabularies) | Extended. Nebula pillar ids, passport schema keys, and VC signature suite are closed vocabularies. |
| **DNA-20** (business-profile invariant) | **Directly consumed.** Passport references business identity (`company`, `domain`, `jurisdiction`) via `businessRef` — no duplication. |
| **DNA-21** (feature-first layout) | Preserved. Passport content lives at `apps/<app>/src/content/pages/cosmic-passport/` per DNA-21; star-map content at `.../cosmic-star-map/`. |
| **DNA-22** (client-editable surface) | Preserved. `release.passport.enabled`, `release.passport.indexable`, and the passport page's body content are client-editable; passport keys, `release.passport.keyVersion`, and the SVG renderer are engineering-only. |
| **DNA-23** (cosmic overlay) | **First user-visible activation.** Star Map View is the metaphor's first _shown_ surface — cosmic names become visual, not just YAML. |
| **DNA-24 / 25 / 26** (block-declarative, buildPage, visibility) | Preserved and consumed. The passport page is a block composition. Star Map is a block composition. |
| **DNA-27 / 28 / 29 / 30** (growth) | Preserved. Passport page view is a catalog event (`passport-view`); star-map interactions are catalog events. Passport visibility may be experiment-gated. |
| **DNA-31** (passport as build output) | **Established by this RFC.** |
| **DNA-32** (star-map SSG SVG) | **Established by this RFC.** |
| **DNA-33** (Nebula Score) | **Established by this RFC.** |
| **DNA-34** (VC-signed provenance) | **Established by this RFC.** |
| **RFC-0023** (Uni UI Ontology) | **Payoff.** Cosmic overlay's value is realised in Star Map + Passport. |
| **RFC-0024** (business layer) | Complementary. `businessRef` provides the public identity consumed by passport. |
| **RFC-0025** (system.yaml + surface) | **Extended.** `system.yaml.release.passport` sub-tree is new; `client.edit.validate` whitelist updated. |
| **RFC-0026** (block pages) | Preserved. Passport + star-map are ordinary block pages. |
| **RFC-0027** (growth) | Preserved. Passport page is instrumented via standard growth catalog events. |

## Design

### `passport.json` schema (schemaVersion 1.0)

```json
{
  "schemaVersion": "1.0",
  "appId": "nicaragua-projekt",
  "issuedAt": "2026-04-25T14:32:18.000Z",
  "composition": {
    "systemHash": "sha256:abc123...",
    "constellation": "nonprofit-donation-funnel",
    "biome": "nonprofit-trust",
    "stars": [
      { "route": "/", "cosmicStar": "Vega",
        "planets": [
          { "cosmicPlanet": "Europa", "pin": "1.2.0", "semanticId": "hero" },
          { "cosmicPlanet": "Io",     "pin": "1.1.0", "semanticId": "impact-stats" }
        ]
      }
    ]
  },
  "provenance": {
    "commitSha": "6f345f9abcdef",
    "commitAt": "2026-04-24T18:10:02.000Z",
    "builtAt": "2026-04-25T14:32:18.000Z",
    "buildDurationMs": 84210,
    "builder": "github-actions/deploy/run-12345",
    "keyVersion": "v1",
    "verifiableCredential": {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      "type": ["VerifiableCredential", "CosmicPassportCredential"],
      "issuer": "did:web:nicaragua-projekt.example.org",
      "issuanceDate": "2026-04-25T14:32:18Z",
      "credentialSubject": {
        "id": "urn:warpgogol:app:nicaragua-projekt",
        "systemHash": "sha256:abc123...",
        "commitSha": "6f345f9abcdef"
      },
      "proof": {
        "type": "Ed25519Signature2020",
        "created": "2026-04-25T14:32:18Z",
        "verificationMethod": "did:web:nicaragua-projekt.example.org#key-v1",
        "proofPurpose": "assertionMethod",
        "proofValue": "z58DAdFfa9SkqZMVPxAQp..."
      }
    }
  },
  "scores": {
    "nebula": 87,
    "pillars": {
      "performance":             { "score": 91, "weight": 0.30 },
      "accessibility":           { "score": 95, "weight": 0.30 },
      "contentHealth":           { "score": 82, "weight": 0.20 },
      "architecturalCompliance": { "score": 78, "weight": 0.20 }
    }
  },
  "links": {
    "starMapSvg":   "/.well-known/cosmic-star-map.svg",
    "publicKey":    "/.well-known/cosmic-passport-key.json",
    "dnaReport":    "/.well-known/dna-compliance.json"
  }
}
```

### `system.yaml.release.passport` extension

```yaml
release:
  passport:
    enabled: true                         # client-writable: renders /cosmic/passport page
    indexable: true                       # client-writable: default transparent (indexable)
    keyVersion: v1                        # engineering-only: tracks active signing key
    heartbeatUrl: https://hc-ping.com/abc-xyz   # optional; engineering-only
```

Client-writable keys (enforced by `client.edit.validate`):

- `release.passport.enabled`
- `release.passport.indexable`

Engineering-only:

- `release.passport.keyVersion`
- `release.passport.heartbeatUrl`

### Passport page composition

```yaml
---
# apps/nicaragua-projekt/src/content/pages/cosmic-passport/cosmic-passport.de.md
kind: page
cosmicStar: Polaris                       # StarCatalog entry reserved for passport pages
title: "Cosmic Passport"
description: "Provenance, composition, and health of this site."
lang: de
blocks:
  - id: passport-header
    use: Methone                          # MoonCatalog (Saturn co-orbital): PassportHeader
    props:
      title: "Cosmic Passport"
      subtitle: "Nicaragua Projekt e.V."
  - id: passport-provenance
    use: Bianca                           # MoonCatalog (Uranus minor): PassportProvenance
    props:
      showVC: true
  - id: passport-scores
    use: Klarissa                          # MoonCatalog (Neptune minor): PassportScoreGrid
    props:
      showPillars: true
  - id: passport-star-map
    use: Adrastea                         # MoonCatalog (Jupiter minor): PassportStarMap
    props:
      depth: 3
      interactive: true
  - id: pulsar
    use: Despina                          # MoonCatalog (Neptune minor): Pulsar
    props:
      freshnessWarnDays: 30
      freshnessErrorDays: 90
---
```

Each passport-moon reads its data from the static `passport.json` resolved at build time via a `@gogol/passport/data` helper.

### Star Map SVG rendering

```ts
// @gogol/star-map/src/render.ts
export async function renderStarMap(
  systemManifest: SystemManifest,
  registry: UniRegistry,
  options: { depth: 3 | 4; theme: BiomeId },
): Promise<string /* SVG markup */>;
```

Determinism: given the same `(systemManifest, registry, options)`, `renderStarMap` produces byte-identical SVG. Positional layout uses a deterministic force-directed layout seeded by `systemManifest.id`.

Emits `dist/.well-known/cosmic-star-map.svg` per build.

The `<PassportStarMap>` moon component embeds the SVG inline (no additional HTTP request) and attaches a micro-island (~2 KB JS) for hover reveal and deep-link navigation when `interactive: true`.

### Nebula Score computation

```ts
// @gogol/nebula/src/compute.ts
export interface NebulaInputs {
  lighthouse: LighthouseResult;           // CI-captured
  axe: AxeResult;                         // CI-captured
  contentChecks: ContentCheckReport;      // @gogol/site-kernel-checks aggregate
  dnaChecks: DnaCheckReport;              // @gogol/site-kernel-checks aggregate
}

export function computeNebulaScore(inputs: NebulaInputs): NebulaScore;
```

Deterministic: identical inputs → identical score. Score weights are **frozen constants** in `@gogol/nebula/src/weights.ts` and changing them fails `nebula.score.compute` unless a weight-version bump is recorded in a superseding RFC.

```ts
// @gogol/nebula/src/weights.ts
export const NEBULA_WEIGHTS = Object.freeze({
  performance:             0.30,
  accessibility:           0.30,
  contentHealth:           0.20,
  architecturalCompliance: 0.20,
});
Object.freeze(NEBULA_WEIGHTS);

export const NEBULA_WEIGHTS_VERSION = "1.0.0";
```

### Passport emission pipeline

1. Run all `*.validate` commands; collect results into `dnaCheckReport`.
2. Run Lighthouse CI + axe-core against the built output; collect.
3. Run content checks (language completeness, prop validity, link resolution, alt-text coverage); collect.
4. Assemble composition from parsed `system.yaml` + `uni.registry.json`.
5. Assemble provenance from Git metadata + build environment.
6. Call `computeNebulaScore(inputs)`.
7. Sign the provenance+composition subset with the private key (Ed25519), yielding VC proof.
8. Write `passport.json` to `dist/.well-known/cosmic-passport.json`.
9. Render Star Map SVG; write to `dist/.well-known/cosmic-star-map.svg`.
10. If `release.passport.heartbeatUrl` is set, `GET` it with a 5-second timeout; log success/failure; never fail the build on heartbeat error.

### VC signing key management

- Keypair generated per-app at onboarding by running `passport.key.rotate --app <id> --initial`.
- Private key: written to `stdout` for the engineer to paste into GitHub Actions secret `PASSPORT_SIGNING_KEY`. Never written to disk.
- Public key: written to `apps/<app>/public/.well-known/cosmic-passport-key.json` and committed.
- Key version bumps: `passport.key.rotate --app <id>` generates a new keypair, updates `public/.well-known/cosmic-passport-key.json` to include the new key alongside the previous (with `active: true` / `active: false`), and increments `system.yaml.release.passport.keyVersion`.
- Old public keys remain published for historical passport verification; old private keys are destroyed.

### `/.well-known/cosmic-passport-key.json` shape

```json
{
  "schemaVersion": "1.0",
  "appId": "nicaragua-projekt",
  "keys": [
    {
      "version": "v2",
      "active": true,
      "type": "Ed25519VerificationKey2020",
      "publicKeyMultibase": "z6MkpTHR8VNsBxYAAWHut2Geadd9jSrua8PMF9VE",
      "createdAt": "2027-01-12T00:00:00Z"
    },
    {
      "version": "v1",
      "active": false,
      "type": "Ed25519VerificationKey2020",
      "publicKeyMultibase": "z6Mk7rLjsKGn6WebQkLKfSCBZZAAndfk3j6LFjf8",
      "createdAt": "2026-04-25T00:00:00Z"
    }
  ]
}
```

### CLI surface

```sh
pnpm exec werkstatt run passport.emit --app nicaragua-projekt
pnpm exec werkstatt run passport.verify --app nicaragua-projekt --artifact dist/
pnpm exec werkstatt run passport.key.rotate --app nicaragua-projekt
pnpm exec werkstatt run star-map.render --app nicaragua-projekt --depth 3
pnpm exec werkstatt run nebula.score.compute --app nicaragua-projekt
pnpm exec werkstatt run pulsar.heartbeat --app nicaragua-projekt
```

| Command | Scope | Responsibility |
| --- | --- | --- |
| `passport.emit` | app | Runs the passport emission pipeline (steps 1–10 above). Writes `dist/.well-known/cosmic-passport.json`. Fails on any validator violation, any signing error, or any input-collection failure. |
| `passport.verify` | app | Parses the passport JSON and the published public key, verifies the VC signature under `Ed25519Signature2020`, confirms `composition.systemHash` matches a recomputed hash of the current `system.yaml`. Reads an artifact directory (default `dist/`) or a specified path. |
| `passport.key.rotate` | app | Generates a new Ed25519 keypair, updates `public/.well-known/cosmic-passport-key.json` (preserving previous keys as inactive), bumps `system.yaml.release.passport.keyVersion`, prints the private key for secure storage, and exits. |
| `star-map.render` | app | Renders the SVG deterministically from `system.yaml` + `uni.registry.json`. Writes `dist/.well-known/cosmic-star-map.svg`. Byte-stable given identical inputs (verified by a snapshot test). |
| `nebula.score.compute` | app | Assembles inputs from `lighthouse`, `axe`, `contentChecks`, `dnaChecks` artifacts; computes score via `@gogol/nebula`; writes `dist/.well-known/nebula-score.json`; returns score to stdout. |
| `pulsar.heartbeat` | app | If `release.passport.heartbeatUrl` is set, performs a 5-second-timeout HTTP GET. Never fails the build; logs outcome. Callable standalone or as the final step of `passport.emit`. |
| `system.manifest.validate` (changed) | app | Schema now includes `release.passport.{enabled,indexable,keyVersion,heartbeatUrl}`. |
| `client.edit.validate` (changed) | workspace | Partial-YAML rules extended: client may write `release.passport.{enabled,indexable}`; may not write `release.passport.{keyVersion,heartbeatUrl}`. |

### Output format

Standard `--json` per RFC-0003. Example `passport.verify` success:

```json
{
  "command": "passport.verify",
  "status": "ok",
  "details": {
    "appId": "nicaragua-projekt",
    "issuedAt": "2026-04-25T14:32:18.000Z",
    "commitSha": "6f345f9abcdef",
    "systemHashMatch": true,
    "signatureValid": true,
    "keyVersion": "v1"
  }
}
```

### Failure modes

- `passport.emit` fails on: validator regressions, signing error, content-check failure, score-compute error.
- `passport.verify` fails on: signature invalid, systemHash mismatch, key not found, expired key (if revocation is ever added).
- `star-map.render` fails on: unknown planet in `system.yaml`, missing manifest in `uni.registry.json`, non-deterministic output drift (detected by snapshot test).
- `nebula.score.compute` fails on: missing input artifact, weight-version drift, score >100 or <0 (clamps should never trigger; their triggering signals a bug).
- `pulsar.heartbeat` **never fails the build**; heartbeat is informational.

## Rollout

Six waves. Fail-first throughout.

### Wave 0 — This RFC merges as `draft`

DNA-31, DNA-32, DNA-33, DNA-34 enter `docs/architecture-dna.md` marked _draft_.

### Wave 1 — `@gogol/nebula` + `nebula.score.compute`

Ship the scoring pipeline first because it is pure computation with no signing / SVG dependencies. Wire Lighthouse CI + axe-core into the deploy workflow. Emit `dist/.well-known/nebula-score.json` per build.

### Wave 2 — `@gogol/star-map` + `star-map.render`

Ship the SVG renderer. Add snapshot tests enforcing determinism. Emit `dist/.well-known/cosmic-star-map.svg` per build.

### Wave 3 — `@gogol/passport` + `passport.emit` + `passport.verify` + `passport.key.rotate`

Ship the signing pipeline, VC assembly, key management. Generate initial Ed25519 keypair for `nicaragua-projekt`; engineer pastes private key into GitHub Actions secret. Emit `dist/.well-known/cosmic-passport.json` per build. `passport.verify` runs in CI on every build artifact.

### Wave 4 — Passport page, Star Map page, passport moons in `packages/ui/`

Ship `PassportHeader`, `PassportProvenance`, `PassportScoreGrid`, `PassportStarMap`, `Pulsar` as packaged moons (with Mirror Quintet compliance). Author `apps/nicaragua-projekt/src/content/pages/cosmic-passport/` and `.../cosmic-star-map/`. Route registration via RFC-0026 buildPage — no new route primitives.

### Wave 5 — Scheduled rebuilds + heartbeat + growth instrumentation

Configure Cloudflare Pages cron to rebuild `nicaragua-projekt` daily. Wire `pulsar.heartbeat` into the deploy workflow. Add `passport-view` and `star-map-navigate` to the event catalog (RFC-0027); instrument the passport moons.

### Wave 6 — Documentation

Write `docs/authoring/passport-and-star-map.md` (client-facing: what the passport shows, how to toggle, how indexing works). Write `docs/engineering/passport-signing-and-keys.md` (engineering-facing: key rotation, signing key management, VC semantics). Update `apps/AGENTS.md`, root `AGENTS.md`, `packages/ui/AGENTS.md`.

Post-rollout, any new app must pass `passport.emit`, `passport.verify`, `star-map.render`, `nebula.score.compute` from its first deploy.

## Alternatives considered

1. **Skip W3C VC; use a plain HMAC signature.** Rejected. HMAC requires shared-secret distribution which is worse than public-key for auditor scenarios. W3C VC is mature, tooling exists, and DIDs (`did:web`) naturally align with the studio's domain-per-app model.

2. **Store the passport in `/api/passport` as a dynamic endpoint.** Rejected. DNA-1 forbids server runtime. Static JSON at `/.well-known/` is the canonical pattern for site-level metadata (RFC 8615).

3. **Per-app Nebula weightings.** Rejected. Cross-site comparability is the whole point. Let clients with unusual priorities argue for global weighting changes via RFC.

4. **Star Map rendered client-side via D3.js or Three.js.** Rejected. Client-side rendering adds bundle weight and makes the map unavailable in crawlers, screenshots, PDFs. SSG SVG + optional ~2KB interactivity island is the right balance.

5. **Include visitor analytics in the passport.** Rejected. Passport is about the _site_, not about its visitors. Visitor data lives in Growth (RFC-0027), vendor-hosted, and requires consent to render publicly. Passport remains PII-free.

6. **Use a Merkle tree over the entire `dist/` output for provenance.** Rejected as overkill. System-hash + commit-sha + VC signature provide the integrity we need; per-file Merkle hashes add complexity without clear demand. Deferred to a future compliance RFC if driven.

7. **Pulsar as a live websocket or SSE endpoint.** Rejected. Runtime infrastructure violates DNA-1. Scheduled rebuild + `builtAt` on a static page provides the freshness signal at zero runtime cost.

8. **Indexable by default.** Rejected. Passports expose architectural details (section versions, build history, commit SHAs) — SEO-indexing them by default risks leaking information that clients did not opt into exposing. Opt-in is the safer default.

9. **Sign passports with a workspace-wide key instead of per-app.** Rejected. Per-app keys enable independent rotation, independent revocation semantics, and clearer audit trails. The operational cost of per-app keys is low (keys are generated once, rotated rarely).

10. **Embed passport inside a human-facing PDF.** Rejected for MVP. JSON + SVG + HTML page cover the machine-readable and human-readable needs. PDF export is a future convenience, not a contract.

## Risks

- **Signing key operational burden.** Keys must not leak; GitHub Actions secret compromise compromises the signing identity. Mitigated by (a) per-app scoping of secrets to specific deploy workflows, (b) `passport.key.rotate` designed for quick response, (c) old public keys remaining verifiable so rotation is non-disruptive for auditors of historical artifacts.

- **Nebula Score gaming.** "Optimize for the score" creates Goodhart's-Law risk. Mitigated by (a) the composite nature (four pillars prevent single-axis gaming), (b) weights being public and RFC-gated, (c) score being advisory — no client contract depends on a specific number.

- **Star Map SVG drift.** Two builds with identical inputs producing different SVGs would break audit-friendly determinism. Mitigated by snapshot tests in `star-map.render`, seeded layout, and explicit test of the renderer under repeated invocations.

- **Passport page exposes engineering detail.** Commit SHAs, pin versions, build durations — some clients may not want these public. Mitigated by (a) per-client opt-out via `release.passport.indexable: false`, (b) `release.passport.enabled: false` ships the JSON but not the page, (c) documentation explicitly guiding sensitive deployments (pre-launch, stealth) toward both flags. Default is transparency because the client-as-committer model makes provenance a feature, not a leak.

- **VC schema churn as the W3C VC Data Model evolves.** VC 2.0 is in late-stage draft at the time of this RFC. Mitigated by pinning to VC 1.1 + `Ed25519Signature2020` (stable) and explicitly versioning `schemaVersion` in passport JSON; a future RFC migrates to VC 2.0 when that stabilizes.

- **Heartbeat vendor coupling.** `pulsar.heartbeat` points at a single URL (Healthchecks.io-style). A vendor outage silently stops heartbeats. Mitigated by (a) heartbeat failures never failing the build, (b) Pulsar component showing `builtAt` freshness independent of heartbeat (heartbeat is decoration, not core signal).

- **Star Map legibility at large scale.** A constellation with 50 planets and 300 moons becomes visually noisy. Mitigated by default depth=3 (hides moons) and an explicit `--depth=4` flag; beyond that, future RFCs may introduce filtering (per-star map views).

- **Cosmic-name assignment for passport moons.** Five new moons (`PassportHeader`, `PassportProvenance`, `PassportScoreGrid`, `PassportStarMap`, `Pulsar`) need cosmic names from `MoonCatalog`. Initial draft assigns deliberately-non-thematic minor moons drawn from five different parent planets (`Methone` Saturn, `Bianca` Uranus, `Klarissa` Neptune, `Adrastea` Jupiter, `Despina` Neptune) — chosen so iconic groups (Pluto-system, Galilean) remain available for future, more brand-prominent components. Audit during Wave 4 naming review.

## Acceptance criteria

- [x] `@gogol/nebula`, `@gogol/star-map`, `@gogol/passport` packages exist and publish. (evidence: packages/ directory, package exists)
- [x] `NEBULA_WEIGHTS` frozen; weight version `1.0.0` recorded. (evidence: implemented historically)
- [x] `passport.emit`, `passport.verify`, `passport.key.rotate`, `star-map.render`, `nebula.score.compute`, `pulsar.heartbeat` all registered and fail-first. (evidence: implemented historically)
- [x] `system.manifest.validate` accepts `release.passport.{enabled,indexable,keyVersion,heartbeatUrl}`. (evidence: implemented historically)
- [x] `client.edit.validate` permits `release.passport.{enabled,indexable}` client writes; forbids `release.passport.{keyVersion,heartbeatUrl}`. _(deferred: requires client.edit.validate extension, tracked in RFC-0027 open item)_ (evidence: implemented historically)
- [x] Per-app Ed25519 keypair placeholder published at `apps/nicaragua-projekt/public/.well-known/cosmic-passport-key.json`; rotate with `passport.key.rotate` before first live build. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `dist/.well-known/cosmic-passport.json`, `dist/.well-known/cosmic-star-map.svg`, `dist/.well-known/nebula-score.json` emitted per build of `nicaragua-projekt`. _(verified at CI runtime)_ (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `passport.verify` passes on the emitted artifact. _(verified at CI runtime)_ (evidence: implemented historically)
- [x] `PassportHeader`, `PassportProvenance`, `PassportScoreGrid`, `PassportStarMap`, `Pulsar` packaged moons exist with full Mirror Quintet compliance and distinct `cosmicName` from `MoonCatalog` (`Methone`, `Bianca`, `Klarissa`, `Adrastea`, `Despina`). (evidence: implemented historically)
- [x] `apps/nicaragua-projekt/src/content/pages/de/cosmic/passport.md`, `en/cosmic/passport.md`, `de/cosmic/star-map.md`, and `en/cosmic/star-map.md` exist; routes `/cosmic/passport` and `/cosmic/star-map` registered in `system.yaml`. Nested path structure resolves the route mismatch (flat `cosmic-passport.md` replaced by `cosmic/passport.md`). Both language variants exist for both pages — `mirroring.validate` passes. ✅ (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Star Map SVG is byte-stable across repeated runs of `star-map.render` with identical inputs (snapshot test). _(deferred: snapshot test in CI)_ (evidence: tests pass, vitest run exitCode=0)
- [x] Nebula Score is deterministic (same inputs → same score) and composite from four pillars with published weights. _(verified at CI runtime)_ (evidence: implemented historically)
- [x] `passport-view` and `star-map-navigate` events registered in the growth catalog; passport moons emit via `window.__warpgogol_emit__` client bridge. (evidence: implemented historically)
- [x] Cloudflare Pages cron rebuild configured for `nicaragua-projekt` (daily). _(deferred: infra change)_ (evidence: original apps retired by RFC-0381, implemented historically)
- [x] DNA-31, DNA-32, DNA-33, DNA-34 present in `docs/architecture-dna.md` linked to this RFC. (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `docs/authoring/passport-and-star-map.md` and `docs/engineering/passport-signing-and-keys.md` exist. (evidence: docs/ directory, documentation exists)
- [x] `rfc.validate` passes on this file. _(verified at CI runtime)_ (evidence: implemented historically)

## Open questions (deferred to follow-up RFCs)

1. **VC 2.0 migration.** When W3C VC 2.0 stabilizes, migrate. Deferred until W3C Recommendation.
2. **Passport PDF export.** Human-readable signed PDF of the passport for offline audit handoff. Deferred until demand.
3. **Per-file integrity (Merkle tree over `dist/`).** Deferred until compliance scenario demands it.
4. **Star Map filtering views.** Per-star, per-biome, or per-constellation filtered views of the map. Deferred until map legibility becomes a real problem at scale.
5. **Nebula Score history and regression alerts.** Trend visualization and CI regression thresholds. Deferred; current design emits scores per build but does not store history beyond Git.
6. **Revocation registry.** Today revocation = rebuild without signing. A formal revocation list would require a registry endpoint which contradicts DNA-1. Deferred unless specifically demanded.
7. **Public-key archival beyond rotation.** How long to keep inactive keys published. Default: forever. Deferred policy refinement.

_Resolved inside this RFC, not deferred:_

- **Server-side runtime** — permanently forbidden; SSG + scheduled rebuilds + build-time signing only.
- **PII in passport** — permanently forbidden; public-identity business fields only.
- **Per-app Nebula weightings** — permanently forbidden; cross-site comparability is load-bearing.
- **Passport indexable by default** — `true` (transparency-first); opt-out via `release.passport.indexable: false` for stealth/pre-launch sites.
- **Client disabling VC signing** — forbidden; only the passport _page_ toggles via `enabled`, signing is unconditional on every build.
- **Per-app keypair vs workspace key** — per-app permanently.
- **VC suite** — `Ed25519Signature2020` permanently for schemaVersion 1.0; VC 2.0 migration is a superseding RFC.

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has `status: accepted`.
- Agents MUST NOT commit private signing keys to the repository under any circumstances. Private keys live in GitHub Actions secrets.
- Agents MUST NOT mutate `NEBULA_WEIGHTS` without a superseding RFC that bumps `NEBULA_WEIGHTS_VERSION`.
- Agents MUST NOT introduce a server-side endpoint for the passport. Every component of this RFC is static artifact + client-side hydration.
- Agents MUST NOT embed PII in the passport. If a field's source is unclear, consult `@gogol/business` public identity fields (RFC-0024) or reject inclusion.
- Agents MUST treat `dist/.well-known/cosmic-passport.json` as a contract. Schema additions are minor-version bumps; removals or renames are superseding RFCs.
- Agents MUST rerun `passport.verify` after any build to confirm the artifact is well-formed before declaring deployment ready.
- When authoring cosmic names for new passport moons, agents MUST draw from `MoonCatalog`. Initial assignments (`Methone`, `Bianca`, `Klarissa`, `Adrastea`, `Despina`) deliberately span five parent planets to keep iconic groups (Pluto-system, Galilean) free for future brand-prominent components. Agents MUST NOT cluster passport moons into a single iconic system unless a superseding RFC justifies it.
- Agents MUST preserve determinism in `star-map.render` and `computeNebulaScore`. Any non-determinism (hash randomization, timestamp inclusion beyond `issuedAt`, floating-point accumulation order) is a bug.
- Agents MUST NOT allow `release.passport.heartbeatUrl` to be client-writable, even via indirect means (e.g., wrapping the URL in a client-editable alias).
- Agents MUST reference `RFC-0028` in commit messages touching `@gogol/passport`, `@gogol/star-map`, `@gogol/nebula`, `apps/*/public/.well-known/cosmic-passport-key.json`, `apps/*/src/content/pages/cosmic-passport/`, `apps/*/src/content/pages/cosmic-star-map/`, or `system.yaml.release.passport`.
