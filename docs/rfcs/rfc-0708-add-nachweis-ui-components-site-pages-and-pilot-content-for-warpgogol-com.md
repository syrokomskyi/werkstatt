---
id: RFC-0708
title: "Add Nachweis UI components, site pages, and pilot content for warpgogol-com"
status: accepted
kind: architecture
scope: app
owners:
 - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-06
updatedAt: 2026-08-06
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - ADR-0028
  - RFC-0706
  - RFC-0707
  - RFC-0047
  - RFC-0048
  - RFC-0169
satisfies:
  - DNA-24
  - DNA-17
  - DNA-23
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/ui"
  - "@warpgogol/ontology"
  - "@warpgogol/share"
enhancedAt: 2026-08-06
successSignals:
  - "/nachweise/ page renders with published records or neutral placeholder"
  - "/nachweise/[slug]/ renders Nachweis card with WCAG 2.2 AA compliance"
  - "/nachweise/verify/[version]/ renders cryptographic verification data"
  - "/nachweise/status/[id].json returns machine-readable status"
  - "Two pilot records (Nicaragua, Style Expert) exist in preview status"
  - "Nachweis module gated by nachweis entitlement"
nonGoals:
  - "Does not implement kernel commands (RFC-0707)"
  - "Does not implement schema extensions (RFC-0706)"
  - "Does not publish pilot records — both remain in preview status"
  - "Does not implement redacted PDF generation — manual process"
  - "Does not implement consent form templates as content files"
  - "Does not implement contextual projections on service pages — deferred"
---

# RFC-0708: Add Nachweis UI components, site pages, and pilot content for warpgogol-com

## Context

ADR-0028 establishes Nachweisregister as a PBP trust-layer extension. RFC-0706 extends the schema. RFC-0707 implements kernel commands. This RFC implements the presentation layer: UI components, site pages, and two pilot content records on warpgogol-com.

The warpgogol-com site uses block-declarative pages (RFC-0047) with `system.md` → `pages[]` → `blocks[]` → components. UI components live in `packages/ui/src/components/`. Pages are content files in `src/content/pages/{lang}/`. PBP entities live in `src/content/business-profile/{lang}/`.

The Nachweisregister specification defines 5 pages:

1. `/nachweise/` — registry index
2. `/nachweise/[slug]/` — detail card
3. `/nachweise/verify/[version]/` — Sichtpass (cryptographic verification)
4. `/nachweise/status/[id].json` — machine-readable status
5. Contextual projections on service pages (deferred)

The specification also defines a card structure with WCAG 2.2 AA requirements: semantic `article`, `blockquote`, `dl`, `time`, visible focus, keyboard nav, `lang` for quotes and translations, no carousel.

## Problem

1. **No UI components for Nachweis cards.** The existing `packages/ui/` components (hero, CTA, card-grid, etc.) do not include a Nachweis card component with the required semantic structure and accessibility features.

2. **No Nachweis pages on warpgogol-com.** `system.md` has no `nachweise` page entries. No routes exist for `/nachweise/`, `/nachweise/[slug]/`, etc.

3. **No pilot content.** Two PDF evidence documents (Nicaragua-Projekt, Style Expert) need to be onboarded as PBP entities in `preview` status. No PBP `Claim`, `EvidenceSource`, or `Consent` content files exist for these records.

4. **No entitlement activation.** `system.md` does not declare `entitlementsOverride: ["nachweis"]` or a Nachweis surface module.

## Decision

### UI components

Four new components in `packages/ui/src/components/`:

1. **`nachweis-card/`** — cosmicName **Praxidike** (Jupiter moon, goddess of judicial order). Semantic article with blockquote, dl, time. Shows: result/scope → context/limitations → quote → source → what Warpgogol verified → what was not verified → status. Uses `--ds-*` tokens. WCAG 2.2 AA.

2. **`nachweis-list/`** — cosmicName **Hydra** (Pluto moon). List of `nachweis-card` components for the index page. Renders published records only. Empty state: "Weitere Nachweise werden derzeit vorbereitet."

3. **`nachweis-detail/`** — cosmicName **Kerberos** (Pluto moon, guardian of the gate). Full detail page component. `nachweis-card` + Sichtpass section (hashes, verification level, timestamp, signature). Renders `lang` attributes on quotes and translations.

