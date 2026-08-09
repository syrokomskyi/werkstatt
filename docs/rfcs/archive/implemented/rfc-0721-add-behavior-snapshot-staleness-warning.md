---
id: RFC-0721
title: "Add behavior snapshot staleness warning to build.prepare for route changes"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-06
updatedAt: 2026-08-06
implementedAt: 2026-08-06
enhancedAt: 2026-08-06
supersedes: []
amends: []
amendedBy: []
related:
  - RFC-0269
  - RFC-0615
  - RFC-0689
  - RFC-0697
satisfies: []
versionBump: patch
commands:
  proposed:
    - behavior.snapshot.staleness.check
  added:
    - behavior.snapshot.staleness.check
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "behavior.snapshot.staleness.check emits a warning when system.md pages[] routes change but behavior.snapshot.generated.yaml is not regenerated"
  - "build.prepare pipeline includes the staleness check as a non-fatal warning step"
  - "Existing auto-regeneration via orchestrateSnap01Recovery continues to handle SNAP-01 recovery in build.post"
nonGoals:
  - "Does not replace SNAP-01 auto-regeneration in build.post — this is an early warning in build.prepare"
  - "Does not regenerate the snapshot — only warns that it may be stale"
  - "Does not check content changes — only route structure changes (pages[] routes)"
  - "Does not check removedRoutes direction (snapshot routes not in system.md) — Programmatic Surface routes (DNA-39) are not in system.md pages[] and would produce false positives; SNAP-01 in build.post catches all drift including removed routes"
---

# RFC-0721: Add behavior snapshot staleness warning to build.prepare for route changes

## Context

During RFC-0708 implementation, new Nachweis pages were added to `system.md pages[]` but `behavior.snapshot.generate` was not run. This caused `behavior.snapshot.validate` (SNAP-01) to fail in `build.post`, reporting new routes absent from the committed snapshot.

The existing auto-regeneration (`orchestrateSnap01Recovery` from RFC-0697) handles SNAP-01 recovery in `build.post` and `mission.validate`. However, it only triggers **after** the build fails — agents do not know the snapshot is stale until `build.post` runs. A pre-build warning in `build.prepare` would alert agents earlier.

## Decision

Add a `behavior.snapshot.staleness.check` command that checks whether `system.md pages[]` routes are present in the committed `behavior.snapshot.generated.yaml`, and add it as a non-fatal warning step at the end of `build.prepare`.

## Justification

- **Early warning:** `build.prepare` runs before `build.post` — agents see the warning before the build fails.
- **Advisory, not blocking:** Warnings do not fail `build.prepare`. The existing SNAP-01 auto-regeneration in `build.post` remains the recovery mechanism.
- **Route-level check:** Only `pages[]` routes from `system.md` are compared — content changes within pages do not trigger staleness (they change route behavior, not route existence).
- **One-directional:** Only checks the `newRoutes` direction (system.md routes absent from snapshot). The `removedRoutes` direction is intentionally excluded because the behavior snapshot includes Programmatic Surface routes (DNA-39) that are not declared in `system.md pages[]` — checking that direction would produce false positives on every surface-enabled site. SNAP-01 in `build.post` catches all drift, including removed routes.
- **Complements RFC-0697:** `orchestrateSnap01Recovery` handles the recovery; this check provides earlier visibility.

## Design

### Command: `behavior.snapshot.staleness.check`

```ts
export async function runBehaviorSnapshotStalenessCheck(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) return passResult("behavior.snapshot.staleness.check", "skipped (no app context)");

  // Read system.md pages[] routes
  let declaredRoutes: Set<string>;
  try {
    const { manifest } = await loadSystemManifest(join(app.directory, "src", "content"));
    const pages = (manifest as { pages?: Array<{ routes?: Record<string, string> }> }).pages ?? [];
    declaredRoutes = new Set<string>();
    for (const page of pages) {
      for (const route of Object.values(page.routes ?? {})) {
        if (typeof route === "string") {
          declaredRoutes.add(route);
        }
      }
    }
  } catch {
    return diagnosticsResult("behavior.snapshot.staleness.check", []);
  }

  let committedRoutes: Set<string>;
  try {
    const raw = await readFile(join(app.directory, "behavior.snapshot.generated.yaml"), "utf8");
    const snapshot = yamlParse(raw) as { routes?: { route: string }[] };
    committedRoutes = new Set((snapshot.routes ?? []).map(r => r.route));
  } catch {
    // No committed snapshot — SNAP-02 will catch this in build.post
    return passResult("behavior.snapshot.staleness.check", "skipped (no committed snapshot)");
  }

  // Find routes in system.md but not in snapshot (one-directional check)
  // Only newRoutes direction — removedRoutes would flag Programmatic Surface
  // routes (DNA-39) that are not in system.md pages[].
  const newRoutes = [...declaredRoutes].filter(r => !committedRoutes.has(r));

  const diagnostics: Diagnostic[] = newRoutes.map(route => ({
    ruleId: "SNAP-STALE-01",
    severity: "warning" as const,
    message: `Route "${route}" is declared in system.md but absent from behavior.snapshot.generated.yaml`,
    fixHint: "Run: pnpm exec werkstatt run behavior.snapshot.generate --site <app>, then commit the updated snapshot",
  }));

  return diagnosticsResult("behavior.snapshot.staleness.check", diagnostics);
}
```

