---
id: RFC-0816
title: "Prevent duplicate kernel command registration from crashing build pipelines"
status: implemented
scope: package
kind: fix
createdAt: 2026-08-12
updatedAt: 2026-08-12
implementedAt: 2026-08-12
satisfies: []
versionBump: patch
related:
  - RFC-0489
  - RFC-0785
reviewers: []
---

# RFC-0816: Prevent duplicate kernel command registration from crashing build pipelines

## Problem

`open-source.generate` was registered in two kernel modules:

1. **`check` module** — via `ALL_COMMANDS` → `CODEGEN_COMMANDS` in `packages/werkstatt-site/src/checks/command-tables/01-codegen.ts`
2. **`service` module** — via `service.module.template.ts` (copied into workpiece as `service.module.ts`)

When `buildRegistry()` loaded modules alphabetically (`check` before `service`), the second registration threw `Error: Kernel command already registered: open-source.generate`. This crashed `build.prepare.dev` pipeline during `mission.materialize`, leaving the workpiece without generated files (middleware, markdown twins, feeds, etc.).

## Root cause

The `check` command table (`01-codegen.ts`) included `open-source.generate` — a codegen command owned by the `service` module. This was a leftover from before the module split. The `KernelRegistry.registerCommand` method threw unconditionally on any duplicate, with no tolerance for same-handler re-registration.

## Fix

Three layers of defense:

### 1. Remove the duplicate (upstream fix)

Removed `open-source.generate` entry from `packages/werkstatt-site/src/checks/command-tables/01-codegen.ts`. Codegen commands (`*.generate`) belong to the `service` module, not the `check` module. Also removed the now-unused `runGenerateOpenSourcePage` import.

### 2. Idempotent registration (defense in depth)

Modified `KernelRegistry.registerCommand` in `packages/werkstatt/src/kernel/registry.ts` to be idempotent when the same `execute` function is registered twice. Only throw when two **different** `execute` functions claim the same command name — a genuine conflict.

```ts
registerCommand(command: KernelCommandDefinition): void {
  const existing = this.commands.get(command.name);
  if (existing) {
    if (existing.execute === command.execute) return; // same handler — no-op
    throw new Error(`Kernel command already registered: ${command.name} (conflict between modules)`);
  }
  // ...
}
```

This prevents future duplicates from crashing the pipeline while still catching genuine conflicts.

### 3. Regression test

Added `packages/werkstatt/src/kernel/tests/registry-duplicate-command.test.ts` with three cases:

- Same-execute re-registration is idempotent (no throw)
- Different-execute re-registration throws
- Different command names do not conflict

## Files changed

- `packages/werkstatt-site/src/checks/command-tables/01-codegen.ts` — removed duplicate `open-source.generate` entry and unused import
- `packages/werkstatt/src/kernel/registry.ts` — idempotent `registerCommand` for same-execute
- `packages/werkstatt/src/kernel/tests/registry-duplicate-command.test.ts` — regression test (new)

## Consequences

- **Positive**: Build pipelines no longer crash when two modules accidentally register the same command with the same handler. Future module refactoring is safer.
- **Positive**: Genuine conflicts (different handlers, same name) still fail loudly with a clearer error message.
- **Negative**: Silent no-op for same-handler duplicates could hide redundant registrations. Acceptable trade-off — the alternative (crash) is worse.
- **Technical debt**: None. The fix is minimal and the test guards against regression.
