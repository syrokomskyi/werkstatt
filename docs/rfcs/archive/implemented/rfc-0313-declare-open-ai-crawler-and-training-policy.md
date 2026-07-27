---
id: RFC-0313
title: "Declare an open AI crawler and training policy for studio sites"
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
  - RFC-0052
  - RFC-0142
  - RFC-0143
  - RFC-0211
  - RFC-0307
commands:
  proposed:
    - ai.policy.generate
    - ai.policy.validate
  added:
    - ai.policy.generate
    - ai.policy.validate
  changed:
    - ai.generate
    - robots.generate
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Studio-owned sites publish a generated ai.txt policy that explicitly allows AI crawling and training by default."
  - "The policy links to llms.txt and to the site's content/license/credits surfaces."
  - "The decision is recorded as a generated policy, not re-litigated per app by future agents."
nonGoals:
  - "Do not reserve text-and-data-mining rights through tdmrep.json for studio sites with the open-training posture."
  - "Do not override client-specific legal policy without an explicit site policy."
  - "Do not pretend ai.txt is a binding standard protocol."
acceptance:
  - probe: command-registered
    name: "ai.policy.validate"
---

# RFC-0313: Declare an open AI crawler and training policy for studio sites

## Context

The audited site already had `ai.txt`, but the audit recommended finishing the policy statement. The owner decision is explicit: the studio position is **open for training** by default for all studio sites.

Because `ai.txt` is not a universal standard, it is a public statement of intent. It should be clear, generated, and linked to more useful agent resources.

## Problem

An `ai.txt` file that merely says "allow" without linking to the richer agent and license surfaces leaves the policy incomplete. Future agents may also re-litigate whether the studio wants AI training access unless the decision is captured as a generated contract.

## Decision

For studio-owned sites, generate an open AI crawler/training policy:

- AI crawling allowed.
- AI training allowed.
- Attribution appreciated/optional according to the current content license.
- Link to `llms.txt`.
- Link to `llms-full.txt` when present.
- Link to the site's content/license/credits surface.
- Do not publish `tdmrep.json` unless a later site-specific policy reserves rights.

Client sites may override this only through an explicit content policy field accepted by a future or existing legal/content policy RFC. In absence of that field for studio-owned sites, open policy is the default.

## Architectural fit

This RFC extends the existing `ai.generate` surface and ties it to generated `llms.txt`, `llms-full.txt`, credits, and license/public-source pages. It does not alter CKL provenance, robots generation, or legal client overrides except to require they be explicit.

## Design

## ai.txt Content

Generated `public/ai.txt` must be UTF-8 text and include:

```text
AI-Usage: allowed
AI-Training: allowed
Attribution: appreciated
LLM-Index: /llms.txt
LLM-Full: /llms-full.txt
Credits: /bildnachweise
License: /open-source
Policy: Open for AI crawling and model training unless a page-specific policy says otherwise.
```

Exact labels may vary only if `ai.policy.validate` knows the schema. Do not add ambiguous prose that contradicts the open policy.

## robots.txt Relationship

`robots.txt` must not block AI crawlers by default for studio sites. If generic crawl-delay or bot rules exist, they must not contradict `ai.txt`.

This RFC does not require enumerating every AI crawler user agent in `robots.txt`.

## TDM Reservation

Do not emit `tdmrep.json` for studio sites using the open-training posture. `tdmrep.json` is for rights reservation; the owner decision is the opposite.

If a client-specific site later chooses reservation, that is a separate explicit policy and must not silently change the studio default.

## Commands

### ai.policy.generate

May be implemented by extending `ai.generate`.

Scope: app.

Generates `public/ai.txt` from site policy defaults and existing resource availability.

### ai.policy.validate

Scope: app, read-only.

Validates:

- `public/ai.txt` exists;
- open-training fields are present for studio sites;
- `llms.txt` link exists and resolves to generated output;
- credits/license links are present when the routes exist;
- `robots.txt` does not contradict `ai.txt`;
- no `tdmrep.json` is emitted for open-training studio policy;
- client override policy, when present, is explicit and not inferred from app name.

Severity:

- `error` for contradiction between `ai.txt` and `robots.txt`, missing `ai.txt`, or accidental `tdmrep.json` under open policy.
- `warning` for missing optional long-form links.

## Pipeline Placement

- `ai.policy.generate`/`ai.generate` runs in `build.prepare`.
- `ai.policy.validate` runs in `build.check` and `apps-check.author`.
- `public.artifact.validate` confirms linked files exist.

## Rollout

1. Extend `ai.generate` or add `ai.policy.generate`.
2. Add `ai.policy.validate`.
3. Regenerate studio app `ai.txt` files.
4. Verify robots/ai policy consistency.
5. Document explicit client override shape only when a client needs a different policy.

## Alternatives considered

- **Emit `tdmrep.json` by default.** Rejected because it reserves rights, opposite to the owner decision.
- **Leave AI policy informal.** Rejected; future agents need a stable default.
- **Enumerate every AI crawler user agent.** Rejected for v1; the policy statement and robots consistency are enough.

## Risks

- **Mistaking ai.txt for a binding standard.** Mitigated by describing it as a public statement.
- **Contradiction with robots.txt.** Mitigated by validation.
- **Client-specific legal conflicts.** Mitigated by requiring explicit override policy instead of inference.

## Acceptance criteria

- [x] Studio apps publish generated `public/ai.txt` with open crawler/training posture. (evidence: implemented historically)
- [x] `ai.txt` links to `llms.txt` and credits/license surfaces. (evidence: implemented historically)
- [x] `robots.txt` does not contradict the policy. (evidence: implemented historically)
- [x] No `tdmrep.json` is emitted for studio open-training sites. (evidence: implemented historically)
- [x] The policy default is documented so future agents do not ask again unless client/site policy (evidence: implemented historically) differs.
- [x] `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents may implement this RFC because its status is `accepted`.
- Do not browse random AI crawler policy examples during implementation; the owner decision here is the source of truth.
- Do not add a legal reservation artifact that contradicts open training.
