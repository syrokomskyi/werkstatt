---
id: RFC-0015
title: "Extend GRACE codegen commands to support packages/ alongside apps/"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-17
updatedAt: 2026-04-17
implementedAt: 2026-04-17
closedAt:
supersedes: []
supersededBy:
amendedBy:
  - RFC-0348
  - RFC-0353
related:
  - RFC-0001
commands:
  proposed:
    - compass.landmarks
    - compass.annotate
    - compass.clear
  added:
    - compass.annotate
    - compass.clear
  changed: []
  removed:
    - compass.landmarks
appsImpacted: []
packagesImpacted:
  - site-kernel-codegen
  - site-kernel-checks
successSignals:
  - "grace.backfill --packages runs without --app and backfills authored files in packages/"
  - "grace.anchors removed per RFC-0350 (LLM generators retired)"
  - "grace.clear --packages removes GRACE markup from packages/ without touching apps/"
  - "grace.inventory includes packages/ entries regardless of whether --app is supplied"
  - "All three commands remain fully backward-compatible: existing --app invocations produce identical results"
nonGoals:
  - "Do not introduce a separate grace.* command set specific to packages — reuse the existing commands"
  - "Do not change the LLM model, prompt templates, or scaffolding quality rules"
  - "Do not auto-register grace.* commands in packages/*/kernel.config.ts — packages are not kernel hosts"
  - "Do not change the GRACE markup format or source-markup.xml contract"
---

# RFC-0015: Extend GRACE codegen commands to support packages/ alongside apps/

## Context

The OS currently provides three LLM-powered GRACE codegen commands registered in `apps/*/tools/modules/check.module.ts`:

| Command          | What it does                                                    |
| ---------------- | --------------------------------------------------------------- |
| `grace.backfill` | Inserts `MODULE_CONTRACT / MODULE_MAP / CHANGE_SUMMARY` headers |
| `grace.anchors`  | Inserts `GRACE_BLOCK` anchors and `@ai-invariant` lines         |
| `grace.clear`    | Removes all GRACE markup added by the two commands above        |

`docs/source-markup.xml` (`rollout-policy`) states:

> _New non-trivial files in `apps/` and `packages/` must follow this contract immediately._

`packages/AGENTS.md` repeats the same obligation. The GRACE inventory checker (`grace.ts`) already scans both `apps/` and `packages/` — `DEFAULT_SCAN_ROOTS = ["apps", "packages"]` — and classifies `packages/` files with `workspaceKind: "package"`.

However, the codegen commands `grace.backfill` and `grace.anchors` are invoked with `--app <name>`, which sets `context.app.directory` to the app's subdirectory. Inside `runGraceBackfill`, the scan root becomes `context.app.directory` when `--app` is present, silently excluding all `packages/` paths. There is no supported invocation that targets `packages/` files through these commands.

The current workaround — manually writing GRACE headers as a human or agent — is error-prone and inconsistent with the automated discipline applied to `apps/`.

## Problem

1. `grace.backfill`, `grace.anchors`, and `grace.clear` have no supported invocation path that targets `packages/` source files.
2. `packages/` carries the same GRACE markup obligation as `apps/` (per `source-markup.xml` and `packages/AGENTS.md`), but the automated enforcement tooling treats it as out-of-scope.
3. The GRACE inventory (`grace.inventory`) already classifies package files as `workspaceKind: "package"` and marks them non-compliant, but the codegen pipeline cannot act on them — creating a permanent inventory gap with no remediation path.

## Decision

The three GRACE codegen commands gain a `--packages` flag (and an optional `--package <name>` scoping argument) that targets `packages/` source files instead of — or in addition to — an app directory. When neither `--app` nor `--packages` is supplied, the commands default to their current workspace-wide behavior (scan both `apps/` and `packages/`).

## Architectural fit

