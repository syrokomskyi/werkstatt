---
rfcId: RFC-0887
planId: PLAN-RFC-0887-01
status: draft
owner: architecture
createdAt: 2026-08-20
updatedAt:
scope:
  apps: []
  packages:
    - werkstatt-site
  services: []
  docs:
    - docs/styling.xml
---

# Implementation Plan: RFC-0887

## 1. Objectives

- [ ] O1 — Extend `nachweis-detail-component.astro` with display-gated PDF, screenshot, and website link sections (maps to acceptance criteria 1–4, 7–10)
- [ ] O2 — Extend `nachweis-card-component.astro` with website link indicator (maps to acceptance criterion 5)
- [ ] O3 — Extend `nachweis-list-component.astro` to pass `display`/`websiteUrl` to `NachweisCard` (maps to acceptance criterion 6)
- [ ] O4 — Extend route resolver `nachweis-routes.ts` to extract new fields from PBP entity (maps to acceptance criterion 14)
- [ ] O5 — Update archetype YAMLs with new `propsSchema` fields (maps to acceptance criterion 15)
- [ ] O6 — Add CSS styles for new sections (maps to acceptance criterion 7)
- [ ] O7 — Add component tests for conditional rendering (maps to acceptance criterion 13)
- [ ] O8 — Verify post-build checks pass (`image.delivery.validate`, `a11y.label-in-name.validate`) (maps to acceptance criteria 11–12)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/domain/ui/components/nachweis-detail/nachweis-detail-component.astro` — extend `NachweisAttestationDetailContent` interface with `display`, `websiteUrl`, `websiteScreenshot`, `pdfUrl`, `pdfSha256`; add three conditional rendering sections
- `packages/werkstatt-site/src/domain/ui/components/nachweis-detail/nachweis-detail-component.css` — styles for `.nachweis-detail__pdf`, `.nachweis-detail__screenshot`, `.nachweis-detail__website-link`
- `packages/werkstatt-site/src/domain/ui/components/nachweis-card/nachweis-card-component.astro` — extend `NachweisAttestationCardProps` with `display`, `websiteUrl`; add website link indicator
- `packages/werkstatt-site/src/domain/ui/components/nachweis-card/nachweis-card-component.css` — styles for `.nachweis-card__website-link`
- `packages/werkstatt-site/src/domain/ui/components/nachweis-list/nachweis-list-component.astro` — extend `EvidenceSourceData` with `display`, `websiteUrl`, `websiteScreenshot`; extend `loadPublishedNachweisRecords()` to pass fields to `NachweisCard`
- `packages/werkstatt-site/src/domain/share/astro/nachweis-routes.ts` — no changes needed (route resolver only generates `NachweisRouteEntry` objects with `pageId`, `slug`, `routes`; it does not populate content props; content props are populated by the page block from the PBP entity at build time)
- `packages/werkstatt-site/src/domain/pbp/` — Zod schema for `PbpWebsiteScreenshot` extended with `capturedAt: string` field (Step 0, RFC-0885 amendment)

### 2.2 Configuration and data

- `packages/werkstatt-site/src/domain/ontology/archetypes/components/nachweis-detail.yaml` — add `display`, `websiteUrl`, `websiteScreenshot`, `pdfUrl`, `pdfSha256` to `propsSchema`
- `packages/werkstatt-site/src/domain/ontology/archetypes/components/nachweis-card.yaml` — add `display`, `websiteUrl` to `propsSchema`
- `packages/werkstatt-site/src/domain/ontology/archetypes/components/nachweis-list.yaml` — add `display`, `websiteUrl` to `records` array item schema in `propsSchema`

### 2.3 Documentation and specs

- RFC file (read-only reference): `docs/rfcs/rfc-0887-*.md`
- ADR-0057 (read-only reference): `docs/adrs/adr-0057-*.md`
- `docs/styling.xml` — update if new UI sections require styling contract changes
- No `AGENTS.md` updates needed (component extension, no new commands)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/werkstatt-site run test` — Vitest unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0887`
- Post-build: `image.delivery.validate` (screenshot `<img>` responsive attributes)
- Post-build: `a11y.label-in-name.validate` (external link accessible name)
- Post-build: `a11y.label-in-name.component.validate` (component-source label-in-name check)
- Post-build: `csp.origins.validate` (external `websiteUrl` in `href`)

## 3. Step sequence

### Step 0. Amend RFC-0885 to add `capturedAt` to `PbpWebsiteScreenshot`

**Goal:** Add a `capturedAt: string` (ISO 8601) field to `PbpWebsiteScreenshot` so the UI can display the screenshot capture date.

**Agent actions:**

- Check RFC-0885 status: if `draft` or `accepted`, add `capturedAt: string` to `PbpWebsiteScreenshot` interface in the RFC text and to the Zod schema in `packages/werkstatt-site/src/domain/pbp/`
- If RFC-0885 is `implemented`, create a new RFC (RFC-0888 or next available) to add the field
- Update RFC-0887 code example to use `websiteScreenshot.capturedAt` instead of undefined `formatDate(observedAt)`
- Run `rfc.validate --id RFC-0885` (and `RFC-0887` if updated)
- Commit

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0885`
- `pnpm exec werkstatt run rfc.validate --id RFC-0887`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** `PbpWebsiteScreenshot` schema includes `capturedAt: string` field; RFC-0887 code example references `websiteScreenshot.capturedAt`.

