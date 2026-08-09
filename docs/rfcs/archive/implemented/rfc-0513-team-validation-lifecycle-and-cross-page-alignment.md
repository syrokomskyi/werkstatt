---
id: RFC-0513
title: "Team validation, lifecycle, and cross-page alignment"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-24
updatedAt: 2026-07-24
implementedAt: 2026-07-24
enhancedAt: 2026-07-24
supersedes: []
supersededBy:
amends:
  - RFC-0073
  - RFC-0200
  - RFC-0509
amendedBy: []
related:
  - RFC-0008
  - RFC-0073
  - RFC-0200
  - RFC-0229
  - RFC-0478
  - RFC-0479
  - RFC-0480
  - RFC-0508
  - RFC-0509
  - RFC-0510
  - RFC-0511
  - RFC-0512
satisfies:
  - DNA-24
  - DNA-35
breaksC: false
versionBump: patch
commands:
  proposed:
    - team.lifecycle.validate
    - team.cross-page.validate
  added:
    - team.lifecycle.validate
    - team.cross-page.validate
  changed:
    - sites-check.author
    - sites-check.postbuild
    - content.voice.lint
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
successSignals:
  - "team.lifecycle.validate enforces status transitions (draft → active → on-leave/temporarily-unavailable → active → former/retired), review cadence (consent review every 12 months, AI-agent technical evaluation every 6 months), and CTA removal for former/retired participants."
  - "team.cross-page.validate enforces consistency between the team hub, profile pages, home page people section, and JSON endpoints — no orphan profiles, no broken links, no status mismatches."
  - "The home page people section (founder spotlight) shows only active, public human participants with consent — no draft, suspended, or former participants."
  - "The team hub and profile pages use consistent naming — the publicName on the hub matches the heading on the profile page."
  - "content.voice.lint checks that profile prose does not contain prohibited claims (guaranteed rankings, automatic conversion, AI infallibility) — profile-specific patterns are scoped to prose files matching the people collection slug pattern."
  - "Retired/former participants retain their profile pages but with CTA removed and a visible status badge."
  - "The navigation team entry and the team hub are always in sync — navigation points to the team page, not founder."
nonGoals:
  - "Does not define the Participant data model — that is RFC-0508."
  - "Does not define the team hub page — that is RFC-0509."
  - "Does not define profile page archetypes — that is RFC-0510 (human) and RFC-0511 (AI agent)."
  - "Does not define JSON endpoints or Schema.org — that is RFC-0512."
  - "Does not implement automated review reminders (email/Slack) — the validator warns at build time; the operator schedules reviews."
  - "Does not define a retirement workflow with data deletion — retired participants retain their records and pages; only the CTA and status badge change."
---

# RFC-0513: Team validation, lifecycle, and cross-page alignment

## Context

RFCs 0508–0512 define the Participant data model, team hub page, human and AI-agent profile archetypes, and JSON endpoints. This RFC closes the loop with **lifecycle validation** (status transitions, review cadence, CTA removal) and **cross-page alignment** (consistency between hub, profiles, home page, navigation, and JSON endpoints).

An external expert review (file 16.1, sections 8–10) identifies lifecycle and consistency risks: stale profiles after retirement, broken links between hub and profiles, mismatched names between hub cards and profile headings, and missing review dates.

## Problem

1. **No lifecycle enforcement.** The Participant status field (RFC-0508) has no transition rules. A participant can go from `active` to `former` without removing the CTA. A retired participant's profile page still shows a contact button. There is no review cadence check.

2. **No cross-page consistency.** The home page `people` section, the team hub, and the profile pages all read from the same people collection, but there is no validator checking that:
   - The hub lists all public, active participants
   - The home page spotlight shows only active, public humans with consent
   - The `publicName` on the hub matches the `name` on the profile page
   - The navigation `team` entry points to the team hub (not founder)

3. **No voice/lint checks for profile claims.** Profile prose may contain prohibited claims (guaranteed rankings, automatic conversion, AI infallibility). The existing `content.voice.lint` does not check profile-specific prohibited patterns.

4. **No status badge rendering.** Former and retired participants need a visible status badge on their profile page so visitors know the person is no longer active.

## Decision

### 1. Lifecycle validation (`team.lifecycle.validate`)

#### Status transition rules

