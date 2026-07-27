# Compass Operations Guide

> **Scope.** How to operate the Compass semantic framework for this monorepo. For the architectural principles and markup contract, see `docs/source-markup.xml`. For the site OS itself, see `packages/os/site-kernel/docs/site-os.md`.

---

## 1. Quick reference

```bash
# Validate all authored files against Compass policy
pnpm compass:validate

# Per-app validation
pnpm compass:validate:main
pnpm compass:validate:my-app

# Generate / refresh docs/compass-inventory.xml
pnpm compass:inventory

# Trim CHANGE_SUMMARY blocks (remove boilerplate, cap to 30 items)
pnpm exec site-kernel run compass.summary.trim
```

All commands are also available through the site-kernel CLI directly:

```bash
pnpm exec site-kernel run compass.validate
pnpm exec site-kernel run compass.inventory --json
```

---

## 2. Commands

| Command | Function | Purpose |
| --- | --- | --- |
| `compass.validate` | `runCompassValidation` | Check every authored file against the current scaffolding policy. Exit 1 on any non-compliant file. |
| `compass.inventory` | `runCompassInventory` | Classify every source file (risk, complexity, layer, mode) and write `docs/compass-inventory.xml`. |
| `compass.changesummary.validate` | `runCompassChangeSummaryValidate` | Validate CHANGE_SUMMARY blocks for boilerplate and over-cap total items (RFC-0349, RFC-0538). |
| `compass.summary.trim` | `runCompassSummaryTrim` | Deterministically trim CHANGE_SUMMARY blocks: remove boilerplate, cap total items to 30 (RFC-0538). |
| `compass.audit.plan` | `runCompassAuditPlan` | Emit a deterministic work-order of files whose revision has advanced past the threshold since their last audit (RFC-0352). Read-only. |
| `compass.audit.record` | `runCompassAuditRecord` | Stamp a file's audit verdict and current revision into the compass-audit ledger (RFC-0352). |
| `compass.audit.baseline` | `runCompassAuditBaseline` | Seed the compass-audit ledger for every authored file at its current revision with `verdict=baseline` (RFC-0352). |
| `compass.audit.validate` | `runCompassAuditValidate` | Warn/fail on audit-overdue files per revision threshold (RFC-0352). Warns by default, fails with `--strict`. |

### CI enforcement

Both apps include `compass.validate` in their `build.check` and `check` pipelines. A file without the required Compass scaffolding blocks the build.

---

## 3. File classification

The inventory engine classifies every authored source file by four axes:

| Axis | Values | Determined by |
| --- | --- | --- |
| **Risk** | `high`, `medium`, `low` | Exact path set + layer heuristics |
| **Complexity** | `non-trivial`, `trivial` | Non-empty line count and byte size |
| **Layer** | `middleware`, `layout`, `page`, `component`, `schema`, `utility`, `script`, etc. | Workspace-relative path prefix |
| **Scaffolding mode** | `full`, `reduced`, `none` | Risk > complexity > layer |

### Mode requirements

| Mode        | Required markers                                                   |
| ----------- | ------------------------------------------------------------------ |
| **full**    | `MODULE_CONTRACT`, `CHANGE_SUMMARY`, `@ai-invariant` for high-risk |
| **reduced** | `MODULE_CONTRACT`, `CHANGE_SUMMARY`                                |
| **none**    | Nothing (generated/excluded files)                                 |

### Excluded file classes

- Generated icon trees (`src/components/icons/`)
- Build output (`dist/`)
- Test files (`test/`, `*.test.ts`, `*.spec.ts`)
- Framework configs at workspace root (`astro.config.mjs`, `vitest.config.ts`)

---

## 4. Astro file handling

`.astro` files have a frontmatter/template split:

