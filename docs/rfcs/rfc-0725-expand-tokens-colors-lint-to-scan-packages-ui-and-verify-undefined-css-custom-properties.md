---
id: RFC-0725
title: "Expand tokens.colors.lint to scan packages/ui and verify undefined CSS custom properties"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-06
updatedAt: 2026-08-07
enhancedAt: 2026-08-07
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0071
  - RFC-0098
satisfies:
  - DNA-10
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - tokens.colors.lint
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/ui"
successSignals:
  - "tokens.colors.lint scans packages/ui/src/**/*.css in addition to app/src/styles/**/*.css"
  - "tokens.colors.lint reports undefined --ds-* custom properties not present in TOKEN_NAME_SET"
  - "Undefined CSS tokens are caught in sites-check-author pipeline, not after 2+ minute mission.validate build"
  - "Unit tests cover undefined token detection, packages-level scan, and missing packages/ui/src warning path"
nonGoals:
  - "Replacing biome.tokens.validate (which operates on dist output)"
  - "Checking biome YAML token definitions"
  - "Validating biome-token-projection.ts mapping completeness"
  - "Scanning .astro or .ts files for undefined token usage (already covered by design-system.token.lint for non-ds prefix check)"
---

# RFC-0725: Expand tokens.colors.lint to scan packages/ui and verify undefined CSS custom properties

## Context

During mission warpgogol-com-m000034 publishing, `biome.tokens.validate` caught an undefined CSS token (`--ds-color-text-on-accent`) at step 187/196 of `mission.validate` — after a 2+ minute full site build. The token was used in `packages/ui/src/sections/transparency/transparency-section.css` but never defined in `tokens.css`, biome YAML, or `biome-token-projection.ts`.

The existing `tokens.colors.lint` command (`runHardcodedColorLint`) only scans `app/src/styles/**/*.css` for raw `rgba()` and `#hex` color violations. It does not:

1. Scan `packages/ui/src/**/*.css` (where section and component CSS lives)
2. Verify that `var(--ds-*)` references resolve to defined tokens

## Problem

Two gaps in CSS token validation:

1. **Scope gap**: `tokens.colors.lint` uses `DEFAULT_COLOR_ROOTS = ["src/styles"]` and `requireAstroSitePaths(context)` — only scans app-level styles. Section CSS in `packages/ui/src/sections/<slug>/<slug>.css` and component CSS in `packages/ui/src/components/<slug>/<slug>.css` are never checked.

2. **Undefined token gap**: No early check verifies that `var(--ds-*)` references in CSS files resolve to tokens defined in `TOKEN_NAME_SET` from `@warpgogol/tokens`. The only check (`biome.tokens.validate`) operates on built dist output, requiring a full site build first.

## Decision

### 1. Expand `tokens.colors.lint` to two scanning levels

The command scans both app-level and packages-level CSS:

- **App level** (existing): `<app>/src/styles/**/*.css` — raw hex/rgb check (unchanged)
- **Packages level** (new): `packages/ui/src/**/*.css` — raw hex/rgb check + undefined token check

Both passes run in the same command invocation. The packages-level pass uses `workspaceRoot` (not `appDirectory`) to resolve the `packages/ui/src` path.

### 2. Add undefined token verification

After scanning for raw colors, the command extracts every `var(--ds-*)` reference from scanned CSS files and verifies membership in `TOKEN_NAME_SET` exported by `@warpgogol/tokens`.

Violations are reported with the same format as raw color findings:

```
packages/ui/src/sections/transparency/transparency-section.css:36:11 --ds-color-text-on-accent (undefined token)
```

The `TOKEN_NAME_SET` is imported from `@warpgogol/tokens` — this is a read-only import of a frozen string set, no runtime dependency on token values.

### 3. Ignore patterns for packages-level scan

The same `ignoredDefinitionPatterns` logic applies to packages-level scan. No additional ignore patterns are needed — `packages/ui/src/styles/` currently contains only `print.css`, and there are no app-level override or generated CSS files in `packages/ui`.

## Architectural fit

- **Existing pattern**: `tokens.colors.lint` already scans CSS for violations. Extending it to also check token existence is a natural extension of the same pass.
- **Token authority**: `TOKEN_NAME_SET` from `@warpgogol/tokens` is the canonical list of valid `--ds-*` token names. Using it as the membership oracle avoids duplicating token definitions.
- **Pipeline placement**: `tokens.colors.lint` runs in `sites-check-author` pipeline (app-scoped, per-site), which is included in `build.check`. This catches errors before `mission.validate`'s full build.
- **Scope expansion**: The command currently has `scope: "app"`. The packages-level scan requires access to `workspaceRoot`, which is available in `KernelRuntimeContext`. No scope change needed — the command already receives `workspaceRoot` via context.
- **Duplicate findings**: Since the command is `scope: "app"` and runs per-site in the pipeline, the packages-level scan of `packages/ui/src/**/*.css` executes once per site. The same undefined token in `packages/ui` would be reported N times for N sites. This is accepted: the cost is minimal (~50 files, <100ms per scan), the findings are correct, and splitting into a separate workspace-scoped command was rejected in Alternatives. The `--all-sites` invocation deduplicates at the log level by reporting findings with workspace-relative paths, making duplicates visually identical.

