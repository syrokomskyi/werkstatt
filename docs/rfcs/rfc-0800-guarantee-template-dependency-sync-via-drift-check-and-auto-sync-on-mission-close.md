---
id: RFC-0800
title: "Guarantee template dependency sync via drift check and auto-sync on mission close"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: app
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-10
updatedAt: 2026-08-10
enhancedAt: 2026-08-10
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0557
  - RFC-0797
  - RFC-0137
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
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
    - template.deps.drift
  added: []
  changed:
    - mission.close
    - config.template.sync
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/werkstatt-site
  - packages/werkstatt
successSignals:
  - "template.deps.drift passes on all sites after mission.close auto-sync"
  - "mission.close auto-sync produces zero-drift template (no TEMPLATE-DEPS-DRIFT-01 errors on next mission.validate)"
  - "--skip-template-sync flag disables auto-sync without breaking close"
nonGoals:
  - "Does not sync scripts, engines, or other package.json fields — only dependencies and devDependencies"
  - "Does not compare astro.config.mjs blocks (optimizeDeps, ssr) — already handled by config.template.sync"
  - "Does not resolve multi-site dep divergence — all sites share the same template by convention; site-specific deps are a non-goal of the template system"
  - "Does not fix the stale writes path in config.template.sync module declaration (pre-existing metadata bug, tracked separately)"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0800: Guarantee template dependency sync via drift check and auto-sync on mission close

## Context

The Werkstatt onboarding system uses `package.template.json` (`packages/werkstatt-site/src/onboarding/templates/package.template.json`) as the canonical dependency manifest for all sites. During `mission.materialize`, `config.regenerate` reads the template, substitutes `{{CLIENT_ID}}` and `{{DOMAIN}}` tokens, and writes the workpiece `package.json`.

The reverse direction — workpiece → template — is handled by `config.template.sync --site <id>`, a **manual** command. There is no automated mechanism that triggers this sync when dependencies change in the workpiece.

This was discovered during mission warpgogol-com-m000047: `wrangler` was updated from `^4.114.0` to `^4.120.0` in the workpiece `package.json` to satisfy the `@cloudflare/vite-plugin` peer dependency. The template still had `^4.114.0`. Without manual intervention, the next materialization would overwrite the fix with the stale template version.

## Problem

Dependency updates in workpiece `package.json` are lost on the next materialization because `config.regenerate` overwrites `package.json` from `package.template.json`. The sync command (`config.template.sync`) exists but is never invoked automatically — it relies entirely on operator discipline.

This creates a silent drift: an agent updates a dep version in the workpiece to fix a build issue, the fix works, the mission closes, and the next mission for the same site materializes with the old version — reintroducing the bug.

There is no validator that detects this drift. `template.imports.validate` (RFC-0557) checks that imported packages exist in root `devDependencies`, but does not compare version ranges between workpiece and template.

## Decision

The kernel gains a `template.deps.drift` check command that compares `dependencies` and `devDependencies` between a workpiece `package.json` and `package.template.json`, emitting errors on version-range mismatches. `mission.close` automatically calls `config.template.sync --site <id>` before its final cache clone commits, with a `--skip-template-sync` flag to disable the auto-sync.

## Architectural fit

- **RFC-0557** (`template.imports.validate`): extends the template validation layer from import-existence to dependency-version drift. RFC-0557 checks that imported packages exist; this RFC checks that version ranges match.
- **RFC-0797** (`mission.close` auto-sync): follows the same pattern of automating manual interventions inside `mission.close`. The `--skip-template-sync` flag mirrors `--skip-auto-sync`.
- **RFC-0137** (implemented): established `config.template.sync` as a manual command for propagating dependency versions from a reference system into templates. This RFC automates the manual sync that RFC-0137 introduced — the drift check ensures the sync actually runs, and the auto-sync in `mission.close` removes the reliance on operator discipline.
- **Site OS operator model**: `template.deps.drift` is a site-scoped check (`scope: app`) integrated into `SITES_BUILD_CHECK_PIPELINE`. `config.template.sync` is invoked from `mission.close` via `executeKernelCommand`, consistent with the existing `sternsystem.sync` pattern.

## Design

### CLI surface

```sh
# Drift check — compares workpiece package.json deps against template
pnpm exec werkstatt run template.deps.drift --site warpgogol-com

# Auto-sync in mission.close (automatic, no manual command needed)
pnpm exec werkstatt run mission.close --mission warpgogol-com-m000047

# Skip auto-sync (operator escape hatch)
pnpm exec werkstatt run mission.close --mission warpgogol-com-m000047 --skip-template-sync
```

