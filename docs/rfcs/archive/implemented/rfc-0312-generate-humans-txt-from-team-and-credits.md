---
id: RFC-0312
title: "Generate humans.txt from team, credits, and site metadata"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-06
implementedAt: 2026-07-06
closedAt:
supersedes: []
supersededBy:
amends: []
related:
  - RFC-0081
  - RFC-0087
  - RFC-0307
commands:
  proposed:
    - humans.generate
    - humans.validate
  added:
    - humans.generate
    - humans.validate
  changed:
    - material.credits.generate
    - public.declaration.validate
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/share"
  - "@gogol/business"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Every site publishes /humans.txt as a generated UTF-8 text credit surface."
  - "humans.txt includes the studio/team and material authors from the existing Credits system."
  - "Every site head includes <link type=\"text/plain\" rel=\"author\" href=\"/humans.txt\">."
nonGoals:
  - "Do not treat humans.txt as a legal authorship protocol."
  - "Do not duplicate the full generated credits page verbatim."
  - "Do not add personal contact data unless it already exists in approved site/team content."
acceptance:
  - probe: command-registered
    name: "humans.generate"
  - probe: command-registered
    name: "humans.validate"
---

# RFC-0312: Generate humans.txt from team, credits, and site metadata

## Context

The audit recommended `humans.txt`. The owner decision is to include both the team and material authors from Credits, and to add a head link for every site.

`humans.txt` is a human-oriented credit file, not a strict machine authorship protocol. In this ecosystem it should complement `/bildnachweise`, `/open-source`, and `/cosmic/passport`.

## Problem

Credits already exist in structured site surfaces, but there is no short human-readable root file that says who made the site and where full credits live. Hand-authoring it per app would duplicate credits and drift from the material-credit sidecars.

## Decision

Generate `public/humans.txt` for every app and link it from the shared head:

```html
<link type="text/plain" rel="author" href="/humans.txt">
```

The file is generated from:

- `src/content/system.md` site metadata;
- approved team/person records where present;
- material credits sidecars and generated credits data from RFC-0220;
- package/workspace technology metadata;
- canonical links to `/open-source`, credits/bildnachweise, and `/cosmic/passport` when present.

## Architectural fit

This RFC uses RFC-0220 material credits as the source for authors/licensors and keeps apps thin by generating the public text file and head link from package code. It complements, rather than replaces, the generated credits and open-source pages.

## Design

## humans.txt Format

UTF-8 plain text with LF line endings:

```text
/* TEAM */
Studio: Webgogol
Site: <site display name>
Contact: <public contact URL or mailto when already approved>
Location: <site/studio location when available>

/* AUTHORS AND MATERIAL CREDITS */
<short deduplicated list of material authors/licensors from credits>
Full credits: https://example.com/bildnachweise

/* SITE */
Language: de, en
Last update: 2026-07-05
Canonical: https://example.com/
Cosmic Passport: https://example.com/cosmic/passport
Open source: https://example.com/open-source

/* TECHNOLOGY */
Astro
TypeScript
Turborepo
WGogol Site OS
```

Rules:

- Do not expose non-public personal data.
- Deduplicate material authors by display name and rights holder.
- If the credits list is long, include a short summary and a link to the full credits page.
- Do not claim HDRI or other external public-good sources as studio projects.
- `Last update` is the build date or deterministic release date according to existing generated metadata policy; if deterministic builds require `null`, use the latest source/change date already available from the site OS.

## Commands

### humans.generate

Scope: app.

Writes:

```text
public/humans.txt
```

It must be deterministic for the same source inputs. If volatile timestamps are forbidden by the current build determinism policy, use a deterministic source date or omit the volatile line.

### humans.validate

Scope: app, read-only.

Validates:

- `public/humans.txt` exists;
- file is UTF-8 text;
- required sections exist;
- head link exists and points to `/humans.txt`;
- credits link exists when material credits exist;
- no `NEED_THIS`, placeholder rights holder, or private placeholder email appears;
- no duplicate long credits page content is pasted into the file;
- HDRI ownership-firewall phrases are not present.

Severity: `error` for missing file/head link/private placeholder; `warning` for optional missing technology or location details.

## Pipeline Placement

- `humans.generate` runs in `build.prepare` after material credit generation.
- `humans.validate` runs in `build.check` and `apps-check.author`.
- `public.declaration.validate` verifies the head link.

## Rollout

1. Expose a reusable credits/team summary source for generators.
2. Implement `humans.generate`.
3. Add the shared head `rel=author` link.
4. Implement `humans.validate`.
5. Generate and validate for both reference apps.

## Alternatives considered

- **Skip humans.txt because it is optional.** Rejected; it is a cheap transparency artifact aligned with the platform's credits posture.
- **Paste full credits into humans.txt.** Rejected; link to the generated credits page instead.
- **Infer missing team data.** Rejected; generators must not invent people or roles.

## Risks

- **Leaking private personal data.** Mitigated by using only approved public records.
- **Duplicating credits incorrectly.** Mitigated by summarizing and linking to the canonical credits page.
- **Stale technology list.** Mitigated by deriving it from package/workspace metadata where possible.

## Acceptance criteria

- [x] Every app emits `public/humans.txt`. (evidence: implemented historically)
- [x] Shared head links `/humans.txt` as `rel=author`. (evidence: implemented historically)
- [x] `humans.txt` includes team/studio, site, technology, and a credits summary or full credits (evidence: implemented historically) link.
- [x] Material authors from Credits are represented without duplicating the full credits page. (evidence: implemented historically)
- [x] `humans.validate` passes for both reference apps. (evidence: implemented historically)
- [x] `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents may implement this RFC because its status is `accepted`.
- Do not scrape generated HTML credits pages; use the underlying credits records/generator data.
- Do not invent names, roles, or contact details.
- Keep the output short and human-readable.
