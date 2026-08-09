---
rfcId: RFC-0512
planId: PLAN-RFC-0512-01
status: draft
owner: architecture
createdAt: 2026-07-24
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/share"
    - "@gogol/ontology"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-handoff"
  services: []
  docs:
    - docs/technology.xml
    - docs/knowledge-graph.xml
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0512

## 1. Objectives

- [ ] O1 — Extend `SemanticPerson` and JSON-LD Person builder with `address`, `knowsAbout`, `affiliation` — maps to acceptance criterion "Human profile pages emit Person + BreadcrumbList JSON-LD with name, jobTitle, description, url, address (consent-gated), knowsAbout, sameAs (consent-gated), affiliation"
- [ ] O2 — Create `filterPublicParticipant` and JSON-LD builders for Person, SoftwareApplication, CollectionPage — maps to acceptance criterion "filterPublicParticipant strips private fields"
- [ ] O3 — Generate static JSON endpoints at build time (`/team/profiles.json`, `/team/[slug]/profile.json`, `/team/ki-agenten/[slug]/profile.json`) — maps to acceptance criteria for JSON endpoint generation
- [ ] O4 — Update C-contract files (`jsonld-types.yaml`, `url-schema.yaml`) with new types, surface policies, and route patterns — maps to acceptance criterion "jsonld-types.yaml includes Person, SoftwareApplication types and team surface policies"
- [ ] O5 — Implement `participant.json.validate` and wire into `sites-check-postbuild` — maps to acceptance criterion "participant.json.validate passes and is registered in sites-check-postbuild"
- [ ] O6 — Register no-op migrator `rfc-0512` in migrator registry — maps to acceptance criterion "No-op migrator rfc-0512 is registered"
- [ ] O7 — Update `amendedBy` on RFC-0200, sync Compass XML and AGENTS.md — maps to acceptance criterion "rfc.validate passes"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/share/src/astro/participant-json.ts` — **New file**: `filterPublicParticipant`, `buildPersonJsonLd`, `buildSoftwareApplicationJsonLd`, `buildTeamHubCollectionPageJsonLd`, `generateParticipantJsonEndpoints`
- `packages/share/src/semantic/models.ts` — Extend `SemanticPerson` with `address?`, `knowsAbout?`, `affiliation?`
- `packages/share/src/semantic/business-projection.ts` — Extend `projectPeople` to map `location` → `address`, `capabilities` → `knowsAbout`, org affiliation
- `packages/share/src/semantic/jsonld/person.ts` — Extend `buildPersonNode` to emit `address`, `knowsAbout`, `affiliation` when present (optional fields, backward-compatible)
- `packages/share/src/astro/page-handler/resolve-route.ts` — For profile pages, replace Person node from `buildPersonNode` with `buildPersonJsonLd` output in `@graph`
- `packages/os/site-kernel-checks/src/participant-json.ts` — **New file**: `runParticipantJsonValidate`
- `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts` — Register `participant.json.validate` command entry
- `packages/os/site-kernel-checks/src/pipelines/sites-check-postbuild.ts` — Add `{ command: "participant.json.validate" }` step
- `packages/os/site-kernel-handoff/src/migrators/rfc-0512.ts` — **New file**: no-op migrator
- `packages/os/site-kernel-handoff/src/migrators/registry.ts` — Import and register `rfc0512Migrator`

### 2.2 Configuration and data

- `packages/ontology/src/external-surfaces/jsonld-types.yaml` — Add `Person`, `SoftwareApplication` type definitions; add `team-hub`, `team-profile-human`, `team-profile-ai-agent` surface policies
- `packages/ontology/src/external-surfaces/url-schema.yaml` — Add `/team/profiles.json`, `/team/[slug]/profile.json`, `/team/ki-agenten/[slug]/profile.json` route patterns

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0200-*.md` — Add `RFC-0512` to `amendedBy` frontmatter (V-19 fix)
- `docs/technology.xml` — Add `participant.json.generate` and `participant.json.validate` to command surface
- `docs/knowledge-graph.xml` — Add RFC-0512 relationships to semantic graph
- `packages/os/site-kernel-checks/AGENTS.md` — Add `participant.json.validate` to command inventory

### 2.4 Validation and pipelines

- `sites-check-postbuild` — New step `participant.json.validate` after `seo.structured-data.validate`
- `surface.contract.validate` — Must pass with updated C-contract
- `seo.structured-data.validate` — Must pass for team pages with new surface policies
- `migrator.registry.validate` — Must pass with new migrator registered

## 3. Step sequence

### Step 1. Extend SemanticPerson type and projection

**Goal:** Add `address`, `knowsAbout`, `affiliation` fields to `SemanticPerson` and map them in `projectPeople`.

**Agent actions:**

