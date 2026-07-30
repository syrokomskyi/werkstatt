---
id: RFC-0600
title: "Add generated.stale.validate command for orphaned git-tracked generated files"
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
  - "Do not check files outside the site workpiece (e.g., packages/, docs/) — scope is strictly the site's public/ and src/ directories."
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
- **Separate-command outputs**: `public/.well-known/bordbuch.json`, `public/.well-known/bordbuch/index.html` (owned by `bordbuch.generate`), `public/.well-known/cosmic-passport-key.json` (owned by `passport.key.rotate`) — these are not in `build.prepare` and were not regenerated.

The first two categories are **stale files** — git-tracked files that no current generator produces. The third category is a pipeline completeness issue (RFC-0604).

## Problem

There is no command that detects git-tracked files in a site's `public/` (or `src/`) directory that no registered generator in `GENERATOR_OWNERSHIP_MAP` produces. These files accumulate when:

1. Content pages are deleted but their generated preview images / markdown twins are not cleaned from git.
2. App names change (e.g., `webgogol-com` → `warpgogol-com`) but old-named generated files remain tracked.
3. Generators are renamed or their output paths change, but old files remain.

`generated.files.validate` (RFC-0375) checks that registry-declared files **exist** — it does not check for **extra** files that no registry entry claims. `public.managed.clean` removes stale markdown twins but only for `page.markdown.generate` outputs, not for preview images or other generator categories.

The gap: there is no inverse check — "is every git-tracked generated file still produced by some registered generator?"

## Decision

The kernel gains a `generated.stale.validate` command that detects git-tracked files in a site's `public/` and `src/` directories that are not produced by any registered generator in `GENERATOR_OWNERSHIP_MAP` and are not declared as static assets.

## Architectural fit

- **DNA-18 (Uni registry is the single UI index)**: Extends the registry's authority — not only must all declared files exist, but no unregistered files should persist in git as generated artifacts.
- **RFC-0375 (generated.files.validate)**: Complementary — RFC-0375 checks existence (forward direction), this RFC checks staleness (inverse direction).
- **RFC-0087 (content-driven generation contract)**: Enforces the single-owner principle — if a file is in git but no generator claims it, it violates the contract.
- **RFC-0599 (open-source.generate fix)**: Related — both RFCs address generator output completeness from different angles.

## Design

### CLI surface

```sh
pnpm exec site-kernel run generated.stale.validate --site warpgogol-com
pnpm exec site-kernel run generated.stale.validate --site warpgogol-com --json
```

Scope: `workspace` (operates per-site via `--site`).

### TypeScript contracts

```ts
interface StaleFileDiagnostic {
  rule: "STALE-01";
  file: string;  // Relative to site directory
  message: string;
  fix: string;   // "Remove this file from git: git rm <path>"
}
```

The command uses the standard `CheckResult` pattern with `violations[]`.

### Algorithm