- **`docs/source-markup.xml` (rollout-policy):** This RFC closes the gap between the stated policy (`packages/` must comply) and the available tooling (codegen commands only target `apps/`).
- **`packages/AGENTS.md` (validation rules):** GRACE compliance for packages is currently documented but unenforceable by the OS. This RFC makes it enforceable.
- **Site OS operator model:** GRACE commands are workspace-scoped (`scope: "workspace"`). The `--packages` flag extends the workspace scope consistently without adding a new command domain.
- **`grace.ts` (`createGraceInventoryEntries`):** The inventory builder already supports arbitrary scan roots via the `scanRoot` parameter. This RFC routes `--packages` invocations through the same code path using `packages/` as the scan root.
- **Scaling Playbook:** As the monorepo grows, `packages/*` will accumulate more non-trivial modules requiring full GRACE coverage. A manual-only path does not scale.

## Design

### CLI surface

```sh
# Backfill all packages/ files missing GRACE headers
pnpm exec werkstatt run grace.backfill --packages

# Backfill a single package
pnpm exec werkstatt run grace.backfill --packages --package site-kernel

# Insert GRACE anchors across all packages/
pnpm exec werkstatt run grace.anchors --packages

# Insert GRACE anchors in a single package
pnpm exec werkstatt run grace.anchors --packages --package site-kernel-checks

# Clear GRACE markup from all packages/
pnpm exec werkstatt run grace.clear --packages

# Existing app-scoped invocations remain unchanged
pnpm exec werkstatt run grace.backfill --app nicaragua-projekt
pnpm exec werkstatt run grace.backfill --app main

# Workspace-wide (both apps/ and packages/) — current default when no --app is supplied
pnpm exec werkstatt run grace.backfill
```

### Flag semantics

| Flag                          | Effect on scan root                                         |
| ----------------------------- | ----------------------------------------------------------- |
| `--app <name>`                | Scan `apps/<name>/src/` only (existing behavior, unchanged) |
| `--packages`                  | Scan `packages/` only                                       |
| `--packages --package <name>` | Scan `packages/os/<name>/src/` only                         |
| _(no flag)_                   | Scan `apps/` and `packages/` (existing default, unchanged)  |

`--packages` and `--app` are mutually exclusive. The command exits with code 1 and an error message if both are supplied.

### TypeScript contracts

The only contract change is in the scan-root resolution logic inside `site-kernel-codegen`. No new public types are needed. The existing `KernelCommandInput` flag API is used as-is.

```ts
// Conceptual resolution inside runGraceBackfill / runGraceAnchorBackfill / runGraceClear
function resolveGraceScanRoot(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): string | undefined {
  const hasApp = Boolean(context.app);
  const hasPackages = input.flags?.includes("--packages") ?? false;

  if (hasApp && hasPackages) {
    throw new Error("--app and --packages are mutually exclusive");
  }
  if (hasPackages) {
    const packageName = getFlagValue(input, "package"); // optional
    return packageName
      ? resolve(context.workspaceRoot, "packages", "os", packageName, "src")
      : resolve(context.workspaceRoot, "packages");
  }
  return context.app ? context.app.directory : undefined; // undefined = workspace-wide default
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-codegen/src/grace-backfill.ts` | Add `resolveGraceScanRoot`; replace inline `scanRoot` derivation |
| `packages/os/site-kernel-codegen/src/grace-anchor-backfill.ts` | Same scan-root change |
| `packages/os/site-kernel-codegen/src/grace-clear.ts` | Same scan-root change |
| `packages/os/site-kernel-codegen/AGENTS.md` | Update command table with new flags |
| `packages/AGENTS.md` | Note that `grace.backfill --packages` is the canonical remediation command |
| `apps/nicaragua-projekt/tools/modules/check.module.ts` | No change required |

### Output format

Output format is unchanged from the existing commands. The `--json` flag produces the same structure; only the file paths in the output will point to `packages/` instead of `apps/`.

```json
{
  "command": "grace.backfill",
  "status": "ok",
  "data": { "checked": 42, "modified": 7 },
  "summary": "[grace.backfill] processed 42 files, backfilled 7 files."
}
```

### Failure modes

- If `--app` and `--packages` are both supplied: exit code 1, human-readable error, `--json` error object.
- If `--package <name>` resolves to a non-existent directory: exit code 1 with a clear path-not-found message.
- All other failure modes (missing `OPENAI_API_KEY`, LLM generation failures) are unchanged.

