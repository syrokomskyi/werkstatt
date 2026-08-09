---
rfcId: RFC-0511
planId: PLAN-RFC-0511-01
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
  services: []
  docs:
    - docs/technology.xml
    - docs/source-markup.xml
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0511

## 1. Objectives

- [ ] Objective 1 — Extend `ParticipantView` with `publicName`, `capabilities`, and `aiAgent` sub-object projections (acceptance criterion: `ParticipantView` projects `publicName`, `capabilities`, and `aiAgent`)
- [ ] Objective 2 — Generate AI-agent profile routes under `/team/ki-agenten/` (DE) and `/komanda/ki-agenty/` (UK) using `AI_AGENT_SEGMENT_SUFFIX_BY_LANG` appended to the team page base segment (acceptance criterion: `getParticipantProfileRoutes` generates AI-agent routes)
- [ ] Objective 3 — Implement `buildAiAgentProfileBlocks` seven-block synthesis with `participantType` dispatch in `resolve-route.ts` (acceptance criteria: seven-block structure, dispatch by type, hero/purpose/rights/accountability/technical/limitations/cta blocks)
- [ ] Objective 4 — Add `/team/ki-agenten/:agentSlug` and `/komanda/ki-agenty/:agentSlug` patterns to `url-schema.yaml` C-contract (acceptance criterion: `url-schema.yaml` includes patterns)
- [ ] Objective 5 — Ship `participant.ai-agent.validate` command and register in `SITES_CHECK_AUTHOR_PIPELINE` after `participant.profile.validate` (acceptance criteria: validator passes, registered in pipeline)
- [ ] Objective 6 — `surface.contract.validate` passes with updated C-contract (acceptance criterion: `surface.contract.validate` passes)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/share/src/astro/people.ts` — extend `ParticipantView` interface with `publicName`, `capabilities`, `aiAgent` fields; project them in `getParticipantsForSection`
- `packages/share/src/astro/people-routes.ts` — add `AI_AGENT_SEGMENT_SUFFIX_BY_LANG` constant; update `getParticipantProfileRoutes` to generate AI-agent routes (append suffix to team page base for `participantType: ai-agent`)
- `packages/share/src/astro/page-handler/resolve-route.ts` — add `buildAiAgentProfileBlocks` function; add `autonomyLabel` function; add `participantType` dispatch in the participant profile synthesis path
- `packages/ontology/src/external-surfaces/url-schema.yaml` — add two new route patterns
- `packages/os/site-kernel-checks/src/participant-ai-agent.ts` — new file: `runParticipantAiAgentValidate` command handler
- `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts` — register `participant.ai-agent.validate` command entry
- `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` — add `{ command: "participant.ai-agent.validate" }` after `participant.profile.validate` (line 172)
- `packages/os/site-kernel-checks/src/__tests__/participant-ai-agent.test.ts` — new test file: unit tests for `participant.ai-agent.validate` (no-op pass, violation detection)

### 2.2 Configuration and data

- No data files change in this RFC. AI-agent participant records are not created here — only the infrastructure for rendering and validating them.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0511-*.md` — read-only reference (accepted, not modified by plan)
- `packages/os/site-kernel-checks/AGENTS.md` — add `participant-ai-agent.ts` module entry to the "What lives here" table
- `docs/technology.xml` — add `/team/ki-agenten/` route pattern to the external surfaces section
- `docs/source-markup.xml` — add `participant-ai-agent.ts` source file entry if it meets the Compass scaffolding threshold

### 2.4 Validation and pipelines

- `SITES_CHECK_AUTHOR_PIPELINE` — new step `{ command: "participant.ai-agent.validate" }` after `participant.profile.validate`
- `surface.contract.validate` — must pass with updated `url-schema.yaml`
- `rfc.validate RFC-0511` — must pass
- `pnpm --filter @gogol/share run build:check` — typecheck for `ParticipantView` and route changes
- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck for new validator

## 3. Step sequence

### Step 1. Extend `ParticipantView` with AI-agent fields

**Goal:** Add `publicName`, `capabilities`, and `aiAgent` sub-object to `ParticipantView` and project them from merged Participant data in `getParticipantsForSection`.

**Agent actions:**

