---
id: RFC-0915
title: "Consolidate slug generation into werkstatt-shared as canonical utility"
status: draft
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
reviewers: []
createdAt: 2026-08-21
updatedAt: 2026-08-21
enhancedAt: 2026-08-21
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-53
  - DNA-74
  - RFC-0916
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-53
  - DNA-74
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/werkstatt-shared"
  - "@warpgogol/werkstatt-site"
successSignals:
  - No custom slugify implementations exist outside @warpgogol/werkstatt-shared/src/share/slug/
  - "@sindresorhus/slugify, cyrillic-to-translit-js, and github-slugger are only imported inside @warpgogol/werkstatt-shared/src/share/slug/"
  - All existing slug consumers import from @warpgogol/werkstatt-shared/share/slug
nonGoals:
  - Creating a separate slug package (too thin, belongs in werkstatt-shared)
  - Replacing github-slugger with @sindresorhus/slugify for heading anchors (deduplication requires stateful slugger)
  - Adding a provenance validator (covered by RFC-0916)
  - Changing URL slug output for existing geo objects (same external behavior)
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0915: Consolidate slug generation into werkstatt-shared as canonical utility

## Context

Slug generation in the Werkstatt monorepo is currently spread across three independent implementations and two external packages, with no canonical ownership:

1. **`@sindresorhus/slugify` + `cyrillic-to-translit-js`** — used in `packages/werkstatt-site/src/domain/geo/slug.ts` via a `SlugStrategy` registry with DE (custom umlaut replacements) and UK (Cyrillic transliteration) locale strategies.
2. **Custom `slugify()`** in `packages/werkstatt-shared/src/share/semantic/extract.ts:19-28` — a NFKD-normalize + strip-diacritics + replace implementation used for `SemanticBlock.id` generation.
3. **Duplicate `slugify()`** in `packages/werkstatt-site/src/checks/person-create.ts:37-43` — a simpler copy of the same NFKD pattern, missing diacritic stripping.
4. **`github-slugger`** in `packages/werkstatt-site/src/domain/ui/sections/markdown/prose-pipeline.ts:30,47-51` — a stateful slugger for heading anchor ID deduplication.

The external dependencies (`@sindresorhus/slugify`, `cyrillic-to-translit-js`, `github-slugger`) are declared in `packages/werkstatt-site/package.json`, making them site-package-specific rather than shared utilities.

## Problem

There is no canonical ownership for slug generation. Agents writing new code routinely create ad hoc `slugify()` functions instead of importing an existing implementation — the duplicate in `person-create.ts` is a direct example. Each implementation handles edge cases differently (diacritics, empty strings, Unicode normalization), producing inconsistent slugs across the platform.

DNA-53 establishes the pattern for fingerprint utilities: "New ad hoc direct hashing helpers are forbidden outside the package." DNA-74 establishes the pattern for Diagnostic schemas: "No package may redeclare, duplicate, or alias these types." Slug generation follows the same governance pattern but lacks a corresponding invariant, leaving it unprotected and unenforced.

## Decision

`@warpgogol/werkstatt-shared/src/share/slug/` is the sole canonical owner of slug generation logic. All slug generation in the monorepo MUST import from `@warpgogol/werkstatt-shared/share/slug`. The external packages `@sindresorhus/slugify`, `cyrillic-to-translit-js`, and `github-slugger` are dependencies of `@warpgogol/werkstatt-shared` only — no other package may import them directly. A new DNA invariant (DNA-88) establishes this canonical ownership and forbids ad hoc reimplementations.

## Architectural fit

- **DNA-53** (Semantic fingerprint governance) — establishes the canonical-package pattern: shared utility lives in one package, ad hoc reimplementations outside are forbidden. This RFC extends the same pattern to slug generation.
- **DNA-74** (Canonical Diagnostic schema ownership) — establishes the sole-ownership pattern: one package owns the schema, no duplication or aliasing. This RFC applies the same principle to slug utilities.
- **DNA-88** (new) — Canonical slug generation ownership, established by this RFC. DNA-88 will be added to `docs/architecture-dna.md` during implementation. Since DNA-88 does not exist yet, it cannot be listed in `satisfies[]` — the RFC body establishes it, and the invariant entry is written as part of the rollout.
- **RFC-0916** (Utility provenance validator) — companion RFC that adds automated enforcement via `utility.provenance.validate`, using the slug module as its initial registry entries.

