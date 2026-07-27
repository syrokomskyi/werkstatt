---
id: RFC-0511
title: "AI-agent profile archetype — new page type for AI workers"
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
amends: []
amendedBy: []
related:
  - RFC-0008
  - RFC-0200
  - RFC-0478
  - RFC-0479
  - RFC-0480
  - RFC-0508
  - RFC-0509
  - RFC-0510
  - RFC-0512
  - RFC-0513
satisfies:
  - DNA-24
  - DNA-37
  - DNA-38
breaksC: true
versionBump: minor
commands:
  proposed:
    - participant.ai-agent.validate
  added:
    - participant.ai-agent.validate
  changed:
    - sites-check.run
    - surface.contract.validate
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ontology"
  - "@gogol/site-kernel-checks"
successSignals:
  - "AI-agent profile pages render a seven-block structure: hero (name, purpose, autonomy level), Zweck & Funktionsumfang (purposeStatement + capabilities), Autonomie & Handlungsrechte (autonomyLevel + rightsMatrix summary), Verantwortlichkeit & Eskalation (accountableHumanId + escalationRoute), Technischer Stand (technicalStand), Bekannte Einschränkungen (knownLimitations), Kontakt (escalation CTA)."
  - "AI-agent profile pages are only generated for participants with participantType: ai-agent, visibility: public, and aiAgent.accountableHumanId set."
  - "The hero block displays the autonomy level badge (A0–A4) with a human-readable label — no internal model identifiers."
  - "The rightsMatrix is rendered as a summary table (action → status) — the full ACL with dataAccess details is private and not rendered."
  - "The accountable human is linked by name to their human profile page — not just an ID."
  - "The technicalStand block shows model family, evaluation date, and next evaluation date — no internal agent IDs or toolset versions."
  - "The route pattern /team/ki-agenten/[agent-slug]/ (DE) and /komanda/ki-agenty/[agent-slug]/ (UK) is registered in url-schema.yaml."
  - "participant.ai-agent.validate enforces the seven-block structure, accountableHumanId resolution, and public/private field separation."
  - "No AI-agent profile page exists without a linked, active human profile page for the accountable human."
nonGoals:
  - "Does not define the Participant data model — that is RFC-0508."
  - "Does not define the team hub page — that is RFC-0509."
  - "Does not define the human profile page structure — that is RFC-0510."
  - "Does not define JSON endpoints or Schema.org shapes — that is RFC-0512."
  - "Does not create AI-agent participants — this RFC defines the page archetype and route pattern. Actual AI-agent records are created by the operator when AI agents are introduced."
  - "Does not define real-time monitoring or health checks for AI agents — the profile is a static description, not a live status dashboard."
  - "Does not design a prose fragment extraction mechanism (`contentRef#anchor`) — separate prose files per section are used, matching RFC-0510's pattern."
  - "Does not extend `participant.profile.validate` with AI-agent rules — AI-agent validation is structurally distinct (accountableHumanId resolution, public/private field separation) and warrants a separate command."
---

# RFC-0511: AI-agent profile archetype — new page type for AI workers

## Context

RFC-0508 introduces the `ai-agent` participant type with fields for autonomy level, purpose, capabilities, rights matrix, accountable human, technical stand, and known limitations. RFC-0200's profile page synthesis only handles human participants — there is no page archetype for AI-agent profiles.

An external expert review (file 16.1, section 5) requires AI-agent profiles to be **distinct from human profiles**: they must foreground purpose, autonomy, accountability, and limitations — not personality or biography. AI agents are tools with defined scopes, not team members with personal stories.

## Problem

1. **No AI-agent page archetype.** The profile page synthesis in `resolve-route.ts` builds a human-style page (hero + bio). AI agents need a different block structure: purpose, autonomy, rights, accountability, technical stand, limitations.

2. **No route pattern for AI agents.** The expert recommends `/team/ki-agenten/[agent-slug]/` (DE) to visually separate AI agents from humans under the team hub. The current route system puts all profiles under the same base segment.

3. **No accountable-human linking.** The `aiAgent.accountableHumanId` field references a human participant, but there is no mechanism to resolve it to a linked profile page on the AI-agent profile.