### Pipeline integration

Add as the last step in `build.prepare` pipeline (after `generated.stale.validate`):

```ts
{ command: "behavior.snapshot.staleness.check" },
```

Also add to `SITES_BUILD_PREPARE_DEV_PIPELINE` (RFC-0597) so developers see stale warnings during dev iterations. The check is advisory and lightweight (~200ms).

### Diagnostic codes

- `SNAP-STALE-01` — Route declared in `system.md pages[]` but absent from `behavior.snapshot.generated.yaml` (warning, non-fatal)

### Relationship to existing SNAP-01/02

| Check | When | Severity | Recovery |
| --- | --- | --- | --- |
| `SNAP-STALE-01` (this RFC) | `build.prepare` | warning | Agent runs `behavior.snapshot.generate` |
| `SNAP-01` (RFC-0269) | `build.post` | error | Auto-regeneration via `orchestrateSnap01Recovery` |
| `SNAP-02` (RFC-0269) | `build.post` | error | Agent runs `behavior.snapshot.generate` |

### File system responsibilities

| Path                                     | Read | Write |
| ---------------------------------------- | ---- | ----- |
| `<app>/src/content/system.md`            | yes  | no    |
| `<app>/behavior.snapshot.generated.yaml` | yes  | no    |

### Output format

`--json` output shape:

```json
{
  "command": "behavior.snapshot.staleness.check",
  "status": "pass",
  "diagnostics": [
    {
      "ruleId": "SNAP-STALE-01",
      "severity": "warning",
      "message": "Route \"/de/nachweis/foo/\" is declared in system.md but absent from behavior.snapshot.generated.yaml",
      "fixHint": "Run: pnpm exec werkstatt run behavior.snapshot.generate --site <app>, then commit the updated snapshot"
    }
  ],
  "summary": { "error": 0, "warning": 1, "info": 0 }
}
```

### Failure modes

- Exit code 0: no stale routes detected, or skipped (no app context, no committed snapshot, system.md unreadable)
- Exit code 0 with warnings: stale routes detected — warnings are advisory and do not fail the pipeline
- The command never returns exit code 1 — it is advisory only

## Architectural fit

- **Package boundary:** The command lives in `@warpgogol/site-kernel-checks` alongside the existing `behavior.snapshot.generate` and `behavior.snapshot.validate` commands. No cross-package imports needed beyond `@warpgogol/site-kernel-content` (for `loadSystemManifest`) and `@warpgogol/site-kernel-astro` (for `requireAstroSitePaths`), both already used by the existing snapshot commands.
- **Pipeline placement:** `build.prepare` is the correct pipeline — the check runs before `build.post` where `behavior.snapshot.validate` (SNAP-01) would catch the same drift as an error. Placing it at the end of `build.prepare` ensures `routes.generate` has already run, so the route set is complete.
- **Command lifecycle:** `commands.proposed` and `commands.added` both list `behavior.snapshot.staleness.check`. No existing commands are changed or removed.
- **Compass sync:** No `docs/*.xml` files need synchronization — this RFC adds a command within an existing package, not a new shared contract or app-package relationship.
- **AGENTS.md update:** `packages/os/site-kernel-checks/AGENTS.md` module table needs a new entry for `behavior-snapshot-staleness.ts`.

## Rollout

- **Default behavior:** The check is added to `build.prepare` and `SITES_BUILD_PREPARE_DEV_PIPELINE` immediately. Existing sites with up-to-date snapshots will see zero warnings.
- **Adoption path for existing apps:** No migration needed — the check is advisory. If an existing app has stale routes, the warning appears in the next `build.prepare` run and the agent can regenerate the snapshot.
- **New-app compliance:** New sites materialized via `mission.materialize` will have a fresh snapshot from the first `build.post`, so `build.prepare` will not warn.

## Alternatives considered

- **Flag on `behavior.snapshot.validate`:** Rejected because `behavior.snapshot.validate` requires `dist/client` and runs in `build.post`. The staleness check runs in `build.prepare` before dist exists — different scope, different timing.
- **Compare against merged route registry (`getRouteRegistry()`):** Rejected because it adds a dependency on `@warpgogol/share` and complexity. The one-directional check (system.md routes absent from snapshot) is sufficient for the early warning use case. SNAP-01 in `build.post` catches all drift.
- **No check (status quo):** Rejected because agents discover stale snapshots only when `build.post` fails, wasting build time. An early warning in `build.prepare` is cheaper.

