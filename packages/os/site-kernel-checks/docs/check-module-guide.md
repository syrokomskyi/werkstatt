# Site Kernel Checks — Check Module Guide

> **Scope.** This document describes how to wire the standard OS check commands into any app using `createStandardCheckModule` and `APPS_CHECK_PIPELINE`.

---

## Quick start

```typescript
// tools/modules/check.module.ts
import type { KernelModule } from "@gogol/site-kernel";
import { createStandardCheckModule } from "@gogol/site-kernel-checks";

export const checkModule: KernelModule = createStandardCheckModule();
```

```typescript
// tools/kernel.config.ts
import { defineKernelConfig } from "@gogol/site-kernel";
import { checkModule } from "./modules/check.module";
import { serviceModule } from "./modules/service.module";
import { APPS_CHECK_PIPELINE } from "@gogol/site-kernel-checks";

export default defineKernelConfig({
  name: "my-app",
  description: "My app site OS",
  modules: [checkModule, serviceModule],
  pipelines: {
    "build.prepare": [{ command: "open-source.generate" }, { command: "icons.generate" }],
    "build.check": [
      { command: "open-source.generate" },
      { command: "icons.generate" },
      ...APPS_CHECK_PIPELINE,
    ],
    check: [...APPS_CHECK_PIPELINE],
  },
});
```

---

## What is included

`createStandardCheckModule()` registers these commands automatically:

| Command | Purpose |
| --- | --- |
| `naming.convention.lint` | Validate filenames use kebab-case |
| `route.thin.validate` | Validate route files contain no style blocks |
| `feature.visibility.validate` | Validate featureFlag values match defined keys |
| `naming.pages.lint` | Validate visitor-facing routes in `[param]/` directories |
| `naming.suffixes.lint` | Validate layer-specific file suffix contracts per RFC-0020: `-component`/`-section` in `src/components/`, `src/styles/components/`, `src/content/components/`; no forbidden tokens in `src/pages/` or `src/styles/` |
| `naming.layouts.lint` | Validate `src/layouts/` singleton contract: only `layout.astro` permitted as a file-level entry (RFC-0020) |
| `naming.components.lint` | Validate components/ contains no CSS/Markdown |
| `naming.styles.lint` | Validate CSS files live under styles/ |
| `assets.structure.lint` | Validate raster images are in assets/images/ |
| `scripts.placement.validate` | Enforce RFC-0011 script placement contract (SP-01..SP-06): detect AP-18/AP-19 violations in `.astro` files |
| `content.validate` | Validate page frontmatter for required fields |
| `thin-copy.validate` | Detect hardcoded copy in templates |
| `tokens.ds.lint` | Lint CSS custom properties against design-system rules |
| `tokens.colors.lint` | Lint for raw rgba/hex color usage |
| `naming.content.lint` | Lint content page filenames for kebab-case |
| `mirroring.validate` | Validate content pages mirrored across languages |
| `semantic.drift.validate` | Validate SEO metadata for drift/duplication |
| `compass.inventory` | Generate Compass source inventory XML |
| `compass.validate` | Validate source files against Compass requirements |

**Do NOT register these commands again** — they are already included by `createStandardCheckModule`.

---

## Adding app-specific checks

If an app needs custom checks beyond the standard set, use `extraCommands`:

```typescript
import type { KernelModule } from "@gogol/site-kernel";
import { createStandardCheckModule } from "@gogol/site-kernel-checks";
import { runFundingFreshnessValidation } from "../runtime/check";

export const checkModule: KernelModule = createStandardCheckModule({
  extraCommands: [
    {
      name: "funding.validate",  // Must be unique — not in standard set
      description: "Validate funding program freshness.",
      scope: "app",
      execute: runFundingFreshnessValidation,
    },
  ],
});
```

Then add to the pipeline:

```typescript
pipelines: {
  "build.check": [
    { command: "open-source.generate" },
    { command: "icons.generate" },
    ...APPS_CHECK_PIPELINE,
    { command: "funding.validate" },  // App-specific check
  ],
  check: [...APPS_CHECK_PIPELINE, { command: "funding.validate" }],
}
```

---

## Common error: duplicate command registration

**Symptom:**

```
Error: Kernel command already registered: content.validate
```

**Cause:** Attempting to register a command in `extraCommands` that is already registered by `createStandardCheckModule`.

**Fix:** Remove the duplicate from `extraCommands`. The standard commands are already included.

**Example of incorrect usage:**

```typescript
// WRONG — content.validate is already in createStandardCheckModule
export const checkModule = createStandardCheckModule({
  extraCommands: [
    {
      name: "content.validate",  // ❌ Duplicate!
      execute: runMyCustomValidation,
    },
  ],
});
```