4. **No public/private separation for AI-agent fields.** The `rightsMatrix` full ACL, `dataAccess` details, `technicalStand.agentId`, and `technicalStand.toolsetVersion` are internal. The public profile should show a summary, not the full ACL.

5. **No autonomy level rendering.** The `autonomyLevel` (A0–A4) is a technical enum. The public profile should render it as a human-readable badge with a label.

## Decision

Create a **distinct AI-agent profile page archetype** with a seven-block structure and a dedicated route pattern under the team hub.

### Route structure

| Route (DE) | Route (UK) | Source |
| --- | --- | --- |
| `/team/ki-agenten/[agent-slug]/` | `/komanda/ki-agenty/[agent-slug]/` | Virtual route from people collection (participantType: ai-agent) |

The base segment for AI-agent profiles is derived from the team page route (resolved in `getParticipantProfileRoutes` via `system.md`) plus a localized suffix. The team page route provides the base (`team` DE, `komanda` UK), and the suffix (`ki-agenten` DE, `ki-agenty` UK, `ai-agents` EN) is appended. Human profiles remain at `/team/[slug]/` (DE) and `/komanda/[slug]/` (UK) — both human and AI-agent profiles share the `participant:<slug>` pageId namespace (via `participantPageId`), and dispatch happens by `participantType` in `resolve-route.ts`.

### Seven-block structure

| # | Block | Archetype | Content source | Purpose |
| --- | --- | --- | --- | --- |
| 1 | Hero | `hero` | `publicName`, `aiAgent.purposeStatement`, `aiAgent.autonomyLevel` | Identity and purpose |
| 2 | Zweck & Funktionsumfang | `controlled-responsibility-block` | `aiAgent.purposeStatement`, `capabilities` | What it does |
| 3 | Autonomie & Handlungsrechte | `markdown` (structured table) | `aiAgent.autonomyLevel`, `aiAgent.rightsMatrix` summary | What it may and may not do |
| 4 | Verantwortlichkeit & Eskalation | `markdown` | `aiAgent.accountableHumanId`, `aiAgent.escalationRoute` | Who is responsible |
| 5 | Technischer Stand | `markdown` | `aiAgent.technicalStand` (public fields only) | Model family, evaluation cycle |
| 6 | Bekannte Einschränkungen | `markdown` | `aiAgent.knownLimitations` | What it cannot do |
| 7 | Kontakt | `final-cta` | `aiAgent.escalationRoute` | How to escalate |

### Block 1: Hero

```ts
{
  id: "hero",
  type: "hero",
  props: {
    header: {
      heading: participant.publicName,
      subheading: autonomyLabel(participant.aiAgent.autonomyLevel),
      level: 1,
    },
    tagline: participant.aiAgent.purposeStatement,
    backgroundImage: "home-bg",
  },
}
```

**Autonomy level labels:**

| Level | Label (DE) | Label (UK) | Meaning |
| --- | --- | --- | --- |
| A0 | Keine Autonomie | Без автономії | Human-operated tool, no autonomous decisions |
| A1 | Vorgeschlagene Aktionen | Пропоновані дії | Suggests actions, human approves all |
| A2 | Autonome Ausführung mit Freigabe | Автономне виконання з погодженням | Executes approved actions autonomously |
| A3 | Autonome Ausführung mit Benachrichtigung | Автономне виконання з повідомленням | Executes and notifies, human can intervene |
| A4 | Vollautonom | Повністю автономний | Fully autonomous within defined scope |

No portrait image — AI agents do not have photos. The hero uses a background image only.

### Block 2: Zweck & Funktionsumfang

