# @warpgogol/site-kernel-changelog

AI-powered changelog generation for all apps.

## What lives here

| Module | Exports |
| --- | --- |
| `src/changelog-command.ts` | `runChangelogGenerate`, `runChangelogRebuildIndex`, `runChangelogBackfill` |
| `src/changelog/context.ts` | `buildChangelogCtx`, `ChangelogCtx`, `hasFlag`, `readFlag` |
| `src/changelog/agents/` | classifier, grouper, writer agents |
| `src/changelog/core/` | AI cache, index rebuilder, rate limiter, version bumper |
| `src/changelog/utils/` | atomic-fs, date, git, sanitize utilities |

## Commands

| Command name | Function | What it does |
| --- | --- | --- |
| `changelog.generate` | `runChangelogGenerate` | Full pipeline: detect → collect → classify → group → write → bump → index |
| `changelog.rebuild-index` | `runChangelogRebuildIndex` | Rebuild `CHANGELOG.md` index from last known version |
| `changelog.backfill` | `runChangelogBackfill` | Process a historical date range (`--start`/`--end` flags required) |

## Prompts

LLM prompts live in `prompts/`: `classifier.md`, `grouper.md`, `writer.md`.

## Configuration (env vars)

| Variable       | Default  | Purpose                         |
| -------------- | -------- | ------------------------------- |
| `LLM_PROVIDER` | `openai` | `openai` or `anthropic`         |
| `LLM_MODEL`    | `gpt-4o` | Model name                      |
| `LLM_API_KEY`  | —        | API key for the chosen provider |

## Rules

- All paths derived from `context.app.directory` and `context.workspaceRoot` — no hardcoded paths.
- AI cache uses SQLite at `{workspaceRoot}/.changelog-system/ai-cache.db` (shared across apps).