- Add `publicName?: string` to `ParticipantView` interface in `packages/share/src/astro/people.ts`
- Add `capabilities?: string[]` to `ParticipantView`
- Add `aiAgent?` sub-object with `purposeStatement`, `autonomyLevel`, `rightsMatrix`, `accountableHumanId`, `escalationRoute`, `technicalStand`, `knownLimitations` fields
- Project these fields in the `views.push({ ... })` block of `getParticipantsForSection` (lines 144–179), reading from `merged["publicName"]`, `merged["capabilities"]`, `merged["aiAgent"]`
- Update the `MODULE_CONTRACT` `CHANGE_SUMMARY` with an `RFC-0511` entry

**Validation:**

- `pnpm --filter @gogol/share run build:check` — typecheck passes

**Completion criterion:** `ParticipantView` interface includes `publicName`, `capabilities`, and `aiAgent` fields; `getParticipantsForSection` projects them from merged data; typecheck passes.

**Human review:** no

---

### Step 2. Add `AI_AGENT_SEGMENT_SUFFIX_BY_LANG` and update route generation

**Goal:** Add the localized suffix constant and update `getParticipantProfileRoutes` to generate AI-agent routes.

**Agent actions:**

- Add `AI_AGENT_SEGMENT_SUFFIX_BY_LANG` constant to `packages/share/src/astro/people-routes.ts`:
  ```ts
  export const AI_AGENT_SEGMENT_SUFFIX_BY_LANG: Record<string, string> = {
    de: "ki-agenten",
    en: "ai-agents",
    uk: "ki-agenty",
  };
  ```
- In `getParticipantProfileRoutes`, after determining `participantType` from `data["participantType"]`:
  - If `participantType === "ai-agent"`, set `baseFor(lang)` to `${parentBase}/${AI_AGENT_SEGMENT_SUFFIX_BY_LANG[lang] ?? "ki-agenten"}`
  - Human participants keep the existing base segment (`parentBase` without suffix)
- No `aiAgentSlug` flag needed — routes are distinguished by path, dispatch uses `participantType` from the loaded record
- Update `MODULE_CONTRACT` `CHANGE_SUMMARY` with `RFC-0511` entry

**Validation:**

- `pnpm --filter @gogol/share run build:check` — typecheck passes

**Completion criterion:** `AI_AGENT_SEGMENT_SUFFIX_BY_LANG` exported; `getParticipantProfileRoutes` generates AI-agent routes under `/team/ki-agenten/[slug]/` (DE) and `/komanda/ki-agenty/[slug]/` (UK); typecheck passes.

**Human review:** no

---

### Step 3. Implement `buildAiAgentProfileBlocks` and dispatch in `resolve-route.ts`

**Goal:** Add the seven-block AI-agent profile synthesis function and dispatch by `participantType`.

**Agent actions:**

- Add `autonomyLabel(level: string, lang: string): string` function to `packages/share/src/astro/page-handler/resolve-route.ts` with the A0–A4 label table (DE/UK/EN)
- Add `buildAiAgentProfileBlocks(participant: ParticipantView, lang: string): Array<Record<string, unknown>>` function implementing the seven-block structure:
  - Block 1: Hero — `publicName ?? name ?? slug`, `autonomyLabel`, `purposeStatement`, no portrait
  - Block 2: Purpose & Capabilities — `controlled-responsibility-block` with `body-split-list` (`{ text }` items, same shape as RFC-0510)
  - Block 3: Rights — `markdown` with `contentRef: prose/${slug}-rechte`
  - Block 4: Accountability — `markdown` with `contentRef: prose/${slug}-verantwortlichkeit`
  - Block 5: Technical — `markdown` with `contentRef: prose/${slug}-technik`
  - Block 6: Limitations — `markdown` with `contentRef: prose/${slug}-einschraenkungen` (omitted when `knownLimitations` empty)
  - Block 7: CTA — `final-cta` (omitted for `status: former/retired` — defensive guard)
- In the participant profile synthesis path, add `participantType` dispatch:
  ```ts
  if (participant?.participantType === "ai-agent") {
    participantSynthetic = buildAiAgentProfileBlocks(participant, lang);
  } else {
    participantSynthetic = buildHumanProfileBlocks(participant, participantSlug);
  }
  ```