- Add `address?: { addressLocality: string; addressRegion?: string; addressCountry: string }`, `knowsAbout?: string[]`, `affiliation?: { name: string; url?: string }` to `SemanticPerson` in `packages/share/src/semantic/models.ts`
- Extend `projectPeople` in `packages/share/src/semantic/business-projection.ts` to map participant `location` → `address` (split "Backnang, Baden-Württemberg" into `addressLocality` + `addressRegion`), `capabilities` → `knowsAbout`, and organization info → `affiliation`
- Extend `buildPersonNode` in `packages/share/src/semantic/jsonld/person.ts` to emit `address`, `knowsAbout`, `affiliation` when present on `SemanticPerson` (all optional — non-profile pages are unaffected)

**Validation:**

- `pnpm --filter @gogol/share run build:check`

**Completion criterion:** `SemanticPerson` type extended; `projectPeople` maps the three new fields; `buildPersonNode` emits them when present; `build:check` passes.

**Human review:** no

---

### Step 2. Create participant-json.ts with filter and JSON-LD builders

**Goal:** Implement the core filtering and JSON-LD builder functions.

**Agent actions:**

- Create `packages/share/src/astro/participant-json.ts`
- Implement `filterPublicParticipant(participant, lang) → PublicParticipantJson` — strips private fields, applies consent gating for `location` and `sameAs`
- Implement `buildPersonJsonLd(participant, siteUrl, lang) → PersonNode` — builds extended Person JSON-LD with `address` (consent-gated), `knowsAbout`, `affiliation`, `sameAs` (consent-gated); excludes `birthDate`
- Implement `buildSoftwareApplicationJsonLd(participant, siteUrl, lang) → SoftwareApplicationNode` — builds SoftwareApplication JSON-LD with `provider` linking to accountable human's public profile URL
- Implement `buildTeamHubCollectionPageJsonLd(participants, siteUrl) → CollectionPageNode` — builds CollectionPage with `hasPart` listing all public, active participants
- Implement `generateParticipantJsonEndpoints(participants, siteUrl, outputDir)` — writes `profiles.json`, individual `profile.json` files to `dist/`

**Validation:**

- `pnpm --filter @gogol/share run build:check`

**Completion criterion:** All five functions implemented and type-checked; private fields (`consent.consentRecordId`, `profileOwner`, `retentionClass`, `aiAgent.technicalStand.agentId`, `aiAgent.technicalStand.toolsetVersion`, `aiAgent.rightsMatrix.dataAccess`) are never in output.

**Human review:** no

---

### Step 3. Wire JSON-LD builders into profile page synthesis

**Goal:** Replace the Person node from `buildPersonNode` with the extended `buildPersonJsonLd` output for profile pages only.

**Agent actions:**

- In `packages/share/src/astro/page-handler/resolve-route.ts`, for human profile pages: use `buildPersonJsonLd` instead of `buildPersonNode` for the Person node in the `@graph`
- For AI-agent profile pages: inject `buildSoftwareApplicationJsonLd` output into the `@graph`
- For the team hub page: inject `buildTeamHubCollectionPageJsonLd` output into the `@graph`
- Non-profile pages (home, about, etc.) continue using `buildPersonNode` unchanged

**Validation:**

- `pnpm --filter @gogol/share run build:check`

**Completion criterion:** Profile pages emit the correct JSON-LD type (Person with extended fields, SoftwareApplication, or CollectionPage); non-profile pages are unaffected.

**Human review:** no

---

### Step 4. Update C-contract files

**Goal:** Add new JSON-LD types, surface policies, and URL patterns to the ontology C-contract.

**Agent actions:**

- In `packages/ontology/src/external-surfaces/jsonld-types.yaml`:
  - Add `Person` type with `required: [name, url]`, `optional: [jobTitle, description, image, address, knowsAbout, sameAs, affiliation]`
  - Add `SoftwareApplication` type with `required: [name, applicationCategory, url]`, `optional: [description, operatingSystem, provider, offers]`
  - Add `CollectionPage` type with `required: [name, url, hasPart]`, `optional: [description]`
  - Add `surfacePolicy` entries for `team-hub`, `team-profile-human`, `team-profile-ai-agent`
- In `packages/ontology/src/external-surfaces/url-schema.yaml`:
  - Add `/team/profiles.json` pattern (static JSON, no params)
  - Add `/team/[slug]/profile.json` pattern (param: `slug`)
  - Add `/team/ki-agenten/[slug]/profile.json` pattern (param: `slug`)

**Validation:**

- `pnpm --filter @gogol/ontology run build:check`
- `pnpm exec site-kernel run surface.contract.validate --site warpgogol-com`

**Completion criterion:** C-contract files updated; `surface.contract.validate` passes with the new definitions.

**Human review:** no

---

### Step 5. Implement participant.json.validate

