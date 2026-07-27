---
id: RFC-0503
title: "Ratgeber editorial policy page and article status workflow"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-23
updatedAt: 2026-07-23
enhancedAt: 2026-07-23
implementedAt: 2026-07-23
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0500
amendedBy: []
related:
  - RFC-0193
  - RFC-0325
  - RFC-0478
  - RFC-0479
  - RFC-0480
  - RFC-0500
  - RFC-0501
  - RFC-0502
satisfies:
  - DNA-16
  - DNA-24
  - DNA-53
breaksC: true
versionBump: minor
commands:
  proposed:
    - ratgeber.policy.validate
  added:
    - ratgeber.policy.validate
  changed: []
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - "@gogol/ontology"
  - "@gogol/site-kernel-checks"
successSignals:
  - "The /ratgeber/redaktion/ page (DE) and /porady/redaktsiya/ page (UK) render an editorial policy page with editorial standards, review cadence, author profiles, and source policy."
  - "The editorial policy page is a static page — not a surface-generated page. It lives at src/content/prose/{lang}/ratgeber-redaktion.md."
  - "Article status workflow has three states: draft → review-required → published. Transitions are manual via frontmatter edits."
  - "ratgeber.policy.validate checks that the editorial policy page exists and contains required sections."
  - "The hub links to the editorial policy page in the 'So arbeitet die Redaktion' block (RFC-0500)."
  - "Articles with status: draft or review-required are excluded from the sitemap, feed, and surface artifact (RFC-0500 statusGate)."
nonGoals:
  - "Does not create an automated review workflow tool — status transitions are manual frontmatter edits."
  - "Does not create a CMS or editing interface — authors edit markdown files directly."
  - "Does not add the editorial policy page as a surface-generated page — it is a static prose page."
  - "Does not change the article collection schema — that is RFC-0500."
  - "Does not change surface.validate or surface.contract.validate code — the url-schema.yaml extension is C-contract documentation only; surface.contract.validate reads it dynamically and the editorial policy page is authored (not in surface.generated.json)."
---

# RFC-0503: Ratgeber editorial policy page and article status workflow

## Context

RFC-0500 introduced the `status` field on article records (`draft`, `review-required`, `published`) and reserved the `redaktion` slug. This RFC defines the editorial policy page at `/ratgeber/redaktion/` and the article status workflow.

## Problem

1. **No editorial policy page.** Readers cannot see how the ratgeber is produced — editorial standards, review cadence, author qualifications, or source policy. The expert requires a public editorial policy page that establishes trust.

2. **No status workflow.** RFC-0500 introduced the `status` field but did not define the workflow — how articles move between states, who is responsible, and what triggers transitions.

3. **No policy validation.** There is no validator that checks the editorial policy page exists and contains the required sections.

## Decision

### Editorial policy page

A static prose page at `src/content/prose/{lang}/ratgeber-redaktion.md` rendered at:

- DE: `/ratgeber/redaktion/`
- UK: `/porady/redaktsiya/`

The page is registered in the site's `system.md` as a static page — not as a surface-generated page. It uses the standard page layout with markdown blocks.

### Page registration in system.md

The editorial policy page follows the same registration pattern as other static pages (e.g. `legalNotice`). The `system.md` `pages[]` array gains an entry:

```yaml
- pageId: ratgeber-redaktion
  semanticType: about
  routes:
    de: ratgeber/redaktion
    uk: porady/redaktsiya
  cosmicStar: Polaris
  planets:
    - { cosmicPlanet: Hyperion, pin: "1.0.0" }
```

The `cosmicStar: Polaris` is drawn from the `StarCatalog` (DNA-23) — the same star used for other static informational pages (`legalNotice`, `cosmic/passport`, `cosmic/starMap`).

A page entry at `src/content/pages/{lang}/ratgeber-redaktion.md` (frontmatter-only, DNA-24) declares `blocks[]` with a single `markdown` block referencing the prose file via `contentRef`:

