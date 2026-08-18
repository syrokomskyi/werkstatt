---
rfcId: RFC-0876
planId: PLAN-RFC-0876-01
status: draft
owner: architecture
createdAt: 2026-08-18
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/werkstatt-site"
  services: []
  docs:
    - docs/rfcs/rfc-0876-add-technical-nachweis-ui-observation-history-and-warpgogol-lighthouse-cloudflare-pilot.md
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0876

## 1. Objectives

- [ ] O1 — Extend `nachweis-card` with discriminated union (attestation + technical-assessment variants) — maps to acceptance criteria 1, 2
- [ ] O2 — Extend `nachweis-list` with `variant`, `kindFilter`, `limit` props — maps to acceptance criteria 4, 5
- [ ] O3 — Extend `nachweis-detail` with technical detail layout and observation history — maps to acceptance criteria 3, 11
- [ ] O4 — Update `/nachweise/` registry page to umbrella evidence semantics with two sections — maps to acceptance criteria 4, 6, 12
- [ ] O5 — Replace homepage static `nachweis-register` trust-strip with dynamic evidence projection — maps to acceptance criteria 8, 9
- [ ] O6 — Update footer to show only stable Nachweise links (no volatile scores) — maps to acceptance criterion 10
- [ ] O7 — Verify timestamp assurance language in `nachweis-verify` obeys RFC-0871 — maps to acceptance criterion 7
- [ ] O8 — Run Lighthouse and Cloudflare pilot observations through N3 publication flow — maps to acceptance criteria 13, 14, 15
- [ ] O9 — Verify all routes, status JSON, and manifest work after deploy — maps to acceptance criterion 16

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/domain/ui/components/nachweis-card/nachweis-card-component.astro` — add `variant` discriminant, technical-assessment rendering path
- `packages/werkstatt-site/src/domain/ui/components/nachweis-card/nachweis-card-component.css` — technical-assessment styles (neutral/matte, `--ds-*` tokens)
- `packages/werkstatt-site/src/domain/ui/components/nachweis-list/nachweis-list-component.astro` — add `variant`, `kindFilter`, `limit` props; compact rendering
- `packages/werkstatt-site/src/domain/ui/components/nachweis-detail/nachweis-detail-component.astro` — technical detail layout, observation history section
- `packages/werkstatt-site/src/domain/ui/components/nachweis-detail/nachweis-detail-component.css` — technical detail styles
- `packages/werkstatt-site/src/domain/ui/components/nachweis-verify/nachweis-verify-component.astro` — verify RFC-0871 timestamp assurance language (likely no change needed)

### 2.2 Configuration and data

- `systems-cache/warpgogol-com/src/content/pages/de/nachweise.md` — update to umbrella registry with two sections (technical + attestation)
- `systems-cache/warpgogol-com/src/content/pages/uk/nachweise.md` — same, UK
- `systems-cache/warpgogol-com/src/content/pages/de/home.md` — replace `nachweis-register` trust-strip with dynamic `nachweis-evidence` block
- `systems-cache/warpgogol-com/src/content/pages/uk/home.md` — same, UK
- `systems-cache/warpgogol-com/src/content/site/de/labels.md` — verify `trustIds` contains only `nachweise` (no volatile scores)
- `systems-cache/warpgogol-com/src/content/site/uk/labels.md` — same, UK

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0876-*.md` — read-only reference
- `packages/werkstatt-site/AGENTS.md` — document technical-assessment variant
- `docs/rfcs/archive/implemented/rfc-0708-*.md` — add `amendedBy: [RFC-0876]` to frontmatter
- `docs/rfcs/archive/implemented/rfc-0716-*.md` — add `amendedBy: [RFC-0876]` to frontmatter

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript + Astro check
- `pnpm exec werkstatt run rfc.validate --id RFC-0876`
- `pnpm exec werkstatt run mission.validate --site warpgogol-com` (pre-deploy)
- `pnpm exec werkstatt run nachweis.validate --site warpgogol-com` (after pilot ingest)

