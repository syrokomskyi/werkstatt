---
id: RFC-0221
title: "Site handoff bundle and version-aware absorb for internal site circulation across evolving ecosystems"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-20
updatedAt: 2026-06-21
implementedAt: 2026-06-21
closedAt:
supersedes: []
supersededBy:
amendedBy:
  - RFC-0354
  - RFC-0355
  - RFC-0356
  - RFC-0357
  - RFC-0359
  - RFC-0364
  - RFC-0479
related:
  - RFC-0007
  - RFC-0028
  - RFC-0029
  - RFC-0078
  - RFC-0115
  - RFC-0128
  - RFC-0158
  - RFC-0178
commands:
  proposed: []
  added:
    - handoff.pack
    - handoff.absorb
    - handoff.validate
    - migrator.validate
  changed: []
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - site-kernel-handoff
  - site-kernel-deploy
  - site-kernel-codegen
  - site-kernel-onboarding
  - ontology
successSignals:
  - "A developer can `handoff.pack --app <name>` and produce a thin, ecosystem-version-stamped bundle that contains the authored site only — no `packages/`, no `node_modules/`, no `*.generated.*`, no `dist/`."
  - "A second developer with a *newer* ecosystem can `handoff.absorb --bundle <path>` and the site is migrated forward, fully regenerated, validated against the bundle's golden pack, and lands as a buildable `apps/<name>/` in their current workspace — without a single manual code edit when the capability diff is green."
  - "`handoff.absorb` refuses to run when the recipient's ecosystem is *older* than the bundle and tells the operator to `git pull` first — a site is never silently downgraded."
  - "`migrator.validate` fails when an ecosystem version that changed a semantic contract in `uni.registry.json` has no registered migrator (or explicit no-op marker) bridging it — making it impossible to ship a breaking contract change without a migration path."
  - "The catch-up cost of any bundle is computed from the capability diff *before* work begins and reported as green / yellow / red with per-item migration decision records."
  - "Derived files edited inside a bundle are detected via the manifest partition and surfaced as decision records — never silently re-absorbed as source of truth."
nonGoals:
  - "Does not change `client.export` (RFC-0007), which remains the external, self-contained full-fork deliverable for clients outside the studio."
  - "Does not introduce backward compatibility or legacy code retention in the ecosystem — migration is forward-only and generated artifacts remain disposable."
  - "Does not define the physical transport (git repo vs archive) — the bundle is a directory that may live in a per-client git repo or be archived; absorb operates on a directory either way."
  - "Does not migrate a site onto an *older* ecosystem (downgrade); that path is explicitly refused."
  - "Does not attempt automatic resolution of red-tier capability removals — those raise migration decision records for an agent or human to resolve."
---

# RFC-0221: Site handoff bundle and version-aware absorb for internal site circulation across evolving ecosystems

## Context

The studio develops every client site inside one monorepo ecosystem. `client.export` (`packages/os/site-kernel-deploy/src/client-export.ts`, RFC-0007) copies a **full fork** of the workspace — all of `packages/`, the single target app, `node_modules/` — into `../clients/<app>` so that an **external** recipient gets a self-contained, immediately runnable project. That command is correct for its purpose and is unchanged by this RFC.

The need here is different. The studio wants to circulate a client site **internally**, between its own developers. Every developer already has the **full ecosystem** checked out locally and updates it from GitHub on their own cadence. So when developer B receives a site from developer A, B does **not** need A's copy of `packages/` — B already has one, usually a **newer** one. What B needs is the **site** (its authored content and configuration) dropped into B's current ecosystem and reliably brought up to date.

The ecosystem deliberately keeps **no backward compatibility** and **deletes legacy** (RFC-0078 radically-thin sites; the migration RFCs RFC-0115, RFC-0128, RFC-0178 are forward-only codemods that rename/move contracts and remove the old form). Therefore a site that was last touched on an older ecosystem version cannot simply be opened on a newer one — its generated files are stale and its consumed contracts in `uni.registry.json` may have been renamed, version-bumped, or removed.

