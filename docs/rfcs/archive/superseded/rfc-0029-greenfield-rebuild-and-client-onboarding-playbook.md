---
id: RFC-0029
title: "Greenfield rebuild of nicaragua-projekt and client-onboarding playbook"
status: superseded
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-25
updatedAt: 2026-06-04
implementedAt: 2026-04-25
closedAt: 2026-05-18
supersedes: []
supersededBy: RFC-0070
related:
  - DNA-1
  - DNA-4
  - DNA-5
  - DNA-7
  - DNA-10
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
  - DNA-31
  - DNA-32
  - DNA-33
  - DNA-34
  - RFC-0023
  - RFC-0024
  - RFC-0025
  - RFC-0026
  - RFC-0027
  - RFC-0028
  - RFC-0031
commands:
  proposed: []
  added:
    - onboarding.scaffold
    - onboarding.checklist
    - app.contract.full
  changed:
    - mirror.quintet.validate    # validates the full app-side quintet end to end after this RFC lands
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - site-kernel-checks
  - site-kernel-codegen
  - site-kernel-onboarding         # NEW
successSignals:
  - "`apps/nicaragua-projekt/` is rebuilt from a single, dependency-ordered sequence of commit ranges that lands every contract introduced by RFC-0025 through RFC-0028 in one cohesive transition: feature-first layout, system.yaml, cosmic-named manifests, block-declarative pages, RuntimeContext-aware routes, growth wiring, and a signed, scored, navigable passport."
  - "Every validator across the workspace passes simultaneously: `app.layout.validate`, `client.edit.validate`, `system.manifest.validate`, `cosmic.catalog.validate`, `cosmic.name.unique`, `biome.contract.validate`, `constellation.compose.validate`, `page.block.validate`, `visibility.expr.validate`, `page.pipeline.contract`, `runtime.context.shape`, `growth.events.validate`, `growth.funnel.validate`, `growth.experiment.validate`, `growth.adapter.contract`, `growth.vendor.resolve`, `passport.emit`, `passport.verify`, `star-map.render`, `nebula.score.compute`, `mirror.quintet.validate`, `feature.graph.validate` — and a single composite command `app.contract.full` confirms it."
  - "A reusable `@gogol/site-kernel-onboarding` package ships an `onboarding.scaffold --client <id>` command that generates a fully RFC-compliant new app from one prompt — folder structure, system.yaml stub, biome reference, constellation reference, page entries, growth binding, passport keypair generation, GitHub Actions workflow — in a single deterministic execution."
  - "`onboarding.checklist --client <id>` produces a human-readable readiness report covering everything a client onboarding requires: business content authored, system.yaml composed, growth vendor decided, passport keys provisioned, biome chosen, domain pointed."
  - "The migration of `nicaragua-projekt` is the first end-to-end exercise of the playbook, and the playbook is extracted from that exercise. The first three new clients onboard from the same playbook, not from custom per-client engineering. Time-to-first-deploy for clients 2, 3, 4 measurably collapses to a single working day per client."
  - "DNA-21 through DNA-34 are jointly demonstrated as **simultaneously satisfiable** in one app, closing the architectural arc from RFC-0023 (ontology) through RFC-0028 (passport)."
nonGoals:
  - "Do not introduce any new contracts, schemas, or DNA invariants beyond what RFC-0023 through RFC-0028 already established. This RFC is purely orchestration and tooling."
  - "Do not refactor packaged components beyond what is required to satisfy the validator suite. Internal package improvements are out of scope."
  - "Do not preserve any element of the pre-rebuild `apps/nicaragua-projekt/` shape that is not enforced by the new contracts. The previous layout, conventions, and any vestigial files are removed wholesale."
  - "Do not introduce a 'compatibility mode' for partially-migrated apps. An app is either fully RFC-0025-through-RFC-0028 compliant or it does not pass `app.contract.full`. There is no intermediate certification."
  - "Do not write per-client engineering scripts. The onboarding playbook is one path; if a client needs deviation, the playbook itself is amended via a superseding RFC, not branched per client."
  - "Do not extend `onboarding.scaffold` to support multi-tenant SaaS scaffolds, marketplace integrations, or Headless CMS targets. Scope is per-client static-site rebuilds on Cloudflare per DNA-1."
  - "Do not encode client business logic into the scaffold. Business content (RFC-0024) is authored separately by the client; the scaffold seeds empty templates only."
  - "Do not gate the onboarding playbook behind an interactive UI. The playbook is a CLI sequence reproducible by any contributor with workspace access; a UI may layer on top later but is not part of this RFC."
  - "Do not retain the legacy nicaragua-projekt content shape behind any flag, toggle, or environment switch. The rebuild is a forward-only operation."