## Design

### Module structure

A new `slug/` directory under `werkstatt-shared/src/share/`:

```
packages/werkstatt-shared/src/share/slug/
  index.ts          — public re-exports
  slug-url.ts       — slugUrl(text, lang?) with locale strategies
  slug-id.ts        — slugId(text) for semantic block IDs
  heading-slugger.ts — HeadingSlugger class (wraps github-slugger)
  strategies.ts     — GermanSlugStrategy, UkrainianSlugStrategy, DefaultSlugStrategy
```

### TypeScript contracts

```ts
// slug-url.ts

interface SlugStrategy {
  slug(name: string): string;
}

function slugUrl(text: string, lang?: string): string;
// lang="de" → GermanSlugStrategy (ä→ae, ö→oe, ü→ue, ß→ss)
// lang="uk" → UkrainianSlugStrategy (cyrillic-to-translit-js preset "uk" → slugify)
// default  → DefaultSlugStrategy (slugify with no custom replacements)
// Returns "entity" if input produces empty slug

// slug-id.ts

function slugId(text: string): string;
// Uses @sindresorhus/slugify, returns "entity" if empty
// Replaces the custom NFKD slugify() in extract.ts

// heading-slugger.ts

class HeadingSlugger {
  slug(text: string): string;
// Wraps github-slugger for stateful deduplication
// First "Fazit" → "fazit", second → "fazit-1"
```

### File system responsibilities

| Path | Action |
| --- | --- |
| `packages/werkstatt-shared/src/share/slug/index.ts` | Created — public API barrel |
| `packages/werkstatt-shared/src/share/slug/slug-url.ts` | Created — locale-aware URL slug generation |
| `packages/werkstatt-shared/src/share/slug/slug-id.ts` | Created — semantic block ID generation |
| `packages/werkstatt-shared/src/share/slug/heading-slugger.ts` | Created — heading anchor deduplication |
| `packages/werkstatt-shared/src/share/slug/strategies.ts` | Created — DE/UK/default strategies |
| `packages/werkstatt-shared/src/share/semantic/extract.ts` | Modified — remove custom `slugify()`, no re-export (no external consumers found) |
| `packages/werkstatt-shared/src/share/semantic/page-utils.ts` | Modified — import `slugId` from `../slug/` instead of `./extract.ts`, remove `export { slugify }` line, update internal calls from `slugify(block.heading)` to `slugId(block.heading)` |
| `packages/werkstatt-site/src/domain/geo/slug.ts` | Deleted — logic moved to werkstatt-shared |
| `packages/werkstatt-site/src/domain/geo/index.ts` | Modified — replace `export { citySlug } from "./slug.ts"` with `export { slugUrl as citySlug } from "@warpgogol/werkstatt-shared/share/slug"` (preserves public API) |
| `packages/werkstatt-site/src/domain/geo/cities.ts` | Modified — import `slugUrl` from `@warpgogol/werkstatt-shared/share/slug` instead of `citySlug` from `./slug.ts` |
| `packages/werkstatt-site/src/domain/geo/service.ts` | Modified — import `slugUrl` from `@warpgogol/werkstatt-shared/share/slug` instead of `citySlug` from `./slug.ts` |
| `packages/werkstatt-site/src/domain/geo/tests/city-slug.pbt.test.ts` | Modified — import `slugUrl` from `@warpgogol/werkstatt-shared/share/slug` instead of `citySlug` from `../slug.ts` |
| `packages/werkstatt-site/src/domain/geo/types.ts` | Modified — remove `SlugStrategy` interface (moved to `werkstatt-shared/src/share/slug/strategies.ts` as internal) |
| `packages/werkstatt-site/src/checks/person-create.ts` | Modified — remove local `slugify()`, import `slugUrl` from `@warpgogol/werkstatt-shared/share/slug` |
| `packages/werkstatt-site/src/domain/ui/sections/markdown/prose-pipeline.ts` | Modified — import `HeadingSlugger` from `@warpgogol/werkstatt-shared/share/slug` |
| `packages/werkstatt-shared/package.json` | Modified — add `@sindresorhus/slugify`, `cyrillic-to-translit-js`, `github-slugger` dependencies |
| `packages/werkstatt-site/package.json` | Modified — remove `@sindresorhus/slugify`, `cyrillic-to-translit-js`, `github-slugger` dependencies |
| `docs/architecture-dna.md` | Modified — add DNA-88 invariant |
| `packages/werkstatt-shared/AGENTS.md` | Modified — document canonical slug utilities |

