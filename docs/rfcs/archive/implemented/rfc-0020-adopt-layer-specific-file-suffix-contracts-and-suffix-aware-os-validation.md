---
id: RFC-0020
title: "Adopt layer-specific file suffix contracts and suffix-aware OS validation"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-21
updatedAt: 2026-05-02
implementedAt: 2026-04-21
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-1
  - DNA-7
  - DNA-8
  - DNA-9
  - RFC-0009
  - RFC-0014
  - RFC-0019
commands:
  proposed:
    - naming.suffixes.lint
  added:
    - naming.suffixes.lint
  changed:
    - mirror.quartet.validate
    - dispatcher.sync.validate
    - feature.graph.validate
    - naming.components.lint
    - naming.pages.lint
    - naming.styles.lint
  removed: []
appsImpacted:
  - main
  - nicaragua-projekt
packagesImpacted:
  - site-kernel-checks
  - site-kernel
successSignals:
  - "All `.astro` files in `src/components/` that are not under a `section` path are unambiguously marked as components through the `-component` suffix, at any directory depth."
  - "Section files keep the `-section` suffix and shared validators compare logical names instead of raw suffixed filenames."
  - "Page and style filenames stay short and URL-safe because they never gain presentation suffixes."
  - "`AGENTS.md` files are treated as documentation metadata and are ignored by all Site OS validation commands."
  - "`src/layouts/` exposes exactly one canonical layout entry: `layout.astro`."
nonGoals:
  - "Do not rename visitor-facing page route files to add `-page` or any other suffix."
  - "Do not require same-day rollout to all apps in `apps/*`; `apps/nicaragua-projekt` is the proving target."
  - "Do not change the rule that CSS detection is based on file extension and location under `src/styles/`."
  - "Do not keep unused legacy logo-only component folders in proving apps once they are confirmed dead."
---

# RFC-0020: Adopt layer-specific file suffix contracts and suffix-aware OS validation

## Context

The current site architecture already separates pages, components, sections, styles, and layouts by directory, but file identity is still partially ambiguous.

Today:

- top-level files in `src/components/` are regular component files without a dedicated suffix
- files in `src/components/section/` already communicate their role through the `-section` suffix
- page files under `src/pages/` remain intentionally concise because their names surface into visitor-facing URLs
- style files under `src/styles/` are already identifiable through `.css` and their directory layer

This creates two problems.

First, human readers cannot always infer the intended layer from a bare filename when the file is referenced outside its folder context. Second, multiple Site OS checks still compare raw basenames instead of a stable logical artifact identity. Once component suffixes become mandatory, those checks would drift unless they normalize names before comparison.

`apps/nicaragua-projekt` is the right proving target because it already uses suffixed section files, has a mature feature-graph/checks setup, and exposes the concrete directories this RFC needs to govern.

## Problem

Several invariants are currently under-protected.

1. Layer meaning is inconsistent at the filename level. Section files already carry `-section`, but top-level components do not carry an equivalent marker.
2. Existing architecture checks in `@gogol/site-kernel-checks` still assume raw filename equality in several places. Adding required suffixes for component-layer files would break logical comparisons unless validators strip the layer suffix before matching related artifacts.
3. `src/pages/**` must stay URL-oriented. Adding `-page` would leak implementation detail into visitor-facing route stems and make URLs noisier for no architectural gain.
4. `src/styles/**` already has a reliable detection signal through the `.css` extension and folder placement. A `-style` suffix would be redundant and would create accidental mismatch risk.
5. `AGENTS.md` files are instruction metadata, not application artifacts. Some commands already skip them incidentally, but there is no repository-wide OS rule that all validation commands must ignore them at every nesting level.
6. `src/layouts/` has no explicit singleton rule yet. For the current architecture, `layout.astro` is the only allowed file-level layout entry in that directory.
7. `apps/nicaragua-projekt/src/components/logo/` is unused legacy structure and should not survive the proving rollout once the naming contract is adopted there.

Without an explicit contract, naming remains partially conventional instead of machine-checkable, and the same filename may have a different architectural meaning depending on who reads it and which check compares it.

## Decision

All apps in `apps/*` adopt a layer-specific filename suffix contract, and the Site OS becomes suffix-aware when validating architectural relationships.

The contract is:

1. Files anywhere under `src/components/` that are not in a path segment named `section` must end with `-component`. This covers both root-level files and files inside subdirectories such as `effects/`, `funding/`, `logo/`, or any other named subdirectory. The forbidden-suffix-token rule (`-page`, `-section`, `-style` before `-component`) applies only to root-level files; files in subdirectories must carry the suffix but are not subject to the token restriction.
2. Files under `src/components/section/` must end with `-section`.
3. Files under `src/pages/` at any nesting level must not contain `-page`, `-section`, `-component`, or `-style` in the filename stem.
4. Files directly under `src/styles/components/` must end with `-component`.
5. Files under `src/styles/components/section/` must end with `-section`.
6. Files directly under `src/content/components/{lang}/` must end with `-component`. Exception: `layout.md` is the Class 4 layout singleton and is exempt.
7. Files under `src/content/components/{lang}/section/` must end with `-section`.
8. Files directly under `src/content/schemas/components/` must end with `-component`. Exception: `layout.ts` is the Class 4 layout singleton and is exempt.
9. Files under `src/content/schemas/components/section/` must end with `-section`.
10. Files under `src/styles/` outside `src/styles/components/` must not contain `-style` in the filename stem.
11. `AGENTS.md` is ignored by all Site OS validation commands regardless of nesting level.
12. `src/layouts/` may contain only one file-level layout entry: `layout.astro`.

This gives every artifact in the component layer a readable, unambiguous layer marker across all four mirrored files:

```
src/components/footer-component.astro
src/styles/components/footer-component.css
src/content/components/{lang}/footer-component.md
src/content/schemas/components/footer-component.ts          ← schema key stays logical
```

Additionally, validators that compare architectural identities stop using raw filenames as the canonical comparison key. Instead, they compare a normalized logical artifact name:

- `footer-component.astro` → `footer`
- `footer-component.css` → `footer`
- `footer-component.md` → `footer`
- `footer-component.ts` (schema) → `footer`
- `navigation-section.astro` → `navigation-section` (section layer — suffix stays in schema too)
- `about.astro` → `about`
- `global.css` → `global`

Only `-component` (root layer) is stripped during normalization of `.astro`, `.css`, and `.md` files. The `-section` suffix is NOT stripped because section schemas also carry the suffix (`hero-section.ts`), making the logical identity `section/hero-section` throughout. The OS must not strip arbitrary trailing words.

For rollout scope:

- the target architecture is cross-app for `apps/*`
- the initial proving implementation is limited to `apps/nicaragua-projekt`
- `apps/nicaragua-projekt/src/components/logo/` is removed during proving because it is unused in this app

## Architectural fit

This RFC strengthens existing invariants instead of inventing a parallel naming model.

- DNA-1 — Page ownership remains file-based, and page stems stay clean because route files never gain `-page`.
- DNA-7 — Routes stay thin and URL-oriented; they do not absorb extra architectural suffix noise.
- DNA-8 — Section files keep their dedicated layer marker and remain the explicit page-building block.
- DNA-9 — Styles remain file-based and extension-driven under `src/styles/`; no redundant `-style` naming scheme is introduced.
- RFC-0009 — Quartet and triad-style mirror checks must compare normalized logical identities rather than raw suffixed filenames where layer suffixes differ.
- RFC-0014 — Page route stems remain authoritative for route/content identity; this RFC explicitly preserves that rule by forbidding `-page`.
- RFC-0019 — Section naming already relies on `-section`; this RFC keeps that convention and aligns other architectural checks with the same layer-aware naming model.

This RFC also clarifies the ownership line between runtime artifacts and instruction metadata. `AGENTS.md` is an agent-facing documentation artifact, not a route, component, style, schema, or content asset. The OS must therefore ignore it consistently.

## Design

### CLI surface

```sh
pnpm exec site-kernel run naming.suffixes.lint --app nicaragua-projekt
pnpm exec site-kernel run naming.suffixes.lint --all --json
pnpm exec site-kernel run mirror.quartet.validate --app nicaragua-projekt
pnpm exec site-kernel run dispatcher.sync.validate --app nicaragua-projekt
pnpm exec site-kernel run feature.graph.validate --app nicaragua-projekt
```

Command responsibilities:

- `naming.suffixes.lint`
  - validates required suffixes for all `src/components/` files not under a `section` path segment (any depth)
  - validates required suffixes for `src/components/section/` files (any depth)
  - forbidden-suffix-token check (`-page`, `-section`, `-style` before `-component`) applies at root depth only
  - validates forbidden suffix tokens for `src/pages/**`
  - validates forbidden suffix tokens for `src/styles/**`
  - validates that `src/layouts/` contains exactly one file-level layout entry named `layout.astro`
  - ignores `AGENTS.md` and any other future explicitly documented instruction-only files

Changed command behavior:

- `mirror.quartet.validate`
  - resolves logical component identity from suffixed filenames before comparing component, content, schema, style, and optional script artifacts
  - preserves the existing page-route stem checks without adding a page suffix layer

- `dispatcher.sync.validate`
  - compares dispatcher keys against normalized artifact identities where a component or section filename uses an approved suffix

- `feature.graph.validate`
  - resolves `componentPath` references against the actual suffixed filename on disk through normalized identity rules
  - keeps section-role checks from RFC-0019 unchanged

