---
rfcId: RFC-0499
planId: PLAN-RFC-0499-01
status: draft
owner: architecture
createdAt: 2026-07-23
updatedAt:
scope:
  apps:
    - webgogol-com
  packages:
    - "@gogol/site-kernel-checks"
    - "@gogol/share"
    - "@gogol/ui"
    - "@gogol/ontology"
    - "@gogol/site-kernel-handoff"
  services: []
  docs:
    - docs/verification-plan.xml
    - docs/COMMANDS.md
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0499

## 1. Objectives

- [ ] Objective 1 — Layer C contract: add `mediaLeakagePolicy` to `jsonld-types.yaml` and Zod schema in `index.ts` — maps to acceptance criterion "packages/ontology/src/external-surfaces/jsonld-types.yaml includes the mediaLeakagePolicy section"
- [ ] Objective 2 — Baker changes: stop emitting media metadata into readable block props; emit `Konzeptillustration` label and `/bildnachweise/#...` link — maps to acceptance criteria "No surface page renders ... in visible HTML" and "AI-generated images display Konzeptillustration label" and "AI-generated images link to /bildnachweise/#..."
- [ ] Objective 3 — New validator: implement `surface.media-leakage.validate` with context-aware matching — maps to acceptance criterion "surface.media-leakage.validate scans rendered HTML and fails on prohibited strings using context-aware matching"
- [ ] Objective 4 — Update existing validators: add media-leakage rules to `surface.validate` and media-leakage policy to `surface.contract.validate` — maps to acceptance criterion "surface.contract.validate includes the media-leakage policy from the Layer C contract"
- [ ] Objective 5 — UI component: update `<MaterialCredit>` to suppress visible credit rows on surface pages — maps to acceptance criterion "Media metadata appears only in JSON-LD <script> blocks and on /bildnachweise/"
- [ ] Objective 6 — Pipeline registration: register `surface.media-leakage.validate` in command table and add to `sites-check-postbuild` — maps to acceptance criterion "surface.media-leakage.validate is registered in tools/kernel.config.ts and runs in sites-check-postbuild"
- [ ] Objective 7 — Documentation sync: update `docs/verification-plan.xml`, `docs/COMMANDS.md`, `packages/os/site-kernel-checks/AGENTS.md` — maps to acceptance criterion "RFC-0231 amendedBy includes RFC-0499" (documentation sync)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ontology/src/external-surfaces/jsonld-types.yaml` — add `mediaLeakagePolicy` section with prohibited strings, matching strategies, context selectors
- `packages/ontology/src/external-surfaces/index.ts` — add Zod schema for `mediaLeakagePolicy`, load from YAML
- `packages/os/site-kernel-checks/src/surface-expand/bake.ts` — baker: stop emitting media metadata fields into readable block props; emit `Konzeptillustration` label and `/bildnachweise/#...` link for AI-generated images
- `packages/os/site-kernel-checks/src/surface-media-leakage-validate.ts` — new file: `surface.media-leakage.validate` command handler
- `packages/os/site-kernel-checks/src/surface/validate.ts` — add media-leakage rules to `surface.validate`
- `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts` — register `surface.media-leakage.validate` command entry
- `packages/os/site-kernel-checks/src/pipelines/sites-check-postbuild.ts` — add `surface.media-leakage.validate` to `SITES_CHECK_POSTBUILD_PIPELINE`
- `packages/os/site-kernel-handoff/src/surface-contract.ts` — update `surface.contract.validate` to check media-leakage policy from Layer C contract
- `packages/ui/src/components/material-credit/*` — surface-page mode: suppress visible credit row, emit `Konzeptillustration` label
- `packages/share/src/semantic/jsonld.ts` — verify JSON-LD emission is not affected (no changes expected, but verify)

### 2.2 Configuration and data

