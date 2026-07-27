---
id: RFC-0269
title: "Emit a golden behavior snapshot per app"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-01
updatedAt: 2026-07-02
implementedAt: 2026-07-02
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0163
  - RFC-0220
  - RFC-0221
  - RFC-0229
  - RFC-0233
commands:
  proposed:
    - behavior.snapshot.generate
    - behavior.snapshot.validate
  added:
    - behavior.snapshot.generate
    - behavior.snapshot.validate
  changed: []
  removed: []
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel-checks"
successSignals:
  - "Every PR that changes an app's public behavior shows a structured, reviewable diff of the committed behavior snapshot — routes, meta, JSON-LD graph shape, hreflang, headers."
  - "An unintended public-surface regression (dropped meta tag, lost JSON-LD node, vanished route) fails behavior.snapshot.validate instead of shipping silently."
  - "Visual-less agents gain a deterministic answer to: what did my change do to the site?"
nonGoals:
  - "Do not snapshot rendered pixel output or full HTML — only the structured public-behavior surface."
  - "Do not replace seo.structured-data.validate or other semantic validators; the snapshot detects CHANGE, validators judge CORRECTNESS."
  - "Do not store per-build volatile data (timings, hashes of hashed assets) in the snapshot."
---

# RFC-0269: Emit a golden behavior snapshot per app

## Context

Part E of the 2026-07-02 AEO audit series (governance and verification; see rfc-0258 for series order).

Agents operating this platform cannot see pages. Their existing "eyes" are validators (correctness gates) and RFC-0221's `validation/pack.json` (routes/sitemap/llms/scores emitted during handoff packing). What is missing is a per-change, review-oriented answer to "what changed on the public surface?": validators stay green through many silent behavioral changes (a reworded description, a dropped OG tag that no validator owns, a route disappearing from one locale), and the RFC-0221 pack only exists at handoff time.

The workspace already trusts the pattern this RFC generalizes: commit a deterministic generated projection, drift-guard it in the build (`funnel.statechart.generate`/`validate`, `docs/ecosystem.generated.json`).

## Problem

The unprotected invariant is: **a change to an app's public behavior must be visible in review as a structured diff.** Today it is visible only as (possibly huge) dist HTML changes nobody diffs, so unintended regressions ride along with intended edits — the exact class that produced the silent iOS video regression (RFC-0234) and the fade-on-last-section bug (RFC-0233), both caught late by humans looking at screens.

## Decision

1. A new app-scoped `behavior.snapshot.generate` reads the built `dist/` in `build.post` and writes `apps/<app>/behavior.snapshot.generated.json` — deterministic (`generatedAt: null`, `contentHash`, sorted keys), marker-carrying, committed to git.
2. Per route, the snapshot records: `title`, `metaDescription`, `canonical`, `hreflang` set, OG/Twitter meta (name→content), JSON-LD graph summary (sorted `@type` list plus per-node stable key fields: `@type` + `name`/`url`), breadcrumb depth, robots meta, sitemap membership, llms.txt membership, markdown-twin presence. Globals: `_headers` rules, redirect map, route count per locale.
3. Volatile values are normalized: Astro-hashed asset URLs (`/_astro/name.<hash>.ext`) are replaced with `/_astro/name.<HASH>.ext` placeholders; nothing time- or build-dependent enters the file.
4. A new `behavior.snapshot.validate` (in `apps-check.postbuild`) regenerates in-memory and fails on drift against the committed file (`SNAP-01`), with the diff summarized per route in the diagnostics.

## Architectural fit

- Generalizes RFC-0221's `validation/pack.json` from handoff-time to every build; the handoff pack SHOULD consume the snapshot instead of recomputing (follow-up noted in Rollout).
- Reading `dist/` in `build.post` follows the established postbuild-audit precedent (`consent.activation.validate`); writing goes into the app tree, respecting RFC-0049.
- Complements RFC-0233 visual contracts: VIS-\* rules judge presentation heuristics; SNAP-01 detects any structured-surface change, intended or not.

## Design

### CLI surface

