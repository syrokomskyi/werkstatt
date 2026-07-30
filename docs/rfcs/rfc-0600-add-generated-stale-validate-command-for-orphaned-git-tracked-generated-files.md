---
id: RFC-0600
title: "Add generated.stale.validate command for orphaned git-tracked generated files"
status: accepted
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
reviewers:
  - human:andrii-syrokomskyi
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
  - RFC-0375
  - RFC-0599
  - RFC-0087
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-18
# DNA-18 is secondary — the primary alignment is RFC-0087 (content-driven
# generation contract). See Architectural fit section for explanation.
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
    - generated.stale.validate
  added:
    - generated.stale.validate
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "generated.stale.validate detects preview PNG files for deleted pages (founder, widerruf, muster-widerruf) as stale."
  - "generated.stale.validate detects files with old app names (webgogol-com-indexnow.txt, webgogol-check.json) as stale."
  - "The command exits non-zero with a STALE-01 diagnostic for each orphaned file."
  - "After removing the stale files and re-running, the command passes with zero violations."
nonGoals:
  - "Do not auto-delete stale files — the command is informational: it reports and exits non-zero. Human or CI decides the resolution."
  - "Do not check content drift — that is the domain of RFC-0601 (generated.drift.validate)."
  - "Do not check binary file staleness — preview images are handled by RFC-0602 (deterministic rendering) and RFC-0603 (timestamp determinism)."
  - "Do not scan src/ for stale files — authored content files (src/content/pages/, src/content/prose/, etc.) are not in GENERATOR_OWNERSHIP_MAP and would produce false positives. The stale file problem is exclusively in public/."
  - "Do not check files outside the site workpiece (e.g., packages/, docs/) — scope is strictly the site's public/ directory."
  - "Do not provide a --no-stale-validate bypass flag — stale files are always errors. No per-command bypass flag pattern exists in the pipeline runner."
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

# RFC-0600: Add generated.stale.validate command for orphaned git-tracked generated files

## Context

A public folder regeneration experiment on warpgogol-com (2026-07-30) revealed 14 git-tracked files in `public/` that no registered generator produces. These files persisted in git from previous builds but their owning content was deleted or renamed:

- **Preview PNGs for deleted pages**: `public/preview/de/founder.png`, `public/preview/de/muster-widerruf.png`, `public/preview/de/widerruf.png` (and UK counterparts) — the corresponding `src/content/pages/{lang}/founder.md`, `muster-widerruf.md`, `widerruf.md` were deleted, but the preview images remained in git.
- **Old app-name files**: `public/webgogol-com-indexnow.txt` (renamed to `public/warpgogol-com-indexnow.txt`), `public/.well-known/webgogol-check.json` (renamed to `public/.well-known/warpgogol-check.json`).
- **Separate-command outputs**: `public/.well-known/bordbuch.json`, `public/.well-known/bordbuch/index.html` (owned by `bordbuch.generate`), `public/.well-known/cosmic-passport-key.json` (owned by `passport.key.rotate`) — these ARE in `GENERATOR_OWNERSHIP_MAP` and would NOT be flagged as stale. They were not regenerated because their owning commands are not in `build.prepare` — this is a pipeline completeness issue (RFC-0604), not a stale file issue.

The first two categories are **stale files** — git-tracked files that no current generator produces. The third category is a pipeline completeness issue (RFC-0604), not a stale file.

## Problem

There is no command that detects git-tracked files in a site's `public/` directory that no registered generator in `GENERATOR_OWNERSHIP_MAP` produces. These files accumulate when:

1. Content pages are deleted but their generated preview images / markdown twins are not cleaned from git.
2. App names change (e.g., `webgogol-com` → `warpgogol-com`) but old-named generated files remain tracked.
3. Generators are renamed or their output paths change, but old files remain.

`generated.files.validate` (RFC-0375) checks that registry-declared files **exist** — it does not check for **extra** files that no registry entry claims. `public.managed.clean` removes stale markdown twins but only for `page.markdown.generate` outputs, not for preview images or other generator categories.

The gap: there is no inverse check — "is every git-tracked generated file still produced by some registered generator?"

## Decision

The kernel gains a `generated.stale.validate` command that detects files in a site's `public/` directory that are not produced by any registered generator in `GENERATOR_OWNERSHIP_MAP`, are not declared as static assets, and are not resolved by a content-aware resolver (e.g., per-page preview images whose owning content page still exists).

## Architectural fit