- `packages/ontology/src/external-surfaces/jsonld-types.yaml` — declarative Layer C contract extension

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0499-media-metadata-leakage-prevention-on-surface-pages.md` — read-only reference
- `docs/rfcs/archive/implemented/rfc-0231-unified-attribution-visibility-policy-for-credits-prose-and-copyright.md` — update `amendedBy` to include RFC-0499 (already done during enhance)
- `docs/verification-plan.xml` — add `surface.media-leakage.validate` check entry
- `docs/COMMANDS.md` — add `surface.media-leakage.validate` command documentation
- `packages/os/site-kernel-checks/AGENTS.md` — document `surface.media-leakage.validate` in the check commands table

### 2.4 Validation and pipelines

- `sites-check-postbuild` pipeline — add `surface.media-leakage.validate` step
- `build.post` pipeline — inherits via `SITES_CHECK_POSTBUILD_PIPELINE` spread
- `surface.contract.validate` — updated to include media-leakage policy checks
- `surface.validate` — updated to include media-leakage rules

## 3. Step sequence

### Step 1. Layer C contract: add `mediaLeakagePolicy` to ontology

**Goal:** Declare the media-leakage policy as a Layer C contract in `@gogol/ontology`.

**Agent actions:**

- Add `mediaLeakagePolicy` section to `packages/ontology/src/external-surfaces/jsonld-types.yaml` with:
  - `prohibitedStrings`: list of `{ pattern, matchingStrategy, contextSelector?, reason }` entries
  - `requiredLabels`: list of allowed labels (`Konzeptillustration`, localized variants)
  - `requiredLinkPattern`: `/bildnachweise/#...` link pattern for AI-generated images
- Add Zod schema for `mediaLeakagePolicy` in `packages/ontology/src/external-surfaces/index.ts`
- Load the policy from YAML alongside existing `surfacePolicy`
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42)

**Validation:**

- `pnpm --filter @gogol/ontology run build:check` — typecheck passes
- `pnpm exec site-kernel run surface.contract.validate --site webgogol-com --json` — contract loads without errors

**Completion criterion:** `mediaLeakagePolicy` section present in `jsonld-types.yaml`; Zod schema validates the YAML; `build:check` passes for `@gogol/ontology`.

**Human review:** no

---

### Step 2. Baker changes: suppress media metadata in readable block props

**Goal:** Update `bakePage` to stop emitting media metadata into readable block props and emit `Konzeptillustration` labels instead.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/surface-expand/bake.ts`:
  - Identify where media metadata fields (`author`, `source`, `aiPlatform`, `copyright`, `usageBasis`) are emitted into readable block props (card descriptions, image captions, prose content)
  - Remove or suppress these fields from readable block props
  - For AI-generated images: emit a `Konzeptillustration` (or localized equivalent) `<figcaption>` label
  - For AI-generated images: emit a link to `/bildnachweise/#...` anchor
  - For AI-generated images: emit `data-ai-generated` attribute on `<img>` or `<figure>` element — this is how the validator identifies AI-generated images in rendered HTML (grilling decision: data-attribute approach, no sidecar cross-reference)
  - Ensure media metadata still flows into JSON-LD `<script>` blocks via the semantic layer (verify `buildJsonLd` in `@gogol/share` is not affected)
- Update `CHANGE_SUMMARY` in `bake.ts` with RFC-0499 entry

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes
- `pnpm exec site-kernel run surface.generate --site webgogol-com` — baker runs without errors
- Manual spot-check: inspect a generated surface page artifact for absence of media metadata in block props

**Completion criterion:** No media metadata fields (`author`, `source`, `aiPlatform`, `copyright`, `usageBasis`) appear in readable block props of generated surface pages; `Konzeptillustration` label and `/bildnachweise/#...` link are emitted for AI-generated images; `build:check` passes.

**Human review:** no

---

### Step 3. UI component: update `<MaterialCredit>` for surface pages

