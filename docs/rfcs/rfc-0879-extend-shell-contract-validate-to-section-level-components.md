---
id: RFC-0879
title: "Extend section.shell.contract.validate to section-level components"
status: draft
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-19
updatedAt: 2026-08-19
enhancedAt: 2026-08-19
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-8
  - DNA-37
  - RFC-0101
  - RFC-0108
  - RFC-0126
satisfies:
  - DNA-8
  - DNA-37
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - section.shell.contract.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "section.shell.contract.validate reports SHELL-01 violations for component-level blocks that render bare <section> or <article> without <SectionShell>"
  - "No false positives for pure sub-components (effect-host, section-header, brand-label, copyright, etc.)"
nonGoals:
  - "Do not change the SectionShell component itself"
  - "Do not add new shell rules beyond SHELL-01..04 scope"
  - "Do not scan app-local components — only shared package components"
  - "Do not restructure the archetype index YAML schema — only read it"
---

# RFC-0879: Extend section.shell.contract.validate to section-level components

## Context

The `section.shell.contract.validate` command (SHELL-01..04) is intended to enforce that every shared section in `packages/werkstatt-site/src/domain/ui/sections/` roots through `<SectionShell>`. This ensures consistent vertical spacing (`padding-block: var(--ds-size-section-padding-y)`), background paint, density control, and section numbering across all pages.

**Pre-existing path bug:** The current `walkAstroSections()` function at `shared.ts:94-97` uses the path `packages/werkstatt-site/src/domain/ui/src/sections/` (with an extra `src/` segment). The actual directory is `packages/werkstatt-site/src/domain/ui/sections/` (no intermediate `src/`). Because `collectFiles` silently swallows `readdir` errors (catch → return empty), the validator currently scans **zero files** — SHELL-01..04 is not enforcing anything. This RFC fixes the path bug as part of the same change.

Additionally, `blocks-renderer.astro` (line 66) loads components from `./components/*/*.astro` via `import.meta.glob`. The archetype registry (`packages/werkstatt-site/src/domain/ontology/archetypes/index.yaml`) registers several components with `layer: component` that are used as **section-level page blocks** — they receive `SectionProps` (including `sectionNumber`) and render as top-level sections on pages. These include:

- `nachweis-list` (Hydra)
- `nachweis-detail` (Kerberos)
- `nachweis-verify` (Styx)
- `nachweis-card` (Nix)
- `currency-aware-price-display` (Rosalind)
- `donation-card` (Pandora)
- `footer-promo` (Nereid)
- `media` (Sycorax)
- `mountain-journey` (Eris)
- `passport-header` (Methone)
- `passport-provenance` (Bianca)
- `passport-score-grid` (Klarissa)
- `passport-star-map` (Adrastea)
- `person-profile` (Miranda)
- `price-card` (Pan)
- `pulsar` (Despina)
- `section-body-offer-capacity` (Thalassa)
- `send-message` (Ceres)
- `social-proof` (Enceladus)
- `structured-data` (Triton)

The following registered components are **pure sub-components** — they have `layer: component` in the archetype index but are never used as top-level page blocks. They are excluded from scanning via the `UTILITY_COMPONENT_SLUGS` allow-list (see Design):

- `brand-label` (Proteus)
- `copyright` (Charon)
- `currency-selector` (Portia)
- `lang-switcher` (Ophelia)
- `layout` (Umbriel)
- `layout.not-found` (Cressida)
- `live-photo` (Aegaeon)
- `material-credit` (Cordelia)
- `responsive-image` (Belinda)
- `scroll-to-top` (Daphnis)
- `social-meta` (Naiad)

Because `walkAstroSections()` in `shared.ts:95` only scans `sections/` (and currently scans nothing due to the path bug), these component-level blocks bypass the SHELL-01 check entirely. This allowed three Nachweis components (`nachweis-list`, `nachweis-detail`, `nachweis-verify`) to render bare `<section>`/`<article>` elements without `<SectionShell>`, causing:

1. **Missing inter-section spacing** — no `padding-block: var(--ds-size-section-padding-y)`, sections sat flush against each other
2. **Missing section numbers** — `SectionHeader` was not receiving `sectionNumber` from `SectionProps`
3. **Missing background/density/tone controls** — no `SectionShell` props for visual consistency

## Problem

