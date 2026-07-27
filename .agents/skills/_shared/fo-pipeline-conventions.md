# WG Pipeline Shared Conventions

Reference file for all `fo-*` skills. Each skill links to the sections it needs via context pointers like "Read `_shared/fo-pipeline-conventions.md` §Recoverable errors".

## PREFERENCES

Read `PREFERENCES.md` at the repository root before starting. If the file is missing or `aiLanguage` is unset, ask the operator once and create the file using the `my-preferences` skill semantics.

## Language policy

- Every natural-language message shown to the operator — greetings, questions, explanations, summaries, status updates — must use `aiLanguage`.
- Generated documentation, commit messages, and persisted artifacts must use `documentationLanguage`.
- Internal reasoning, tool-call planning, and intermediate agent monologue may stay in the agent's working language (usually English).
- Do not translate existing files automatically; preferences affect only new output and the current session.

## Recoverable errors

No pauses for recoverable tool errors. If a tool call fails with a recoverable error — `write_to_file` content too long, JSON truncation, line count/character limit exceeded, or similar — recover autonomously: split content into smaller writes, use `edit`/`multi_edit`, decompose oversized files, and retry immediately. The operator's default answer to "Shall I proceed?" is always "yes".

## Commit discipline

Stage only the files this skill produces or modifies. Another agent may be working in a different session; `git add -A` or `git add .` is forbidden.

## Pipeline reference

- **RFC pipeline**: create → audit → enhance → plan → implement (includes review → fix)
- **ADR pipeline**: create → implement (includes review → fix)

## Stop step semantics

Several skills (`fo-idea-audit`, `fo-idea-enhance`) end with a "Stop" step that says "Do not run the next skill." This instruction applies **only to standalone invocations** — when the operator runs `/fo-idea-audit` or `/fo-idea-enhance` directly.

When a skill is invoked **inline by an orchestrator** (e.g. `fo-idea-i-just-want-to-see-the-result`, `fo-idea-i-just-want-to-see-the-plan`), "Stop" means **end this skill's execution and return control to the orchestrator**. The orchestrator then proceeds to the next pipeline step. The "Do not run X" guardrail does not block the orchestrator — the orchestrator explicitly handles inter-step transitions.

## Forward-only discipline

The ecosystem is forward-only. No backward compatibility layers, no shims, no dual-paths. Legacy code paths are deleted, not maintained behind a flag. Deprecation means removal in the same change, not an indefinite grace period.

## Compass terminology

Use Compass (not GRACE) in all new code, documentation, and log messages (RFC-0353).

## Compass scaffolding

Non-trivial new source files in `apps/` or `packages/` must carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42).

## Build verification discipline

MUST NOT run root `root build` or `turbo run build` — these build every workspace and are prohibitively expensive for iterative workflows. Run scoped checks only: `astro check` for touched apps, `tsc --noEmit` (via `build:check`) for touched packages. See root AGENTS.md §Build verification discipline.

## Command execution timeout discipline

Every `run_command` call MUST use a 6-minute (360 000 ms) execution budget. This prevents the agent from blocking on hung or excessively long commands.

### Rules

1. **Always non-blocking**: Call `run_command` with `Blocking: false` and `WaitMsBeforeAsync: 360000` (6 min). This lets the agent regain control if the command hasn't finished.
2. **Check status**: After `WaitMsBeforeAsync` elapses, call `command_status` with `WaitDurationSeconds: 0` to see if the command completed.
3. **If completed**: Read the output and proceed normally.
4. **If still running after 6 min**: Abandon the command — do not wait further. Try an alternative approach (different command, different scope, or skip the step). If no alternative exists, retry the same command once with the same 6-min budget.
5. **Max retries**: 2 attempts per command. After 2 failed attempts, report to the operator and ask how to proceed.
6. **No infinite waits**: NEVER call `command_status` with `WaitDurationSeconds` > 60. NEVER use `Blocking: true` for commands that may hang (builds, checks, `site-kernel run`, `astro check`, `tsc`, `pnpm install`).
7. **Exceptions**: `Blocking: true` is allowed only for trivially fast commands (e.g., `node --version`, `git log -n 1`, `git status --short`) that are guaranteed to complete in seconds.

### Rationale

- The `run_command` tool has no built-in timeout parameter. `WaitMsBeforeAsync` is the only mechanism to regain control after a fixed duration.
- Abandoning a still-running process is acceptable — the process may complete in the background, but the agent is unblocked and can retry or try an alternative.
- This covers all command classes: `pnpm exec site-kernel run ...`, `pnpm --filter <pkg> run build:check`, `astro check`, `git`, `pnpm install`, etc.
- Site-kernel commands already have internal `timeoutMs` (RFC-0255), but the agent-side 6-min budget is a safety net for ALL commands, not just site-kernel.