```yaml
kind: page
cosmicStar: Polaris
title: "Redaktion"
description: "So arbeitet die Ratgeber-Redaktion"
lang: de
blocks:
  - type: markdown
    props:
      contentRef: ratgeber-redaktion
      heading: "Redaktion"
```

The prose file at `src/content/prose/{lang}/ratgeber-redaktion.md` contains the editorial policy content with the required H2 sections.

### Required sections

The editorial policy page must contain these sections:

| # | Section heading (DE) | Section heading (UK) | Content |
| --- | --- | --- | --- |
| 1 | `## Redaktionsstandards` | `## Редакційні стандарти` | Editorial standards: no commercial result claims, factual claims must be sourced, articles must follow the 10-section structure |
| 2 | `## Prüfrhythmus` | `## Ритм перевірки` | Review cadence: articles are reviewed at least quarterly; review date is shown on every article |
| 3 | `## Autoren` | `## Автори` | Author profiles: name, role, background, contact link |
| 4 | `## Quellenpolitik` | `## Політика джерел` | Source policy: which sources are used, how they are verified, how often they are checked |
| 5 | `## Kontakt` | `## Контакти` | Contact information for editorial questions |

**Heading matching:** Section headings must appear as H2 (`##`) in the prose markdown. Heading matching is trimmed (leading/trailing whitespace ignored) and does not accept trailing attributes (e.g. `## Redaktionsstandards {#standards}` fails — the heading must be exactly `## Redaktionsstandards`). H3 (`###`) and deeper subsections within an H2 section are permitted and do not affect the ordering check — only H2 headings are matched against the required list. This follows the same matching convention as RFC-0501.

**Language mirroring (DNA-11):** The policy page must exist in all supported languages. If the page exists for DE but not for UK, `ratgeber.policy.validate` emits RG-POL-01 for the missing language.

### Article status workflow

```
draft → review-required → published
```

| Status | Meaning | Visible on site? | In sitemap? | In feed? |
| --- | --- | --- | --- | --- |
| `draft` | Work in progress, incomplete | No | No | No |
| `review-required` | Complete, awaiting editorial review | No | No | No |
| `published` | Reviewed and published | Yes | Yes | Yes |

Transitions are manual — an editor changes the `status` field in the article frontmatter. There is no automated workflow tool.

**Transition rules:**

- `draft → review-required`: article must have all 10 mandatory sections (RFC-0501). `ratgeber.article.validate` warns about incomplete draft articles but does not block.
- `review-required → published`: article must pass `ratgeber.article.validate` (word count, sections, type-specific requirements) and `ratgeber.provenance.validate` (author and sources resolve).
- `published → review-required`: triggered when a quarterly review finds outdated content or when a source divergence is reported.

### Review cadence

Every published article has a `reviewedAt` date. The editorial policy is:

- Articles are reviewed at least every 3 months.
- When `reviewedAt` is more than 3 months old, `ratgeber.policy.validate` emits a warning (non-blocking).
- When a source divergence is reported (CKL-SRC-03 from RFC-0214), the article should be moved to `review-required` and the claim updated.

### Hub link

The ratgeber hub's "So arbeitet die Redaktion" block (RFC-0500) links to the editorial policy page. The link text is "Mehr zur Redaktion" (DE) / "Докладніше про редакцію" (UK).

The current `bakeRatgeberHub` implementation (`packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-hub.ts`) defines `redaktionLink` in `HUB_LABELS` but never uses it — the block is emitted as `md(hlbl.redaktion, hlbl.redaktionBody)` which only sets `heading` and `lead`, with no link. The baker must be updated to include the link to the policy page. The link text must be updated to match this RFC ("Mehr zur Redaktion" / "Докладніше про редакцію"), replacing the current unused labels ("Mehr zur redaktionellen Arbeit" / "Дізнатися більше про редакційну роботу").

The link is emitted by appending a `ctaBlock` after the `md` block, or by including an inline markdown link in the `lead` text if the markdown section component supports it. The exact mechanism is an implementation detail for the plan step — the requirement is that the hub renders a visible link to `/ratgeber/redaktion/` (DE) / `/porady/redaktsiya/` (UK) within or adjacent to the "So arbeitet die Redaktion" block.