## 3. Step sequence

### Step 1. Define TypeScript contracts for discriminated union

**Goal:** Create the type definitions that all components will use.

**Agent actions:**

- Define `NachweisAttestationCardProps` with `variant: "attestation"` discriminant + all existing props from `nachweis-card-component.astro`
- Define `NachweisTechnicalAssessmentCardProps` with `variant: "technical-assessment"` and all fields from RFC-0876 §2
- Define `NachweisAssessmentDimension` as UI projection of `AssessmentBundleV1["result"]["dimensions"]` (id, providerLabel, score?, numerator?, denominator?, status?, level?)
- Define `NachweisCardProps = NachweisAttestationCardProps | NachweisTechnicalAssessmentCardProps`
- Extend `NachweisListProps` with `variant?: "registry" | "compact"`, `kindFilter?`, `limit?`
- Place types in a shared types file or inline in the component frontmatter

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes with new types

**Completion criterion:** TypeScript compiles with the new discriminated union types and no existing type errors

**Human review:** no

---

### Step 2. Extend `nachweis-card` component

**Goal:** Add technical-assessment rendering path to the existing card component.

**Agent actions:**

- Add `variant` discriminant to component props
- Add technical-assessment rendering: provider/tool name, subject URL, observed time (`<time datetime>`), result (overall score/level + dimensions), methodology, execution provenance, limitation text, link to detail
- Keep existing attestation rendering path unchanged except for the `variant: "attestation"` discriminant
- Add CSS for technical-assessment variant using existing `--ds-*` tokens (neutral/matte surface, no medal/ribbon graphics, no all-green wall)
- Ensure semantic `article`, `dl`, `time`, headings, visible focus
- Color is never sole carrier of pass/fail — always pair with text/status
- Provider names are text labels, not logos

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- Manual render check: technical card renders without person/org/quote/consent props

**Completion criterion:** Technical card renders with all required fields from RFC-0876 §4; attestation card renders unchanged with `variant: "attestation"`

**Human review:** no

---

### Step 3. Extend `nachweis-list` component

**Goal:** Add `variant`, `kindFilter`, `limit` props to the list component.

**Agent actions:**

- Add `variant?: "registry" | "compact"` prop — compact omits context, limitations (full), verifiedScope, notVerifiedScope, sourceHashes
- Add `kindFilter?: Array<"attestation" | "technical-assessment">` prop — filters records by variant
- Add `limit?: number` prop — caps the number of records rendered
- Implement compact rendering path using `nachweis-card` with reduced fields
- Keep registry rendering as default

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes

**Completion criterion:** List component accepts and correctly renders both variants; `kindFilter` filters records; `limit` caps count

**Human review:** no

---

### Step 4. Extend `nachweis-detail` component

**Goal:** Add technical detail layout and observation history section.

**Agent actions:**

- Add technical-assessment rendering path with 12 items from RFC-0876 §2.3: provider/tool, target URL, observed time, methodology, full normalized dimensions, "Was dieser Test misst", "Was dieser Test nicht beweist", execution provenance, canonical source hashes, optional provider report link, N3/Sichtpass, observation history link/list
- Add observation history section: reads PBP entities with same `assessment.seriesId`, sorted by `observedAt` descending, shows up to 5 rows (date | overall/primary result | verification | detail link)
- Do not show Consent status for technical records unless a real Consent is linked
- Use semantic `article`, `dl`, `time`, headings
- Do not draw a chart — use a simple `<table>` or `<ul>` for history rows

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes

**Completion criterion:** Technical detail renders all 12 items; observation history shows immutable published observations sorted by date

**Human review:** no

---

### Step 5. Verify `nachweis-verify` timestamp assurance language

**Goal:** Confirm RFC-0871 compliance.

**Agent actions:**

