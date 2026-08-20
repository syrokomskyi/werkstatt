---
id: RFC-0893
title: "Add icon.references.validate command for build-time vendor icon existence checks"
status: draft
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-20
updatedAt: 2026-08-20
enhancedAt: 2026-08-20
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0100
  - RFC-0103
  - RFC-0104
dependsOn: []
satisfies:
  - DNA-38
versionBump: minor
commands:
  proposed:
    - icon.references.validate
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "Missing vendor icon references are caught at build time, not at runtime"
  - "No console.warn from loadVendorIcon reaches production for referenced icons"
nonGoals:
  - "Validating favicon or public-surface icons (already covered by public.icons.validate)"
  - "Validating icon visual quality or animation correctness"
  - "Generating icon components (already handled by icons.generate)"
  - "Scanning .astro component source for inline loadVendorIcon calls — all actual calls use variable references (item.icon, card.icon, icon), not literal VendorIconConfig objects"
  - "Validating archetype YAML schema definitions in packages/werkstatt-shared/src/ontology/archetypes/ — these define shapes, not content references"
---

# RFC-0893: Add icon.references.validate command for build-time vendor icon existence checks

## Context

Sites reference vendor icons (LordIcon, etc.) via `VendorIconConfig` objects (`{ vendor, collection, name }`) embedded in content markdown frontmatter and YAML block props. The icon resolver at `packages/werkstatt-site/src/domain/ui/icons/icon-resolver.ts` loads these dynamically at runtime via `import.meta.glob` and `loadVendorIcon()`.

When an icon name doesn't match any generated component, `loadVendorIcon` emits a `console.warn` and returns `null` — the icon silently disappears from the page. This is a runtime-only signal invisible to CI and easy to miss in dev.

A recent incident (mission warpgogol-com-m000079) demonstrated the gap: the `TimeClockHover` icon was referenced in content but did not exist in the `doodle-outline` collection. The correct name was `ClockTimeHover`. The bug was only caught by manual visual inspection of the rendered page.

## Problem

There is no build-time validator that checks whether `VendorIconConfig` references in content resolve to actual generated icon components. The current safeguards are:

1. **`public.icons.validate`** — validates favicon/manifest artifacts only (PNG sizes, manifest entries, `<head>` links). Does not check vendor icon references in content.
2. **`icons.generate`** — generates `.astro` components from LordIcon JSON files. Does not validate that content references match generated output.
3. **`loadVendorIcon` runtime warning** — `console.warn` if icon not found. Invisible in CI, easy to miss in dev, silent in production.

Because all sites in the Werkstatt are thin composition layers, they depend entirely on the workshop's shared icon collection. If a site references an icon that doesn't exist in `packages/werkstatt-site/src/domain/ui/icons/gen/`, the icon is silently absent from the rendered page. This violates the principle that sites should be verifiable against the workshop's available assets at build time.

## Decision

Introduce a new Site OS command `icon.references.validate` (scope: `app`) that scans content markdown files and YAML block props for `VendorIconConfig` references and checks each one against the available generated icon components.

The command emits `ICON-REF-01` errors for referenced icons that do not resolve to a generated component file.

## Architectural fit

- **Site OS operator model**: The command is an app-scoped validator that reads authored source files and generated icon components. It belongs in the `checks` module alongside other author-time validators.
- **Thin site principle**: Sites are thin composition layers. All icon assets live in `packages/werkstatt-site/src/domain/ui/icons/gen/`. This command enforces that sites only reference icons that the workshop actually provides.
- **Existing icon infrastructure**: Aligns with `icons.generate` (produces components) and `loadVendorIcon` (runtime resolver). This command adds the missing build-time validation layer.
- **Pipeline integration**: Runs in `SITES_CHECK_AUTHOR_PIPELINE` after `icons.generate` (which runs in `SITES_BUILD_PREPARE_PIPELINE`) and before `generated.files.validate`, so missing icons are caught before the build proceeds.
- **Section framework alignment**: RFC-0100 established canonical `VendorIconConfig`-based item objects (DNA-38) for list sections. RFC-0103 extended these contracts to section body components. RFC-0104 added the canonical CTA and section image primitives that also carry `VendorIconConfig`. This validator enforces that all icon references authored through these contracts resolve to real generated components.
- **Compass sync**: Adding this command requires updating `docs/verification-plan.xml` with the new validator entry.
- **AGENTS.md update**: `packages/werkstatt-site/AGENTS.md` must list `icon.references.validate` in the notable check commands section.

## Design

### CLI surface

```sh
pnpm exec werkstatt run icon.references.validate --site warpgogol-com
pnpm exec werkstatt run icon.references.validate --site warpgogol-com --json
pnpm exec werkstatt run icon.references.validate --all
```

Flags:

- `--site <id>` (required, unless `--all`): target site workspace
- `--all`: run across all active site workspaces
- `--json`: machine-readable output
- No `--strict` flag — violations are always errors (fail-closed)

### TypeScript contracts

