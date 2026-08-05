# Project Memory

Curated project context (RFC-0664). This file is versioned — daily logs in `daily/` are git-ignored.

## Current focus

<!-- What is being worked on right now. One to three bullets max. -->

- `@warpgogol/forge@0.17.0` published to NPM — creative operator README guide + Windows CI job for forge tests.
- RFC-0698 (auto-commit generated artifacts after dev-deploy) implemented and archived.

## Decisions in flight

<!-- Decisions under discussion but not yet final. -->

## Environment notes

<!-- Tool versions, environment quirks, known issues. -->

- `write_to_file` silently fails when writing to gitignored paths (e.g. `docs/sessions/.raw/`). The tool reports success but the file is not created on disk. Workaround: use `run_command` with `cat > <path> << 'EOF'` for gitignored directories. Discovered 2026-08-05 during session transcript save.
