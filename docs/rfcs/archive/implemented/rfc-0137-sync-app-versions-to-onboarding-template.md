---
id: RFC-0137
title: "Sync app dependency versions into onboarding templates"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-30
updatedAt: 2026-06-04
implementedAt: 2026-05-30
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0078
  - RFC-0081
  - RFC-0089
commands:
  proposed: []
  added:
    - config.template.sync
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-onboarding"
successSignals:
  - Template `package.template.json` versions match the reference app after sync.
  - Template `astro.config.template.mjs` `optimizeDeps` blocks match the reference app after sync.
  - Regenerating any existing app with `config.regenerate` produces zero diff in dependency versions.
nonGoals:
  - Do not sync app-specific business logic, routes, or content into templates.
  - Do not compare or merge versions; the command overwrites template fields blindly from the reference app.
  - Do not sync devDependencies that are not shared by all apps (e.g., app-specific testing tools).
---

# RFC-0137: Sync app dependency versions into onboarding templates

## Context

`config.regenerate` (RFC-0078 / RFC-0081) re-applies root config templates (`package.template.json`, `astro.config.template.mjs`, etc.) to existing apps. When a generated file carries the `GENERATED` marker, `config.regenerate` overwrites it unconditionally. When the marker is absent, the file is skipped as project-specific.

The templates live in `packages/os/site-kernel-onboarding/src/templates/` and serve as the canonical source for every new app scaffolded via `onboarding.scaffold`. Over time, engineers update dependency versions inside individual apps (`pnpm up --latest`), but those updates do not flow back into the templates. The next `config.regenerate` or `onboarding.scaffold` therefore emits stale versions, creating an invisible drift between the "latest" app and the canonical template.

## Problem

- `apps/warpgogol-com/package.json` was upgraded to `astro ^6.4.x` and newer React versions via `pnpm up --latest`.
- `config.regenerate --force` reverted those versions to the older template values (`astro ^6.3.6`), causing a silent downgrade.
- There is no automated or documented way to propagate upgraded versions from a reference app back into the canonical template.
- Manual copy-paste is error-prone and violates the "thin apps, thick OS" invariant: the OS should own template currency, not individual engineers.

## Decision

The kernel gains a `config.template.sync` command that reads selected generated files from a specified reference app and overwrites the corresponding onboarding templates with the exact field values from that app. No diffing, no merging — raw overwrite of template fields from the reference app.

## Architectural fit

- **RFC-0081 (Generated-file governance)**: Templates are the canonical generated-file sources. Keeping them current is a governance duty, not an afterthought.
- **RFC-0078 (Engineering boilerplate generation)**: `config.regenerate` and `onboarding.scaffold` both derive from templates. Template drift directly breaks their correctness.
- **RFC-0089 (Astro subpath exports)**: `astro.config.template.mjs` contains `optimizeDeps` and `ssr` blocks that must stay in sync with workspace package evolution.
- **Site OS operator model**: Workspace-scoped command because templates are shared across all apps. No app-local state is mutated.

## Design

### CLI surface

```sh
# Sync all supported template files from a reference app
pnpm exec site-kernel run config.template.sync --app warpgogol-com

# Sync only specific files (comma-separated)
pnpm exec site-kernel run config.template.sync --app warpgogol-com --files package.json,astro.config.mjs

# Dry-run: show what would change without writing
pnpm exec site-kernel run config.template.sync --app warpgogol-com --dry-run
```

Flags:

- `--app <string>` (required): The reference app to read versions from.
- `--files <string>` (optional, default: `package.json,astro.config.mjs`): Comma-separated list of files to sync.
- `--dry-run` (optional): Print diff summary without writing.

Scope: **workspace** — reads from `apps/<app>/`, writes to `packages/os/site-kernel-onboarding/src/templates/`.

### TypeScript contracts

```ts
interface ConfigTemplateSyncInput {
  app: string;
  files?: string[]; // default: ["package.json", "astro.config.mjs"]
  dryRun?: boolean;
}

interface ConfigTemplateSyncResult {
  command: "config.template.sync";
  app: string;
  synced: Array<{
    templateFile: string;
    sourceFile: string;
    fieldsUpdated: string[];
  }>;
  skipped: Array<{
    templateFile: string;
    reason: string;
  }>;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/<app>/package.json` | Source of truth for dependency versions and scripts |
