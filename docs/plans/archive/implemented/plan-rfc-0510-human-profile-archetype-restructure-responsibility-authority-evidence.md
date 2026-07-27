---
rfcId: RFC-0510
planId: PLAN-RFC-0510-01
status: draft
owner: architecture
createdAt: 2026-07-24
updatedAt:
scope:
  apps:
    - webgogol-com
  packages:
    - "@gogol/share"
    - "@gogol/site-kernel-checks"
  services: []
  docs:
    - docs/rfcs/rfc-0510-human-profile-archetype-restructure-responsibility-authority-evidence.md
    - packages/share/AGENTS.md
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0510

## 1. Objectives

- [ ] O1 — Extend `ParticipantView` with `responsibility`, `authority`, `evidence`, `consent` fields (maps to acceptance: "Andrii's Participant record has `responsibility`, `authority`, `evidence`, updated `consent`")
- [ ] O2 — Replace `personSynthetic` with `buildHumanProfileBlocks` six-block structure in `resolve-route.ts` (maps to: "`buildHumanProfileBlocks` produces the six-block structure")
- [ ] O3 — Change breadcrumb parent from `about` to `team` in `getParticipantProfileRoutes` (maps to: "Breadcrumb parent is the `team` page")
- [ ] O4 — Create `participant.profile.validate` command and register in `SITES_CHECK_AUTHOR_PIPELINE` (maps to: "`participant.profile.validate` passes and is registered")
- [ ] O5 — Restructure Andrii's prose into three separate files and update Participant record (maps to: "Andrii's prose is split into three files" + "Andrii's Participant record has `responsibility`, `authority`, `evidence`")
- [ ] O6 — Verify all acceptance criteria and stamp RFC as implemented

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/share/src/astro/people.ts` — extend `ParticipantView` interface with `responsibility`, `authority`, `evidence`, `consent` fields; project them from merged Participant data in `getParticipantsForSection`
- `packages/share/src/astro/page-handler/resolve-route.ts` — replace `personSynthetic` with `buildHumanProfileBlocks(participant, lang)` producing six blocks
- `packages/share/src/astro/people-routes.ts` — `getParticipantProfileRoutes`: find team page (`pageId === "team"` or `semanticType === "collection"`) for `parentPageId` instead of about page
- `packages/os/site-kernel-checks/src/participant-profile.ts` — new file: `runParticipantProfileValidate` command handler
- `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts` — register `participant.profile.validate` command entry
- `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` — add `{ command: "participant.profile.validate" }` after `team.hub.validate` (line 170)
- `packages/os/site-kernel-checks/src/index.ts` — export `runParticipantProfileValidate` if needed by command table

### 2.2 Configuration and data

- `missions/webgogol-com-m000010/workpiece/src/content/people/de/andrii-syrokomskyi.md` — add `responsibility`, `authority`, `evidence` fields; update `consent`; remove `stats` from hero usage
- `missions/webgogol-com-m000010/workpiece/src/content/prose/de/andrii-syrokomskyi-beruflich.md` — new file: professional career prose
- `missions/webgogol-com-m000010/workpiece/src/content/prose/de/andrii-syrokomskyi-nachweise.md` — new file: evidence links with status labels
- `missions/webgogol-com-m000010/workpiece/src/content/prose/de/andrii-syrokomskyi-persoenlich.md` — new file: personal background prose (consent-gated)
- `missions/webgogol-com-m000010/workpiece/src/content/prose/de/andrii-syrokomskyi.md` — remove (content split into three files)

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0510-human-profile-archetype-restructure-responsibility-authority-evidence.md` — read-only reference (acceptance criteria source of truth)
- `packages/share/AGENTS.md` — note `ParticipantView` extension and `buildHumanProfileBlocks` in `resolve-route.ts`
- `packages/os/site-kernel-checks/AGENTS.md` — note `participant.profile.validate` command and pipeline registration

### 2.4 Validation and pipelines

- `SITES_CHECK_AUTHOR_PIPELINE` — new step `participant.profile.validate` after `team.hub.validate`
- `rfc.validate --id RFC-0510` — must pass (only shared V-19 warning expected)
- `pnpm --filter @gogol/share run build:check` — typecheck after ParticipantView extension
- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck after new command

## 3. Step sequence

### Step 1. Extend `ParticipantView` interface

**Goal:** Add `responsibility`, `authority`, `evidence`, `consent` fields to `ParticipantView` and project them from merged Participant data.

**Agent actions:**

