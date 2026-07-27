# @wgogol/skills

WGogol-specific operational skills. Not published to npm.

## Purpose

Holds skills that reference WGogol-only commands (`mission.reconcile`, `mission.validate`, etc.) and concepts (Sternsystems, Bordbuch, cache clones). These skills live outside `@webgogol/forge` to keep forge portable.

See `docs/adrs/adr-0003-wgogol-skills-package.md` for the architectural decision.

## Sync

Run `pnpm --filter @wgogol/skills run sync` to copy skills to `.agents/skills/` for IDE discovery.

## Structure

```
skills/<name>/SKILL.md       — skill definition
skills/<name>/qa-log.md      — L0: append-only Q&A log
skills/<name>/fix-patterns.md — L1: baseline fix patterns
skills/<name>/learned-principles.md — L2: distilled principles
```