### Dependency migration

The three external packages move from `werkstatt-site` to `werkstatt-shared`:

- `@sindresorhus/slugify@^3.0.0` — used by `slug-url.ts` and `slug-id.ts`
- `cyrillic-to-translit-js@^3.2.1` — used by `strategies.ts` (UkrainianSlugStrategy)
- `github-slugger@^2.0.0` — used by `heading-slugger.ts`

After migration, `werkstatt-site` imports slug utilities from `@warpgogol/werkstatt-shared/share/slug` and no longer declares these packages as direct dependencies.

### Behavioral compatibility

- `slugUrl("München", "de")` → `"muenchen"` (same as current `GermanSlugStrategy.slug()`)
- `slugUrl("Київ", "uk")` → `"kyiv"` (same as current `UkrainianSlugStrategy.slug()`)
- `slugUrl("Hello World")` → `"hello-world"` (same as current `DefaultSlugStrategy.slug()`)
- `slugId("Fazit")` → `"fazit"` (same output as old custom `slugify()`, but via `@sindresorhus/slugify`)
- `slugId("")` → `"entity"` (preserves fallback from old implementation)
- `HeadingSlugger` — same deduplication behavior as current `GithubSlugger` usage

### Failure modes

This RFC introduces no new commands. Failure modes are limited to:

- **Import path breakage** — consumers importing from old paths get TypeScript errors. Fixed by updating import paths.
- **Dependency resolution** — `werkstatt-site` no longer has direct deps; if it imports them transitively through `werkstatt-shared`, pnpm resolves correctly.
- **Slug output divergence** — `@sindresorhus/slugify` may produce slightly different output than the custom NFKD implementation for edge-case Unicode. Mitigated by unit tests covering existing inputs.

## Rollout

1. **Create `slug/` module** in `werkstatt-shared` with all three exports (`slugUrl`, `slugId`, `HeadingSlugger`).
2. **Move dependencies** from `werkstatt-site/package.json` to `werkstatt-shared/package.json`.
3. **Update consumers** — change import paths in `extract.ts`, `page-utils.ts`, `person-create.ts`, `prose-pipeline.ts`.
4. **Delete `werkstatt-site/src/domain/geo/slug.ts`** — logic fully moved.
5. **Add DNA-88** to `docs/architecture-dna.md`.
6. **Update `packages/werkstatt-shared/AGENTS.md`** — document canonical slug utilities in a "Canonical utilities" section.
7. **Run `build:check`** — verify typecheck passes across all packages.
8. **Run unit tests** — verify slug output compatibility.

No flag day, no migration period — all changes are internal import-path refactoring with identical external behavior. New apps automatically comply because the canonical module is the only available import path.

**Migration details**: The custom `slugify()` in `extract.ts` has zero external consumers (grep confirmed no imports of `slugify` from `@warpgogol/werkstatt-shared` outside `page-utils.ts`). The `export { slugify }` line in `page-utils.ts` is removed; `page-utils.ts` imports and uses `slugId` directly. The `citySlug` function in `geo/slug.ts` is replaced by `slugUrl` — geo consumers (`cities.ts`, `service.ts`, `index.ts`, tests) are updated to import `slugUrl` from `@warpgogol/werkstatt-shared/share/slug`. The `index.ts` re-export preserves the public API name `citySlug` as an alias of `slugUrl` to avoid breaking external importers of `@warpgogol/werkstatt-site/domain/geo`. The `SlugStrategy` interface becomes internal to the slug module (not re-exported).

## Alternatives considered