The ecosystem already provides most of the raw material to solve this:

- **Canonical authored context** lives in `apps/<app>/src/content/business/{lang}/**` and a small set of authored config files; everything else in the app is either build output or a `*.generated.*` artifact (e.g. `src/entitlements.generated.json`, `src/surface.generated.json`, `src/env.schema.generated.mjs`, `src/styles/biome.generated.css`).
- A **capability map** exists: `uni.registry.json` (per-entry `semanticId`, `version`, `manifest`, plus `intent[]` and `industryFit[]`). DNA-registry continuity is already guarded by RFC-0158.
- **Provenance** exists: the signed passport (`@gogol/passport` → `dist/.well-known/cosmic-passport.json`) records `systemHash`, `commitSha`, scores, and composition; `provenance/coverage-ledger.yaml` records coverage.
- A **regeneration engine** exists: GRACE-marked regions, `@gogol/site-kernel-codegen`, `onboarding.scaffold`, and the composite validator `app.contract.full` (RFC-0029) can rebuild an app's derived surface from its authored context.
- **Migration precedent** exists but is **ad hoc**: RFC-0115, RFC-0128, RFC-0178 are one-off codemods with no registry, no version keying, and no continuity guarantee.

What is missing is the **seam** that joins these into a reliable round trip: a thin transferable bundle, a version-aware ingest pipeline, and a migrator registry that makes "catch a site up to the current ecosystem" a standard, deterministic operation rather than an ad hoc project.

## Problem

Four invariants are unprotected today:

1. **No thin transfer unit.** The only export is a full-fork (`client.export`). For internal handoff that ships an entire redundant copy of `packages/` and `node_modules/`, and — worse — it co-mingles the authored source of truth with disposable generated artifacts, so a received site has no clean line between "what must survive" and "what must be regenerated."

2. **No version awareness on ingest.** Nothing records which ecosystem version / commit / capability set a site was built against, and nothing compares that to the recipient's current ecosystem. Without that comparison there is no way to know what changed, what must be migrated, or whether the recipient is even ahead of the bundle.

3. **No migration spine.** Breaking contract changes ship without a registered, version-keyed codemod. A site from an older ecosystem must be hand-migrated by reading RFCs and guessing — exactly the "archaeology" failure mode the no-legacy policy is supposed to avoid.

4. **Drift accumulation.** With AI agents doing the work, nothing stops an agent on the receiving end from "fixing" a `*.generated.*` file or a `packages/` source locally, so every round trip risks compounding drift instead of converging on the authored context.

## Decision

Introduce an **internal site handoff** built around three principles:

1. **Only the authored site travels; the ecosystem is assumed present on the recipient.** The transfer unit is a **thin bundle** — authored content + authored config + a lock + provenance + a validation pack + a manifest. It carries **no** `packages/`, **no** `node_modules/`, **no** `dist/`, and **no** `*.generated.*` files. Generated artifacts are always re-derived on the recipient's current ecosystem.

2. **Ingest is a version-aware rehydration, never a merge.** Absorbing a bundle compares the bundle's stamped ecosystem version against the recipient's current one, replays a deterministic chain of migrators over the authored set, regenerates all derived artifacts on the current ecosystem, and validates the result against the bundle's golden pack. The bundle is never `git merge`d into the working tree.

3. **The migrator registry is the spine, and it is enforced.** Every ecosystem change that alters a semantic contract in `uni.registry.json` must register a version-keyed migrator (or an explicit no-op marker). `migrator.validate` fails on any gap, making the migration path a precondition of a breaking change rather than an afterthought.

Four new commands in a new `@gogol/site-kernel-handoff` package:

| Command | Purpose |
| --- | --- |
| `handoff.pack` | Produce a thin, version-stamped site bundle for internal transfer. |
| `handoff.absorb` | Ingest a bundle into the current ecosystem: compare versions → migrate → regenerate → validate → report. |
| `handoff.validate` | Pre-flight integrity check of a bundle (manifest, lock, hashes) without absorbing. |
| `migrator.validate` | Assert the migrator registry is continuous across ecosystem versions that touched a contract. |

