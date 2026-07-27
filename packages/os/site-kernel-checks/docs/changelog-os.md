# Auto Changelog OS — Operator Guide

> **Scope.** This document describes the auto-changelog subsystem of the site OS. It lives in `packages/os/site-kernel-checks/src/changelog/` and is wired into each app via `tools/modules/changelog.module.ts`.

---

## Quick start

```bash
# From any app directory (e.g. apps/main or apps/reference-app):
pnpm changelog:dry-run                    # preview without writing files
pnpm changelog:generate:force             # generate even if not release day
pnpm changelog:rebuild-index              # rebuild CHANGELOG.md from last state
pnpm changelog:backfill -- --start=2025-06-01 --end=2025-12-31

# Or via site-kernel directly:
site-kernel run changelog.generate --site main -- --force
site-kernel run changelog.generate --all -- --force   # all apps at once
```

### Required environment variable

| Var | Purpose | Default |
| --- | --- | --- |
| `LLM_API_KEY` | API key for OpenAI or Anthropic | _(required for LLM calls; deterministic fallback works without it)_ |
| `LLM_PROVIDER` | `openai` or `anthropic` | `openai` |
| `LLM_MODEL` | Model identifier (e.g. `gpt-4o`) | `gpt-4o` |

Without `LLM_API_KEY`, the pipeline still runs — all three AI agents fall back to deterministic classification, module-based grouping, and template-based writing.

---

## Architecture

```
packages/site-kernel-checks/src/
├── changelog/
│   ├── context.ts            ChangelogCtx (per-app, from KernelRuntimeContext)
│   ├── types.ts              Zod schemas: RawCommit, ClassifiedCommit, GroupedRelease
│   ├── utils/
│   │   ├── sanitize.ts       Prompt injection guard
│   │   ├── date.ts           Release window detection (weekly/monthly)
│   │   ├── git.ts            Git log extraction scoped to app directory
│   │   └── atomic-fs.ts      tmp+rename atomic file write
│   ├── agents/
│   │   ├── classifier-agent  Deterministic rules → LLM → 3 retry → fallback
│   │   ├── grouper-agent     LLM grouper → deterministic module-based fallback
│   │   └── writer-agent      LLM prose → template fallback
│   └── core/
│       ├── ai-cache.ts       SQLite WAL + composite key + file-based fallback
│       ├── rate-limiter.ts   p-limit factory
│       ├── version-bumper.ts Confidence-gated SemVer (major locked)
│       └── index-rebuilder   CHANGELOG.md rebuilder with marker restoration
└── changelog-command.ts      OS command handlers (runChangelogGenerate, etc.)
```

### Per-app scoping

Each app is its own changelog domain:

| Scope                   | Location                                         |
| ----------------------- | ------------------------------------------------ |
| Git log filter          | `git log -- apps/{name}/`                        |
| Version source          | `apps/{name}/package.json`                       |
| CHANGELOG.md            | `apps/{name}/CHANGELOG.md`                       |
| Versioned release files | `apps/{name}/changelogs/`                        |
| Pipeline state          | `apps/{name}/.changelog-system/state.json`       |
| Shared AI cache         | `.changelog-system/ai-cache.db` (workspace root) |

### Data flow

```
KernelRuntimeContext (app-scoped)
  ↓
buildChangelogCtx()          derives all paths from context.app.directory
  ↓
collectCommits()             git log --after=... --before=... -- apps/{name}/
  ↓
sanitizeCommit() × N         prompt injection protection
  ↓
classifyBatch()              deterministic rules → LLM → cache
  ↓
groupCommits()               LLM clustering → deterministic fallback
  ↓
writeChangelog()             LLM prose per group → template fallback
  ↓
calculateNextVersion()       feat→minor, fix→patch, breaking→confidence-gated
  ↓
writeVersionedFile()         changelog-YYYY-MM-DD-vX.Y.Z.md (atomic)
  ↓
rebuildIndex()               CHANGELOG.md with DYNFIELD markers
```

---

## Configuration

All configuration is derived from `ChangelogCtx` which is built at runtime from:

1. **Environment variables** — `LLM_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL`
2. **Command flags** — `--force`, `--dry-run`, `--mode=monthly`, `--day=15`, `--tz=UTC`
3. **Hardcoded defaults** — temperature=0, maxParallelRequests=5, confidenceThreshold=0.85

There is no separate config file. This is intentional — the OS pattern derives context from the kernel runtime, not from standalone configuration.

### Flag reference

