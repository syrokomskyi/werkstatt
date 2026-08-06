# Project Memory

Curated project context (RFC-0664). This file is versioned — daily logs in `daily/` are git-ignored.

## Current focus

<!-- What is being worked on right now. One to three bullets max. -->

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
- `ecosystem.commit` catch-22: when an RFC has `versionBump: none` and changes touch `packages/**`, `ecosystem.commit` refuses (EC-06: "Use `git commit` for prose-only RFC changes"), but the pre-commit hook blocks `git commit` for `packages/**`. Workaround: `ECOSYSTEM_COMMIT=1 git commit` — but AGENTS.md:108 explicitly forbids this. Needs fix in `ecosystem.commit` to allow `versionBump: none` for documentation-only `packages/**` changes (AGENTS.md files). Discovered 2026-08-06 during RFC-0720 implementation.
- Forge skill `triggers` field in SKILL.md frontmatter is declarative only — no runtime matching mechanism exists. `extractTriggers()` in `packages/forge/src/onboarding/agents-generate.ts` reads triggers to generate a table in AGENTS.md, but nothing mechanically scans user messages against triggers. To enforce triggers at runtime, a separate mechanism (e.g. Windsurf hooks or a forge command) is needed. Discovered 2026-08-06 during session-end protocol enforcement planning.