**Correct usage:**

```typescript
// CORRECT — use createStandardCheckModule without extraCommands
// for standard checks, or add only truly app-specific commands
export const checkModule = createStandardCheckModule();
```

---

## APPS_CHECK_PIPELINE order

The pipeline is pre-ordered to run structural checks before content checks:

1. **Wave 1-2: Structural integrity** — `naming.convention.lint`, `kernel.result.envelope.lint`
2. **Wave 3: Semantic integrity** — `route.thin.validate`, `feature.visibility.validate`
3. **Wave 3.5: Page hierarchy (RFC-0019)** — `structure.hierarchy.validate`, `navigation.section.validate`
4. **Wave 4: Layer-specific naming** — `naming.pages.lint`
5. **Wave 4.5: RFC-0020 suffix contract** — `naming.suffixes.lint`, `naming.layouts.lint`
6. **Wave 5: Layer-specific placement** — `naming.components.lint`, `naming.styles.lint`, `assets.structure.lint`, `scripts.placement.validate`
7. **Content validation** — `content.validate`, `thin-copy.validate`
8. **Styling** — `tokens.ds.lint`, `tokens.colors.lint`
9. **Content naming/mirroring** — `naming.content.lint`, `mirroring.validate`
10. **SEO** — `semantic.drift.validate`
11. **Compass** — `compass.validate`

When new checks are added to `site-kernel-checks`, they appear in `APPS_CHECK_PIPELINE` automatically — all apps pick them up without edits.

---

## mirror.quartet.validate — agent guide (RFC-0009)

`mirror.quartet.validate` enforces the **COMPONENT-QUARTET-MIRROR** contract. Every content-driven component (one that has both a schema `.ts` and a content `.md`) must satisfy four legs:

| Leg | Path | Rule |
| --- | --- | --- |
| Schema | `src/content/schemas/components/{path}/{Name}.ts` | always required |
| Content | `src/content/components/{lang}/{path}/{Name}.md` | always required |
| Component | `src/components/{path}/{Name}.astro` | always required (Q-01) |
| CSS | `src/styles/components/{path}/{name}.css` | always required (Q-04) |
| Script | `public/scripts/components/{path}/{name}.js` | only when `// @client-script: required` in `.astro` (Q-02) |

### Q-01 — missing .astro

**Symptom:**

```
[Q-01] src/components/copyright.astro missing — required for content-driven component schemas/components/copyright.ts
```

**Fix:** Create the missing `.astro` file at the matching path. It must match the schema stem exactly (kebab-case).

**Exception:** Class 4 layout components may live in `src/layouts/` instead of `src/components/`. The check scans both directories.

### Q-02 — missing script when directive declared

**Symptom:**

```
[Q-02] public/scripts/components/copyright.js missing — src/components/copyright.astro declares @client-script: required
```

**Fix:** Either:

- Create `public/scripts/components/{path}/{name}.js` (where `{name}` matches the `.astro` stem exactly)
- Or remove `// @client-script: required` from the `.astro` file if no script is needed

### Q-03 — orphan script (warning only)

**Symptom:**

```
[Q-03] public/scripts/components/old-script.js has no matching src/components/old-script.astro — orphan script
```

This is a **warning** — the build passes. The script predates the quartet contract or was left after a component rename.

**Fix:** Either rename the script to match the component stem, or delete it if unused.

### Q-04 — missing CSS

**Symptom:**

```
[Q-04] src/styles/components/copyright.css missing — required for content-driven component src/components/copyright.astro
```

**Fix:** Create the matching CSS file at `src/styles/components/{path}/{name}.css`. The file may be minimal but must exist. CSS must import only `--ds-*` tokens per `tokens.ds.lint`.

### Script naming convention

`public/scripts/` mirrors `src/styles/` — including the top-level `components/` and `pages/` subdirectories:

```
src/styles/components/footer.css               → public/scripts/components/footer.js
src/styles/components/section/hero-section.css → public/scripts/components/section/hero-section.js
src/styles/components/copyright.css            → public/scripts/components/copyright.js
src/styles/pages/open-source.css               → public/scripts/pages/open-source.js  (if needed)
```

The stem must be **identical** to the `.astro` filename stem. A script named `copyright-year-sync.js` for a component named `copyright.astro` is a **Q-05 name drift violation** (caught as Q-02 because the canonical path does not exist).

**On-demand creation:** `public/scripts/` subdirectories are created only when a component in that subdirectory declares `// @client-script: required`. Do **not** pre-create empty subdirectories. The hierarchy emerges naturally as components opt in. If `src/styles/components/section/` has 10 CSS files but no section component declares a script, `public/scripts/components/section/` simply does not exist — this is correct and `mirror.quartet.validate` does not flag it.

