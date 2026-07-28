---
id: ADR-0003
title: "Separate package for Warpgogol-specific skills"
status: accepted
scope: package
decider: architecture
createdAt: 2026-07-26
updatedAt: 2026-07-27
implementedAt:
supersedes: []
supersededBy:
  - RFC-0539
related:
  - RFC-0374
  - RFC-0524
  - RFC-0539
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0003: Separate package for Warpgogol-specific skills

## Context

`@warpgogol/forge` (RFC-0374) is a portable package published to npm. Its skills live in `packages/forge/skills/` and ship in the `files` array. Forge skills use the `fo-` prefix and are validated by `forge.skill.validate` (SKILL-01..13).

Warpgogol-specific operational skills — such as mission reconcile – reference commands (`mission.reconcile`, `mission.validate`, `mission.git.commit`) and concepts (Sternsystems, Bordbuch, cache clones) that exist only in the Warpgogol monorepo. Placing them in forge would:

- Pollute the npm package with skills useless to external consumers.
- Violate the forge portability contract (`packages/forge/AGENTS.md`: "src/ must NOT import from `@warpgogol/site-kernel`").
- Require bindings for commands that have no meaning outside Warpgogol.

## Decision

Create a separate `packages/warpgogol-skills/` package for Warpgogol-specific skills.

- Skills live in `packages/warpgogol-skills/skills/<name>/SKILL.md`.
- Skills use no `fo-` prefix — they are not forge skills.
- The package is `private: true` — never published to npm.
- A `sync` script copies skills to `.agents/skills/` for IDE discovery, analogous to `forge.init`'s skill sync.
- `forge.skill.validate` does not validate Warpgogol-specific skills — they are outside forge's registry.
- The cumulative knowledge pattern (RFC-0524) applies: skills may declare `knowledge:` arrays with L0/L1/L2 files.

## Justification

- **Separation of concerns:** forge = portable governance; warpgogol-skills = Warpgogol operations. Different audiences, different distribution.
- **No forge pollution:** forge's npm consumers never see Warpgogol-specific skills.
- **No binding hacks:** Warpgogol skills reference `pnpm exec site-kernel run` directly — no need to route through forge bindings.
- **Simple sync:** a flat copy script is sufficient — no registry, no validation framework, just `skills/ → .agents/skills/`.

## Consequences

- **Positive:** Clean boundary between portable and project-specific skills. Warpgogol skills can reference any command or path freely. New skills added without touching forge.
- **Negative:** Two sync mechanisms (`forge.init` for forge skills, `warpgogol-skills sync` for Warpgogol skills). No automated validation for Warpgogol skill frontmatter — manual discipline required.
- **Technical debt:** If Warpgogol-specific skills multiply and need validation, a lightweight validator may be needed in `packages/warpgogol-skills/`. Postpone until the count justifies it.

## Evolution

**Superseded by RFC-0539.** As of RFC-0539, Warpgogol-specific skills are now managed as a forge-declared skill pack (`skillPacks` in `forge.yaml` with `wg` prefix). Skills use `wg-` prefixed names, are synced by `forge.init`, and are validated by `forge.skill.validate` (SKILL-01..15). The separate `sync.mjs` script has been removed. This ADR's decision is retained for historical context; the operational details are superseded.