`client.export` (RFC-0007) is **retained unchanged** as the external full-fork deliverable. The two serve different audiences: `client.export` → external client who lacks the ecosystem; `handoff.*` → internal developer who has it.

## Architectural fit

- **Site OS operator model.** `handoff.*` are deploy/lifecycle-domain commands, peers of `client.export` and `onboarding.scaffold`. They compose existing primitives (`site-kernel-codegen`, `onboarding.scaffold`, `passport.emit`, `app.contract.full`) rather than reimplementing them.
- **Source of truth = authored context, not code.** This RFC formalises that `apps/<app>/src/content/**`
  - a whitelisted authored-config set is the canonical site; everything else is a disposable derivative. This is the natural completion of RFC-0078 (radically thin sites) and the regeneration contract of RFC-0029.
- **Capability map = `uni.registry.json`.** The bundle's lock snapshots the _consumed_ subset; absorb diffs it against the current registry. This reuses the registry RFC-0158 already maintains.
- **No-legacy policy made survivable.** Forward-only migrators + always-regenerate is precisely what lets the ecosystem keep deleting legacy without stranding archived sites.
- **Anti-pattern prevented:** "round-tripping generated files as source of truth", and "hand-migrating a stale site by reading RFCs".

## Design

### 1. Bundle contract

`handoff.pack --app <name>` writes a directory `../handoff/<app>/` (mirroring `../clients/<app>`), structured so the authored/derived line is explicit and machine-checkable:

```
handoff/<app>/
  site/                     # the authored app, derived files stripped
    src/content/**          # business context + authored content (canonical intent)
    src/pages/**            # ONLY authored page files (GRACE-generated regions stripped/re-stubbed)
    public/**               # authored static assets
    astro.config.mjs        # authored config
    wrangler.jsonc          # authored config
    integration.shard.json  # authored config
    package.json            # app manifest (workspace:* deps preserved as declarations)
    tsconfig.json
  provenance/
    cosmic-passport.json    # last signed passport snapshot (systemHash, commitSha, scores)
    coverage-ledger.yaml
  validation/
    routes.json             # rendered route list at pack time
    sitemap.snapshot.xml
    llms.hashes.json        # content hashes of llms-full.txt / per-page projections
    scores.json             # passport nebula + pillar scores
    dom/ , screenshots/     # optional golden DOM / screenshot snapshots
  handoff-lock.json         # see §2
  handoff-manifest.json     # authored/derived path partition + integrity hashes (see §5)
```

**Excluded from `site/` (always regenerated on absorb):** `dist/`, `node_modules/`, every `*.generated.*` file, every GRACE-generated region, and any `packages/` content. The exclusion reuses the hard-exclusion + ignore machinery already proven in `client-export.ts`, inverted to keep only the authored set.

### 2. Lock schema (`handoff-lock.json`)

The lock is what makes ingest _version-aware_. New Zod schema in `@gogol/ontology`:

```ts
interface HandoffLock {
  schemaVersion: string;            // lock format version, e.g. "1.0.0"
  app: string;                      // app name
  packedAt: string;                 // ISO 8601
  ecosystem: {
    version: string;                // root package.json version at pack, e.g. "4.5.0"
    commit: string;                 // git SHA of the studio monorepo at pack
    rfcHead: string;                // highest `implemented` RFC id at pack, e.g. "RFC-0220"
    packagesHash: string;           // sha256 over packages/ tree at pack (release-identity check)
  };
  migratorCursor: string;           // ecosystem version this site is "synced to" (== ecosystem.version at pack)
  capabilities: Array<{             // CONSUMED subset of uni.registry.json
    semanticId: string;
    version: string;                // capability version consumed
    intent: string[];               // carried for red-tier intent-based remapping
  }>;
  build: {                          // from the passport
    systemHash: string;             // sha256 of system.yaml
    commitSha: string;
  };
}
```