The SHELL-01 check has a **scope gap**: it only scans `sections/` but not `components/`. Components registered as section-level page blocks (via archetype `layer: component` + `blocks-renderer.astro` glob) are invisible to the check. This means:

- A component can be used as a page block without `<SectionShell>` wrapping and no check will catch it
- The missing wrapping causes visual regressions (no spacing, no numbering, no background control)
- The gap is **not detectable by any existing check** — `section.shell.contract.validate` skips `components/`, and no other check validates SectionShell usage

The root cause is in `walkAstroSections()` at `packages/werkstatt-site/src/checks/section-framework/shared.ts:94-97`:

```ts
export async function walkAstroSections(workspaceRoot: string): Promise<string[]> {
  // BUG: extra "src/" in path — actual dir is ui/sections/, not ui/src/sections/
  const root = join(workspaceRoot, "packages", "werkstatt-site", "src", "domain", "ui", "src", "sections");
  return collectFiles(root, { extensions: [".astro"], ignore: () => false });
}
```

It only walks `sections/` (and currently walks nothing due to the path bug), not `components/`. The fix has two parts: (1) correct the path in `walkAstroSections` and `walkSectionManifests` by removing the extra `src/` segment, and (2) also scan `components/` for files that are registered as section-level block types in the archetype registry.

The `sectionSlugOf()` regex at `shared.ts:85` has a related path bug — it matches `packages/ui/src/sections/` but the actual relative path is `packages/werkstatt-site/src/domain/ui/sections/`. This must also be corrected.

## Decision

The `section.shell.contract.validate` command gains a second scan target: `packages/werkstatt-site/src/domain/ui/components/`. It applies SHELL-01 (missing `<SectionShell>`), SHELL-02 (missing import), SHELL-03 (deleted `VisualModifiers` reference), and PARSE-01 (Astro parse failure) to any `.astro` file in `components/` that is registered in the archetype index with `layer: component` and not in the `UTILITY_COMPONENT_SLUGS` allow-list.

Pure sub-components (registered in the archetype index but never used as top-level page blocks) are excluded via `UTILITY_COMPONENT_SLUGS` — see the full list in the Context section above.

## Architectural fit

- **DNA-8 (Page → section → component → content hierarchy):** This RFC strengthens DNA-8 by ensuring that components acting as section-level blocks obey the same shell contract as sections.
- **DNA-37 (Universal Section Props Contract):** Section-level components receive `SectionProps` including `sectionNumber`. Without `<SectionShell>`, they cannot propagate `sectionNumber` to `<SectionHeader>`, violating the universal contract.
- **RFC-0101 (SectionShell):** The canonical wrapper component. This RFC extends its enforcement scope.
- **RFC-0126 (Utility section allow-list):** The `UTILITY_SECTION_SLUGS` allow-list (breadcrumbs, navigation) applies to sections. This RFC introduces an analogous mechanism for components — the archetype registry acts as the allow-list (only registered components are checked).

## Design

### CLI surface

No CLI change. The command name remains `section.shell.contract.validate`. The scan scope expands internally.

### TypeScript contracts

A new helper function `walkSectionLevelComponents()` is added to `shared.ts`:

```ts
export async function walkSectionLevelComponents(workspaceRoot: string): Promise<string[]> {
  const componentsRoot = join(
    workspaceRoot,
    "packages",
    "werkstatt-site",
    "src",
    "domain",
    "ui",
    "components",
  );
  const allComponentFiles = await collectFiles(componentsRoot, {
    extensions: [".astro"],
    ignore: () => false,
  });

  // Load the archetype index to find which component directories are registered
  // as section-level blocks (layer: component). The index is in werkstatt-site,
  // NOT werkstatt-shared.
  const archetypeIndexPath = join(
    workspaceRoot,
    "packages",
    "werkstatt-site",
    "src",
    "domain",
    "ontology",
    "archetypes",
    "index.yaml",
  );
  let archetypeIndex: string;
  try {
    archetypeIndex = await readFile(archetypeIndexPath, "utf-8");
  } catch {
    // Archetype index missing — cannot determine section-level components.
    // Return empty rather than crashing the entire pipeline.
    return [];
  }
  const parsed = parseYaml(archetypeIndex) as {
    entries?: Array<{ id: string; layer: string; sourceFile?: string }>;
  };

  // Build a set of directory names from sourceFile paths.
  // sourceFile is like "packages/werkstatt-site/src/domain/ontology/archetypes/components/not-found.yaml"
  // The component directory name is extracted from the path: "not-found".
  // This maps to the actual filesystem directory: components/not-found/*.astro
  const sectionLevelDirs = new Set(
    (parsed.entries ?? [])
      .filter((e) => e.layer === "component" && e.sourceFile?.includes("/components/"))
      .map((e) => {
        const m = e.sourceFile?.match(/\/components\/([^/]+)\.yaml$/);
        return m ? m[1] : null;
      })
      .filter((d): d is string => d !== null),
  );

  // Filter: only include component files whose directory name matches a registered
  // component directory AND is not in the utility allow-list.
  return allComponentFiles.filter((file) => {
    const match = file.match(/components\/([^/]+)\//);
    if (!match) return false;
    const dir = match[1];
    if (UTILITY_COMPONENT_SLUGS.has(dir)) return false;
    return sectionLevelDirs.has(dir);
  });
}
```