## Architectural fit

- **RFC-0500:** amends — defines the editorial policy page that the hub links to and the status workflow that the statusGate enforces.
- **RFC-0478:** `versionBump: minor` — new validator and static page are Breaks-B.
- **RFC-0480:** `breaksC: true` — new URL `/ratgeber/redaktion/` is an external surface change (new URL in the sitemap). The url-schema.yaml extension is C-contract documentation — `surface.contract.validate` reads url-schema dynamically and does not need code changes. Authored pages are not in `surface.generated.json`; they are validated by `page.block.validate` and `system.manifest.validate`.
- **DNA-16** (semantic layer shares topology with navigation): The editorial policy page is registered in `system.md` `pages[]` with explicit `routes` per language. It appears in the route registry via `getRouteRegistry()` and is included in the sitemap. JSON-LD is `WebPage` (or `AboutPage`) — no special semantic type. DNA-16 is satisfied because the page's semantic output is derived from the same route topology as navigation.
- **DNA-24** (block-declarative pages): The page entry at `src/content/pages/{lang}/ratgeber-redaktion.md` is frontmatter-only with `blocks[]` referencing the prose file via `contentRef`. No markdown body in the page entry. DNA-24 is satisfied.
- **DNA-53** (semantic fingerprint governance): The new validator and static page change the semantic hash. `versionBump: minor` is declared, so the hash change is expected and governed.

## Design

### CLI surface

```sh
pnpm exec site-kernel run ratgeber.policy.validate --site webgogol-com --json
```

Site-scoped, runs in `build.check`.

Exit codes: `0` = pass (no errors, warnings allowed), `1` = error (at least one RG-POL-01/02/04/05 violation), `2` = warning-only (RG-POL-03 only).

`--json` output follows the standard `KernelCommandResult<CheckResult>` shape:

```json
{
  "commandName": "ratgeber.policy.validate",
  "ok": true,
  "data": {
    "command": "ratgeber.policy.validate",
    "status": "pass",
    "diagnostics": [
      {
        "ruleId": "RG-POL-02",
        "severity": "error",
        "file": "src/content/prose/de/ratgeber-redaktion.md",
        "message": "Policy page missing required section '## Quellenpolitik'",
        "fixHint": "Add an H2 heading '## Quellenpolitik' to the policy page."
      }
    ]
  },
  "exitCode": 0
}
```

### TypeScript contracts

```ts
const REQUIRED_SECTIONS_DE = [
  "## Redaktionsstandards",
  "## Prüfrhythmus",
  "## Autoren",
  "## Quellenpolitik",
  "## Kontakt",
];

const REQUIRED_SECTIONS_UK = [
  "## Редакційні стандарти",
  "## Ритм перевірки",
  "## Автори",
  "## Політика джерел",
  "## Контакти",
];

const REVIEW_CADENCE_MONTHS = 3;
```

### Failure modes

| Rule        | Severity | Description                                                        |
| ----------- | -------- | ------------------------------------------------------------------ |
| `RG-POL-01` | error    | Editorial policy page does not exist                               |
| `RG-POL-02` | error    | Policy page missing a required section                             |
| `RG-POL-03` | warning  | Published article `reviewedAt` older than 3 months                 |
| `RG-POL-04` | error    | Article with `status: published` fails `ratgeber.article.validate` |
| `RG-POL-05` | error    | Article with `status: review-required` appears in surface artifact |

**RG-POL-04 and RG-POL-05 overlap with existing validators:** RG-POL-04 re-checks that published articles pass `ratgeber.article.validate` (RFC-0501). RG-POL-05 re-checks that non-published articles are excluded from the surface artifact (RFC-0500 `RG-HUB-06`). `ratgeber.policy.validate` delegates to these validators by invoking them and collecting their results, rather than duplicating the check logic. This ensures a single policy validation command gives operators a complete picture without re-running each validator separately.

### Edge cases