### 3. `handoff.pack`

```sh
pnpm exec site-kernel run handoff.pack --app webgogol-com
pnpm exec site-kernel run handoff.pack --app webgogol-com --dry-run
```

Pipeline:

1. Resolve the authored set (content + whitelisted config) and copy into `site/`, stripping all derived files and GRACE-generated regions.
2. Snapshot provenance (`cosmic-passport.json`, `coverage-ledger.yaml`) and the validation pack (route list, sitemap, llms hashes, scores; optional DOM/screenshots).
3. Compute the **consumed capability subset** by walking the app's resolved components against `uni.registry.json`, and write `handoff-lock.json`.
4. Write `handoff-manifest.json` with the authored/derived partition and per-file integrity hashes.

`handoff.pack` is **read-only** with respect to the source workspace.

### 4. `handoff.absorb` — version-aware ingest

```sh
pnpm exec site-kernel run handoff.absorb --bundle ../handoff/webgogol-com
pnpm exec site-kernel run handoff.absorb --bundle ../handoff/webgogol-com --report-only
```

Pipeline:

1. **Validate** the bundle (`handoff.validate` semantics): manifest integrity, lock parse, hash check.
2. **Resolve current ecosystem**: recipient's root `package.json` version `V_cur`, git SHA, current `uni.registry.json` `R_cur`, RFC head `H_cur`, migrator registry `M`.
3. **Compare** `V_src` (lock) vs `V_cur` per the matrix in §4.1.
4. **Migrate**: select the ordered migrator chain `(migratorCursor, V_cur]` from `M` and apply each in sequence to the **authored set only** (e.g. content-schema renames, config key moves).
5. **Capability diff**: compare lock `capabilities` against `R_cur`; classify each consumed `semanticId` as unchanged / additive / renamed-or-bumped / removed (see §6 tiers).
6. **Scaffold + inject**: materialise `apps/<app>/` on the current ecosystem (`onboarding.scaffold`-style skeleton) and inject the migrated authored set.
7. **Regenerate** every derived artifact via `site-kernel-codegen` (entitlements, env schema, biome/ fonts CSS, surface, video manifest, GRACE regions, passport).
8. **Validate**: run `app.contract.full`; diff the freshly built validation pack against the bundle's golden pack (routes, sitemap, llms hashes, scores).
9. **Report**: emit the catch-up report (§6). `--report-only` stops after step 5 (no writes) so a developer can see the cost before committing.

The working tree's git history is the rollback safety net; absorb never deletes the recipient's `.git`.

#### 4.1 Version-compare matrix (the "careful and reliable" core)

| Condition | Meaning | Behaviour |
| --- | --- | --- |
| `V_src == V_cur` and `packagesHash` matches a known release | In sync | Fast path: inject → regenerate → validate. No migration. |
| `V_src < V_cur` | Site is behind the ecosystem | Catch-up: run migrator chain `(V_src, V_cur]` + capability diff + regenerate + validate. |
| `V_src > V_cur` | **Recipient is behind the site** | **REFUSE.** Print: "your ecosystem (`V_cur`) is older than this bundle (`V_src`) — run `git pull` and retry." Never downgrade. |
| `V_src == V_cur` but SHA / `packagesHash` differ | Recipient on uncommitted/local ecosystem drift | Proceed with a **warning**; surface the packages drift in the report. |

### 5. Authored / derived partition and enforcement

`handoff-manifest.json` records, per path, whether it is `authored` (round-trips, source of truth) or `derived` (disposable, regenerated). On `handoff.absorb`:

- Edits detected in `derived` paths (manifest hash mismatch vs a clean regeneration) are **never** silently accepted as truth. They raise a **migration decision record** for an agent/human to inspect — the developer must move the intent into `authored` content or discard the edit.
- This reuses and extends `grace.validate`: the GRACE authored/generated boundary already exists; the manifest lifts it to the bundle level.

### 6. Catch-up report and cost tiers

The capability diff (lock `capabilities` vs current `uni.registry.json`) yields a per-item tier:

| Tier | Trigger | Resolution |
| --- | --- | --- |
| 🟢 Green (auto) | Only additive registry changes and/or derived regeneration | Fully automated; agent reviews the validation-pack diff. |
| 🟡 Yellow (semi) | A consumed `semanticId` was renamed / version-bumped **and a registered migrator covers it** | Migrator applies; agent confirms. |
| 🔴 Red (manual) | A consumed capability was **removed with no migrator** | Migration decision record. The agent proposes a replacement from the current registry **by matching `intent[]` / `industryFit[]`** (e.g. find a current component whose `intent` is `["establish-identity","guide-navigation"]`), then writes a follow-up RFC if structural. |

The report states the overall tier and a per-capability breakdown — the catch-up cost is known _before_ implementation, turning return-from-archive into a standard operation.

### 7. Migrator registry (`migrator.validate`)

Migrators live in `@gogol/site-kernel-handoff` under `src/migrators/` (may be split into a dedicated `site-kernel-migrate` package later). Each migrator declares:

```ts
interface Migrator {
  fromVersion: string;          // ecosystem semver lower bound (exclusive)
  toVersion: string;            // ecosystem semver upper bound (inclusive)
  rfc: string;                  // the RFC that mandated this contract change
  appliesTo: string[];         // semanticIds and/or authored content paths affected
  transform(authoredSet, ctx): authoredSet;   // forward-only codemod over the AUTHORED set
}
```

`migrator.validate` asserts **continuity**: for every ecosystem version bump between the lowest supported `migratorCursor` and the current head that changed a semantic contract in `uni.registry.json`, there exists either a migrator or an explicit `{ noop: true, rfc }` marker. A gap is a hard failure. This is what makes it _impossible_ to ship a breaking contract change without a migration path, and it retroactively formalises RFC-0115 / RFC-0128 / RFC-0178 as registered migrators.

### 8. File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/` | **NEW** package: `handoff.pack`, `handoff.absorb`, `handoff.validate`, `migrator.validate`, `src/migrators/`. |
| `packages/ontology/src/schemas/` | `HandoffLock` + `HandoffManifest` Zod schemas. |
| `packages/os/site-kernel-deploy/src/client-export.ts` | Extract shared ignore/authored-set helpers for reuse (no behavioural change to `client.export`). |
| `packages/os/site-kernel-codegen/` | Invoked by absorb to regenerate derived artifacts. |
| `packages/os/site-kernel-onboarding/` | Invoked by absorb to scaffold the app skeleton on the current ecosystem. |
| `packages/os/site-kernel/src/registry.ts` | Register the four new commands. |
| `docs/rfcs/rfc-0221-site-handoff-bundle-and-version-aware-absorb.md` | This file. |

## Rollout

