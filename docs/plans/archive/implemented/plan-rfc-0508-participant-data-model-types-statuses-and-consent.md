---
rfcId: RFC-0508
planId: PLAN-RFC-0508-01
status: draft
owner: architecture
createdAt: 2026-07-24
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/share"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-handoff"
    - "@gogol/ui"
  services: []
  docs:
    - docs/requirements.xml
    - docs/technology.xml
    - docs/source-markup.xml
    - packages/os/site-kernel-checks/AGENTS.md
    - packages/share/AGENTS.md
---

# Implementation Plan: RFC-0508

## 1. Objectives

- [ ] Objective 1 — Create `participantSchema` with `PARTICIPANT_TYPES`, `PARTICIPANT_RELATIONSHIPS`, `PARTICIPANT_STATUSES` in `packages/share/src/schemas/participant.ts` — maps to acceptance criterion "participantSchema defined"
- [ ] Objective 2 — Create `participant.validate` command replacing `people.validate` in `packages/os/site-kernel-checks/src/participant.ts` — maps to acceptance criterion "participant.validate registered"
- [ ] Objective 3 — Rename `getPeopleForSection` to `getParticipantsForSection`, `getPersonProfileRoutes` to `getParticipantProfileRoutes`, `personPageId` to `participantPageId`, `PersonView` to `ParticipantView` and update all callers — maps to acceptance criterion "getParticipantsForSection and getParticipantProfileRoutes replace Person equivalents"
- [ ] Objective 4 — Create and register RFC-0508 migrator with PBT and snapshot tests — maps to acceptance criterion "RFC-0508 migrator registered and idempotent"
- [ ] Objective 5 — Wire `participant.validate` into `SITES_CHECK_AUTHOR_PIPELINE` replacing `people.validate` — maps to acceptance criterion "participant.validate registered in sites-check.run"
- [ ] Objective 6 — Migrate existing Andrii Person records to Participant records — maps to acceptance criterion "Existing Andrii Person records migrated"
- [ ] Objective 7 — Synchronize documentation (AGENTS.md, Compass XML) and stamp implemented — maps to acceptance criterion "rfc.validate passes"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/share/src/schemas/participant.ts` — new file: `participantSchema`, `PARTICIPANT_TYPES`, `PARTICIPANT_RELATIONSHIPS`, `PARTICIPANT_STATUSES`, `ParticipantData`
- `packages/share/src/schemas/index.ts` — re-export participant schema exports
- `packages/share/src/astro/people.ts` — rename `getPeopleForSection` to `getParticipantsForSection`, `PersonView` to `ParticipantView`, re-export `participantPageId`, filter by `participantType` and `visibility: public`
- `packages/share/src/astro/people-routes.ts` — rename `getPersonProfileRoutes` to `getParticipantProfileRoutes`, `personPageId` to `participantPageId`, filter by `page.enabled`, `visibility: public`, `status: active`
- `packages/share/src/astro/page-handler/resolve-route.ts` — update imports
- `packages/share/src/astro/routes/registry.ts` — update imports
- `packages/ui/src/sections/people/people-section.astro` — update imports
- `packages/os/site-kernel-checks/src/participant.ts` — new file: `runParticipantValidate` (replaces `people.ts`)
- `packages/os/site-kernel-checks/src/people.ts` — removed
- `packages/os/site-kernel-checks/src/module.ts` — register `participant.validate`, remove `people.validate`
- `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` — replace `people.validate` step with `participant.validate`
- `packages/os/site-kernel-handoff/src/migrators/rfc-0508.ts` — new migrator
- `packages/os/site-kernel-handoff/src/migrators/registry.ts` — register `rfc-0508`
- `packages/os/site-kernel-handoff/src/migrators/rfc-0508.pbt.test.ts` — PBT test
- `packages/os/site-kernel-handoff/src/migrators/rfc-0508.snapshot.test.ts` — snapshot test
- `packages/os/site-kernel-handoff/src/tests/migrators.test.ts` — update registry count assertion

### 2.2 Configuration and data

- `missions/warpgogol-com-m000010/workpiece/src/content/people/de/andrii-syrokomskyi.md` — migrator adds `participantType`, `status`, `visibility`, `relationshipType`, `consent` fields
- `missions/warpgogol-com-m000010/workpiece/src/content/people/uk/andrii-syrokomskyi.md` — same migration

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — document `participant.validate` replacing `people.validate`
- `packages/share/AGENTS.md` — document `participantSchema` in schemas subpath entry
- `docs/requirements.xml` — update if participant model changes are semantically significant
- `docs/technology.xml` — update if technology stack changes
- `docs/source-markup.xml` — add Compass scaffolding for new source files (`participant.ts`)

### 2.4 Validation and pipelines

- `SITES_CHECK_AUTHOR_PIPELINE` — `participant.validate` replaces `people.validate` step
- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm exec site-kernel run migrator.registry.validate`
- `pnpm exec site-kernel run rfc.validate --id RFC-0508`

