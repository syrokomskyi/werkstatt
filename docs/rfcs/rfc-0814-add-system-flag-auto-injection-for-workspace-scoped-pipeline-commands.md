---
id: RFC-0814
title: "Add --system flag auto-injection for workspace-scoped pipeline commands"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-12
updatedAt: 2026-08-12
enhancedAt: 2026-08-12
implementedAt: 2026-08-12
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0790
  - RFC-0260
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - "dns.record.upsert"
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
  - "Auto-injecting --id for sternsystem.sync/sternsystem.pin (they use --id, not --system — separate concern)"
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

However, there is no equivalent auto-injection for `--system`. Some workspace-scoped commands (e.g. `dns.record.upsert`) need the Sternsystem ID (`--system` flag) to resolve the correct `system-config.yaml` from `systems-cache/{id}/`. During the warpgogol-com-m000050 release, `dns.record.upsert` required `--system` as a mandatory flag, but the pipeline did not inject it. The workaround was to make `--system` optional in the command's flag schema — which is incorrect because the command genuinely needs a system ID to function.

Note: `sternsystem.sync` and `sternsystem.pin` also need the Sternsystem ID, but they accept it via the `--id` flag, not `--system`. This RFC only addresses `--system` injection; `--id` injection for those commands is out of scope (see nonGoals).

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

- **RFC-0790 (Sternsystem convention-based discovery)**: The 1:1 site-to-system relationship is already established. This RFC formalizes it in the pipeline executor and CLI command executor.
- **RFC-0260 (flag schema validation)**: Commands with declared flag schemas will reject unknown `--system` flags via `KERNEL-FLAG-01`. To avoid this, the injection should only add `--system` if the command's flag schema includes a `system` key, or if the command has no flag schema (legacy heuristic parser).
- **No DNA invariant is enforced, protected, or extended by this RFC.** The change is a pipeline behavior policy, not an architectural change. Hence `kind: policy`.

## Design

### Injection logic

Two injection points: the pipeline executor and the CLI command executor.

**Pipeline executor** (`executePipelineForSite` in `packages/werkstatt/src/kernel/runtime/execute-pipeline.ts`):

```ts
// After --site injection:
if (command.scope === "workspace" && !stepArgs.includes("--system") && site.name) {
  // Only inject if the command accepts --system (declared in flag schema or no schema).
  // Note: command.flags keys do NOT have the -- prefix (e.g. "system", not "--system").
  const acceptsSystem = !command.flags || ("system" in command.flags && command.flags.system.kind === "string");
  if (acceptsSystem) {
    stepArgs.push("--system", site.name);
  }
}
```

**CLI command executor** (`executeKernelCommand` in `packages/werkstatt/src/kernel/runtime/execute-command.ts`):

After the existing `--site` re-injection for workspace commands (line 402), add `--system` injection using the same `acceptsSystem` check:

```ts
if (options.siteName && !wsArgv.includes("--system")) {
  const acceptsSystem = !wsCommand.flags || ("system" in wsCommand.flags && wsCommand.flags.system.kind === "string");
  if (acceptsSystem) {
    wsArgv.push("--system", options.siteName);
  }
}
```

This ensures both pipeline execution and direct CLI invocation (`werkstatt run dns.record.upsert --site warpgogol-com`) receive `--system` automatically.

### TypeScript contracts

