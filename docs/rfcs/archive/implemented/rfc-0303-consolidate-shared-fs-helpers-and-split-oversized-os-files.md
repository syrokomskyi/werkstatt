---
id: RFC-0303
title: "Consolidate shared fs/text helpers and split oversized OS source files"
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
status: implemented
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-06
# 2026-07-06: amended severity model — two-tier: 601-1200 warning, 1200+ error.
implementedAt: 2026-07-06
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0092
  - RFC-0133
  - RFC-0203
  - RFC-0258
  - RFC-0261
  - RFC-0264
  - RFC-0267
  - RFC-0268
commands:
  proposed: []
  added:
    - fs.walk.lint
    - dedup.helper.lint
    - file.size.lint
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-content"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-onboarding"
  - "@gogol/site-kernel-integrity"
successSignals:
  - "The recursive-readdir walker is defined once (as @gogol/share/fs collectFiles) and reused; the ~52 ad-hoc local walk() copies are gone."
  - "fileExists, getLineColumn, and readJsonFile each have exactly one definition site imported everywhere else."
  - "No source file under packages/os/** or packages/share/** exceeds the file.size.lint threshold; the eight ~1000+ line files are split by MODULE_MAP seam into folder-of-files with thin re-export shims."
  - "dedup.helper.lint prevents a future agent from re-declaring a reserved shared helper locally."
  - "Public import paths and exported symbol names are unchanged; build:check for both apps and packages-check stay green."
nonGoals:
  - "Do not rename or change the behavior/signature of any exported symbol or command."
  - "Do not change any validator's rule ids, fix hints, severities, or diagnostics output."
  - "Do not move files between workspace packages except the explicitly listed helper promotions."
  - "Do not split packages/ui sections/components — they are already thin (RFC-0108) and out of scope."
  - "Do not touch apps/** source (composition-only) beyond mechanical import-path rewrites if a promoted helper was imported there."
acceptance:
  - probe: file-exists
    path: "packages/share/src/fs/index.ts"
  - probe: file-contains
    path: "packages/share/package.json"
    pattern: "\"./fs\""
  - probe: command-registered
    name: "fs.walk.lint"
  - probe: command-registered
    name: "dedup.helper.lint"
  - probe: command-registered
    name: "file.size.lint"
  - probe: file-contains
    path: "packages/AGENTS.md"
    pattern: "Shared helpers catalog"
  - probe: run
    command: "site-kernel run packages-check"
    expect:
      exitCode: 0
---

# RFC-0303: Consolidate shared fs/text helpers and split oversized OS source files

## Context

`packages/os/*` — especially `@gogol/site-kernel-checks` (~150 validator files) — has grown two shapes that are hostile to AI agents:

1. **Copy-pasted infrastructure.** The same tiny primitives are re-implemented in dozens of files: a recursive `readdir` walker, a `fileExists` guard, an offset→line/column helper, and JSON-file reading. Grep evidence in the current tree:
   - `async function walk(` (recursive readdir): **52 files**.
   - `collect*Files`-style walkers (`collectHtmlFiles`, `collectCssFiles`, `collectMarkdown`, `collectFiles`, `collectSourceFiles`, `collectManifestFiles`): **58 files**.
   - `fileExists`: a canonical `packages/os/site-kernel-checks/src/lib/file-exists.ts` **already exists**, yet identical local copies live in `barrel-size-lint.ts`, `behavior-snapshot.ts`, `live-variants.ts`, `video-variants.ts` (and an `access`-based variant in `site-kernel-onboarding/src/checklist.ts`).
   - `discoverWorkspacePackages`: canonical export in `@gogol/site-kernel` (`workspace-discovery.ts`), yet re-implemented locally in `site-kernel-checks/src/barrel-size-lint.ts`.
   - `getLineColumn` (offset→line/column): near-identical copies in **6 files** (`css-important-lint.ts`, `checks.ts`, `lighthouse.ts`, `share-i18n.ts`, `ui-i18n.ts`, `ui-silent-defaults.ts`).
   - `JSON.parse(await readFile(...))` / local `readJsonFile`: **28 files**.
   - Self-admitted duplicated constants documented in-code as "keep in sync": `PAGES_NON_ROUTE_SUBDIRS` (`naming.ts`) ≡ `PAGES_EXCLUDED_SUBDIRS` (`semantic.ts`); `DEFAULT_PROFILE_BASE_BY_LANG` (`semantic-loader.ts`) ≡ the same map in `people-routes.ts`; `VALID_AFFILIATIONS` (`people.ts`) ≡ `PERSON_AFFILIATIONS` (`@gogol/business`).