- Read `nachweis-verify-component.astro` and verify it uses structured `timestamp` prop with `assurance: "rfc3161" | "eidas-qualified"`
- If it uses legacy language (e.g. "qualified timestamp" without distinction), update to RFC-0871 wording
- If already compliant, no change needed — document this in the review

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes

**Completion criterion:** `nachweis-verify` uses RFC-0871 timestamp assurance language

**Human review:** no

---

### Step 6. Update `/nachweise/` registry page content

**Goal:** Change from project-only semantics to umbrella evidence semantics with two sections.

**Agent actions:**

- Update `systems-cache/warpgogol-com/src/content/pages/de/nachweise.md`:
  - Change H1 to `Nachweise`
  - Update lead text per RFC-0876 §3 DE
  - Add `Technische Pruefungen` section heading + explanation
  - Add `Projektnachweise und Kundenbestaetigungen` section heading
  - Replace single `nachweis-list` block with two blocks: one for technical assessments, one for attestations
- Update `systems-cache/warpgogol-com/src/content/pages/uk/nachweise.md` with UK semantic parity
- Ensure no carousel — use semantic `<ul>` lists

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- `pnpm exec werkstatt run page.block.validate --site warpgogol-com` (if available)

**Completion criterion:** `/nachweise/` page has two distinct sections with correct DE/UK copy

**Human review:** no

---

### Step 7. Replace homepage static nachweis block with dynamic projection

**Goal:** Replace the `nachweis-register` trust-strip with a dynamic evidence projection.

**Agent actions:**

- Remove the `nachweis-register` trust-strip block from `home.md` (DE + UK) at line ~476
- Add a new `nachweis-evidence` block after the demo/result section and before "Wie die Zusammenarbeit beginnt" / equivalent UK section
- The block reads published records at build time via `getCollection("business-profile")` and renders a compact `nachweis-list` with:
  - Latest published Lighthouse observation
  - Latest published Cloudflare Agent Readiness observation
  - Up to one published project/client attestation
- Header DE: `Nachweise aus realen Projekten und technischen Pruefungen`
- Subheading: `Nicht nur behauptet. Nachvollziehbar dokumentiert.`
- CTA: `Alle Nachweise ansehen`
- If no records published, fall back to neutral process explanation
- No scores copied manually into `home.md`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- Homepage renders the dynamic block in the correct position

**Completion criterion:** Homepage evidence block appears after demo and before collaboration; values come from published records, not hard-coding

**Human review:** no

---

### Step 8. Verify footer has no volatile scores

**Goal:** Confirm footer contains only stable Nachweise navigation.

**Agent actions:**

- Read `systems-cache/warpgogol-com/src/content/site/de/labels.md` and `uk/labels.md`
- Verify `trustIds` contains only `nachweise` (already confirmed: `trustIds: [nachweise]`)
- Verify no Lighthouse/Cloudflare numbers appear in footer content
- If volatile scores are found, remove them

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes

**Completion criterion:** Footer contains only stable Nachweise links, no volatile scores

**Human review:** no

---

### Step 9. Update `amendedBy` reciprocation on RFC-0708 and RFC-0716

**Goal:** Add `amendedBy: [RFC-0876]` to the amended RFCs.

**Agent actions:**

- Edit `docs/rfcs/archive/implemented/rfc-0708-*.md` frontmatter: add `RFC-0876` to `amendedBy[]`
- Edit `docs/rfcs/archive/implemented/rfc-0716-*.md` frontmatter: add `RFC-0876` to `amendedBy[]`
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0876` to confirm V-19 warnings are resolved

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0876` — zero V-19 warnings

**Completion criterion:** Both amended RFCs have `amendedBy: [RFC-0876]`; `rfc.validate` reports zero warnings for RFC-0876

**Human review:** no

---

### Step 10. Run Lighthouse pilot observation

**Goal:** Capture and publish a canonical Lighthouse observation for warpgogol.com.

**Agent actions:**

