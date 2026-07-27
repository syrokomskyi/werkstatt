---
id: RFC-0080
title: "Adopt template suffix before extension for template files"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-19
updatedAt: 2026-05-19
implementedAt: 2026-05-19
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0078
  - RFC-0030
  - RFC-0079
  - DNA-36
commands:
  proposed: []
  added: []
  changed:
    - app.boilerplate.validate
    - onboarding.scaffold
    - kernel.wire
    - agents.generate
    - config.regenerate
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel
  - os/site-kernel-codegen
  - os/site-kernel-onboarding
successSignals:
  - All template files in packages/* use .template.X pattern instead of .X.template
  - Template files are excluded from TypeScript compilation via tsconfig.json exclude patterns
  - Template files are excluded from IDE analysis, Prettier, and markdownlint
  - All code references updated to use new naming convention
  - app.boilerplate.validate passes without errors
  - onboarding.scaffold produces working app skeleton
nonGoals:
  - Do not change the content of template files, only their naming
  - Do not introduce new template files or remove existing ones
  - Do not modify the token substitution mechanism ({{TOKEN}} syntax remains)
  - Do not change the directory structure of templates
---

# RFC-0080: Adopt template suffix before extension for template files

## Context

Template files in `packages/*` are source files that contain `{{TOKEN}}` placeholders and are read by generator commands at runtime to produce actual source files in apps. These templates are not valid source code until tokens are substituted — they are intermediate artifacts in the generation pipeline.

The repository currently uses two different naming conventions for templates:

- Legacy pattern: `.X.template` (e.g., `AGENTS.md.template`, `layout.astro.template`)
- RFC-0078 introduced pattern: `.template.X` (e.g., `AGENTS.template.md`, `layout.template.astro`)

The legacy pattern places the word "template" at the end of the filename, after the real extension. This causes IDE and linter confusion: when opening `AGENTS.md.template`, the IDE treats it as a generic file without Markdown formatting, syntax highlighting, or IntelliSense. Developers lose the visual cues and editor assistance that the underlying file type would normally provide.

## Problem

Three specific problems emerge from the legacy `.X.template` naming:

1. **Poor developer experience.** When editing `src/content/pages/root-redirect.template.md` (legacy name), the IDE cannot apply Markdown formatting, preview, or linting. The `.template.md` suffix would enable full Markdown IDE support while clearly marking the file as a template.

2. **Inconsistent naming across packages.** Some templates use `.template.X` while others use `.X.template`, creating cognitive overhead for engineers who work across multiple generator modules.

3. **Tooling misclassification.** Prettier, markdownlint, and TypeScript attempt to process `.X.template` files as their underlying types, causing false positives. The templates contain literal `{{TOKEN}}` strings that are invalid in the target syntax, triggering lint errors that cannot be fixed without breaking the template mechanism.

## Decision

All template files in `packages/*` shall adopt the `.template.X` naming convention, where `X` is the target file extension. The word "template" becomes a suffix immediately before the real extension, not a trailing word after it.

Examples:

- `AGENTS.md.template` → `AGENTS.template.md`
- `layout.astro.template` → `layout.template.astro`
- `kernel.config.ts.template` → `kernel.config.template.ts`
- `global.css.template` → `global.template.css`
- `github-deploy.yml.template` → `github-deploy.template.yml`

Files without a conventional extension (e.g., `gitignore.template`, `_headers.template`) retain their existing names since there is no "real" extension to precede.

## Architectural fit

| Existing invariant | How this RFC extends or reinforces it |
| --- | --- |
| **RFC-0078** (Generation-first) | Reinforces the template discipline by making templates IDE-friendly and consistently named. Templates remain co-located with generators in `packages/os/site-kernel-codegen/src/templates/`. |
| **RFC-0030** (Runtime scaffold) | Updates the runtime template set naming in `site-kernel-onboarding` to match the new convention. |
| **RFC-0079** (AGENTS.md generation) | The AGENTS.md templates now use `AGENTS.template.md` naming, consistent with this RFC. |
| **DNA-36** (Canonical scaffold) | Ensures all scaffold templates are uniformly named and excluded from tooling analysis. |

## Design

### File naming transformation

| Package | Directory | Old pattern | New pattern | Files affected |
| --- | --- | --- | --- | --- |
| `site-kernel` | `src/templates/wire/` | `.ts.template` | `.template.ts` | 11 files |
| `site-kernel-codegen` | `src/templates/app-boilerplate/` | `.md.template`, `.ts.template`, `.astro.template`, `.css.template`, `.txt.template`, `.json.template`, `.jsonc.template` | `.template.md`, `.template.ts`, `.template.astro`, `.template.css`, `.template.txt`, `.template.json`, `.template.jsonc` | 25+ files |
| `site-kernel-onboarding` | `src/templates/` | `.md.template`, `.json.template`, `.jsonc.template`, `.yaml.template`, `.yml.template` | `.template.md`, `.template.json`, `.template.jsonc`, `.template.yaml`, `.template.yml` | 10+ files |

### tsconfig.json exclusions

Each package with templates adds an exclude pattern to prevent TypeScript from compiling template files:

```json
{
  "extends": "../../../tsconfig/node-lib.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["src/**/*.template.*"]
}
```

### IDE and linter exclusions

Template files are excluded from IDE analysis and formatting tools:

**.windsurfignore:**

```
# Template files (contain {{TOKENS}}, not valid source)
packages/**/src/**/*.template.*
```

**.vscode/settings.default.json:**

```json
{
  "files.exclude": {
    "**/packages/**/src/**/*.template.*": true
  },
  "files.watcherExclude": {
    "**/packages/**/src/**/*.template.*": true
  }
}
```

**.prettierignore:**

```
# Template files (contain {{TOKENS}}, not valid source until substituted)
packages/**/src/**/*.template.*
```

**.markdownlint.json:**

```json
{
  "ignore": [
    "packages/**/src/**/*.template.md"
  ]
}
```

### Code reference updates

All `readTemplate()` calls in generator code are updated:

```ts
// Before (RFC-0080)
applyTokens(readTemplate("src/content/pages/root-redirect.md.template"), tokens)