- **No policy page exists:** RG-POL-01 fires for each missing language.
- **Policy page exists but has no H2 headings:** RG-POL-02 fires for each missing required section.
- **Policy page exists for DE but not for UK:** RG-POL-01 fires for UK. DNA-11 (language mirroring) requires the page in all supported languages.
- **No published articles:** RG-POL-03 does not fire (no articles to check `reviewedAt` on). RG-POL-04 and RG-POL-05 do not fire (no articles to check).
- **Article has no `reviewedAt` field:** RG-POL-03 does not fire — `reviewedAt` is a required field on published articles (RFC-0500), so `ratgeber.hub.validate` RG-HUB-08 catches this first. `ratgeber.policy.validate` skips articles without `reviewedAt` to avoid duplicate reporting.

### File system responsibilities

| Path | Role |
| --- | --- |
| `src/content/prose/de/ratgeber-redaktion.md` | New: DE editorial policy page prose |
| `src/content/prose/uk/ratgeber-redaktion.md` | New: UK editorial policy page prose |
| `src/content/pages/de/ratgeber-redaktion.md` | New: DE page entry (frontmatter-only, DNA-24) |
| `src/content/pages/uk/ratgeber-redaktion.md` | New: UK page entry (frontmatter-only, DNA-24) |
| `packages/os/site-kernel-checks/src/ratgeber-policy-validate.ts` | New: validator |
| `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-hub.ts` | Updated: link to policy page |
| `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts` | Updated: register `ratgeber.policy.validate` command entry |
| `packages/ontology/src/external-surfaces/url-schema.yaml` | Extended: `/ratgeber/redaktion/` route pattern |
| `docs/verification-plan.xml` | Add check |
| `docs/COMMANDS.md` | Add command |
| `docs/requirements.xml` | Update: new static page, policy validator |
| `docs/technology.xml` | Update: new validator file |
| `docs/knowledge-graph.xml` | Update: RFC-0503 relationships |
| `packages/os/site-kernel-checks/AGENTS.md` | Update: document `ratgeber-policy-validate.ts` module |

## Rollout

1. Create `src/content/prose/{lang}/ratgeber-redaktion.md` with required sections.
2. Create `src/content/pages/{lang}/ratgeber-redaktion.md` page entries (frontmatter-only, DNA-24).
3. Register the static page in the site's `system.md` with `cosmicStar: Polaris` and language-keyed routes.
4. Implement `ratgeber.policy.validate`.
5. Update `bakeRatgeberHub` to emit a link to the policy page with the correct link text.
6. Add `/ratgeber/redaktion/` route pattern to `url-schema.yaml` (C-contract documentation).
7. Register command in the check module command table (`09b-build-artifacts-part2.ts`).
8. Update `amendedBy` on RFC-0500 to include RFC-0503.
9. Compass sync: update `docs/verification-plan.xml`, `docs/COMMANDS.md`, `docs/requirements.xml`, `docs/technology.xml`, `docs/knowledge-graph.xml`, `packages/os/site-kernel-checks/AGENTS.md`.
10. Run `ratgeber.policy.validate --site webgogol-com`.

## Alternatives considered

1. **Extend `ratgeber.hub.validate` instead of creating a new command.** Rejected: `ratgeber.hub.validate` validates the surface artifact (`surface.generated.yaml`) — JSON-LD types, hub layout, card fields. The policy page validation reads prose markdown files and checks for required H2 sections, which is a different I/O pattern and a different concern (content structure vs. surface artifact). Mixing both in one command would blur the boundary between artifact validation and content validation, following the same separation rationale as RFC-0501.

2. **Make the editorial policy page a surface-generated page.** Rejected: the policy page is a single static page per language, not a data-driven collection. Surface generation is for multi-record, axis-driven pages. A static prose page registered in `system.md` is the correct mechanism.