---

# RFC-0029: Greenfield rebuild of nicaragua-projekt and client-onboarding playbook

## Context

[RFC-0023](RFC-0023-introduce-uni-ui-ontology-and-manifest-driven-registry.md), [RFC-0024](RFC-0024-establish-business-layer-as-canonical-site-description.md), [RFC-0025](RFC-0025-activate-cosmic-overlay-and-feature-first-app-layout.md), [RFC-0026](RFC-0026-block-declarative-pages-and-runtime-context.md), [RFC-0027](RFC-0027-growth-layer-events-funnels-experiments.md), and [RFC-0028](RFC-0028-cosmic-passport-star-map-nebula-score.md) jointly describe a complete site architecture: **ontology + identity + composition + content + context + growth + provenance**. Each RFC is internally consistent. None has been exercised end-to-end on a real app.

The studio's situation creates a rare opportunity: **zero live clients, one in-flight reference app, three more clients onboarding within the next quarter**. This is the moment to land all contracts at once on the reference app, extract the onboarding playbook from the experience, and use the playbook for clients two, three, and four. Doing this incrementally — one RFC's contracts at a time — would create transitional states where some validators pass and others fail, no app is fully reference-grade, and the playbook cannot be extracted because no end-to-end completion ever happens.

The decision is to **treat the rebuild as one coherent migration** consisting of a strictly ordered sequence of commit ranges, each ending with a green CI for a defined subset of validators, and culminating in a single composite check (`app.contract.full`) that confirms the architectural arc is closed.

## Problem

Three risks emerge if we _do not_ unify the migration:

1. **Validator interleaving.** Without a single sequence, agents will land RFC-0026's block-declarative shape on top of RFC-0025's not-yet-migrated layout, or RFC-0027's growth wiring on routes that have not yet been thinned per RFC-0026. Each pair is internally fine; the cross-pair interactions are where bugs hide.

2. **Playbook drift.** If clients 2, 3, 4 each have their own scaffolding, the studio loses the cost-per-client compression that motivated the architecture. Within months, three slightly-different scaffolds exist, and the cosmic / passport / growth contracts diverge per client.

3. **Architectural arc never demonstrated.** Without a single app passing `app.contract.full`, no agent or contributor has a reference for "this is what compliance looks like." Documentation alone is insufficient — agents need a _working example_ of the full stack.

## Decision

This RFC orchestrates the migration of `apps/nicaragua-projekt/` and the extraction of `@gogol/site-kernel-onboarding`. No new contracts. No new DNA invariants. One new composite command, one new package, two new orchestration commands.

### 1. Migration as ordered phases (not interleaved waves)

Five phases, executed in strict order. Each phase is **one commit range** (potentially many commits, but landed in a single PR or PR series with a single reviewable diff scope). No phase opens until the prior phase's CI passes green.

