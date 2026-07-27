---
rfcId: RFC-0548
planId: PLAN-RFC-0548-01
status: draft
owner: architecture
createdAt: 2026-07-26
updatedAt:
scope:
  apps: []
  packages:
    - forge
    - site-kernel-handoff
  services: []
  docs:
    - packages/forge/AGENTS.md
    - docs/rfcs/rfc-0548-agent-core-behavioral-layer-intent-to-skill-routing-auto-documentation-creator-facing-communication-and-safety-net.md
---

# Implementation Plan: RFC-0548

## 1. Objectives

- [ ] Objective 1 — Add `triggers` field to skill frontmatter schema and all fo-skills — maps to acceptance criterion [triggers field in SKILL.md frontmatter]
- [ ] Objective 2 — Generate Core behavioral layer section in AGENTS.md via `forge.agents.generate` — maps to acceptance criterion [Behavioral layer section in generated AGENTS.md]
- [ ] Objective 3 — Auto-run `forge.agents.generate` from `forge.create` — maps to acceptance criterion [forge.create calls forge.agents.generate]
- [ ] Objective 4 — Update `fo-session-retro` to route insights to `.agents/operator-profile.md` with entry expiry — maps to acceptance criteria [fo-session-retro routes insights, entry expiry marking]
- [ ] Objective 5 — Register RFC-0548 migrator (backup + regenerate AGENTS.md) — maps to acceptance criteria [migrator registered, idempotent]
- [ ] Objective 6 — Update `packages/forge/AGENTS.md` Output contract section — maps to acceptance criterion [AGENTS.md Output contract documents behavioral layer]
- [ ] Objective 7 — Full test coverage for all new and changed behavior — maps to acceptance criteria [agents-generate.test.ts, create.test.ts, fo-session-retro test, migrator test]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/skill-schema.ts` — add optional `triggers` field to `skillFrontmatterSchema` (Zod array of strings, max 5 entries)
- `packages/forge/src/validators/skill-validate.ts` — add SKILL-16: validate `triggers` format (array of strings, max 5 entries, each 5-100 chars)
- `packages/forge/src/registry.ts` — add optional `triggers?: string[]` to `ForgeSkillEntry` interface
- `packages/forge/src/onboarding/agents-generate.ts` — add Core behavioral layer section generation; read `triggers` from skill frontmatter for routing table; conditionally include extended layer (RFC-0549) based on register; use section markers for idempotent regeneration
- `packages/forge/src/onboarding/create.ts` — call `forge.agents.generate` after `forge.init`; update `nextSteps` to remove manual AGENTS.md generation step
- `packages/forge/skills/fo/*/SKILL.md` — add `triggers` field to all 22 fo-skill frontmatters
- `packages/forge/skills/meta/forge-bootstrap/SKILL.md` — add `.agents/operator-profile.md` to `.gitignore` during onboarding (forge-bootstrap skill instructions)
- `packages/forge/skills/meta/fo-session-retro/SKILL.md` — update to route operator insights to `.agents/operator-profile.md`; add entry expiry marking (90 days) for Emotional rhythm and Feedback history
- `packages/os/site-kernel-handoff/src/migrators/rfc-0548.ts` — new migrator: backup AGENTS.md to AGENTS.md.bak, regenerate with behavioral layer
- `packages/os/site-kernel-handoff/src/migrators/registry.ts` — register rfc-0548 migrator
- `packages/os/site-kernel-handoff/src/tests/migrators.test.ts` — update expected migrator count and ordering

### 2.2 Configuration and data

- `packages/forge/skills/meta/forge-bootstrap/operator-profile-template.md` — owned by RFC-0547 (dependency, not created by this RFC)

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — update Output contract section: document that generated AGENTS.md now includes Core behavioral layer
- `docs/rfcs/rfc-0548-*.md` — read-only reference (acceptance criteria source of truth)

### 2.4 Validation and pipelines

- `pnpm exec site-kernel run rfc.validate --id RFC-0548`
- `pnpm exec site-kernel run forge.skill.validate` — must pass with new `triggers` field
- `pnpm --filter @webgogol/forge build:check`
- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm --filter @gogol/site-kernel-handoff test`
- `pnpm exec site-kernel run migrator.registry.validate`

## 3. Step sequence

### Step 1. Add `triggers` field to skill frontmatter schema

**Goal:** Extend the Zod schema and ForgeSkillEntry interface to support optional `triggers` array.

**Agent actions:**

- Add `triggers: z.array(z.string().min(5).max(100)).max(5).optional()` to `skillFrontmatterSchema` in `packages/forge/src/skill-schema.ts`
- Add `triggers?: string[]` to `ForgeSkillEntry` interface in `packages/forge/src/registry.ts`
- Add SKILL-16 validation rule to `packages/forge/src/validators/skill-validate.ts`: if `triggers` is present, it must be an array of 1-5 strings, each 5-100 characters

**Validation:**

- `pnpm --filter @webgogol/forge build:check` passes
- `pnpm exec site-kernel run forge.skill.validate` passes (no skills have `triggers` yet — field is optional)

**Completion criterion:** `triggers` field is accepted in skill frontmatter schema; SKILL-16 validation rule is implemented; typecheck passes.

**Human review:** no

---

### Step 2. Add `triggers` to all fo-skill SKILL.md frontmatters

**Goal:** Populate `triggers` field for all 22 fo-skills so the routing table can be generated.

**Agent actions:**

- For each fo-skill in `packages/forge/skills/fo/*/SKILL.md`, add a `triggers` array with 1-5 natural-language trigger phrases that describe when the operator would invoke this skill
- Trigger phrases should be in the operator's natural language (e.g. "I want to add / create / build / change something" for fo-idea)
- Sync the updated SKILL.md files to `.agents/skills/` by running `pnpm exec forge create --sync-skills` or equivalent

**Validation:**

- `pnpm exec site-kernel run forge.skill.validate` passes with all skills having valid `triggers` fields
- `pnpm --filter @webgogol/forge build:check` passes

**Completion criterion:** All 22 fo-skills have `triggers` arrays in frontmatter; `forge.skill.validate` passes.

**Human review:** no

---

### Step 3. Implement Core behavioral layer generation in `agents-generate.ts`

**Goal:** Add the Core behavioral layer section to the generated AGENTS.md, including intent-to-skill routing table from `triggers` fields.

**Agent actions:**

- In `packages/forge/src/onboarding/agents-generate.ts`, add a `generateBehavioralLayer(config, skills, register)` function that:
  - Reads `triggers` from each skill's frontmatter (already parsed during skill sync)
  - Generates the intent-to-skill routing table from skills that have `triggers`
  - Generates fixed policy text for all 19 core behavioral areas (auto-grilling, auto-session-save, auto-review, context awareness, creator-facing communication, adaptive learning, proactive guidance, operator feedback, register parameter, pushback policy, external capabilities, safety net, invisible quality, first creation moment, creative health, sharing, cultural awareness, indirect teaching, ownership)
  - Conditionally includes extended behavioral layer (RFC-0549) when register is `creative`
  - Wraps the section in `<!-- forge:begin behavioral-layer -->` / `<!-- forge:end behavioral-layer -->` markers
- Integrate `generateBehavioralLayer` into the existing `runAgentsGenerate` function, after the Capabilities section
- Read register from `PREFERENCES.md` (or `operator-profile.md` if it exists) — default to `business` if not set
- The behavioral layer text should be concise (~2000-3000 tokens) to minimize context-window impact

**Validation:**

- `pnpm --filter @webgogol/forge build:check` passes
- Manual inspection: run `forge.agents.generate` on a test project and verify the behavioral layer section is present with correct routing table

**Completion criterion:** `agents-generate.ts` produces AGENTS.md with a Behavioral layer section containing intent-to-skill routing table from `triggers` fields; section markers are present; extended layer is conditionally included based on register.

**Human review:** no

---

### Step 4. Auto-run `forge.agents.generate` from `forge.create`

**Goal:** Ensure AGENTS.md exists from the first moment by calling `forge.agents.generate` after `forge.init` in `forge.create`.

**Agent actions:**

- In `packages/forge/src/onboarding/create.ts`, after step 7 (forge.init), add a call to `runAgentsGenerate` with the child context
- If `forge.agents.generate` fails, log a warning but continue — `forge.create` should not fail because of AGENTS.md generation (the agent can still work using synced skills)
- Update `passNextSteps` to remove the manual AGENTS.md generation step (it is now automatic)

**Validation:**

- `pnpm --filter @webgogol/forge build:check` passes
- `pnpm --filter @webgogol/forge test` — `create.test.ts` verifies AGENTS.md is generated after `forge.create`

**Completion criterion:** `forge.create` calls `forge.agents.generate` after `forge.init`; AGENTS.md exists from first moment; `nextSteps` no longer mention manual AGENTS.md generation.

**Human review:** no

---

### Step 5. Update `fo-session-retro` SKILL.md

**Goal:** Route operator-related insights to `.agents/operator-profile.md` and add entry expiry marking.

**Agent actions:**

- In `packages/forge/skills/meta/fo-session-retro/SKILL.md` (and the synced copy in `.agents/skills/fo-session-retro/SKILL.md`):
  - Add a new routing category: "Operator" — insights about the operator's communication style, preferences, emotional rhythm, feedback history
  - Route Operator insights to `.agents/operator-profile.md` (not as a `knowledge` file — it is a cross-cutting path)
  - Add entry expiry logic: entries in `## Emotional rhythm` and `## Feedback history` sections expire after 90 days unless refreshed; mark stale entries with `[expired YYYY-MM-DD]`
  - Add a profile review capability: when the operator says "Review my profile", the agent reads `.agents/operator-profile.md`, presents it in creator language, and asks whether to keep, update, or remove each entry

