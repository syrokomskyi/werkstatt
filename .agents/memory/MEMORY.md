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