**Goal:** Update the `<MaterialCredit>` component to suppress visible credit rows on surface pages and emit the `Konzeptillustration` label instead.

**Agent actions:**

- In `packages/ui/src/components/material-credit/*`:
  - Add a surface-page mode (prop or context detection) that suppresses the visible credit row
  - In surface-page mode: emit only `Konzeptillustration` (or localized equivalent) as a `<figcaption>` label
  - In surface-page mode: emit a link to `/bildnachweise/#...` anchor
  - In non-surface mode: preserve existing behavior (RFC-0231 visibility policy)
- Add `data-credit-context` attribute to credit-context elements (`<figcaption>`, `<details>`, card metadata `<dl>`) — this attribute is used by the validator for context-aware matching

**Validation:**

- `pnpm --filter @gogol/ui run build:check` — typecheck passes
- Visual spot-check: render a surface page with AI-generated image and verify `Konzeptillustration` label appears, no full credit text

**Completion criterion:** `<MaterialCredit>` in surface-page mode emits `Konzeptillustration` label and `/bildnachweise/#...` link only; `data-credit-context` attribute present on credit-context elements; `build:check` passes.

**Human review:** no

---

### Step 4. New validator: implement `surface.media-leakage.validate`

**Goal:** Create the `surface.media-leakage.validate` command that scans rendered surface page HTML for prohibited metadata strings using context-aware matching.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/surface-media-leakage-validate.ts`:
  - Load the `mediaLeakagePolicy` from `@gogol/ontology` external-surfaces contract
  - Read rendered HTML from `dist/client/**/*.html` for surface page routes only (use route registry to identify surface pages by `surfaceId`)
  - For each prohibited string:
    - `exact` strategy: exact phrase match in visible HTML (exclude `<script>`, `<footer>`, `[data-footer]`)
    - `whole-word` strategy: case-sensitive whole-word match anywhere in visible HTML
    - `context-aware` strategy: match only inside elements with `data-credit-context` attribute or inside `<figcaption>`, `<details>`, card metadata `<dl>`
  - Identify AI-generated images by `data-ai-generated` attribute on `<img>` or `<figure>` elements (grilling decision: data-attribute approach)
  - Check each AI-generated image has `Konzeptillustration` (or localized equivalent) label in adjacent `<figcaption>`
  - Check each AI-generated image has link to `/bildnachweise/#...`
  - Return `MediaLeakageValidateResult` with violations
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42)
- Register command in `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts`
- Add to `SITES_CHECK_POSTBUILD_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/sites-check-postbuild.ts`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes
- `pnpm exec site-kernel run surface.media-leakage.validate --site webgogol-com --json` — command runs and returns valid result

**Completion criterion:** `surface.media-leakage.validate` command is registered, runs in `sites-check-postbuild`, scans rendered HTML with context-aware matching, and returns violations in the specified format.

**Human review:** no

---

### Step 5. Update existing validators