The `UTILITY_COMPONENT_SLUGS` allow-list is defined in `shared.ts`:

```ts
export const UTILITY_COMPONENT_SLUGS: ReadonlySet<string> = new Set([
  "brand-label",
  "copyright",
  "currency-selector",
  "lang-switcher",
  "layout",
  "not-found",       // archetype id: layout.not-found
  "live-photo",
  "material-credit",
  "responsive-image",
  "scroll-to-top",
  "social-meta",
]);
```

The existing `walkAstroSections` and `walkSectionManifests` functions are also fixed — the extra `src/` segment is removed:

```ts
export async function walkAstroSections(workspaceRoot: string): Promise<string[]> {
  const root = join(workspaceRoot, "packages", "werkstatt-site", "src", "domain", "ui", "sections");
  return collectFiles(root, { extensions: [".astro"], ignore: () => false });
}

export async function walkSectionManifests(workspaceRoot: string): Promise<string[]> {
  const root = join(workspaceRoot, "packages", "werkstatt-site", "src", "domain", "ui", "sections");
  return collectFiles(root, { extensions: [".manifest.yaml"], ignore: () => false });
}
```

The `sectionSlugOf` regex is also corrected to match the actual path structure:

```ts
export function sectionSlugOf(relPath: string): string | null {
  const m = relPath.match(/packages\/werkstatt-site\/src\/domain\/ui\/sections\/([^/]+)\//);
  return m ? m[1] : null;
}
```

The `runSectionShellContractValidate` function in `shell.ts` is updated to scan both:

```ts
const sectionFiles = await walkAstroSections(context.workspaceRoot);
const componentFiles = await walkSectionLevelComponents(context.workspaceRoot);
const files = [...sectionFiles, ...componentFiles];
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/domain/ui/sections/**/*.astro` | Scanned (existing, path fixed) |
| `packages/werkstatt-site/src/domain/ui/components/**/*.astro` | Scanned (new) — filtered by archetype registry + utility allow-list |
| `packages/werkstatt-site/src/domain/ontology/archetypes/index.yaml` | Read to determine which components are section-level blocks |

### Output format

No change. Same `CheckResult` with `Violation[]`:

```json
{
  "command": "section.shell.contract.validate",
  "status": "fail",
  "violations": [
    {
      "file": "packages/werkstatt-site/src/domain/ui/components/nachweis-list/nachweis-list-component.astro",
      "rule": "SHELL-01",
      "message": "Section root must be <SectionShell>; <SectionShell> not found in file.",
      "fix": "Wrap the section in <SectionShell slug=...> + <SectionHeader> + body component."
    }
  ]
}
```

### Failure modes

- **SHELL-01** (error): Component-level block has no `<SectionShell>` or contains raw `<section>` elements.
- **SHELL-02** (error): `<SectionShell>` used without matching import.
- **SHELL-03** (error): Reference to deleted `VisualModifiers` / `visualModifierSchema`.
- **PARSE-01** (error): Astro parse failed.
- **False positive risk:** Pure sub-components that ARE registered in the archetype index with `layer: component` but are never used as top-level page blocks (e.g. `responsive-image`, `live-photo`, `brand-label`, `copyright`, `lang-switcher`, `scroll-to-top`, `material-credit`, `social-meta`) are excluded via `UTILITY_COMPONENT_SLUGS`. Components not registered in the archetype index at all (e.g. `effect-host`, `section-header`, `section-shell` itself) are also excluded — the filter only includes directories matching registered archetype `sourceFile` paths.
- **Utility components:** Components that are registered but are structural shells, not visual sections (e.g. `layout`, `layout.not-found` → directory `not-found`), are excluded via `UTILITY_COMPONENT_SLUGS`.
- **IO-01** (warning): Archetype index file missing — `walkSectionLevelComponents` returns empty and logs a warning. Does not crash the pipeline.