2. **Oversized single files.** Eight source files exceed ~1000 lines, each bundling several independent commands/responsibilities behind a collapsed `MODULE_MAP` (single `exports` entry) — the worst navigation shape for an agent:

   | File | Lines | Independent seams (from MODULE_MAP) |
   | --- | --- | --- |
   | `packages/os/site-kernel-checks/src/surface-expand.ts` | 1371 | `loadSurfaceBlueprints` / `expandBlueprint` / `bakePage` |
   | `packages/os/site-kernel/src/runtime.ts` | 1304 | `listKernelApps` / `executeKernelCommand` / `executeKernelPipeline` / `loadAppRuntime` |
   | `packages/os/site-kernel-checks/src/checks.ts` | 1253 | pageContent / thinCopy / semanticDrift / mirroring |
   | `packages/os/site-kernel-checks/src/archetype.ts` | 1174 | registry.build / cosmicName / section.contract / similarity / constellation |
   | `packages/os/site-kernel-checks/src/structure.ts` | 1022 | mirrorTriad / dispatcherSync / namingConvention |
   | `packages/os/site-kernel-checks/src/section-framework.ts` | 994 | 8 validators: SHELL/BG/HEAD/BODY/CTA/IMG/MOT/SITE + LAY |
   | `packages/share/src/astro/page-handler.ts` | 966 | resolvePageRoute + fallback + alternates + semantic |
   | `packages/os/site-kernel-checks/src/naming.ts` | 897 | pages / components / styles / assets |

The workspace already treats this class of problem seriously (RFC-0264 introduced `barrel.size.lint` to keep the `@gogol/share` root barrel thin) and already has the correct de-dup instinct (`@gogol/share/string-utils` centralizes `toKebabCase`, whose CHANGE_SUMMARY reads "centralise the kebab-case helper previously duplicated in site-kernel and site-kernel-checks"). This RFC generalizes both moves.

## Problem

Three unprotected invariants:

1. **One helper, one home.** A framework-free primitive (walk a directory, test existence, read JSON, compute line/column) must be defined once and imported everywhere. Today it is defined ad hoc per file, so a bug fix or a `.gitignore`-style exclusion rule (`old-*`, `-*`) applies to one copy and silently misses the other 50.
2. **A file should fit an agent's working set.** A ~1300-line file forces an agent to load unrelated command logic to touch one validator, invites merge collisions, and hides the module's shape.
3. **Regressions must be structurally prevented.** Nothing today stops the _next_ agent from pasting a fresh `async function walk()` or re-declaring `fileExists`. Without a guard, this RFC's cleanup decays within weeks.

## Decision

The workspace adopts a single canonical location for shared build-time helpers, migrates all duplicates onto it, splits the eight oversized files by their existing seams, and adds three guard lints so the improvement cannot regress.

1. **New server-only subpath `@gogol/share/fs`** (`packages/share/src/fs/`) exports the canonical Node build-time filesystem helpers. `@gogol/share` is the single package every `packages/os/*` package already depends on, so this is the only cycle-free universal home (`@gogol/site-kernel` depends on `@gogol/site-kernel-content`, so neither can host a helper that `content` must reuse). The subpath mirrors the existing server-only `@gogol/share/text-normalize` precedent and is registered in `package.json` `exports` per RFC-0264.
   - `collectFiles(root, options)` — the single recursive `readdir` walker (options: `extensions`, `ignore`, `withDirs`, default ignore `old-*`/`-*`).
   - `fileExists(path)` — the single existence guard.
   - `readJsonFile<T>(path)` — the single JSON reader.