## Risks

- **Agent misinterpretation:** Agents might treat SNAP-STALE-01 warnings as fatal and abort the build. Mitigation: the warning severity is `warning`, not `error`, and the `fixHint` says to regenerate, not to abort.
- **False positives from i18n route format mismatches:** If `system.md pages[]` uses a different route format than the snapshot (e.g. trailing slash differences), the check will produce false positives. Mitigation: both use the same route format (routes are declared as full paths in system.md and stored as-is in the snapshot).
- **Performance:** ~200ms for typical sites (YAML parse + set comparison). Negligible compared to the total `build.prepare` runtime.

## Acceptance criteria

- [x] `behavior.snapshot.staleness.check` command is registered in `BUILD_INFRA_COMMANDS` with `scope: "app"` (evidence: packages/os/site-kernel-checks/src/command-tables/build-infra.ts:142-152)
- [x] Command emits `SNAP-STALE-01` warning when a `system.md pages[]` route is absent from `behavior.snapshot.generated.yaml` (evidence: packages/os/site-kernel-checks/src/behavior-snapshot-staleness.ts:77-88, tests/behavior-snapshot-staleness.test.ts:103-120)
- [x] Command does NOT emit warnings for Programmatic Surface routes (DNA-39) — only `newRoutes` direction is checked (evidence: packages/os/site-kernel-checks/src/behavior-snapshot-staleness.ts:75-90, tests/behavior-snapshot-staleness.test.ts:146-160)
- [x] Command returns exit code 0 with warnings (advisory, non-fatal) (evidence: behavior-snapshot-staleness.ts uses diagnosticsResult which sets exitCode 0 for warnings, tests/behavior-snapshot-staleness.test.ts:111)
- [x] Command skips gracefully when no committed snapshot exists (SNAP-02 handles this in `build.post`) (evidence: behavior-snapshot-staleness.ts:71-73, tests/behavior-snapshot-staleness.test.ts:119-132)
- [x] `build.prepare` pipeline includes the staleness check as the last step (evidence: packages/os/site-kernel-checks/src/pipelines/build-prepare.ts:140-142)
- [x] `SITES_BUILD_PREPARE_DEV_PIPELINE` (RFC-0597) includes the staleness check (evidence: packages/os/site-kernel-checks/src/pipelines/build-prepare.ts:207-208)
- [x] `packages/os/site-kernel-checks/AGENTS.md` module table is updated with the new command (evidence: packages/os/site-kernel-checks/AGENTS.md:30)
- [x] `command.manifest.generate` is run to update `docs/command-manifest.generated.yaml` (evidence: docs/command-manifest.generated.yaml contains behavior.snapshot.staleness.check)
- [x] Existing auto-regeneration via `orchestrateSnap01Recovery` continues to handle SNAP-01 recovery in `build.post` (evidence: no changes to orchestrateSnap01Recovery or build.post pipeline — this RFC only adds a new command to build.prepare)
- [x] Unit tests cover: stale route detected, no snapshot (skip), no app context (skip), surface routes not flagged (evidence: packages/os/site-kernel-checks/src/tests/behavior-snapshot-staleness.test.ts — 5 tests, all passing)

## Implementation notes for agents

- The command scope is `app`, not `workspace` — it uses `requireAstroSitePaths(context)` for path resolution.
- Run `command.manifest.generate` after registering the command in the command table (RFC-CMD-02).
- Update `packages/os/site-kernel-checks/AGENTS.md` to document the new command in the module table.
- The check is placed at the END of `build.prepare` (after `generated.stale.validate`), not after `routes.generate` — it needs `routes.generate` to have run first so the route set is complete.
- Do NOT add a `removedRoutes` direction — it would produce false positives on every surface-enabled site (DNA-39).

## Consequences

- **Positive:** Agents see stale snapshot warnings before `build.post` fails, enabling proactive regeneration.
- **Positive:** Reduces build failures from stale snapshots — agents can regenerate during `build.prepare`.
- **Negative:** One additional pipeline step in `build.prepare` (~200ms for typical sites).
- **Technical debt:** The check compares route paths only, not full route behavior. Content changes that affect route behavior (title, meta, JSON-LD) are still caught by SNAP-01 in `build.post`.
- **One-directional limitation:** The check only covers `newRoutes` (system.md routes absent from snapshot). Removed routes are not flagged by this check — SNAP-01 in `build.post` handles that direction.

## Evolution

If `behavior.snapshot.generate` is ever added to `build.prepare` as an automatic step, this staleness check becomes redundant. Until then, it provides early warning without auto-regenerating (which requires a build to exist first).
