---
id: ADR-0043
title: "Agent-generated script directory convention for Forge projects"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: implemented
scope: workspace
decider: architecture
createdAt: 2026-08-11
updatedAt: 2026-08-11
implementedAt: 2026-08-11
closedAt:
supersedes: []
supersededBy:
related: []
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0043: Agent-generated script directory convention for Forge projects

## Context

Forge projects currently lack a convention for where agents (AI assistants operating through IDE) should place generated scripts and code files. When agents process content — notes, pages, data files — they often need to write ad-hoc scripts for transformation, validation, or analysis. Without a designated location, agents scatter `.ts`, `.mjs`, `.py` files across content directories, mixing code with authored content.

This problem is especially acute for knowledge-base profiles (e.g. Obsidian vaults) where the content directory IS the entire workspace and hundreds of thousands of notes may exist. Code files mixed into a note collection break search, clutter the author's view, and risk being treated as content by downstream tools.

The existing `scripts/` directory at the werkstatt repository root (`scripts/clean.mjs`, `scripts/dev-watch.mjs`, `scripts/turbo-run.mjs`) demonstrates the pattern for human-authored scripts. This ADR extends the same convention to agent-generated scripts.

## Decision

Agent-generated scripts and code files reside in `scripts/` at the Forge project root, never in content directories.

- The `scripts/` directory is the single canonical location for all executable scripts — human-authored and agent-generated alike.
- Stack profiles MAY declare an alternative script directory via a `scriptDir` field in the profile YAML; when absent, `scripts/` is the default.
- Skills that instruct agents to write code MUST reference this convention and direct output to `scripts/` (or the profile-declared alternative).

## Justification

**Forces:**

- Agents need a predictable location for generated code — unpredictable placement makes cleanup, review, and reuse difficult.
- Content directories must remain pure content — mixing code into notes, pages, or data files breaks domain-specific tools (Obsidian search, Astro content collections, etc.).
- The convention must be universal — it applies to all Forge profiles (site, game, video, knowledge-base), not just one domain.

**Alternatives considered:**

- `.forge/scripts/` — rejected: hidden directory mixes with forge governance config (`pinned.yaml`, `pinned-audit.log`); harder for humans to discover and review.
- `tools/scripts/` — rejected: `tools/` is reserved for kernel configuration (`kernel.config.ts`); nesting scripts there conflates two concerns.
- `scripts/agent/` subdirectory — rejected: unnecessary separation between human and agent scripts; the author and the agent are collaborators, not separate teams.
- Profile-defined only (no default) — rejected: a default is needed for profiles that do not declare one; `scripts/` is the natural default given existing precedent.

## Consequences

- **Positive:** Agents have a single predictable location for generated code. Content directories stay clean. Cleanup is trivial — `git status scripts/` shows all agent-generated code. Code is reviewable in one place.
- **Positive:** Skills can reference the convention by default, reducing agent confusion across profiles.
- **Negative:** Large volumes of agent-generated scripts may accumulate in `scripts/` without a cleanup policy — a future ADR or profile invariant may need to address script lifecycle (e.g. naming conventions, expiration).
- **Technical debt:** The `scriptDir` profile field is declared by this ADR but not yet added to the stack profile schema (`profile-schema.ts`). Implementation requires a schema extension.

## Evolution

- If agent-generated scripts grow to the point where `scripts/` becomes unmanageable (hundreds of files), a naming convention or subdirectory structure within `scripts/` may be needed — e.g. `scripts/agent/<task-id>/`.
- If a profile's content model requires code to live alongside content (e.g. executable notebooks), that profile should declare a `scriptDir` override.
- The `scriptDir` field in the stack profile schema should be added when the next profile RFC extends `profile-schema.ts`.
