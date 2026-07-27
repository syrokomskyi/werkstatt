# @warpgogol/site-kernel-changelog

AI-powered changelog generation for Warpgogol apps. Detects git commits since the last release, classifies and groups changes with an LLM, writes versioned changelog entries, and maintains a `CHANGELOG.md` index.

## Commands

| Command | Function | What it does |
| --- | --- | --- |
| `changelog.generate` | `runChangelogGenerate` | Full pipeline: detect → collect → classify → group → write → version bump → rebuild index |
| `changelog.rebuild-index` | `runChangelogRebuildIndex` | Rebuild the top-level `CHANGELOG.md` index from the last known version |
| `changelog.backfill` | `runChangelogBackfill` | Process a historical date range; requires `--start` and `--end` flags |

## Usage

```sh
pnpm exec site-kernel run changelog.generate --site my-app
pnpm exec site-kernel run changelog.backfill --site my-app --start=2024-01-01 --end=2024-06-30
pnpm exec site-kernel run changelog.rebuild-index --site my-app
```

## Environment variables

| Variable       | Default  | Purpose                         |
| -------------- | -------- | ------------------------------- |
| `LLM_PROVIDER` | `openai` | `openai` or `anthropic`         |
| `LLM_MODEL`    | `gpt-4o` | Model name                      |
| `LLM_API_KEY`  | —        | API key for the chosen provider |

## LLM prompts

Prompts live in `prompts/` and are loaded at runtime:

- `classifier.md` — classifies each commit into a change category
- `grouper.md` — groups related commits into a changelog section
- `writer.md` — writes the final human-readable entry

## AI cache

Results are cached in `{workspaceRoot}/.changelog-system/ai-cache.db` (SQLite, shared across all apps). Rerunning the command on the same commits does not re-invoke the LLM.

## Wiring

Register the commands in the app's `kernel.config.ts` by importing the runners and adding them as `extraCommands` in `createStandardCheckModule`, or as standalone commands in a dedicated module.

## Validation

```sh
pnpm --filter @warpgogol/site-kernel-changelog build:check
pnpm --filter @warpgogol/site-kernel-changelog test
```