- **RFC-0087 (content-driven generation contract)**: Primary alignment — enforces the single-owner principle. Every generated file must be written by exactly one kernel command. If a file is in git but no generator claims it, it violates the contract. This RFC adds the inverse check: not only must every declared file exist, but no unregistered file should persist.
- **DNA-18 (Uni registry is the single UI index)**: Secondary alignment — `GENERATOR_OWNERSHIP_MAP` is a static registry that complements the Uni registry. While DNA-18 specifically refers to `uni.registry.yaml` (generated from `manifest.yaml` files), the ownership map follows the same single-source-of-truth principle for generated file paths.
- **RFC-0375 (generated.files.validate)**: Complementary — RFC-0375 checks existence (forward direction), this RFC checks staleness (inverse direction).
- **RFC-0599 (open-source.generate fix)**: Related — both RFCs address generator output completeness from different angles.

## Design

### CLI surface

```sh
pnpm exec site-kernel run generated.stale.validate --site warpgogol-com
pnpm exec site-kernel run generated.stale.validate --site warpgogol-com --json
```

Scope: `workspace` (operates per-site via `--site`).

### TypeScript contracts

The command uses the existing `Diagnostic` type from `@warpgogol/site-kernel` and `diagnosticsResult()` from `./result-helpers.ts`. No custom interface is needed.

```ts
// Uses existing Diagnostic type:
// { ruleId: string, severity: "error", file: string, message: string, fixHint?: string }

// Returns via:
// diagnosticsResult("generated.stale.validate", diagnostics)
```

### Algorithm