**Validation:**

- `pnpm exec site-kernel run forge.skill.validate` passes
- Manual inspection: verify the updated SKILL.md references `.agents/operator-profile.md` and describes entry expiry

**Completion criterion:** `fo-session-retro` SKILL.md routes operator insights to `.agents/operator-profile.md`; entry expiry marking is documented; profile review capability is described.

**Human review:** no

---

### Step 6. Register RFC-0548 migrator

**Goal:** Create and register the migrator that backs up and regenerates AGENTS.md for existing projects.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0548.ts`:
  - Migrator id: `rfc-0548`
  - `transform`: backs up existing `AGENTS.md` to `AGENTS.md.bak` (if it exists and doesn't already have a `.bak`), then regenerates it with the behavioral layer by calling the same generation logic as `forge.agents.generate`
  - If `AGENTS.md` has a hand-written marker (no generated marker), skip regeneration and log a warning — the edit guard in `agents-generate.ts` already handles this
  - Idempotent: running twice produces the same result (if `.bak` already exists, don't overwrite it; if AGENTS.md already has behavioral layer markers, regeneration is a no-op)
- Register in `packages/os/site-kernel-handoff/src/migrators/registry.ts`:
  - Import `rfc0548Migrator` from `./rfc-0548.ts`
  - Add to `migratorRegistry` array after `rfc0529Migrator`
  - Add CHANGE_SUMMARY entry
- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0548.pbt.test.ts` — property-based test for idempotency (f(f(x))==f(x))
- Create `packages/os/site-kernel-handoff/src/migrators/rfc-0548.snapshot.test.ts` — snapshot test on real data
- Update `packages/os/site-kernel-handoff/src/tests/migrators.test.ts` — update expected migrator count (19 → 20) and add `rfc-0548` to expected ordering

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes
- `pnpm --filter @gogol/site-kernel-handoff test` passes (including new migrator tests)
- `pnpm exec site-kernel run migrator.registry.validate` passes