**Goal:** Create the validator that checks JSON endpoint shape, private field exclusion, and JSON-LD type compliance.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/participant-json.ts` with `runParticipantJsonValidate`
- The validator scans `dist/team/profiles.json`, `dist/team/[slug]/profile.json`, `dist/team/ki-agenten/[slug]/profile.json`
- Checks: profiles.json exists and lists all public/active participants; each entry has required fields; no private fields present; no `lifespan.born`/`lifespan.died` in human JSON; consent-gated fields absent without consent; JSON-LD `@type` compliance on profile/hub pages
- Empty state: if no public participants, `profiles.json` with `participants: []` is valid (no-op pass, exit 0)
- Register the command in `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts` with `scope: "app"`, `supportsAllSites: true`, `reads: ["<app>/dist/team/**/*.json"]`
- Add `{ command: "participant.json.validate" }` to `SITES_CHECK_POSTBUILD_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/sites-check-postbuild.ts` (after `seo.structured-data.validate`)

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run participant.json.validate --site warpgogol-com --json`

**Completion criterion:** Validator runs, passes on valid output, fails on private field leakage; registered in command table and postbuild pipeline.

**Human review:** no

---

### Step 6. Register no-op migrator

**Goal:** Create and register the RFC-0512 no-op migrator.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0512.ts` — no-op migrator (returns `data` unchanged), following the `rfc-0495`/`rfc-0506` pattern
- Set `fromVersion` and `toVersion` based on the current platform version (determine at implementation time — the latest `toVersion` in the registry is `4.17.0` from RFC-0506; RFC-0512 should use the next appropriate version bump)
- Import and register in `packages/os/site-kernel-handoff/src/migrators/registry.ts` — add import, add to `migratorRegistry` array, add `CHANGE_SUMMARY` entry

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm exec site-kernel run migrator.registry.validate`

**Completion criterion:** Migrator file created; registered in registry; `migrator.registry.validate` passes.

**Human review:** no

---

### Step 7. Fix RFC-0200 amendedBy backreference

**Goal:** Add `RFC-0512` to RFC-0200's `amendedBy` frontmatter to resolve the V-19 warning.

**Agent actions:**

- Read `docs/rfcs/rfc-0200-*.md` and add `RFC-0512` to the `amendedBy` list in frontmatter

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0512`

**Completion criterion:** `rfc.validate` passes with zero warnings (V-19 resolved).

**Human review:** no

---

### Step 8. Compass sync and AGENTS.md update

**Goal:** Synchronize documentation artifacts with the implementation.

**Agent actions:**

- Update `docs/technology.xml` — add `participant.json.generate` (build.prepare step) and `participant.json.validate` (sites-check-postbuild step) to the command surface
- Update `docs/knowledge-graph.xml` — add RFC-0512 relationships (amends RFC-0200, related to RFC-0508/0509/0510/0511/0513, satisfies DNA-53)
- Update `packages/os/site-kernel-checks/AGENTS.md` — add `participant.json.validate` to the command inventory
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed

**Validation:**

- `git diff --name-only` shows only expected files
- `pnpm exec site-kernel run workspace.surface.validate`

**Completion criterion:** All scope docs updated; `workspace.surface.validate` passes.

**Human review:** no

---

### Final Step. Acceptance criteria verification and stamp

**Goal:** Verify all acceptance criteria, stamp RFC as implemented.

**Agent actions:**

- Run full validation suite:
  - `pnpm exec site-kernel run rfc.validate RFC-0512`
  - `pnpm --filter @gogol/share run build:check`
  - `pnpm --filter @gogol/ontology run build:check`
  - `pnpm --filter @gogol/site-kernel-checks run build:check`
  - `pnpm --filter @gogol/site-kernel-handoff run build:check`
  - `pnpm exec site-kernel run surface.contract.validate --site warpgogol-com`
  - `pnpm exec site-kernel run migrator.registry.validate`
  - `pnpm exec site-kernel run sites-check.postbuild --site warpgogol-com`
- Check off each acceptance criterion in the RFC with `(evidence: <command or file>)`
- Stamp: `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0512 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from current session
- All acceptance criteria checked off

**Completion criterion:** RFC stamped as `implemented`; all validation passes; clean working tree.

**Human review:** no — `accepted → implemented` is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0512`
- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm exec site-kernel run surface.contract.validate --site warpgogol-com`
- `pnpm exec site-kernel run migrator.registry.validate`
- `pnpm exec site-kernel run sites-check.postbuild --site warpgogol-com`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0512.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0512` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| JSON endpoints expose too much | Step 2 (`filterPublicParticipant` strips private fields) + Step 5 (`participant.json.validate` checks for private field absence) |
| Consent-gated fields in JSON vs HTML mismatch | Step 2 (same `consent.approvedFields` gate in `filterPublicParticipant`) + Step 5 (validator checks consistency) |
| CollectionPage `hasPart` grows large | Not a concern for 1–20 participants; noted in RFC non-goals for future paginated endpoint |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-24 (block-declarative pages) — JSON endpoints are static files, not block-declarative — run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0512 --reason "..." --invariant "DNA-24"` instead of working around it.
- If the JSON-LD builder integration in `resolve-route.ts` conflicts with the existing `buildJsonLd` orchestration in `jsonld.ts`, escalate to the architecture owner before modifying the `@graph` assembly path.