- Run `pnpm exec werkstatt run nachweis.measure.lighthouse --site warpgogol-com --url https://warpgogol.com --series-id warpgogol-lighthouse-home --methodology-id WG-LH-01 --methodology-version 1.0 --authorization-basis site-owner --runs 5 --freshness-days 30`
- Run `pnpm exec werkstatt run nachweis.validate --site warpgogol-com`
- Run `pnpm exec werkstatt run nachweis.sign --site warpgogol-com --slug <generated-slug>`
- Run `pnpm exec werkstatt run nachweis.timestamp --site warpgogol-com --slug <generated-slug>`
- Run `pnpm exec werkstatt run nachweis.approve --site warpgogol-com --slug <generated-slug> --verification-level N3`
- Run `pnpm exec werkstatt run nachweis.publish --site warpgogol-com --slug <generated-slug>`
- Run `pnpm exec werkstatt run nachweis.manifest.generate --site warpgogol-com`

**Validation:**

- `nachweis.validate` passes with zero violations
- `nachweis.manifest.generate` produces manifest with the new record

**Completion criterion:** Lighthouse observation completes N3 and publishes through the policy gate; manifest contains the record

**Human review:** yes — operator must execute the measurement command (requires Chrome/Lighthouse runtime). Agent can run the publication flow after measurement.

---

### Step 11. Run Cloudflare pilot observation

**Goal:** Capture and publish a canonical Cloudflare Agent Readiness observation for warpgogol.com.

**Agent actions:**

- Run `pnpm exec werkstatt run nachweis.measure.cloudflare-agent-readiness --site warpgogol-com --url https://warpgogol.com --series-id warpgogol-cloudflare-agent-readiness --methodology-id CF-AR-01 --methodology-version 1.0 --authorization-basis site-owner --freshness-days 30`
- Run the same publication flow as Step 10 (validate → sign → timestamp → approve N3 → publish → manifest.generate)

**Validation:**

- `nachweis.validate` passes with zero violations
- Manifest contains the Cloudflare record

**Completion criterion:** Cloudflare observation completes N3 and publishes through the policy gate

**Human review:** yes — operator must execute the measurement command (requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` env vars). Agent can run the publication flow after measurement.

---

### Step 12. Build, validate, and deploy

**Goal:** Verify the full site builds and deploys with the new components and content.

**Agent actions:**

- Run `pnpm --filter @warpgogol/werkstatt-site run build:check`
- Run `pnpm exec werkstatt run mission.validate --site warpgogol-com`
- Build the site (`astro build`)
- Verify `/nachweise/`, both detail pages, verify pages, status JSON, and manifest work

**Validation:**

- `build:check` passes
- `mission.validate` passes
- All routes return 200

**Completion criterion:** Site builds and all Nachweis routes work after deploy

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update `packages/werkstatt-site/AGENTS.md` with technical-assessment variant documentation
- Update `docs/rfcs/archive/implemented/rfc-0708-*.md` and `rfc-0716-*.md` with `amendedBy` (done in Step 9)
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion against implemented code. Mark `[x]` with `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0876 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0876`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off; RFC stamped as `implemented`

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0876`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm exec werkstatt run mission.validate --site warpgogol-com`
- `pnpm exec werkstatt run nachweis.validate --site warpgogol-com`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0876.generated.json` — verification evidence (if acceptance probes declared)
- Commit messages referencing `RFC-0876` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Agent omits `variant` discriminant | Step 1 defines types with required discriminant; Step 2 enforces at render time |
| Slug collision for observation history | Step 10/11 use observation-level slugs (seriesId + observationId) |
| Homepage empty state | Step 7 includes fallback to neutral process explanation |
| Pilot execution failure | Steps 10/11 are operator-driven; failed measurement does not block build |
| Existing attestation tests break | Step 2 updates existing call sites with `variant: "attestation"` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-17, DNA-23, or DNA-24, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0876 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `nachweis-list` block type is rejected by `page.block.validate`, add the block type to the archetype registry before proceeding — do not bypass validation.
