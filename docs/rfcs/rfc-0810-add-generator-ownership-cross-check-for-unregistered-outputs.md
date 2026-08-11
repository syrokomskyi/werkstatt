---
id: RFC-0810
title: "Add generator ownership cross-check to detect unregistered generator outputs"
status: accepted
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-12
updatedAt: 2026-08-12
enhancedAt: 2026-08-12
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0785
  - RFC-0601
  - RFC-0087
  - RFC-0612
satisfies:
  - DNA-58
versionBump: patch
commands:
  proposed:
    - "ownership.generator.cross-check"
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "New generator command with unregistered outputs fails ownership.cross-check before mission.validate"
  - "Existing generators with full ownership map coverage pass without changes"
  - "Cross-check integrated into build.prepare pipeline"
nonGoals:
  - "Automatically adding entries to GENERATOR_OWNERSHIP_MAP"
  - "Static analysis of generator source code"
  - "Replacing ownership.sync.validate"
acceptance:
  - probe: command-registered
    name: "ownership.generator.cross-check"
---

# RFC-0810: Add generator ownership cross-check to detect unregistered generator outputs

## Context

The `GENERATOR_OWNERSHIP_MAP` in `packages/werkstatt-site/src/checks/generator-ownership.ts` is a hand-maintained registry that maps generated file paths to their owning generator command. When a new generator command is added but its output files are not registered in this map, `ownership.sync.validate` fails with `OWN-01` (uncovered files) errors during `mission.validate`.

During the warpgogol-com-m000050 release, `agent.discovery-endpoints.generate` was added (RFC-0785) writing `public/auth.md`, `public/.well-known/agent-skills/index.json`, `public/.well-known/oauth-protected-resource`, and `public/.well-known/oauth-authorization-server` — but these files were never added to `GENERATOR_OWNERSHIP_MAP`. This was only discovered when `mission.validate` failed, requiring a full pipeline rerun.

## Problem

There is no automated check that verifies every `.generate` command's output files are covered by `GENERATOR_OWNERSHIP_MAP`. The gap is only discovered at `ownership.sync.validate` time, which is deep in the `mission.validate` pipeline — costing 2–4 minutes per discovery cycle.

The root cause is that generator output paths are declared in the generator's source code (e.g. `agent-discovery-endpoints.ts` writes to `join(wellKnownDir, "oauth-protected-resource")`) but the ownership map is a separate hand-maintained data structure. There is no cross-reference between the two.

## Decision

Add a new command `ownership.generator.cross-check` that cross-references all registered commands with a `.generate` suffix against the `GENERATOR_OWNERSHIP_MAP`. The command checks that:

1. Every command ending in `.generate` has at least one entry in `GENERATOR_OWNERSHIP_MAP`.
2. Every entry in `GENERATOR_OWNERSHIP_MAP` references a registered command (no phantoms).
3. The `module` path in each ownership entry points to a file that exists.

This command runs in the `build.prepare` pipeline — before `ownership.sync.validate` — so that missing registrations are caught before the expensive build and validate steps. `ownership.sync.validate` runs in `SITES_BUILD_PREPARE_PIPELINE` (not `build.check`), so the cross-check must be placed in the same pipeline, before it.

## Architectural fit

- **DNA-58 (Generated-file content determinism)**: This RFC strengthens the ownership contract that underpins `generated.drift.validate` (RFC-0601). If a file's generator is not in the ownership map, drift validation cannot verify its determinism. The cross-check enforces that every app-scoped `.generate` command has an ownership entry, closing the gap between generator registration and ownership map coverage.
- **RFC-0785 (Agent discovery endpoints)**: The triggering case. This RFC would have caught the missing ownership entries before `mission.validate`.

## Design

### CLI surface

```sh
pnpm exec werkstatt run ownership.generator.cross-check
```

### TypeScript contracts

```ts
interface OwnershipCrossCheckResult {
  command: "ownership.generator.cross-check";
  status: "pass" | "fail";
  uncovered: Array<{
    command: string;
    reason: "no-ownership-entry" | "module-not-found";
  }>;
  phantoms: Array<{
    command: string;
    path: string;
    reason: "command-not-registered";
  }>;
  checked: number;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/checks/generator-ownership.ts` | Source of `GENERATOR_OWNERSHIP_MAP` |
| `packages/werkstatt-site/src/checks/ownership-cross-check.ts` | New command implementation |
| `packages/werkstatt-site/src/checks/command-tables/*.ts` | Command registration for cross-check |
| Pipeline definitions (`build.prepare`) | Add `ownership.generator.cross-check` before `ownership.sync.validate` |

### Output format

```json
{
  "command": "ownership.generator.cross-check",
  "status": "fail",
  "uncovered": [
    {
      "command": "agent.discovery-endpoints.generate",
      "reason": "no-ownership-entry"
    }
  ],
  "phantoms": [],
  "checked": 45
}
```

### Failure modes

- **OWN-XCHECK-01**: An app-scoped `.generate` command has no entry in `GENERATOR_OWNERSHIP_MAP`. Severity: error, exit code 1. Message: `OWN-XCHECK-01: command "agent.discovery-endpoints.generate" has no ownership map entry`.
- **OWN-XCHECK-02**: An ownership map entry references a command that is not registered. Severity: error, exit code 1. Message: `OWN-XCHECK-02: ownership entry for path "public/foo.json" references unregistered command "foo.generate"`.
- **OWN-XCHECK-03**: An ownership map entry references a `module` path that does not exist. Severity: warning, exit code 0. Message: `OWN-XCHECK-03: ownership entry for "public/foo.json" points to non-existent module "packages/nonexistent/foo.ts".`.