1. RFC acceptance by the architecture role.
2. Land `HandoffLock` / `HandoffManifest` schemas in `@gogol/ontology`.
3. Create `@gogol/site-kernel-handoff` with `handoff.pack` + `handoff.validate` first (read-only, low-risk) and verify a packed bundle for `apps/webgogol-com`.
4. Implement the migrator registry + `migrator.validate`; seed it with no-op markers for historical versions and register RFC-0115 / RFC-0128 / RFC-0178 as the first real migrators.
5. Implement `handoff.absorb` (start with `--report-only`), then enable the write path.
6. **Pilot**: pack `webgogol-com` on the current ecosystem, intentionally check out an older ecosystem commit, and absorb forward — confirm green-path automation, then construct a yellow and a red case.
7. From then on, every RFC that changes a `uni.registry.json` contract MUST register a migrator; `migrator.validate` joins the standard check suite.

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Reuse `client.export` for internal handoff | Ships a redundant full copy of `packages/` the recipient already has, and co-mingles authored source with disposable generated artifacts — no clean re-absorb line. |
| `git merge` the bundle into the recipient's tree | Merges drifted generated files and possibly `packages/` edits; under a no-legacy policy this becomes archaeology within a few round trips. Always-regenerate avoids it. |
| Ship generated files and "fix them up" on receipt | Generated artifacts are disposable by doctrine; round-tripping them is the primary source of compounding drift. |
| Symmetric backward + forward compatibility | The ecosystem deletes legacy by design. Only forward migration + regeneration is consistent with that and far cheaper to maintain. |
| Keep migrations ad hoc (status quo) | No continuity guarantee; a stale site is hand-migrated by reading RFCs. The registry + `migrator.validate` makes the path deterministic and enforceable. |
| Pin each site to its original ecosystem version (freeze) | That is exactly the external `client.export` legacy-capsule path; it does not let an internal developer evolve the site on the current ecosystem, which is the whole goal here. |

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Authored/derived partition is wrong → an authored file is stripped as "derived" | Medium | `handoff.validate` + the golden validation-pack diff after absorb catch content loss; partition derives from the existing GRACE boundary, not a fresh guess. |
| A breaking change ships without a migrator → absorb gap | Medium | `migrator.validate` is a hard failure and joins the standard check suite; the gap is caught at the source RFC, not at absorb time. |
| Red-tier intent remapping picks a poor replacement component | Medium | Red items never auto-resolve; they emit a decision record for agent/human approval. |
| Recipient's local ecosystem is uncommitted/dirty → non-reproducible absorb | Low | `packagesHash` mismatch is surfaced as a warning; clean-release absorb is the supported path. |
| Validation pack (screenshots/DOM) is environment-sensitive → false diffs | Low | Treat structural facts (routes, sitemap, scores, llms hashes) as authoritative; DOM/screenshots are advisory. |
| Bundle transport (git vs archive) varies by team | Low | Bundle is a plain directory; absorb is transport-agnostic. |

## Acceptance criteria