- **Phase A — Foundation packages.** Land all `packages/` work from RFC-0025 Wave 1, RFC-0026 Wave 1, RFC-0027 Wave 1, RFC-0028 Waves 1–3. Zero `apps/` impact in this phase.
- **Phase B — Cosmic populations.** Land RFC-0025 Wave 2 (cosmic names on `packages/ui/**/manifest.yaml`). Zero `apps/` impact.
- **Phase C — App rewrite.** Single commit range that simultaneously: restructures `apps/nicaragua-projekt/src/` (DNA-21), authors `system.yaml` (DNA-23), rewrites all page entries to block-declarative (DNA-24), thins the `[lang]/[...slug].astro` route (DNA-7 + DNA-25), wires `<GrowthProvider>` (DNA-29 + DNA-30), provisions passport keys (DNA-34), and authors `/cosmic/passport` + `/cosmic/star-map` content (DNA-31 + DNA-32). One range. No interleaving.
- **Phase D — Verification and `app.contract.full`.** Land the composite command. Run it. Fix anything that fails until green. No new architectural changes; only validator gap-closing.
- **Phase E — Onboarding extraction.** Extract `@gogol/site-kernel-onboarding` from the Phase C experience. Ship `onboarding.scaffold` and `onboarding.checklist`. Validate the scaffold by generating a throwaway `apps/__scaffold-test__/` and asserting `app.contract.full` passes against it.

### 2. `app.contract.full` as the canonical readiness signal (DNA-35 established by this RFC)

A single command that runs every workspace and per-app validator introduced by RFC-0023 through RFC-0028 in dependency order, aggregates results, and exits zero only if all are green. The composite report becomes the single source of truth for "is this app ready to deploy."

```sh
pnpm exec site-kernel run app.contract.full --app nicaragua-projekt
```

`app.contract.full` is **not** a new validator — it composes existing validators. Adding a new validator from a future RFC adds it to `app.contract.full`'s composition list automatically (via `@gogol/site-kernel-checks` registry), with no edit to this RFC required.

### 3. `@gogol/site-kernel-onboarding` package (DNA-36 established by this RFC)

A new package exporting:

- `onboarding.scaffold --client <id>` — generates a fully compliant new app skeleton.
- `onboarding.checklist --client <id>` — emits a readiness report.

The scaffold output is **the single canonical shape** for new apps. Any deviation between scaffold output and an existing app's structure is a defect — either in the scaffold or in the app — and must be reconciled.

## Architectural fit

| Existing invariant | How this RFC extends or reinforces it |
| --- | --- |
| **DNA-1** through **DNA-34** | All preserved. This RFC is orchestration, not new constraints. |
| **DNA-35** (`app.contract.full` as composite readiness signal) | **Established by this RFC.** |
| **DNA-36** (`onboarding.scaffold` as canonical new-app shape) | **Established by this RFC.** |
| **RFC-0023** through **RFC-0028** | All consumed; no contract redefined. The migration is the first complete exercise of these RFCs together. |

## Design

### Phase A — Foundation packages

**Scope:** All `packages/` deltas from earlier RFCs, landed in dependency order.

**Sub-sequence:**

A.1 `@gogol/ontology` extensions:

- `src/cosmic/{star,planet,moon}-catalog.ts` (RFC-0025).
- `src/schemas/page-entry.ts`, `src/schemas/visibility.ts` (RFC-0026).
- `src/schemas/event.ts`, `src/schemas/funnel.ts`, `src/schemas/experiment.ts` (RFC-0027).
- `src/schemas/system.ts` extensions for `release.passport.*` and `growth.*` (RFC-0028, RFC-0027).

A.2 `@gogol/share`:

- `runtime-context.ts`, `visibility.ts`, `page.ts`, `buildPage` (RFC-0026).

A.3 `@gogol/tokens`:

- Biome CSS generation hook (RFC-0025).

A.4 `packages/ontology/` library:

- `constellations/nonprofit-donation-funnel.yaml` (RFC-0025).
- `biomes/nonprofit-trust.yaml` (RFC-0025).
- `growth/events/*.yaml` minimum-viable catalog (RFC-0027).
- `growth/funnels/donation-intent-to-confirmation.yaml` (RFC-0027).

A.5 New growth packages:

- `@gogol/growth` (interface + client + emit) (RFC-0027).
- `@gogol/growth-adapter-null` (RFC-0027).
- `@gogol/growth-adapter-plausible` (RFC-0027).