## Rollout

- **Default behavior**: Fail-hard from day one. The cross-check is a registry consistency check — if an app-scoped `.generate` command lacks an ownership entry, that is a bug, not a migration issue. Existing sites must fix missing entries before merging this RFC.
- **Pipeline integration**: Add to `SITES_BUILD_PREPARE_PIPELINE` (in `build-prepare.ts`), before `ownership.sync.validate` (currently at line 159). Also add to `SITES_BUILD_PREPARE_DEV_PIPELINE` at the same relative position.
- **New sites**: Must pass from day one — `onboarding.scaffold` should include ownership entries for all initial generators.
- **Scope filter**: Only `scope: "app"` commands ending in `.generate` are checked. Workspace-scoped generators (e.g. `ecosystem.manifest.generate`, `fleet.sites.generate`, `gate.catalog.generate`) write to `docs/`, `fleet/`, or `.cache/` — not to `apps/<id>/`, so they are exempt. The ownership map covers app-scoped files only.

## Alternatives considered

- **Extending `generator.ownership.lint` (RFC-0087)**: Adding uncovered-generator detection to the existing ownership lint. Rejected because `generator.ownership.lint` runs in `PACKAGES_CHECK_PIPELINE` (`packages-check.ts:63`), while the cross-check must run in `SITES_BUILD_PREPARE_PIPELINE` before `ownership.sync.validate` to catch missing registrations before the expensive build steps. Different pipelines, different purposes: `generator.ownership.lint` detects multi-owner paths; the cross-check detects uncovered generators.
- **Declared outputs on command registration**: Adding a `declaredOutputs: string[]` field to `KernelCommandDefinition`. Rejected because it duplicates the ownership map and requires changing every generator's registration. The ownership map already serves as the declared-outputs registry.
- **Static analysis of generator source code**: Parsing generator `.ts` files to extract `writeFile` calls. Rejected — too fragile and would require a TypeScript AST walker.
- **Merging ownership map into command registration**: Rejected — the ownership map is site-stack-specific (`werkstatt-site`), while command registration is in `command-tables/`. They live in the same package but serve different concerns.

## Risks

- **False positives for conditional generators**: Some generators only produce files under certain conditions (e.g. `image.variants.generate` only when source images exist). The cross-check should only verify that an ownership map entry **exists**, not that files are present on disk — `conditional: true` entries are still valid.
- **False positives for workspace-scoped generators**: Commands like `ecosystem.manifest.generate`, `fleet.sites.generate`, `gate.catalog.generate`, `maintenance.debt.queue.generate`, `check.report.generate`, `check.action-pack.generate`, `content.regression.review.generate`, and `print.pdf.generate` are workspace-scoped and write to `docs/`, `fleet/`, or `.cache/` — not to `apps/<id>/`. The cross-check filters by `scope: "app"` to exclude them.
- **Post-build and ephemeral outputs**: `dist.sitemap.images.generate` writes to `dist/client/` and `print.pdf.generate` writes to `.cache/pdf/`. These are not covered by `GENERATOR_OWNERSHIP_MAP` (which tracks `apps/<id>/` files) and are excluded by the `scope: "app"` filter where applicable, or by the fact that their outputs are not in `apps/<id>/public/` or `apps/<id>/src/`.
- **Maintenance burden**: The cross-check itself needs to be maintained. However, it is a simple registry cross-reference with minimal logic.

## Acceptance criteria

- [ ] `ownership.generator.cross-check` command registered
- [ ] Cross-references all `.generate` commands against `GENERATOR_OWNERSHIP_MAP`
- [ ] Reports `OWN-XCHECK-01` for uncovered generators
- [ ] Reports `OWN-XCHECK-02` for phantom command references
- [ ] Reports `OWN-XCHECK-03` for non-existent module paths
- [ ] Integrated into `build.prepare` pipeline before `ownership.sync.validate`
- [ ] `--json` output format documented and stable
- [ ] Unit tests for all three failure modes
- [ ] Existing sites pass without changes (all app-scoped generators have ownership entries)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (RFC-0331 governs the accepted→implemented transition and verification evidence for probe-bearing RFCs). If this RFC conflicts with a DNA invariant during implementation, create a superseding RFC rather than amending.
- The cross-check reads `GENERATOR_OWNERSHIP_MAP` and the command registry — both are in-memory data structures, so the command is fast (no file I/O beyond checking `module` path existence).
- The command scope is `workspace` (it checks all registered app-scoped generators, not per-site). No `--site` flag is needed — the registry is workspace-wide.
- When integrating into `build.prepare`, place it before `ownership.sync.validate` (currently at line 159 of `build-prepare.ts`) so that missing ownership is caught before the expensive validate steps.
- Filter logic: iterate all registered commands, select those with `name` ending in `.generate` AND `scope: "app"`. For each, check that at least one `GENERATOR_OWNERSHIP_MAP` entry has a matching `command` field. Workspace-scoped `.generate` commands (`scope: "workspace"`) are skipped.
