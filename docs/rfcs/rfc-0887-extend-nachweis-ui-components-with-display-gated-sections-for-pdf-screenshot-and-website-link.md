---
id: RFC-0887
title: "Extend Nachweis UI components with display-gated sections for PDF, screenshot, and website link"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-20
updatedAt: 2026-08-20
enhancedAt: 2026-08-20
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0708
amendedBy: []
related:
  - ADR-0028
  - ADR-0054
  - ADR-0057
  - RFC-0706
  - RFC-0872
  - RFC-0876
  - RFC-0885
  - RFC-0886
dependsOn:
  - RFC-0885
  - RFC-0886
batch: nachweis-evidence-display
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-46
  - DNA-59
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - werkstatt-site
successSignals:
  - "nachweis-detail component renders PDF preview section when display.document is visible"
  - "nachweis-detail component renders website screenshot section when display.screenshot is visible"
  - "nachweis-detail component renders website link section when display.websiteLink is visible"
  - "Hidden display aspects produce no DOM output (no placeholder, no redacted indicator)"
  - "nachweis-card and nachweis-list components show website link icon when display.websiteLink is visible"
nonGoals:
  - "Does not define PBP entity schema shapes — that belongs to RFC-0885"
  - "Does not define kernel commands or publication gates — that belongs to RFC-0886"
  - "Does not define UI design decisions (HTML elements, loading strategies, section ordering) — that belongs to ADR-0057"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0887: Extend Nachweis UI components with display-gated sections for PDF, screenshot, and website link

## Context

RFC-0708 introduced the Nachweis UI components: `nachweis-detail`, `nachweis-card`, `nachweis-list`, and `nachweis-verify` in `packages/werkstatt-site/src/domain/ui/`. These components render attestation and technical-assessment evidence profiles. ADR-0057 defines the UI design decisions for three new display sections (PDF preview, website screenshot, website link). RFC-0885 defines the schema fields (`display`, `websiteUrl`, `websiteScreenshot`) and RFC-0886 defines the kernel commands. This RFC implements the UI components that consume those schema fields and render the sections according to ADR-0057.

## Problem

The `nachweis-detail` component has no rendering logic for:

1. PDF document preview (embedded viewer + download link + SHA-256 hash)
2. Website screenshot (responsive image with caption)
3. Website link (external link with domain name text)

The `nachweis-card` and `nachweis-list` components have no indicator for website link availability.

The components do not read the `display` field on `EvidenceSource` to conditionally render sections.

## Decision

The `nachweis-detail` component is extended with three display-gated sections that render PDF preview, website screenshot, and website link according to ADR-0057. The `nachweis-card` and `nachweis-list` components are extended with a website link indicator. All sections are conditionally rendered based on the `display` field — hidden aspects produce no DOM output.

## Architectural fit

- **DNA-46 (Mission lifecycle)**: The new display-gated sections consume entity fields (`display`, `websiteUrl`, `websiteScreenshot`) that are populated through kernel commands (`nachweis.consent.update`, `nachweis.screenshot.upload` from RFC-0886) executed within missions. The UI components themselves are site-stack code deployed through missions, but the DNA-46 connection is deeper: the display state is not static config — it is the result of consent decisions recorded in the Bordbuch during a mission. The UI renders the current state of those mission-lifecycle-managed consent decisions.
- **DNA-59 (Evidence preservation)**: The screenshot image served from `websiteScreenshot.url` is an R2-preserved artifact whose SHA-256 is recorded in the entity. The PDF artifact served via `<object data={pdfUrl}>` is the canonical raw artifact preserved in R2. The UI consumes R2 URLs and displays SHA-256 hashes alongside the PDF viewer, reinforcing the preservation contract by making the hash visible for verification.
- **RFC-0708**: Amends the Nachweis UI components originally introduced by RFC-0708.
- **ADR-0057**: Implements the UI design decisions defined in ADR-0057.
- **RFC-0885**: Consumes the `display`, `websiteUrl`, and `websiteScreenshot` schema fields.
- **RFC-0886**: Consumes the per-aspect consent and screenshot upload results indirectly (via entity fields populated by kernel commands).

## Design

### CLI surface

No new CLI commands. This RFC is a UI component extension.

### Prop flow

The components do not receive a `PbpEvidenceSource` entity directly. The actual prop flow is:

1. **Route resolver** (`packages/werkstatt-site/src/domain/share/astro/nachweis-routes.ts`) loads the PBP entity from the content collection and maps it to a flat `NachweisDetailContent` / `NachweisCardProps` object.
2. **Page block** passes the flat object as `pageOverride` via `SectionProps`.
3. **Component** casts `pageOverride` to its content interface (`NachweisAttestationDetailContent` for detail, `NachweisCardProps` for card).
4. **`nachweis-list`** loads records via `getCollection("business-profile")` at build time, maps them to `NachweisRecord` objects, and passes them to `NachweisCard`.

The new fields (`display`, `websiteUrl`, `websiteScreenshot`) must be added to:

- `NachweisAttestationDetailContent` interface in `nachweis-detail-component.astro`
- `NachweisCardProps` (attestation variant) in `nachweis-card-component.astro`
- `EvidenceSourceData` interface and `loadPublishedNachweisRecords()` in `nachweis-list-component.astro`
- The route resolver mapping in `nachweis-routes.ts`

### TypeScript contracts

#### nachweis-detail component

```astro
---
// packages/werkstatt-site/src/domain/ui/components/nachweis-detail/nachweis-detail-component.astro

interface NachweisAttestationDetailContent {
  // ... existing fields ...
  // RFC-0887: display control fields
  display?: { document: "visible" | "hidden"; screenshot: "visible" | "hidden"; websiteLink: "visible" | "hidden" };
  websiteUrl?: string;
  websiteScreenshot?: { sha256: string; mediaType: string; storage: "private" | "public"; url?: string };
  // RFC-0887: PDF artifact URL and hash (extracted from items["canonical"] by route resolver)
  pdfUrl?: string;
  pdfSha256?: string;
}

const props = cast<NachweisAttestationDetailContent>(pageOverride);
const display = props.display;
const websiteUrl = props.websiteUrl;
const websiteScreenshot = props.websiteScreenshot;
const pdfUrl = props.pdfUrl;
const pdfSha256 = props.pdfSha256;
const domain = websiteUrl ? new URL(websiteUrl).hostname.replace(/^www\./, "") : undefined;
const captureDate = websiteScreenshot?.sha256 ? formatDate(observedAt) : undefined;
---

<!-- PDF document section: render only when display.document === "visible" && pdfUrl -->
{display?.document === "visible" && pdfUrl && (
  <section class="nachweis-detail__pdf" aria-labelledby={pdfHeadingId}>
    <h2 id={pdfHeadingId} class="nachweis-detail__section-title">PDF-Dokument</h2>
    <object data={pdfUrl} type="application/pdf" width="100%" height="600px">
      <p>Ihr Browser kann kein PDF anzeigen. <a href={pdfUrl} download>Dokument herunterladen</a></p>
    </object>
    {pdfSha256 && (
      <p class="nachweis-detail__pdf-hash">SHA-256: <code>{pdfSha256}</code></p>
    )}
  </section>
)}

<!-- Website screenshot section: render only when display.screenshot === "visible" && websiteScreenshot?.url -->
{display?.screenshot === "visible" && websiteScreenshot?.url && (
  <section class="nachweis-detail__screenshot" aria-labelledby={screenshotHeadingId}>
    <h2 id={screenshotHeadingId} class="nachweis-detail__section-title">Website-Screenshot</h2>
    <figure class="nachweis-detail__screenshot-figure">
      <img
        src={websiteScreenshot.url}
        alt={`Homepage-Aufnahme von ${domain}`}
        loading="lazy"
        decoding="async"
        fetchpriority="low"
        width="1280"
        height="720"
      />
      <figcaption>Homepage-Aufnahme — {captureDate}</figcaption>
    </figure>
  </section>
)}

<!-- Website link section: render only when display.websiteLink === "visible" && websiteUrl -->
{display?.websiteLink === "visible" && websiteUrl && (
  <section class="nachweis-detail__website-link">
    <a href={websiteUrl} rel="noopener noreferrer" target="_blank" class="nachweis-detail__website-link-btn">
      <span class="nachweis-detail__website-link-icon" aria-hidden="true">↗</span>
      {domain}
    </a>
  </section>
)}
```

Section ordering per ADR-0057: PDF document → website screenshot → website link → existing content (quote, metrics, sichtpass).

#### nachweis-card component