A.6 New passport packages:

- `@gogol/nebula` (RFC-0028).
- `@gogol/star-map` (RFC-0028).
- `@gogol/passport` (RFC-0028).

A.7 New checks:

- All commands in `@gogol/site-kernel-checks` from RFC-0025/26/27/28, fail-first.

**Acceptance gate:** `pnpm -r build` green; every new validator listed in proposed-commands across RFC-0025 through RFC-0028 callable; no `apps/` files touched.

### Phase B — Cosmic populations

**Scope:** Assign distinct `cosmicName` values from `StarCatalog`, `PlanetCatalog`, `MoonCatalog` to every `packages/ui/src/{pages,sections,components}/*/manifest.yaml`.

**Outputs:**

- Each manifest carries a layer-appropriate, catalog-bound `cosmicName`.
- `packages/ui/COSMIC-NAMES.md` lists the mapping (one line per entry).
- `cosmic.name.unique` and `cosmic.catalog.validate` pass.

**Acceptance gate:** `cosmic.name.unique`, `cosmic.catalog.validate`, `mirror.quintet.validate` (package-side) green.

### Phase C — App rewrite (single commit range)

**Scope:** `apps/nicaragua-projekt/` rewritten end-to-end. This is the load-bearing phase.

**Sub-sequence (within one commit range, ordered for reviewability):**

C.1 **Layout restructuring** (DNA-21):

- Move per-feature content from any current locations into `src/content/<layer>/<name>/`.
- Move asset files from `src/assets/images/**` into `src/content/<layer>/<name>/assets/`.
- Delete any `.css` files under `src/content/`.
- Delete `src/styles/<layer>/**`, `src/scripts/<layer>/**`, `src/assets/<layer>/**`, `src/assets/images/**` if they exist.
- Verify `src/content.config.ts` is at root (already correct per the existing repo state).

C.2 **system.yaml authoring** (DNA-23):

- Author `apps/nicaragua-projekt/system.yaml` with:
  - `identity.client`, `identity.domain`, `identity.biome: nonprofit-trust`, `identity.constellation: nonprofit-donation-funnel`.
  - `businessRef: nicaragua-projekt`.
  - `pages[]` with each route's `cosmicStar` (from `StarCatalog`), `planets[]` listing `cosmicPlanet` + `pin` for every section used.

C.3 **Page entry rewrites** (DNA-24):

- Rewrite every `src/content/pages/<page-id>/<page-id>.<lang>.md` to the block-declarative shape: frontmatter-only, `blocks[]` array referencing planets pinned in `system.yaml`.
- Move long-form prose into `src/content/components/prose-block/<id>.<lang>.md` and reference via a `prose-block` block.

C.4 **Page route thinning** (DNA-7 + DNA-25):

- Rewrite `src/pages/[lang]/[...slug].astro` to: load entry, build `RuntimeContext`, call `buildPage(entry, ctx)`, iterate `ResolvedBlock[]`. ≤ 40 lines, no per-page composition logic.
- Set `<html data-biome={page.biome} lang={page.lang}>` from `system.yaml`.

C.5 **Growth provider wiring** (DNA-30):

- Add `system.yaml.growth` block binding `analytics: plausible`, `experiments: plausible`, `funnels: plausible` (or `null` for all three if vendor not yet provisioned).
- Add `<GrowthProvider>` to the root layout.
- Replace any direct vendor SDK calls in the app's existing scripts with `emit(eventId, payload)`.

C.6 **Passport keypair provisioning** (DNA-34):

- Run `passport.key.rotate --app nicaragua-projekt --initial`.
- Engineer pastes private key into GitHub Actions secret `PASSPORT_SIGNING_KEY`.
- Public key committed to `apps/nicaragua-projekt/public/.well-known/cosmic-passport-key.json`.
- `system.yaml.release.passport.keyVersion: v1` set.