1. Enumerate all git-tracked files in the site's `public/` and `src/` directories (via `git ls-files`).
2. Expand all `GENERATOR_OWNERSHIP_MAP` entries (resolving `{lang}`, `{route}`, `{app}` placeholders) to concrete file paths for the site.
3. Build a set of **expected generated paths** — all paths that registered generators claim.
4. Build a set of **static asset paths** — files in `public/` that are not in the ownership map and are not in `.assetsignore`. These are legitimate static assets (e.g., `public/textures/section-noise.svg`).
5. For each git-tracked file:
   - If it matches an expected generated path → OK (owned by a generator).
   - If it is in a static asset directory (e.g., `public/textures/`) → OK (static asset).
   - If it matches a `.assetsignore` pattern → OK (build-time artifact, not committed).
   - Otherwise → **STALE-01** violation.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/generated-stale-validate.ts` | New module — implements `runGeneratedStaleValidate` |
| `packages/os/site-kernel-checks/src/generator-ownership.ts` | Read — `GENERATOR_OWNERSHIP_MAP` for expected paths |
| `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` | Register command in the codegen command table |
| `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` | Add to `build.prepare` pipeline after `generated.files.validate` |
| Site `public/` directory | Scanned for stale files |
| Site `src/` directory | Scanned for stale files |

### Output format

```json
{
  "command": "generated.stale.validate",
  "status": "fail",
  "violations": [
    {
      "rule": "STALE-01",
      "file": "public/preview/de/founder.png",
      "message": "Git-tracked file is not produced by any registered generator and is not a declared static asset",
      "fix": "Remove this file from git: git rm public/preview/de/founder.png"
    }
  ]
}
```

### Failure modes

- **STALE-01** (error): Git-tracked file not produced by any registered generator and not a declared static asset.
- The command exits non-zero on any STALE-01 violation.
- No warnings — stale files are always errors.
- The command does not modify files — it is read-only.

## Rollout

- **Default behavior**: The command runs as a step in `build.prepare` (after `generated.files.validate`) and in `build.check`. It fails the pipeline on any STALE-01 violation.
- **Existing apps**: Must clean up stale files before the first pipeline run. The command itself reports exactly which files to `git rm`, so cleanup is mechanical.
- **New apps**: Automatically benefit — no stale files accumulate.
- **Grace period**: None — stale files are always errors. The operator can bypass with `--no-stale-validate` if needed during migration, but this flag is not persistent.

## Alternatives considered

- **Extend `public.managed.clean` to handle all generator categories**: Rejected — `public.managed.clean` is specifically for markdown twin files (RFC-0166). Extending it to handle preview images, icons, and all other generator outputs would bloat its scope and mix cleanup with validation.
- **Use `git ls-files` + manual diff against ownership map in CI**: Rejected — this is exactly what the command automates. Manual CI scripts are fragile and bypass the kernel command registry.
- **Add a `--clean` flag to auto-delete stale files**: Rejected — validators must be read-only. Auto-deletion is destructive and should be a separate, explicit operator action.

## Risks

- **False positives for static assets**: Files in `public/` that are not in the ownership map but are legitimate static assets (e.g., `public/textures/section-noise.svg`) could be flagged. Mitigation: the algorithm checks against a static-asset allowlist (files not matching any ownership entry and not in `.assetsignore` are flagged, but known static directories like `public/textures/` are exempted).
- **Performance**: `git ls-files` on a site with hundreds of tracked files is fast (<100ms). The ownership map expansion is also fast. No performance concern.
- **Agent misinterpretation**: Agents might interpret STALE-01 as "delete the file immediately" without checking why it exists. The `fix` field explicitly says `git rm <path>`, but agents should verify the file is truly stale (not a newly added output that hasn't been registered yet).

## Acceptance criteria

- [ ] `generated.stale.validate` command registered in `01-codegen.ts` with `scope: workspace`
- [ ] `runGeneratedStaleValidate` implemented in `src/generated-stale-validate.ts`
- [ ] STALE-01 detects git-tracked files not produced by any registered generator
- [ ] Static assets in `public/textures/` are not flagged as stale
- [ ] Command added to `SITES_BUILD_PREPARE_PIPELINE` after `generated.files.validate`
- [ ] `--json` output follows standard `CheckResult` shape with `violations[]`
- [ ] Unit test in `src/tests/generated-stale-validate.test.ts` covers stale detection, static asset exemption, and clean-pass scenarios
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The command MUST follow the existing `CheckResult` pattern: `violations[]` with `rule`, `file`, `message`, and `fix` fields, returned via `ok(cmd)` / `fail(cmd, violations)` from `./shared.ts`.
- The static-asset allowlist MUST include `public/textures/` and any other directories that contain legitimate non-generated assets. Check the site's `.assetsignore` for guidance.
- Agents MUST NOT auto-delete stale files — the command is read-only.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