**Human review:** yes — if RFC-0885 is `implemented`, a new RFC is needed and requires human acceptance. If `draft` or `accepted`, the amendment is a direct edit.

---

### Step 1. Extend archetype YAML schemas

**Goal:** Add new fields to `propsSchema` in all three archetype YAML files so content authors and tooling can author and validate the new display-gated fields.

**Agent actions:**

- Add `display` (object with `document`, `screenshot`, `websiteLink` enum fields), `websiteUrl` (string), `websiteScreenshot` (object with `sha256`, `mediaType`, `storage`, `url`, `capturedAt`), `pdfUrl` (string), `pdfSha256` (string) to `nachweis-detail.yaml` `propsSchema`
- Add `display` (object with `websiteLink` enum field), `websiteUrl` (string) to `nachweis-card.yaml` `propsSchema`
- Add `display` (object with `websiteLink` enum field), `websiteUrl` (string) to `nachweis-list.yaml` `records` array item schema in `propsSchema`
- All new fields are optional (existing `.passthrough()` means they won't break existing content)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- Archetype YAMLs parse without errors

**Completion criterion:** All three archetype YAML files contain the new fields in their `propsSchema` and TypeScript compilation passes.

**Human review:** no

---

### Step 2. Extend `nachweis-detail-component.astro` interfaces and rendering

**Goal:** Add the three display-gated sections (PDF, screenshot, website link) to the detail component with correct conditional rendering.

**Agent actions:**

- Extend `NachweisAttestationDetailContent` interface with `display?: { document: "visible" | "hidden"; screenshot: "visible" | "hidden"; websiteLink: "visible" | "hidden" }`, `websiteUrl?: string`, `websiteScreenshot?: { sha256: string; mediaType: string; storage: "private" | "public"; url?: string; capturedAt?: string }`, `pdfUrl?: string`, `pdfSha256?: string`
- Add derived variables: `domain` (extracted from `websiteUrl` via `new URL()`), `captureDate` (from `websiteScreenshot.capturedAt`)
- Add PDF section: `{display?.document === "visible" && pdfUrl && (...)}` using `<object>` with fallback download link and SHA-256 hash display
- Add screenshot section: `{display?.screenshot === "visible" && websiteScreenshot?.url && (...)}` using `<img>` with `loading="lazy"`, `decoding="async"`, `fetchpriority="low"`, `width="1280"`, `height="720"`, plus `<figcaption>` caption
- Add website link section: `{display?.websiteLink === "visible" && websiteUrl && (...)}` using `<a>` with `rel="noopener noreferrer"`, `target="_blank"`, icon `aria-hidden="true"`
- Section ordering per ADR-0057: PDF → screenshot → website link → existing content
- Use German labels: "PDF-Dokument", "Website-Screenshot", "Website besuchen"
- Use BEM class naming consistent with existing component: `.nachweis-detail__pdf`, `.nachweis-detail__screenshot`, `.nachweis-detail__website-link`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- `a11y.label-in-name.component.validate` passes (no aria-label/visible text mismatch)

**Completion criterion:** Component renders three conditional sections when display aspects are "visible" and corresponding data exists; omits all sections when aspects are "hidden" or data is missing.

**Human review:** no

---

### Step 3. Add CSS styles for `nachweis-detail` new sections

**Goal:** Style the PDF viewer container, screenshot figure, and website link button.

**Agent actions:**

- Add `.nachweis-detail__pdf` styles: full-width container, responsive `<object>` height (use `aspect-ratio` or `max-height` for mobile)
- Add `.nachweis-detail__pdf-hash` styles: monospace hash display, consistent with existing `.sichtpass__hash` styling
- Add `.nachweis-detail__screenshot` styles: responsive figure, `object-fit: contain` for varying aspect ratios
- Add `.nachweis-detail__screenshot-figure` and `figcaption` styles
- Add `.nachweis-detail__website-link` styles: button-like appearance, external link icon
- Add `.nachweis-detail__website-link-icon` styles: inline-block, margin
- Add `.sr-only` utility class if not already present in component CSS

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- Visual inspection in dev server

**Completion criterion:** New sections have consistent visual treatment with existing component sections; responsive on mobile.

**Human review:** no

---

### Step 4. Extend `nachweis-card-component.astro` with website link indicator

**Goal:** Add a conditional website link indicator to the card component.

**Agent actions:**

- Extend `NachweisAttestationCardProps` interface with `display?: { websiteLink: "visible" | "hidden" }`, `websiteUrl?: string`
- Add derived variable: `showWebsiteLink = props.display?.websiteLink === "visible" && props.websiteUrl`
- Add derived variable: `websiteDomain` extracted from `websiteUrl` via `new URL().hostname.replace(/^www\./, "")`
- Render `<a>` with `rel="noopener noreferrer"`, `target="_blank"`, `aria-label={`Website besuchen: ${websiteDomain}`}`, icon `aria-hidden="true"`
- Use BEM class: `.nachweis-card__website-link`
- Place indicator in card footer or metadata area, after existing content

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- `a11y.label-in-name.component.validate` passes

**Completion criterion:** Card shows website link indicator when `display.websiteLink === "visible"` and `websiteUrl` exists; omits indicator otherwise.

**Human review:** no

---

### Step 5. Add CSS styles for `nachweis-card` website link indicator

**Goal:** Style the website link indicator in the card.

**Agent actions:**

- Add `.nachweis-card__website-link` styles: inline link with icon, consistent with card metadata styling
- Add `.nachweis-card__website-link-icon` styles

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes

**Completion criterion:** Website link indicator has consistent visual treatment with existing card elements.

**Human review:** no

---

### Step 6. Extend `nachweis-list-component.astro` with display/websiteUrl passthrough

**Goal:** Pass `display` and `websiteUrl` from the PBP entity through `EvidenceSourceData` to `NachweisCard`.

**Agent actions:**

- Extend `EvidenceSourceData` interface with `display?: { document: "visible" | "hidden"; screenshot: "visible" | "hidden"; websiteLink: "visible" | "hidden" }`, `websiteUrl?: string`, `websiteScreenshot?: { sha256: string; mediaType: string; storage: "private" | "public"; url?: string; capturedAt?: string }`
- In `loadPublishedNachweisRecords()`, when building attestation records (the `else` branch at line 228), extract `display` and `websiteUrl` from `data` and include them in the pushed record object
- The `NachweisRecord` attestation variant type must be extended to accept `display` and `websiteUrl` (these are passed as spread props to `NachweisCard`)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- `pnpm --filter @warpgogol/werkstatt-site run test` passes

**Completion criterion:** `nachweis-list` passes `display` and `websiteUrl` to `NachweisCard` for attestation records; `NachweisCard` renders the website link indicator when conditions are met.

**Human review:** no

---

### Step 7. Add component tests

**Goal:** Verify conditional rendering logic for all three display aspects.

**Agent actions:**

- Create or extend test file for `nachweis-detail-component.astro` with test cases:
  - PDF section renders when `display.document === "visible"` and `pdfUrl` exists
  - PDF section omits when `display.document === "hidden"`
  - PDF section omits when `display.document === "visible"` but `pdfUrl` is missing
  - Screenshot section renders when `display.screenshot === "visible"` and `websiteScreenshot.url` exists
  - Screenshot section omits when `display.screenshot === "hidden"`
  - Website link section renders when `display.websiteLink === "visible"` and `websiteUrl` exists
  - Website link section omits when `display.websiteLink === "hidden"`
  - All sections omit when `display` is `undefined` (backward compatibility)
- Create or extend test file for `nachweis-card-component.astro` with test cases:
  - Website link indicator renders when `display.websiteLink === "visible"` and `websiteUrl` exists
  - Website link indicator omits when `display.websiteLink === "hidden"`
  - Website link indicator omits when `display` is `undefined`
- Use existing test patterns from the package (vitest + astro component testing)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test` passes with new tests

**Completion criterion:** All test cases pass; conditional rendering is verified for visible, hidden, and undefined display states.

**Human review:** no

---

### Step 8. Post-build validation

**Goal:** Verify that the built HTML passes all post-build checks.

**Agent actions:**

- Run `astro build` (or `build.prepare` + `astro build` via mission pipeline if in a mission context)
- Verify `image.delivery.validate` passes — screenshot `<img>` must have responsive `srcset` or `width`/`height` attributes
- Verify `a11y.label-in-name.validate` passes — external link `aria-label` must include visible text (domain name)
- Verify `csp.origins.validate` passes — external `websiteUrl` domain must be in CSP `script-src` or relevant directives (note: `websiteUrl` in `href` is a navigation link, not a script/style origin, so CSP should not be affected — but verify)
- Fix any violations found

**Validation:**

- All post-build checks pass on built HTML with display-gated sections rendered

**Completion criterion:** `image.delivery.validate`, `a11y.label-in-name.validate`, and `csp.origins.validate` pass without violations on pages with display-gated sections.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update `docs/styling.xml` if new UI sections require styling contract changes (check if PDF viewer, screenshot figure, or website link button introduce new styling patterns that need Compass documentation)
- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0887 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0887`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0887`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- Post-build: `image.delivery.validate` (on built HTML with screenshot section)
- Post-build: `a11y.label-in-name.validate` (on built HTML with external link)
- Post-build: `a11y.label-in-name.component.validate` (on component source)
- Post-build: `csp.origins.validate` (on built HTML with external `href`)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0887.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0887` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| PDF viewer compatibility on mobile | Step 3: CSS uses responsive height; fallback download link in Step 2 |
| PDF viewer performance on mobile | Step 3: CSS uses `loading="lazy"` on `<object>` or deferred rendering |
| PDF tracking privacy | Accepted trade-off — PDF is first-party R2-served signed document; no mitigation needed |
| Screenshot aspect ratio | Step 3: CSS uses `object-fit: contain` with `width`/`height` attributes |
| External link icon accessibility | Step 2: `aria-hidden="true"` on icon; link text provides accessible name |
| Agent misinterpretation of prop flow | Step 2: interface extension follows real prop flow; Step 7: tests verify conditional rendering |
| Backward compatibility with existing content | All new fields are optional; defensive guards (`display?.document === "visible"`) evaluate to `false` when `display` is `undefined` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 or DNA-59, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0887 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the page block that passes content to `nachweis-detail` cannot be extended to include the new fields (e.g., the page block schema is more restrictive than expected), escalate to a new RFC for the page block schema extension.
- If `image.delivery.validate` flags the screenshot `<img>` as non-responsive and the fix requires changing the image delivery pipeline (not just adding attributes), escalate to a new RFC.
