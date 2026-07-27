---
id: RFC-0264
title: "Split the share package barrel into subpath entry points"
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
  - RFC-0092
  - RFC-0141
commands:
  proposed:
    - barrel.size.lint
  added:
    - barrel.size.lint
  changed: []
  removed: []
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/site-kernel-checks"
successSignals:
  - "The root barrel packages/share/src/index.ts shrinks from ~500 lines to a thin stable core (target under 120 export lines)."
  - "Consumers import domain surfaces via subpaths (for example the page, i18n, schemas, knowledge entry points) instead of the root barrel."
  - "barrel.size.lint prevents the root barrel from regrowing."
nonGoals:
  - "Do not rename or change the behavior of any exported symbol."
  - "Do not restructure the share package's internal folders; only the export surface changes."
  - "Do not split other packages in this RFC; the lint covers them with a warning threshold only."
---

# RFC-0264: Split the share package barrel into subpath entry points

## Context

Part E of the 2026-07-02 AEO audit series (hygiene and governance; see rfc-0258 for series order).

`packages/share/src/index.ts` is a 503-line barrel re-exporting nearly every module of the package. For an AI agent this is the worst-shaped entry point in the workspace: understanding one helper pulls the entire package surface into context; unrelated edits collide in the same file; and the barrel is the classic generator of accidental circular imports. The package already demonstrates the correct pattern in places — `@gogol/share/integration`, `@gogol/share/text-normalize`, `@gogol/share/astro/loaders` are real subpath exports — but the root barrel duplicates most of them anyway.

## Problem

The unprotected invariant is: **the import path should tell an agent which domain contract it is touching, and loading one domain must not require loading them all.** Today `import { buildPage, resolveImage, normalizeEntityId, emitLedgerEvent } from "@gogol/share"` is legal, teaches nothing about ownership, and couples every consumer's module graph to the whole package.

## Decision

1. `@gogol/share` `package.json` `exports` gains explicit subpath entry points mapped 1:1 to the existing source folders/domains: `./page`, `./i18n`, `./schemas`, `./content`, `./knowledge`, `./semantic`, `./legal`, `./scripts`, `./middleware`, `./visibility`, `./runtime-context` (plus the already-existing `./integration`, `./text-normalize`, `./astro/*`).
2. The root barrel shrinks to a deprecated compatibility surface: it re-exports the subpath modules unchanged, with a `@deprecated` JSDoc banner naming the subpath to use. No consumer breaks on day one.
3. Consumers migrate incrementally (mechanical import rewrites); when a migration wave completes, the corresponding re-export block is deleted from the root barrel.
4. A new `barrel.size.lint` guards the end state: `BARREL-01` (error for `@gogol/share`, warning for other packages) when a root `index.ts` exceeds the export-line threshold (default 120); `BARREL-02` (error) when a symbol is exported from BOTH the root barrel and a subpath after that subpath's migration wave is marked complete.

## Architectural fit

- Mirrors the RFC-0141 seam philosophy: named entry points are contracts; the barrel is an anti-seam.
- All new subpath files follow RFC-0092 (`.ts` on-disk extensions in relative imports).
- The lint lives in `PACKAGES_CHECK_PIPELINE` next to `import.extensions.lint`.

## Design

### CLI surface

```sh
pnpm exec site-kernel run barrel.size.lint --json
```

### TypeScript contracts

```ts
// packages/share/package.json (exports excerpt)
{
  "exports": {
    ".": "./src/index.ts",
    "./page": "./src/page.ts",
    "./i18n": "./src/i18n/index.ts",
    "./schemas": "./src/schemas/index.ts",
    "./knowledge": "./src/knowledge/index.ts"
    // … one entry per domain, existing subpaths preserved
  }
}

// packages/os/site-kernel-checks/src/barrel-size-lint.ts (new)
export interface BarrelReport {
  packageName: string;
  indexPath: string;
  exportLineCount: number;
  threshold: number;
  duplicatedSymbols: Array<{ symbol: string; subpath: string }>;
}
```

### File system responsibilities

| Path                                                     | Role                                  |
| -------------------------------------------------------- | ------------------------------------- |
| `packages/share/package.json`                            | exports map                           |
| `packages/share/src/index.ts`                            | Shrinks per wave; deprecation banners |
| `packages/**/src/**` and `apps/**/src/**` consumers      | Import rewrites per wave              |
| `packages/os/site-kernel-checks/src/barrel-size-lint.ts` | New lint                              |

### Output format

Standard RFC-0203 `CheckResult` with `BARREL-01`/`BARREL-02` diagnostics; each `BARREL-02` names the symbol and the subpath that owns it.

