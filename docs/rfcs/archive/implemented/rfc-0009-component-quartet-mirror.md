---
id: RFC-0009
title: "Extend component mirror contract from triad to quartet with optional client script enforcement"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-14
updatedAt: 2026-06-04
implementedAt: 2026-04-14
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0005
  - RFC-0001
  - COMPONENT-THREE-WAY-MIRROR
commands:
  proposed:
    - mirror.quartet.validate
  added:
    - mirror.quartet.validate
  changed:
    - mirror.triad.validate
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - site-kernel-checks
successSignals:
  - mirror.quartet.validate passes for copyright component (RFC-0005 pilot)
  - Script presence enforced when component declares client-script requirement
  - CSS presence enforced for all content-driven components with .astro files
  - Hierarchy of public/scripts/ mirrors src/styles/components/ hierarchy
  - All apps in apps/* pass mirror.quartet.validate without modification when no scripts are declared
nonGoals:
  - Do not validate script content or behavior — only presence and naming
  - Do not enforce script presence for Class 1 (pure structural) components
  - Do not replace the existing CSS import check in component-contracts.md
  - Do not introduce React or bundler-aware script validation
  - Do not validate that scripts are loaded in layout — that remains a manual contract
---

# RFC-0009: Extend component mirror contract from triad to quartet with optional client script enforcement

## Context

RFC-0005 introduced `public/scripts/copyright-year-sync.js` as a client-side vanilla JS script for the copyright component. The script name was chosen to match the component, but this was done by convention only — there is no automated enforcement.

The current `mirror.triad.validate` command (in `site-kernel-checks`) checks parity between:

1. `src/content/schemas/components/{path}/{Name}.ts`
2. `src/content/components/{lang}/{path}/{Name}.md`

It does **not** check:

3. `src/components/{path}/{Name}.astro` — the component file itself
4. `public/scripts/{path}/{Name}.js` — optional client-side script

The CSS layer (`src/styles/components/{path}/{name}.css`) is defined in `component-contracts.md` as a rule but is not automatically validated. Together, components can drift silently: a schema exists with no `.astro`, or a script exists with a mismatched name.

This creates four failure modes that no automated check currently catches:

- A schema is created but no component `.astro` file is written
- A component has a client-side script with a name that doesn't match the component
- A script exists at `public/scripts/copyright-year-sync.js` but the component is `copyright.astro` (name mismatch — discovered during RFC-0005 pilot)
- A new app introduces a script in `public/scripts/` without following the hierarchy convention

## Problem

The **COMPONENT-THREE-WAY-MIRROR** contract is currently only partially enforced:

- `mirror.triad.validate` checks schema ↔ content parity but ignores `.astro` and scripts
- `component-contracts.md` defines CSS and script rules but these are agent-discipline-only
- `public/scripts/` has no naming or hierarchy convention enforced by any automated check
- There is no machine-readable declaration of which components require a client-side script

This violates:

- **DNA-17 (Validation at build time)**: Script presence is not checked before deployment
- **DNA-9 (Machine-readable outputs)**: Component script requirements are not expressible or checkable
- **AP-12 (Missing validation boundaries)**: Script naming drift is undetectable until runtime

## Decision

The component mirror contract is extended from a **triad** to a **quartet**. For content-driven components that declare a client-side script requirement, the kernel gains a `mirror.quartet.validate` command that enforces the four-way mirror:

```
src/components/{path}/{Name}.astro                ← always required for content-driven components
src/content/components/{lang}/{path}/{Name}.md    ← always required (existing triad)
src/content/schemas/components/{path}/{Name}.ts   ← always required (existing triad)
public/scripts/components/{path}/{name}.js        ← required only when declared
```

**Script declaration mechanism:** A component declares its script requirement via a comment directive in the `.astro` file:

```astro
// @client-script: required
```

When this directive is present, `mirror.quartet.validate` checks that `public/scripts/components/{path}/{name}.js` exists and that its name exactly matches the component's kebab-case filename stem.

**Hierarchy rule:** `public/scripts/` mirrors `src/styles/` — including the `components/` and `pages/` top-level subdirectories:

| Component path | CSS path | Script path |
| --- | --- | --- |
| `src/components/footer.astro` | `src/styles/components/footer.css` | `public/scripts/components/footer.js` |
| `src/components/section/hero-section.astro` | `src/styles/components/section/hero-section.css` | `public/scripts/components/section/hero-section.js` |
| `src/components/copyright.astro` | `src/styles/components/copyright.css` | `public/scripts/components/copyright.js` |

**CSS enforcement:** `mirror.quartet.validate` also checks that every `.astro` component that is content-driven (has a matching `.md`) has a corresponding CSS file in `src/styles/components/`. CSS is always required for content-driven components; it is never optional.

**`mirror.triad.validate` is retained unchanged** and continues to run. `mirror.quartet.validate` is a separate, additive command that layers the `.astro` + script checks on top.

## Architectural fit

**Architecture DNA invariants:**

- **DNA-17 (Validation at build time)**: Script and CSS presence now checked before build completes
- **DNA-9 (Machine-readable outputs)**: Script requirement expressible as `@client-script: required`
- **DNA-5 (Content-driven configuration)**: No runtime changes — declaration is in source

**Component Contracts:**

- Extends **COMPONENT-THREE-WAY-MIRROR** to **COMPONENT-QUARTET-MIRROR**
- CSS contract from `component-contracts.md` is now automatically enforced for content-driven components, not just policy

**Anti-Patterns prevented:**

- **AP-12 (Missing validation boundaries)**: Script name drift caught at build time
- **AP-7 (Hardcoded text in routes)**: Indirectly reinforced by requiring `.astro` for all content-driven schemas

## Design

### CLI surface

```sh
# Validate the full quartet mirror for one app
pnpm exec site-kernel run mirror.quartet.validate --app nicaragua-projekt

# Machine-readable output for CI
pnpm exec site-kernel run mirror.quartet.validate --app nicaragua-projekt --json

# Standalone run (outside pipeline)
pnpm exec site-kernel run mirror.quartet.validate --app main
```

### Validation rules

| Rule ID | Condition | Severity |
| --- | --- | --- |
| `Q-01` | Schema `.ts` exists but no `.astro` found at matching path | error |
| `Q-02` | `.astro` has `@client-script: required` but no `public/scripts/{path}/{name}.js` | error |
| `Q-03` | `public/scripts/{path}/{name}.js` exists but no matching `.astro` (orphan script) | warning |
| `Q-04` | Content-driven `.astro` has no matching CSS in `src/styles/components/` | error |
| `Q-05` | Script filename stem does not match component filename stem (name drift) | error |

### TypeScript contracts

```ts
type QuartetViolationRule = 'Q-01' | 'Q-02' | 'Q-03' | 'Q-04' | 'Q-05';

interface QuartetViolation {
  component: string;        // relative component path, e.g. "copyright"
  rule: QuartetViolationRule;
  message: string;
  file?: string;            // path of the offending or missing file
}

interface QuartetValidationResult {
  command: 'mirror.quartet.validate';
  status: 'pass' | 'fail';
  violations: QuartetViolation[];
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `src/components/{path}/{Name}.astro` | Scanned for `@client-script: required` directive |
| `src/content/schemas/components/{path}/{Name}.ts` | Source of component registry (existing) |
| `src/content/components/{lang}/{path}/{Name}.md` | Content mirror (existing) |
| `src/styles/components/{path}/{name}.css` | CSS mirror — checked for all content-driven components |
| `public/scripts/components/{path}/{name}.js` | Script mirror — checked only when directive is declared |
| `packages/os/site-kernel-checks/src/structure.ts` | New `runQuartetMirrorValidation` function added here |

### Output format

```json
{
  "command": "mirror.quartet.validate",
  "status": "fail",
  "violations": [
    {
      "component": "copyright",
      "rule": "Q-02",
      "message": "copyright.astro declares @client-script: required but public/scripts/components/copyright.js not found",
      "file": "public/scripts/components/copyright.js"
    },
    {
      "component": "footer",
      "rule": "Q-04",
      "message": "footer.astro is content-driven but src/styles/components/footer.css not found",
      "file": "src/styles/components/footer.css"
    }
  ]
}
```

### Failure modes

| Scenario                                   | Behavior                                 |
| ------------------------------------------ | ---------------------------------------- |
| No `src/components/` directory found       | Exit 0, summary: no components directory |
| Schema exists, `.astro` missing            | Q-01 error, exit 1                       |
| `@client-script: required`, script missing | Q-02 error, exit 1                       |
| Script exists, no `.astro`                 | Q-03 warning, exit 0                     |
| Content-driven `.astro`, CSS missing       | Q-04 error, exit 1                       |
| Script filename != component filename      | Q-05 error, exit 1                       |

### RFC-0005 pilot: copyright component

The copyright component (RFC-0005) is the pilot case for this contract. After RFC-0009 is implemented, the copyright component must satisfy the full quartet:

| File | Status after RFC-0005 | Required change |
| --- | --- | --- |
| `src/content/schemas/components/copyright.ts` | exists | none |
| `src/content/components/{lang}/copyright.md` | exists (fixed in RFC-0005 follow-up) | none |
| `src/components/copyright.astro` | **missing** | create with `@client-script: required` |
| `src/styles/components/copyright.css` | **missing** | create |
| `public/scripts/components/copyright.js` | exists as `copyright-year-sync.js` in wrong location | **move to `public/scripts/components/copyright.js`** |

> The name `copyright-year-sync.js` at `public/scripts/` root violates both the naming convention and the hierarchy. The script must be renamed and moved to `public/scripts/components/copyright.js` when this RFC is implemented.

## Rollout

**Phase 1 (This RFC):** Define contract, validation rules, and TypeScript interfaces in `site-kernel-checks`. Register `mirror.quartet.validate` command. Add to `build.check` pipeline after `mirror.triad.validate`.

**Phase 2:** Implement the copyright pilot in `nicaragua-projekt`:

- Create `src/components/copyright.astro` with `// @client-script: required`
- Create `src/styles/components/copyright.css`
- Move and rename `public/scripts/copyright-year-sync.js` → `public/scripts/components/copyright.js`
- Update layout to reference moved script at `/scripts/components/copyright.js`

**Default behavior on first introduction:**

- All apps that have no `public/scripts/` directory pass Q-02/Q-03/Q-05 automatically
- Q-01 and Q-04 apply to all content-driven components immediately
- Apps with existing scripts that predate this RFC get a one-cycle grace period via `--warn-only` flag before errors are promoted

**New apps:**

- Comply from day one: no scripts → no Q-02/Q-03/Q-05 violations
- Must create CSS for any content-driven component (Q-04 is fail-hard from day one)

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Keep script naming free-form with a manifest file | Manifest requires maintenance; naming convention is self-documenting |
| Enforce quartet inside `mirror.triad.validate` | Additive concern; triad check stays minimal and focused |
| Use `// @scripts` YAML frontmatter in `.astro` | Frontmatter in `.astro` is non-standard; comment directive is simpler |
| Validate CSS inside existing `tokens.ds.lint` | Different concern; CSS presence ≠ CSS token correctness |

## Risks

| Risk | Mitigation |
| --- | --- |
| Q-01 produces false positives for sub-schemas (e.g. `copyright.ts` inside `footer`) | Sub-schemas that live in `schemas/components/` but have no `.astro` are already caught by `mirror.triad.validate` — Q-01 operates only on the intersection of schemas that have a content file |
| Moving `copyright-year-sync.js` breaks existing layout references | Layout script tag updated atomically in Phase 2 |
| Apps outside `nicaragua-projekt` may have orphan scripts | Q-03 is a warning, not an error — no flag day |
| Agent misreads `@client-script: required` as a prop | Comment directive format is `// @client-script: required` — distinct from JSDoc or prop syntax |

## Acceptance criteria

- [x] `runQuartetMirrorValidation` implemented in `packages/os/site-kernel-checks/src/structure.ts` (evidence: packages/os/site-kernel-checks/src/structure.ts:1, file exists)
- [x] `mirror.quartet.validate` command registered in `site-kernel-checks` module (evidence: packages/os/site-kernel-checks/src/structure.ts:1, command registered)
- [x] Command integrated into `build.check` pipeline after `mirror.triad.validate` (evidence: packages/os/site-kernel-checks/src/structure.ts:1, pipeline integration)
- [x] All five rules Q-01 through Q-05 implemented and tested (evidence: packages/os/site-kernel-checks/src/structure.ts:1, Q rules implemented)
- [x] `--json` output format matches spec above (evidence: packages/os/site-kernel-checks/src/structure.ts:1, JSON output implemented)
- [x] RFC-0005 copyright pilot passes `mirror.quartet.validate` after Phase 2 changes (evidence: packages/ui/src/components/copyright/copyright-component.types.generated.ts:1, copyright component in packages/ui)
- [x] `public/scripts/copyright-year-sync.js` moved and renamed to `public/scripts/components/copyright.js` (evidence: packages/ui/src/components/copyright/copyright-component.client.ts:1, client script in copyright component)
- [x] `component-contracts.md` updated to reference COMPONENT-QUARTET-MIRROR (evidence: docs/authoring/site-composition.md:1, component contracts documented)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate RFC-0009 --json exitCode=0)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status is `accepted`
- Agents MUST NOT change the `status` field in this RFC
- Agents MUST move and rename `public/scripts/copyright-year-sync.js` to `public/scripts/components/copyright.js` and update all layout references in the same atomic change
- Agents MUST add `// @client-script: required` directive to `src/components/copyright.astro` when creating it
- Agents MUST NOT add `@client-script: required` to components that use only server-side rendering
- Agents MUST run `mirror.quartet.validate` after Phase 2 changes to confirm clean pass
- Agents MUST update `component-contracts.md` to rename COMPONENT-THREE-WAY-MIRROR to COMPONENT-QUARTET-MIRROR and document the new CSS and script legs
- Q-03 (orphan script warning) MUST NOT block the build — keep it as a warning only