No new types. The change is internal to `executePipelineForSite` and `executeKernelCommand`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/kernel/runtime/execute-pipeline.ts` | Add `--system` injection after `--site` injection in `executePipelineForSite` |
| `packages/werkstatt/src/kernel/runtime/execute-command.ts` | Add `--system` injection after `--site` re-injection in `executeKernelCommand` |
| `packages/werkstatt/src/dns/dns.module.ts` | Revert `dns.record.upsert` `system` flag to `required: true` |

### Failure modes

- **Command does not accept `--system`**: The flag schema check (`acceptsSystem`) prevents injection. The command runs without `--system`.
- **Command has no flag schema (legacy)**: `--system` is injected. The legacy heuristic parser ignores unknown flags. No failure.
- **Command declares `system` as non-string kind (e.g. boolean)**: The `kind === "string"` check prevents injection. Avoids injecting `--system <value>` into a boolean flag.
- **`--system` already in step args**: Not injected (deduplication, same as `--site`).
- **Site name is empty**: Not injected (same guard as `--site`).
- **Workspace pipeline (`executePipelineForWorkspace`)**: No `site` object, so no injection. Commands needing `--system` in workspace-only pipelines must pass it explicitly in step args.

## Rollout

- **Default behavior**: Auto-injection is always active. Commands that accept `--system` receive it automatically; commands that do not are unaffected.
- **Migration**: Revert the `--system` optional workaround on `dns.record.upsert` — make it `required: true` again. Both the pipeline and CLI paths will now inject it automatically.
- **No breaking changes**: Commands that previously received `--system` via explicit step args continue to work (deduplication prevents double injection).
- **AGENTS.md**: No updates needed — this is an internal behavior change with no new agent-facing rules.

## Alternatives considered

- **Deriving system ID from a separate mapping**: Rejected — the 1:1 site-to-system relationship makes this unnecessary complexity.
- **Adding `systemId` to `DiscoveredSiteWorkspace`**: Rejected — it would always equal `site.name` and adds a field that needs to be maintained.
- **Making `--system` always optional and deriving it from `--site` inside commands**: Rejected — pushes pipeline context knowledge into individual commands, violating separation of concerns.

## Risks

- **Site name ≠ system ID**: If a future site has a system ID different from its site name, the injection would pass the wrong value. Mitigated by the 1:1 convention (RFC-0790) — if this ever changes, a new RFC would be needed.
- **Flag schema rejection**: If a command has a flag schema but does not declare `system`, the `acceptsSystem` check prevents injection. No failure.
- **Site name ≠ system ID in CLI path**: The CLI path uses `options.siteName` as the system ID. If a future site has a system ID different from its site name, both pipeline and CLI injection would pass the wrong value. Same mitigation as pipeline path (RFC-0790 1:1 convention).

## Acceptance criteria

- [x] `--system` auto-injected for workspace-scoped commands that accept it (evidence: packages/werkstatt/src/kernel/runtime/execute-pipeline.ts:758-767, system-injection.test.ts test a/e)
- [x] `acceptsSystem` check prevents injection for commands without `--system` flag (evidence: system-injection.test.ts test b, 8/8 tests pass)
- [x] Deduplication: `--system` not injected if already in step args (evidence: system-injection.test.ts test c/h, 8/8 tests pass)
- [x] `dns.record.upsert` receives `--system` automatically in pipeline (evidence: execute-pipeline.ts:758-767, dns.module.ts:38-41 declares system:string required)
- [x] `dns.record.upsert` `--system` flag reverted to `required: true` (evidence: packages/werkstatt/src/dns/dns.module.ts:38-41)
- [x] `--system` auto-injected in CLI path (`executeKernelCommand`) for workspace commands that accept it (evidence: packages/werkstatt/src/kernel/runtime/execute-command.ts:405-414, system-injection.test.ts test f)
- [x] Unit test: workspace command with `--system` flag receives it in pipeline (evidence: system-injection.test.ts test a, 8/8 tests pass)
- [x] Unit test: workspace command without `--system` flag is unaffected (evidence: system-injection.test.ts test b/g, 8/8 tests pass)
- [x] Unit test: explicit `--system` in step args is not duplicated (evidence: system-injection.test.ts test c/h, 8/8 tests pass)
- [x] Unit test: CLI invocation `werkstatt run dns.record.upsert --site warpgogol-com` exits 0 (evidence: rfc.acceptance.run --id RFC-0814, 0 failed probes)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0814, 0 errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The injection must be added in **both** `executePipelineForSite` (pipeline path) and `executeKernelCommand` (CLI path, after the existing `--site` re-injection for workspace commands at line 402). `executePipelineForWorkspace` does not have a `site` object, so the injection does not apply there.
- After implementing, audit all commands that had `--system` made optional as a workaround and revert them to `required: true`.
- The `acceptsSystem` check should use `command.flags` (the declared flag schema from RFC-0260). Keys in `command.flags` do NOT have the `--` prefix — check for `"system"`, not `"--system"`. Also verify `kind === "string"` to avoid injecting into a boolean flag. If `command.flags` is undefined (no schema), inject unconditionally — the legacy parser ignores unknown flags.
- No AGENTS.md files need updates — this is an internal behavior change with no new agent-facing rules.
