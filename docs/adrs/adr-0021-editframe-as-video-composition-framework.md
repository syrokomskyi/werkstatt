---
id: ADR-0021
title: "Profile-driven video lifecycle — Editframe as first profile"
status: proposed
scope: workspace
decider: architecture
createdAt: 2026-08-04
updatedAt: 2026-08-04
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0638
  - RFC-0639
  - RFC-0640
  - RFC-0641
  - RFC-0642
  - RFC-0674
  - RFC-0675
  - RFC-0676
  - RFC-0677
  - RFC-0678
  - RFC-0679
reviewers: []
---

# ADR-0021: Profile-driven video lifecycle — Editframe as first profile

## Context

Forge already has a domain-neutral stack profile system (RFC-0638..0642): profile YAML files declare workspace types, artifacts, invariants, terminology, and detection markers. The `editframe-html` profile (RFC-0641) was the first non-software-domain profile, declaring `domain: video`, composition artifacts, and VIDEO-* invariants.

However, the profile system currently covers only **scaffolding and health checks** (`forge create --profile`, `forge.profile.validate`, `forge.doctor --strict`). It does not cover the full project lifecycle: dev/preview, build/render, artifact validation, determinism verification, asset management, or release. These lifecycle commands do not exist in Forge at all for profile-driven projects.

The key architectural question is: should Forge hardcode video-specific commands (`forge.render`, `forge.preview`) or should it provide **generic profile-driven lifecycle commands** that read their behavior from the active profile's declarations?

## Decision

Forge gains **profile-driven lifecycle commands** that are fully generic — their behavior is determined by the active profile's YAML declarations, not by hardcoded domain logic.

- `forge.dev` reads the profile's `devServer.command` and launches it.
- `forge.build` reads the profile's `artifacts[].produce.command` and executes it.
- `forge.validate` reads the profile's `artifacts[].validate.command` and executes it.
- `forge.doctor` enforces the profile's `invariants[]` as part of health checks.
- `forge.determinism.check` reads the profile's `artifacts[].determinism` declaration and verifies output reproducibility.
- Release lifecycle reads the profile's `artifacts[]` to determine what artifacts to store and verify.

**Editframe is not special in Forge source.** The `editframe-html` profile (RFC-0641) is the first profile to declare a full lifecycle, but Forge source contains zero Editframe-specific code. A `remotion-react` profile, a `ffmpeg-scripts` profile, or any future video framework profile would work through the same generic lifecycle commands.

## Justification

- **Forge is a published npm package** (`@warpgogol/forge`). Hardcoding domain-specific commands (video, audio, 3D, ML) would bloat the package and couple it to frameworks that consumers may not use. Profile-driven commands keep Forge core lean.
- **The profile schema already declares artifacts and commands** (RFC-0638/0639). Extending it with lifecycle fields is a natural progression, not a new abstraction.
- **Domain neutrality is an established principle** (DNA-54: Forge bindings contract, RFC-0642: domain-neutral skill language audit). Adding hardcoded video commands would violate this principle.
- **Editframe was already chosen as the first video profile** (RFC-0641). This ADR confirms that choice and extends it to the full lifecycle, not just scaffolding.

## Consequences

- **Positive**: Any domain (video, audio, print, ML) can be supported by authoring a profile YAML — zero Forge source changes needed. Forge core stays lean and domain-neutral. The `editframe-html` profile serves as the reference implementation for full-lifecycle profiles.
- **Negative**: Profile-driven commands are indirect — the operator must read the profile YAML to understand what `forge.build` actually does. Mitigation: `forge build --dry-run` prints the resolved command before execution.
- **Technical debt**: Cross-profile determinism (same composition → same MP4 bytes across machines) is deferred to RFC-0678 and may require profile-specific workarounds for Editframe's headless Chrome pipeline.

## Evolution

- If a profile needs lifecycle behavior that the generic commands cannot express (e.g. multi-stage render pipelines), a new RFC extends the profile schema with the needed fields.
- If Editframe introduces breaking changes to its CLI or composition format, only the `editframe-html.yaml` profile file changes — no Forge source modifications.
- If a future domain (e.g. audio production) requires lifecycle concepts not covered by the generic commands, a superseding ADR extends the lifecycle command set.
- Related RFCs: RFC-0674 (profile-driven lifecycle commands), RFC-0675 (invariant enforcement), RFC-0676 (artifact validation), RFC-0677 (determinism verification), RFC-0678 (asset management), RFC-0679 (release lifecycle).