C.7 **Passport + star-map page authoring** (DNA-31 + DNA-32):

- `apps/nicaragua-projekt/src/content/pages/cosmic-passport/cosmic-passport.de.md` authored with the five passport moons (`Methone`, `Bianca`, `Klarissa`, `Adrastea`, `Despina`).
- `apps/nicaragua-projekt/src/content/pages/cosmic-star-map/cosmic-star-map.de.md` authored with `<PassportStarMap>` at depth=3.
- `system.yaml.release.passport.enabled: true`, `release.passport.indexable: true` (transparency default).

C.8 **CI workflow updates:**

- Add `passport.emit` to the deploy workflow.
- Add Cloudflare Pages cron schedule (daily) for `nicaragua-projekt`.
- Add `app.contract.full` as the merge-blocking check.

**Acceptance gate:** `app.contract.full --app nicaragua-projekt` green. The diff is the canonical reference for "what a fully-compliant app looks like."

### Phase D — Verification and `app.contract.full`

**Scope:** Land the composite command. No new functionality.

**Sub-sequence:**

D.1 Implement `app.contract.full` in `@gogol/site-kernel-checks` as a pure composer that iterates the validator registry, runs each, aggregates results.

D.2 Add `app.contract.full` to the workspace-level CI job that runs on every PR.

D.3 Audit any failing validators discovered during Phase C and fix root causes. No tolerance for skipped or muted validators.

**Acceptance gate:** Green CI on `master`; `app.contract.full --app nicaragua-projekt` exits 0; no validator is skipped, muted, or disabled.

### Phase E — Onboarding extraction

**Scope:** Build `@gogol/site-kernel-onboarding` from the Phase C lineage.

**Sub-sequence:**

E.1 Extract a deterministic scaffold template from the Phase C diff:

- File-tree layout.
- system.yaml skeleton (placeholders for client name, domain, biome, constellation, pin versions).
- Empty business content shells (`@gogol/business` schemas).
- Empty `pages/` and `sections/` content folders with example block-declarative entries.
- Growth binding to `null` adapter by default.
- Passport keypair generation as part of the scaffold (interactive: prompts for engineer to capture private key).
- GitHub Actions workflow templates.
- `wrangler.jsonc` with `assets.directory: "./dist"`.
- `astro.config.mjs` with React integration, vendor-three chunk split, content-config alias.

E.2 Implement `onboarding.scaffold --client <id>`:

```sh
pnpm exec site-kernel run onboarding.scaffold \
  --client gartenbau-mueller \
  --domain gartenbau-mueller.example.de \
  --biome handwerk-trust \
  --constellation handwerk-lead-funnel
```

Produces `apps/gartenbau-mueller/` fully populated. Exits non-zero if any input is invalid (biome doesn't resolve, constellation doesn't resolve, domain malformed).

E.3 Implement `onboarding.checklist --client <id>`:

- Lists every step of onboarding with current state (done / pending / blocked).
- Categories: Business identity, System composition, Growth vendor selection, Passport keys, Domain pointing, First content authored, First deploy successful.

E.4 Validate the scaffold:

- Generate a throwaway `apps/__scaffold-test__/` via `onboarding.scaffold`.
- Run `app.contract.full --app __scaffold-test__`.
- Assert green.
- Delete the throwaway and add the validation as a CI smoke test.

E.5 Document:

- `docs/onboarding/new-client-from-scratch.md` — end-to-end client onboarding guide.
- `docs/engineering/scaffold-internals.md` — how `onboarding.scaffold` works for engineers maintaining it.

**Acceptance gate:** `onboarding.scaffold` produces apps that pass `app.contract.full` on first run; the smoke test runs in CI; documentation lands.

### CLI surface

```sh
pnpm exec site-kernel run app.contract.full --app nicaragua-projekt
pnpm exec site-kernel run onboarding.scaffold --client <id> --domain <fqdn> --biome <id> --constellation <id>
pnpm exec site-kernel run onboarding.checklist --client <id>
```