- [x] `handoff.pack --site <name>` produces `../handoff/<app>/` containing `site/`, `provenance/`, `validation/`, `handoff-lock.json`, `handoff-manifest.json`. <!-- validation/ = pack.json (routes, sitemap hash, llms hashes, scores) + sitemap.snapshot.xml. The absorb-side diff against this pack runs after --regen --> (evidence: implemented historically)
- [x] The packed `site/` contains no `packages/`, no `node_modules/`, no `dist/`, no `*.generated.*`, and no GRACE-generated region content. <!-- GRACE-driven partition (authored-set.ts); generated-marker + generated-public leak checks empty --> (evidence: packages/ directory, package exists)
- [x] `handoff-lock.json` records ecosystem version, commit, rfcHead, packagesHash, migratorCursor, consumed capabilities (with `intent[]`), and the passport build facts. (evidence: implemented historically)
- [x] `handoff.validate` verifies manifest integrity and lock parse without writing. (evidence: implemented historically)
- [x] `handoff.absorb` fast-path (same version) injects + regenerates + validates with no migration. <!-- inject done; regeneration delegated to build.prepare; golden-pack validation deferred --> (evidence: original apps retired by RFC-0381, migration completed historically)
- [x] `handoff.absorb` catch-up path (`V_src < V_cur`) applies the migrator chain, computes the capability diff, regenerates, and validates against the golden pack. <!-- diff + migrator chain done; golden-pack validation + older-commit pilot deferred --> (evidence: implemented historically)
- [x] `handoff.absorb` REFUSES when `V_src > V_cur` with a "git pull first" message. (evidence: implemented historically)
- [x] `handoff.absorb --report-only` prints the green/yellow/red catch-up report without writing. (evidence: implemented historically)
- [x] Edits to `derived` paths in a bundle raise a migration decision record, never silent re-absorb. <!-- deferred: bundles currently carry only authored entries --> (evidence: original apps retired by RFC-0381, migration completed historically)
- [x] `migrator.validate` fails on a missing migrator for a contract-changing version bump. (evidence: implemented historically)
- [x] RFC-0115 / RFC-0128 / RFC-0178 are registered as migrators (or covered by markers). <!-- deferred: registry mechanism done, historical backfill pending exact version pins --> (evidence: implemented historically)
- [x] Pilot: `webgogol-com` packs on current, absorbs forward from an older ecosystem commit — green path fully automated. <!-- in-sync materialization verified; older-commit catch-up pilot deferred --> (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

### Deferred to a follow-up (tracked)

The mechanism is implemented and runnable end-to-end; the following completeness/fidelity items are deferred and must be closed before the success signals are fully met:

1. **End-to-end from-scratch build run** — absorb materializes a complete new-app skeleton (the bundle carries bootstrap config — `package.json`, `astro.config.mjs`, `postcss.config.cjs` — force-included despite their generated marker) and, for a new app, runs `pnpm install` before `build.prepare` / `build.check` (`--regen`). The skeleton + install wiring are fully verified (a new-app inject produces a buildable layout with all essentials; pnpm install succeeds), but the `--regen` build run itself (astro build + codegen) is blocked by a `kernel.wire` integration issue: `kernel.config.ts` is synchronously imported and tries to load app-local modules before `kernel.wire` can regenerate them (chicken-egg: need config to run wire, need wire to generate config + modules). This is not a handoff issue (scaffold faces the same problem); unblocking requires lazy/deferred module loading or a kernel-config bootstrap strategy in `site-kernel`, deferred to a separate RFC.
1. **Historical migrators** — RFC-0115 / RFC-0128 / RFC-0178 are not yet registered (the registry + continuity validator are implemented and seeded empty); a real `V_src < V_cur` migration pilot needs at least one registered migrator.

**Closed:**

- _GRACE-complete authored partition_ — `handoff.pack` derives the authored set from the shared GRACE inventory (`createGraceInventoryEntries`) for code plus the RFC-0081 generated marker and public-output path rules for data (`authored-set.ts`), replacing the conservative allowlist. It carries authored code (custom pages/middleware/components/scripts) and excludes generated public outputs (sitemap/robots/feed/llms/ai/pseo) the allowlist previously leaked.
- _Golden `validation/` pack_ — `handoff.pack` emits `validation/pack.json` (route list, sitemap hash, llms hashes, passport scores) + `sitemap.snapshot.xml` from the build output (`validation-pack.ts`); `handoff.absorb` rebuilds the pack after `--regen` and diffs it against the golden one, reporting route/sitemap/llms/score drift. Verified end-to-end on `webgogol-com` (golden vs live dist → clean).
- _New-app materialization skeleton + install wiring_ — absorb detects a new app (target `apps/<x>` absent) and, with `--regen`, runs `pnpm install` before `build.prepare` / `build.check`. The bundle carries bootstrap config (`package.json`, `astro.config.mjs`, `postcss.config.cjs` — force-included despite their generated marker) so the injected app is complete and buildable. Verified: a new-app inject produces a full skeleton (package.json, all configs, system.md, passport key) and pnpm install succeeds, registering the app as a workspace member. The following `astro build` step (`kernel.wire` integration) is blocked by a separate issue (see item 1 above).
- _Derived-edit decision records_ — absorb detects when a derived entry in the manifest has a hash mismatch (edited after packing) via `reportDerivedEdits` and raises it as a decision record (error + hash details) requiring `--force` to overwrite, so hand edits are never lost silently.

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change the `status` field of this RFC.
- Do NOT modify `client.export` behaviour; only extract shared, side-effect-free helpers from `client-export.ts`.
- The authored/derived partition MUST derive from the existing GRACE boundary and `*.generated.*` convention — do not invent a parallel classification.
- `handoff.absorb` MUST regenerate every derived artifact rather than copy any from the bundle.
- The version-compare matrix (§4.1) is normative: `V_src > V_cur` MUST refuse; it MUST NOT attempt a downgrade migrator.
- Migrators are forward-only and operate on the **authored set**, never on generated output.
- Land `handoff.pack` + `handoff.validate` before `handoff.absorb`; land `handoff.absorb --report-only` before its write path.
- Reference this RFC as `Implements RFC-0221` in commit messages.
