# Project Memory

Curated project context (RFC-0664). This file is versioned — daily logs in `daily/` are git-ignored.

## Current focus

<!-- What is being worked on right now. One to three bullets max. -->

- RFC-0760 (vidpovidalni-rekomendatsiyi UK-only page) implemented and archived. UK-only sitemap exclusion verified.
- RFC-0717 (remove stale Nachweis surface module blueprint references) implemented and archived. Cache clone synced via mission.reconcile.
- `@warpgogol/forge@0.17.0` published to NPM — creative operator README guide + Windows CI job for forge tests.
- RFC-0698 (auto-commit generated artifacts after dev-deploy) implemented and archived.

## Decisions in flight

<!-- Decisions under discussion but not yet final. -->

## Environment notes

<!-- Tool versions, environment quirks, known issues. -->

- `write_to_file` silently fails when writing to gitignored paths (e.g. `docs/sessions/.raw/`). The tool reports success but the file is not created on disk. Workaround: use `run_command` with `cat > <path> << 'EOF'` for gitignored directories. Discovered 2026-08-05 during session transcript save.
- RFC authors must verify actual `system.md` state before writing — RFC-0717 was written based on RFC-0708's plan, not the actual codebase. The workpiece was already clean; only the cache clone had a stale entry. Always read the actual file, not the plan that instructed changes to it. Discovered 2026-08-06.
- RFCs proposing cache clone edits must use `mission.reconcile`, not direct editing. AGENTS.md already forbids direct mirror editing (line 21), but RFC-0717's original draft violated this. The grilling step in `fo-idea-plan` catches this. Discovered 2026-08-06.
- Windsurf `pre_user_prompt` hook: blocking pre-hook, receives JSON on stdin with `tool_info.user_prompt`. Exit 2 + stderr injects a message the agent sees (stdout + `show_output: true` is UI-only, not agent-visible). Useful for mechanical enforcement of protocols. 12 hook events total: `pre_user_prompt`, `pre_read_code`, `pre_write_code`, `pre_run_command`, `pre_mcp_tool_use`, `post_cascade_response`, etc. Discovered 2026-08-06 during session-end protocol enforcement.
- `ecosystem.commit` docs-only skip-bump: when ALL staged platform files are `.md`, `skipPlatformBump` is true — no version bump, no trailers, commit via `ECOSYSTEM_COMMIT=1 git commit -m <message>`. This fixes the former catch-22 where `versionBump: none` + `packages/**/AGENTS.md` changes were blocked by both pre-commit hook and EC-06. Mixed `.md` + `.ts` still triggers EC-06. Implemented 2026-08-06, platform version 4.17.37.
- Forge skill `triggers` field in SKILL.md frontmatter is declarative only — no runtime matching mechanism exists. `extractTriggers()` in `packages/forge/src/onboarding/agents-generate.ts` reads triggers to generate a table in AGENTS.md, but nothing mechanically scans user messages against triggers. To enforce triggers at runtime, a separate mechanism (e.g. Windsurf hooks or a forge command) is needed. Discovered 2026-08-06 during session-end protocol enforcement planning.
- `ecosystem.commit` is required for all `packages/**` changes — a pre-commit hook blocks direct `git commit` for platform-scope files with the message "Direct git commit blocked for platform-scope changes. Use ecosystem.commit instead." Discovered 2026-08-08 during ADR-0036 implementation.
- When testing `mission.close` with external mirrors (`mirrors.length > 2`), the RFC-0705 blocking check requires `refs/mirror/<branch>` to exist in the bare repo and match origin HEAD. Set it up via `git update-ref refs/mirror/<branch> <sha>` in the bare repo. Detect the branch name via `git symbolic-ref HEAD`, not hardcoded "main" — the default branch may differ. Discovered 2026-08-08 during RFC-0762 test creation.
- When mocking `executeKernelCommand` for tests that need different behavior per command (e.g. `sternsystem.pin` success + `sternsystem.sync` failure), `mockResolvedValueOnce` is consumed by the first call regardless of `commandName`. Use `mockImplementation` with a `commandName` check: `if (opts.commandName === "sternsystem.sync") return { exitCode: 1, ... }; return defaultResult;`. Discovered 2026-08-08 during RFC-0762 test creation.
- Sitemap files in mission workpieces can be stale copies from the cache clone (`../systems-cache/<id>/public/sitemap-*.xml`). If a page is missing from sitemap after a build, run `sitemap.generate` manually from the workpiece directory to regenerate. The root cause is often stale artifacts, not a code bug. Discovered 2026-08-08 during RFC-0760 implementation.
- RFC acceptance criteria can reference props that don't exist in the archetype schema. RFC-0760 criterion `service-metadata-block includes stats[]` references a prop absent from the archetype (RFC-0759 uses `.strict()` schema). Dynamic counts are handled by `dynamic-status-block` per RFC-0759 rollout. When stamping, mark such criteria checked with an explanatory note. Discovered 2026-08-08 during RFC-0760 implementation.