```text
draft → active                    (publication)
active → on-leave                 (human: personal leave)
active → temporarily-unavailable  (all: short-term pause)
on-leave → active                 (return)
temporarily-unavailable → active  (resumption)
active → former                   (departure)
active → retired                  (formal retirement)
on-leave → former                 (departure while on leave)
on-leave → active                 (return from leave)
temporarily-unavailable → former  (departure while unavailable)
temporarily-unavailable → active  (resumption)
former → retired                  (formalization)
former → active                   (re-activation; rare)
retired → active                  (re-activation; rare)
any → suspended                    (under review)
suspended → active                (cleared)
suspended → former                (departed while suspended)
suspended → retired               (formalized retirement while suspended)
```

**Prohibited transitions:**

- `draft → former` (a draft cannot depart; it must be published first or deleted)
- `retired → on-leave` (a retired person does not go on leave)
- `former → on-leave` (a former member does not go on leave)

The validator checks the transition from the `lastReviewedAt` date and the current `status`. Since we don't store transition history, the validator checks the **current state** for consistency:

- A `former` or `retired` participant MUST NOT have a `cta` field
- A `suspended` participant MUST NOT appear on the team hub or home page
- A `draft` participant MUST NOT have `visibility: public`
- A `former` participant's profile page MUST render a "Former" status badge
- A `retired` participant's profile page MUST render a "Retired" status badge

#### Review cadence

| Participant type | Review field | Cadence | Warning threshold |
| --- | --- | --- | --- |
| Human | `consent.consentDate` | 12 months | Warn if older than 12 months |
| Human | `lastReviewedAt` | 12 months | Warn if older than 12 months |
| AI-agent | `aiAgent.technicalStand.lastEvaluatedAt` | 6 months | Warn if older than 6 months |
| AI-agent | `aiAgent.technicalStand.nextEvaluationAt` | — | Warn if in the past |
| All | `nextReviewAt` | — | Warn if in the past |

The validator warns (does not fail) when a review date is stale. The operator should update the review date after conducting a review.

#### CTA removal

`team.lifecycle.validate` fails when:

- A `former` or `retired` participant has a `cta` field
- A `suspended` participant has `visibility: public`

### 2. Cross-page alignment (`team.cross-page.validate`)

#### Hub ↔ Profile consistency

- Every public, active participant in the people collection appears on the team hub
- Every participant listed on the team hub has a resolvable profile URL
- The `publicName` on the hub card matches the `name` (human) or `publicName` (AI agent) on the profile page
- The `role` (human) or `purposeStatement` (AI agent) on the hub card matches the profile page hero subheading/tagline

#### Home page ↔ Profile consistency

- The home page `people` section (founder spotlight) shows only `participantType: human`, `visibility: public`, `status: active` participants with `consent.approvedFields` including `photo`
- The home page `people` section `select.slugs` references existing participants
- The home page does not show `former`, `retired`, `suspended`, or `draft` participants

#### Navigation ↔ Hub consistency

- The navigation has a `team` entry pointing to `pageId: team`
- The navigation does NOT have a `founder` entry (retired in RFC-0509)
- The `team` page exists in `system.md` with `semanticType: team-hub`

#### JSON ↔ HTML consistency

- Every participant in `/team/profiles.json` has a resolvable HTML profile page
- Every HTML profile page has a corresponding JSON endpoint
- The `status` in JSON matches the `status` rendered on the HTML page
- The `publicName` in JSON matches the heading on the HTML page

### 3. Voice/lint checks for profile prose

`content.voice.lint` is extended with profile-specific prohibited claims:

| Prohibited pattern | Context | Reason |
| --- | --- | --- |
| "garantierte Rankings" | profile prose | No ranking guarantees |
| "automatische Konvertierung" | profile prose | No automatic conversion claims |
| "fehlerfrei" | AI-agent profile prose | AI is not error-free |
| "100% genau" | any profile prose | No 100% accuracy claims |
| "autonom ohne menschliche Aufsicht" | AI-agent profile prose | All AI agents have accountable humans |

### 4. Status badge rendering

The profile page synthesis adds a status badge to the hero block for non-active participants:

| Status                    | Badge text (DE)               | Badge text (UK)       | Color   |
| ------------------------- | ----------------------------- | --------------------- | ------- |
| `former`                  | Ehemaliges Mitglied           | Колишній учасник      | muted   |
| `retired`                 | Im Ruhestand                  | На пенсії             | muted   |
| `on-leave`                | Beurlaubt                     | У відпустці           | info    |
| `temporarily-unavailable` | Vorübergehend nicht verfügbar | Тимчасово недоступний | info    |
| `suspended`               | Gesperrt                      | Призупинено           | warning |