```astro
---
// packages/werkstatt-site/src/domain/ui/components/nachweis-card/nachweis-card-component.astro

interface NachweisAttestationCardProps {
  // ... existing fields ...
  // RFC-0887: display control for website link indicator
  display?: { websiteLink: "visible" | "hidden" };
  websiteUrl?: string;
}

const showWebsiteLink = props.display?.websiteLink === "visible" && props.websiteUrl;
const websiteDomain = props.websiteUrl
  ? new URL(props.websiteUrl).hostname.replace(/^www\./, "")
  : undefined;
---

{showWebsiteLink && (
  <a
    href={props.websiteUrl}
    rel="noopener noreferrer"
    target="_blank"
    class="nachweis-card__website-link"
    aria-label={`Website besuchen: ${websiteDomain}`}
  >
    <span aria-hidden="true">↗</span>
    <span class="sr-only">Website besuchen</span>
  </a>
)}
```

#### nachweis-list component

```astro
---
// packages/werkstatt-site/src/domain/ui/components/nachweis-list/nachweis-list-component.astro

// EvidenceSourceData extended with display/websiteUrl/websiteScreenshot
interface EvidenceSourceData {
  // ... existing fields ...
  display?: { document: "visible" | "hidden"; screenshot: "visible" | "hidden"; websiteLink: "visible" | "hidden" };
  websiteUrl?: string;
  websiteScreenshot?: { sha256: string; mediaType: string; storage: "private" | "public"; url?: string };
}

// loadPublishedNachweisRecords() extracts display/websiteUrl and passes to NachweisCard
// NachweisAttestationRecord extended with display/websiteUrl fields
---
```

### i18n