### Declaring a client-side script

Add the directive as a single-line comment in the `.astro` frontmatter or at the top of the file:

```astro
---
// @client-script: required
```

Only add this directive when the component genuinely requires a vanilla JS script running in the browser. Do **not** add it for server-side-only components.

### Class 4 layout components

Components whose `.astro` file lives in `src/layouts/` (Class 4 per `component-contracts.md`) are:

- Scanned for Q-01 in both `src/components/` and `src/layouts/`
- **Exempt from Q-04** (CSS) because layout components do not follow the `src/styles/components/` convention
- Still subject to Q-02/Q-05 if `@client-script: required` is present

---

## Migration from manual registration

If an app previously registered checks manually:

**Before (manual):**

```typescript
export const checkModule: KernelModule = {
  name: "check",
  version: "0.1.0",
  register(registry) {
    registry.registerCommand({ name: "content.validate", execute: runContentValidation });
    registry.registerCommand({ name: "tokens.ds.lint", execute: runDsLint });
    // ... 15 more commands
  },
};
```

**After (factory):**

```typescript
export const checkModule: KernelModule = createStandardCheckModule();
```

If the app had **custom implementations** of standard-named commands:

- Option 1: Remove custom code, use standard checks
- Option 2: Rename custom command (e.g., `my-app.content.validate`) and add to `extraCommands`

---

## Wiring checklist for new apps

- [ ] Create `tools/modules/check.module.ts` with `createStandardCheckModule()`
- [ ] Import `APPS_CHECK_PIPELINE` in `tools/kernel.config.ts`
- [ ] Spread `APPS_CHECK_PIPELINE` into `build.check` and `check` pipelines
- [ ] Add any **truly app-specific** checks via `extraCommands` only
- [ ] Ensure no command names in `extraCommands` conflict with standard commands

---

## Writing a new `*.validate`/`*.lint` command (RFC-0261)

Every new command whose name matches `\.(validate|lint)$` must, from day one:

1. **Emit canonical diagnostics.** Return `diagnosticsResult(command, diagnostics)` from `./result-helpers.ts` with a fine-grained, **registered** `ruleId` per finding (not the coarse `resultFromViolations`/`failResult` string shim — that shim is a shrink-only legacy set gated by `diagnostic.shape.lint`'s DSL-04 rule and is not available to new modules). Register each new `ruleId` in `packages/os/site-kernel-checks/src/diagnostics/rules.ts`.
2. **Attach a locator and a fixHint** to every `Diagnostic`: a workspace-relative POSIX `file` (and `line` when the source format allows it), plus an imperative `fixHint` a human or agent can execute without re-deriving your check's logic.
3. **Ship a covering test file** under `packages/os/site-kernel-checks/src/tests/`, importing your implementing module directly, with:
   - at least one **failing fixture** — a case that asserts `exitCode === 1` (or an equivalent fail/`"fail"` assertion) on a deliberately invalid input, and
   - at least one **passing fixture** — a case that asserts `exitCode === 0` (or `??`-style 0-fallback / `"pass"`) on a valid input.

   `check.fixture.lint` enforces this (`CHECK-FIX-01` no covering test, `CHECK-FIX-02` missing a fail or pass fixture) for every command reachable from `command-tables/*.ts` via a traceable `execute: importedFunctionName`. Commands registered with an inline arrow-function `execute` cannot be traced statically and fall back to `CHECK-FIX-03` (warning) — prefer a named, imported function.

4. **Register the command** in the appropriate `command-tables/*.ts` file with `execute: <importedFunctionName>` (not an inline closure) so fixture coverage resolves.

Minimal shape:

```typescript
// packages/os/site-kernel-checks/src/my-thing.ts
import type { Diagnostic, KernelCommandInput, KernelCommandResult, KernelRuntimeContext } from "@gogol/site-kernel";
import { diagnosticsResult } from "./result-helpers.ts";

export async function runMyThingValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const diagnostics: Diagnostic[] = [];
  // ... push { ruleId: "MY-THING-01", severity: "error", file, line, message, fixHint } for each finding
  return diagnosticsResult("my.thing.validate", diagnostics);
}
```

```typescript
// packages/os/site-kernel-checks/src/tests/my-thing.test.ts
import { describe, it, expect } from "vitest";
import { runMyThingValidate } from "../my-thing.ts";
// ... build a temp-dir fixture context per case, assert exitCode 1 on the red
// case and exitCode 0 (or undefined ?? 0) on the green case.
```

See `packages/os/site-kernel-checks/src/tests/root-canonical.test.ts`, `cloudflare-residency.test.ts`, and `hdri-firewall.test.ts` for the RFC-0261 first-migration-batch reference pattern (temp-dir app fixtures, `diagnosticsResult` with fine-grained ruleIds, workspace-relative locators).

## Writing/migrating IO — use `context.io`, not ambient `node:fs` (RFC-0267)

Every **new** command module (and every module you migrate) must receive its filesystem/process-execution capability from `KernelRuntimeContext.io` (the `WorkspaceIO` port) instead of importing `node:fs`, `node:fs/promises`, or `node:child_process` directly. `kernel.io.lint`'s `IO-01` rule enforces this via a shrink-only baseline (`kernel-io-lint.baseline.generated.json`) — new modules must be clean from day one; existing offenders are tracked in the `kernel-io-migration` maintenance-debt queue and migrated batch by batch.

## Reuse the shared fs/text helpers — don't write a new `walk()` (RFC-0303)

Before writing a recursive `readdir` walker, an existence check, a JSON reader, or an offset→line/column calculator in a new or migrated check module, see the **Shared helpers catalog** in `packages/AGENTS.md` — every one of those primitives already has a single canonical home in `@gogol/share/fs` / `@gogol/share/text-position`. `fs.walk.lint` (WALK-01) and `dedup.helper.lint` (DEDUP-01) fail the build on a fresh duplicate; `file.size.lint` (SIZE-01, warning) flags the file once it grows past the split threshold.

Why this matters:

- **`mutatesState` becomes trustworthy.** A command declaring `mutatesState: false` is handed a _read-only_ adapter by the executor — any write attempt throws `KERNEL-META-01` naming the command and the attempted path, instead of silently succeeding and lying about its own metadata.
- **Universal `--dry-run` works for free.** Under `--dry-run`, a mutating command is handed a _recording_ adapter: writes/`mkdir`/`rm` are intercepted and recorded as `WriteIntent[]`. The executor converts these to workspace-root-relative `filesModified` on the top-level execution report — nothing touches disk. You do not implement dry-run yourself; the executor does it once your module stops reaching for ambient `fs`.

Minimal shape:

```typescript
// packages/os/site-kernel-checks/src/my-generator.ts
import { dirname, join } from "node:path"; // path utilities are fine — only fs/child_process are gated
import type { KernelCommandInput, KernelCommandResult, KernelRuntimeContext } from "@gogol/site-kernel";
import { GENERATED_MARKER, hasGeneratedMarker } from "@gogol/site-kernel";

export async function runMyGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const target = join(context.app!.publicDirectory, "my-file.txt");
  const content = GENERATED_MARKER + "\n\nhello";

  const existing = (await context.io.exists(target)) ? await context.io.readFile(target) : undefined;
  if (existing !== undefined && !hasGeneratedMarker(existing)) {
    return { exitCode: 0, summary: "my.generate: skipped — hand-edited" };
  }
  await context.io.mkdir(dirname(target));
  await context.io.writeFile(target, content); // atomic by contract (rfc-0258)

  return { exitCode: 0, summary: `my.generate: wrote ${content.length} bytes` };
}
```

When migrating an existing module:

1. Swap `readFile`/`writeFile`/`mkdir`/`rm` calls to their `context.io.*` equivalents mechanically. Do **not** refactor the module's logic in the same commit — keeps the diff reviewable and parity obvious.
2. Delete any hand-rolled `if (!context.dryRun) { ... }` guard around the write — the executor's adapter selection makes it redundant (the block now always runs; the adapter decides whether it's real or recorded).
3. Verify parity: run the real (non-`--dry-run`) command before and after your change and diff the written output — see `robots.generate`/`ai.generate` for the reference migration (RFC-0267 pilots).
4. Run `pnpm exec site-kernel run kernel.io.lint --write-baseline` to shrink the baseline once your module's `node:fs`/`node:fs/promises`/`node:child_process` import is gone.
5. Never cache an `fs` reference at module top-level to dodge the read-only adapter — if you hit `KERNEL-META-01` on a command that legitimately needs to mutate, fix `mutatesState: true` and declare the path in `writes` (RFC-0266) instead of working around the port.

Existing modules not yet migrated off the string shim are tracked in `packages/os/site-kernel-checks/src/diagnostics/dsl04-baseline.generated.json` (burn-down plan: `docs/maintenance-debt/queues/diagnostic-shim-migration.yaml`); existing commands not yet fixture-covered are tracked in `packages/os/site-kernel-checks/src/check-fixture-lint.baseline.generated.json`. Both baselines are shrink-only — regenerate with `--write-baseline` only after a real migration, never to accept new debt.
