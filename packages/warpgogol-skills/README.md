# @warpgogol/skills

Warpgogol-specific operational skills. Not published to npm.

## Purpose

Holds skills that reference Warpgogol-only commands (`mission.reconcile`, `mission.validate`, etc.) and concepts (Sternsystems, Bordbuch, cache clones). These skills live outside `@webgogol/forge` to keep forge portable.

See `docs/adrs/adr-0003-warpgogol-skills-package.md` for the architectural decision.

## Sync

Run `pnpm --filter @warpgogol/skills run sync` to copy skills to `.agents/skills/` for IDE discovery.

## Structure

```
skills/<name>/SKILL.md       — skill definition
skills/<name>/qa-log.md      — L0: append-only Q&A log
skills/<name>/fix-patterns.md — L1: baseline fix patterns
skills/<name>/learned-principles.md — L2: distilled principles
```