The badge is rendered via the hero block's `tagline` prop (a top-level prop in the hero archetype, `hero-section.manifest.yaml`). `active` and `draft` participants do not have a badge.

## Architectural fit

- **RFC-0508:** The Participant data model provides `status`, `lastReviewedAt`, `nextReviewAt`, `consent.consentDate`, and `aiAgent.technicalStand` fields for lifecycle validation.
- **RFC-0509:** The team hub page is the canonical directory; `team.cross-page.validate` checks hub ↔ profile consistency.
- **RFC-0510/0511:** The profile page synthesis renders status badges via the hero `tagline` prop. Prose files use the file-based `contentRef` model (e.g. `prose/{slug}-beruflich`), not anchor-based references — file existence is already checked by `content.references.validate` (RFC-0073).
- **RFC-0512:** JSON endpoints are checked for consistency with HTML pages.
- **RFC-0073:** `content.voice.lint` is extended with profile-specific prohibited patterns scoped to prose files matching the people collection slug pattern.
- **RFC-0480:** `breaksC: false` — no external surface changes. This RFC adds validation and a hero `tagline` badge (non-breaking HTML addition within the existing hero archetype).
- **DNA-35:** `app.contract.full` runs all validators — `team.lifecycle.validate` joins `SITES_CHECK_AUTHOR_PIPELINE` and `team.cross-page.validate` joins `SITES_CHECK_POSTBUILD_PIPELINE` (JSON ↔ HTML requires built artifacts).

## Design

### CLI surface

```sh
# Validate lifecycle and cross-page consistency.
pnpm exec werkstatt run team.lifecycle.validate --site warpgogol-com --json
pnpm exec werkstatt run team.cross-page.validate --site warpgogol-com --json
```

### File system responsibilities

| Path | Edit |
| --- | --- |
| `packages/os/site-kernel-checks/src/team-lifecycle.ts` | New file: `team.lifecycle.validate` |
| `packages/os/site-kernel-checks/src/team-cross-page.ts` | New file: `team.cross-page.validate` |
| `packages/os/site-kernel-checks/src/content-voice.ts` | Extend with profile-specific prohibited patterns (scoped to prose files matching people slug pattern) |
| `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` | Register `team.lifecycle.validate` after `participant.ai-agent.validate` (line 174) |
| `packages/os/site-kernel-checks/src/pipelines/sites-check-postbuild.ts` | Register `team.cross-page.validate` after `participant.json.validate` (line 21) |
| `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts` | Register `team.lifecycle.validate` and `team.cross-page.validate` command entries |
| `packages/share/src/astro/page-handler/resolve-route.ts` | Add status badge to hero block `tagline` prop for non-active participants |

### team.lifecycle.validate output

```json
{
  "command": "team.lifecycle.validate",
  "status": "fail",
  "violations": [
    {
      "participant": "de/people/andrii-syrokomskyi",
      "rule": "cta-on-former",
      "message": "former participant has a cta field — remove cta for former/retired participants"
    },
    {
      "participant": "de/people/mira-ai-agent",
      "rule": "stale-technical-evaluation",
      "message": "aiAgent.technicalStand.lastEvaluatedAt is older than 6 months (2026-01-01)"
    }
  ],
  "warnings": [
    {
      "participant": "de/people/andrii-syrokomskyi",
      "rule": "consent-review-due",
      "message": "consent.consentDate is older than 12 months (2025-07-24) — schedule a consent review"
    }
  ]
}
```

### team.cross-page.validate output

```json
{
  "command": "team.cross-page.validate",
  "status": "fail",
  "violations": [
    {
      "rule": "hub-missing-participant",
      "message": "Participant 'mira' (ai-agent, public, active) is not listed on the team hub"
    },
    {
      "rule": "home-page-suspended",
      "message": "Home page people section includes suspended participant 'john-doe'"
    },
    {
      "rule": "navigation-founder-remnant",
      "message": "Navigation still has a 'founder' entry — replace with 'team'"
    }
  ]
}
```

### Status badge in hero block