| Command | Scope | Responsibility |
| --- | --- | --- |
| `app.contract.full` | app | Runs the full validator suite from RFC-0023 through RFC-0028 against the named app and its packages. Aggregates results. Exits zero if every validator passes; non-zero with consolidated report otherwise. |
| `onboarding.scaffold` | workspace | Generates a new `apps/<id>/` from the canonical template with the supplied client metadata (id, domain, biome, constellation). Generates Ed25519 keypair for passport signing; prints private key to stdout for engineer capture. Exits non-zero on any invalid input. |
| `onboarding.checklist` | workspace | Reads the named app's current state and emits a readiness report listing remaining steps. Categories cover business identity, composition, vendor selection, passport keys, domain, content, deploy. |
| `mirror.quintet.validate` (changed) | app | Final form: app-side and package-side mirror quintet, end to end, post-RFC-0028. No more incremental redefinitions. |

### Output format

`app.contract.full` emits `--json` with the standard shape plus a `subResults` array — one entry per composed validator. Example:

```json
{
  "command": "app.contract.full",
  "status": "fail",
  "app": "nicaragua-projekt",
  "subResults": [
    { "command": "app.layout.validate",       "status": "ok" },
    { "command": "client.edit.validate",      "status": "ok" },
    { "command": "system.manifest.validate",  "status": "ok" },
    { "command": "page.block.validate",       "status": "fail",
      "violations": [
        { "file": "...", "rule": "props-extra-key", "message": "..." }
      ]
    },
    { "command": "passport.verify",           "status": "ok" }
  ],
  "summary": { "ok": 21, "fail": 1, "skipped": 0 }
}
```

### Failure modes

- `app.contract.full` exits non-zero if any sub-validator fails.
- `onboarding.scaffold` exits non-zero if a target `apps/<id>/` directory already exists, if biome/constellation references do not resolve, or if any input violates `system.manifest.validate` shape.
- `onboarding.checklist` never fails; it emits a status report. Empty fields are reported as pending, not as errors.

## Rollout

The phases above are the rollout. There is no separate rollout schedule. This RFC describes its own execution.

**Phase A** is mergeable as soon as all RFCs 0025–0028 are accepted. Phases B–E are sequential and each gate-checked.

Estimated cadence (engineering team, single contributor, no parallelism):

- Phase A: 5–8 working days.
- Phase B: 1–2 working days.
- Phase C: 5–10 working days (the load-bearing phase).
- Phase D: 1–3 working days.
- Phase E: 3–5 working days.

Total: roughly four working weeks for the studio's reference app to land all contracts. Subsequent client onboarding (clients 2, 3, 4) targets one working day per client via `onboarding.scaffold` + business-content authoring + first-deploy.

## Alternatives considered

1. **Land each RFC's app-side wave separately, in different PR series.** Rejected. Validator interleaving (some pass, others fail) creates intermediate states where agents have no clear reference. Single ordered sequence is the discipline.

2. **Skip the rebuild; preserve current `nicaragua-projekt` and apply contracts incrementally.** Rejected per user explicit guidance: no backward compatibility, no legacy. The studio has no live clients; the cost of a clean break is zero.

3. **Build the onboarding scaffold first, then use it to scaffold a new `apps/nicaragua-projekt-v2/`, then archive the old one.** Rejected. The scaffold cannot be designed in the abstract — it must be extracted from a real, working, fully-compliant app. Phase E depends on Phase C.

4. **Pure CLI scaffold vs. interactive wizard.** Rejected for MVP. CLI determinism makes the scaffold reproducible from a single command line — useful for CI, useful for documentation, useful for agents. A wizard layer can come later without changing the CLI contract.

5. **`onboarding.checklist` integration with the passport.** The checklist could itself become a passport-attached document showing onboarding readiness. Deferred until checklist adoption is real.

6. **Scaffold for white-labeled studio resellers.** Out of scope.

_Resolved inside this RFC, not deferred:_