```astro
---
// @ai-invariant: ... (high-risk only, inside frontmatter)

/*
<MODULE_CONTRACT>...</MODULE_CONTRACT>
<MODULE_MAP>...</MODULE_MAP>
<CHANGE_SUMMARY>...</CHANGE_SUMMARY>
*/

/* <COMPASS_BLOCK id="logic"> */
import { ... } from "...";
const data = await fetch(...);
/* </COMPASS_BLOCK> */
---
<!-- <COMPASS_BLOCK id="template"> -->
<html>...</html>
<!-- </COMPASS_BLOCK> -->
```

Rules:

- Headers and `@ai-invariant` go **inside** frontmatter (after `---`), never before.
- Frontmatter anchors use `/* */` block comment style.
- Template anchors use `<!-- -->` HTML comment style.

---

## 5. Compass Skills ecosystem

The Compass framework provides 13 skills for AI-assisted development workflows. These skills work on any Compass-governed project, not just this monorepo.

### Lifecycle skills

| Skill | Trigger | What it does |
| --- | --- | --- |
| `compass-init` | New project | Scaffolds `docs/` XML templates and `AGENTS.md` |
| `compass-plan` | Requirements ready | Designs module architecture, contracts, knowledge graph, verification refs |
| `compass-verification` | Plan ready | Designs tests, traces, log markers; maintains `verification-plan.xml` |
| `compass-execute` | Plan + verification ready | Sequential module implementation with commit-per-step |
| `compass-multiagent-execute` | Plan + verification ready | Parallel-safe waves with controller/worker/reviewer model |

### Maintenance skills

| Skill | When to use | What it does |
| --- | --- | --- |
| `compass-refresh` | After manual edits / refactors | Syncs `knowledge-graph.xml` and `verification-plan.xml` with code |
| `compass-refactor` | Rename / move / split / merge | Atomic migration across code + docs + graph + verification |
| `compass-reviewer` | During execution or at phase end | Scoped gate review or full integrity audit |
| `compass-fix` | Bug or failure | Navigates via graph + verification to the exact block, applies fix |

### Utility skills

| Skill | What it does |
| --- | --- |
| `compass-status` | Health report: artifacts, codebase metrics, graph health, next action |
| `compass-ask` | Grounded Q&A over project artifacts with citations |
| `compass-explainer` | Full Compass methodology reference and onboarding |
| `compass-cli` | Operate the optional `compass` CLI for lint, module lookup, file inspection |
| `compass-setup-subagents` | Scaffold worker/reviewer agent presets for multi-agent shells |

### Standard workflow

```
compass-init -> requirements.xml -> technology.xml -> compass-plan
-> compass-verification -> compass-execute / compass-multiagent-execute
-> compass-refresh -> compass-reviewer -> compass-status
```

---

## 6. Canonical markup contract

Full reference: `docs/source-markup.xml` (version 1.0.0).

### TypeScript / JavaScript files

```typescript
/*
<MODULE_CONTRACT>
  <purpose>Brief purpose.</purpose>
  <non-goals>
    <item>What this module does NOT do.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Latest change description.</item>
</CHANGE_SUMMARY>
*/

// @ai-invariant: fail-closed comparison — never bypass (high-risk only)
```

### @ai-invariant placement

Use the `fo-compass-annotate` Forge skill for `@ai-invariant` insertion (RFC-0538). The former `compass.invariant.add` command has been removed.

---

## 7. Troubleshooting

| Problem | Solution |
| --- | --- |
| `compass.validate` fails on a new file | Run `pnpm compass:backfill` to insert skeleton blocks, then fill the `TODO(compass)` sentinels manually |
| Anchors in `.astro` cause TypeScript errors | Ensure `@ai-invariant` / headers are _inside_ frontmatter, not before `---` |
| File classified as `full` but should be `reduced` | Check complexity threshold (>20 non-empty lines OR >900 bytes = non-trivial) |
| Backfill modifies 0 files but validation still fails | The file may have `TODO(compass)` sentinels — replace them with real values (COMPASS-TODO-01) |
| compass.validate not in build pipeline | Check `tools/kernel.config.ts` — `compass.validate` must be in `build.check` array |