| `apps/<app>/astro.config.mjs` | Source of truth for Vite / Astro configuration blocks |
| `packages/os/site-kernel-onboarding/src/templates/package.template.json` | Target: overwritten for `dependencies` and `devDependencies` |
| `packages/os/site-kernel-onboarding/src/templates/runtime/astro.config.template.mjs` | Target: overwritten for `optimizeDeps`, `ssr`, and `build` blocks |

### Sync rules

1. **`package.json` -> `package.template.json`**
   - Overwrite the entire `dependencies` object.
   - Overwrite the entire `devDependencies` object.
   - Preserve template-only fields: `name` (`{{CLIENT_ID}}`), `scripts`, `_`, `private`, `type`, `engines`, `packageManager`.

2. **`astro.config.mjs` -> `astro.config.template.mjs`**
   - Overwrite the `optimizeDeps` block (`include` / `exclude`).
   - Overwrite the `ssr` block (`external` / `noExternal`).
   - Preserve template tokens: `{{SITE_LINE}}`.
   - Preserve static comments and GRACE scaffolding.

### Output format

```json
{
  "command": "config.template.sync",
  "app": "warpgogol-com",
  "synced": [
    {
      "templateFile": "package.template.json",
      "sourceFile": "apps/warpgogol-com/package.json",
      "fieldsUpdated": ["dependencies", "devDependencies"]
    },
    {
      "templateFile": "astro.config.template.mjs",
      "sourceFile": "apps/warpgogol-com/astro.config.mjs",
      "fieldsUpdated": ["optimizeDeps", "ssr"]
    }
  ],
  "skipped": []
}
```

### Failure modes

- Reference app does not exist → exit code 1, message: `config.template.sync: apps/<app> does not exist`.
- Reference `package.json` or `astro.config.mjs` missing → skip that file with reason in `skipped`.
- Template file missing → skip with reason (should never happen in a healthy workspace).
- `--dry-run` never writes; exit code 0 even if changes are pending.

## Rollout

1. **Phase 1 (merge)**: Command is registered and available for manual invocation.
2. **Phase 2 (adoption)**: After every intentional `pnpm up --latest` in a reference app, the engineer runs `config.template.sync` to keep templates current.
3. **Phase 3 (automation)**: Consider integrating into a workspace pipeline (e.g., `workspace.sync`) that runs monthly or after major version bumps.
4. **New apps**: Automatically comply because `onboarding.scaffold` uses the freshly synced templates.

## Alternatives considered

- **Dependabot / Renovate for templates**: Rejected because templates are not installable packages; Dependabot cannot open PRs against `.template.json` files.
- **Manual copy-paste**: Rejected because it is error-prone and invisible to other engineers.
- **Diff-aware merge**: Rejected because the user explicitly requested "no comparisons, just overwrite versions." The simplest correct behavior is blind overwrite of the relevant fields.

## Risks

- **Over-eager overwrite**: If a reference app adds an app-specific dependency (e.g., a growth adapter other than `null`), that dependency will leak into the template. Mitigation: `workspace:*` dependencies are safe; external deps should be reviewed before sync.
- **Template token corruption**: If the parser is too naive, `{{SITE_LINE}}` or `{{CLIENT_ID}}` may be lost. Mitigation: only overwrite known JSON / JS object keys; preserve all string tokens.

## Acceptance criteria

- [x] `config.template.sync` command registered in `@gogol/site-kernel-onboarding` module. (evidence: packages/ directory, package exists)
- [x] `--app` flag resolves the reference app and reads its `package.json` and `astro.config.mjs`. (evidence: implemented historically)
- [x] `--dry-run` prints JSON summary without writing. (evidence: implemented historically)
- [x] `package.template.json` dependencies and devDependencies are overwritten from the reference app. (evidence: implemented historically)
- [x] `astro.config.template.mjs` `optimizeDeps` and `ssr` blocks are overwritten from the reference app. (evidence: implemented historically)
- [x] Template tokens (`{{SITE_LINE}}`, `{{CLIENT_ID}}`) are preserved. (evidence: implemented historically)
- [x] `--json` output matches the documented `ConfigTemplateSyncResult` shape. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this command ONLY after the RFC status moves to `accepted`.
- Agents MUST NOT change the `status` field of this RFC.
- When implementing, agents MUST preserve template tokens and GRACE scaffolding in template files.
- Agents MUST NOT add diff or merge logic; the command performs blind overwrite of the specified fields.