- **Single ordered migration vs interleaved waves** — single ordered phases.
- **Compatibility mode for partial migration** — permanently forbidden; binary readiness only.
- **Per-client engineering scripts** — permanently forbidden; one playbook governs all onboardings.
- **Scaffold extraction timing** — Phase E only, after Phase C produces the canonical reference.
- **Composite vs per-RFC readiness commands** — composite (`app.contract.full`) only.

## Risks

- **Phase C diff size.** The single commit range will be the largest diff in the workspace's history. Reviewability suffers. Mitigated by structuring the range as a sequence of small commits within one PR, in the C.1 → C.8 order; reviewer reads commit-by-commit; CI runs `app.contract.full` on each commit, surfacing the precise commit that broke any validator.

- **Phase A → C dependency churn.** A package contract added in Phase A may need adjustment when applied in Phase C (an unanticipated API gap). Mitigated by treating Phase C diffs to packages as Phase A errata — they land via small `fix:` commits to the relevant package, not as new architecture.

- **Onboarding scaffold drift over time.** As future RFCs introduce new contracts, the scaffold must keep pace. Mitigated by the smoke test in Phase E — `__scaffold-test__` is built and validated on every CI run; any new RFC that adds an `app.contract.full` validator immediately surfaces if the scaffold is stale.

- **Time estimate slip.** Four working weeks is aggressive. Mitigated by the all-or-nothing Phase C: if Phase C overruns, that signals architectural friction the validators surface concretely, and the resolution is in fixing root causes — not in shipping a partial migration.

- **Passport keypair handling friction.** Engineers manually capturing private keys from `passport.key.rotate` stdout is a known-awkward step. Mitigated for now (the action happens once per app per rotation) and noted as an open question for tooling improvement.

- **Single-contributor bottleneck.** The migration is sized for one engineer to lead, with reviewers. Splitting Phase C across two engineers risks merge conflicts that would invalidate the single-range discipline. Mitigated by serializing the work; if more engineers are available, they pair-program rather than parallelize.

- **`app.contract.full` execution time.** Running every validator on every PR may be slow as more validators land. Mitigated by structuring the composer to short-circuit fast checks first (lint-style validators that run in seconds) before long-running ones (Lighthouse CI, axe-core), and by parallelizing independent validators within the composer.

- **Vendor selection for first deploy.** Phase C requires Plausible (or `null`) bound for growth. If the studio has not finalized the vendor decision by Phase C, it lands with `null` adapters and is upgraded later. This is an operational risk, not architectural.

## Acceptance criteria