4. **`nachweis-verify/`** — cosmicName **Styx** (Pluto moon, river of binding oaths). Cryptographic verification data display. Shows source SHA-256, public derivative SHA-256, record payload SHA-256, envelope SHA-256, operator signature, qualified timestamp. Read-only.

Each component has `.astro`, `.css`, and `<slug>-component.manifest.yaml` (following the `packages/ui/AGENTS.md` convention for new components). Four new archetype entries are created in `packages/ontology/archetypes/components/` (`nachweis-card.yaml`, `nachweis-list.yaml`, `nachweis-detail.yaml`, `nachweis-verify.yaml`) with `layer: component` and the corresponding `acceptedCosmicNames`. `archetype.registry.build` regenerates `packages/ontology/archetypes/index.yaml` so `deriveImportPathMaps` discovers the new components and feeds `planetImportPaths` and `blockTypeToCosmicName`.

### Site pages (warpgogol-com)

Three page entries added to `system.md`:

| pageId | Routes (DE) | Routes (UK) | Blocks |
| --- | --- | --- | --- |
| `nachweise` | `/nachweise/` | `/nachweise/` | `nachweis-list` |
| `nachweis-detail` | `/nachweise/[slug]/` | `/nachweise/[slug]/` | `nachweis-detail` |
| `nachweis-verify` | `/nachweise/verify/[version]/` | `/nachweise/verify/[version]/` | `nachweis-verify` |

Pages `nachweis-detail` and `nachweis-verify` are dynamic routes. Their `getStaticPaths` slugs are enumerated by a new route source function `getNachweisRoutes()` in `packages/share/src/astro/nachweis-routes.ts` (see Route source subsection below). The `[...slug].astro` catch-all serves them.

Two additional endpoints are NOT `system.md` page entries — they are dedicated Astro routes outside the block-declarative page model:

- **`/nachweise/status/[id].json`** — JSON endpoint served by a dedicated route file `src/pages/nachweise/status/[id].json.ts` that returns JSON. This cannot be served by `[...slug].astro` which returns HTML.
- **`/nachweise/manifest.json`** — static file served directly by Astro from `public/nachweise/manifest.json` (generated by `nachweis.manifest.generate`, RFC-0707). No route entry or page entry needed.

### Pilot content

Two PBP record sets created in `src/content/business-profile/{lang}/trust/`:

**Nicaragua-Projekt:**

- `claims/nicaragua-projekt.md` — `pbp/claim@1`, `record_type: project_confirmation`, `statementLang: "de"`, `status: draft`, `verificationLevel: "N1"`
- `evidence/nicaragua-projekt.md` — `pbp/evidence-source@1`, `kind: project-confirmation`, `sha256: 58e9cde...`, `storage: private`, `qualityStatus: verified_with_quality_issue`
- `consents/nicaragua-projekt.md` — `pbp/consent@1`, `status: not_requested`, `method: none`

**Style Expert:**

- `claims/style-expert-referenz.md` — `pbp/claim@1`, `record_type: client_statement`, `statementLang: "de"`, `status: draft`, `verificationLevel: "N0"`
- `evidence/style-expert-referenz.md` — `pbp/evidence-source@1`, `kind: client-statement`, `sha256: 9f0da3b...`, `storage: private`, `qualityStatus: unverified`
- `consents/style-expert-referenz.md` — `pbp/consent@1`, `status: not_requested`, `method: none`

Both records have `publication.visibility: preview` — not publicly visible.

### Entitlement activation

`system.md` updated:

- `entitlementsOverride: ["nachweis"]` (pilot, offline)
- Surface module declaration in `surface.modules`:

```yaml
surface:
  modules:
    nachweis:
      entitlement: nachweis
      blueprints:
        - nachweis-list
        - nachweis-detail
        - nachweis-verify
      masterLocale: de
      publishedLocales: [de, uk]
  blueprints:
    - nachweis-list
    - nachweis-detail
    - nachweis-verify
```

### Navigation

`navigation.md` updated to include `/nachweise/` in footer navigation under a "Trust" group. Not in header navigation for pilot (low visibility).

## Architectural fit