## 3. Step sequence

### Step 1. Create participant schema

**Goal:** Define the canonical Participant schema with all types, statuses, relationships, consent, and type-specific fields.

**Agent actions:**

- Create `packages/share/src/schemas/participant.ts` with `participantSchema` (Zod flat strict object), `PARTICIPANT_TYPES`, `PARTICIPANT_RELATIONSHIPS`, `PARTICIPANT_STATUSES`, `ParticipantData` type
- Import `PERSON_AFFILIATIONS` from `./person.ts` for the human `affiliations` field
- Export `CONSENT_APPROVED_FIELDS` vocabulary array
- Re-export from `packages/share/src/schemas/index.ts`

**Validation:**

- `pnpm --filter @gogol/share run build:check`

**Completion criterion:** `participantSchema` parses valid participant records and rejects invalid ones; `build:check` passes.

**Human review:** no

---

### Step 2. Create participant.validate command

**Goal:** Replace `people.validate` with `participant.validate` enforcing the full Participant contract.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/participant.ts` with `runParticipantValidate`
- Implement validation rules: missing `participantType`, missing required fields per type, consent for public humans, `accountableHumanId` for AI agents, `visibility: private` for service-accounts, no active CTA for former/retired, `consent.approvedFields` vocabulary check, photo asset token check, `sameAs` URL check
- Register `participant.validate` command in `packages/os/site-kernel-checks/src/module.ts`
- Remove `people.validate` registration and delete `packages/os/site-kernel-checks/src/people.ts`
- Update `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts`: replace `{ command: "people.validate" }` with `{ command: "participant.validate" }`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `participant.validate --site warpgogol-com --json` runs (pass or fail depending on migration state); `people.validate` no longer registered.

**Human review:** no

---

### Step 3. Rename functions and update callers

**Goal:** Rename all Person-specific functions to Participant-specific names and update every caller.

**Agent actions:**

- In `packages/share/src/astro/people-routes.ts`: rename `personPageId` to `participantPageId`, `getPersonProfileRoutes` to `getParticipantProfileRoutes`, `PersonRouteEntry` to `ParticipantRouteEntry`
- In `packages/share/src/astro/people.ts`: rename `getPeopleForSection` to `getParticipantsForSection`, `PersonView` to `ParticipantView`, re-export `participantPageId`, add `participantType` and `visibility` fields to `ParticipantView`, filter by `visibility: public`
- In `packages/share/src/astro/page-handler/resolve-route.ts`: update imports and type references
- In `packages/share/src/astro/routes/registry.ts`: update imports and function calls
- In `packages/ui/src/sections/people/people-section.astro`: update imports
- In `packages/share/src/astro/people.ts`: update `selectPeople` to accept `ParticipantView[]` and filter by `participantType`/`status`/`visibility` when specified

**Validation:**

- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/ui run build:check`

**Completion criterion:** No references to old function names remain; `build:check` passes for `@gogol/share` and `@gogol/ui`.

**Human review:** no

---

### Step 4. Create and register RFC-0508 migrator