```ts
// packages/share/src/astro/page-handler/resolve-route.ts
function buildHeroWithBadge(participant: ParticipantView, lang: string): BlockSpec {
  const badge = statusBadge(participant.status, lang);
  return {
    id: "hero",
    type: "hero",
    props: {
      header: {
        heading: participant.publicName,
        subheading: participant.role ?? participant.aiAgent?.purposeStatement,
        level: 1,
      },
      ...(badge ? { tagline: badge } : {}),
      // ...
    },
  };
}

function statusBadge(status: string, lang: string): string | undefined {
  const badges: Record<string, Record<string, string>> = {
    former: { de: "Ehemaliges Mitglied", uk: "Колишній учасник" },
    retired: { de: "Im Ruhestand", uk: "На пенсії" },
    "on-leave": { de: "Beurlaubt", uk: "У відпустці" },
    "temporarily-unavailable": { de: "Vorübergehend nicht verfügbar", uk: "Тимчасово недоступний" },
    suspended: { de: "Gesperrt", uk: "Призупинено" },
  };
  return badges[status]?.[lang];
}
```

### Failure modes

| Validator | Rule | Severity | Condition |
| --- | --- | --- | --- |
| `team.lifecycle.validate` | `cta-on-former` | error | `former` or `retired` participant has a `cta` field |
| `team.lifecycle.validate` | `public-draft` | error | `draft` participant has `visibility: public` |
| `team.lifecycle.validate` | `public-suspended` | error | `suspended` participant has `visibility: public` |
| `team.lifecycle.validate` | `consent-review-due` | warning | `consent.consentDate` older than 12 months |
| `team.lifecycle.validate` | `profile-review-due` | warning | `lastReviewedAt` older than 12 months |
| `team.lifecycle.validate` | `stale-technical-evaluation` | warning | `aiAgent.technicalStand.lastEvaluatedAt` older than 6 months |
| `team.lifecycle.validate` | `next-review-past` | warning | `nextReviewAt` is in the past |
| `team.lifecycle.validate` | `next-evaluation-past` | warning | `aiAgent.technicalStand.nextEvaluationAt` is in the past |
| `team.cross-page.validate` | `hub-missing-participant` | error | public, active participant not listed on team hub |
| `team.cross-page.validate` | `hub-orphan-profile` | warning | profile listed on hub but participant is not public/active |
| `team.cross-page.validate` | `name-mismatch` | error | `publicName` on hub card ≠ `name` on profile page |
| `team.cross-page.validate` | `home-page-suspended` | error | home page people section includes suspended/draft/former participant |
| `team.cross-page.validate` | `navigation-founder-remnant` | error | navigation still has a `founder` entry |
| `team.cross-page.validate` | `json-html-status-mismatch` | error | `status` in JSON ≠ `status` on HTML page |
| `team.cross-page.validate` | `json-html-name-mismatch` | error | `publicName` in JSON ≠ heading on HTML page |
| `team.cross-page.validate` | `json-missing-html` | error | participant in `profiles.json` has no resolvable HTML page |
| `team.cross-page.validate` | `html-missing-json` | error | HTML profile page has no corresponding JSON endpoint |

Both validators exit 0 (no-op pass) when the site has no people records or no team hub page.

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/team-lifecycle.ts
export async function runTeamLifecycleValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<TeamLifecycleData>>;

interface TeamLifecycleData {
  violations: TeamLifecycleViolation[];
  warnings: TeamLifecycleWarning[];
}

interface TeamLifecycleViolation {
  participant: string;
  rule: string;
  message: string;
}

interface TeamLifecycleWarning {
  participant: string;
  rule: string;
  message: string;
}
```

```ts
// packages/os/site-kernel-checks/src/team-cross-page.ts
export async function runTeamCrossPageValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<TeamCrossPageData>>;