| Flag         | Type    | Default         | Description                              |
| ------------ | ------- | --------------- | ---------------------------------------- |
| `--force`    | boolean | `false`         | Run even if not a release day            |
| `--dry-run`  | boolean | `false`         | Print output, skip file writes           |
| `--mode`     | string  | `weekly`        | `weekly` or `monthly`                    |
| `--day`      | number  | `1`             | 0-6 for weekly (Mon=1), 1-31 for monthly |
| `--tz`       | string  | `Europe/Berlin` | Timezone for release day detection       |
| `--provider` | string  | `openai`        | `openai` or `anthropic`                  |
| `--model`    | string  | `gpt-4o`        | LLM model identifier                     |
| `--start`    | string  | _(required)_    | Backfill start date (YYYY-MM-DD)         |
| `--end`      | string  | _(required)_    | Backfill end date (YYYY-MM-DD)           |

---

## Wiring a new app

To add changelog support to a new app:

### 1. Create `tools/runtime/changelog.ts`

```typescript
export {
  runChangelogGenerate,
  runChangelogRebuildIndex,
  runChangelogBackfill,
} from "@gogol/site-kernel-checks";
```

### 2. Create `tools/modules/changelog.module.ts`

```typescript
import type { KernelModule } from "@gogol/site-kernel";
import {
  runChangelogGenerate,
  runChangelogRebuildIndex,
  runChangelogBackfill,
} from "../runtime/changelog";

export const changelogModule: KernelModule = {
  name: "changelog",
  version: "0.1.0",
  register(registry) {
    registry.registerCommand({
      name: "changelog.generate",
      scope: "app",
      mutatesState: true,
      supportsAllApps: true,
      execute: runChangelogGenerate,
    });
    registry.registerCommand({
      name: "changelog.rebuild-index",
      scope: "app",
      mutatesState: true,
      execute: runChangelogRebuildIndex,
    });
    registry.registerCommand({
      name: "changelog.backfill",
      scope: "app",
      mutatesState: true,
      execute: runChangelogBackfill,
    });
  },
};
```

### 3. Update `tools/kernel.config.ts`

```typescript
import { changelogModule } from "./modules/changelog.module";
// ...
modules: [...existingModules, changelogModule],
```

### 4. Add scripts to `package.json`

```json
"changelog:generate": "site-kernel run changelog.generate",
"changelog:generate:force": "site-kernel run changelog.generate -- --force",
"changelog:dry-run": "site-kernel run changelog.generate -- --dry-run --force",
"changelog:rebuild-index": "site-kernel run changelog.rebuild-index",
"changelog:backfill": "site-kernel run changelog.backfill"
```

---

## AI cache

The SQLite cache at `.changelog-system/ai-cache.db` uses a **5-component composite key**:

```
SHA-256( treeHash + files.sort().join('|') + diffSummary + promptHash + modelVersion )
```

This key is stable across:

- rebase (same tree hash, same files, same diff)
- independent identical commits (same content = same key)

And invalidates on:

- prompt file changes (promptHash changes → new key)
- model version changes (different model = different key)
- cherry-pick/squash (different files list or diff → different key)

WAL mode + `busy_timeout = 5000` enables concurrent CI jobs reading from the same cache.

---

## Versioning rules

| Scenario                     | Action                     | Example           |
| ---------------------------- | -------------------------- | ----------------- |
| Only fix/chore/docs commits  | `patch++`                  | `1.2.0` → `1.2.1` |
| At least one `feat` commit   | `minor++`, patch=0         | `1.2.0` → `1.3.0` |
| Breaking (confidence ≥ 0.85) | `minor++` + warning        | `1.2.0` → `1.3.0` |
| Breaking (confidence < 0.85) | `patch++` + requiresReview | `1.2.0` → `1.2.1` |
| Major bump attempt           | **Throws** (hard guard)    | _(blocked)_       |

---

## Prompts-as-Code

LLM prompts live in `prompts/` at the workspace root and are versioned in git:

```
prompts/
├── classifier.md    Classify commits by type, severity, module, confidence
├── grouper.md       Cluster commits into 5-7 business groups
└── writer.md        Generate human-readable Markdown per group
```

Changing a prompt file automatically invalidates the cache for all future runs (the prompt file's SHA-256 is part of the composite cache key).

---

## CI/CD

`.github/workflows/changelog.yml` runs every Monday at 09:00 UTC.

- Supports per-app targeting: `app: main | reference-app | all`
- Supports `force` and `dry_run` inputs for manual dispatch
- Caches the shared SQLite DB between runs
- Commits results with `changelog-bot` user

---

## Compass compliance

All source files in `packages/site-kernel-checks/src/changelog/` include:

- `MODULE_CONTRACT` with id, purpose, responsibilities, non-goals
- `MODULE_MAP` documenting exported symbols
- `CHANGE_SUMMARY` for audit trail
- Semantic log markers: `[CL-*][functionName][EVENT]` for LDD trajectory inspection

The knowledge graph at `docs/knowledge-graph.xml` documents all module nodes and their dependency edges.