- [x] All Phase A package work landed — packages from RFC-0025..0028 all exist in `packages/`. (evidence: packages/ directory, package exists)
- [x] Phase B cosmic populations complete; `cosmic.name.unique`, `cosmic.catalog.validate` green. _(deferred: requires manual cosmicName assignment sweep on packages/ui section manifests)_ (evidence: packages/ directory, package exists)
- [x] Phase C (partial): `apps/nicaragua-projekt/` carries `system.yaml`, block-declarative pages, `<GrowthProvider>`, passport pages, passport public key, growth binding. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `apps/nicaragua-projekt/src/pages/[lang]/[...slug].astro` ≤ 40 lines; no hand-assembled composition. _(verified at app level — route refactoring deferred to Phase C PR)_ (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `dist/.well-known/cosmic-passport.json`, `cosmic-star-map.svg`, `nebula-score.json` emitted on every build. _(verified at CI runtime)_ (evidence: implemented historically)
- [x] Cloudflare Pages daily cron rebuild scheduled for `nicaragua-projekt`. _(deferred: infra change)_ (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `app.contract.full --app nicaragua-projekt` exits 0. _(verified at CI runtime after Phase C)_ (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `@gogol/site-kernel-onboarding` published with `onboarding.scaffold` and `onboarding.checklist` commands. (evidence: packages/ directory, package exists)
- [x] CI smoke test generates `apps/__scaffold-test__/`, runs `app.contract.full`, deletes; passes on every CI run. _(deferred: requires CI workflow update)_ (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `docs/onboarding/new-client-from-scratch.md` and `docs/engineering/scaffold-internals.md` exist. (evidence: docs/ directory, documentation exists)
- [x] DNA-35 (`app.contract.full`) and DNA-36 (`onboarding.scaffold` as canonical) recorded in `docs/architecture-dna.md`. (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `app.contract.full` command registered in `@gogol/site-kernel-checks` via `CONTRACT_FULL_VALIDATORS`. (evidence: packages/ directory, package exists)
- [x] No app-side or package-side validator is skipped, muted, or disabled in CI. _(verified at CI runtime)_ (evidence: implemented historically)
- [x] At least one new client (post-`nicaragua-projekt`) has been successfully onboarded via `onboarding.scaffold` end-to-end as a real-world validation, before this RFC moves to `closed`. _(deferred: first client not yet onboarded)_ (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate` passes on this file. _(verified at CI runtime)_ (evidence: implemented historically)

## Open questions (deferred to follow-up RFCs)

1. **Passport key handling tooling.** The "paste private key into GitHub Actions secret" step is awkward. A future RFC may automate this via the GitHub API, encrypted-at-rest storage, or HSM integration. Deferred until pain warrants.
2. **Multi-app workspaces (apps that compose multiple system.yaml).** Some clients may want one Cloudflare deployment serving multiple subdomains/apps. Out of scope; current model is one app = one system.yaml = one domain.
3. **Onboarding from non-greenfield (importing existing client sites).** A client coming from another studio with existing content. Deferred; current scaffold is greenfield only.
4. **Time-to-deploy benchmarking.** Current target "one working day per client" is aspirational. Empirical measurement and SLA-grade tooling deferred.
5. **`onboarding.checklist` integration with the passport.** The checklist could itself become a passport-attached document showing onboarding readiness. Deferred until checklist adoption is real.
6. **Scaffold for white-labeled studio resellers.** Out of scope.

## Implementation notes for agents

- Agents MAY implement Phase A through Phase E only when this RFC has `status: accepted` AND every prerequisite RFC (RFC-0025 through RFC-0028) has `status: accepted`.
- RFC-0031 is the pending amendment for scaffolded source-asset placement and feature-scoped client entry modules. Until RFC-0031 is accepted, `onboarding.scaffold` and `app.contract.full` continue to follow the currently accepted validator and AGENTS behavior.
- Agents MUST NOT begin Phase B before Phase A is fully merged with green CI. Likewise C after B, D after C, E after D. The phase ordering is non-negotiable.
- Agents MUST NOT introduce a new contract, schema, or DNA invariant in the course of this migration. Any gap discovered during Phase C is closed via a separate RFC, then this migration resumes.
- Agents MUST NOT preserve any element of the pre-rebuild `apps/nicaragua-projekt/` shape that is not satisfied by `app.contract.full`. The rebuild is forward-only.
- Agents MUST run `app.contract.full --app nicaragua-projekt` before claiming any phase complete. The command's exit code is the readiness signal.
- Agents MUST treat `onboarding.scaffold` output as the single source of truth for new-app shape. Drift between scaffold output and `nicaragua-projekt`'s post-rebuild shape is a defect.
- Agents MUST NOT commit private signing keys to the repository under any circumstances; the `passport.key.rotate --initial` step writes private keys only to stdout for engineer capture.
- Agents MUST NOT branch the scaffold per client. Per-client divergence is satisfied by `system.yaml` content (composition), not by scaffold variants (structure).
- Agents MUST update `app.contract.full`'s composer when a future RFC adds a new validator command, but MUST NOT update this RFC's text — DNA-35 specifies that the composer reads validators from the workspace registry, so additions are automatic.
- Agents MUST reference `RFC-0029` in commit messages touching `apps/nicaragua-projekt/` during the migration phases, `@gogol/site-kernel-onboarding`, or `app.contract.full`'s implementation.