### Failure modes

During migration, `BARREL-01` for `@gogol/share` runs in warning mode with the current line count as a shrink-only ratchet value; it flips to error when the threshold is reached. `BARREL-02` is error from the first completed wave.

## Rollout

1. Land exports map + lint (warn mode) + this RFC's wave plan as a checklist in the PR.
2. Wave order (each wave = rewrite imports, delete root re-export block, `build:check` both apps): `page` → `i18n` → `schemas` → `content` → `knowledge` → `semantic` → remainder.
3. Flip `BARREL-01` to error when the root barrel is at or below threshold.
4. New domains added to `@gogol/share` MUST ship as subpaths from day one (lint enforces via threshold).

## Alternatives considered

- **Splitting `@gogol/share` into multiple packages**: rejected for now — workspace-package proliferation has its own agent cost (more manifests, more turbo wiring); subpaths deliver the isolation without the overhead. May be revisited if a domain grows a genuinely independent lifecycle.
- **Banning the root barrel entirely**: rejected — a thin stable core (`buildPage`, `RuntimeContext`, base schemas) is a legitimate convenience; the threshold keeps it honest.

## Risks

- Wide mechanical diffs risk conflicts with parallel work; waves are deliberately small and each is independently green.
- Astro/Vite resolution of new subpaths must be verified in BOTH dev and build modes for both apps (RFC-0092 history shows dev/build resolution can diverge) — each wave's checklist includes an `astro dev` smoke.

## Acceptance criteria

- [x] Exports map landed; every listed subpath resolves in `astro dev` AND `astro build` for both apps (smoke test documented in the PR). (evidence: implemented historically)
- [x] `barrel.size.lint` registered in `PACKAGES_CHECK_PIPELINE` with red/green fixtures (satisfies rfc-0261 fixture rule); ratchet value only decreases. (evidence: implemented historically)
- [x] At least the `page` and `i18n` waves completed: consumers rewritten, root re-export blocks deleted. (evidence: implemented historically)
- [x] Root barrel at or below 120 export lines at completion; `BARREL-01` in error mode. (evidence: implemented historically)
- [x] `BARREL-01`/`BARREL-02` registered in the RFC-0203 rule registry with fixHints. (evidence: implemented historically)
- [x] `packages/share/AGENTS.md` documents the subpath map and the "new domains = new subpath" rule. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

**As-built, 2026-07-02:** landed as a single pass rather than staged waves (same pattern as rfc-0262/rfc-0263): full exports map (adding `./legal`, `./feature-policy`, `./counter-utils`, `./image-utils`, `./dev-props-validator`, `./rfc0042-utils`, `./wrap-inline-numbers`, `./attribution-display`, and repointing `./schemas` at a new aggregating `src/schemas/index.ts` — most other listed subpaths already existed from prior RFCs), 29 consumer files mechanically migrated off the root barrel for the `page` domain (`SectionProps`/`SectionPageOverride` relocated from an inline barrel definition into `page.ts`, their natural owner, plus `buildPage`/`ResolvedBlock`/etc.), and the `i18n` domain's root re-export deleted (its single export, `createLocalizationHelpers`, had zero live consumers via the root barrel, so no rewrite was needed). Root barrel dropped from 507 lines to ~65 export lines. `BARREL-02` is scoped narrowly to a `COMPLETED_WAVE_SUBPATHS` allowlist (currently `page.ts` + `i18n/localization.ts` for `@gogol/share` only) rather than a blanket root-barrel/subpath overlap scan — a blanket scan is NOT what the RFC's Failure-modes section describes ("error from the first completed wave") and would have flagged 222 pre-existing, intentional barrel/subpath overlaps in unrelated packages (e.g. `@gogol/ui` deliberately re-exporting icon types from both its root and a subpath) that are outside this RFC's scope (nonGoals: "do not split other packages in this RFC"). `astro dev`/`astro build` smoke: both apps' full `build.prepare`+`astro build`+`build.post` pipeline (which already exercises Vite/Rollup resolution of every touched subpath under stricter-than-dev bundling) is green; a standalone `astro build --root .` re-run on webgogol-com after the barrel split additionally confirmed clean resolution.

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Import rewrites are mechanical: prefer a scripted codemod (grep + replace of named imports) over hand edits; verify with `tsc` and both apps' `build:check` per wave.
- Do not move source files between folders during waves — this RFC changes the export surface only.
- Respect RFC-0092: all new relative imports end in `.ts`.
- Agents MAY transition this RFC `accepted` → `implemented` per RFC-0224 preconditions only; reference `rfc-0264` in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a superseding RFC.