- **Block-declarative pages (RFC-0047, DNA-24):** Nachweis pages follow the standard `system.md` → `pages[]` → `blocks[]` pattern. The existing `[...slug].astro` catch-all serves all three page entries. Dynamic route slugs are enumerated by `getNachweisRoutes()` (see Route source below). No dedicated `.astro` route files are needed for HTML pages.
- **Mirror Quintet (DNA-17, DNA-23):** Each component has `.astro`, `.css`, `<slug>-component.manifest.yaml`, and a new archetype entry in `packages/ontology/archetypes/components/`. Cosmic names are drawn from `MoonCatalog` (Praxidike, Hydra, Kerberos, Styx) — all available and not passport-reserved.
- **PBP content collections:** Nachweis PBP entities live in `business-profile/{lang}/trust/` alongside existing claims, evidence, and disclosures.
- **Entitlement gating (RFC-0169):** `nachweis` feature gates the Nachweis surface module. `entitlement.module.validate` enforces that blueprints are not compiled without the entitlement.
- **WCAG 2.2 AA:** Components use semantic HTML (`article`, `blockquote`, `dl`, `time`), visible focus, keyboard navigation, `lang` attributes on quotes. Status is not communicated by color alone.
- **UK as source of truth:** PBP content files created in both `de/` and `uk/` directories. DE is the original language for both pilot documents (`statementLang: "de"`). UK is the translation.

## Design

### Component contracts

```ts
// packages/ui/src/components/nachweis-card/nachweis-card.astro
interface NachweisCardProps {
  slug: string;
  title: Record<string, string>;
  claim: string;           // statement text
  statementLang: string;   // BCP 47 tag
  limitations: string[];
  quote?: { text: string; lang: string; translation?: string };
  organization: { name: string; country: string; sector: string };
  person?: { name: string; role: string; public: boolean };
  verificationLevel: "N0" | "N1" | "N2" | "N3";
  sourceSha256: string;
  recordStatus: string;
  canonicalUrl?: string;
}
```

```ts
// packages/ui/src/components/nachweis-list/nachweis-list.astro
interface NachweisListProps {
  records: NachweisCardProps[];
  emptyMessage: string;    // "Weitere Nachweise werden derzeit vorbereitet."
}
```

```ts
// packages/ui/src/components/nachweis-detail/nachweis-detail.astro
interface NachweisDetailProps extends NachweisCardProps {
  sichtpass: {
    sourceSha256: string;
    publicDerivativeSha256: string | null;
    recordPayloadSha256: string | null;
    envelopeSha256: string | null;
    operatorSignature: object | null;
    qualifiedTimestamp: object | null;
    bordbuchEventId: string;
  };
  consentStatus: string;
  consentMethod: string;
  consentGrantedAt: string | null;
}
```

```ts
// packages/ui/src/components/nachweis-verify/nachweis-verify.astro
interface NachweisVerifyProps {
  version: string;
  sourceSha256: string;
  publicDerivativeSha256: string | null;
  recordPayloadSha256: string | null;
  envelopeSha256: string | null;
  operatorSignature: object | null;
  qualifiedTimestamp: object | null;
  bordbuchEventId: string;
  verificationLevel: string;
}
```

### Page structure

```yaml
# system.md pages[] additions
- pageId: nachweise
  cosmicStar: Fomalhaut
  routes:
    de: /nachweise/
    uk: /nachweise/
  planets:
    - nachweis-list
  blocks:
    - id: nachweis-index
      type: nachweis-list
      props:
        emptyMessage: "Weitere Nachweise werden derzeit vorbereitet."

- pageId: nachweis-detail
  cosmicStar: Fomalhaut
  routes:
    de: /nachweise/[slug]/
    uk: /nachweise/[slug]/
  planets:
    - nachweis-detail
  blocks:
    - id: nachweis-detail
      type: nachweis-detail

- pageId: nachweis-verify
  cosmicStar: Fomalhaut
  routes:
    de: /nachweise/verify/[version]/
    uk: /nachweise/verify/[version]/
  planets:
    - nachweis-verify
  blocks:
    - id: nachweis-verify
      type: nachweis-verify

```

### Route source and getStaticPaths

