---
id: RFC-0879
title: "Extend section.shell.contract.validate to section-level components"
status: draft
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-19
updatedAt: 2026-08-19
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
  - "No false positives for pure sub-components (effect-host, section-header, responsive-image, etc.)"
nonGoals:
  - "Do not change the SectionShell component itself"
  - "Do not add new shell rules beyond SHELL-01..04 scope"
  - "Do not scan app-local components — only shared package components"
---

# RFC-0879: Extend section.shell.contract.validate to section-level components

## Context

The `section.shell.contract.validate` command (SHELL-01..04) enforces that every shared section in `packages/werkstatt-site/src/domain/ui/sections/` roots through `<SectionShell>`. This ensures consistent vertical spacing (`padding-block: var(--ds-size-section-padding-y)`), background paint, density control, and section numbering across all pages.

However, `blocks-renderer.astro` (line 66) also loads components from `./components/*/*.astro` via `import.meta.glob`. The archetype registry (`packages/werkstatt-shared/src/ontology/archetypes/index.yaml`) registers several components with `layer: component` that are used as **section-level page blocks** — they receive `SectionProps` (including `sectionNumber`) and render as top-level sections on pages. These include:

- `nachweis-list` (Hydra)
- `nachweis-detail` (Kerberos)
- `nachweis-verify` (Styx)
- `nachweis-card` (Nix)
- `currency-aware-price-display` (Rosalind)
- `donation-card` (Pandora)
- `footer-promo` (Nereid)
- `live-photo` (Aegaeon)
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

Because `walkAstroSections()` in `shared.ts:95` only scans `packages/werkstatt-site/src/domain/ui/sections/`, these component-level blocks bypass the SHELL-01 check entirely. This allowed three Nachweis components (`nachweis-list`, `nachweis-detail`, `nachweis-verify`) to render bare `<section>`/`<article>` elements without `<SectionShell>`, causing:

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
  const root = join(workspaceRoot, "packages", "werkstatt-site", "src", "domain", "ui", "src", "sections");
  return collectFiles(root, { extensions: [".astro"], ignore: () => false });
}
```

It only walks `sections/`, not `components/`. The fix is to also scan `components/` for files that are registered as section-level block types in the archetype registry.

## Decision

The `section.shell.contract.validate` command gains a second scan target: `packages/werkstatt-site/src/domain/ui/components/`. It applies SHELL-01 (missing `<SectionShell>`) and SHELL-02 (missing import) to any `.astro` file in `components/` that is registered in the archetype index with `layer: component`.

Pure sub-components (not registered in the archetype index) are excluded — they are never used as page blocks and do not need `<SectionShell>`.

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

  // Load the archetype index to find which component IDs are registered as
  // section-level blocks (layer: component).
  const archetypeIndexPath = join(
    workspaceRoot,
    "packages",
    "werkstatt-shared",
    "src",
    "ontology",
    "archetypes",
    "index.yaml",
  );
  const archetypeIndex = await readFile(archetypeIndexPath, "utf-8");
  const parsed = parseYaml(archetypeIndex) as { entries?: Array<{ id: string; layer: string; sourceFile?: string }> };
  const sectionLevelIds = new Set(
    (parsed.entries ?? [])
      .filter((e) => e.layer === "component" && e.sourceFile?.includes("/components/"))
      .map((e) => e.id),
  );

  // Filter: only include component files whose directory name matches a registered ID.
  return allComponentFiles.filter((file) => {
    const match = file.match(/components\/([^/]+)\//);
    return match && sectionLevelIds.has(match[1]);
  });
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
|---|---|
| `packages/werkstatt-site/src/domain/ui/sections/**/*.astro` | Scanned (existing) |
| `packages/werkstatt-site/src/domain/ui/components/**/*.astro` | Scanned (new) — filtered by archetype registry |
| `packages/werkstatt-shared/src/ontology/archetypes/index.yaml` | Read to determine which components are section-level blocks |

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
- **False positive risk:** Pure sub-components (e.g. `effect-host`, `section-header`, `responsive-image`, `live-photo`) that are not registered in the archetype index are excluded. Only components with `layer: component` in the archetype index are scanned.
- **Utility components:** Components that are registered but should not be checked (e.g. `layout`, `layout.not-found`) can be added to a `UTILITY_COMPONENT_SLUGS` allow-list analogous to `UTILITY_SECTION_SLUGS`.

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

- **Performance:** Additional file scanning and YAML parsing. Mitigated by the WeakMap AST cache in `shared.ts` and the fact that the archetype index is a single small YAML file.
- **False positives for edge cases:** Components like `layout` and `layout.not-found` are registered with `layer: component` but are structural shells, not visual sections. Mitigated by the `UTILITY_COMPONENT_SLUGS` allow-list mechanism (analogous to `UTILITY_SECTION_SLUGS`).
- **Archetype index format changes:** If the YAML schema for the archetype index changes, the parser in `walkSectionLevelComponents` must be updated. Low risk — the schema is stable.

## Acceptance criteria

- [ ] `walkSectionLevelComponents()` helper added to `shared.ts`
- [ ] `runSectionShellContractValidate` scans both `sections/` and section-level `components/`
- [ ] `UTILITY_COMPONENT_SLUGS` allow-list added for `layout`, `layout.not-found`
- [ ] Unit test: component with `<SectionShell>` passes
- [ ] Unit test: component without `<SectionShell>` fails with SHELL-01
- [ ] Unit test: pure sub-component (not in archetype registry) is not scanned
- [ ] Unit test: utility component (in allow-list) is not scanned
- [ ] Existing `nachweis-list`, `nachweis-detail`, `nachweis-verify` pass (already fixed)
- [ ] `section.shell.contract.validate` integrated into `PACKAGES_CHECK_PIPELINE` (no change needed)
- [ ] `AGENTS.md` updated with note about component-level shell enforcement

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it.