- `naming.components.lint`
  - keeps file-type placement checks in `src/components/`
  - treats `AGENTS.md` as always ignored
  - does not duplicate suffix policy logic owned by `naming.suffixes.lint`

- `naming.pages.lint`
  - keeps route-structure validation
  - treats `AGENTS.md` as always ignored
  - does not permit `-page`, `-section`, `-component`, or `-style` in page stems once the new naming contract is active

- `naming.styles.lint`
  - keeps CSS location validation
  - treats forbidden suffix tokens in style stems as violations under the shared suffix policy

### TypeScript contracts

```ts
type LayerArtifactKind =
  | "component-root"
  | "component-section"
  | "page-route"
  | "style"
  | "layout-entry";

type SuffixRule = {
  kind: LayerArtifactKind;
  requiredSuffix?: "-component" | "-section";
  forbiddenTokens: Array<"-page" | "-component" | "-section" | "-style">;
};

interface NormalizedArtifactIdentity {
  file: string;
  kind: LayerArtifactKind;
  rawStem: string;
  logicalStem: string;
}

interface NamingSuffixViolation {
  file: string;
  rule:
    | "missing-required-suffix"
    | "forbidden-suffix-token"
    | "invalid-layout-entry"
    | "multiple-layout-files";
  message: string;
}

interface NamingSuffixLintResult {
  command: "naming.suffixes.lint";
  status: "pass" | "fail";
  checkedFiles: number;
  violations: NamingSuffixViolation[];
}
```

Normalization rules:

- strip `-component` only for top-level `src/components/*`
- strip `-section` only for `src/components/section/*`
- do not strip any suffix from page or style filenames
- never normalize `AGENTS.md` because it is excluded before artifact classification

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/*/src/components/**/*.astro` (non-`section` paths) | All non-section component files at any depth; must end with `-component`; `layout.astro` singleton is exempt |
| `apps/*/src/content/components/{lang}/section/` | Section layer; must keep the `-section` suffix |
| `apps/*/src/content/schemas/components/*.ts` | Component schema layer; must end with `-component` (except `layout.ts`) |
| `apps/*/src/content/schemas/components/section/*.ts` | Section schema layer; must end with `-section` |
| `apps/*/src/content/pages/{lang}/**/*.md` | Page-level content and `componentOverrides`; remains the source of project-specific copy |
| `apps/*/src/styles/**/*.css` | Style layer; names stay suffix-free and extension-driven |
| `apps/*/src/layouts/layout.astro` | Canonical singleton layout entry |
| `apps/*/src/layouts/*` | Must not contain additional file-level layout entries under this contract |
| `apps/*/src/components/logo/**` | Legacy logo-only folder; proving rollout removes it when the app does not consume it |
| `packages/os/site-kernel-checks/src/naming.ts` | Owns layer-specific naming and suffix validation logic |
| `packages/os/site-kernel-checks/src/structure.ts` | Owns suffix-aware mirror and dispatcher comparisons |
| `packages/os/site-kernel-checks/src/feature-graph.ts` | Owns suffix-aware componentPath resolution for feature-graph validation |
| `packages/os/site-kernel-checks/src/module.ts` | Registers `naming.suffixes.lint` and later promotes it into shared pipelines when rollout conditions are met |
| `packages/os/site-kernel/docs/naming-conventions.md` | Canonical human-facing naming standard that must be updated when implementation begins |

### Output format

`naming.suffixes.lint` JSON output:

```json
{
  "command": "naming.suffixes.lint",
  "status": "fail",
  "checkedFiles": 12,
  "violations": [
    {
      "file": "apps/nicaragua-projekt/src/components/breadcrumbs.astro",
      "rule": "missing-required-suffix",
      "message": "Top-level component files must end with \"-component\". Rename to breadcrumbs-component.astro."
    },
    {
      "file": "apps/nicaragua-projekt/src/layouts/alt-layout.astro",
      "rule": "invalid-layout-entry",
      "message": "src/layouts/ may contain only one file-level layout entry named layout.astro."
    }
  ]
}
```

Pretty output must report one violation per line with app-relative paths.

### Failure modes

Rules for command behavior:

- `naming.suffixes.lint` exits non-zero when it finds any violation.
- Commands changed by this RFC also exit non-zero when normalized-identity comparisons fail.
- `AGENTS.md` never produces warnings or violations because it is excluded before validation.
- Page route files are never auto-normalized to remove forbidden tokens; they fail directly because page stems are URL-facing.
- Layout validation is strict: any file-level entry in `src/layouts/` other than `layout.astro` is a violation, and more than one file-level entry is also a violation.

## Rollout

1. Phase 1 — Define the shared contract
   - document the new suffix rules and normalized identity model in this RFC
   - define `AGENTS.md` as globally ignored by Site OS validation commands

2. Phase 2 — Prove in `apps/nicaragua-projekt`
   - rename top-level component files to `-component`
   - keep section files on `-section`
   - keep page and style names unchanged
   - remove `src/components/logo/` because it is unused in this app
   - confirm that `src/layouts/` contains only `layout.astro`

3. Phase 3 — Update shared checks
   - add `naming.suffixes.lint`
   - update mirror, dispatcher, feature-graph, page, component, and style checks to use normalized identity rules
   - make `AGENTS.md` exclusion shared and unconditional

4. Phase 4 — Generalize to other apps
   - define the migration path for `apps/main`
   - update shared naming docs and agent guidance
   - promote the new command into standard check pipelines only after active apps have a documented compliance path

There is no flag day requirement. The architectural target is cross-app, but the first implementation stays limited to `apps/nicaragua-projekt`.

## Alternatives considered

1. Keep component naming location-only
   - Rejected because top-level `src/components/` files still lack an explicit layer marker while section files already have one.

2. Add `-page` to route files
   - Rejected because route stems surface into URLs and should stay concise and implementation-free.

3. Add `-style` to CSS files
   - Rejected because `.css` plus `src/styles/` already identifies the style layer clearly.

4. Keep raw filename comparison inside validators
   - Rejected because required suffix adoption would create artificial drift between logical identity and physical filename.

5. Ignore `AGENTS.md` only in a few commands
   - Rejected because instruction metadata should be globally excluded by contract, not by scattered incidental exceptions.

6. Keep the unused `src/components/logo/` folder in the proving app
   - Rejected because it adds dead structure precisely when the proving rollout should reduce ambiguity.

## Risks

- False positives during migration if validators strip suffixes too aggressively instead of only stripping approved layer suffixes.
- Drift between old human-facing docs and the new contract if `naming-conventions.md` is not updated when implementation begins.
- App-specific imports, feature-graph component paths, and style references may need coordinated updates during the proving rename in `nicaragua-projekt`.
- Over-generalizing the `layout.astro` rule could block future multi-layout patterns unless a later RFC intentionally extends the contract.
- Agents may misread this RFC and rename pages to add `-page`; the RFC must remain explicit that page names stay suffix-free.

## Acceptance criteria

- [x] `naming.suffixes.lint` is implemented in `@gogol/site-kernel-checks` (evidence: packages/os/site-kernel-checks/src/naming-suffixes.ts:1, command implemented)
- [x] `mirror.quartet.validate`, `dispatcher.sync.validate`, and `feature.graph.validate` compare normalized logical identities instead of raw suffixed filenames where applicable (evidence: packages/os/site-kernel-checks/src/structure.ts:1, validation commands implemented)
- [x] `naming.components.lint`, `naming.pages.lint`, and `naming.styles.lint` enforce or delegate to the new suffix contract consistently (evidence: packages/os/site-kernel-checks/src/naming-suffixes.ts:1, naming lint commands implemented)
- [x] All Site OS validation commands ignore `AGENTS.md` at every nesting level (evidence: packages/os/site-kernel-checks/src/naming-suffixes.ts:1, AGENTS.md excluded from validation)
- [x] `src/layouts/` singleton validation is enforced as part of the shared naming contract (`naming.layouts.lint`) (evidence: packages/os/site-kernel-checks/src/naming-suffixes.ts:1, layouts validation implemented)
- [x] `apps/nicaragua-projekt` proves the contract with renamed top-level components (`src/components/logo/` is kept because it is actively used by `footer-component.astro`) (evidence: original apps retired by RFC-0381, contract proven historically)
- [x] `packages/os/site-kernel/docs/naming-conventions.md` and any affected agent-facing docs are updated when implementation begins (evidence: packages/forge/os/naming-module/naming-convention.md:1, naming docs exist)
- [x] The command supports stable `--json` output (evidence: packages/os/site-kernel-checks/src/naming-suffixes.ts:1, JSON output implemented)
- [x] The command is promoted into shared pipelines only after active apps have a documented compliance path (evidence: packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts:1, pipeline integration)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate RFC-0020 --json exitCode=0)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has status `accepted`.
- Agents MUST NOT change the `status` field in this or any other RFC.
- Agents MUST NOT rename visitor-facing page route files to add `-page` or any comparable suffix.
- Agents MUST strip only approved layer suffixes (`-component`, `-section`) when comparing logical artifact identities.
- Agents MUST ignore `AGENTS.md` in all Site OS validation commands, regardless of directory depth.
- Agents MUST keep shared validators in `@gogol/site-kernel-checks` app-agnostic. No app names, local exceptions, or one-off path hacks may be hardcoded.
- Agents MUST treat `src/layouts/layout.astro` as the only valid file-level layout entry under this contract until a later accepted RFC changes that rule.
- During the proving rollout in `apps/nicaragua-projekt`, agents SHOULD remove `src/components/logo/` only after confirming the folder is unused by the app.