## Design

### CLI surface

```sh
# Unchanged — the command now scans both app and packages
pnpm exec site-kernel run tokens.colors.lint --app warpgogol-com
```

### Contract changes

The return data shape extends from `{ findings: number }` to `{ findings: number, violations: ColorLintFinding[] }`. The `findings` count is preserved for backward compatibility. The `violations` array provides per-violation details (file, line, column, token, reason). Consumers that only read `data.findings` continue to work unchanged.

### TypeScript contracts

```ts
// New: undefined token finding
interface UndefinedTokenFinding {
  filePath: string;
  line: number;
  column: number;
  token: string; // e.g. "--ds-color-text-on-accent"
  reason: "undefined-token";
}

// Extended: raw color findings now coexist with undefined token findings
interface ColorLintFinding {
  filePath: string;
  line: number;
  column: number;
  token: string;
  reason?: "raw-rgba" | "raw-hex" | "undefined-token";
}

// New: packages-level scan helper
async function scanPackagesUiCss(
  workspaceRoot: string,
  tokenNameSet: Set<string>,
): Promise<ColorLintFinding[]>;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/checks/tokens.ts` | `runHardcodedColorLint` — add packages-level scan + undefined token check |
| `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts` | Update `reads` field to include `packages/ui/src/**/*.css`; update `description` to mention undefined token check |
| `packages/tokens/src/index.ts` | Export `TOKEN_NAME_SET` (already exported — verify) |
| `packages/ui/src/sections/**/*.css` | Scanned by the extended command |
| `packages/ui/src/components/**/*.css` | Scanned by the extended command |

### Output format

```json
{
  "command": "tokens.colors.lint",
  "findings": 3,
  "violations": [
    {
      "file": "packages/ui/src/sections/transparency/transparency-section.css",
      "line": 36,
      "column": 11,
      "token": "--ds-color-text-on-accent",
      "reason": "undefined-token"
    },
    {
      "file": "src/styles/global.css",
      "line": 15,
      "column": 3,
      "token": "#ff0000",
      "reason": "raw-hex"
    }
  ]
}
```

### Failure modes

- **Undefined token found**: Exit code 1, same as raw color violation. Each violation logged as error.
- **`@warpgogol/tokens` import fails**: Fatal error — cannot verify tokens without the canonical set.
- **`packages/ui/src` directory missing**: Skip packages-level scan with a warning (not all workspaces have `packages/ui`).

## Rollout

- **Active by default**: The extended scan runs on every `tokens.colors.lint` invocation. No opt-in flag.
- **No migration**: Existing apps that pass `tokens.colors.lint` will continue to pass — the undefined token check only fires on actual undefined tokens.
- **Pipeline integration**: Already integrated in `build.check` pipeline. No pipeline changes needed.

## Alternatives considered

- **Separate `tokens.colors.lint.packages` command**: Rejected — splits the command contract and requires two pipeline entries for related checks.
- **New `tokens.defined.lint` command**: Rejected — overlaps with `tokens.colors.lint` scope. Better to extend existing command.
- **Pre-commit hook**: Rejected — pre-commit hooks are not reliable in monorepo with partial commits. Pipeline check is the right level.
- **Extend `biome.tokens.validate` to run earlier**: Rejected — it operates on dist output (built CSS), which requires a full build. The check belongs on source CSS.

## Risks

- **False positives from dynamic tokens**: If CSS uses `var(--ds-*)` with dynamically constructed names (string concatenation), the regex won't catch them. This is acceptable — dynamic token names are an anti-pattern.
- **`TOKEN_NAME_SET` drift**: If `token-names.generated.ts` is stale (not regenerated after adding a token to `tokens.css`), the check may report false positives. Mitigation: `tokens.colors.lint` depends on `@warpgogol/tokens` which is built before checks run.
- **Performance**: Scanning `packages/ui/src/**/*.css` adds ~50 files. Regex extraction is fast (<100ms). No measurable impact.

## Acceptance criteria

- [ ] `tokens.colors.lint` scans `packages/ui/src/**/*.css` in addition to `app/src/styles/**/*.css`
- [ ] `tokens.colors.lint` reports `var(--ds-*)` references not present in `TOKEN_NAME_SET` as violations
- [ ] Violations include `reason: "undefined-token"` in JSON output
- [ ] Exit code is 1 when any undefined token is found
- [ ] `packages/ui/src` missing is handled with a warning, not an error
- [ ] Existing raw color checks continue to work unchanged
- [ ] Unit tests cover undefined token detection, packages-level scan, and missing `packages/ui/src` warning path
- [ ] Command description in `04-content-quality.ts` updated to reflect undefined token check
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- Import `TOKEN_NAME_SET` from `@warpgogol/tokens` — do not duplicate the token list.
- Use the existing `stripBlockCommentsPreserveLength` and `stripUrlsPreserveLength` helpers before extracting `var(--ds-*)` references to avoid false positives from comments and URLs.