- Update `MODULE_CONTRACT` `CHANGE_SUMMARY` with `RFC-0511` entry

**Validation:**

- `pnpm --filter @gogol/share run build:check` — typecheck passes

**Completion criterion:** `buildAiAgentProfileBlocks` produces seven blocks; `autonomyLabel` returns localized labels; dispatch by `participantType` works; typecheck passes.

**Human review:** no

---

### Step 4. Update `url-schema.yaml` C-contract

**Goal:** Add the two new route patterns to the external surfaces C-contract.

**Agent actions:**

- Add to `packages/ontology/src/external-surfaces/url-schema.yaml` after the existing `/team` and `/komanda` patterns:
  ```yaml
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

**Validation:**

- `pnpm exec werkstatt run surface.contract.validate --site warpgogol-com` — passes with updated contract

**Completion criterion:** `url-schema.yaml` includes both patterns; `surface.contract.validate` passes.

**Human review:** no

---

### Step 5. Implement `participant.ai-agent.validate` command

**Goal:** Create the validator that enforces AI-agent profile structure, accountable human resolution, and public/private field separation.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/participant-ai-agent.ts`:
  - Export `runParticipantAiAgentValidate(input, context): Promise<KernelCommandResult>`
  - Reuse the `collectPeople` pattern from `participant-profile.ts` (read `src/content/people/{lang}/*.md`)
  - Filter for `participantType: ai-agent`, `visibility: public`, default language only
  - No-op pass when zero AI-agent participants (same convention as `participant.profile.validate`)
  - Rules (exit non-zero on violation):
    - `aiAgent.accountableHumanId` is set and non-empty
    - `accountableHumanId` resolves to an existing human participant with `visibility: public` and `status: active`
    - `aiAgent.autonomyLevel` is one of A0–A4
    - `aiAgent.purposeStatement` is non-empty
    - Prose files exist: `prose/{lang}/{slug}-rechte.md`, `prose/{lang}/{slug}-verantwortlichkeit.md`, `prose/{lang}/{slug}-technik.md`
  - Warnings (do not fail):
    - `aiAgent.technicalStand.lastEvaluatedAt` older than 6 months
    - Accountable human has no `page.enabled: true`
  - Return `passResult` or `resultFromViolations` matching the output format in the RFC
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` headers following the pattern in `participant-profile.ts`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes
- `pnpm exec werkstatt run participant.ai-agent.validate --site warpgogol-com --json` — exits 0 with `count: 0` (no AI-agent participants exist)

**Completion criterion:** `participant.ai-agent.validate` command exists, typechecks, and passes as a no-op (zero AI-agent participants).

**Human review:** no

---

### Step 6. Register command in command table and pipeline

**Goal:** Wire `participant.ai-agent.validate` into the command registry and author pipeline.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts`, add entry after `participant.profile.validate` (line 191):
  ```ts
  {
    name: "participant.ai-agent.validate",
    description: "Validate AI-agent profile pages: accountableHumanId resolution, autonomyLevel enum, purposeStatement, prose file presence, public/private field separation. No-op pass when no AI-agent participants exist (RFC-0511).",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: [
      "<app>/src/content/people/**/*.md",
      "<app>/src/content/prose/**/*.md",
      "<app>/src/content/system.md",
    ],
    execute: runParticipantAiAgentValidate,
  },
  ```
- Import `runParticipantAiAgentValidate` at the top of the file
- In `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts`, add after line 172 (`participant.profile.validate`):
  ```ts
  { command: "participant.ai-agent.validate" },
  ```

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes
- `pnpm exec werkstatt run sites-check.author --site warpgogol-com` — pipeline runs with the new step

**Completion criterion:** Command registered in table; pipeline step added after `participant.profile.validate`; typecheck and pipeline pass.

**Human review:** no

---

### Step 7. Add unit tests