**Completion criterion:** Migrator for RFC-0548 is registered; backs up AGENTS.md to AGENTS.md.bak; idempotent (PBT passes); migrator.registry.validate passes.

**Human review:** no

---

### Step 7. Update `packages/forge/AGENTS.md` Output contract

**Goal:** Document that the generated AGENTS.md now includes a Core behavioral layer.

**Agent actions:**

- In `packages/forge/AGENTS.md`, Output contract section, add a paragraph:
  > The generated AGENTS.md includes a **Core behavioral layer** section with intent-to-skill routing, auto-grilling/auto-session-save/auto-review policies, creator-facing communication rules, adaptive learning via `operator-profile.md`, proactive guidance, and a safety net. The extended behavioral layer (RFC-0549) is included only when the register is `creative`. The behavioral layer is wrapped in section markers for idempotent regeneration.
- Update the Skills count if changed (22 fo-skills + 4 shared + 3 meta = 29 skills — unchanged, but triggers field is new)

**Validation:**

- `pnpm --filter @webgogol/forge build:check` passes (AGENTS.md is documentation, not code, but verify no broken references)

**Completion criterion:** `packages/forge/AGENTS.md` Output contract section documents the Core behavioral layer.

**Human review:** no

---

### Step 8. Write tests

**Goal:** Full test coverage for all new and changed behavior.

