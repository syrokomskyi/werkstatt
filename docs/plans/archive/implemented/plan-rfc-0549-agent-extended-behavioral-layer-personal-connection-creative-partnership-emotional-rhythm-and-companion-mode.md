---
rfcId: RFC-0549
planId: PLAN-RFC-0549-01
status: draft
owner: architecture
createdAt: 2026-07-26
updatedAt: 2026-07-26
scope:
  apps: []
  packages:
    - packages/forge
  services: []
  docs:
    - packages/forge/AGENTS.md
---

# Implementation Plan: RFC-0549

## 1. Objectives

- [ ] O1 — `agents-generate.ts` conditionally includes extended behavioral layer when register is `creative` — maps to acceptance criteria [1, 2]
- [ ] O2 — Extended layer includes all nine behavioral sections (personal connection, creative memory, emotional rhythm, gentle accountability, creative partnership, visual thinking, audience empathy, creative companion, creative confidence) — maps to acceptance criterion [3]
- [ ] O3 — Extended layer includes policy content: questions-not-declarations, outcome-based praise, never-refuse-creative-direction, companion-mode session flag, pull-only inspiration feed — maps to acceptance criteria [4, 5, 6, 7, 8]
- [ ] O4 — `fo-session-retro` SKILL.md routes emotional rhythm insights to `operator-profile.md` with Vertraulich tag and aesthetic preferences with Öffentlich tag — maps to acceptance criteria [9, 10]
- [ ] O5 — Tests verify extended layer inclusion/exclusion based on register — maps to acceptance criteria [11, 12]
- [ ] O6 — `rfc.validate` passes on RFC-0549 — maps to acceptance criterion [13]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/onboarding/agents-generate.ts` — add `readRegister()` helper to parse `PREFERENCES.md` for `register` field; conditionally call `buildExtendedBehavioralLayer()` from the new content module and append extended sections after core sections (within section markers `<!-- forge:begin behavioral-layer-extended -->` / `<!-- forge:end behavioral-layer-extended -->`)
- `packages/forge/src/onboarding/extended-behavioral-layer.ts` — new file: `buildExtendedBehavioralLayer(): string[]` function returning the nine extended sections as string lines; exported for testability
- `packages/forge/src/tests/agents-generate.test.ts` — new test file (if not already created by RFC-0548); tests for: extended layer present when register=creative, absent when register=business, absent when register missing (defaults to business)

### 2.2 Configuration and data

- `PREFERENCES.md` — read-only at generation time; `register` field (values: `business` | `creative`) controls extended layer inclusion. No schema change to PREFERENCES.md itself.

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — Output contract section: document that generated AGENTS.md now includes extended behavioral layer conditionally based on register
- `packages/forge/skills/fo/fo-session-retro/SKILL.md` — add routing rules for emotional rhythm (Vertraulich, 90-day expiry) and aesthetic preferences (Öffentlich) to `operator-profile.md`; add `operator-profile.md` to knowledge array if RFC-0548 has not already done so

### 2.4 Validation and pipelines

- `pnpm exec site-kernel run rfc.validate --id RFC-0549`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test` (agents-generate tests)
- No new commands proposed
- No migrator needed (RFC-0548's migrator handles AGENTS.md regeneration; this RFC adds conditional content within that same regeneration)

## 3. Step sequence

### Step 1. Add register-reading helper to agents-generate.ts

**Goal:** Create a `readRegister(workspaceRoot)` function that reads `PREFERENCES.md` and returns `business` | `creative` | `business` (default).

**Agent actions:**

- Add `readRegister(workspaceRoot: string): "business" | "creative"` function to `agents-generate.ts`
- Parse `PREFERENCES.md` for a `register:` field (YAML-style). If missing or unparseable, default to `"business"`.
- Export the function for testability.

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes with the new function.

**Completion criterion:** `readRegister` function exists, is exported, and returns `"business"` when PREFERENCES.md is missing or has no register field.

**Human review:** no

---

### Step 2. Add extended behavioral layer content builder

**Goal:** Create `buildExtendedBehavioralLayer()` function that returns the nine extended behavioral sections as string lines, wrapped in section markers.

**Agent actions:**

- Create `packages/forge/src/onboarding/extended-behavioral-layer.ts` with `buildExtendedBehavioralLayer(): string[]` function
- Content includes all nine sections from RFC-0549 §Design: personal connection, creative memory, emotional rhythm (questions not declarations), gentle accountability, creative partnership (2-3 alternatives, visual previews, visual diffs), visual thinking, audience empathy, creative companion (companion mode, `saveCompanionSessions` flag), creative confidence (outcome-based praise, never refuse creative direction)
- Include inspiration feed as pull-only MVP policy
- Return section markers `<!-- forge:begin behavioral-layer-extended -->` / `<!-- forge:end behavioral-layer-extended -->` as part of the output
- Export the function for testability

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes.
- Function returns non-empty array containing all nine section headers.

**Completion criterion:** `buildExtendedBehavioralLayer()` returns string array containing all nine section names and the key policy phrases ("questions not declarations", "outcome-based praise", "saveCompanionSessions", "pull-only").

**Human review:** no

---

### Step 3. Wire conditional inclusion into runAgentsGenerate

**Goal:** Modify `runAgentsGenerate` to call `readRegister` and conditionally append extended layer content.

**Agent actions:**

- In `runAgentsGenerate`, after the core behavioral layer sections (added by RFC-0548), call `readRegister(workspaceRoot)`
- If register is `"creative"`, call `buildExtendedBehavioralLayer()` and append the lines
- If register is `"business"` or missing, skip extended layer entirely
- The extended layer sections go within the same `<!-- forge:begin behavioral-layer -->` / `<!-- forge:end behavioral-layer -->` markers (after core content), or in a dedicated `behavioral-layer-extended` sub-section within those markers

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes.
- Manual check: generated AGENTS.md with register=creative contains extended sections; with register=business does not.

**Completion criterion:** `runAgentsGenerate` produces AGENTS.md with extended layer when register=creative, without extended layer when register=business.

**Human review:** no

---

### Step 4. Update fo-session-retro SKILL.md

**Goal:** Add routing rules for extended-layer insights to `operator-profile.md`.

**Agent actions:**

- Read `packages/forge/skills/fo/fo-session-retro/SKILL.md`
- Add `operator-profile.md` to the `knowledge` array in frontmatter (if RFC-0548 has not already done so)
- Add routing rules in the insight categorization table:
  - Emotional rhythm insights → `operator-profile.md` `## Emotional rhythm` section, tagged `[Vertraulich]`, with 90-day expiry marking (`[expires YYYY-MM-DD]`)
  - Aesthetic preferences / creative influences → `operator-profile.md` `## Aesthetic preferences` section, tagged `[Öffentlich]`
- Add a note about the implementation-order dependency on RFC-0548 (if RFC-0548 has not added `operator-profile.md` as a knowledge file, this step adds it)

**Validation:**

- `pnpm exec site-kernel run forge.skill.validate --skill fo-session-retro` passes (SKILL-13: knowledge files exist).

**Completion criterion:** `fo-session-retro` SKILL.md contains routing rules for emotional rhythm (Vertraulich, expiry) and aesthetic preferences (Öffentlich) to `operator-profile.md`.

**Human review:** no

---

### Step 5. Create agents-generate tests

**Goal:** Create or extend `agents-generate.test.ts` with tests for conditional extended layer inclusion.

**Agent actions:**

- Create `packages/forge/src/tests/agents-generate.test.ts` (if it does not exist from RFC-0548)
- Test: `runAgentsGenerate` with `PREFERENCES.md` containing `register: creative` → generated AGENTS.md contains extended layer sections (all nine section headers present)
- Test: `runAgentsGenerate` with `PREFERENCES.md` containing `register: business` → generated AGENTS.md does NOT contain extended layer sections
- Test: `runAgentsGenerate` with no `PREFERENCES.md` or missing register field → defaults to business (no extended layer)
- Test: `readRegister` returns correct values for each scenario
- Test: `buildExtendedBehavioralLayer()` returns all nine section headers and key policy phrases

**Validation:**

- `pnpm --filter @warpgogol/forge run test` — all agents-generate tests pass.

**Completion criterion:** All test cases pass; extended layer inclusion/exclusion is verified for creative, business, and missing-register scenarios.

**Human review:** no

---

### Step 6. Update packages/forge/AGENTS.md

**Goal:** Document the extended behavioral layer in the forge package's AGENTS.md output contract section.

**Agent actions:**

- Read `packages/forge/AGENTS.md`
- In the Output contract section, add note: generated AGENTS.md includes extended behavioral layer conditionally based on `register` from `PREFERENCES.md` (creative = core + extended, business = core only)
- Reference RFC-0549 for the extended layer specification

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes.

**Completion criterion:** `packages/forge/AGENTS.md` Output contract section mentions the extended behavioral layer and its conditional inclusion.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/forge/AGENTS.md` is updated (Step 6).
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0549` — must pass with zero RFC-specific errors.
- Run `pnpm --filter @warpgogol/forge run build:check` — must pass.
- Run `pnpm --filter @warpgogol/forge run test` — all tests pass.
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in RFC-0549 against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0549 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0549` — passes.
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0549`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- No acceptance probes declared (no `acceptance` frontmatter field in RFC-0549)
- No `rfc.verification.emit` needed (RFC has no acceptance probes)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0549` in the subject line (RFC-0265 commit hygiene)
- Test output showing all agents-generate tests pass

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Surrogate relationship | Step 2: extended layer content includes "questions not declarations" and "outcome-based praise" policies; Step 4: 90-day expiry on emotional rhythm entries |
| Extended layer feels intrusive to business operator | Step 1: `readRegister` defaults to `business` when register missing; Step 3: extended layer only included when register=creative; Step 5: test verifies exclusion for business register |
| Milestone gallery storage growth | Not addressed in this plan — milestone gallery is owned by RFC-0547 (forge-bootstrap). This RFC only references it in the extended layer content. |
| Inspiration feed distraction | Step 2: extended layer content includes "at most once per session" and "pull-only" policies |
| Companion mode sessions with personal revelations | Step 2: extended layer content includes `saveCompanionSessions` flag; Step 4: fo-session-retro routes emotional insights with Vertraulich tag |
| Project narrative drift | Not addressed in this plan — project narrative is owned by RFC-0547. This RFC only references it in the extended layer content. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54 (Forge bindings contract), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0549 --reason "..." --invariant "DNA-54"` instead of working around it (RFC-0334).
- If RFC-0548 has not been implemented yet and `fo-session-retro` lacks `operator-profile.md` as a knowledge file, Step 4 adds it as part of this implementation — this is documented in the RFC's rollout step 2.
