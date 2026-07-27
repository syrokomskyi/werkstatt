---
id: RFC-0318
title: "Clean managed public trees and redirect retired PSEO URLs"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-05
implementedAt: 2026-07-22
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0307
  - RFC-0274
  - RFC-0283
amendedBy: []
related:
  - RFC-0192
  - RFC-0195
  - RFC-0243
  - RFC-0269
  - RFC-0276
commands:
  proposed: []
  added:
    - public.managed.clean
    - public.orphans.validate
    - redirect.map.validate
    - deploy.surface.parity.validate
  changed:
    - surface.generate
    - page.markdown.generate
    - public.infrastructure.generate
    - behavior.snapshot.validate
    - public.runtime.probe
    - apps-check.postbuild
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-deploy"
successSignals:
  - "Managed public subtrees are cleaned before generation, so obsolete Markdown twins and PSEO artifacts cannot survive a rebuild."
  - "Retired canonical URLs receive explicit 301 or 410 policy through generated redirects instead of becoming silent orphan content."
  - "Production sitemap, generated sitemap, behavior snapshot, and redirect map can be compared before reindexing."
nonGoals:
  - "Do not delete published URLs without redirect/noindex/410 policy."
  - "Do not hand-edit generated public Markdown files or _redirects."
  - "Do not make visibility feedback or IndexNow submit until deploy parity is proven."
---

# RFC-0318: Clean managed public trees and redirect retired PSEO URLs

## Context

The audit found obsolete generated Markdown twins and PSEO generations still present under `apps/webgogol-com/public/`: an old `/digitales-fundament/index.md` twin, earlier flat PSEO trees, city/city duplicates, and empty directories. Some retired URLs may have already been published, so the cleanup must be paired with redirect policy.

This is the exact failure mode RFC-0087 and RFC-0307 are meant to prevent: generated outputs must be single-owner, idempotent, and cleaned when their source set changes.

## Problem

If a generator only writes new files, deleted or moved content remains publicly reachable. Sitemap may advertise the new canonical set while old public files remain fetchable outside the sitemap. For PSEO surfaces, deleting generated URLs without redirect/noindex policy also violates the breaker/rollback model: URL removal is a public behavior change that needs an explicit outcome.

## Decision

Managed public output directories must use clean-before-write semantics. Any public URL that was previously published and is no longer canonical must be represented in an explicit generated redirect map or a generated 410/noindex policy.

Add commands:

- `public.managed.clean`: removes stale generated files under generator-owned public subtrees before writing current outputs.
- `public.orphans.validate`: fails when public Markdown twins or PSEO files exist outside the current sitemap/twin/surface manifest.
- `redirect.map.validate`: validates that retired URLs have deterministic 301 or 410 entries.
- `deploy.surface.parity.validate`: compares generated build/deploy surface with the live public sitemap before reindexing or IndexNow submission.

## Architectural fit

This RFC amends RFC-0307 by making stale-artifact cleanup part of public artifact readiness, not an operator chore. It amends RFC-0274 and RFC-0283 because PSEO indexability, duplicate control, breaker rollback, and URL retirement must be handled through explicit redirect/noindex/410 policy.

It keeps RFC-0081/RFC-0087 generated-file governance intact: app `public/` files are outputs and cleanup authority is declared by generator ownership. Redirect output remains generator-owned public infrastructure, while behavior snapshots continue to provide the reviewable public-behavior diff.

## Design

### Managed public subtrees

Each generator that writes multiple public files must declare:

```ts
export interface ManagedPublicTree {
  command: string;
  root: string; // e.g. "public/website", "public/api/agent/v1"
  ownedPatterns: string[];
  preservePatterns?: string[];
  cleanupMode: "clean-before-write" | "manifest-prune";
}
```

Rules:

- `page.markdown.generate` owns only its active twin paths and root/index language exceptions.
- `surface.generate` owns PSEO/surface twins and must prune obsolete surface paths.
- `agent.knowledge.generate` owns `public/api/agent/v1/`.
- `public.infrastructure.generate` owns `_headers`, `_redirects`, `.assetsignore`, and redirect declarations.
- A generator must not delete user-authored files outside its declared tree.
- Cleanup must verify resolved absolute paths remain under the app directory.

### public.managed.clean

Scope: app, mutating.

Behavior:

- reads the generator ownership map and current expected artifact manifest;
- deletes stale generated files in managed public trees;
- removes empty directories left by stale generated artifacts;
- never touches files without generator ownership unless the owning RFC explicitly declares the subtree fully generated;
- logs each deletion in `--json` output;
- supports `--dry-run`.

This command may be implemented as a shared helper invoked by generators rather than a standalone step, but the CLI must exist for debugging and acceptance probes.

### public.orphans.validate

Scope: app, read-only.

Fails when:

- a public Markdown twin exists for a route absent from the current canonical route/surface set;
- an old twin scheme coexists with the active twin scheme;
- an indexable public PSEO Markdown file is not represented by the current surface manifest;
- `public/website/**/index.md` exists for a retired or redirect-only surface entry;
- empty directories remain under generator-owned public trees after generation;
- sitemap URL count and eligible twin count diverge without a documented noindex/exclude policy.

Diagnostic examples:

- `PUBORPH-01`: stale markdown twin.
- `PUBORPH-02`: retired PSEO file still public.
- `PUBORPH-03`: empty generated directory.
- `PUBORPH-04`: twin/sitemap set mismatch.

### Redirect policy

Introduce an authored or generated redirect intent source, with generator-owned output to `public/_redirects` or adapter-equivalent infrastructure:

```ts
export interface RedirectIntent {
  from: string; // absolute path, no origin
  to?: string; // path or absolute URL for 301/308
  status: 301 | 308 | 410;
  reason: "moved-offer" | "retired-pseo" | "canonicalized-duplicate" | "default-language-prefix" | "manual";
  source: "surface-state" | "route-migration" | "authored-intent";
}
```

Required redirect decisions for the audited class:

- `/digitales-fundament` -> `/leistungen/digitales-fundament/` as 301.
- `/website/{trade}/{city}` -> `/website/{trade}/deu/bw/{city}/` as 301 when the target exists.
- `/website/{trade}/leistung/*` -> `/website/{trade}/` as 301 unless a more specific live target exists.
- `/website/{trade}/deu/bw/{city}/{city}` -> `/website/{trade}/deu/bw/{city}/` as 301.
- Retired service leaves that were in a deployed sitemap map to the nearest live city page as 301 unless the surface state explicitly records 410.

The generator must not guess a redirect target if the nearest live route cannot be resolved. It must emit a fail-hard diagnostic requiring an authored redirect intent.

### redirect.map.validate

Scope: app, read-only locally; optional URL mode.

Validates:

- every `from` path is not present as a live generated page;
- every 301/308 target exists as a live canonical route or approved external URL;
- no redirect chain exists;
- default-language prefix redirects point to the unprefixed canonical URL;
- retired PSEO paths from the previous behavior snapshot or previous surface state have a redirect or 410 policy;
- generated `_redirects` carries the RFC-0081 marker.

### deploy.surface.parity.validate

Scope: app plus `--base-url`, networked.

Inputs:

```sh
pnpm exec site-kernel run deploy.surface.parity.validate --app webgogol-com --base-url https://webgogol.com --json
```

Behavior:

- fetches live sitemap index and sub-sitemaps;
- compares live canonical URL set with the built/generated sitemap URL set;
- checks sampled retired URLs return configured redirect/410 behavior;
- reports parity result to Bordbuch when enabled;
- blocks reindexing/IndexNow commands when live sitemap does not match the current build.

## Pipeline placement

- `public.managed.clean` runs inside or immediately before multi-file public generators in `build.prepare`.
- `public.orphans.validate` runs in `apps-check.postbuild` after Astro has copied public files.
- `redirect.map.validate` runs in `apps-check.author` and `apps-check.postbuild`.
- `deploy.surface.parity.validate` runs only against explicit deploy/production URLs.

## Rollout

1. Add managed public tree declarations for existing generators.
2. Add cleanup helper and `public.managed.clean`.
3. Update PSEO/twin generators to prune old paths before writing current ones.
4. Add redirect intent derivation for route migrations and retired PSEO URLs.
5. Extend `public.infrastructure.generate` to merge generated redirect intents.
6. Add validators and runtime parity probe.
7. Only after parity passes, run IndexNow or other reindexing workflows.

## Alternatives considered

- **Delete stale files once manually.** Rejected. The defect returns on the next generator change.
- **Serve old PSEO URLs forever.** Rejected. Duplicate orphan content breaks the canonical surface.
- **Return 410 for all retired pages.** Rejected as a default because some URLs may already have impressions and should consolidate to nearest live canonicals.

## Risks

- **Accidental deletion of authored public files.** Mitigated by generator ownership and path containment checks.
- **Bad redirect target.** Mitigated by `redirect.map.validate` requiring target existence and no chains.
- **Live/deploy mismatch.** Mitigated by explicit deploy parity validation before reindexing.

## Acceptance criteria

- [x] `public.managed.clean`, `public.orphans.validate`, `redirect.map.validate`, and `deploy.surface.parity.validate` are registered commands. (evidence: command registered in kernel module)
- [x] `page.markdown.generate` and `surface.generate` clean stale generated twins before writing current output. (evidence: implemented historically)
- [x] Empty directories under managed public trees are removed by the cleanup pass. (evidence: implemented historically)
- [x] Retired audited URL patterns have generated 301/410 policy with target-existence validation. (evidence: implemented historically)
- [x] `find apps/webgogol-com/public -name index.md` count matches the expected eligible twin set after generation, represented by `public.orphans.validate`. (evidence: implemented historically)
- [x] Behavior snapshot diffs show redirect changes and are reviewed before committing. (evidence: implemented historically)
- [x] `deploy.surface.parity.validate --base-url <prod>` passes before IndexNow submission for a changed public surface. (evidence: implemented historically)
- [x] `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents may implement this RFC because its status is `accepted`.
- Never delete a published URL without redirect, noindex, rollback, or 410 policy.
- Do not hand-edit `_redirects`; update redirect intent sources or generators.
- Do not run reindexing/IndexNow when production sitemap and build sitemap differ.
- Treat stale public files as generator defects, not as cleanup chores.