A new route source function `getNachweisRoutes()` is added to `packages/share/src/astro/nachweis-routes.ts`, following the pattern of `getParticipantProfileRoutes()` (RFC-0200/0508). It reads PBP `EvidenceSource` entities from the `business-profile` content collection and generates one route entry per published record:

```ts
export async function getNachweisRoutes(): Promise<NachweisRouteEntry[]> {
  // Read PBP EvidenceSource entities with kind in Nachweis set
  // Filter by publication.visibility: published
  // Generate per-slug route entries: { pageId: `nachweis:${slug}`, slug, routes }
  // Preview records are excluded — no route entry generated
}
```

The route registry (`getRouteRegistry()`) folds these entries in behind the `nachweis` entitlement gate (similar to `team.profiles` for person routes). Authored pages always win on slug collision. The `[...slug].astro` catch-all serves them via `resolvePageRoute()`.

For `nachweis-verify`, the route source generates entries with version suffixed slugs (`/nachweise/verify/v1/`, `/nachweise/verify/v2/`, etc.).

**404 behavior for preview records:** Since preview records are excluded from `getNachweisRoutes()`, no static path is generated for them. A visitor navigating to `/nachweise/nicaragua-projekt/` during preview receives a 404 — the route does not exist in the build output. This is intentional: preview records are not publicly accessible.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ui/src/components/nachweis-card/nachweis-card.astro` | Card component (cosmicName: Praxidike) |
| `packages/ui/src/components/nachweis-card/nachweis-card.css` | Card styles |
| `packages/ui/src/components/nachweis-card/nachweis-card-component.manifest.yaml` | Card manifest |
| `packages/ui/src/components/nachweis-list/nachweis-list.astro` | List component (cosmicName: Hydra) |
| `packages/ui/src/components/nachweis-list/nachweis-list.css` | List styles |
| `packages/ui/src/components/nachweis-list/nachweis-list-component.manifest.yaml` | List manifest |
| `packages/ui/src/components/nachweis-detail/nachweis-detail.astro` | Detail component (cosmicName: Kerberos) |
| `packages/ui/src/components/nachweis-detail/nachweis-detail.css` | Detail styles |
| `packages/ui/src/components/nachweis-detail/nachweis-detail-component.manifest.yaml` | Detail manifest |
| `packages/ui/src/components/nachweis-verify/nachweis-verify.astro` | Verify component (cosmicName: Styx) |
| `packages/ui/src/components/nachweis-verify/nachweis-verify.css` | Verify styles |
| `packages/ui/src/components/nachweis-verify/nachweis-verify-component.manifest.yaml` | Verify manifest |
| `packages/ontology/archetypes/components/nachweis-card.yaml` | Card archetype entry |
| `packages/ontology/archetypes/components/nachweis-list.yaml` | List archetype entry |
| `packages/ontology/archetypes/components/nachweis-detail.yaml` | Detail archetype entry |
| `packages/ontology/archetypes/components/nachweis-verify.yaml` | Verify archetype entry |
| `packages/share/src/astro/nachweis-routes.ts` | Route source for dynamic Nachweis routes |
| `missions/warpgogol-com-m000033/workpiece/src/content/system.md` | Page entries added |
| `missions/warpgogol-com-m000033/workpiece/src/content/pages/de/nachweise.md` | Index page content |
| `missions/warpgogol-com-m000033/workpiece/src/content/pages/uk/nachweise.md` | UK index page content |
| `missions/warpgogol-com-m000033/workpiece/src/content/business-profile/de/trust/claims/nicaragua-projekt.md` | Nicaragua Claim entity |
| `missions/warpgogol-com-m000033/workpiece/src/content/business-profile/de/trust/evidence/nicaragua-projekt.md` | Nicaragua EvidenceSource entity |
| `missions/warpgogol-com-m000033/workpiece/src/content/business-profile/de/trust/consents/nicaragua-projekt.md` | Nicaragua Consent entity |
| `missions/warpgogol-com-m000033/workpiece/src/content/business-profile/de/trust/claims/style-expert-referenz.md` | Style Expert Claim entity |
| `missions/warpgogol-com-m000033/workpiece/src/content/business-profile/de/trust/evidence/style-expert-referenz.md` | Style Expert EvidenceSource entity |
| `missions/warpgogol-com-m000033/workpiece/src/content/business-profile/de/trust/consents/style-expert-referenz.md` | Style Expert Consent entity |
| `missions/warpgogol-com-m000033/workpiece/src/content/business-profile/uk/trust/claims/nicaragua-projekt.md` | UK Nicaragua Claim |
| `missions/warpgogol-com-m000033/workpiece/src/content/business-profile/uk/trust/evidence/nicaragua-projekt.md` | UK Nicaragua EvidenceSource |
| `missions/warpgogol-com-m000033/workpiece/src/content/business-profile/uk/trust/consents/nicaragua-projekt.md` | UK Nicaragua Consent |
| `missions/warpgogol-com-m000033/workpiece/src/content/business-profile/uk/trust/claims/style-expert-referenz.md` | UK Style Expert Claim |
| `missions/warpgogol-com-m000033/workpiece/src/content/business-profile/uk/trust/evidence/style-expert-referenz.md` | UK Style Expert EvidenceSource |
| `missions/warpgogol-com-m000033/workpiece/src/content/business-profile/uk/trust/consents/style-expert-referenz.md` | UK Style Expert Consent |
| `missions/warpgogol-com-m000033/workpiece/src/content/navigation/de/navigation.md` | Footer nav updated |
| `missions/warpgogol-com-m000033/workpiece/src/content/navigation/uk/navigation.md` | UK footer nav updated |

### Accessibility requirements

- `article` wrapper with `aria-labelledby` pointing to the card title
- `blockquote` for quotes with `cite` attribute
- `dl` (definition list) for key-value pairs (organization, person, source)
- `time` element with `datetime` attribute for dates
- `lang` attribute on `blockquote` and translation elements
- Status communicated via text + icon, not color alone
- Visible focus ring on all interactive elements
- Keyboard navigation: Tab through cards, Enter to open detail
- No carousel or auto-rotating content
- Color contrast: WCAG 2.2 AA (4.5:1 text, 3:1 large text)

### Public copy constraints

Allowed phrases (from specification):

- "Vom Auftraggeber bestätigt"
- "Dokumentherkunft technisch dokumentiert"
- "Unverändert seit der Zeitstempelung"
- "Verfahren dokumentiert durch Warpgogol"
- "Keine unabhängige Inhaltsprüfung"

Prohibited phrases:

- "unabhängig geprüft"
- "amtlich bestätigt"
- "100 % verifiziert"
- "garantiert wahr"
- "fälschungssicher"

## Rollout

- **Default behavior:** Nachweis pages are only generated when the `nachweis` entitlement is resolved. Sites without the entitlement do not have `/nachweise/` routes.
- **warpgogol-com pilot:** `entitlementsOverride: ["nachweis"]` activates the module. Pages are generated. Two records exist in `preview` — index page shows empty state ("Weitere Nachweise werden derzeit vorbereitet."). Detail pages are not generated for `preview` records.
- **Publication:** When consent is obtained and gate conditions are met, `nachweis.publish` (RFC-0707) transitions records to `published`. Pages are regenerated on next deploy. Detail pages become accessible.
- **Client site adoption:** Stripe feature `feature_nachweis` activated. `entitlements.resolve` fetches the feature. `getRouteRegistry()` folds in `getNachweisRoutes()` behind the `nachweis` entitlement gate. Client creates PBP content in `business-profile/{lang}/trust/`.

## Alternatives considered

- **Nachweis as archetype blocks in `packages/ui/src/sections/`:** Rejected. Nachweis components are not page sections (hero, CTA, card-grid) — they are specialized trust components. Sections are planet-named and registered in the archetype registry. Nachweis components are moon-named components, closer to `header-component` or `footer-component` in structure.
- **Single `nachweis` component (not 4):** Rejected. Card, list, detail, and verify have distinct responsibilities and data shapes. Combining them would create a monolithic component with conditional rendering — harder to maintain and test.
- **Defer verify and status pages:** Rejected by operator decision. All 3 HTML pages and 2 non-HTML endpoints are built upfront, even if verify and status have no data for pilot records. This ensures the infrastructure is complete and ready for the first published record.
- **Contextual projections on service pages:** Deferred. Adding Nachweis references to service pages (e.g. "See proof for this service") is valuable but not needed for pilot. Will be added when records are published.

## Risks

- **Dynamic route complexity:** `/nachweise/[slug]/` and `/nachweise/verify/[version]/` are dynamic routes. The `[...slug].astro` catch-all serves them via `getNachweisRoutes()` which folds per-slug entries into the route registry. No dedicated route files are needed — the catch-all handles all routes. The JSON endpoint `/nachweise/status/[id].json` uses a dedicated `src/pages/nachweise/status/[id].json.ts` route file (Astro routes by extension).
- **Empty state UX:** The index page shows "Weitere Nachweise werden derzeit vorbereitet." for an extended period (until consent is obtained). This may look unfinished to visitors. Mitigation: design the empty state as a deliberate "coming soon" section, not a broken page.
- **Component reusability:** Components are built for warpgogol-com but intended for reuse on client sites. Hardcoding warpgogol-specific copy (e.g. "Verfahren dokumentiert durch Warpgogol") reduces reusability. Mitigation: operator-specific copy is passed via block props from the page content entry (`system.md` → `pages[].blocks[].props.verifiedByLabel`). The component renders the prop value, defaulting to the site name from `system.md identity.name` when not provided.
- **Pilot content in preview indefinitely:** If consent is never obtained, pilot records remain in `preview` forever. Mitigation: document the consent status in the mission and review periodically.

## Acceptance criteria

- [ ] `nachweis-card` component renders semantic `article`, `blockquote`, `dl`, `time` with `lang` attributes
- [ ] `nachweis-list` component renders published records or empty state message
- [ ] `nachweis-detail` component renders card + Sichtpass section
- [ ] `nachweis-verify` component renders all 4 SHA-256 hashes, signature, and timestamp fields
- [ ] All 4 components have `.astro`, `.css`, `<slug>-component.manifest.yaml` files with correct cosmicNames (Praxidike, Hydra, Kerberos, Styx)
- [ ] 4 archetype entries created in `packages/ontology/archetypes/components/` and `archetype.registry.build` passes
- [ ] `getNachweisRoutes()` in `packages/share/src/astro/nachweis-routes.ts` enumerates published records for `getStaticPaths`
- [ ] `system.md` includes 3 Nachweis page entries with correct routes
- [ ] `/nachweise/` page renders with empty state (no published records)
- [ ] `/nachweise/[slug]/` route does not generate for preview records (404)
- [ ] `/nachweise/verify/[version]/` route exists and renders verify component
- [ ] `/nachweise/status/[id].json` endpoint returns JSON status via dedicated route file
- [ ] `/nachweise/manifest.json` serves static manifest from `public/`
- [ ] `entitlementsOverride: ["nachweis"]` declared in `system.md`
- [ ] Nachweis surface module declared with `entitlement: "nachweis"`
- [ ] Footer navigation includes `/nachweise/` link
- [ ] 2 PBP Claim entities created (Nicaragua, Style Expert) in `de/` and `uk/`
- [ ] 2 PBP EvidenceSource entities created with correct SHA-256 hashes
- [ ] 2 PBP Consent entities created with `status: not_requested`
- [ ] All pilot records have `publication.visibility: preview`
- [ ] `nachweis.validate` passes with 0 violations on pilot content
- [ ] WCAG 2.2 AA compliance verified (axe or manual check)
- [ ] `entitlement.module.validate` passes with `nachweis` entitlement
- [ ] `astro check` passes for warpgogol-com
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- This RFC depends on RFC-0706 (schema extensions) and RFC-0707 (kernel commands). Implement both first.
- All content files must be created in both `de/` and `uk/` directories. UK is the source of truth for translations; DE is the original language for both pilot documents.
- Use `mission.git.commit` to commit changes in the workpiece — not direct `git commit`.
- Agents MUST NOT publish pilot records (transition to `published`) without explicit operator consent. Both records remain in `preview`.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- The SHA-256 hashes for pilot records are:
  - Nicaragua-Projekt: `58e9cde7607f2f1a00dae1676f44955b0b4cfe62c412d3dfb6b2c4b701503deb`
  - Style Expert: `9f0da3bf7a349a30661c954034150df72da75b9eb036ab3fec9e79646027f93a`
