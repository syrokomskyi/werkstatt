---
id: RFC-0113
title: "GSAP counter and inline-number cross-link cleanup under RFC-0106"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-27
updatedAt: 2026-05-27
implementedAt: 2026-05-27
closedAt:
supersedes:
supersededBy:
related:
  - RFC-0040
  - RFC-0041
  - RFC-0103
  - RFC-0106
  - RFC-0108
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted: []
successSignals:
  - "RFC-0040 and RFC-0041 frontmatter `related:` lists include RFC-0106."
  - "RFC-0040 documents that `animated: boolean` at the section root is superseded by body.kind: stats `animated` field under RFC-0103, and counters now flow through SectionStats bridge in RFC-0106."
  - "RFC-0041 documents that inline-number animation now flows through SectionRich bridge in RFC-0106; section-level `animateNumbers` boolean lives inside body.kind: rich."
  - "No code change required — the bridge components already wire the existing GSAP scripts."
nonGoals:
  - "Do not rename the GSAP scripts (gsap-counter.ts, inline-number-animation.ts) — their identity is stable."
  - "Do not introduce a new motion contract; RFC-0106 already covers reveal / parallax / stagger."
  - "Do not deprecate RFC-0040 / RFC-0041 themselves; the underlying scripts and orchestrator opt-ins remain canonical."
---

# RFC-0113: GSAP counter and inline-number cross-link cleanup under RFC-0106

## Context

RFC-0040 introduced GSAP-based stat counter animation gated by the `counters: true` orchestrator opt-in. RFC-0041 introduced GSAP-based inline-number animation in prose gated by `inlineNumbers: true`. Both RFCs predate RFC-0106, which unified the section motion contract.

After RFC-0106, sections that want counter animation use `<SectionStats animated>` (body.kind: stats), and sections that want inline-number animation use `<SectionRich animateNumbers>` (body.kind: rich). The underlying scripts (`gsap-counter.ts`, `inline-number-animation.ts`) and orchestrator opt-ins remain canonical and unchanged.

What's missing is **cross-document linkage**:

- RFC-0040 / RFC-0041 frontmatter `related:` does not yet mention RFC-0106.
- RFC-0040 / RFC-0041 prose still describes section-level `animated` booleans (`hero`, `impact`) which were removed from section roots by RFC-0103.
- An agent reading RFC-0040 standalone may attempt to set `animated: true` at the section root, fail validation, and then have to chase the chain to RFC-0103 / RFC-0106.

## Problem

1. **Orphan RFC linkage.** RFC-0040 / RFC-0041 don't reference RFC-0106.
2. **Stale prose surface.** RFC-0040 describes `hero.animated` and `impact.animated` as the canonical opt-in surface; today that surface is `body.animated` inside `body.kind: stats`.
3. **AI agent friction.** Agents reading the chain in chronological order pick up the legacy surface first.

## Decision

Amend RFC-0040 and RFC-0041 with a `related: RFC-0106` entry and a clearly marked "Updated by RFC-0113 / RFC-0106" section at the top. No code change.

### RFC-0040 amendment

Add to frontmatter:

```yaml
related:
  - RFC-0103
  - RFC-0106
  - RFC-0113
```

Add to prose, immediately after the `## Context` heading:

> **Updated by RFC-0103 + RFC-0106 (2026-05-27).** The animated stat counter remains canonical; the page-authoring surface moved from a section-level `animated: boolean` to the `body.kind: stats` field `body.animated`. The `<SectionStats>` body component bridges the same `js-stat-counter` markup that `gsap-counter.ts` already consumes via the `counters: true` orchestrator opt-in. No script-level migration is required.

### RFC-0041 amendment

Add to frontmatter:

```yaml
related:
  - RFC-0103
  - RFC-0106
  - RFC-0113
```

Add to prose, immediately after `## Context`:

> **Updated by RFC-0103 + RFC-0106 (2026-05-27).** Inline-number animation in prose remains canonical; the authoring surface moved from `markdown.animateNumbers` to `body.kind: rich` `body.animateNumbers` consumed by `<SectionRich>`. The wrap utility (`wrapInlineNumbers`) and the script (`inline-number-animation.ts`) are unchanged.

### Verification of bridge

The bridge is already in place:

- `<SectionStats>` (`packages/ui/src/components/section-body/stats/`) emits `js-stat-counter / data-numeric / data-prefix / data-suffix / data-decimals / data-duration` exactly as `gsap-counter.ts` expects.
- `<SectionRich>` (`packages/ui/src/components/section-body/rich/`) calls `wrapInlineNumbers` on the rendered prose HTML when `animateNumbers: true` and the biome motion stance allows it.

No further code work.

## Architectural fit

- **RFC-0040 / RFC-0041** — preserved; this RFC only updates linkage and authoring guidance.
- **RFC-0103** — `body.kind: stats / rich` is the authoritative surface.
- **RFC-0106** — `motionStance` envelope continues to gate availability.

## CLI surface

No new commands.

## File system responsibilities

| Path | Edit |
| --- | --- |
| `docs/rfcs/rfc-0040-*.md` | frontmatter `related:` += RFC-0103, RFC-0106, RFC-0113; prose note at top of Context. |
| `docs/rfcs/rfc-0041-*.md` | frontmatter `related:` += RFC-0103, RFC-0106, RFC-0113; prose note at top of Context. |

## Failure modes

- An agent edits the GSAP scripts to drop the legacy `js-stat-counter` selector → bridge breaks. The validator `section.body.contract.validate` (RFC-0111) cannot catch this; mitigation is the visual diff between before / after migration.
- An agent re-introduces `animated: true` at section root → RFC-0111 `MOT-03` rejects it.

## Rollout

Single PR. Two RFC frontmatter edits + two prose blocks. Optional: add a workflow.lint rule that ensures every implemented RFC referenced by the section framework lists RFC-0106 if it touches GSAP — out of scope for this RFC.

## Alternatives considered

- **Supersede RFC-0040 / RFC-0041.** Rejected — the scripts and orchestrator opt-ins remain canonical; only the authoring surface moved.
- **Rename the GSAP scripts.** Rejected — identity stable; renaming would force a churn in build manifests and import paths for no gain.

## Acceptance criteria

- [x] RFC-0040 frontmatter `related:` lists RFC-0103 and RFC-0106 (and RFC-0113 itself). (evidence: implemented historically)
- [x] RFC-0041 frontmatter `related:` lists RFC-0103 and RFC-0106 (and RFC-0113 itself). (evidence: implemented historically)
- [x] Both RFCs carry a clearly-dated "Updated by RFC-0103 + RFC-0106" note at the top of `## Context`. (evidence: implemented historically)
- [x] `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents reading RFC-0040 / RFC-0041 standalone MUST follow the linkage forward to RFC-0103 + RFC-0106 before authoring content.
- Agents MUST NOT re-introduce section-root `animated: boolean` — the field lives inside `body.kind: stats` per RFC-0103.

## Backfilled sections (RFC-0366)

The following headings were added when the RFC mini-template was retired. The original command/policy RFC used the mini form, which recorded only Context, Decision, Acceptance criteria, and Implementation notes. These sections satisfy the unified full-template contract without altering the original decision.

## Design

See the Decision and Acceptance criteria sections above for the design. (Backfilled during mini-template retirement; original mini-RFC recorded design within Decision and Acceptance criteria.)

## Risks

No additional risks were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)