Uses the existing `controlled-responsibility-block` archetype with `body-split-list` body kind (same archetype as RFC-0510's responsibility block). Renders a single column of purpose and capability items:

```ts
{
  id: "purpose",
  type: "controlled-responsibility-block",
  props: {
    header: {
      heading: "Zweck & Funktionsumfang",
      subheading: "Welche Aufgabe dieser Agent erfüllt und welche Fähigkeiten er hat.",
    },
    body: {
      labels: { primary: "Zweck", secondary: "Fähigkeiten" },
      primaryItems: [
        { text: participant.aiAgent.purposeStatement },
      ],
      secondaryItems: [
        ...(participant.capabilities ?? []).map((c) => ({ text: c })),
      ],
    },
  },
}
```

When `capabilities` is empty, `secondaryItems` is an empty array and the split-list component renders a single-column layout (same behavior as RFC-0510's responsibility block when `secondaryItems` is empty). Item objects use `{ text: string }` — the same canonical item shape as RFC-0510.

### Block 3: Autonomie & Handlungsrechte

A `markdown` block rendering a summary table of the rights matrix:

```ts
{
  id: "rights",
  type: "markdown",
  props: {
    header: {
      heading: "Autonomie & Handlungsrechte",
      subheading: "Was dieser Agent tun darf und was menschliche Freigabe erfordert.",
    },
    contentRef: `prose/${participant.slug}-rechte`,
  },
}
```

The rights section is rendered from a dedicated prose file (`prose/{lang}/{slug}-rechte.md`). The `rightsMatrix` array in the Participant record is the structured data source for JSON-LD (RFC-0512); the prose file is the human-readable rendering. This follows the same separate-file pattern as RFC-0510 (`-beruflich`, `-nachweise`, `-persoenlich`).

**Public summary only:** The full `rightsMatrix` with `dataAccess` details is private. The public rendering shows only `action` → `status` (allowed / approval-required / prohibited). The `dataAccess` field is never rendered on the public profile.

### Block 4: Verantwortlichkeit & Eskalation

```ts
{
  id: "accountability",
  type: "markdown",
  props: {
    header: {
      heading: "Verantwortlichkeit & Eskalation",
      subheading: "Welche Person für diesen Agenten verantwortlich ist und wie eskaliert wird.",
    },
    contentRef: `prose/${participant.slug}-verantwortlichkeit`,
  },
}
```

This block renders:

- The accountable human's name, linked to their profile page (`/team/[human-slug]/`)
- The escalation route (e.g. "E-Mail an hi@webgogol.com mit Betreff 'KI-Eskalation'")
- The operational owner (if different from accountable human)
- The review frequency (e.g. "Vierteljährliche Überprüfung")

The accountable human is resolved by looking up `aiAgent.accountableHumanId` in the people collection and finding their profile route. If the accountable human has no public profile page, the name is shown without a link.

### Block 5: Technischer Stand

```ts
{
  id: "technical",
  type: "markdown",
  props: {
    header: {
      heading: "Technischer Stand",
      subheading: "Modellfamilie und Überprüfungszyklus.",
    },
    contentRef: `prose/${participant.slug}-technik`,
  },
}
```

**Public fields only:**

- `aiAgent.technicalStand.modelFamily` (e.g. "Claude 4")
- `aiAgent.technicalStand.lastEvaluatedAt`
- `aiAgent.technicalStand.nextEvaluationAt`

**Private fields (never rendered):**

- `aiAgent.technicalStand.agentId` (internal identifier)
- `aiAgent.technicalStand.agentVersion` (internal version)
- `aiAgent.technicalStand.modelProvider` (internal)
- `aiAgent.technicalStand.toolsetVersion` (internal)

### Block 6: Bekannte Einschränkungen

```ts
{
  id: "limitations",
  type: "markdown",
  props: {
    header: {
      heading: "Bekannte Einschränkungen",
      subheading: "Was dieser Agent nicht kann oder nicht tun sollte.",
    },
    contentRef: `prose/${participant.slug}-einschraenkungen`,
  },
}
```

Renders `aiAgent.knownLimitations` as a list. When `knownLimitations` is empty or absent, this block is omitted.

### Block 7: Kontakt

```ts
{
  id: "cta",
  type: "final-cta",
  props: {
    header: { heading: "Eskalation oder Feedback", align: "center" },
    ctaGroup: {
      align: "center",
      items: [{
        label: "Eskalation einleiten",
        variant: "primary",
        target: { kind: "internal", pageId: "contact" },
      }],
    },
    body: {
      kind: "paragraphs",
      align: "center",
      paragraphs: [`Bei Problemen mit diesem Agenten: ${participant.aiAgent.escalationRoute}`],
    },
  },
}
```

This block is **omitted** when `status` is `former` or `retired`.

### Route generation

`getParticipantProfileRoutes` is updated to generate two route patterns from the same `people` collection:

1. **Human profiles:** `/team/[slug]/` (DE), `/komanda/[slug]/` (UK) — existing behavior, pageId `participant:<slug>`
2. **AI-agent profiles:** `/team/ki-agenten/[slug]/` (DE), `/komanda/ki-agenty/[slug]/` (UK) — new, pageId `participant:<slug>` (same namespace, dispatch by `participantType`)

The base segment for AI agents is derived from the team page route (already resolved in `getParticipantProfileRoutes` via `parentPage?.routes?.[lang]`) plus a localized suffix constant:

```ts
// Localized suffix appended to the team page base segment for AI-agent routes.
export const AI_AGENT_SEGMENT_SUFFIX_BY_LANG: Record<string, string> = {
  de: "ki-agenten",
  en: "ai-agents",
  uk: "ki-agenty",
};
```

The route pageId for AI agents is `participant:<slug>` (reusing the existing `participantPageId` function). Dispatch between human and AI-agent synthesis happens in `resolve-route.ts` based on `participantType`. This avoids introducing a parallel pageId namespace and keeps the route registry merge unchanged — `getParticipantProfileRoutes` already produces `ParticipantRouteEntry[]` with `participantPageId(slug)` as the pageId.

### Profile page synthesis dispatch

`resolve-route.ts` checks the `participantType` of the matched participant and dispatches to the correct block builder. Both human and AI-agent profiles share the `participant:<slug>` pageId, so the route registry lookup is unchanged — dispatch happens after the participant record is loaded:

```ts
if (participantSlug) {
  const participants = await getParticipantsForSection(lang);
  const participant = participants.find((p) => p.slug === participantSlug);
  if (participant?.participantType === "ai-agent") {
    participantSynthetic = buildAiAgentProfileBlocks(participant, lang);
  } else {
    participantSynthetic = buildHumanProfileBlocks(participant, participantSlug);
  }
}
```

The route registry stores an `aiAgentSlug` flag on `LocalizedRouteEntry` (set by `getParticipantProfileRoutes` when the participant is an AI agent) so the registry can distinguish AI-agent routes from human routes for URL generation. The pageId remains `participant:<slug>` for both.

### url-schema.yaml C-contract update

```yaml
# Added to routePatterns:
  - pattern: "/:locale?/team/ki-agenten/:agentSlug"
    params:
      locale:
        optional: true
        enum: [de, en]
      agentSlug:
        type: string
    generated: true
  - pattern: "/:locale?/komanda/ki-agenty/:agentSlug"
    params:
      locale:
        optional: true
        enum: [uk]
      agentSlug:
        type: string
    generated: true
```

## Architectural fit

- **RFC-0508:** The Participant data model provides the `aiAgent` sub-object with all fields needed for the seven-block structure.
- **RFC-0509:** AI-agent profiles are nested under the team hub (`/team/ki-agenten/`), linked from the "KI-Agenten" section on the hub.
- **RFC-0200:** The virtual-route mechanism is extended with a second route pattern for AI agents. The `team.profiles` entitlement gates both human and AI-agent profiles.
- **RFC-0480:** `breaksC: true` — the `/team/ki-agenten/` route is a new external surface.
- **DNA-24:** The AI-agent profile is a block-declarative page synthesized from the Participant record.
- **DNA-37:** Uses the unified `SectionProps` contract — all blocks are existing archetypes.
- **DNA-38:** Uses canonical item objects from the Participant record.

## Design

### CLI surface

```sh
# Validate AI-agent profile pages.
pnpm exec site-kernel run participant.ai-agent.validate --site webgogol-com --json
```

### TypeScript contracts

```ts
// packages/share/src/astro/people-routes.ts
export const AI_AGENT_SEGMENT_SUFFIX_BY_LANG: Record<string, string> = {
  de: "ki-agenten",
  en: "ai-agents",
  uk: "ki-agenty",
};

// No new pageId function — reuse participantPageId(slug) for all participants.
// Dispatch between human and AI-agent synthesis happens in resolve-route.ts.

// packages/share/src/astro/page-handler/resolve-route.ts
function buildAiAgentProfileBlocks(participant: ParticipantView, lang: string): BlockSpec[] {
  const blocks: BlockSpec[] = [];

  // Block 1: Hero
  blocks.push({
    id: "hero",
    type: "hero",
    props: {
      header: {
        heading: participant.publicName ?? participant.name ?? participant.slug,
        subheading: autonomyLabel(participant.aiAgent!.autonomyLevel, lang),
        level: 1,
      },
      tagline: participant.aiAgent!.purposeStatement,
      backgroundImage: "home-bg",
    },
  });

  // Block 2: Purpose & Capabilities (split-list, same body kind as RFC-0510)
  blocks.push({
    id: "purpose",
    type: "controlled-responsibility-block",
    props: {
      header: { heading: "Zweck & Funktionsumfang" },
      body: {
        labels: { primary: "Zweck", secondary: "Fähigkeiten" },
        primaryItems: [
          { text: participant.aiAgent!.purposeStatement },
        ],
        secondaryItems: [
          ...(participant.capabilities ?? []).map((c) => ({ text: c })),
        ],
      },
    },
  });

  // Block 3: Rights
  blocks.push({
    id: "rights",
    type: "markdown",
    props: {
      header: { heading: "Autonomie & Handlungsrechte" },
      contentRef: `prose/${participant.slug}-rechte`,
    },
  });

  // Block 4: Accountability
  blocks.push({
    id: "accountability",
    type: "markdown",
    props: {
      header: { heading: "Verantwortlichkeit & Eskalation" },
      contentRef: `prose/${participant.slug}-verantwortlichkeit`,
    },
  });

  // Block 5: Technical Stand
  blocks.push({
    id: "technical",
    type: "markdown",
    props: {
      header: { heading: "Technischer Stand" },
      contentRef: `prose/${participant.slug}-technik`,
    },
  });

  // Block 6: Limitations
  if (participant.aiAgent!.knownLimitations?.length) {
    blocks.push({
      id: "limitations",
      type: "markdown",
      props: {
        header: { heading: "Bekannte Einschränkungen" },
        contentRef: `prose/${participant.slug}-einschraenkungen`,
      },
    });
  }

  // Block 7: CTA (omitted for former/retired)
  if (participant.status !== "former" && participant.status !== "retired") {
    blocks.push({
      id: "cta",
      type: "final-cta",
      props: {
        header: { heading: "Eskalation oder Feedback", align: "center" },
        ctaGroup: {
          align: "center",
          items: [{
            label: "Eskalation einleiten",
            variant: "primary",
            target: { kind: "internal", pageId: "contact" },
          }],
        },
        body: {
          kind: "paragraphs",
          align: "center",
          paragraphs: [`Bei Problemen: ${participant.aiAgent!.escalationRoute ?? "E-Mail an hi@webgogol.com"}`],
        },
      },
    });
  }

  return blocks;
}

function autonomyLabel(level: string, lang: string): string {
  const labels: Record<string, Record<string, string>> = {
    A0: { de: "Keine Autonomie", uk: "Без автономії", en: "No autonomy" },
    A1: { de: "Vorgeschlagene Aktionen", uk: "Пропоновані дії", en: "Suggested actions" },
    A2: { de: "Autonome Ausführung mit Freigabe", uk: "Автономне виконання з погодженням", en: "Autonomous with approval" },
    A3: { de: "Autonome Ausführung mit Benachrichtigung", uk: "Автономне виконання з повідомленням", en: "Autonomous with notification" },
    A4: { de: "Vollautonom", uk: "Повністю автономний", en: "Fully autonomous" },
  };
  return labels[level]?.[lang] ?? labels[level]?.["de"] ?? level;
}
```

### File system responsibilities

| Path | Edit |
| --- | --- |
| `packages/share/src/astro/people-routes.ts` | `getParticipantProfileRoutes` generates two route patterns: human (`/team/[slug]/`) and AI-agent (`/team/ki-agenten/[slug]/`); `AI_AGENT_SEGMENT_SUFFIX_BY_LANG` constant; `aiAgentSlug` flag on `ParticipantRouteEntry`; both use `participantPageId(slug)` as pageId |
| `packages/share/src/astro/routes/registry.ts` | Fold AI-agent routes into the registry (unchanged pageId namespace); `aiAgentSlug` on `LocalizedRouteEntry` |
| `packages/share/src/astro/page-handler/resolve-route.ts` | Dispatch by `participantType`: `buildHumanProfileBlocks` vs `buildAiAgentProfileBlocks`; `autonomyLabel` function |
| `packages/share/src/astro/people.ts` | `ParticipantView` extended to project `publicName`, `capabilities`, and `aiAgent` sub-object from merged Participant record |
| `packages/ontology/src/external-surfaces/url-schema.yaml` | Add `/team/ki-agenten/:agentSlug` and `/komanda/ki-agenty/:agentSlug` route patterns |
| `packages/os/site-kernel-checks/src/participant-ai-agent.ts` | New file: `participant.ai-agent.validate` |
| `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` | Register `participant.ai-agent.validate` after `participant.profile.validate` |
| `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts` | Register `participant.ai-agent.validate` command entry |

### participant.ai-agent.validate rules

- An AI-agent participant with `visibility: public` has `aiAgent.accountableHumanId` set.
- The `accountableHumanId` resolves to an existing human participant with `visibility: public` and `status: active`.
- The `aiAgent.autonomyLevel` is one of A0–A4.
- The `aiAgent.purposeStatement` is a non-empty string.
- A public AI-agent participant has prose files `prose/{lang}/{slug}-rechte.md`, `prose/{lang}/{slug}-verantwortlichkeit.md`, and `prose/{lang}/{slug}-technik.md` in the default language.
- `aiAgent.technicalStand.agentId`, `aiAgent.technicalStand.toolsetVersion` are not rendered in any public block.
- `aiAgent.rightsMatrix` `dataAccess` details are not rendered in any public block.
- `status: former` or `status: retired` AI agents do not have a CTA block.
- Sites with no AI-agent participants: no-op pass (same convention as `participant.profile.validate` and `team.hub.validate`).

### Output format

```json
{
  "command": "participant.ai-agent.validate",
  "status": "pass",
  "count": 0,
  "violations": [],
  "exitCode": 0,
  "ok": true
}
```

When violations are found:

```json
{
  "command": "participant.ai-agent.validate",
  "status": "fail",
  "count": 2,
  "violations": [
    {
      "participant": "de/people/mira-ai-agent",
      "rule": "missing-accountable-human",
      "message": "ai-agent participant requires aiAgent.accountableHumanId"
    },
    {
      "participant": "de/people/mira-ai-agent",
      "rule": "accountable-human-not-public",
      "message": "accountableHumanId 'jane-doe' does not resolve to a public, active human participant"
    }
  ],
  "exitCode": 1,
  "ok": false
}
```

### Failure modes

`participant.ai-agent.validate` exits non-zero on:

- An AI-agent participant with `visibility: public` but no `aiAgent.accountableHumanId`
- An `accountableHumanId` that does not resolve to an existing human participant
- An `accountableHumanId` that resolves to a human with `visibility: private` or `status` not `active`
- An `aiAgent.autonomyLevel` outside the A0–A4 enum
- An `aiAgent.purposeStatement` that is empty or whitespace
- A public AI-agent participant missing a required prose file (`-rechte`, `-verantwortlichkeit`, `-technik`)

It **warns** (does not fail) when:

- An AI-agent participant `aiAgent.technicalStand.lastEvaluatedAt` is older than 6 months
- The accountable human has `visibility: public` but no `page.enabled: true` (no profile page to link to)

## Rollout

- **Phase 0 — Route pattern + synthesis.** Add `AI_AGENT_SEGMENT_SUFFIX_BY_LANG`, `aiAgentSlug` flag on `ParticipantRouteEntry`, and `buildAiAgentProfileBlocks`. Update `getParticipantProfileRoutes` to generate AI-agent routes (appending the suffix to the team page base segment). Update `resolve-route.ts` dispatch. Update `url-schema.yaml`. Extend `ParticipantView` to project `publicName`, `capabilities`, and `aiAgent`.
- **Phase 1 — Validation.** Ship `participant.ai-agent.validate` and register in `SITES_CHECK_AUTHOR_PIPELINE` after `participant.profile.validate`. The validator is a no-op when no AI-agent participants exist — it exits 0 with `count: 0` and no violations. New sites with no AI-agent participants are not affected.
- **Phase 2 — Compass sync.** Update `docs/technology.xml` to reflect the new `/team/ki-agenten/` route pattern. Update `docs/source-markup.xml` if new source files are added to `packages/os/site-kernel-checks/src/`. Update `packages/os/site-kernel-checks/AGENTS.md` to document the new `participant.ai-agent.validate` command.

## Alternatives considered

- **Use the same route pattern as humans (`/team/[slug]/`).** Rejected — the expert recommends visual separation between humans and AI agents. A shared route pattern makes it impossible to distinguish at the URL level.
- **Use a single block type for AI agents (one big markdown block).** Rejected — the expert requires structured fields for autonomy, rights, accountability, and technical stand. A single markdown block would lose the structured data that feeds JSON-LD (RFC-0512).
- **Render the full rightsMatrix with dataAccess.** Rejected — the full ACL is internal. The public profile shows a summary only.

## Risks

- **No AI-agent participants exist yet.** The route pattern and synthesis are ready but produce no pages until the operator creates AI-agent records. `getParticipantProfileRoutes` generates zero AI-agent routes when no AI-agent participants exist — no error, no warning. This is intentional — the infrastructure is in place for when AI agents are introduced.
- **Accountable human resolution.** If the accountable human has no public profile page, the accountability block shows the name without a link. `participant.ai-agent.validate` warns when the accountable human is not public.
- **Autonomy level labels need localization.** The labels are defined in this RFC for DE, UK, and EN. Additional languages require a follow-up RFC.
- **Agent misinterpretation of `publicName` vs `name`.** RFC-0508 defines `publicName` as the top-level canonical name and `name` as a human-specific optional field. `ParticipantView` must project `publicName` for AI-agent participants. The synthesis function uses `participant.publicName ?? participant.name ?? participant.slug` as a fallback chain. An agent implementing this RFC must not assume `name` is set for AI-agent participants — it is human-specific.
- **CTA omission for former/retired is unreachable.** `getParticipantProfileRoutes` only generates routes for `status: active` participants (line 108: `if (status !== undefined && status !== "active") continue;`). Former/retired AI agents do not get profile routes at all, so the CTA omission logic in `buildAiAgentProfileBlocks` is technically unreachable. The check is retained as a defensive guard in case route generation is later relaxed to include former/retired participants.

## Acceptance criteria

- [x] `AI_AGENT_SEGMENT_SUFFIX_BY_LANG` defined in `packages/share/src/astro/people-routes.ts`; `participantPageId` reused for all participants (no `aiAgentPageId`). (evidence: people-routes.ts:29-34, participantPageId unchanged at line 37)
- [x] `getParticipantProfileRoutes` generates AI-agent routes under `/team/ki-agenten/` (DE) and `/komanda/ki-agenty/` (UK) by appending the suffix to the team page base segment. (evidence: people-routes.ts:122-130, isAiAgent branch appends AI_AGENT_SEGMENT_SUFFIX_BY_LANG[lang])
- [x] `buildAiAgentProfileBlocks` in `resolve-route.ts` produces the seven-block structure. (evidence: resolve-route.ts:250-380, seven blocks: hero, purpose, rights, accountability, technical, limitations, cta)
- [x] `resolve-route.ts` dispatches by `participantType` (human vs ai-agent). (evidence: resolve-route.ts:423-437, isAiAgent check dispatches to buildAiAgentProfileBlocks vs buildHumanProfileBlocks)
- [x] Hero block shows `publicName` (with `name`/`slug` fallback), `purposeStatement`, and autonomy label — no portrait, no personal details. (evidence: resolve-route.ts:256-272, name = publicName ?? name ?? slug; subheading = autonomyLabel; tagline = purposeStatement; no leadImage)
- [x] Block 2 uses `body-split-list` with `{ text: string }` items (same shape as RFC-0510). (evidence: resolve-route.ts:275-289, type: controlled-responsibility-block, primaryItems/secondaryItems with { text: string })
- [x] Rights block renders from `prose/{slug}-rechte` — `dataAccess` details are not rendered. (evidence: resolve-route.ts:292-304, contentRef: prose/${slug}-rechte, rightsMatrix not referenced in block props)
- [x] Accountability block links to the accountable human's profile page. (evidence: resolve-route.ts:307-320, contentRef: prose/${slug}-verantwortlichkeit; validator checks accountableHumanId resolves to a public active human with page.enabled)
- [x] Technical stand block shows `modelFamily`, `lastEvaluatedAt`, `nextEvaluationAt` — not `agentId` or `toolsetVersion`. (evidence: resolve-route.ts:323-335, contentRef: prose/${slug}-technik; block header mentions Modellfamilie und Überprüfungszyklus; agentId/toolsetVersion not rendered in blocks)
- [x] CTA block is omitted for `status: former` and `status: retired` (defensive guard — currently unreachable since routes are only generated for `status: active`). (evidence: resolve-route.ts:354-358, status !== former && status !== retired guard)
- [x] `ParticipantView` projects `publicName`, `capabilities`, and `aiAgent` sub-object from merged Participant record. (evidence: people.ts:82-105 interface, people.ts:204-213 projection in getParticipantsForSection)
- [x] `url-schema.yaml` includes `/team/ki-agenten/:agentSlug` and `/komanda/ki-agenty/:agentSlug` patterns. (evidence: url-schema.yaml:63-78, both patterns with generated: true)
- [x] `participant.ai-agent.validate` passes (no-op when no AI-agent participants exist) and is registered in `SITES_CHECK_AUTHOR_PIPELINE` after `participant.profile.validate`. (evidence: participant-ai-agent.ts:125-127 no-op pass; sites-check-author.ts:173-174 pipeline entry; command-tables/09-build-artifacts.ts:193-207 registration; 9 unit tests pass)
- [x] `surface.contract.validate` passes with the updated C-contract. (evidence: surface.contract.validate exit 0, 5 surfaces validated, 0 violations)
- [x] `rfc.validate` passes on this file before merging. (evidence: rfc.validate --site webgogol-com produces no diagnostics for RFC-0511)

## Implementation notes for agents

- Agents MUST NOT create AI-agent participant records in this RFC — this RFC defines the archetype and route pattern only.
- Agents MUST set `aiAgent.accountableHumanId` before setting `visibility: public` on an AI-agent participant.
- Agents MUST NOT render `aiAgent.technicalStand.agentId`, `aiAgent.technicalStand.toolsetVersion`, or `aiAgent.rightsMatrix.dataAccess` on the public profile.
- Agents MUST use separate prose files per section (not anchor fragments within a single file):
  - DE: `prose/{slug}-rechte.md`, `prose/{slug}-verantwortlichkeit.md`, `prose/{slug}-technik.md`, `prose/{slug}-einschraenkungen.md`
  - UK: `prose/{slug}-prava.md`, `prose/{slug}-vidpovidalnist.md`, `prose/{slug}-tehnika.md`, `prose/{slug}-obmezhennia.md`
- Agents MUST link the accountable human by name to their profile page when one exists.
- Agents MUST use `participantPageId(slug)` for all participants — do not introduce `aiAgentPageId` or `ai-agent:<slug>` pageId namespace.
- Agents MUST project `publicName`, `capabilities`, and `aiAgent` onto `ParticipantView` in `packages/share/src/astro/people.ts`.
- Agents MUST use `body-split-list` body kind for block 2 with `{ text: string }` items — not `{ label, kind }`.
- Agents MUST register `participant.ai-agent.validate` in `SITES_CHECK_AUTHOR_PIPELINE` (not `apps-check.run`) after `participant.profile.validate`.