`template.deps.drift` is a site-scoped check (`scope: app`) integrated into `SITES_BUILD_CHECK_PIPELINE`. It takes `--site <id>` to resolve the workpiece directory and the template path.

### TypeScript contracts

```ts
interface TemplateDepsDriftData extends CheckResult {
  site: string;
  templatePath: string;
  workpiecePath: string;
  depsCompared: number;
  drift: Array<{
    package: string;
    section: "dependencies" | "devDependencies";
    workpieceVersion: string;
    templateVersion: string;
  }>;
}
```

The check reads both JSON files, iterates `dependencies` and `devDependencies` keys, and compares version strings. A mismatch (different range, different pinned version) is a drift error. Packages present in one file but not the other are also drift errors.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/onboarding/templates/package.template.json` | Read by drift check (canonical template) |
| `missions/<mission>/workpiece/package.json` | Read by drift check (materialized workpiece) |
| `packages/werkstatt-site/src/checks/template-deps-drift.ts` | New check command implementation |
| `packages/werkstatt/src/mission/mission-close.ts` | Modified — auto-sync call before final commits |

### Output format

```json
{
  "command": "template.deps.drift",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "TEMPLATE-DEPS-DRIFT-01",
      "severity": "error",
      "message": "Dependency 'wrangler' version mismatch: workpiece '^4.120.0', template '^4.114.0'",
      "fixHint": "Run: pnpm exec werkstatt run config.template.sync --site warpgogol-com"
    }
  ],
  "site": "warpgogol-com",
  "templatePath": "packages/werkstatt-site/src/onboarding/templates/package.template.json",
  "workpiecePath": "missions/warpgogol-com-m000047/workpiece/package.json",
  "depsCompared": 25,
  "drift": [
    {
      "package": "wrangler",
      "section": "devDependencies",
      "workpieceVersion": "^4.120.0",
      "templateVersion": "^4.114.0"
    }
  ]
}
```

### Failure modes

- **Drift detected**: `template.deps.drift` emits `TEMPLATE-DEPS-DRIFT-01` errors (severity: error) and exits with code 1. This blocks `mission.validate` when integrated into `build.check`.
- **Template or workpiece missing**: emits `TEMPLATE-DEPS-DRIFT-02` error and exits 1.
- **Auto-sync failure in mission.close**: `config.template.sync` failure is non-fatal (`logger.warn`) — the mission is already closing. The drift check on the next `mission.validate` will catch the residual drift.
- **`--skip-template-sync` flag**: disables auto-sync in `mission.close`. The drift check still runs in `build.check` and will block if drift exists.

## Rollout

- **Default behavior**: `template.deps.drift` is an error-level check from introduction. No grace period — the goal is guarantee, not gradual adoption.
- **Existing apps**: no migration needed. The check reads `package.template.json` (already present) and the current workpiece `package.json`. If they are already in sync (the common case), the check passes.
- **New apps**: automatically compliant — `config.regenerate` writes `package.json` from the template, so they start in sync.
- **Pipeline integration**: `template.deps.drift` is added to `SITES_BUILD_CHECK_PIPELINE`. Note: `template.imports.validate` (RFC-0557) lives in `PACKAGES_CHECK_PIPELINE`, not `SITES_BUILD_CHECK_PIPELINE` — the two checks operate in different pipelines (workspace-level import resolvability vs. site-level dep version drift).
- **mission.close integration**: auto-sync call is placed after inline validate and before the final cache clone commits (werkstatt, pin, bordbuch). This ensures the template is updated with any dependency changes made during the mission.
- **Data flow**: `config.template.sync` reads from `systems/<site>/package.json` (cache clone), not from `missions/<mission>/workpiece/package.json` directly. By close time, the cache clone reflects the workpiece: `mission.reconcile` pushes workpiece changes to the bare repo, and `mission.close` pushes to the cache clone before the auto-sync runs. The full flow is: workpiece → reconcile → cache clone → `config.template.sync` → `package.template.json`.
- **config.template.sync module declaration fix**: the handler at `config-template-sync.ts:141` already reads `input.flags.site` (not `--app` as RFC-0137 documented), but the module declaration at `module.ts:298` still declares `app` as the flag name. This RFC updates the module declaration to declare `site` instead, aligning the metadata with the actual handler behavior.

## Alternatives considered

- **Warning-only drift check**: rejected — warnings can be ignored, defeating the guarantee. The operator explicitly chose error-level enforcement.

- **Auto-sync in mission.reconcile instead of close**: rejected — reconcile may run multiple times per mission, producing redundant sync commits. Close runs once, at the end.

- **Auto-sync only, no drift check**: rejected — if auto-sync fails silently, the drift goes undetected. The drift check is the safety net.

- **Drift check only, no auto-sync**: rejected — operator would need to manually run `config.template.sync` to fix drift, reintroducing the manual discipline problem this RFC eliminates.

- **Compare all package.json fields (scripts, engines)**: rejected — scripts and engines rarely change and are already controlled by the template. Comparing only `dependencies` and `devDependencies` is the minimal effective scope.

## Risks

- **False positives from temporary debug dependencies**: an agent might add a temporary dep to the workpiece for debugging (e.g. a specific wrangler version). The drift check would fire. Mitigation: the auto-sync in `mission.close` propagates the change to the template before the check runs again. If the dep is truly temporary, the operator uses `--skip-template-sync` and removes the dep before close.

- **Performance**: `template.deps.drift` reads two JSON files and compares ~30 keys. Negligible — O(n) where n = dependency count.

- **Auto-sync committing unwanted changes**: `config.template.sync` copies `dependencies` and `devDependencies` from workpiece to template. If the workpiece has a broken or malicious dep, it propagates to the template. Mitigation: the template is version-controlled; the commit is visible in git history and can be reverted.

- **Agent confusion**: agents may not understand why `mission.close` modifies a file in `packages/werkstatt-site/`. Mitigation: log message clearly states "Auto-syncing template dependencies from workpiece…" and the `--skip-template-sync` flag is documented in AGENTS.md.
- **Multiple sites — last close wins**: if two sites have different dep versions in their workpieces, the last `mission.close` auto-sync overwrites the template with that site's versions. This is acceptable because all sites share the same template by convention — site-specific deps are a non-goal of the template system. If a site genuinely needs a different dep version, it should be handled via a separate mechanism (e.g. overrides), not via template drift.

## Acceptance criteria

- [x] `template.deps.drift` check command added to `packages/werkstatt-site/src/checks/template-deps-drift.ts` with `TEMPLATE-DEPS-DRIFT-01` rule ID (unit test: mock workpiece and template with mismatched dep versions, verify error diagnostic) (evidence: packages/werkstatt-site/src/checks/template-deps-drift.ts:1, packages/werkstatt-site/src/checks/tests/template-deps-drift.test.ts:1)
- [x] `template.deps.drift` integrated into `SITES_BUILD_CHECK_PIPELINE` (evidence: pipeline registration in command table) (evidence: packages/werkstatt-site/src/checks/pipelines/build-check.ts:48, packages/werkstatt-site/src/checks/command-tables/20-ecosystem.ts:148)
- [x] `template.deps.drift` detects version mismatch in `dependencies` and `devDependencies` (unit test: verify drift array and error severity) (evidence: packages/werkstatt-site/src/checks/tests/template-deps-drift.test.ts:83, packages/werkstatt-site/src/checks/tests/template-deps-drift.test.ts:110)
- [x] `template.deps.drift` passes when workpiece and template are in sync (unit test: identical deps → zero drift, exit 0) (evidence: packages/werkstatt-site/src/checks/tests/template-deps-drift.test.ts:178)
- [x] `mission.close` calls `config.template.sync --site <id>` via `executeKernelCommand` before final cache clone commits (unit test: verify `executeKernelCommand` called with `config.template.sync`) (evidence: packages/werkstatt/src/mission/mission-close.ts:218, packages/werkstatt/src/tests-handoff/mission-close-release-id.test.ts:32)
- [x] `mission.close` `--skip-template-sync` flag disables auto-sync (unit test: verify `executeKernelCommand` not called when flag is set) (evidence: packages/werkstatt/src/mission/mission-close.ts:187, packages/werkstatt/src/mission/index.ts:127)
- [x] Auto-sync failure is non-fatal in `mission.close` (unit test: mock sync failure, verify close proceeds with `logger.warn`) (evidence: packages/werkstatt/src/mission/mission-close.ts:226, packages/werkstatt/src/mission/mission-close.ts:234)
- [x] Root `AGENTS.md` updated with template dependency sync behavior (evidence: AGENTS.md onboarding/template section) (evidence: AGENTS.md:300)
- [x] `packages/werkstatt-site/AGENTS.md` documents `template.deps.drift` check (evidence: checks section) (evidence: packages/werkstatt-site/AGENTS.md:63)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- The `template.deps.drift` check MUST be error-level (not warning). Downgrading to warning defeats the guarantee.
- The auto-sync in `mission.close` MUST be non-fatal. A sync failure warns and continues — the drift check is the safety net.
- The `--skip-template-sync` flag MUST be documented in root `AGENTS.md` alongside `--skip-auto-sync` and `--skip-evidence-sync`.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it (RFC-0334).