**Goal:** Add unit tests for `buildAiAgentProfileBlocks` and `participant.ai-agent.validate`.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/__tests__/participant-ai-agent.test.ts`:
  - Test no-op pass when no AI-agent participants exist
  - Test violation when `accountableHumanId` is missing
  - Test violation when `accountableHumanId` does not resolve to a public, active human
  - Test violation when `autonomyLevel` is outside A0–A4
  - Test violation when `purposeStatement` is empty
  - Test violation when required prose files are missing
  - Test warning when `lastEvaluatedAt` is older than 6 months
- Create or extend test file for `buildAiAgentProfileBlocks` in `packages/share/src/astro/page-handler/__tests__/`:
  - Test seven-block structure is produced
  - Test block 6 (limitations) is omitted when `knownLimitations` is empty
  - Test block 7 (CTA) is omitted for `status: former` and `status: retired`
  - Test hero uses `publicName ?? name ?? slug` fallback chain
  - Test block 2 uses `body-split-list` with `{ text }` items

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run test` — tests pass
- `pnpm --filter @gogol/share run test` — tests pass (if test runner exists for share package)

**Completion criterion:** All tests pass; no-op pass verified; violation detection verified; block structure verified.

**Human review:** no

---

### Step 8. Documentation sync

**Goal:** Update AGENTS.md and Compass XML files to reflect the new command and route patterns.

**Agent actions:**

- Update `packages/os/site-kernel-checks/AGENTS.md` "What lives here" table: add entry for `src/participant-ai-agent.ts`:
  ```
  | `src/participant-ai-agent.ts` | RFC-0511 `runParticipantAiAgentValidate` — validates AI-agent profile pages: accountableHumanId resolution, autonomyLevel enum, purposeStatement, prose file presence, public/private field separation. No-op pass when no AI-agent participants exist. |
  ```
- Update `docs/technology.xml` — add `/team/ki-agenten/:agentSlug` and `/komanda/ki-agenty/:agentSlug` route patterns to the external surfaces section
- Update `docs/source-markup.xml` — add `participant-ai-agent.ts` source file entry if it meets the Compass scaffolding threshold
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (it did — new `participant.ai-agent.validate` command)

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0511` — passes
- `git diff` shows all scope docs updated or documented as not-applicable

**Completion criterion:** AGENTS.md updated; `docs/technology.xml` updated; `ecosystem.manifest.generate` run if needed; `rfc.validate` passes.

**Human review:** no

---

### Final Step. Acceptance criteria verification and stamp

**Goal:** Verify all acceptance criteria and stamp the RFC as implemented.

**Agent actions:**

- Run full validation suite:
  - `pnpm exec werkstatt run rfc.validate --id RFC-0511`
  - `pnpm --filter @gogol/share run build:check`
  - `pnpm --filter @gogol/site-kernel-checks run build:check`
  - `pnpm exec werkstatt run surface.contract.validate --site warpgogol-com`
  - `pnpm exec werkstatt run sites-check.author --site warpgogol-com`
- Check off each acceptance criterion in the RFC with `(evidence: ...)` annotations
- Stamp: `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0511 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from current session
- All acceptance criteria checked off

**Completion criterion:** All validation passes; RFC stamped as `implemented`.

**Human review:** no — `accepted → implemented` is automated via `rfc.implement.stamp` (RFC-0476)

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0511`
- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec werkstatt run surface.contract.validate --site warpgogol-com`
- `pnpm exec werkstatt run sites-check.author --site warpgogol-com`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0511` (if acceptance probes declared)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0511.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0511` in the subject line (RFC-0265)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| No AI-agent participants exist yet | Step 6: validator is a no-op pass with `count: 0` — no false positives |
| Accountable human resolution | Step 6: validator checks `accountableHumanId` resolves to public, active human; warns when no profile page |
| Autonomy level labels need localization | Step 4: `autonomyLabel` function handles DE/UK/EN with DE fallback |
| Agent misinterpretation of `publicName` vs `name` | Step 4: hero uses `publicName ?? name ?? slug` fallback chain; Step 1: `ParticipantView` projects `publicName` |
| CTA omission for former/retired is unreachable | Step 4: defensive guard retained; documented in RFC and code comment |
| `surface.contract.validate` regression | Step 5: C-contract updated before validation; `breaksC: true` declared in RFC frontmatter |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-24 (block-declarative pages) or DNA-37 (universal section props), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0511 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `controlled-responsibility-block` archetype does not support the `body-split-list` body kind used in Block 2, escalate to the UI package owner before modifying the component.