**Goal:** Add media-leakage rules to `surface.validate` and media-leakage policy checks to `surface.contract.validate`.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/surface/validate.ts`:
  - Add media-leakage rules as additional checks (check for prohibited strings in the surface artifact's block props — this is a pre-build check on the generated YAML, complementing the post-build HTML scan)
  - Update `CHANGE_SUMMARY` with RFC-0499 entry
- In `packages/os/site-kernel-handoff/src/surface-contract.ts`:
  - Load `mediaLeakagePolicy` from the Layer C contract
  - Add checks that verify rendered HTML matches the media-leakage policy
  - Update `CHANGE_SUMMARY` with RFC-0499 entry

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes
- `pnpm --filter @gogol/site-kernel-handoff run build:check` — typecheck passes
- `pnpm exec site-kernel run surface.validate --site webgogol-com --json` — passes
- `pnpm exec site-kernel run surface.contract.validate --site webgogol-com --json` — includes media-leakage policy checks

**Completion criterion:** `surface.validate` includes media-leakage rules; `surface.contract.validate` includes media-leakage policy from Layer C contract; both pass `build:check`.

**Human review:** no

---

### Step 6. Documentation sync

**Goal:** Update all documentation artifacts affected by the new validator and Layer C contract changes.

**Agent actions:**

- Update `docs/verification-plan.xml` — add `surface.media-leakage.validate` check entry in the postbuild section
- Update `docs/COMMANDS.md` — add `surface.media-leakage.validate` command documentation
- Update `packages/os/site-kernel-checks/AGENTS.md` — add `surface.media-leakage.validate` to the check commands table and document `src/surface-media-leakage-validate.ts` in the module table
- Verify `docs/rfcs/archive/implemented/rfc-0231-unified-attribution-visibility-policy-for-credits-prose-and-copyright.md` has `amendedBy: [RFC-0499]` (already done during enhance)
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed

**Validation:**

- `git diff --name-only` — verify all scope docs are updated
- `pnpm exec site-kernel run rfc.validate --id RFC-0499` — passes

**Completion criterion:** All documentation artifacts in scope are updated; `ecosystem.manifest.generate` run if needed.

**Human review:** no

---

### Step 7. Full validation and evidence

**Goal:** Run the full validation suite, verify all acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0499` — must pass
- Run `pnpm --filter @gogol/ontology run build:check` — must pass
- Run `pnpm --filter @gogol/site-kernel-checks run build:check` — must pass
- Run `pnpm --filter @gogol/site-kernel-handoff run build:check` — must pass
- Run `pnpm --filter @gogol/ui run build:check` — must pass
- Run `pnpm --filter @gogol/share run build:check` — must pass
- Run `pnpm exec site-kernel run surface.media-leakage.validate --site webgogol-com --json` — must pass (0 violations)
- Run `pnpm exec site-kernel run surface.contract.validate --site webgogol-com --json` — must pass
- Check off all acceptance criteria in the RFC with inline `(evidence: ...)` annotations
- Stamp the RFC as implemented: `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0499 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0499` — passes
- All acceptance criteria checked off

**Completion criterion:** All validation checks pass; all acceptance criteria verified; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0499`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/ui run build:check`
- `pnpm --filter @gogol/share run build:check`
- `pnpm exec site-kernel run surface.media-leakage.validate --site webgogol-com --json`
- `pnpm exec site-kernel run surface.contract.validate --site webgogol-com --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0499` in the subject line (RFC-0265 commit hygiene)
- `docs/rfcs/verification/rfc-0499.generated.json` — verification evidence (RFC-0330, if acceptance probes declared)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives for "Gemini" and "Organization" | Step 4: context-aware matching using `data-credit-context` attribute and credit-context elements (`<figcaption>`, `<details>`, `<dl>`); Step 3: add `data-credit-context` attribute to credit-context elements |
| Performance: scanning all surface page HTML | Step 4: validator scans only surface page routes (identified by `surfaceId` in route registry), not all pages; runs once per `sites-check-postbuild` invocation |
| Footer copyright on surface pages | Step 4: validator excludes `<footer>` and `[data-footer]` elements from `Copyright © 2026 Webgogol` check |
| Legitimate "Gemini" in prose | Step 4: context-aware matching ensures only credit-context occurrences are flagged |
| Baker regression: dropping JSON-LD | Step 2: verify `buildJsonLd` in `@gogol/share` is not affected; JSON-LD emission is handled by the semantic layer, which is not modified |
| Migration: existing surface pages | Step 2: surface pages are regenerated by `surface.generate` on each build — no manual content migration needed |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-24 (block-declarative pages), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0499 --reason "..." --invariant "DNA-24"` instead of working around it.
- If the `mediaLeakagePolicy` schema cannot be expressed in the existing `jsonld-types.yaml` format without breaking the Layer C contract structure, escalate to a new RFC amending RFC-0480.