3. **Skip the url-schema.yaml extension.** Rejected: `breaksC: true` is declared because the new URL enters the sitemap. The C-contract should document the URL even if `surface.contract.validate` does not check authored pages. Omitting it would leave the contract incomplete.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| **Policy page content requires human authoring** | Medium | The editorial policy prose (standards, review cadence, author profiles, source policy) is editorial content. An agent may draft the structure, but the operator should review the prose. Implementation notes state this boundary. |
| **Hub link mechanism changes hub layout** | Low | The `ratgeber.hub.validate` RG-HUB-02 check enforces the hub block structure. Adding a link within the existing `md` block or as a `ctaBlock` must not break RG-HUB-02. |
| **RG-POL-04/05 overlap causes duplicate diagnostics** | Low | `ratgeber.policy.validate` delegates to existing validators rather than re-running checks. If delegation is not possible, the overlap is documented and operators can suppress duplicates. |
| **Section heading false positives** | Low | Heading matching is trimmed and documented (same convention as RFC-0501). H3 subsections are allowed within H2 sections. |

## Implementation notes for agents

- **Agents MUST NOT implement this RFC until it has status `accepted`.** Draft RFCs are proposals, not authorizations.
- **Agents MAY draft the editorial policy page prose** (section headings and placeholder content). The operator MUST review the prose before publication. The policy page is editorial standards content, not factual claims — it does not require the human-review barrier of RFC-0502 claim sidecars.
- **Agents MUST update `amendedBy` on RFC-0500** to include RFC-0503.
- **Agents MUST update `packages/os/site-kernel-checks/AGENTS.md`** to document the new `ratgeber-policy-validate.ts` module.
- **Agents MUST update the `bakeRatgeberHub` link text** to match this RFC ("Mehr zur Redaktion" / "Докладніше про редакцію"), replacing the current unused `redaktionLink` labels.
- **The `ratgeber.policy.validate` command delegates RG-POL-04 to `ratgeber.article.validate` and RG-POL-05 to `ratgeber.hub.validate`** rather than duplicating the check logic. If delegation is not feasible at implementation time, the validator may re-check and the overlap is documented.
- When implementing, reference RFC-0503 in commit messages.

## Acceptance criteria

- [x] `/ratgeber/redaktion/` (DE) and `/porady/redaktsiya/` (UK) render the editorial policy page. (evidence: `missions/webgogol-com-m000010/workpiece/src/content/pages/de/ratgeber-redaktion.md`, `src/content/pages/uk/ratgeber-redaktion.md`, `src/content/system.md:470-478`)
- [x] Policy page contains all 5 required H2 sections in both DE and UK. (evidence: `missions/webgogol-com-m000010/workpiece/src/content/prose/de/ratgeber-redaktion.md`, `src/content/prose/uk/ratgeber-redaktion.md`, `packages/os/site-kernel-checks/src/ratgeber-policy-validate.ts` RG-POL-02)
- [x] Page entries exist at `src/content/pages/{lang}/ratgeber-redaktion.md` (frontmatter-only, DNA-24). (evidence: `missions/webgogol-com-m000010/workpiece/src/content/pages/de/ratgeber-redaktion.md`, `src/content/pages/uk/ratgeber-redaktion.md`)
- [x] Page is registered in `system.md` with `cosmicStar: Polaris` and language-keyed routes. (evidence: `missions/webgogol-com-m000010/workpiece/src/content/system.md:470-478`)
- [x] Hub links to the policy page in the "So arbeitet die Redaktion" block with link text "Mehr zur Redaktion" (DE) / "Докладніше про редакцію" (UK). (evidence: `packages/os/site-kernel-checks/src/surface-expand/bake-ratgeber-hub.ts:62,72,190-193`)
- [x] `ratgeber.policy.validate` passes on `webgogol-com`. (evidence: `packages/os/site-kernel-checks/src/ratgeber-policy-validate.ts`, `pnpm --filter @gogol/site-kernel-checks run build:check` passes)
- [x] No `review-required` article appears in the surface artifact. (evidence: `packages/os/site-kernel-checks/src/ratgeber-policy-validate.ts` RG-POL-05)
- [x] `rfc.validate` passes. (evidence: `pnpm exec site-kernel run rfc.validate RFC-0503` — 0 violations, 0 warnings)