**Agent actions:**

- `packages/forge/src/tests/agents-generate.test.ts` (new or updated):
  - Verifies Core behavioral layer section is present in generated content
  - Verifies intent-to-skill routing table is generated from `triggers` fields
  - Verifies extended layer is included only when register is `creative`
  - Verifies extended layer is NOT included when register is `business`
  - Verifies section markers are present
  - Verifies idempotent regeneration (running twice produces same content within markers)
- `packages/forge/src/tests/create.test.ts` (update):
  - Verifies AGENTS.md is generated after `forge.create`
  - Verifies `nextSteps` no longer mention manual AGENTS.md generation
- `packages/forge/src/tests/skill-validate.test.ts` (update):
  - Verifies SKILL-16 validates `triggers` format (array of strings, max 5, each 5-100 chars)
- `packages/os/site-kernel-handoff/src/migrators/rfc-0548.pbt.test.ts` (new):
  - Property-based test: f(f(x))==f(x) for the migrator
- `packages/os/site-kernel-handoff/src/migrators/rfc-0548.snapshot.test.ts` (new):
  - Snapshot test on real data fixture

**Validation:**

- `pnpm --filter @webgogol/forge test` passes
- `pnpm --filter @gogol/site-kernel-handoff test` passes

**Completion criterion:** All tests pass; test coverage includes routing table generation, conditional extended layer, section markers, idempotency, migrator PBT and snapshot.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files (root, `packages/forge/AGENTS.md`) with new behavioral layer documentation.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0548 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0548`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0548`
- `pnpm --filter @webgogol/forge build:check`
- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm --filter @webgogol/forge test`
- `pnpm --filter @gogol/site-kernel-handoff test`
- `pnpm exec site-kernel run forge.skill.validate`
- `pnpm exec site-kernel run migrator.registry.validate`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0548` in the subject line (RFC-0265 commit hygiene)
- Implementation commit and RFC stamp commit are SEPARATE commits

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Intent routing misinterpretation | Step 3: routing table generated from `triggers` fields with natural-language phrases; Step 2: triggers are descriptive enough for agent to match |
| Auto-grilling friction | Step 3: behavioral layer includes calibration examples (significant vs. minor) |
| Behavioral layer drift | Step 3: routing table generated from skill frontmatter, updates automatically when skills are re-synced |
| operator-profile.md privacy | Step 5: fo-session-retro routes to `.agents/operator-profile.md` (gitignored by default); Step 3: behavioral layer includes privacy provisions (Zugangsstufen, developer handoff exclusion, entry expiry, gitignore) |
| Migrator fails on existing AGENTS.md | Step 6: migrator backs up to AGENTS.md.bak before regenerating; skips hand-written AGENTS.md (edit guard); restores from backup on failure |
| Context-window cost | Step 3: behavioral layer kept concise (~2000-3000 tokens); generator minimizes section length |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54 (Forge bindings contract), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0548 --reason "..." --invariant "DNA-54"` instead of working around it.
- If the `triggers` field approach conflicts with existing skill frontmatter validation (SKILL-01..15), escalate to a superseding RFC rather than weakening existing validation rules.
- If RFC-0547 (dependency for `operator-profile-template.md`) is rejected or superseded, this RFC's acceptance criterion for the template becomes unmet — escalate to amend or supersede.
