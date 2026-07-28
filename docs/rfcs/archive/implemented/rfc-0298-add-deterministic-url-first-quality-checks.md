---
id: RFC-0298
title: "Add deterministic URL-first quality checks"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-05
implementedAt: 2026-07-05
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0074
  - RFC-0203
  - RFC-0233
  - RFC-0293
  - RFC-0294
  - RFC-0297
commands:
  proposed: []
  added:
    - check.technical.validate
    - check.localization.validate
    - check.accessibility.validate
    - check.content-surface.validate
    - check.deterministic.run
  changed: []
  removed: []
appsImpacted:
  - check-warpgogol-com
packagesImpacted:
  - "@gogol/check-core"
  - "@gogol/site-kernel-check-warpgogol"
successSignals:
  - "A captured evidence graph can be checked for technical, localization, accessibility, and content-surface problems without any LLM call."
  - "The same deterministic checks work for WGogol and third-party targets."
  - "Every deterministic finding includes URL and evidence locators and can be grouped into an action pack."
nonGoals:
  - "Do not judge cultural tone or audience perception here; RFC-0299 owns AI audience review."
  - "Do not duplicate source-level apps-check validators."
  - "Do not fail third-party checks because WGogol hints are absent."
acceptance:
  - probe: command-registered
    name: "check.deterministic.run"
  - probe: command-registered
    name: "check.technical.validate"
  - probe: command-registered
    name: "check.localization.validate"
  - probe: command-registered
    name: "check.accessibility.validate"
---

# RFC-0298: Add deterministic URL-first quality checks

## Context

The checker should provide immediate value without LLMs: broken links, bad metadata, missing language alternates, unbalanced translation coverage, inaccessible forms, weak basic content structure, missing machine-readable artifacts, and obvious page-rendering problems.

## Problem

Qualitative review is valuable but expensive and non-deterministic. If the first version depends on AI perception, it will be slower to dogfood and harder to trust as a deploy gate.

## Decision

Add deterministic checks that consume `SiteEvidenceGraph` and emit canonical diagnostics.

The aggregate command:

```sh
pnpm exec site-kernel run check.deterministic.run --run .check-warpgogol/runs/<runId> --json
```

runs:

- `check.technical.validate`
- `check.localization.validate`
- `check.accessibility.validate`
- `check.content-surface.validate`

Each command is independently runnable for focused debugging.

## Architectural fit

- RFC-0074 split deterministic validators from LLM audits. This RFC applies that split to URL-first checking.
- RFC-0203 diagnostics provide the finding shape.
- RFC-0294 evidence graphs make checks reproducible.
- RFC-0297 reports and action packs consume the emitted diagnostics.

## Design

### Technical Checks

`check.technical.validate` evaluates:

- HTTP status and redirect loops;
- canonical URL consistency;
- sitemap discoverability and same-host URLs;
- robots meta and `robots.txt` contradictions;
- hreflang symmetry;
- title and meta description presence/length;
- Open Graph and Twitter card basics;
- JSON-LD parseability;
- missing critical assets detected during capture;
- `.well-known` artifacts when present.

Rule prefix: `CW-TECH-*`.

### Localization Checks

`check.localization.validate` evaluates:

- language clusters from hreflang, URL structure, HTML `lang`, and optional hints;
- missing localized siblings;
- pages with identical visible text hashes across different languages;
- untranslated route segments when language-specific routes are expected;
- inconsistent navigation destinations across language variants;
- WGogol Ukrainian formal address rules when hints identify `lang: uk` and target profile requires formal address.

Rule prefix: `CW-L10N-*`.

### Accessibility Checks

`check.accessibility.validate` evaluates:

- one H1 per page;
- visible focusable CTAs/links with accessible names;
- images with alt text where semantically inspectable;
- forms with labels and consent text;
- heading order warnings;
- obvious color contrast failures when computed style is available;
- mobile viewport horizontal overflow from screenshot/DOM measurements.

Rule prefix: `CW-A11Y-*`.

### Content Surface Checks

`check.content-surface.validate` evaluates:

- primary value proposition visible above the first major scroll on desktop and mobile;
- at least one clear primary CTA on commercial pages;
- contact path discoverable within a small click depth;
- obvious placeholder text and `NEED_THIS` markers visible in rendered output;
- duplicate adjacent sections by heading/text hash;
- thin pages with very low visible text and no structured reason.

Rule prefix: `CW-CONT-*`.

### Default Severity

- Broken URLs, malformed JSON-LD, missing language siblings for indexable pages, raw placeholders, and unusable forms are `error`.
- Weak metadata length, heading-order issues, duplicate sections, and thin pages are `warning`.
- Informational observations are `info`.

Deploy gating policy is owned by RFC-0301.

## Rollout

1. Implement command skeletons and rule registry entries.
2. Add graph fixtures for each command.
3. Implement `check.technical.validate` first because it is most deterministic.
4. Implement localization and accessibility checks.
5. Implement content-surface heuristics as warning-first.
6. Wire all into `check.deterministic.run` and `check.run`.

## Alternatives considered

- **Run Lighthouse only.** Rejected: useful but too broad and not tailored to multilingual business presence.
- **Only use source validators for WGogol sites.** Rejected by RFC-0293.
- **Put all deterministic rules in one command.** Rejected: focused commands make debugging and CI output clearer.

## Risks

- **False positives on third-party sites.** Mitigated by warning-first heuristics and target profiles.
- **Localization matching without hints is imperfect.** Mitigated by hreflang clusters and URL/text hashes; hints improve precision but are optional.
- **Accessibility scope creep.** Mitigated by starting with lightweight deterministic rules, not full WCAG certification.

## Acceptance criteria

- [x] The four individual commands and `check.deterministic.run` are registered. (evidence: implemented historically)
- [x] Each command consumes an evidence graph path and does not fetch the target. (evidence: implemented historically)
- [x] Each command has red/green graph fixtures. (evidence: implemented historically)
- [x] Rule ids are registered and diagnostics include URL evidence. (evidence: implemented historically)
- [x] `check.deterministic.run` aggregates diagnostics without dropping warning/info records. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Do not implement cultural or audience judgment in deterministic checks.
- Prefer explicit evidence from the graph over heuristics; when evidence is uncertain, emit warning or info.
- Keep rules reusable for third-party sites by default.