## Rollout

- **Default behavior:** The expanded scan is active immediately. All existing components that are registered as section-level blocks must already use `<SectionShell>` or will be flagged.
- **Migration:** Any component currently missing `<SectionShell>` must be wrapped. The three Nachweis components (`nachweis-list`, `nachweis-detail`, `nachweis-verify`) were already fixed in a prior session.
- **Pipeline integration:** No change — `section.shell.contract.validate` already runs in `PACKAGES_CHECK_PIPELINE`. The expanded scope is transparent.
- **New components:** Any new component registered in the archetype index with `layer: component` is automatically scanned. No opt-in needed.

## Alternatives considered

1. **Scan all `components/**/*.astro` without filtering.** Rejected — would produce false positives for pure sub-components like `effect-host`, `section-header`, `section-shell` itself, `responsive-image`, etc. that are never used as page blocks.

2. **Add a `shell: true` flag to archetype YAML.** Rejected — adds authoring burden. The archetype registry already distinguishes section-level blocks via `layer: component` + `sourceFile` location. This is sufficient signal.

3. **Move section-level components into `sections/`.** Rejected — the `components/` vs `sections/` distinction is intentional. Components are reusable building blocks that may appear in multiple contexts. Moving them would break the composition model.

4. **Create a separate check `component.shell.contract.validate`.** Rejected — the rules are identical (SHELL-01..04). Splitting into two commands adds pipeline configuration burden without semantic value.

## Risks

- **Performance:** Additional file scanning and YAML parsing. The archetype index is ~27KB. Mitigated by the WeakMap AST cache in `shared.ts` — the YAML is parsed once per invocation (not per file).
- **False positives for edge cases:** Components like `layout` and `layout.not-found` are registered with `layer: component` but are structural shells, not visual sections. Mitigated by the `UTILITY_COMPONENT_SLUGS` allow-list mechanism (analogous to `UTILITY_SECTION_SLUGS`).
- **Archetype index format changes:** If the YAML schema for the archetype index changes, the parser in `walkSectionLevelComponents` must be updated. Low risk — the schema is stable.
- **Compass sync:** `docs/verification-plan.xml` may need a new verification method entry for component-level shell enforcement. `packages/werkstatt-site/AGENTS.md` § Check commands should be updated to note the expanded scope of `section.shell.contract.validate`.

## Acceptance criteria

- [ ] `walkSectionLevelComponents()` helper added to `shared.ts`
- [ ] `runSectionShellContractValidate` scans both `sections/` and section-level `components/`
- [ ] `UTILITY_COMPONENT_SLUGS` allow-list added for `layout`, `not-found`, `brand-label`, `copyright`, `currency-selector`, `lang-switcher`, `live-photo`, `material-credit`, `responsive-image`, `scroll-to-top`, `social-meta`
- [ ] Unit test: component with `<SectionShell>` passes
- [ ] Unit test: component without `<SectionShell>` fails with SHELL-01
- [ ] Unit test: pure sub-component not in archetype registry (e.g. `effect-host`) is not scanned
- [ ] Unit test: registered sub-component in `UTILITY_COMPONENT_SLUGS` (e.g. `responsive-image`, `live-photo`) is not scanned
- [ ] Existing `nachweis-list`, `nachweis-detail`, `nachweis-verify` pass (already fixed)
- [ ] `section.shell.contract.validate` integrated into `PACKAGES_CHECK_PIPELINE` (no change needed)
- [ ] `packages/werkstatt-site/AGENTS.md` updated with note about component-level shell enforcement
- [ ] Pre-existing `walkAstroSections` path bug fixed (extra `src/` removed)
- [ ] Pre-existing `walkSectionManifests` path bug fixed (extra `src/` removed)
- [ ] Pre-existing `sectionSlugOf` regex fixed to match actual path structure
- [ ] `docs/verification-plan.xml` updated if a new verification method entry is needed

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it.