1. **Create a separate `@warpgogol/slug` package** — rejected. The module is ~80 lines wrapping three external packages. A separate package adds `package.json`, `tsconfig.json`, `AGENTS.md`, CI matrix, and subpath exports overhead for minimal logic. `werkstatt-shared` is the existing shared-utility package and already contains `slugify()`.

2. **Replace all three packages with `@sindresorhus/slugify` only** — rejected. `github-slugger` provides stateful deduplication for heading anchors (first "Fazit" → `fazit`, second → `fazit-1`) that `@sindresorhus/slugify` cannot replicate without a custom wrapper class. `cyrillic-to-translit-js` is required for Ukrainian Cyrillic → Latin transliteration before slugification; `@sindresorhus/slugify` strips Cyrillic characters entirely, producing empty slugs.

3. **Remove duplicates without a DNA invariant** — rejected. Without a DNA invariant and enforcement (RFC-0916), agents will recreate ad hoc `slugify()` functions. The duplicate in `person-create.ts` is direct evidence of this pattern.

## Risks

- **Slug output divergence** — `@sindresorhus/slugify` uses ICU transliteration, not NFKD normalization. Some Unicode edge cases (e.g., ligatures like ﬁ, compatibility characters) may produce different slugs than the old custom implementation. Mitigated by unit tests covering all existing inputs in `extract.ts` and `person-create.ts`.
- **Agent misinterpretation** — agents may see `@sindresorhus/slugify` in `werkstatt-shared` deps and import it directly in site code. Mitigated by DNA-88 + RFC-0916 provenance validator.
- **Dependency bloat in werkstatt-shared** — adding three external packages increases the shared package's dependency footprint. Acceptable because these are small, well-maintained packages with no transitive dependencies.
- **Circular imports** — `werkstatt-shared` must not import from `werkstatt-site`. The slug module has no site-specific dependencies, so this risk is minimal.

## Acceptance criteria

- [ ] `packages/werkstatt-shared/src/share/slug/index.ts` exports `slugUrl`, `slugId`, and `HeadingSlugger` (evidence: `packages/werkstatt-shared/src/share/slug/index.ts:1`)
- [ ] No custom `slugify` function exists outside `packages/werkstatt-shared/src/share/slug/` (evidence: `grep -rn "function slugify" packages/ --include="*.ts" | grep -v share/slug/` returns zero results)
- [ ] `@sindresorhus/slugify`, `cyrillic-to-translit-js`, and `github-slugger` appear only in `packages/werkstatt-shared/package.json` deps, not in `packages/werkstatt-site/package.json` (evidence: `packages/werkstatt-shared/package.json` and `packages/werkstatt-site/package.json`)
- [ ] `packages/werkstatt-site/src/domain/geo/slug.ts` is deleted (evidence: file does not exist)
- [ ] `packages/werkstatt-site/src/checks/person-create.ts` imports `slugUrl` from `@warpgogol/werkstatt-shared/share/slug` (evidence: `packages/werkstatt-site/src/checks/person-create.ts:1`)
- [ ] `packages/werkstatt-site/src/domain/ui/sections/markdown/prose-pipeline.ts` imports `HeadingSlugger` from `@warpgogol/werkstatt-shared/share/slug` (evidence: `packages/werkstatt-site/src/domain/ui/sections/markdown/prose-pipeline.ts:1`)
- [ ] DNA-88 is added to `docs/architecture-dna.md` (evidence: `docs/architecture-dna.md` contains `## DNA-88`)
- [ ] Unit tests verify slug output compatibility for DE, UK, and default locales (evidence: `packages/werkstatt-shared/src/share/slug/tests/`)
- [ ] `build:check` passes across all impacted packages (evidence: `pnpm run build:check` exit code 0)
- [ ] `rfc.validate` passes on this file (evidence: `rfc.validate --id RFC-0915` exit code 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT import `@sindresorhus/slugify`, `cyrillic-to-translit-js`, or `github-slugger` directly outside `packages/werkstatt-shared/src/share/slug/`. Use `@warpgogol/werkstatt-shared/share/slug` exports instead.
- Agents MUST NOT create new `slugify`, `toSlug`, `makeSlug`, or `createSlug` functions outside `packages/werkstatt-shared/src/share/slug/`. If a new slug variant is needed, add it to the canonical module.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0915 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