```ts
interface IconReferenceViolation {
  rule: "ICON-REF-01" | "ICON-REF-02" | "ICON-REF-03";
  file: string;
  line: number;
  vendor: string;
  collection: string;
  name: string;
  message: string;
}

interface IconReferencesValidateData {
  violations: IconReferenceViolation[];
  checkedCount: number;
  availableIcons: number;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `<app>/src/content/**/*.md` | Scanned for `VendorIconConfig` in YAML frontmatter and block props |
| `<app>/src/content/**/*.yaml` | Scanned for `VendorIconConfig` in standalone YAML block props |
| `packages/werkstatt-site/src/domain/ui/icons/gen/**/*.astro` | Read to build available-icon index (package-level, resolved via `import.meta.glob` in `icon-resolver.ts`) |

The command does NOT modify any files. It is read-only with respect to all scanned artifacts. This follows the principle that evaluation must not mutate its subject (K-0004).

### Detection strategy

1. **Build available-icon index**: Scan `packages/werkstatt-site/src/domain/ui/icons/gen/<vendor>/<collection>/` directories. For each `.astro` file, extract the vendor, collection, and icon name from the path structure (matching `resolveIconFileName` logic in `icon-resolver.ts`).

2. **Scan content files**: Parse all `src/content/**/*.md` files by extracting YAML frontmatter (delimited by `---`) and parsing it with the existing content schema infrastructure. Parse all `src/content/**/*.yaml` standalone files as YAML. In both cases, traverse the parsed data tree for objects matching the `VendorIconConfig` shape (`{ vendor: string, collection: string, name: string }`). Extract all such references with file path and line number.

3. **Cross-reference**: For each extracted `VendorIconConfig`, check if the resolved file path exists in the available-icon index. If not, emit `ICON-REF-01`.

### Output format

```json
{
  "command": "icon.references.validate",
  "status": "fail",
  "violations": [
    {
      "rule": "ICON-REF-01",
      "file": "src/content/de/nachweise.md",
      "line": 42,
      "vendor": "lordicon",
      "collection": "doodle-outline",
      "name": "TimeClockHover",
      "message": "Icon 'TimeClockHover' (lordicon/doodle-outline) does not exist in generated icon components. Available: ClockTimeHover, ..."
    }
  ],
  "checkedCount": 15,
  "availableIcons": 342
}
```

### Failure modes

- **ICON-REF-01** (error): A `VendorIconConfig` reference in content does not resolve to a generated `.astro` icon component. The command exits with `exitCode: 1`.
- **No icon references found**: The command passes with `checkedCount: 0`. This is not an error — some pages may not use icons.
- **Generated icon directory missing or empty**: The command emits a notice-level event (`ICON-REF-02`, warning) that `icons/gen/` doesn't exist or contains no `.astro` files, suggesting `icons.generate` hasn't run or produced no output. Does not fail the build.
- **Malformed `VendorIconConfig`** (missing `vendor`, `collection`, or `name` field): Emitted as `ICON-REF-03` (error) — this is a schema violation, not a missing-icon issue.

## Rollout

- **Default behavior**: fail-closed from day one. Missing icons are always errors. There is no warn-only grace period because the bug this prevents (silent missing icon) is already a production failure.
- **Existing apps**: All existing sites must pass. If any site currently references a non-existent icon, that reference must be fixed before the next build — this is the intended behavior (catching existing bugs).
- **New apps**: Automatically compliant — new sites get icon validation from their first `mission.validate` run.
- **Pipeline integration**: Added to `SITES_CHECK_AUTHOR_PIPELINE` after `public.icons.validate` and before `generated.marker.validate`. This position ensures the check runs during author-time validation, before build-only artifacts are checked.
- **No deprecation**: This command does not supersede any existing command. It fills a gap between `icons.generate` (production) and `loadVendorIcon` (runtime resolution).

## Alternatives considered

1. **Enhance `loadVendorIcon` to throw at build time**: Rejected because `loadVendorIcon` runs in the Astro frontmatter phase, not during a dedicated validation step. Throwing would crash the dev server for a single missing icon, making iteration painful. A dedicated validator provides better diagnostics (all violations at once) and runs only in CI/validate pipelines.

2. **Add icon checking to `content.references.validate`**: Rejected because `content.references.validate` checks internal page links and content references, not UI asset existence. Icon validation has a different scanning strategy (YAML/TS object shape matching vs. pageId resolution) and belongs in its own command for clarity.

3. **Zod schema validation with enum of available icons**: Rejected because the available icon set is dynamic (discovered from the filesystem at build time) and can't be hardcoded in a Zod schema. The validator must build the index at runtime from `icons/gen/`.

## Risks

- **False positives from dynamic icon names**: If content constructs icon names dynamically (e.g., from a variable in a code-in-markdown block), the scanner won't find a literal `VendorIconConfig` and may miss the reference. This is acceptable — dynamic icon names in content are rare and should be replaced with explicit references.
- **Performance**: Scanning all content files is O(n) in content files + O(m) in generated icons. With ~200 content files and ~350 icons, this is negligible (< 1s).

## Acceptance criteria

- [ ] TypeScript types and interfaces defined in `packages/werkstatt-site/src/checks/`
- [ ] CLI command registered as `icon.references.validate` with scope `app` in command-tables file `31-public-surface.ts` (alongside `public.icons.validate`)
- [ ] `--json` output format documented and stable
- [ ] Integrated into `SITES_CHECK_AUTHOR_PIPELINE` after `public.icons.validate`
- [ ] Unit tests cover: missing icon detected, existing icon passes, no icons passes, malformed config detected, empty `icons/gen/` emits ICON-REF-02
- [ ] `packages/werkstatt-site/AGENTS.md` updated with command description in the notable check commands section
- [ ] `docs/verification-plan.xml` updated with the new validator entry
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0893` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0893 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The validator MUST use the same `resolveIconFileName` logic as `icon-resolver.ts` to ensure build-time and runtime resolution are consistent. Import `resolveIconFileName` from `@warpgogol/werkstatt-site/ui/icons/icon-resolver` rather than duplicating the PascalCase-to-kebab-case conversion.
- The validator MUST scan content files (markdown frontmatter + standalone YAML block props) for `VendorIconConfig` references. Component source scanning is not needed — all `loadVendorIcon` calls in components use variable references (`item.icon`, `card.icon`, `icon`), not literal configs. The icon references originate from content, not from component source.