- Edit `packages/share/src/astro/people.ts`: add optional fields to `ParticipantView` interface:
  ```ts
  responsibility?: { summary: string; scope?: string; pbpReferences?: string[] };
  authority?: { canSignFor?: string[]; canCommitTo?: string[]; escalationRoute?: string };
  evidence?: { claims?: Array<{ claimId: string; sourceRef: string; verifiedAt?: string }>; disclosures?: Array<{ type: string; text: string; url?: string }> };
  consent?: { consentRecordId: string; approvedFields: string[]; approvedMedia?: string[]; consentDate: string; withdrawalRoute?: string; profileReviewer: string };
  ```
- In `getParticipantsForSection`, project these fields from the merged `data` object onto the returned `ParticipantView`

**Validation:**

- `pnpm --filter @gogol/share run build:check` — typecheck passes

**Completion criterion:** `ParticipantView` interface includes all four fields; `getParticipantsForSection` projects them from merged data; typecheck passes.

**Human review:** no

---

### Step 2. Implement `buildHumanProfileBlocks` in `resolve-route.ts`

**Goal:** Replace the two-block `personSynthetic` with the six-block `buildHumanProfileBlocks` function.

**Agent actions:**

- Edit `packages/share/src/astro/page-handler/resolve-route.ts`: replace the `personSynthetic` construction with a call to `buildHumanProfileBlocks(participant, lang)`
- Implement `buildHumanProfileBlocks` per the TypeScript contract in RFC-0510 §Design:
  - Block 1: Hero (name, role, location, photo — no statement, no stats)
  - Block 2: `controlled-responsibility-block` with `body.primaryItems`/`body.secondaryItems` (omit when both responsibility and authority absent)
  - Block 3: Evidence markdown block with `contentRef: prose/${slug}-nachweise`
  - Block 4: Career markdown block with `contentRef: prose/${slug}-beruflich`
  - Block 5: Personal markdown block with `contentRef: prose/${slug}-persoenlich` (only when `consent.approvedFields` includes `bio`)
  - Block 6: CTA `final-cta` (omit for `status: former`/`retired`)
- Import `participantPageId` from `people-routes.ts` for `pageId` props

**Validation:**

- `pnpm --filter @gogol/share run build:check` — typecheck passes

**Completion criterion:** `personSynthetic` is replaced; `buildHumanProfileBlocks` produces six blocks per the RFC contract; typecheck passes.

**Human review:** no

---

### Step 3. Change breadcrumb parent in `people-routes.ts`

**Goal:** Change `getParticipantProfileRoutes` to use the team page as `parentPageId` instead of the about page.

**Agent actions:**

- Edit `packages/share/src/astro/people-routes.ts`: in `getParticipantProfileRoutes`, find the team page by `pageId === "team"` or `semanticType === "collection"` (taking precedence over `semanticType === "about"`)
- Set `parentPageId` to the team page's `pageId` when found; fall back to the about page when no team page exists; fall back to no `parentPageId` when neither exists

**Validation:**

- `pnpm --filter @gogol/share run build:check` — typecheck passes

**Completion criterion:** `parentPageId` resolves to the team page when it exists; typecheck passes.

**Human review:** no

---

### Step 4. Create `participant.profile.validate` command

