---
id: RFC-0598
title: "Add section.css.import.validate for colocated CSS import integrity"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-07-30
updatedAt: 2026-07-30
enhancedAt: 2026-07-30
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-5
  - DNA-37
  - RFC-0101
  - RFC-0107
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-5
  - DNA-17
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed:
    - section.css.import.validate
  added:
    - section.css.import.validate
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "Every .css file under packages/ui/src/sections/ and packages/ui/src/components/ is imported by at least one .astro file"
  - "Every .css filename matches its colocated .astro filename (minus extension)"
  - "PACKAGES_CHECK_PIPELINE includes section.css.import.validate"
nonGoals:
  - "This RFC does not validate CSS content or token usage — that is owned by tokens.colors.section-shell.lint and tokens.section-shell.contract.validate"
  - "This RFC does not validate section manifest structure — that is owned by section.shell.contract.validate and related validators"
  - "This RFC does not check cross-package CSS imports — only colocated CSS within packages/ui/src/"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0598: Add section.css.import.validate for colocated CSS import integrity

## Context

The section framework (RFC-0101..0107) mandates that every section under `packages/ui/src/sections/` has a colocated `.css` file using only `--ds-*` tokens. The component contract (DNA-5, RFC-0009) requires a component quartet: `.astro` + `.css` + `.manifest.yaml` + `.types.ts`. Astro components must explicitly `import "./section.css"` for the styles to be bundled — there is no automatic CSS discovery.

During a visual bug investigation on 2026-07-30, two sections (`ownership-block` and `trust-strip`) were found with colocated `.css` files containing real CSS rules but **no `import` statement** in their `.astro` files. The CSS was silently never loaded, causing visual spacing bugs that were invisible to all existing validators. Seven additional sections had CSS files containing only comments (placeholder files), which correctly needed no import — but nothing enforced the distinction.

The missing imports in `ownership-block-section.astro` and `trust-strip-section.astro` were fixed immediately upon discovery (before this RFC was filed). However, no validator exists to prevent the same silent failure from recurring in future sections or components. This RFC introduces that validator as a preventive guardrail.

## Problem

DNA-5 (Component ↔ content ↔ schema mirror) and DNA-17 (Mirror Quintet) are unprotected for the CSS dimension. DNA-17 explicitly adds `.css` to the package-side quintet (`.astro` + `manifest.yaml` + content schema + `.css` + content `.md`), but no existing validator checks that the colocated `.css` file is actually imported by its `.astro` companion. The existing `section.shell.contract.validate` checks that sections use `<SectionShell>`, and `tokens.colors.section-shell.lint` checks CSS token usage — but neither verifies the import link between `.astro` and `.css`.

The failure mode is silent: Astro does not warn when a `.css` file exists but is never imported. The styles simply never load, causing visual regressions that are only detectable by manual visual inspection in a browser. This is exactly what happened with `ownership-block-section.css` and `trust-strip-section.css` — both contained real CSS rules (density-based padding overrides) that were never applied because the `.astro` files did not import them.

Additionally, there is no naming convention enforcement for CSS files. A section directory `foo/` should contain `foo-section.astro` and `foo-section.css` — not `foo-section.astro` and `bar.css`. Without enforcement, naming drift can introduce confusion about which CSS belongs to which component.

## Decision

The kernel gains a `section.css.import.validate` command that scans every `.css` file under `packages/ui/src/sections/` and `packages/ui/src/components/` and verifies two rules:

1. **CSS-IMPORT-01**: Each `.css` file is imported by at least one `.astro` file within `packages/ui/src/` (colocated or cross-directory).
2. **CSS-NAME-01**: Each `.css` filename matches its colocated `.astro` filename (minus extension), enforcing the naming convention.

## Architectural fit

- **DNA-5 (Component ↔ content ↔ schema mirror)**: This RFC enforces the `.astro` ↔ `.css` link that DNA-5's component mirror implies.
- **DNA-17 (Mirror Quintet)**: DNA-17 explicitly adds `.css` to the package-side quintet (`.astro` + `manifest.yaml` + content schema + `.css` + content `.md`). This RFC enforces the import integrity of that `.css` element — the only quintet member not currently validated for import linkage.
- **DNA-37 (Universal Section Props Contract)**: Sections must have their CSS loaded to render correctly; missing imports silently break the visual contract.
- **RFC-0101..0107 (Section framework)**: Complements the existing section-framework validator suite (`section.shell.contract.validate`, `section.header.contract.validate`, etc.) by closing the CSS-import gap.
- **Site OS operator model**: `workspace` scope, registered in `08-section-framework.ts` command table, integrated into `PACKAGES_CHECK_PIPELINE`.
- **Scaling Playbook**: Applies uniformly — every site using `@warpgogol/ui` sections benefits automatically.

## Design

### CLI surface

```sh
pnpm exec site-kernel run section.css.import.validate
pnpm exec site-kernel run section.css.import.validate --json
```

`workspace` scope — no `--app` flag needed. Scans `packages/ui/src/sections/**/*.css` and `packages/ui/src/components/**/*.css`.

### TypeScript contracts

```ts
interface CssImportFinding {
  ruleId: "CSS-IMPORT-01" | "CSS-NAME-01";
  severity: "error";
  file: string;          // path to the .css file
  astroFile?: string;    // colocated .astro path (for CSS-NAME-01)
  message: string;
}
```