```sh
pnpm exec site-kernel run behavior.snapshot.generate --app webgogol-com
pnpm exec site-kernel run behavior.snapshot.validate --app webgogol-com --json
```

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/behavior-snapshot.ts (new)
export interface RouteBehavior {
  route: string;                     // "/de/projekte/"
  lang: string;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  hreflang: Record<string, string>;  // lang → href
  og: Record<string, string>;
  twitter: Record<string, string>;
  jsonld: Array<{ type: string; name?: string; url?: string }>;
  breadcrumbDepth: number | null;
  robotsMeta: string | null;
  inSitemap: boolean;
  hasMarkdownTwin: boolean;
}
export interface BehaviorSnapshot {
  generatedMarker: string;
  meta: { schemaVersion: 1; deterministic: true; generatedAt: null; contentHash: string };
  app: string;
  routes: RouteBehavior[];           // sorted by route
  headers: string[];                 // normalized _headers lines
  redirects: string[];
}
```

HTML parsing uses the same parser already employed by the dist-auditing postbuild checks (no new dependency).

### File system responsibilities

| Path                                                      | Role                               |
| --------------------------------------------------------- | ---------------------------------- |
| `apps/<app>/behavior.snapshot.generated.json`             | Committed golden snapshot (marker) |
| `apps/<app>/dist/**`                                      | Read-only input during build.post  |
| `packages/os/site-kernel-checks/src/behavior-snapshot.ts` | Generator + validator              |

### Output format

`behavior.snapshot.validate` emits standard `CheckResult`. `SNAP-01` (error): drift, one diagnostic per changed route with an added/removed/changed field summary and the fixHint "review the diff; if intended, run behavior.snapshot.generate and commit the updated snapshot with your change".

### Failure modes

Exit 1 on drift or on a missing committed snapshot (`SNAP-02`, error, fixHint = generate + commit). When `dist/` is absent the command fails with a clear "run the build first" message (postbuild placement makes this unreachable in pipelines).

## Rollout

1. Land generator + validator + fixtures; generate and commit initial snapshots for both apps in the same PR (that PR's diff IS the format review).
2. Wire `generate` into `build.post` (after Astro build) and `validate` into `apps-check.postbuild`.
3. Working discipline (added to `AGENTS.md`): a PR changing the snapshot must state in its description which routes changed intentionally.
4. Follow-up (separate change, noted not gated): RFC-0221 `handoff.pack` consumes the snapshot for its `validation/pack.json` routes section.

## Alternatives considered

- **Full-HTML golden files**: rejected — megabytes of noise, hash churn, unreviewable diffs; the structured projection is the reviewable core.
- **CI-only comparison against the base branch (no committed file)**: rejected — requires building both branches in CI (slow) and gives local agents nothing; the committed-projection pattern is already the house style.
- **Extending seo.structured-data.validate to cover everything**: rejected — a correctness validator encodes what MUST be; the snapshot detects what CHANGED, including things no rule owns yet.

## Risks

- Snapshot churn on intentional content edits creates commit noise; contained by normalization (no prose bodies — only title/description/meta) and by the per-route diff summary keeping review cheap.
- Normalization gaps (a volatile value not yet normalized) cause flaky drift; the determinism acceptance test (two builds → identical snapshot) is the gate for every field added later.
- Two apps × ~50 routes keeps files small today; PSEO growth (RFC-0192+) could inflate them — `schemaVersion` allows a future sharded format.

## Acceptance criteria

- [x] Fixture tests written BEFORE implementation: fixture dist → expected snapshot (golden); dropped meta tag in fixture → `SNAP-01` naming route and field; missing committed snapshot → `SNAP-02`. (evidence: implemented historically)
- [x] Determinism proof: two consecutive full builds of the same tree produce byte-identical snapshots for both apps. (evidence: implemented historically)
- [x] Snapshots committed for both apps; `generate` in `build.post`, `validate` in `apps-check.postbuild`. (evidence: implemented historically)
- [x] Asset-hash normalization verified: rebuilding after a CSS-only change produces zero snapshot diff. (evidence: implemented historically)
- [x] `SNAP-01`/`SNAP-02` registered in the rule registry with fixHints; red/green fixtures satisfy rfc-0261. (evidence: implemented historically)
- [x] `AGENTS.md` documents the snapshot-diff review discipline. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

**As-built, 2026-07-02:** `validate` runs BEFORE `generate` inside `build.post` (not after, as a literal reading of "wire generate into build.post... and validate into apps-check.postbuild" might suggest) — `APPS_CHECK_POSTBUILD_PIPELINE` (which now includes `behavior.snapshot.validate`) is spread into `APPS_BUILD_POST_PIPELINE` BEFORE the new `behavior.snapshot.generate` step. This ordering is load-bearing: `generate` overwrites the working-tree snapshot file, so if it ran first, `validate` would diff the fresh build against a same-run copy of itself and never detect drift — the ordering makes `validate` compare against the git-committed file left over from the previous commit, then `generate` refreshes the working tree for the next commit (which only enters history if reviewed and committed). HTML extraction is regex-based (title/meta/canonical/hreflang/OG/Twitter/robots/JSON-LD), matching the existing house style in `audit-validators.ts`/`consent.ts` rather than adding an HTML-parser dependency. Verified end-to-end against real dist output for both apps: webgogol-com (176 routes) and nicaragua-projekt (39 routes); two full rebuilds of each produced byte-identical committed snapshots (determinism proof, includes Astro-hashed asset URLs normalizing correctly). Initial snapshots committed in the same commit as this implementation, per Rollout step 1 — this PR's diff over the two `behavior.snapshot.generated.json` files IS the format review.

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- NEVER regenerate-and-commit the snapshot to silence `SNAP-01` without reading the diff — the entire value of this contract is that snapshot changes are reviewed changes. If a diff you did not intend appears, treat it as a defect in your change.
- Keep every recorded field normalized and deterministic; when adding a field, add its determinism fixture in the same commit.
- Agents MAY transition this RFC `accepted` → `implemented` per RFC-0224 preconditions only; reference `rfc-0269` in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a superseding RFC.
