# Project Memory

Curated project context (RFC-0664). This file is versioned — daily logs in `daily/` are git-ignored.

## Current focus

<!-- What is being worked on right now. One to three bullets max. -->

- Axiom report refactoring complete: `runAxiomReport` uses external `readEvidenceFiles()`/`countFindingsBySeverity()`, `runMissionCheckWithResilience` accepts `noReport` parameter (default `true`).
- `leitstand.dev-deploy` passes `--no-report` to `mission.check` to prevent double `report.html` generation — `axiom.report` runs separately afterwards.

## Decisions in flight

<!-- Decisions under discussion but not yet final. -->

## Environment notes

<!-- Tool versions, environment quirks, known issues. -->
