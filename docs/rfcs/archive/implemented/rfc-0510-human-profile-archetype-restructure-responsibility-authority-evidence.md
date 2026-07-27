---
id: RFC-0510
title: "Human profile archetype restructure — responsibility, authority, evidence-based career"
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
  - RFC-0200
amendedBy: []
related:
  - RFC-0008
  - RFC-0152
  - RFC-0200
  - RFC-0229
  - RFC-0478
  - RFC-0479
  - RFC-0480
  - RFC-0508
  - RFC-0509
  - RFC-0511
  - RFC-0512
  - RFC-0513
satisfies:
  - DNA-24
  - DNA-37
  - DNA-38
breaksC: false
versionBump: patch
commands:
  proposed:
    - participant.profile.validate
  added:
    - participant.profile.validate
  changed:
    - sites-check.run
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Human profile pages render a six-block structure: hero (name, role, location, portrait), Verantwortung & Entscheidungsbefugnis (responsibility + authority), Nachweise & Beiträge (prose evidence file), Beruflicher Werdegang (prose career file), Persönlicher Hintergrund (prose personal file, consent-gated), Kontakt (cta)."
  - "The hero block shows name, role, location (city-level only), and portrait — no birth year, no personal background in the hero."
  - "Personal background (birth year, family medical history, refugee journey, personal losses) is moved to a separate prose file and gated by consent.approvedFields."
  - "The responsibility block renders structured list items from `responsibility.summary`/`responsibility.scope` (primary column) and `authority.canSignFor`/`authority.canCommitTo` (secondary column) — not freeform text."
  - "The evidence block renders from a dedicated prose file (`prose/{slug}-nachweise`) with labeled links and evidence status labels — no unverified claims presented as fact."
  - "The profile page emits Person + BreadcrumbList JSON-LD (see RFC-0512)."
  - "The profile page breadcrumb trail is Home → Team → <Person> (parentPageId: team)."
  - "participant.profile.validate enforces the six-block structure, consent-gated fields, and prose file presence."
  - "Andrii's profile is restructured: professional identity in hero, personal story in separate prose file with consent, evidence links (Zenodo index, LinkedIn, marathon result, Komoot tour) in evidence prose file."
nonGoals:
  - "Does not define the Participant data model — that is RFC-0508."
  - "Does not define the team hub page — that is RFC-0509."
  - "Does not define the AI-agent profile page — that is RFC-0511."
  - "Does not define JSON endpoints or Schema.org shapes — that is RFC-0512."
  - "Does not create a separate editorial route for the personal story — the personal prose file is rendered as a block on the profile page, not a separate page."
  - "Does not add new block types — uses existing archetypes (hero, controlled-responsibility-block, markdown, final-cta)."
  - "Does not add `evidenceRefs` or `contributionRefs` arrays to the Participant schema — the existing `evidence` object (claims + disclosures, RFC-0508) is the structured data source for JSON-LD (RFC-0512); the profile page renders evidence from a prose file."
  - "Does not design a prose fragment extraction mechanism (`contentRef#anchor`) — separate prose files per section are used instead."
---

# RFC-0510: Human profile archetype restructure — responsibility, authority, evidence-based career

## Context

RFC-0200 synthesizes human profile pages from Person records with a two-block structure: a hero block (name, role, photo, statement, stats, CTA) and a markdown block (prose bio). The hero mixes professional identity with personal details (statement includes birth year, refugee status). The prose bio is a single unstructured block with no separation between professional career and personal story.

An external expert review (file 16.1, sections 2–3) identifies this as a systemic problem: the profile page should foreground **responsibility, authority, and evidence** — not personal biography. Personal details should be gated by consent and presented in a dedicated section, not mixed into the hero.

## Problem

1. **Hero mixes professional and personal.** The hero `description` (statement) includes "Jahrgang 1977", "Seit 2022 in Backnang", and refugee context. These are personal details that should not be in the first screen. The expert requires the hero to show name, role, location (city only), and portrait — nothing else.

2. **No responsibility/authority section.** The profile page has no structured section for responsibilities and decision authority. The `role` field is a job title string, not a list of responsibilities. The expert requires a structured "Verantwortung & Entscheidungsbefugnis" section.

3. **No evidence section.** The profile page links to evidence (Zenodo index, LinkedIn, marathon result, Komoot tour) only in the prose bio, mixed with personal narrative. The expert requires a structured "Nachweise & Beiträge" section with labeled links and evidence status.