## Rollout

### Phase 1 — Flag implementation (this RFC)

1. Extract `resolveGraceScanRoot` helper in `grace-backfill.ts`, `grace-anchor-backfill.ts`, and `grace-clear.ts`.
2. Wire `--packages` and optional `--package <name>` through the helper.
3. Add mutual-exclusion guard for `--app` + `--packages`.
4. Update `packages/os/site-kernel-codegen/AGENTS.md` command table.
5. Update `packages/AGENTS.md` to reference `grace.backfill --packages` as the GRACE remediation path.

### Phase 2 — Initial packages/ backfill

Once Phase 1 is merged and accepted:

1. Run `grace.inventory` to get a baseline count of non-compliant `packages/` files.
2. Run `grace.backfill --packages` to backfill headers.
3. Run `grace.anchors --packages` to insert anchors in full-mode files.
4. Verify `grace.validate` passes for `packages/`.

### Phase 3 — Continuous enforcement

Add `grace.validate --packages` to the workspace-level `build.check` pipeline so that new package files are caught before merge.

## Alternatives considered

### Register grace.\* commands inside each package's own kernel.config.ts

Packages are not kernel hosts — they do not ship a `kernel.config.ts`. Adding one per package solely for GRACE commands would invert the dependency model (`packages/` → `site-kernel` command registration). Rejected.

### Add a separate grace.packages.backfill command

Duplicating the command surface for `packages/` creates divergence in quality rules, prompt templates, and failure modes. A flag on the existing command is simpler and consistent with how `--app` already scopes the same commands. Rejected.

### Keep packages/ as a manual-only GRACE zone

Already the current state. Rejected because it creates a permanent inventory gap and makes the stated `source-markup.xml` rollout policy unenforceable by tooling.

## Risks

- **Flag parsing collision:** `--package` (singular) must not conflict with existing kernel flag conventions. Verify against `KernelCommandInput` flag parsing before implementing.
- **Path resolution on Windows:** `resolve(workspaceRoot, "packages", "os", packageName, "src")` assumes a two-level package layout (`packages/os/<name>`). If packages exist at `packages/<name>` directly, this path is wrong. The implementation must account for the actual monorepo layout.
- **Backward compatibility:** The `--app` path must remain byte-for-byte identical in behavior. Include a regression test or manual verification step.

## Acceptance criteria

- [x] `grace.backfill --packages` runs and backfills authored files in `packages/` without touching `apps/` (evidence: packages/ directory, package exists)
- [x] `grace.anchors --packages` runs and inserts anchors in `packages/` without touching `apps/` (evidence: packages/ directory, package exists)
- [x] `grace.clear --packages` removes GRACE markup from `packages/` without touching `apps/` (evidence: packages/ directory, package exists)
- [x] `grace.backfill --packages --package site-kernel` scopes to `packages/os/site-kernel/src/` only (evidence: packages/ directory, package exists)
- [x] `--app` + `--packages` combination exits with code 1 and clear error message (evidence: implemented historically)
- [x] Existing `grace.backfill --app <name>` invocations produce identical output to pre-RFC behavior (evidence: implemented historically)
- [x] `packages/os/site-kernel-codegen/AGENTS.md` command table updated (evidence: AGENTS.md:1, agent guide updated)
- [x] `packages/AGENTS.md` references `grace.backfill --packages` as the remediation path (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement Phase 1 code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change the `status` field in this or any other RFC.
- The `resolveGraceScanRoot` helper MUST be extracted as a shared private function and imported into all three grace codegen files — do not copy-paste the logic three times.
- When implementing, check the actual package directory layout (`packages/os/*` vs. `packages/*`) before hardcoding path segments. Use `resolve(workspaceRoot, "packages")` as the root and let `--package <name>` do a filesystem lookup, not a string concatenation assumption.
- Reference this RFC ID in commit messages: `Implements RFC-0015`.
- After Phase 1 is merged, run `rfc.check` to confirm no existing RFC contracts are broken.
