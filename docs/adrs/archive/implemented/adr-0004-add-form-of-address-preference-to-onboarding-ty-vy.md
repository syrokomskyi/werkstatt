---
id: ADR-0004
title: "Add form-of-address preference to onboarding (ty/vy)"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: implemented
scope: workspace
decider: architecture
createdAt: 2026-07-27
updatedAt: 2026-08-02
implementedAt: 2026-08-02
closedAt: 2026-08-02
supersedes: []
supersededBy:
related:
  - RFC-0547
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0004: Add form-of-address preference to onboarding (ty/vy)

## Context

RFC-0547 introduced forge-bootstrap with operator profile collection (name, register, language). The agent communicates with the operator in their chosen `aiLanguage` throughout the session. However, the form of address (informal "ty" vs formal "vy" in Russian/Ukrainian, or equivalent in other languages) is not collected during onboarding. The agent defaults to a neutral form, which may feel either too formal or too informal depending on the operator's preference.

This is a local convention choice in `packages/forge/skills/meta/forge-bootstrap/SKILL.md` and `PREFERENCES.md` — no cross-workspace contract, no new command, no DNA invariant change.

## Decision

forge-bootstrap asks the operator whether they prefer informal ("ty") or formal ("vy") address during onboarding, defaulting to formal ("vy"). The preference is stored in `PREFERENCES.md` as `formOfAddress: formal|informal` and used in all subsequent communication.

- The question is asked in the operator's `aiLanguage`.
- The default is formal ("vy") if the operator skips the question.
- The preference applies to all agent-generated text: chat messages, reports, suggestions, and skill output.

## Justification

The form of address significantly affects the operator's comfort and perception of the agent. Some operators prefer the intimacy of informal address (especially in creative register), while others expect professional formality (especially in business register). Defaulting to formal is safer — it is easier to relax to informal than to tighten from informal to formal.

This is a local convention, not a cross-workspace contract — hence ADR, not RFC.

## Consequences

- **Positive**: the agent's communication style matches the operator's preference from the first interaction.
- **Positive**: creative register operators who prefer informal address get a more intimate creative companion.
- **Negative**: one additional question during onboarding.
- **Technical debt**: the `formOfAddress` field is only meaningful in languages with a formal/informal distinction (Russian, Ukrainian, French, etc.). In English, it has no effect.

## Evolution

If the operator changes their preference mid-session, the agent reads the updated `PREFERENCES.md` and adjusts immediately. If Forge adds support for more nuanced communication styles (e.g. personality generation per RFC-0551 future work), `formOfAddress` may become one of several communication parameters.