interface TeamCrossPageData {
  violations: TeamCrossPageViolation[];
  warnings: TeamCrossPageWarning[];
}
```

## Rollout

- **Phase 0 — Validators.** Ship `team.lifecycle.validate` (joins `SITES_CHECK_AUTHOR_PIPELINE`) and `team.cross-page.validate` (joins `SITES_CHECK_POSTBUILD_PIPELINE`). Extend `content.voice.lint` with profile-specific prohibited patterns.
- **Phase 1 — Status badges.** Add status badge rendering to the hero block `tagline` prop in `resolve-route.ts`.
- **Phase 2 — Content alignment.** Fix any violations found by the validators (e.g. remove CTA from former participants, update stale review dates).

## Alternatives considered

- **Store transition history.** Rejected — the current state is sufficient for validation. Transition history would add complexity without clear value. The `lastReviewedAt` date tracks the last review, not the transition.
- **Automated email reminders for reviews.** Rejected — the validator warns at build time. Automated email is an operational concern, not an architectural one.
- **Delete retired participant records.** Rejected — retired participants retain their profile pages for organizational memory. The CTA is removed and a badge is shown.

## Risks

- **Validator false positives.** The cross-page validator may flag legitimate edge cases (e.g. a participant who is public but intentionally not listed on the hub). Mitigated by making the hub listing check a warning, not a failure, when the participant has `visibility: public` but is not in any hub `select`.
- **Stale review dates.** The validator warns but does not fail on stale review dates. The operator is responsible for scheduling reviews.
- **Behavior snapshot drift.** Adding a `tagline` badge to the hero block changes the rendered HTML of profile pages for non-active participants. `behavior.snapshot.validate` (in `SITES_CHECK_POSTBUILD_PIPELINE`) will diff against the previous build. Since `breaksC: false`, the C-surface contract is not affected, but the HTML diff will be non-empty for profile pages. The behavior snapshot must be regenerated after Phase 1 deployment.
- **Postbuild false positives from stale dist.** `team.cross-page.validate` runs in `SITES_CHECK_POSTBUILD_PIPELINE` and reads `dist/` artifacts. A stale `dist/` (from a previous build) could cause false positives. Mitigated by the existing `sites-check.postbuild` guard that fails fast when `dist/` is missing.
- **Performance.** Both validators scan the people collection (typically 1–20 participants). `team.lifecycle.validate` reads frontmatter only. `team.cross-page.validate` reads the team hub page, home page, navigation, and JSON endpoints from `dist/`. File I/O is negligible at this scale.
- **Empty state.** Both validators no-op pass (exit 0, no diagnostics) when the site has no people records or no team hub page, following the convention of `participant.validate` and `team.hub.validate`.

## Acceptance criteria

- [x] `team.lifecycle.validate` enforces: no CTA for former/retired, no public visibility for draft/suspended, status badge presence for non-active. (evidence: packages/os/site-kernel-checks/src/team-lifecycle.ts:97-180, packages/os/site-kernel-checks/src/tests/team-lifecycle.test.ts)
- [x] `team.lifecycle.validate` warns on stale consent dates (>12 months), stale technical evaluations (>6 months), and past `nextReviewAt`. (evidence: packages/os/site-kernel-checks/src/team-lifecycle.ts:182-230, packages/os/site-kernel-checks/src/tests/team-lifecycle.test.ts)
- [x] `team.cross-page.validate` enforces: hub lists all public active participants, home page shows only active public humans with consent, navigation has `team` (not `founder`). (evidence: packages/os/site-kernel-checks/src/team-cross-page.ts:120-200, packages/os/site-kernel-checks/src/tests/team-cross-page.test.ts)
- [x] `team.cross-page.validate` enforces: JSON endpoints match HTML pages (status, publicName). (evidence: packages/os/site-kernel-checks/src/team-cross-page.ts:202-250)
- [x] `content.voice.lint` checks profile-specific prohibited patterns scoped to profile prose files. (evidence: packages/os/site-kernel-checks/src/content-voice.ts:259-309)
- [x] Status badges render in the hero block `tagline` for `former`, `retired`, `on-leave`, `temporarily-unavailable`, and `suspended` participants. (evidence: packages/share/src/astro/page-handler/resolve-route.ts:94-110, packages/share/src/astro/page-handler/resolve-route.ts:140, packages/share/src/astro/page-handler/resolve-route.ts:300)
- [x] `team.lifecycle.validate` is registered in `SITES_CHECK_AUTHOR_PIPELINE` and `team.cross-page.validate` is registered in `SITES_CHECK_POSTBUILD_PIPELINE`; both pass on the current content. (evidence: packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts:176, packages/os/site-kernel-checks/src/pipelines/sites-check-postbuild.ts:23)
- [x] `rfc.validate` passes on this file before merging. (evidence: pnpm exec werkstatt run rfc.validate --json → 0 RFC-0513 errors)

## Implementation notes for agents

- Agents MUST remove `cta` from any participant before setting `status: former` or `status: retired`.
- Agents MUST set `visibility: private` before setting `status: draft` or `status: suspended`.
- Agents MUST update `lastReviewedAt` after conducting a profile review.
- Agents MUST update `aiAgent.technicalStand.lastEvaluatedAt` after conducting an AI-agent technical evaluation.
- Agents MUST NOT list `suspended` or `draft` participants on the team hub or home page.
- Agents MUST ensure the home page `people` section `select` only includes active, public human participants with consent for `photo`.
- Agents MUST use the hero `tagline` prop (not `header.eyebrow`) for the status badge — the hero archetype does not have an `eyebrow` field.