4. **No consent-gated personal section.** The prose bio contains sensitive personal details (father's illness, refugee journey, living with criminals, personal loss) with no consent gate. The expert requires personal background to be in a clearly labeled section, gated by `consent.approvedFields`.

5. **Breadcrumb parent is wrong.** The profile page breadcrumb parent is currently the `about` page (`ratgeber-redaktion`). With the team hub (RFC-0509), the parent should be the `team` page.

## Decision

Restructure the human profile page synthesis from a two-block layout to a **six-block layout**:

| # | Block | Archetype | Content source | Purpose |
| --- | --- | --- | --- | --- |
| 1 | Hero | `hero` | `name`, `role`, `location` (city), `photo` | Professional identity only |
| 2 | Verantwortung & Entscheidungsbefugnis | `controlled-responsibility-block` | `responsibility` (summary, scope), `authority` (canSignFor, canCommitTo) | Structured responsibility and authority |
| 3 | Nachweise & Beiträge | `markdown` | `prose/{lang}/{slug}-nachweise` | Evidence links with status labels |
| 4 | Beruflicher Werdegang | `markdown` | `prose/{lang}/{slug}-beruflich` | Professional career prose |
| 5 | Persönlicher Hintergrund | `markdown` | `prose/{lang}/{slug}-persoenlich` | Personal story, consent-gated |
| 6 | Kontakt | `final-cta` | `cta` | Contact CTA (omitted for `status: former`/`retired`) |

### Block 1: Hero (professional identity only)

```ts
{
  id: "hero",
  type: "hero",
  props: {
    header: {
      heading: participant.name,
      subheading: participant.role,
      level: 1,
    },
    leadImage: participant.photo ? { src: participant.photo, alt: participant.name } : undefined,
    tagline: participant.location, // city-level only
    backgroundImage: "home-bg",
  },
}
```

**Removed from hero:** `statement` (moved to prose bio), `stats` (moved to evidence block or removed), `cta` (moved to block 6).

### Block 2: Verantwortung & Entscheidungsbefugnis

Uses the existing `controlled-responsibility-block` archetype (cosmic name: Calypso, body kind: `split-list`). Renders two columns:

- **Primary column (Verantwortung)** — items from `responsibility.summary` and `responsibility.scope` (if present)
- **Secondary column (Entscheidungsbefugnis)** — items from `authority.canSignFor[]` and `authority.canCommitTo[]`

```ts
{
  id: "responsibility",
  type: "controlled-responsibility-block",
  props: {
    header: {
      heading: "Verantwortung & Entscheidungsbefugnis",
      subheading: "Für diese Entscheidungen und Ergebnisse trage ich persönlich.",
    },
    body: {
      labels: { primary: "Verantwortung", secondary: "Entscheidungsbefugnis" },
      primaryItems: [
        ...(participant.responsibility?.summary
          ? [{ text: participant.responsibility.summary }]
          : []),
        ...(participant.responsibility?.scope
          ? [{ text: participant.responsibility.scope }]
          : []),
      ],
      secondaryItems: [
        ...(participant.authority?.canSignFor ?? []).map((s) => ({ text: s })),
        ...(participant.authority?.canCommitTo ?? []).map((c) => ({ text: c })),
      ],
    },
  },
}
```

When `responsibility` and `authority` are both absent, this block is omitted. When only one is present, the corresponding column is rendered and the other is empty (the split-list component renders a single-column layout when `secondaryItems` is empty).

### Block 3: Nachweise & Beiträge

A `markdown` block that renders a dedicated prose file containing evidence and contribution links:

```ts
{
  id: "evidence",
  type: "markdown",
  props: {
    header: {
      heading: "Nachweise & Beiträge",
      subheading: "Belegte Ergebnisse und öffentlich zugängliche Arbeiten.",
    },
    contentRef: `prose/${slug}-nachweise`,
    hideSectionNumber: true,
    pageId: participantPageId(slug),
  },
}
```

The evidence prose file (`prose/{lang}/{slug}-nachweise.md`) contains a markdown list of evidence links with status labels. This keeps the evidence list editable as markdown while being clearly separated from the career narrative. The `evidence` object in the Participant record (`evidence.claims`, `evidence.disclosures`, RFC-0508) is the structured data source for JSON-LD (RFC-0512); the prose file is the human-readable rendering.

Evidence status labels (prose convention, written by the author next to each link):

| Status | Label (DE) | Label (UK) | Meaning |
| --- | --- | --- | --- |
| verified | Verifiziert | Перевірено | Independently verifiable (public URL, third-party source) |
| claimed | Behauptet | Заявлено | Self-claimed, not independently verified |
| unverified | Ungeprüft | Неперевірено | Not yet checked |

When the evidence prose file does not exist, this block is omitted.

### Block 4: Beruflicher Werdegang

A `markdown` block rendering the professional career prose from a dedicated prose file:

```ts
{
  id: "career",
  type: "markdown",
  props: {
    header: {
      heading: "Beruflicher Werdegang",
    },
    contentRef: `prose/${slug}-beruflich`,
    hideSectionNumber: true,
    pageId: participantPageId(slug),
  },
}
```

The career prose file (`prose/{lang}/{slug}-beruflich.md`) contains the professional career narrative. The existing single prose file (`prose/{lang}/{slug}.md`) is replaced by three separate files: `-beruflich`, `-nachweise`, `-persoenlich`.

### Block 5: Persönlicher Hintergrund (consent-gated)

```ts
{
  id: "personal",
  type: "markdown",
  props: {
    header: {
      heading: "Persönlicher Hintergrund",
      subheading: "Private Einblicke, die ich freiwillig teile.",
    },
    contentRef: `prose/${slug}-persoenlich`,
    hideSectionNumber: true,
    pageId: participantPageId(slug),
  },
}
```

This block is **only rendered** when `consent.approvedFields` includes `bio` and the personal prose file (`prose/{lang}/{slug}-persoenlich.md`) exists. When consent is absent or does not include `bio`, the block is omitted entirely — no heading, no empty state. The prose file may exist on disk even without consent (for future use), but the synthesis function does not emit the block without consent.

### Block 6: Kontakt

```ts
{
  id: "cta",
  type: "final-cta",
  props: {
    header: { heading: participant.cta.label, align: "center" },
    ctaGroup: {
      align: "center",
      items: [{ label: participant.cta.label, variant: "primary", target: { kind: "internal", pageId: participant.cta.target } }],
    },
    body: { kind: "paragraphs", align: "center", paragraphs: ["..."] },
  },
}
```

This block is **omitted** when `status` is `former` or `retired` — no contact CTA for non-active participants.

### Breadcrumb parent

The profile page `parentPageId` is changed from the `about` page to the `team` page (RFC-0509). The breadcrumb trail becomes:

```text
Home → Team → <Person>
```

This is configured in `getParticipantProfileRoutes` (`packages/share/src/astro/people-routes.ts`) by finding the team page (`pageId === "team"` or `semanticType === "collection"`) instead of the about page (`semanticType === "about"`). When both a team page and an about page exist, the team page takes precedence as the profile parent. When neither exists, profiles fall back to the localized default base segment (`team` / `komanda`).

### Andrii's profile restructure

**Current prose (`prose/de/andrii-syrokomskyi.md`):** Single unstructured block mixing professional career, personal story, evidence links, and images.

**Restructured prose — three separate files:**

`prose/de/andrii-syrokomskyi-beruflich.md`:

```markdown
---
proseId: andrii-syrokomskyi-beruflich
lang: de
---

Von Beruf bin ich Programmierer und Entwickler hochlastfähiger Systeme. Im Laufe der Jahre war ich an der Einführung, Planung und Entwicklung von Systemen zur Automatisierung von Geschäftsprozessen beteiligt — sowohl für kleine Unternehmen (bis zu 10 Personen) als auch für Branchenriesen (2.600 Mitarbeiter). Berufserfahrung: mehr als 25 Jahre.

Außerdem [arbeitete ich](https://linkedin.com/in/syrokomskyi) in der Spielebranche, bei Crytek und Wargaming.

Derzeit gründe ich ein modernes, zuverlässiges Ingenieurbüro, das kleinen Unternehmen und Handwerkern in Deutschland bei der Digitalisierung hilft (diese Website). Ich möchte nützliche Standards und bewährte Praktiken aus mir bekannten Branchen in diesen Bereich einbringen.

Übrigens: Im Rahmen meiner Marktforschung vor dem Launch meines Produkts entwickelte ich eine Methodik, erhob Daten und veröffentlichte den Index [„Digitale Reife der Unternehmen in Deutschland"](https://zenodo.org/records/20478155).
```

`prose/de/andrii-syrokomskyi-nachweise.md`:

```markdown
---
proseId: andrii-syrokomskyi-nachweise
lang: de
---

- [Digitale Reife der Unternehmen in Deutschland](https://zenodo.org/records/20478155) — Verifiziert (Zenodo, DOI-registriert)
- [LinkedIn-Profil](https://linkedin.com/in/syrokomskyi) — Verifiziert (öffentliches Profil)
- [Marathon Stuttgart — 4 Std. 30 Min.](https://my.raceresult.com/317721/results) — Verifiziert (Race Result)
- [Wanderung Winnenden → Salzburg — 1.700 Fotos](https://komoot.com/tour/1212715373/gallery) — Verifiziert (Komoot)
```

`prose/de/andrii-syrokomskyi-persoenlich.md`:

```markdown
---
proseId: andrii-syrokomskyi-persoenlich
lang: de
---

Ukrainischer Herkunft. Jahrgang 1977. In Deutschland (Backnang). Ich lerne Deutsch. Ich spreche Russisch, Ukrainisch (Muttersprachen) und Englisch.

Zu Beginn des Krieges erkrankte mein Vater (Magenkrebs), und ich brachte ihn zur Behandlung nach Deutschland. Obwohl wir meinen Vater nicht retten konnten, bin ich dankbar:

- einer großartigen Anwältin aus Kiew — für ihre Hilfe,
- dem Pflegepersonal aus Winnenden — für die Versuche, meinen Vater zu heilen, und für die menschliche Fürsorge.

Der Verlust von allem hat mich frei gemacht. Das geschah nicht sofort. In Deutschland — dank der Sozialdienste — erkannte ich, wie Menschen sein können. Um es anzunehmen, wanderte ich zu Fuß von Winnenden bis nach Salzburg (~600 km) und meditierte einen Monat lang in den Alpen.

Interessanterweise hasste ich früher das Laufen regelrecht. Aber um mich neu zu starten, lief ich meinen ersten Marathon. Jetzt laufe ich jeden Tag 5–6 km und einen Halbmarathon einmal im Monat.

So kam es, dass ich in Deutschland geblieben bin, die Sprache lerne — und nicht plane, in die Ukraine zurückzukehren.

Mich und meine anderen Projekte kann man im Internet einfach über meinen Nachnamen finden.
```

**Participant record additions** (using the actual `participantSchema` fields from RFC-0508):

```yaml
responsibility:
  summary: "Architektur und technische Leitung der Webgogol-Plattform"
  scope: "Geschäftsprozessautomatisierung für kleine und mittlere Unternehmen; Qualitätssicherung und Notausgang-Konzept"
  pbpReferences: []
authority:
  canSignFor:
    - "Technologie- und Architekturentscheidungen"
    - "Aufnahme und Kündigung von Kundenverhältnissen"
  canCommitTo:
    - "Festlegung der schriftlichen Bedingungen (AGB, Leistungsschein)"
  escalationRoute: "E-Mail an hi@webgogol.com"
evidence:
  claims:
    - claimId: "zenodo-digitale-reife"
      sourceRef: "https://zenodo.org/records/20478155"
      verifiedAt: "2026-07-24"
    - claimId: "linkedin-profile"
      sourceRef: "https://linkedin.com/in/syrokomskyi"
      verifiedAt: "2026-07-24"
  disclosures: []
consent:
  consentRecordId: "consent-andrii-syrokomskyi"
  approvedFields:
    - bio
    - photo
    - location
    - sameAs
    - lifespan.born
  approvedMedia:
    - andrii-portrait
  consentDate: "2026-07-24"
  withdrawalRoute: "E-Mail an hi@webgogol.com"
  profileReviewer: "andrii-syrokomskyi"
```

**Note:** `profileReviewer: "andrii-syrokomskyi"` is a self-reviewed placeholder. RFC-0508 requires a human review before a participant can be publicly visible; a self-review is acceptable for the founder but must be replaced by an independent review before other participants are published.

### Stats removal

The `stats` field (e.g. "25+ Jahre Erfahrung") is removed from the hero block synthesis. The `stats` field remains in the `participantSchema` (RFC-0508) for non-profile uses (e.g. home page founder spotlight). The "25+ years" claim is already in the career prose and the responsibility summary. The hero should not contain self-claimed metrics — evidence belongs in the evidence block.

## Architectural fit

- **RFC-0200 (amended):** The profile page synthesis in `resolve-route.ts` is restructured from two blocks to six blocks. The `personSynthetic` object is replaced by `buildHumanProfileBlocks` with the new block structure. RFC-0200's `amendedBy` frontmatter must be updated to include RFC-0510.
- **RFC-0508:** The Participant data model provides `responsibility` (summary, scope, pbpReferences), `authority` (canSignFor, canCommitTo, escalationRoute), `evidence` (claims, disclosures), and `consent` fields. This RFC uses these existing fields as-is — no schema changes.
- **RFC-0509:** The breadcrumb parent changes from `about` to `team` (the team hub page).
- **RFC-0229:** Breadcrumb nesting — `Home → Team → <Person>`.
- **DNA-24:** The profile page is a block-declarative page synthesized from the Participant record.
- **DNA-37:** Uses the unified `SectionProps` contract — all blocks are existing archetypes (`hero`, `controlled-responsibility-block` with `body-split-list`, `markdown`, `final-cta`).
- **DNA-38:** Uses canonical item objects from the Participant record (`responsibility`, `authority`, `evidence`), not section-local strings.

## Design

### CLI surface

```sh
# Validate the human profile page structure.
pnpm exec site-kernel run participant.profile.validate --site webgogol-com --json
```

### TypeScript contracts

```ts
// packages/share/src/astro/page-handler/resolve-route.ts — updated synthesis
function buildHumanProfileBlocks(participant: ParticipantView, lang: string): BlockSpec[] {
  const blocks: BlockSpec[] = [];

  // Block 1: Hero
  blocks.push({
    id: "hero",
    type: "hero",
    props: {
      header: { heading: participant.name, subheading: participant.role, level: 1 },
      leadImage: participant.photo ? { src: participant.photo, alt: participant.name } : undefined,
      tagline: participant.location,
      backgroundImage: "home-bg",
    },
  });

  // Block 2: Responsibility & Authority (split-list body)
  const hasResponsibility = participant.responsibility?.summary || participant.responsibility?.scope;
  const hasAuthority =
    (participant.authority?.canSignFor?.length ?? 0) > 0 ||
    (participant.authority?.canCommitTo?.length ?? 0) > 0;
  if (hasResponsibility || hasAuthority) {
    blocks.push({
      id: "responsibility",
      type: "controlled-responsibility-block",
      props: {
        header: { heading: "Verantwortung & Entscheidungsbefugnis" },
        body: {
          labels: { primary: "Verantwortung", secondary: "Entscheidungsbefugnis" },
          primaryItems: [
            ...(participant.responsibility?.summary ? [{ text: participant.responsibility.summary }] : []),
            ...(participant.responsibility?.scope ? [{ text: participant.responsibility.scope }] : []),
          ],
          secondaryItems: [
            ...(participant.authority?.canSignFor ?? []).map((s) => ({ text: s })),
            ...(participant.authority?.canCommitTo ?? []).map((c) => ({ text: c })),
          ],
        },
      },
    });
  }

  // Block 3: Evidence (prose file)
  blocks.push({
    id: "evidence",
    type: "markdown",
    props: {
      header: { heading: "Nachweise & Beiträge" },
      contentRef: `prose/${participant.slug}-nachweise`,
      hideSectionNumber: true,
      pageId: participantPageId(participant.slug),
    },
  });

  // Block 4: Career (prose file)
  blocks.push({
    id: "career",
    type: "markdown",
    props: {
      header: { heading: "Beruflicher Werdegang" },
      contentRef: `prose/${participant.slug}-beruflich`,
      hideSectionNumber: true,
      pageId: participantPageId(participant.slug),
    },
  });

  // Block 5: Personal (consent-gated prose file)
  const hasPersonalConsent = participant.consent?.approvedFields?.includes("bio");
  if (hasPersonalConsent) {
    blocks.push({
      id: "personal",
      type: "markdown",
      props: {
        header: { heading: "Persönlicher Hintergrund" },
        contentRef: `prose/${participant.slug}-persoenlich`,
        hideSectionNumber: true,
        pageId: participantPageId(participant.slug),
      },
    });
  }

  // Block 6: CTA (omitted for former/retired)
  if (participant.cta && participant.status !== "former" && participant.status !== "retired") {
    blocks.push({
      id: "cta",
      type: "final-cta",
      props: {
        header: { heading: participant.cta.label, align: "center" },
        ctaGroup: {
          align: "center",
          items: [{ label: participant.cta.label, variant: "primary", target: { kind: "internal", pageId: participant.cta.target } }],
        },
      },
    });
  }

  return blocks;
}
```

`ParticipantView` must be extended in `packages/share/src/astro/people.ts` to expose `responsibility`, `authority`, `evidence`, and `consent` from the merged Participant record. These fields already exist in `participantSchema` (RFC-0508) but are not currently projected onto `ParticipantView`.

### File system responsibilities

| Path | Edit |
| --- | --- |
| `packages/share/src/astro/page-handler/resolve-route.ts` | Replace `personSynthetic` with `buildHumanProfileBlocks`; six-block structure; consent-gated personal block; CTA omission for former/retired |
| `packages/share/src/astro/people-routes.ts` | `getParticipantProfileRoutes` — parentPageId from team page (`pageId === "team"` or `semanticType === "collection"`) instead of about page |
| `packages/share/src/astro/people.ts` | `ParticipantView` extended to expose `responsibility`, `authority`, `evidence`, `consent` from merged Participant record |
| `packages/os/site-kernel-checks/src/participant-profile.ts` | New file: `participant.profile.validate` |
| `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` | Register `participant.profile.validate` after `team.hub.validate` (line 170) |
| `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts` | Register `participant.profile.validate` command entry |
| `missions/webgogol-com-m000010/workpiece/src/content/people/{de,uk}/andrii-syrokomskyi.md` | Add `responsibility`, `authority`, `evidence`, update `consent`; remove `stats` from hero usage |
| `missions/webgogol-com-m000010/workpiece/src/content/prose/{de,uk}/andrii-syrokomskyi-beruflich.md` | New file: professional career prose |
| `missions/webgogol-com-m000010/workpiece/src/content/prose/{de,uk}/andrii-syrokomskyi-nachweise.md` | New file: evidence links with status labels |
| `missions/webgogol-com-m000010/workpiece/src/content/prose/{de,uk}/andrii-syrokomskyi-persoenlich.md` | New file: personal background prose (consent-gated) |
| `missions/webgogol-com-m000010/workpiece/src/content/prose/{de,uk}/andrii-syrokomskyi.md` | Remove (content split into three files above) |

### participant.profile.validate rules

- A human participant with `page.enabled: true` and `visibility: public` has a career prose file (`prose/{lang}/{slug}-beruflich.md`) in the default language.
- A human participant with `consent.approvedFields` including `bio` has a personal prose file (`prose/{lang}/{slug}-persoenlich.md`) in the default language.
- A human participant without consent for `bio` does NOT have the personal block rendered (the prose file may exist but is not rendered without consent).
- A public human participant has an evidence prose file (`prose/{lang}/{slug}-nachweise.md`) in the default language.
- `evidence.claims` items with `verifiedAt` have a `sourceRef` URL.
- `responsibility.summary` and `authority.canSignFor`/`canCommitTo` items are non-empty strings.
- `status: former` or `status: retired` participants do not have a `cta` field.
- Sites with no people records: no-op pass (same convention as `team.hub.validate`).

## Rollout

- **Phase 0 — Synthesis update.** Update `resolve-route.ts` with `buildHumanProfileBlocks`. Update `people-routes.ts` for team page parent. Extend `ParticipantView` with `responsibility`, `authority`, `evidence`, `consent`. Ship `participant.profile.validate` v1. Register in `SITES_CHECK_AUTHOR_PIPELINE` after `team.hub.validate`.
- **Phase 1 — Content restructure.** Split Andrii's prose file into three separate files (`-beruflich`, `-nachweise`, `-persoenlich`). Add `responsibility`, `authority`, `evidence`, update `consent` in the Participant record. Remove `stats` from hero rendering.
- **Phase 2 — Validation enforcement.** `participant.profile.validate` enforces the six-block structure, consent gating, and prose file presence.

## Alternatives considered

- **Add new block types (responsibility-section, evidence-list).** Rejected — the existing `controlled-responsibility-block` and `markdown` archetypes cover the needs. Adding new block types would require new cosmic names, archetype registry entries, and UI components.
- **Keep the personal story in the hero statement.** Rejected — the expert explicitly recommends removing personal details from the first screen. The hero should be professional identity only.
- **Create a separate editorial route for the personal story (e.g. `/team/andrii-syrokomskyi/geschichte/`).** Rejected — the personal story is part of the profile page, not a separate page. A separate route would fragment the profile and require additional navigation.

## Risks

- **Prose file restructuring breaks existing content references.** The `contentRef: prose/andrii-syrokomskyi` is changed to `prose/andrii-syrokomskyi-beruflich`, `prose/andrii-syrokomskyi-nachweise`, `prose/andrii-syrokomskyi-persoenlich`. The `content.references.validate` command checks that referenced prose files exist — the old single file is removed and three new files are created.
- **Consent gating removes content.** If consent is not granted for `bio`, the personal section is not rendered. This is intentional — consent is the gate.
- **Breadcrumb parent change.** The breadcrumb trail changes from `Home → Über uns → <Person>` to `Home → Team → <Person>`. This is a visible change but aligns with the team hub (RFC-0509).
- **Empty states.** When a participant has `responsibility` but no `authority` (or vice versa), the `controlled-responsibility-block` renders with one column populated and the other empty. The split-list component handles this gracefully (single-column layout when `secondaryItems` is empty).

## Acceptance criteria

- [x] `buildHumanProfileBlocks` in `resolve-route.ts` produces the six-block structure. (evidence: packages/share/src/astro/page-handler/resolve-route.ts:90-217, pnpm --filter @gogol/share exec tsc --noEmit passes)
- [x] Hero block shows only name, role, location (city), and portrait — no `statement`, no `stats`. (evidence: packages/share/src/astro/page-handler/resolve-route.ts:98-113, hero props omit statement and stats)
- [x] Responsibility block renders `responsibility.summary`/`scope` (primary) and `authority.canSignFor`/`canCommitTo` (secondary) as split-list items. (evidence: packages/share/src/astro/page-handler/resolve-route.ts:115-146, body.primaryItems/body.secondaryItems)
- [x] Evidence block renders from `prose/{slug}-nachweise` prose file. (evidence: packages/share/src/astro/page-handler/resolve-route.ts:148-161, contentRef: prose/${slug}-nachweise)
- [x] Career block renders from `prose/{slug}-beruflich` prose file. (evidence: packages/share/src/astro/page-handler/resolve-route.ts:163-175, contentRef: prose/${slug}-beruflich)
- [x] Personal block renders only when `consent.approvedFields` includes `bio` and `prose/{slug}-persoenlich` exists. (evidence: packages/share/src/astro/page-handler/resolve-route.ts:177-193, hasPersonalConsent check)
- [x] CTA block is omitted for `status: former` and `status: retired`. (evidence: packages/share/src/astro/page-handler/resolve-route.ts:195-214, status !== former && status !== retired)
- [x] Breadcrumb parent is the `team` page (not `about`). (evidence: packages/share/src/astro/people-routes.ts:80-87, teamPage takes precedence over aboutPage)
- [x] Andrii's prose is split into three files: `-beruflich`, `-nachweise`, `-persoenlich`. (evidence: missions/webgogol-com-m000010/workpiece/src/content/prose/de/andrii-syrokomskyi-{beruflich,nachweise,persoenlich}.md created, old andrii-syrokomskyi.md removed)
- [x] Andrii's Participant record has `responsibility`, `authority`, `evidence`, updated `consent`. (evidence: missions/webgogol-com-m000010/workpiece/src/content/people/de/andrii-syrokomskyi.md:26-52, participant.validate passes)
- [x] `participant.profile.validate` passes and is registered in `SITES_CHECK_AUTHOR_PIPELINE` after `team.hub.validate`. (evidence: packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts:171-172, participant.profile.validate: OK in sites-check.run)
- [x] `rfc.validate` passes on this file before merging. (evidence: pnpm exec site-kernel run rfc.validate --json, only shared V-19 warning)

## Implementation notes for agents

- Agents MUST split the prose file into three separate files: `{slug}-beruflich`, `{slug}-nachweise`, `{slug}-persoenlich` (DE) or localized equivalents (UK).
- Agents MUST add `responsibility`, `authority`, `evidence` to the Participant record before enabling the responsibility and evidence blocks.
- Agents MUST add a `consent` record before setting `visibility: public` on a human participant.
- Agents MUST NOT render the personal block without consent for `bio`.
- Agents MUST NOT include `stats` in the hero block.
- Agents MUST omit the CTA block for `status: former` or `status: retired` participants.
- Agents MUST use the localized file name suffixes:
  - DE: `-beruflich`, `-nachweise`, `-persoenlich`
  - UK: `-profesijnyj-shliakh`, `-doky`, `-osyste`