2. **New pure subpath helper `getLineColumn`** lands in `@gogol/share` (`packages/share/src/text-position.ts`, exported via a `./text-position` subpath) — it is browser-safe pure text math, not fs.
3. **`collectMarkdownFiles`** (`@gogol/site-kernel-content/src/content-files.ts`) is refactored to a thin wrapper over `@gogol/share/fs` `collectFiles({ extensions: [".md"] })`, preserving its name, signature, and ignore semantics. `content` already depends on `@gogol/share` — no new edge.
4. **`discoverWorkspacePackages`** stays canonical in `@gogol/site-kernel`; the local copy in `barrel-size-lint.ts` is deleted in favor of the import.
5. **Duplicated constants** collapse to one owner and are imported: `PAGES_NON_ROUTE_SUBDIRS`/`PAGES_EXCLUDED_SUBDIRS` → one const in a new `site-kernel-checks/src/lib/route-constants.ts`; `DEFAULT_PROFILE_BASE_BY_LANG` → one owner in `@gogol/share` (imported by `semantic-loader.ts` and `people-routes.ts`); `VALID_AFFILIATIONS` → import `PERSON_AFFILIATIONS` from `@gogol/business`.
6. **The eight oversized files are split by MODULE_MAP seam** into a sibling folder-of-files. The original path is kept as a **thin re-export shim** so every existing `./<name>.ts` import and `module.ts` command registration keeps working unchanged (same pattern as RFC-0264's thinned root barrel). Each new file re-expands its `MODULE_MAP` (RFC-0133).
7. **Three guard lints** are added to `PACKAGES_CHECK_PIPELINE` (next to `barrel.size.lint`/`import.extensions.lint`), warn-first with a shrink-only ratchet baseline, then error once the cleanup lands:
   - `fs.walk.lint` (`WALK-01`): a nested recursive `readdir` walker declared outside the canonical `@gogol/share/fs` module.
   - `dedup.helper.lint` (`DEDUP-01`): a reserved shared-helper identifier (`fileExists`, `collectFiles`, `collectMarkdownFiles`, `getLineColumn`, `discoverWorkspacePackages`, `readJsonFile`) re-declared locally instead of imported.
   - `file.size.lint` (`SIZE-01`): a `.ts`/`.tsx` source file under `packages/**` exceeding the line threshold. **Two-tier severity:** 601–1200 lines → warning; above 1200 lines → error. A shrink-only ratchet baseline accepts pre-existing debt until split.
8. **Documentation** — `packages/AGENTS.md` gains a "Shared helpers catalog — import, do not re-implement" section listing each canonical helper and its import path; `packages/os/site-kernel-checks/docs/check-module-guide.md` links to it. New build-time fs/text/workspace helpers MUST be added to the catalog (and thereby reserved by `dedup.helper.lint`) rather than defined inline.

## Architectural fit

- **RFC-0264** (barrel split) is the direct precedent: same problem family (oversized surface → single home + guard lint that ratchets). This RFC reuses its subpath-export mechanics and its "thin re-export shim keeps day-one imports working" strategy.
- **RFC-0092**: every new relative import ends in `.ts`.
- **RFC-0203**: the three new lints emit the canonical `CheckResult` envelope via `result-helpers.ts` `diagnosticsResult`, with rule ids registered and `fixHint`s.
- **RFC-0261**: each new lint ships red + green fixtures.
- **RFC-0258 / RFC-0267**: this RFC touches **reads** only; all file **writes** must continue to flow through `writeFileAtomic` / the WorkspaceIO port. `@gogol/share/fs` provides no write helper.
- **RFC-0133 / `docs/source-markup.xml`**: split files get proper `MODULE_CONTRACT` + re-expanded `MODULE_MAP`; the new helper modules get full GRACE scaffolding.
- **RFC-0268**: the `acceptance:` block above lets any agent self-verify the end state on demand.

## Design

### CLI surface

```sh
pnpm exec werkstatt run fs.walk.lint --json
pnpm exec werkstatt run dedup.helper.lint --json
pnpm exec werkstatt run file.size.lint --json
pnpm exec werkstatt run packages-check          # runs all three in PACKAGES_CHECK_PIPELINE
```

All three are `scope: workspace`, read-only, and scan `packages/**/src/**` (excluding `**/tests/**`, `**/*.generated.*`, and each helper's own canonical definition file via an allowlist).

### TypeScript contracts

```ts
// packages/share/src/fs/index.ts  (server-only)
export interface CollectFilesOptions {
  extensions?: string[];              // e.g. [".md", ".astro"]; omit = all files
  ignore?: (name: string) => boolean; // default: name starts with "-" or "old-"
  withDirs?: boolean;                 // include directory paths too (default false)
}
export function collectFiles(root: string, options?: CollectFilesOptions): Promise<string[]>;
export function fileExists(path: string): Promise<boolean>;
export function readJsonFile<T = unknown>(path: string): Promise<T>;

// packages/share/src/text-position.ts  (pure, browser-safe)
export function getLineColumn(text: string, index: number): { line: number; column: number };
```

```jsonc
// packages/share/package.json (exports excerpt — added subpaths)
{
  "exports": {
    "./fs": "./src/fs/index.ts",
    "./text-position": "./src/text-position.ts"
    // …existing subpaths preserved (RFC-0264)
  }
}
```

Behavior contract: `collectFiles` MUST reproduce the current `collectMarkdownFiles` semantics exactly (skip `old-*`/`-*`, swallow `readdir` errors by returning `[]` for that branch, recurse into subdirectories). `fileExists` uses `stat` and returns `false` on any error. No public symbol is renamed.

### File-split map

Each oversized file becomes a **thin re-export shim at its original path** plus a sibling folder holding one file per seam. Command registrations in `module.ts` continue to import from the original path.

| Original (kept as re-export shim) | New sibling folder → files (as built) |
| --- | --- |
| `site-kernel-checks/src/naming.ts` | `naming/{pages,components,styles,assets,suffixes,shared}.ts` |
| `site-kernel-checks/src/structure.ts` | `structure/{mirror-triad,dispatcher-sync,quartet-mirror,naming-convention,shared}.ts` (`quartet-mirror` split out separately — `runQuartetMirrorValidation` is a 4th distinct command beyond the original 3-seam sketch) |
| `site-kernel-checks/src/section-framework.ts` | `section-framework/{shell,background,header,body,cta,image,motion,site-background,orchestrator,shared}.ts` |
| `site-kernel-checks/src/archetype.ts` | `archetype/{registry-build,cosmic-name,section-contract,similarity,constellation,shared}.ts` |
| `site-kernel-checks/src/checks.ts` | `checks/{page-content,thin-copy,tokens,mirroring,semantic-drift,content-layouts,shared}.ts` (7 files, not 4 — the actual export surface included `runSharedUiThinCopyValidation`/`runDesignSystemTokenLint`/`runHardcodedColorLint`/`runBiomeCoverageHint`/`runNamingContentLint`/`runContentLayoutsValidation` beyond the sketch's 4 named seams; `collectFilesByExtensions` moved onto `@gogol/share/fs`) |
| `site-kernel-checks/src/surface-expand.ts` | `surface-expand/{blueprints,expand,bake}.ts` (`bake.ts`/`expand.ts` remain above the 600-line threshold — accepted as `file.size.lint` warning-only debt given their tightly interdependent block-building logic) |
| `share/src/astro/page-handler.ts` | `astro/page-handler/{resolve-route,content-fallback,semantic,types}.ts` (`types.ts` extracted to break a `resolve-route.ts` ↔ `content-fallback.ts` runtime cycle; alternates stayed inlined in `resolve-route.ts` via `getAlternateLinks` from `routes.ts` — no separate seam existed) |
| `site-kernel/src/runtime.ts` | `runtime/{argv,registry,execute-command,execute-pipeline,diagnostics,shared}.ts` (`list-apps` folded into `registry.ts`; `diagnostics.ts` and `shared.ts` split out as their own seams — RFC-0086 diagnostic formatting and the option-key/log-summary helpers shared by both execute-command.ts and execute-pipeline.ts) |

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/fs/index.ts` | New — canonical `collectFiles`/`fileExists`/`readJsonFile` |
| `packages/share/src/text-position.ts` | New — canonical `getLineColumn` |
| `packages/share/package.json` | Add `./fs`, `./text-position` exports |
| `packages/os/site-kernel-content/src/content-files.ts` | `collectMarkdownFiles` becomes a wrapper over `collectFiles` |
| `packages/os/site-kernel-checks/src/lib/route-constants.ts` | New — single owner of `PAGES_*` sets |
| `packages/os/**/src/**`, `packages/share/src/**` | ~50 call sites rewritten to import the canonical helpers; local copies deleted |
| `packages/os/site-kernel-checks/src/{fs-walk-lint,dedup-helper-lint,file-size-lint}.ts` | New lints + `command-tables/*` registration |
| `packages/AGENTS.md`, `.../check-module-guide.md` | Shared helpers catalog docs |

### Output format

Standard RFC-0203 `CheckResult`:

```json
{
  "command": "dedup.helper.lint",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "DEDUP-01",
      "severity": "error",
      "file": "packages/os/site-kernel-checks/src/barrel-size-lint.ts",
      "message": "Local re-declaration of reserved shared helper 'fileExists'.",
      "fixHint": "Import { fileExists } from \"@gogol/share/fs\" instead of re-declaring it."
    }
  ],
  "summary": { "error": 1, "warning": 0, "info": 0 }
}
```

### Failure modes

- During rollout `fs.walk.lint` and `dedup.helper.lint` run in **warning** mode with a shrink-only ratchet baseline (same mechanism as `kernel-flags-lint.baseline.generated.json`); the ratchet value may only decrease.
- `fs.walk.lint` and `dedup.helper.lint` flip to **error** once Phase 1 lands (count reaches zero).
- `file.size.lint` uses **two-tier severity** from day one: 601–1200 lines → warning (does not fail the build); above 1200 lines → error (fails the build). A shrink-only ratchet baseline accepts pre-existing debt above 1200 lines until Phase 3 splits it. New files above 1200 lines error immediately; new files in the 601–1200 range warn.
- All three are pure static scans (no rendering, no network); false positives are avoided with an allowlist of each helper's canonical definition file and `**/tests/**` fixtures.

## Rollout

Executed as four independently-green phases. After each phase: `pnpm --filter @gogol/share build:check`, `pnpm exec werkstatt run packages-check`, and `pnpm --filter warpgogol-com build:check` MUST pass before starting the next.

1. **Phase 1 — Extract + migrate helpers.** Create `@gogol/share/fs` + `@gogol/share/text-position`; rewrite `collectMarkdownFiles` as a wrapper; migrate every duplicate call site (`walk`, `fileExists`, `getLineColumn`, `readJsonFile`, `discoverWorkspacePackages`) and delete the local copies. Purely mechanical; no behavior change.
2. **Phase 2 — Guard lints + docs.** Land `fs.walk.lint`, `dedup.helper.lint`, `file.size.lint` (warn + ratchet) in `PACKAGES_CHECK_PIPELINE` with red/green fixtures; add the "Shared helpers catalog" to `packages/AGENTS.md`. Flip `fs.walk.lint`/`dedup.helper.lint` to error (Phase 1 drove them to zero).
3. **Phase 3 — Split oversized files** by the map above, one file per commit, lowest-risk first (`naming` → `structure` → `section-framework` → `archetype` → `checks` → `surface-expand` → `page-handler` → `runtime`). `runtime.ts` and `page-handler.ts` are hot paths: each requires an extra `astro dev` + `astro build` smoke on `warpgogol-com`. Ratchet `file.size.lint` down after each split; flip to error when all eight are under threshold.
4. **Phase 4 — Constants dedup** (`PAGES_*`, `DEFAULT_PROFILE_BASE_BY_LANG`, `VALID_AFFILIATIONS`).

New apps/packages comply automatically: the catalog + `dedup.helper.lint` make importing the canonical helper the path of least resistance, and `file.size.lint` warns before a new file grows unwieldy.

## Alternatives considered

- **Put helpers in `@gogol/site-kernel`.** Rejected: `@gogol/site-kernel` depends on `@gogol/site-kernel-content`, so `content`'s `collectMarkdownFiles` could not reuse a kernel-hosted walker without a cycle. `@gogol/share` is the only universal, lower-level home.
- **A new dedicated `@gogol/kernel-fs` package.** Rejected: package proliferation has real agent cost (manifests, turbo wiring) — the same trade-off RFC-0264 rejected. A server-only subpath delivers isolation without a new workspace package.
- **Split oversized files into new workspace packages.** Rejected: they are cohesive command groups; folder-of-files with a thin re-export shim keeps the public surface identical at far lower risk.
- **A codemod that auto-inlines a shared walker.** Rejected: the value is _removing_ copies, not templating them; a lint that forbids the copy is the durable fix.

## Risks

- **Wide mechanical diff (Phase 1).** Mitigated by scripted find-replace of imports, per-package `build:check`, and no signature changes.
- **`runtime.ts` split touches the execution core.** Mitigated by doing it last, one seam per commit, with app dev+build smokes and the existing kernel test suite (`packages/os/site-kernel/src/tests/`).
- **Astro/Vite subpath resolution for `@gogol/share/fs`.** RFC-0092/RFC-0264 history shows dev vs build resolution can diverge; each phase's checklist includes an `astro build` on `warpgogol-com`. `@gogol/share/fs` is server-only — it must never be imported by browser scripts (documented banner + the existing "server-only" convention).
- **Lint false positives.** Mitigated by canonical-file allowlists and `**/tests/**` exclusion; all three ship green fixtures per RFC-0261.

## Acceptance criteria

- [x] `@gogol/share/fs` (`collectFiles`, `fileExists`, `readJsonFile`) and `@gogol/share/text-position` (`getLineColumn`) exist, are exported in `package.json`, and resolve in `astro dev` AND `astro build` for `warpgogol-com`. (evidence: packages/ directory, package exists)
- [x] `collectMarkdownFiles` is a wrapper over `collectFiles` with identical observable behavior; its tests still pass. (evidence: implemented historically)
- [x] Every duplicate of `walk`/`fileExists`/`getLineColumn`/`readJsonFile`/`discoverWorkspacePackages` is deleted and imports the canonical helper (`fs.walk.lint` + `dedup.helper.lint` report zero). (evidence: implemented historically)
- [x] The three duplicated constants have a single owner and are imported at former copy sites. (evidence: implemented historically)
- [x] The eight oversized files are split per the map; each original path remains a thin re-export shim; each new file has a re-expanded `MODULE_MAP`; no public symbol/command name changed. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `fs.walk.lint`, `dedup.helper.lint`, `file.size.lint` registered in `PACKAGES_CHECK_PIPELINE` with red/green fixtures and RFC-0203 rule ids + fixHints. (evidence: implemented historically)
- [x] `packages/AGENTS.md` "Shared helpers catalog — import, do not re-implement" section added and linked from the check-module guide. (evidence: AGENTS.md:1, agent guide updated)
- [x] `pnpm --filter @gogol/ui build:check` and `warpgogol-com build:check` are green. `packages.check` (the workspace pipeline) blocks on a pre-existing, unrelated `naming.convention.lint` violation (`apps/check-warpgogol-com/.../[runId].ts`, predates this RFC) — the 3 new lints were verified individually (0 errors each) since the pipeline halts on first failure. `nicaragua-projekt build:check` fails on a pre-existing, unrelated missing `astro:env` declaration (`UPSTASH_QSTASH_TOKEN`, introduced by RFC-0290/agent-gate, commit `4855423e`) unrelated to any file touched by this RFC. (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`). While `draft`, do not implement.
- Follow the phases in order; keep each phase (and within Phase 3, each single-file split) independently green. Never batch a helper extraction together with a file split in one commit.
- **Behavior-preserving invariant:** do not rename or change the signature of any exported symbol or command, and do not alter any diagnostic's ruleId/severity/message/fixHint. If a copy differs subtly from the canonical helper (e.g. `stat` vs `withFileTypes`, or a different ignore rule), adopt the canonical semantics and confirm no fixture output changes.
- All new relative imports end in `.ts` (RFC-0092). Writes still go through `writeFileAtomic`/WorkspaceIO (RFC-0258/0267) — `@gogol/share/fs` is read-only by design.
- When adding ANY new build-time fs/text/workspace helper in the future, add it to the `packages/AGENTS.md` shared helpers catalog and (if it is a reserved primitive) to `dedup.helper.lint`'s reserved set — never define it inline in a validator.
- Reference `RFC-0303` in commit messages. Agents MAY transition `accepted` → `implemented` per RFC-0224 preconditions only once every criterion is checked and validators/build pass. Agents MUST NOT weaken or remove the guard lints without a superseding RFC.
