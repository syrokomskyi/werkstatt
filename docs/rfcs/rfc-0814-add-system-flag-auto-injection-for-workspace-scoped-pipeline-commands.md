---
id: RFC-0814
title: "Add --system flag auto-injection for workspace-scoped pipeline commands"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-12
updatedAt: 2026-08-12
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0790
satisfies:
  - DNA-2
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - "pipeline executor (internal)"
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "Workspace-scoped commands receive --system automatically from pipeline context"
  - "dns.record.upsert works in pipeline without manual --system flag"
  - "No need to make --system optional on commands that require it"
nonGoals:
  - "Auto-injecting --system for non-workspace-scoped commands"
  - "Changing --site injection behavior"
  - "Removing the --system flag from any command"
acceptance:
  - probe: run
    command: "werkstatt run dns.record.upsert --site warpgogol-com"
    expect:
      exitCode: 0
---

# RFC-0814: Add --system flag auto-injection for workspace-scoped pipeline commands

## Context

The pipeline executor in `packages/werkstatt/src/kernel/runtime/execute-pipeline.ts` auto-injects the `--site` flag for workspace-scoped commands (line 692):

```ts
if (command.scope === "workspace" && !stepArgs.includes("--site") && site.name) {
  stepArgs.push("--site", site.name);
}
```

This allows workspace-scoped commands like `bordbuch.validate` to receive the site name from the pipeline context without explicitly passing `--site` in each pipeline step definition.

However, there is no equivalent auto-injection for `--system`. Some workspace-scoped commands (e.g. `dns.record.upsert`, `sternsystem.sync`, `sternsystem.pin`) need the Sternsystem ID to resolve the correct `system-config.yaml` from `systems-cache/{id}/`. During the warpgogol-com-m000050 release, `dns.record.upsert` required `--system` as a mandatory flag, but the pipeline did not inject it. The workaround was to make `--system` optional in the command's flag schema — which is incorrect because the command genuinely needs a system ID to function.

## Problem

Workspace-scoped commands that need the Sternsystem ID have no way to receive it automatically from the pipeline context. The pipeline knows which site it is running for (via `site.name`), and the system ID is derivable from the site name (they are typically the same, e.g. `warpgogol-com`), but the pipeline executor does not inject it.

This leads to two anti-patterns:

1. **Making `--system` optional** when it should be required — the command cannot function without it, but the flag schema says it is optional to avoid pipeline failures.
2. **Hardcoding `--system` in pipeline step definitions** — each step that needs the system ID must explicitly pass `args: ["--system", "warpgogol-com"]`, which defeats the purpose of auto-injection.

## Decision

The pipeline executor auto-injects `--system` for workspace-scoped commands, following the same pattern as `--site` injection. The system ID is resolved from the site name via the existing `discoverSystems` / `readSystemConfigSmart` infrastructure.

The injection logic:

```ts
if (command.scope === "workspace" && !stepArgs.includes("--system") && site.name) {
  // The system ID is the same as the site name for Sternsystem-registered sites.
  // This mirrors the 1:1 relationship between sites and Sternsystems.
  stepArgs.push("--system", site.name);
}
```

This is safe because:

- Sternsystems are registered with `id` matching the site name (RFC-0790).
- The `systems-cache/{id}/system-config.yaml` uses the site name as the system ID.
- If a command does not accept `--system`, the flag is ignored (the command's flag schema will reject it if `--system` is not declared — see below).

## Architectural fit

- **DNA-2 (pnpm workspace + Turborepo)**: No structural change.
- **RFC-0790 (Sternsystem convention-based discovery)**: The 1:1 site-to-system relationship is already established. This RFC formalizes it in the pipeline executor.
- **RFC-0260 (flag schema validation)**: Commands with declared flag schemas will reject unknown `--system` flags via `KERNEL-FLAG-01`. To avoid this, the injection should only add `--system` if the command's flag schema includes it, or if the command has no flag schema (legacy heuristic parser).

## Design

### Injection logic

```ts
// packages/werkstatt/src/kernel/runtime/execute-pipeline.ts

// After --site injection:
if (command.scope === "workspace" && !stepArgs.includes("--system") && site.name) {
  // Only inject if the command accepts --system (declared in flag schema or no schema)
  const acceptsSystem = !command.flags || "--system" in command.flags;
  if (acceptsSystem) {
    stepArgs.push("--system", site.name);
  }
}
```

### TypeScript contracts

No new types. The change is internal to `executePipelineForSite` and `executePipelineForWorkspace`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/kernel/runtime/execute-pipeline.ts` | Add `--system` injection after `--site` injection |

### Failure modes

- **Command does not accept `--system`**: The flag schema check (`acceptsSystem`) prevents injection. The command runs without `--system`.
- **Command has no flag schema (legacy)**: `--system` is injected. The legacy heuristic parser ignores unknown flags. No failure.
- **`--system` already in step args**: Not injected (deduplication, same as `--site`).
- **Site name is empty**: Not injected (same guard as `--site`).

## Rollout

- **Default behavior**: Auto-injection is always active. Commands that accept `--system` receive it automatically; commands that do not are unaffected.
- **Migration**: Revert the `--system` optional workaround on `dns.record.upsert` — make it `required: true` again. The pipeline will now inject it automatically.
- **No breaking changes**: Commands that previously received `--system` via explicit step args continue to work (deduplication prevents double injection).

## Alternatives considered

- **Deriving system ID from a separate mapping**: Rejected — the 1:1 site-to-system relationship makes this unnecessary complexity.
- **Adding `systemId` to `DiscoveredSiteWorkspace`**: Rejected — it would always equal `site.name` and adds a field that needs to be maintained.
- **Making `--system` always optional and deriving it from `--site` inside commands**: Rejected — pushes pipeline context knowledge into individual commands, violating separation of concerns.

## Risks

- **Site name ≠ system ID**: If a future site has a system ID different from its site name, the injection would pass the wrong value. Mitigated by the 1:1 convention (RFC-0790) — if this ever changes, a new RFC would be needed.
- **Flag schema rejection**: If a command has a flag schema but does not declare `--system`, the `acceptsSystem` check prevents injection. No failure.

## Acceptance criteria

- [ ] `--system` auto-injected for workspace-scoped commands that accept it
- [ ] `acceptsSystem` check prevents injection for commands without `--system` flag
- [ ] Deduplication: `--system` not injected if already in step args
- [ ] `dns.record.upsert` receives `--system` automatically in pipeline
- [ ] `dns.record.upsert` `--system` flag reverted to `required: true`
- [ ] Unit test: workspace command with `--system` flag receives it
- [ ] Unit test: workspace command without `--system` flag is unaffected
- [ ] Unit test: explicit `--system` in step args is not duplicated
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The injection must be added in **both** `executePipelineForSite` and `executePipelineForWorkspace` (if workspace pipelines have site context). In practice, `executePipelineForWorkspace` does not have a `site` object, so the injection only applies to `executePipelineForSite`.
- After implementing, audit all commands that had `--system` made optional as a workaround and revert them to `required: true`.
- The `acceptsSystem` check should use `command.flags` (the declared flag schema from RFC-0260). If `command.flags` is undefined (no schema), inject unconditionally — the legacy parser ignores unknown flags.