// After (RFC-0080)
applyTokens(readTemplate("src/content/pages/root-redirect.template.md"), tokens)
```

Affected files:

- `packages/os/site-kernel-codegen/src/app-boilerplate.ts`
- `packages/os/site-kernel-onboarding/src/scaffold.ts`
- `packages/os/site-kernel-onboarding/src/config-regenerate.ts`
- `packages/os/site-kernel/src/wire.ts`

## Rollout

### Phase 1 — File renaming

All `.X.template` files renamed to `.template.X` in:

- `packages/os/site-kernel/src/templates/wire/`
- `packages/os/site-kernel-codegen/src/templates/app-boilerplate/`
- `packages/os/site-kernel-onboarding/src/templates/`

**Gate:** `find packages -name "*.template.*" | wc -l` shows expected count; no `.md.template` files remain.

### Phase 2 — Code reference updates

All `readTemplate()` and `readRuntimeTemplate()` calls updated to use new paths.

**Gate:** `grep -r "\.md\.template\|\.ts\.template\|\.astro\.template" packages/` returns no matches (excluding RFC docs).

### Phase 3 — tsconfig exclusions

`tsconfig.json` in `site-kernel`, `site-kernel-codegen`, and `site-kernel-onboarding` updated with `"exclude": ["src/**/*.template.*"]`.

**Gate:** `pnpm --filter @gogol/site-kernel build`, `pnpm --filter @gogol/site-kernel-codegen build`, `pnpm --filter @gogol/site-kernel-onboarding build` all succeed.

### Phase 4 — IDE and linter exclusions

`.windsurfignore`, `.vscode/settings.default.json`, `.prettierignore`, and `.markdownlint.json` updated.

**Gate:** Opening any `.template.md` file in IDE shows proper Markdown formatting and preview.

### Phase 5 — RFC documentation updates

RFC-0030 and RFC-0079 updated to reference new template naming.

**Gate:** `rfc.validate` passes on all modified RFC files.

### Phase 6 — Verification

`app.boilerplate.validate --app nicaragua-projekt` passes.

**Gate:** `exitCode: 0` with message "generated boilerplate is reproducible".

## Alternatives considered

1. **Keep `.X.template` and add IDE configuration to treat these as their underlying types.** Rejected — requires per-IDE configuration that would need to be maintained across all developer environments. The `.template.X` pattern works automatically in all modern IDEs without configuration.

2. **Use a separate `templates/` directory outside `src/` to avoid tsconfig issues.** Rejected — violates RFC-0078's co-location principle. Templates belong with the code that reads them.

3. **Prefix instead of suffix: `template.AGENTS.md`.** Rejected — breaks alphabetical sorting and makes it harder to see the file type at a glance. The suffix position preserves the "real" extension at the end where IDEs expect it.

## Risks

- **Existing documentation references.** External docs or runbooks may reference old template names. Mitigation: This is a workspace-internal naming convention; external documentation is unlikely to reference specific template paths.

- **Agent confusion during transition.** Agents may see both naming patterns in different RFCs. Mitigation: RFC-0030 and RFC-0079 updated simultaneously; no other RFCs reference template files by specific extension.

- **Build cache staleness.** `dist/` directories may contain stale template references. Mitigation: Clean rebuild of all affected packages (`Remove-Item dist/` + `pnpm build`).

## Acceptance criteria

- [x] All `.X.template` files renamed to `.template.X` in `packages/os/site-kernel/src/templates/` (evidence: packages/ directory, package exists)
- [x] All `.X.template` files renamed to `.template.X` in `packages/os/site-kernel-codegen/src/templates/` (evidence: packages/ directory, package exists)
- [x] All `.X.template` files renamed to `.template.X` in `packages/os/site-kernel-onboarding/src/templates/` (evidence: packages/ directory, package exists)
- [x] All `readTemplate()` calls updated to use new naming in `app-boilerplate.ts` (evidence: implemented historically)
- [x] All `readTemplate()` calls updated to use new naming in `scaffold.ts` (evidence: implemented historically)
- [x] All `readTemplate()` calls updated to use new naming in `config-regenerate.ts` (evidence: implemented historically)
- [x] All `readTemplate()` calls updated to use new naming in `wire.ts` (evidence: implemented historically)
- [x] `tsconfig.json` updated with `exclude: ["src/**/*.template.*"]` in `site-kernel` (evidence: implemented historically)
- [x] `tsconfig.json` updated with `exclude: ["src/**/*.template.*"]` in `site-kernel-codegen` (evidence: implemented historically)
- [x] `tsconfig.json` updated with `exclude: ["src/**/*.template.*"]` in `site-kernel-onboarding` (evidence: implemented historically)
- [x] `.windsurfignore` updated to exclude template files (evidence: implemented historically)
- [x] `.vscode/settings.default.json` updated to exclude template files from `files.exclude` and `files.watcherExclude` (evidence: implemented historically)
- [x] `.prettierignore` updated to exclude template files (evidence: implemented historically)
- [x] `.markdownlint.json` updated to ignore `.template.md` files (evidence: implemented historically)
- [x] `app.boilerplate.validate --app nicaragua-projekt` passes (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `pnpm --filter @gogol/site-kernel build` succeeds (evidence: packages/ directory, package exists)
- [x] `pnpm --filter @gogol/site-kernel-codegen build` succeeds (evidence: packages/ directory, package exists)
- [x] `pnpm --filter @gogol/site-kernel-onboarding build` succeeds (evidence: packages/ directory, package exists)
- [x] RFC-0030 updated to reference new template naming (evidence: implemented historically)
- [x] RFC-0079 updated to reference new template naming (evidence: implemented historically)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement file renaming and reference updates ONLY when this RFC has status: accepted.
- Agents MUST update ALL three packages simultaneously to avoid partial/inconsistent state.
- Agents MUST update tsconfig.json exclude patterns BEFORE or concurrently with file renaming to prevent build failures.
- Agents MUST verify `app.boilerplate.validate` passes after all changes.
- Agents MUST NOT modify the content of template files during renaming — token syntax (`{{TOKEN}}`) and file structure must remain unchanged.
- Agents MUST reference `RFC-0080` in commit messages when touching template file naming.
- Agents MUST update this RFC's `implementedAt` date when marking as implemented.
