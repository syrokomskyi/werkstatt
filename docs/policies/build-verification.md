# Build Verification Discipline

## Scoped typecheck verification

Agents **MUST NOT** run root `pnpm build` or `turbo run build` during fix, review, or implementation workflows. These commands build every workspace in the monorepo (all `apps/*`, `packages/*`, `services/*`) via Turbo and are prohibitively expensive for iterative agent work. A single `astro build` for one app can take minutes; building the entire ecosystem is never justified inside an agent session.

**Scoped typecheck verification** is the correct substitute:

- **For touched `apps/*` workspaces** — run `pnpm --filter <app-name> exec astro check` (Astro's typecheck for `.astro` + `.ts` files; no SSG build).
- **For touched `packages/*` workspaces** — run `pnpm --filter <package-name> run build:check` (which is `tsc --noEmit` for most packages; no code emission).
- **For touched `services/*` workspaces** — run the service's own `build:check` or typecheck script via `--filter`.

Determine which workspaces were touched from the diff (files changed in `apps/`, `packages/`, `services/`). If the workspace cannot be determined, ask the operator.

**Exceptions** (scoped app build via `--filter` is allowed, never root `pnpm build`):

- Onboarding scaffold workflow may run `pnpm --filter <app> run build` to produce the first build of a new app.
- Deploy workflow may run `pnpm --filter <app> run build:deploy:main` or `build:deploy:alt` for deployment.
- CI pipelines (`github-deploy.template.yml`) run their own build steps — these are not agent sessions.

**Never** run `pnpm build` from the monorepo root, `turbo run build`, or `turbo run build:check` inside an agent session. The root `package.json` scripts `build`, `build:gen`, `build:check`, `check:gen`, `check:all` all invoke Turbo across every workspace and are forbidden in agent workflows.

## Command execution timeout discipline

Every console command an agent runs MUST have a 6-minute (360 000 ms) execution budget. This prevents the agent from blocking on hung or excessively long commands.

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