1. Enumerate all files in the site's `public/` directory using `collectFiles` from `@warpgogol/share/fs` (same pattern as `generated-files-validate.ts`). This avoids a git dependency — the command works in non-git environments (e.g., extracted Notausgang exports).
2. Expand all `GENERATOR_OWNERSHIP_MAP` entries (resolving `{lang}`, `{route}`, `{app}` placeholders) to concrete file paths for the site, reusing the `expandGlob` logic from `generated-files-validate.ts`.
3. Build a set of **expected generated paths** — all paths that registered generators claim.
4. Define a **static asset exempt directories** list: `public/textures/`. Files in these directories are legitimate static assets, not generated.
5. For `public/preview/{lang}/*.png` files: apply a **content-aware resolver** — derive the owning content page slug from the filename and check if `src/content/pages/{lang}/{slug}.md` exists. If the content page exists, the preview image is legitimate; if not, it is stale.
6. For each file in `public/`:
   - If it matches an expected generated path → OK (owned by a generator).
   - If it is in a static asset exempt directory (e.g., `public/textures/`) → OK (static asset).
   - If it is in `public/preview/` and the owning content page exists → OK (content-resolved).
   - Otherwise → **STALE-01** violation.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/generated-stale-validate.ts` | New module — implements `runGeneratedStaleValidate` |
| `packages/os/site-kernel-checks/src/generator-ownership.ts` | Read — `GENERATOR_OWNERSHIP_MAP` for expected paths |
| `packages/os/site-kernel-checks/src/generated-files-validate.ts` | Read — reuse `expandGlob` and `resolveEntryPath` logic |
| `packages/os/site-kernel-checks/src/result-helpers.ts` | Read — `diagnosticsResult()` for canonical result building |
| `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` | Register command in the codegen command table |
| `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` | Add to `SITES_BUILD_PREPARE_PIPELINE` after `generated.files.validate` |
| `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` | Add to `SITES_BUILD_PREPARE_DEV_PIPELINE` (RFC-0597 dev subset) |
| `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` | Add to `SITES_CHECK_AUTHOR_PIPELINE` after `generated.files.validate` (spread into `build.check`) |
| Site `public/` directory | Scanned for stale files |

### Output format

```json
{
  "command": "generated.stale.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "STALE-01",
      "severity": "error",
      "file": "public/preview/de/founder.png",
      "message": "File in public/ is not produced by any registered generator and is not a declared static asset",
      "fixHint": "Remove this file: git rm public/preview/de/founder.png"
    }
  ],
  "summary": { "error": 1, "warning": 0, "info": 0 }
}
```

### Failure modes

- **STALE-01** (error): Git-tracked file not produced by any registered generator and not a declared static asset.
- The command exits non-zero on any STALE-01 violation.
- No warnings — stale files are always errors.
- The command does not modify files — it is read-only.

## Rollout

- **Default behavior**: The command runs as a step in `build.prepare` (after `generated.files.validate`) and in `build.check` (via `SITES_CHECK_AUTHOR_PIPELINE`). It fails the pipeline on any STALE-01 violation.
- **Dev mode**: The command is also added to `SITES_BUILD_PREPARE_DEV_PIPELINE` (RFC-0597) so mission materialization catches stale files early.
- **Existing apps**: Must clean up stale files before the first pipeline run. The command itself reports exactly which files to `git rm`, so cleanup is mechanical.
- **New apps**: Automatically benefit — no stale files accumulate.
- **Grace period**: None — stale files are always errors. No bypass flag is provided.

## Alternatives considered

- **Extend `public.managed.clean` to handle all generator categories**: Rejected — `public.managed.clean` is specifically for markdown twin files (RFC-0166). Extending it to handle preview images, icons, and all other generator outputs would bloat its scope and mix cleanup with validation.
- **Use `git ls-files` + manual diff against ownership map in CI**: Rejected — this is exactly what the command automates. Manual CI scripts are fragile and bypass the kernel command registry.
- **Add a `--clean` flag to auto-delete stale files**: Rejected — validators must be read-only. Auto-deletion is destructive and should be a separate, explicit operator action.

## Risks

- **False positives for static assets**: Files in `public/` that are not in the ownership map but are legitimate static assets (e.g., `public/textures/section-noise.svg`) could be flagged. Mitigation: the algorithm checks against a hardcoded static-asset exempt directories list (`public/textures/`).
- **False positives for per-page preview images**: `public/preview/{lang}/{slug}.png` files are not in `GENERATOR_OWNERSHIP_MAP` (only `public/og-image.png` is registered). Mitigation: a content-aware resolver checks if the owning content page `src/content/pages/{lang}/{slug}.md` still exists. If it does, the preview image is legitimate.
- **Performance**: `collectFiles` on a site's `public/` directory with hundreds of files is fast (<100ms). The ownership map expansion reuses `expandGlob` from `generated-files-validate.ts` and is also fast. No performance concern.
- **Agent misinterpretation**: Agents might interpret STALE-01 as "delete the file immediately" without checking why it exists. The `fixHint` field says `git rm <path>`, but agents should verify the file is truly stale (not a newly added output that hasn't been registered yet).

## Acceptance criteria

- [ ] `generated.stale.validate` command registered in `01-codegen.ts` with `scope: workspace`
- [ ] `runGeneratedStaleValidate` implemented in `src/generated-stale-validate.ts`
- [ ] STALE-01 detects files in `public/` not produced by any registered generator
- [ ] Static assets in `public/textures/` are not flagged as stale
- [ ] Per-page preview images (`public/preview/{lang}/{slug}.png`) for existing content pages are not flagged as stale
- [ ] Per-page preview images for deleted content pages ARE flagged as stale
- [ ] Command added to `SITES_BUILD_PREPARE_PIPELINE` after `generated.files.validate`
- [ ] Command added to `SITES_BUILD_PREPARE_DEV_PIPELINE` (RFC-0597)
- [ ] Command added to `SITES_CHECK_AUTHOR_PIPELINE` after `generated.files.validate`
- [ ] `--json` output follows standard `CheckResult` shape with `diagnostics[]`
- [ ] Uses `collectFiles` from `@warpgogol/share/fs` (no `git ls-files` dependency)
- [ ] Uses `diagnosticsResult()` from `./result-helpers.ts` (no custom `StaleFileDiagnostic` interface)
- [ ] Unit test in `src/tests/generated-stale-validate.test.ts` covers stale detection, static asset exemption, preview image resolution, and clean-pass scenarios
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The command MUST use the existing `Diagnostic` type from `@warpgogol/site-kernel` and `diagnosticsResult()` from `./result-helpers.ts`. Do NOT create a custom `StaleFileDiagnostic` interface.
- The command MUST use `collectFiles` from `@warpgogol/share/fs` for filesystem traversal. Do NOT use `git ls-files` — the command must work in non-git environments.
- The command MUST reuse `expandGlob` and `resolveEntryPath` from `generated-files-validate.ts` for ownership map expansion.
- The static-asset exempt directories list MUST include `public/textures/`. Add new exempt directories here as needed.
- The content-aware resolver for `public/preview/{lang}/{slug}.png` MUST check `src/content/pages/{lang}/{slug}.md` existence via `context.io.exists()`.
- Agents MUST NOT auto-delete stale files — the command is read-only.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