The existing Nachweis components use hardcoded German labels ("Sichtpass", "Quell-Hash (SHA-256)", "Technische Details", "Beobachtungshistorie"). The new sections follow this pattern: hardcoded German labels ("PDF-Dokument", "Website-Screenshot", "Website besuchen"). UK locale is handled at the content level via the existing locale overlay system, not at the component template level. This is consistent with the existing component architecture — component templates are German-first, content is locale-aware.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/domain/ui/components/nachweis-detail/nachweis-detail-component.astro` | Extended with PDF, screenshot, and website link sections; `NachweisAttestationDetailContent` interface extended with `display`, `websiteUrl`, `websiteScreenshot`, `pdfUrl`, `pdfSha256` |
| `packages/werkstatt-site/src/domain/ui/components/nachweis-detail/nachweis-detail-component.css` | Styles for new sections (PDF viewer container, screenshot figure, link button) |
| `packages/werkstatt-site/src/domain/ui/components/nachweis-card/nachweis-card-component.astro` | Extended with website link indicator; `NachweisAttestationCardProps` extended with `display`, `websiteUrl` |
| `packages/werkstatt-site/src/domain/ui/components/nachweis-list/nachweis-list-component.astro` | `EvidenceSourceData` interface extended with `display`, `websiteUrl`, `websiteScreenshot`; `loadPublishedNachweisRecords()` extracts and passes fields to `NachweisCard` |
| `packages/werkstatt-site/src/domain/ui/components/nachweis-verify/nachweis-verify-component.astro` | No changes (verification page shows hashes, not display sections) |
| `packages/werkstatt-site/src/domain/share/astro/nachweis-routes.ts` | Route resolver mapping extended to extract `display`, `websiteUrl`, `websiteScreenshot`, `pdfUrl`, `pdfSha256` from PBP entity and pass as flat props |
| `packages/werkstatt-site/src/domain/ontology/archetypes/components/nachweis-detail.yaml` | `propsSchema` extended with `display`, `websiteUrl`, `websiteScreenshot`, `pdfUrl`, `pdfSha256` fields |
| `packages/werkstatt-site/src/domain/ontology/archetypes/components/nachweis-card.yaml` | `propsSchema` extended with `display`, `websiteUrl` fields |
| `packages/werkstatt-site/src/domain/ontology/archetypes/components/nachweis-list.yaml` | `propsSchema` `records` array item schema extended with `display`, `websiteUrl` fields |

### Output format

No command output — this RFC is UI-only. The rendered HTML output is verified by post-build checks (`image.delivery.validate`, `a11y.label-in-name.validate`) and E2E tests.

### Failure modes

- If `display` is missing on a Nachweis EvidenceSource entity, `pbp.content.validate` (RFC-0885) rejects the entity before it reaches the UI. The components receive only valid entities.
- If `websiteScreenshot.url` is missing when `display.screenshot === "visible"`, the screenshot section is not rendered (defensive guard: `display?.screenshot === "visible" && websiteScreenshot`).
- If `websiteUrl` is missing when `display.websiteLink === "visible"`, the link section is not rendered (defensive guard: `display?.websiteLink === "visible" && websiteUrl`).

## Rollout

1. **Schema dependency**: RFC-0885 must be implemented first (schema fields exist on entities).
2. **Kernel dependency**: RFC-0886 must be implemented first (screenshot upload populates `websiteScreenshot` field).
3. **Component extension**: Add display-gated sections to `nachweis-detail.astro`.
4. **Card/list extension**: Add website link indicator to `nachweis-card.astro` and `nachweis-list.astro`.
5. **Styles**: Add CSS for new sections (PDF viewer container, screenshot figure, link button).
6. **Tests**: Add component tests verifying conditional rendering (visible/hidden) and E2E tests verifying the full detail page.
7. **Post-build checks**: Verify `image.delivery.validate` passes with screenshot images. Verify `a11y.label-in-name.validate` passes with external link.

## Alternatives considered

- **Single polymorphic component for all sections**: Rejected because the three sections have distinct HTML structures (`<object>` vs `<img>` vs `<a>`) and distinct conditional logic. Separate sections in `nachweis-detail` are clearer and easier to maintain.
- **Client-side rendering with JavaScript**: Rejected because the display decision is static (determined by the `display` field on the entity). Server-side rendering is simpler, faster, and requires no client JS.
- **Placeholder for hidden elements**: Rejected per ADR-0057 — hidden elements leave no trace to respect client privacy.

## Risks

- **PDF viewer compatibility**: Some browsers (especially mobile) may not render `<object>` PDF viewers well. The fallback content (download link) ensures the document is always accessible. ADR-0057 documents this as an accepted trade-off.
- **Screenshot aspect ratio**: Screenshots captured at different resolutions may have different aspect ratios. The `<img>` element with `width` and `height` attributes prevents CLS. The CSS uses `object-fit: contain` to handle varying ratios.
- **External link icon accessibility**: The icon (`↗`) is decorative. The link text (domain name) provides the accessible name. `aria-hidden="true"` on the icon prevents screen readers from announcing it.

## Acceptance criteria

- [ ] `nachweis-detail.astro` renders PDF preview section when `display.document === "visible"` and canonical PDF artifact exists
- [ ] `nachweis-detail.astro` renders website screenshot section when `display.screenshot === "visible"` and `websiteScreenshot` exists
- [ ] `nachweis-detail.astro` renders website link section when `display.websiteLink === "visible"` and `websiteUrl` exists
- [ ] `nachweis-detail.astro` omits all three sections when their `display` aspect is `"hidden"` — no DOM output, no placeholder
- [ ] `nachweis-card.astro` shows website link indicator when `display.websiteLink === "visible"` and `websiteUrl` exists
- [ ] `nachweis-list.astro` shows website link indicator when `display.websiteLink === "visible"` and `websiteUrl` exists
- [ ] PDF `<object>` element has fallback content with download link
- [ ] Screenshot `<img>` has `loading="lazy"`, `decoding="async"`, `fetchpriority="low"`, and `width`/`height` attributes
- [ ] Website link `<a>` has `rel="noopener noreferrer"` and `target="_blank"`
- [ ] External link icon has `aria-hidden="true"`
- [ ] `image.delivery.validate` passes with screenshot images in built HTML
- [ ] `a11y.label-in-name.validate` passes with external link in built HTML
- [ ] Component tests verify conditional rendering for visible and hidden display aspects
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST implement RFC-0885 (schema) and RFC-0886 (kernel) before this RFC — the UI components consume the schema fields populated by the kernel commands.
- Agents MUST follow ADR-0057 for all UI design decisions (HTML elements, loading strategies, section ordering, no-placeholder policy).
- Agents MUST NOT add JavaScript for display gating — the `display` field is static and server-side rendering is sufficient.
- Agents MUST NOT render placeholder or "redacted" indicators for hidden elements — ADR-0057 explicitly decides against this.
- Agents MUST add `width` and `height` attributes to the screenshot `<img>` to prevent CLS.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it.