The validator follows the existing `CheckCommandEntry` pattern in `08-section-framework.ts`: a `runSectionCssImportValidate` function exported from a new `src/section-framework/css-import.ts` module, registered in the `SECTION_FRAMEWORK_COMMANDS` array.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ui/src/sections/**/*.css` | Scanned for CSS files |
| `packages/ui/src/sections/**/*.astro` | Scanned for import statements |
| `packages/ui/src/components/**/*.css` | Scanned for CSS files |
| `packages/ui/src/components/**/*.astro` | Scanned for import statements |
| `packages/os/site-kernel-checks/src/section-framework/css-import.ts` | New validator module |
| `packages/os/site-kernel-checks/src/command-tables/08-section-framework.ts` | Command entry added |
| `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` | Pipeline entry added |
| `packages/os/site-kernel-checks/AGENTS.md` | Module table entry added for `src/section-framework/css-import.ts` |

### Output format

```json
{
  "command": "section.css.import.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "CSS-IMPORT-01",
      "severity": "error",
      "file": "packages/ui/src/sections/ownership-block/ownership-block-section.css",
      "message": "CSS file is not imported by any .astro file in packages/ui/src/"
    },
    {
      "ruleId": "CSS-NAME-01",
      "severity": "error",
      "file": "packages/ui/src/sections/foo/bar.css",
      "astroFile": "packages/ui/src/sections/foo/foo-section.astro",
      "message": "CSS filename 'bar.css' does not match colocated .astro filename 'foo-section.astro'"
    }
  ]
}
```

### Failure modes

- **CSS-IMPORT-01** (error): `.css` file exists but no `.astro` file in `packages/ui/src/` contains `import "...<filename>"`. The validator searches all `.astro` files for the CSS filename (not just colocated) to allow legitimate cross-directory imports (e.g., `effect-text.css` imported by `section-header.astro`).
- **CSS-NAME-01** (error): `.css` filename does not match colocated `.astro` filename (minus extension). If a directory contains `foo-section.astro` and `bar.css`, this is a naming violation. Directories with multiple `.css` files (e.g., `effects/` with `effect-host.css` and `effect-text.css`) are exempt when each `.css` has a matching `.astro` in the same directory or is imported by an `.astro` in the same directory. If no `.astro` exists in the same directory as the `.css` file, CSS-NAME-01 is skipped for that file (the file is still checked by CSS-IMPORT-01).
- The command exits non-zero (`exitCode: 1`) when any error-level finding is present.
- `--json` output follows the standard `KernelCommandResult` shape.

## Rollout

- **Default behavior**: fail-hard from introduction. The originally-identified violations (`ownership-block` and `trust-strip`) were already fixed before this RFC was filed; the validator is introduced as a preventive guardrail.
- **Existing apps**: no migration needed — the validator checks `packages/ui`, not app workspaces. All apps automatically benefit.
- **New apps**: automatically compliant — `section.scaffold` generates `.astro` files with CSS imports by default.
- **Pipeline integration**: added to `PACKAGES_CHECK_PIPELINE` after `section.shell.contract.validate`.
- **No deprecation**: this is a new command, not superseding any existing validator.

## Alternatives considered

- **Astro built-in CSS bundling**: Astro does not auto-discover colocated `.css` files — explicit `import` is required. No configuration change can fix this; it is fundamental to how Astro/Vite bundling works.
- **Lint rule in `tokens.colors.section-shell.lint`**: Rejected — that validator checks CSS token content, not import integrity. Mixing concerns would bloat an existing validator.
- **Convention-only (no validator)**: Rejected — the bug was caused by exactly this: convention was followed for most sections but silently broken for two. Manual discipline is insufficient for a 30+ section codebase.
- **Check only colocated imports (not cross-directory)**: Rejected — `effect-text.css` is legitimately imported by `section-header.astro` from a different directory. Restricting to colocated-only would produce false positives for valid cross-imports.

## Risks

- **False positive for cross-directory imports**: A `.css` file imported by an `.astro` in a different directory would pass CSS-IMPORT-01 (the validator searches all `.astro` files). However, CSS-NAME-01 could flag it if the names don't match. Mitigation: CSS-NAME-01 only applies when there is a colocated `.astro` file with a different name — if no `.astro` exists in the same directory, the rule is skipped.
- **Performance**: The validator reads all `.astro` files in `packages/ui/src/` to search for import statements. With ~60 `.astro` files, this is negligible (<50ms).
- **Agent misinterpretation**: Agents might add `import "./section.css"` to fix CSS-IMPORT-01 without checking whether the CSS file actually contains rules. This is acceptable — importing an empty CSS file is harmless and the convention is to always import.
- **Naming convention drift**: The naming convention (`<slug>-section.css` for sections, `<slug>-component.css` or `<slug>.css` for components) is not formally documented as a DNA invariant. This RFC enforces it via CSS-NAME-01 but does not elevate it to DNA level.

## Acceptance criteria

- [ ] `section.css.import.validate` command registered in `08-section-framework.ts` with `scope: workspace`
- [ ] `runSectionCssImportValidate` implemented in `src/section-framework/css-import.ts`
- [ ] CSS-IMPORT-01 detects `.css` files not imported by any `.astro` in `packages/ui/src/`
- [ ] CSS-NAME-01 detects `.css` files whose name doesn't match colocated `.astro` name
- [ ] `ownership-block-section.astro` and `trust-strip-section.astro` already import their CSS (verified — no fix needed)
- [ ] Command added to `PACKAGES_CHECK_PIPELINE`
- [ ] `--json` output follows standard `KernelCommandResult` shape with `diagnostics[]`
- [ ] Unit test in `src/tests/css-import-validate.test.ts` covers both rules and the cross-import exemption
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The originally-identified violations (`ownership-block-section.astro` and `trust-strip-section.astro`) were already fixed before this RFC was filed. The validator MUST pass on the current codebase at implementation time — if any new violations are discovered, they MUST be fixed in the same commit as the validator implementation.
- Test file MUST live at `src/tests/css-import-validate.test.ts` (per vitest config in `site-kernel-checks`).
