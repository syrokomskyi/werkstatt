# @gogol/site-kernel-checks

Shared validation and Compass scaffolding inventory commands for all WGogol Astro apps.

## Purpose

Every app in `apps/*` uses this package to get a consistent set of content, structure, naming, semantic, and performance checks. New checks added here are automatically available in all apps — no per-app edits required.

## Quick start

```typescript
// apps/my-app/tools/modules/check.module.ts
import { createStandardCheckModule } from "@gogol/site-kernel-checks";

export const checkModule = createStandardCheckModule({
  extraCommands: [
    // add app-specific commands here
  ],
});
```

```typescript
// apps/my-app/tools/kernel.config.ts
import { APPS_CHECK_PIPELINE } from "@gogol/site-kernel-checks";

export default defineKernelConfig({
  pipelines: {
    check: [...APPS_CHECK_PIPELINE],
  },
});
```

## Standard commands (registered automatically)

| Command | What it checks |
| --- | --- |
| `content.validate` | Required frontmatter fields (`title`, `metaDescription`) in all lang-scoped pages |
| `thin-copy.validate` | Hardcoded human-readable text in Astro templates |
| `tokens.ds.lint` | CSS custom properties must use `--ds-*` prefix |
| `tokens.colors.lint` | No raw `rgba(…)` or `#hex` colors in CSS files |
| `naming.content.lint` | Content page filenames must be kebab-case |
| `mirroring.validate` | Every page must exist in all language directories |
| `semantic.drift.validate` | SEO field quality and length limits |
| `naming.convention.lint` | All filenames in `apps/` and `packages/` must be kebab-case |
| `naming.pages.lint` | Route files must sit under a `[param]/` top-level directory |
| `naming.suffixes.lint` | Layer-specific suffix contract (RFC-0020) |
| `naming.layouts.lint` | `src/layouts/` must contain only `layout.astro` |
| `naming.components.lint` | `packages/ui/src/` components must follow naming conventions |
| `naming.styles.lint` | All `.css` files must live under `src/styles/` |
| `assets.structure.lint` | Raster images must be inside `src/assets/images/` |
| `route.thin.validate` | Page route files must not contain `<style>` blocks |
| `feature.visibility.validate` | Every `featureFlag:` value must match the active feature graph contract |
| `compass.inventory` | Scan source files, classify Compass rollout coverage |
| `compass.validate` | Report files that do not satisfy Compass scaffolding policy (two-block contract, RFC-0348) |
| `compass.changesummary.validate` | Validate CHANGE_SUMMARY blocks for boilerplate and over-cap items (RFC-0349) |
| `compass.summary.trim` | Deterministically trim CHANGE_SUMMARY blocks (RFC-0538) |
| `compass.audit.plan` | Emit work-order of files due for semantic-truth audit (RFC-0352) |
| `compass.audit.record` | Stamp audit verdict into the compass-audit ledger (RFC-0352) |
| `compass.audit.baseline` | Seed the ledger for all authored files (RFC-0352) |
| `compass.audit.validate` | Warn/fail on audit-overdue files per revision threshold (RFC-0352) |
| `app.layout.validate` | Feature-first directory layout invariants (DNA-21) |
| `client.edit.validate` | Client-editable whitelist check (DNA-22) |
| `manifest.contract.validate` | Component manifest shape and `cosmicName` presence |
| `cosmic.catalog.validate` | All `cosmicName` values are from the correct closed catalog |
| `biome.contract.validate` | RFC-0071 extended biome contract, family linkage, system.md biome references, and token-name mapping |
| `family.contract.validate` | `packages/ontology/site-families/<id>/family.yaml` contract and recipe references |
| `family.list` | List site families and their detection signals for onboarding workflows |
| `system.manifest.validate` | `system.md` shape, biome, constellation, growth wiring |
| `page.block.validate` | Block-declarative page frontmatter contract (DNA-24) |
| `visibility.expr.validate` | Visibility expression syntax in content files (DNA-26) |
| `page.pipeline.contract` | Route file calls `buildPage()` and stays ≤ 40 lines (DNA-25) |
| `runtime.context.shape` | RuntimeContext construction invariants (DNA-26) |
| `visual.contract.validate` | Visual Control System (RFC-0233): positional visual invariants over authored pages — a page-bottom fade must be on the last section, etc. |
| `visual.report` | Advisory visual posture (all visual findings, never fails the build) |
| `visual.rules.list` | List the registered visual rules (id, tier, severity, gating) |

## Visual Control System (RFC-0233)

Some visual defects are invisible to schema validation because they depend on a section's **place on the page**, not the section alone. The classic example: a background that fades into the page's bottom edge looks right only while its section is the **last** one — add a section after it and the fade is suddenly stranded mid-page. `visual.contract.validate` catches this class of bug at build time and tells the agent exactly how to fix it (file, line, and a one-line fix).

Deterministic rules (a misplaced edge fade) **fail the build**; softer heuristic rules (a suspected duplicate background) only **warn** unless a site opts to enforce them via `visual: { gate: { … } }` in its `system.md`. New visual rules plug into the same registry without any pipeline changes — see [`AGENTS.md`](./AGENTS.md#visual-control-system-rfc-0233).

## Quick links

- **Agent Guide**: [`AGENTS.md`](./AGENTS.md) — rules, onboarding, troubleshooting
- **Check Module Wiring Guide**: [`docs/check-module-guide.md`](./docs/check-module-guide.md)
- **Compass Operations**: [`docs/compass-operations.md`](./docs/compass-operations.md)

## Common error

```
Error: Kernel command already registered: content.validate
```

Do not add `content.validate`, `tokens.ds.lint`, or any other standard command to `extraCommands` — they are already registered by `createStandardCheckModule`. See `docs/check-module-guide.md` for details.

## Validation

```sh
pnpm --filter @gogol/site-kernel-checks build:check
```
