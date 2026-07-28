---
id: RFC-0262
title: "Generate section prop types from manifest propsSchema"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
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
  - RFC-0023
  - RFC-0026
  - RFC-0091
  - RFC-0093
  - RFC-0205
commands:
  proposed:
    - props.types.generate
    - props.contract.validate
  added:
    - props.types.generate
    - props.contract.validate
  changed:
    - section.scaffold
    - section.contract.validate
    - content-types.validate
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/ui"
  - "@gogol/share"
  - "@gogol/ontology"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Every section/component has exactly ONE authored prop contract: the manifest propsSchema; its TypeScript twin is generated and marker-carrying."
  - "A stale or hand-edited generated types file fails props.contract.validate."
  - "In astro dev, a block whose props violate the pinned propsSchema fails fast with PAGE-PROPS-01 instead of rendering silently degraded output."
nonGoals:
  - "Do not validate props at production render time — page.block.validate in build.check remains the deploy gate."
  - "Do not change any existing propsSchema semantics; generation must reproduce current shapes."
  - "Do not migrate prose/content schemas (RFC-0033 territory) — only UI-surface prop contracts."
---

# RFC-0262: Generate section prop types from manifest propsSchema

## Context

Part D of the 2026-07-02 AEO audit series (manifest-authoritative UI contracts; see rfc-0258 for series order).

Every UI surface in `packages/ui/src/{sections,components}/` carries a `*.manifest.yaml` with a JSON-Schema `propsSchema` (strict, `additionalProperties: false`), validated against authored blocks by `page.block.validate` in `build.check`. Many manifests ALSO point to a hand-written TypeScript types file via `contentTypesPath` (e.g. `hero-section.manifest.yaml` → `./hero-section.types.ts`). Nothing verifies the two contracts agree — `schema.drift.validate` guards a different surface (app-local Zod schemas). Meanwhile the central dispatch types (`packages/share/src/page.ts`) carry `props: Record<string, any>`, and `astro dev` renders blocks without any props validation at all: the silent-degradation class RFC-0205 fought returns through this gap.

## Problem

Unprotected invariants:

1. **Single source of truth for prop shapes.** Two parallel authored contracts (JSON Schema + `.types.ts`) can drift with no diagnostic. An agent trusting the types file may author props the schema rejects, or vice versa.
2. **Fail-fast in dev.** Between build.check runs, invalid props render silently in `astro dev`; the agent iterating on content gets no signal.

## Decision

1. The manifest `propsSchema` (with `propsSchemaCompose` fragments resolved) becomes the ONLY authored prop contract. A new `props.types.generate` command emits `<name>.types.generated.ts` next to each manifest, carrying the `GENERATED_MARKER` (RFC-0081) and a `sourceHash` of the resolved schema. `contentTypesPath` must point at the generated file; hand-written types files are deleted as their surfaces migrate.
2. A new `props.contract.validate` command verifies: generated file exists, is marker-carrying, and its embedded `sourceHash` matches the current resolved schema (`PROPS-01`); the manifest's example block (when present) validates against its own schema (`PROPS-02`).
3. `buildPage` (`packages/share/src/page.ts`) gains an optional `validateProps` hook in `BuildPageOptions`. The shared page-handler enables it when `import.meta.env.DEV` is true; violations throw with rule id `PAGE-PROPS-01`, the block id, and the failing JSON path. Production builds never pay the validation cost (build.check already gates).

## Architectural fit

- Extends the RFC-0023 manifest contract: the manifest was already the ontological source of truth; this closes the last parallel channel.
- Follows RFC-0081 generated-file governance (marker, single owner) and the Derived Artifact Invalidation Contract (sourceHash, no existence-based skip).
- `section.scaffold` (RFC-0093) changes to emit a manifest + generated types from day one, so new sections never create a hand-written types file.
- Registered in `GENERATOR_OWNERSHIP_MAP` (RFC-0087) with all output paths.

## Design

### CLI surface