**Goal:** Implement the validation command that enforces the six-block structure, consent gating, and prose file presence.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/participant-profile.ts`:
  - Export `runParticipantProfileValidate(input, context)` following the pattern of `team-hub.ts`
  - Load system manifest, find people records for the default language
  - For each human participant with `page.enabled: true` and `visibility: public`:
    - Check career prose file (`prose/{lang}/{slug}-beruflich.md`) exists
    - Check evidence prose file (`prose/{lang}/{slug}-nachweise.md`) exists
    - When `consent.approvedFields` includes `bio`: check personal prose file (`prose/{lang}/{slug}-persoenlich.md`) exists
    - Check `evidence.claims` items with `verifiedAt` have `sourceRef` URL
    - Check `responsibility.summary` and `authority.canSignFor`/`canCommitTo` items are non-empty strings
    - Check `status: former`/`retired` participants do not have `cta`
  - Return `passResult` when no violations; `resultFromViolations` otherwise
  - No-op pass when no people records exist (same as `team.hub.validate`)
- Register in `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts`: add command entry with `scope: "site"`, `execute: runParticipantProfileValidate`
- Register in `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts`: add `{ command: "participant.profile.validate" }` after `{ command: "team.hub.validate" }` (line 170)
- Export from `packages/os/site-kernel-checks/src/index.ts` if needed

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes
- `pnpm exec site-kernel run participant.profile.validate --site webgogol-com --json` — command is discoverable

**Completion criterion:** Command is registered, discoverable, and typechecks; pipeline includes it after `team.hub.validate`.

**Human review:** no

---

### Step 5. Restructure Andrii's prose files and Participant record

**Goal:** Split the single prose file into three separate files and add `responsibility`, `authority`, `evidence` to the Participant record.

**Agent actions:**

- Create `missions/webgogol-com-m000010/workpiece/src/content/prose/de/andrii-syrokomskyi-beruflich.md` with the professional career prose (from RFC-0510 §Andrii's profile restructure)
- Create `missions/webgogol-com-m000010/workpiece/src/content/prose/de/andrii-syrokomskyi-nachweise.md` with the evidence links list
- Create `missions/webgogol-com-m000010/workpiece/src/content/prose/de/andrii-syrokomskyi-persoenlich.md` with the personal background prose
- Remove `missions/webgogol-com-m000010/workpiece/src/content/prose/de/andrii-syrokomskyi.md` (content split into three files)
- Edit `missions/webgogol-com-m000010/workpiece/src/content/people/de/andrii-syrokomskyi.md`:
  - Add `responsibility`, `authority`, `evidence` fields per RFC-0510 §Andrii's profile restructure YAML
  - Update `consent` with `approvedMedia`, `withdrawalRoute`, `profileReviewer`
  - Remove `stats` from frontmatter (no longer used in hero)

**Validation:**

- `pnpm exec site-kernel run participant.validate --site webgogol-com --json` — Participant record validates against schema
- `pnpm exec site-kernel run content.references.validate --site webgogol-com --json` — prose file references resolve

**Completion criterion:** Three prose files exist; old prose file removed; Participant record has new fields and validates; content references resolve.

**Human review:** no — but note `profileReviewer: "andrii-syrokomskyi"` is a self-reviewed placeholder (RFC-0510 notes this)

---

### Step 6. Run full validation suite

**Goal:** Verify all acceptance criteria pass and the full build check pipeline is green.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0510` — only shared V-19 warning expected
- Run `pnpm exec site-kernel run sites-check.run --site webgogol-com --json` — full author pipeline including new `participant.profile.validate`
- Run `pnpm --filter @gogol/share run build:check` — package typecheck
- Run `pnpm --filter @gogol/site-kernel-checks run build:check` — package typecheck
- Verify each acceptance criterion in RFC-0510 against the implemented code

**Validation:**

- All commands pass (warnings acceptable for shared V-19)

**Completion criterion:** All validation commands pass; every acceptance criterion is verified.

**Human review:** no

---

### Step 7. Documentation sync and stamp implemented

**Goal:** Update documentation artifacts, check off acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update `packages/share/AGENTS.md` — note `ParticipantView` extension and `buildHumanProfileBlocks` in `resolve-route.ts`
- Update `packages/os/site-kernel-checks/AGENTS.md` — note `participant.profile.validate` command and pipeline registration
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed
- Check off all acceptance criteria in RFC-0510 with `(evidence: ...)` annotations
- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0510 --implementation-commit <sha>` to transition `accepted → implemented`

**Validation:**

- `git status` — no uncommitted changes from current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0510`
- All scope docs updated or documented as not-applicable

**Completion criterion:** All documentation artifacts updated; all acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476)

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0510`
- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run sites-check.run --site webgogol-com --json`
- `pnpm exec site-kernel run participant.validate --site webgogol-com --json`
- `pnpm exec site-kernel run participant.profile.validate --site webgogol-com --json`
- `pnpm exec site-kernel run content.references.validate --site webgogol-com --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0510` in the subject line (RFC-0265 commit hygiene)
- `docs/rfcs/verification/rfc-0510.generated.json` — verification evidence (RFC-0330, if acceptance probes declared)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Prose file restructuring breaks existing content references | Step 5 creates three new files before removing the old one; Step 6 runs `content.references.validate` |
| Consent gating removes content | Step 2 implements consent check in `buildHumanProfileBlocks`; Step 4 validates consent-gated prose file presence |
| Breadcrumb parent change | Step 3 implements team-page precedence with about-page fallback; Step 6 runs full pipeline |
| Empty states (responsibility without authority) | Step 2 handles single-column rendering when `secondaryItems` is empty |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-24 (block-declarative pages), DNA-37 (SectionProps), or DNA-38 (canonical item objects), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0510 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `controlled-responsibility-block` archetype cannot accept the `body.split-list` props shape as described, stop and create an ADR documenting the actual props contract before proceeding.
