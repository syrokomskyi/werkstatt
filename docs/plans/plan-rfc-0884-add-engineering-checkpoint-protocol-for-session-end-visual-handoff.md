---
rfcId: RFC-0884
planId: PLAN-RFC-0884-01
status: draft
owner: architecture
createdAt: 2026-08-19
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/forge"
  services: []
  docs:
    - packages/forge/skills/_shared/fo-session-summary.md
    - packages/forge/skills/fo/fo-session-retro/SKILL.md
    - packages/forge/skills/fo/fo-handoff/SKILL.md
    - packages/forge/skills/fo/fo-session-save/SKILL.md
    - packages/forge/os/session/types.ts
    - packages/forge/os/session/handlers/validate.ts
    - AGENTS.md
---

# Implementation Plan: RFC-0884

## 1. Objectives

- [ ] Objective 1 — Restructure `fo-session-summary.md` with lightweight and full checkpoint modes, diagram selection rules, quality test self-check — maps to acceptance criterion 1
- [ ] Objective 2 — Update `fo-session-retro/SKILL.md` step 7 to produce Engineering Checkpoint closing block — maps to acceptance criterion 2
- [ ] Objective 3 — Update `fo-handoff/SKILL.md` with System State Transition (Before/Change/After) and diagram selection rules — maps to acceptance criterion 3
- [ ] Objective 4 — Update `fo-session-save/SKILL.md` with checkpoint frontmatter field generation guidance — maps to acceptance criterion 4
- [ ] Objective 5 — Extend `SessionFrontmatter` and `SESSION_KNOWN_KEYS` with checkpoint fields — maps to acceptance criteria 5, 6
- [ ] Objective 6 — Add SES-06 warning rule to `session.validate` handler — maps to acceptance criterion 7
- [ ] Objective 7 — Update `AGENTS.md` session-end discipline section — maps to acceptance criterion 8
- [ ] Objective 8 — Sync `.agents/skills/` copies for all modified skills — maps to acceptance criterion 9
- [ ] Objective 9 — Validate RFC and skills pass — maps to acceptance criteria 10, 11

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/os/session/types.ts` — `SessionFrontmatter` interface extended with 5 optional fields; `SESSION_KNOWN_KEYS` extended with 5 new key names; new interfaces `SessionCheckpoint`, `SessionDiagram`, `SessionEvidenceEntry`, `SessionSystemDelta`; `SES_RULES` extended with `SES_06`
- `packages/forge/os/session/handlers/validate.ts` — SES-06 warning logic added: check `types` array for `"implementation"` or `"mission"` membership, check for absence of all checkpoint fields, emit warning if both conditions met

### 2.2 Configuration and data

No configuration or data files are affected. The protocol is a semantic policy encoded in skill markdown files.

### 2.3 Documentation and specs

- `packages/forge/skills/_shared/fo-session-summary.md` — closing block template restructured with lightweight mode (3 sections: Completed, Verification, Next Step) and full mode (6 sections: Completed, System Delta, Resulting Architecture, Verification, Remaining Issues, Next Step), diagram selection rules table, quality test self-check instructions
- `packages/forge/skills/fo/fo-session-retro/SKILL.md` — step 7 (Report) updated to produce Engineering Checkpoint closing block with mode selection based on diagram selection rules
- `packages/forge/skills/fo/fo-handoff/SKILL.md` — handoff document template gains System State Transition section (Before/Change/After prose subsections) and diagram selection rules
- `packages/forge/skills/fo/fo-session-save/SKILL.md` — step 6 (Update session file) extended with checkpoint frontmatter field generation guidance
- `.agents/skills/fo-session-retro/SKILL.md` — synced copy
- `.agents/skills/fo-handoff/SKILL.md` — synced copy
- `.agents/skills/fo-session-save/SKILL.md` — synced copy
- `.agents/skills/_shared/fo-session-summary.md` — synced copy (if `_shared` is synced; check during implementation)
- `AGENTS.md` — session-end discipline section references Engineering Checkpoint protocol

### 2.4 Validation and pipelines

- `session.validate` — gains SES-06 warning (non-blocking)
- `rfc.validate --id RFC-0884` — must pass after implementation
- `forge.skill.validate` — must pass after skill modifications (check for sync drift)

## 3. Step sequence

### Step 1. Extend TypeScript types and constants

**Goal:** Add checkpoint interfaces, extend `SessionFrontmatter`, extend `SESSION_KNOWN_KEYS`, add `SES_06` to `SES_RULES`.

**Agent actions:**

- Add `SessionCheckpoint` interface (before, change, after — all `string`)
- Add `SessionDiagram` interface (type, scope, caption, mermaid)
- Add `SessionEvidenceEntry` interface (claim, source?, test?, command?)
- Add `SessionSystemDelta` interface (changedContracts, changedSchemas, changedStateMachines, changedInvariants, changedPersistence — all `string[]`)
- Extend `SessionFrontmatter` with optional fields: `systemDelta?`, `diagrams?`, `evidence?`, `remainingIssues?`, `checkpoint?`
- Extend `SESSION_KNOWN_KEYS` array with: `"systemDelta"`, `"diagrams"`, `"evidence"`, `"remainingIssues"`, `"checkpoint"`
- Add `SES_06: "SES-06"` to `SES_RULES` object

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — TypeScript compiles without errors

**Completion criterion:** All new interfaces are exported from `types.ts`; `SessionFrontmatter` includes the 5 new optional fields; `SESSION_KNOWN_KEYS` includes the 5 new key names; `SES_RULES` includes `SES_06`.

**Human review:** no

---

### Step 2. Add SES-06 warning to session.validate handler

**Goal:** Implement the SES-06 warning rule in the `session.validate` handler.

**Agent actions:**

- In `packages/forge/os/session/handlers/validate.ts`, after the SES-03 check (relatedRfcs), add SES-06 logic:
  - Read `types` array from frontmatter
  - Check if `types` includes `"implementation"` or `"mission"` (using `Array.includes`)
  - If yes, check if ALL of these are absent: `systemDelta`, `diagrams`, `evidence`, `remainingIssues`, `checkpoint`
  - If all absent, push a `SES-06` warning violation with severity `"warning"`
  - Message: `"Implementation/mission session missing checkpoint frontmatter fields (systemDelta, diagrams, evidence, remainingIssues, checkpoint). Agent should populate these during fo-session-save."`

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — TypeScript compiles
- Manual review: SES-06 is a warning, not an error — `hasErrors` logic remains unchanged (only `severity === "error"` triggers fail status)

**Completion criterion:** `session.validate` emits SES-06 warnings for implementation/mission sessions without checkpoint fields; warnings do not cause `status: "fail"`.

**Human review:** no

---

### Step 3. Restructure fo-session-summary.md

**Goal:** Replace the current 2-section closing block template with lightweight and full checkpoint modes, add diagram selection rules, add quality test self-check.

**Agent actions:**

- Restructure the "Closing block format" section into two modes:
  - **Lightweight mode** — 3 sections: Completed, Verification, Next Step (for non-structural sessions)
  - **Full mode** — 6 sections: Completed, System Delta, Resulting Architecture, Verification, Remaining Issues, Next Step (for structural sessions)
- Add "Diagram selection rules" subsection with the 7-row table (change type → diagram type → when to use)
- Add "Diagram rules" numbered list (6 rules: no diagram for requirement, resulting state not chronology, at most one diagram, current vs session delta, Mermaid syntax only, quantitative charts as markdown tables)
- Add "Quality test self-check" subsection with the self-check question
- Add "Mode selection" subsection explaining how the agent chooses between lightweight and full modes
- Update the "Rules" subsection to reference the new mode-specific formats
- Update examples to show both modes

**Validation:**

- `forge.skill.validate` — must pass (no SKILL violations from content changes)
- Visual review: the template is clear and an agent can follow it to produce a checkpoint

**Completion criterion:** `fo-session-summary.md` contains both mode templates, the diagram selection rules table, the 6 diagram rules, the quality test self-check, and mode selection guidance.

**Human review:** no

---

### Step 4. Update fo-session-retro/SKILL.md step 7

**Goal:** Update the Report step to produce the Engineering Checkpoint closing block with mode selection.

**Agent actions:**

- In step 7 (Report), replace the current closing block template reference with:
  - Reference to the Engineering Checkpoint protocol in `_shared/fo-session-summary.md`
  - Mode selection instruction: "Analyze the session's changes. If the session changed architecture, runtime flow, state machines, persistence models, or public contracts, use full mode. Otherwise, use lightweight mode."
  - Diagram selection instruction: "If using full mode, apply the diagram selection rules to determine if a Mermaid diagram is warranted."
  - Quality test self-check instruction: "After composing the checkpoint, perform the self-check: 'Can another engineer understand the resulting system state from this checkpoint alone?' If no, improve before presenting."
- Keep the existing language policy (all labels in `aiLanguage`)
- Keep the existing closing block emission rules (once, at the end, after all work)

**Validation:**

- `forge.skill.validate` — must pass
- Cross-reference check: grep for step 7 references in other skills (PREFERENCES.md, fo-doc-audit/SKILL.md) — update if step numbering changes (it shouldn't)

**Completion criterion:** Step 7 references the Engineering Checkpoint protocol, includes mode selection, diagram selection, and quality test self-check instructions.

**Human review:** no

---

### Step 5. Update fo-handoff/SKILL.md

**Goal:** Add System State Transition section and diagram selection rules to the handoff document template.

**Agent actions:**

- In step 2 (Write the handoff document), add a new bullet item:
  - **System State Transition** — three prose subsections: **Before** (state N before the session), **Change** (what was done), **After** (state N+1 after the session). These map to the `SessionCheckpoint` interface fields (`before`, `change`, `after`).
- Add a new bullet item:
  - **Resulting Architecture** — optional Mermaid diagram of the system state AFTER changes, following the diagram selection rules from `_shared/fo-session-summary.md`. If no diagram is warranted, state: "No diagram: this session did not change system structure."
- Add a reference to the diagram selection rules in `_shared/fo-session-summary.md`

**Validation:**

- `forge.skill.validate` — must pass

**Completion criterion:** `fo-handoff/SKILL.md` step 2 includes System State Transition (Before/Change/After) and Resulting Architecture with diagram selection rules reference.

**Human review:** no

---

### Step 6. Update fo-session-save/SKILL.md

**Goal:** Extend step 6 (Update session file) with checkpoint frontmatter field generation guidance.

**Agent actions:**

- In step 6 (Update the session file), add guidance for populating checkpoint fields:
  - `checkpoint` — populate `before`, `change`, `after` from the session's work context
  - `systemDelta` — list changed contracts, schemas, state machines, invariants, persistence
  - `diagrams` — if a diagram was produced in the closing block, record its type, scope, caption, and mermaid source
  - `evidence` — list key claims with their evidence references (file:line, test, command)
  - `remainingIssues` — list known limitations, unverified assumptions, open questions
- Note: these fields are optional — only populate when the session produced substantial engineering work
- Note: `session.save` (the deterministic command) does NOT populate these — they are agent-populated

**Validation:**

- `forge.skill.validate` — must pass

**Completion criterion:** Step 6 includes guidance for populating all 5 checkpoint frontmatter fields with notes on optionality and agent-populated nature.

**Human review:** no

---

### Step 7. Sync .agents/skills/ copies

**Goal:** Copy modified skill files to `.agents/skills/` to prevent drift.

**Agent actions:**

- Copy `packages/forge/skills/_shared/fo-session-summary.md` → `.agents/skills/_shared/fo-session-summary.md` (if this path is synced — check `forge.yaml` skill paths)
- Copy `packages/forge/skills/fo/fo-session-retro/SKILL.md` → `.agents/skills/fo-session-retro/SKILL.md`
- Copy `packages/forge/skills/fo/fo-handoff/SKILL.md` → `.agents/skills/fo-handoff/SKILL.md`
- Copy `packages/forge/skills/fo/fo-session-save/SKILL.md` → `.agents/skills/fo-session-save/SKILL.md`

**Validation:**

- `forge.skill.validate` — must pass with 0 violations (no sync drift)
- `pnpm exec forge doctor` — should report no skill drift

**Completion criterion:** All 4 modified skill files have synced copies in `.agents/skills/`; `forge.skill.validate` passes.

**Human review:** no

---

### Step 8. Update AGENTS.md

**Goal:** Add Engineering Checkpoint protocol reference to the session-end discipline section.

**Agent actions:**

- In `AGENTS.md`, find the session-end discipline section (or the relevant section per the root AGENTS.md structure)
- Add a reference to RFC-0884 and the Engineering Checkpoint protocol:
  - "Session-end closing blocks follow the Engineering Checkpoint protocol (RFC-0884): substantial sessions use a 6-section format (Completed, System Delta, Resulting Architecture, Verification, Remaining Issues, Next Step) with an optional Mermaid diagram; lightweight sessions use a 3-section format (Completed, Verification, Next Step)."
- Do not duplicate the full protocol — reference the RFC and `fo-session-summary.md`

**Validation:**

- Visual review: the reference is concise and points to the right artifacts

**Completion criterion:** `AGENTS.md` references RFC-0884 and the Engineering Checkpoint protocol in the session-end discipline section.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (no new commands — skip).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0884 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0884`
- `pnpm exec werkstatt run forge.skill.validate`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0884`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm exec werkstatt run forge.skill.validate`
- `pnpm exec werkstatt run session.validate` (verify SES-06 warning behavior)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0884` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Agent compliance — agent may skip diagram or produce shallow checkpoint | Step 4: quality test self-check in fo-session-retro step 7; Step 2: SES-06 warning in session.validate |
| Diagram quality — poorly authored Mermaid can mislead | Step 3: diagram shows resulting state not chronology; diagram selection rules table |
| Closing block length — full checkpoint is longer | Step 3: lightweight mode for non-structural sessions keeps common case short |
| Mermaid syntax errors — invalid syntax renders as raw text | Step 3: agent responsible for valid syntax; no automated validation (would require Mermaid parser dependency) |
| Frontmatter bloat — 5 new optional fields | Step 1: all fields optional; Step 2: SES-06 is warning only, not error |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54 (Forge bindings contract), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0884 --reason "..." --invariant "DNA-54"` instead of working around it.
- If the `.agents/skills/` sync path for `_shared/fo-session-summary.md` is not the flat path `.agents/skills/_shared/fo-session-summary.md`, check `forge.yaml` skill paths and use the correct sync destination.