```sh
pnpm exec site-kernel run props.types.generate            # all surfaces in packages/ui
pnpm exec site-kernel run props.types.generate --dry-run
pnpm exec site-kernel run props.contract.validate --json
```

Workspace scope (operates on `packages/ui`); wired into `PACKAGES_CHECK_PIPELINE` (validate) and the packages build/prepare flow (generate).

### TypeScript contracts

```ts
// packages/os/site-kernel-codegen/src/props-types.ts (new)
export interface PropsTypesGenerateResult {
  written: string[];   // generated files created/updated
  unchanged: string[]; // idempotent no-ops (writeManagedFile "unchanged")
  skipped: string[];   // manifests without propsSchema
}

// Generated file shape (illustrative):
// hero-section.types.generated.ts
// // GENERATED. Do not change this line unless the file contains project specific changes.
// // sourceHash: <sha256 of resolved propsSchema JSON>
// export interface HeroSectionProps { header: SectionHeader; tagline?: string; … }

// packages/share/src/page.ts
export interface BuildPageOptions {
  // …existing options…
  /** Dev-only fail-fast: validate each block's props against its pinned schema. */
  validateProps?: (planetName: string, props: Record<string, unknown>) => void;
}
```

Type generation uses `json-schema-to-typescript` (or an equivalent deterministic first-party emitter): stable ordering, no timestamps, `propsSchemaCompose` fragments resolved before emission so the generated interface is self-contained.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ui/src/{sections,components}/**/*.manifest.yaml` | Read: resolved propsSchema is the source |
| `packages/ui/src/{sections,components}/**/*.types.generated.ts` | Written by props.types.generate (marker + sourceHash) |
| Existing hand-written `*.types.ts` prop files | Deleted per-surface as `.astro` files switch imports |
| `packages/share/src/page.ts` | `validateProps` hook |
| `packages/share/src/astro/page-handler.ts` | Enables the hook in dev via a lazy Ajv import |
| `packages/os/site-kernel-checks/src/props-contract.ts` | props.contract.validate |

### Output format

Standard RFC-0203 `CheckResult`. Rule ids: `PROPS-01` (missing/stale/hand-edited generated types), `PROPS-02` (manifest example fails own schema), `PAGE-PROPS-01` (dev-render violation, thrown not collected).

### Failure modes

`props.contract.validate` exits 1 on PROPS-01/02 with the manifest path and a fixHint ("run props.types.generate"). The dev hook throws on first violation (fail-fast, matching buildPage's existing throw-on-missing-import-path behavior); it is never active in `astro build`.

## Rollout

1. Land generator + validator + tests; generate types for ALL surfaces in one commit (mechanical).
2. Per-surface migration: switch each `.astro` file's Props import to the generated file, delete the hand-written types file, update `contentTypesPath`. Batch by section family; both apps' `build:check` green per batch.
3. Enable `props.contract.validate` fail-hard once all `contentTypesPath` values point at generated files.
4. Land the dev `validateProps` hook last — it depends on nothing above but is highest-visibility; announce in `AGENTS.md` so agents expect dev-time throws.

**As-built, 2026-07-02:** all steps landed in one pass rather than the batched schedule above (the migration proved mechanical and low-risk once the emitter and fixture pairing were verified). 33 hand-written `.types.ts` files were removed; 5 components with no `propsSchema` at all (`brand-label`, `breadcrumbs-component`, `copyright-component`, `footer-promo-component`, `lang-switcher-component`) had a `propsSchema` backfilled from their existing hand-written type (real, pre-existing schema gaps this RFC exists to close); `header-component` and `footer-component` had genuinely incomplete `propsSchema`s (missing most of their real `Props`, e.g. `navLinks`, `pageOverride`) expanded to match their `.astro` `Props` interfaces exactly — confirmed correct by both apps' `page.block.validate` staying green against real authored content. `layout-component` (no `contentTypesPath`, `standalone: true`, not a content-block surface) and `faq-list-section`'s `FaqListItem` (content-collection shape, not the section's own props) are intentionally out of scope and were left as-is. The generator is a first-party emitter (see Alternatives) rather than `json-schema-to-typescript`, so the "output churn across versions" risk below does not apply.

## Alternatives considered

- **TypeScript types as source, JSON Schema generated**: rejected — the manifest YAML is already the machine-validated, CMS-facing, registry-consumed source (RFC-0023/0091); inverting would put the source of truth in a file agents must parse with a TS compiler.
- **Zod as the single source**: rejected — propsSchema is consumed as plain JSON Schema by `page.block.validate` and external tooling; introducing a third representation deepens the problem.
- **Production render-time validation**: rejected — build.check already gates deploys; paying Ajv cost on every static-build render adds build time for no new safety.
- **`json-schema-to-typescript` as the emitter**: considered per the Design section; **as-built** uses a first-party recursive emitter instead (object/array/string/number/boolean/enum/const/oneOf/anyOf — the actual subset packages/ui manifests use), avoiding a new dependency and version-drift risk, consistent with the Design section's "or an equivalent deterministic first-party emitter" latitude. Likewise the dev `validateProps` hook uses a first-party structural checker rather than a lazy `ajv` import, avoiding a new @gogol/share runtime dependency; workspace-root discovery walks up from `process.cwd()` to `pnpm-workspace.yaml` (mirroring `getSectionPropsSchema`'s existing fs-based manifest reads) and every resolution failure is caught and logged, never thrown — only a genuine prop-shape violation throws `PAGE-PROPS-01`.

## Risks

- `json-schema-to-typescript` output churn across versions could dirty all generated files; pin the version and treat upgrades as a regenerate-everything commit.
- Complex schema constructs (oneOf/allOf from `propsSchemaCompose`) may emit awkward types; acceptable — generated types are a convenience mirror, the schema remains the contract.
- Dev-time throws may surprise agents mid-migration; the error message must name the block id, page, JSON path, and the exact validator message.

## Acceptance criteria

- [x] Tests written BEFORE implementation: (a) fixture manifest → deterministic generated types (golden file, byte-stable across two runs); (b) mismatched sourceHash → PROPS-01; (c) hand-edited generated file (marker removed) → PROPS-01 with governance fixHint; (d) manifest example violating own schema → PROPS-02; (e) buildPage with `validateProps` throwing on an extra prop key → PAGE-PROPS-01 including block id. (evidence: implemented historically)
- [x] `props.types.generate` registered, idempotent (second run reports all-unchanged), listed in `GENERATOR_OWNERSHIP_MAP`. (evidence: implemented historically)
- [x] `props.contract.validate` registered in `PACKAGES_CHECK_PIPELINE`, `--json` stable. (evidence: implemented historically)
- [x] All surfaces in `packages/ui` migrated; zero hand-written prop `.types.ts` files remain for manifest-carrying surfaces. (evidence: packages/ directory, package exists)
- [x] `section.scaffold` emits manifest + generated types; scaffold fixture test updated. (evidence: implemented historically)
- [x] Dev hook active in the shared page-handler; production build verified green end-to-end (`astro build` succeeds, dev-only hook confirmed inert via `NODE_ENV` gating). Formal byte-identical before/after diffing is deferred to rfc-0269 (no golden snapshot mechanism exists yet to diff against). (evidence: implemented historically)
- [x] Rule ids registered with fixHints; `AGENTS.md` manifest section updated. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- NEVER edit a `*.types.generated.ts` by hand — fix the manifest and regenerate (RFC-0081 protocol).
- During migration, if a hand-written types file disagrees with the schema, the SCHEMA wins; if the schema is plainly wrong (the component reads a prop the schema omits), fix the schema in the same commit and note it in the PR.
- The dev hook must be tree-shaken out of production bundles — verify no Ajv import appears in `astro build` output.
- Agents MAY transition this RFC `accepted` → `implemented` per RFC-0224 preconditions only; reference `rfc-0262` in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a superseding RFC.