**Goal:** Create the idempotent content migrator that transforms Person records to Participant records.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0508.ts` matching the `Migrator` interface
- Implement `transform`: for each `people/{lang}/*.md`, add `participantType: human`, `status: active` (or `draft` if `page.enabled` is false), `visibility: public` (or `private`), `relationshipType` derived from `affiliations`, `consent` record placeholder with `profileReviewer = slug` and `consentDate = file mtime`
- Register in `packages/os/site-kernel-handoff/src/migrators/registry.ts`
- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0508.pbt.test.ts` — idempotency test `f(f(x)) === f(x)`
- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0508.snapshot.test.ts` — snapshot test on real data
- Update `packages/os/site-kernel-handoff/src/tests/migrators.test.ts` — update registry count assertion

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff test`
- `pnpm exec site-kernel run migrator.registry.validate`

**Completion criterion:** Migrator registered, PBT and snapshot tests pass, `migrator.registry.validate` passes.

**Human review:** no

---

### Step 5. Run migrator on warpgogol-com workpiece

**Goal:** Transform existing Andrii Person records to Participant records.

**Agent actions:**

- Run `pnpm exec site-kernel run mission.migrate --mission warpgogol-com-m000010` (or the appropriate mission for the current workpiece)
- Verify `missions/warpgogol-com-m000010/workpiece/src/content/people/de/andrii-syrokomskyi.md` now has `participantType: human`, `status: active`, `visibility: public`, `relationshipType: founder`, `consent` record
- Verify `missions/warpgogol-com-m000010/workpiece/src/content/people/uk/andrii-syrokomskyi.md` same
- Commit workpiece changes via `mission.git.commit`

**Validation:**

- `pnpm exec site-kernel run participant.validate --site warpgogol-com --json` — passes

**Completion criterion:** Both Andrii records have participant fields; `participant.validate` passes.

**Human review:** no

---

### Step 6. Documentation sync

**Goal:** Update AGENTS.md files and Compass XML to reflect the Participant model.

**Agent actions:**

- Update `packages/os/site-kernel-checks/AGENTS.md` — document `participant.validate` replacing `people.validate`
- Update `packages/share/AGENTS.md` — document `participantSchema` in the schemas subpath entry table
- Update `docs/source-markup.xml` — add Compass scaffolding entries for `participant.ts` (new source files)
- Update `docs/requirements.xml` and `docs/technology.xml` if semantically significant changes
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed

**Validation:**

- `pnpm exec site-kernel run rfc.validate --id RFC-0508`
- `pnpm exec site-kernel run compass.validate` (if available)

**Completion criterion:** All scope docs updated or documented as not-applicable; `rfc.validate` passes.

**Human review:** no

---

### Step 7. Final validation and stamp

**Goal:** Verify all acceptance criteria and stamp the RFC as implemented.

**Agent actions:**

- Run full validation suite: `pnpm --filter @gogol/share run build:check`, `pnpm --filter @gogol/site-kernel-checks run build:check`, `pnpm --filter @gogol/site-kernel-handoff run build:check`, `pnpm --filter @gogol/ui run build:check`
- Run `pnpm exec site-kernel run participant.validate --site warpgogol-com --json` — passes
- Run `pnpm exec site-kernel run migrator.registry.validate`
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0508`
- Check off all acceptance criteria in the RFC with `(evidence: ...)` annotations
- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0508 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- All acceptance criteria checked off

**Completion criterion:** RFC stamped as `implemented` via `rfc.implement.stamp`; all acceptance criteria verified.

**Human review:** no — the `accepted` to `implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0508`
- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/ui run build:check`
- `pnpm exec site-kernel run migrator.registry.validate`
- `pnpm exec site-kernel run participant.validate --site warpgogol-com --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0508` in the subject line
- Migrator PBT and snapshot test outputs

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Schema complexity — six type-specific shapes in one flat schema | Step 1: flat schema with `.strict()` + `participant.validate` enforces type-specific required fields |
| Consent placeholder during migration — self-reviewed | Step 4: migrator adds placeholder with `profileReviewer = slug`; Step 5: operator reviews after migration |
| AI-agent accountability enforcement — missing `accountableHumanId` | Step 2: `participant.validate` fails on missing `accountableHumanId` for AI-agent public records |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-24 or DNA-53, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0508 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the migrator fails on existing records due to unexpected frontmatter shapes, investigate the specific record structure before modifying the migrator — do not weaken the migrator's idempotency guarantee.
