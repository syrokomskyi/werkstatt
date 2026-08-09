---
rfcId: RFC-0709
planId: PLAN-RFC-0709-01
status: draft
owner: architecture
createdAt: 2026-08-06
updatedAt:
scope:
  apps: []
  packages:
    - packages/forge
  services: []
  docs:
    - .agents/skills/fo-idea-create-rfc/SKILL.md
    - .agents/skills/fo-idea-audit/SKILL.md
    - .agents/skills/fo-idea-enhance/SKILL.md
---

# Implementation Plan: RFC-0709

## 1. Objectives

- [ ] V-NC-01 validation rule implemented in `rfc.validate` — maps to acceptance criterion 1
- [ ] `rfc.validate --json` output includes `markers` field — maps to acceptance criterion 2
- [ ] `fo-idea-create-rfc` skill includes marker guidance — maps to acceptance criterion 3
- [ ] `fo-idea-audit` skill includes marker inventory in axis E — maps to acceptance criterion 4
- [ ] `fo-idea-enhance` skill includes NC finding category — maps to acceptance criterion 5
- [ ] Code blocks excluded from marker detection — maps to acceptance criterion 6
- [ ] Existing `reviewing+` RFCs exempt from retroactive checks — maps to acceptance criterion 7
- [ ] `rfc.validate` passes on RFC-0709 itself — maps to acceptance criterion 8

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/os/rfc/types.ts` — add `Marker` interface, extend `RfcValidationResult` with `markers?: Marker[]`
- `packages/forge/os/rfc/handlers/validate-rules.ts` — add V-NC-01 rule implementation
- `packages/forge/os/rfc/handlers/validate.ts` — collect markers, include in result
- `packages/forge/os/rfc/handlers/validate-rules.test.ts` — unit tests for V-NC-01

### 2.2 Configuration and data

No configuration or data files are changed.

### 2.3 Documentation and specs

- `.agents/skills/fo-idea-create-rfc/SKILL.md` — add marker guidance in step 5
- `.agents/skills/fo-idea-audit/SKILL.md` — add marker inventory subsection under axis E
- `.agents/skills/fo-idea-enhance/SKILL.md` — add NC finding category in step 4
- `packages/forge/skills/fo-idea-create-rfc/SKILL.md` — sync source (forge-managed)
- `packages/forge/skills/fo-idea-audit/SKILL.md` — sync source (forge-managed)
- `packages/forge/skills/fo-idea-enhance/SKILL.md` — sync source (forge-managed)

No `AGENTS.md` or `docs/*.xml` updates needed — this RFC extends validation rules and skill instructions, not repository-wide architecture or Compass semantics.

### 2.4 Validation and pipelines

- `rfc.validate` — extended with V-NC-01 (no new pipeline step)
- `pnpm --filter @warpgogol/forge run build:check` — typecheck + existing tests
- `pnpm --filter @warpgogol/forge run test` — new V-NC-01 unit tests

## 3. Step sequence

### Step 1. Add `Marker` interface and extend `RfcValidationResult`

**Goal:** Define the TypeScript contract for marker data.

**Agent actions:**

- Add `Marker` interface to `packages/forge/os/rfc/types.ts`:
  ```typescript
  export interface Marker {
    line: number;
    text: string;
    severity: "warn" | "error";
  }
  ```
- Extend `RfcValidationResult` with `markers?: Marker[]` field
- Export `Marker` from `packages/forge/os/rfc/index.ts` barrel

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — typecheck passes

**Completion criterion:** `Marker` interface exists in `types.ts`, `RfcValidationResult` has `markers?` field, typecheck passes.

**Human review:** no

---

### Step 2. Implement V-NC-01 marker detection in `validate-rules.ts`

**Goal:** Detect `NEEDS CLARIFICATION` markers in RFC bodies and produce violations.

**Agent actions:**

- Add a `collectMarkers(body: string, status: string, createdAt: string): Marker[]` pure function in `validate-rules.ts`:
  - Split body into lines
  - Track fenced code block state (``` toggle) — skip lines inside code blocks
  - Match lines matching `/^>\s*NEEDS CLARIFICATION:\s*(.+)$/`
  - For each match, create a `Marker` with `line` (1-indexed), `text` (captured group), and `severity`:
    - `"warn"` if `status === "draft"`
    - `"error"` if `status` is `reviewing`, `accepted`, or `implemented`
  - Apply cutoff: only for RFCs with `createdAt >= 2026-08-06` (RFC-0709 creation date)
- In `validateSingleRfc`, after existing rules, call `collectMarkers` and for each marker:
  - Add a V-NC-01 violation with appropriate severity (warning for draft, error for reviewing+)
  - Violation message: `Unresolved NEEDS CLARIFICATION marker at line N: "text"`
- Return markers from `validateSingleRfc` or collect them in the validate handler

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — typecheck passes
- Existing tests still pass

**Completion criterion:** `collectMarkers` function implemented, V-NC-01 violations produced for matching lines, code blocks excluded.

**Human review:** no

---

### Step 3. Wire markers into `validate.ts` handler output

**Goal:** Include `markers` field in the `rfc.validate --json` output.

**Agent actions:**

- In `runRfcValidate` (`validate.ts`), collect markers from each `validateSingleRfc` call
- Aggregate markers across all validated RFCs
- Add `markers` field to the returned `RfcValidationResult` data object
- Markers with `severity: "error"` should make the overall status `"fail"` (same as error violations)
- Markers with `severity: "warn"` should NOT make the status fail (warnings only)

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — typecheck passes
- `rtk pnpm exec site-kernel run rfc.validate --id RFC-0709 --json` — output includes `markers` field (empty array for this RFC since it has no markers)

**Completion criterion:** `--json` output includes `markers` array; error-severity markers cause status `"fail"`.

**Human review:** no

---

### Step 4. Write unit tests for V-NC-01

**Goal:** Verify marker detection, code block exclusion, severity mapping, and cutoff.

**Agent actions:**

- Add test suite `describe("V-NC-01: NEEDS CLARIFICATION marker detection")` to `validate-rules.test.ts`:
  - Test: draft RFC with marker → warning violation produced, marker in result
  - Test: accepted RFC with marker → error violation produced
  - Test: RFC with marker inside code block → no violation
  - Test: RFC with `createdAt < 2026-08-06` → no marker check (cutoff exemption)
  - Test: RFC with no markers → no V-NC-01 violations
  - Test: multiple markers → multiple violations with correct line numbers
  - Test: marker with lowercase `needs clarification` → not matched (case-sensitive)

**Validation:**

- `pnpm --filter @warpgogol/forge run test` — all tests pass

**Completion criterion:** All V-NC-01 tests pass, covering positive/negative cases, code block exclusion, severity mapping, and cutoff.

**Human review:** no

---

### Step 5. Update skill instructions

**Goal:** Add marker guidance to the three forge skills.

**Agent actions:**

- **`fo-idea-create-rfc/SKILL.md`** — in step 5 (Fill every section), add after the bullet list:

  > When a section cannot be filled with confidence, insert `> NEEDS CLARIFICATION: <question>` instead of guessing. Do not leave sections empty or fill them with speculative content. Markers are resolved during the enhance step.

- **`fo-idea-audit/SKILL.md`** — in axis E (Agent-facing policy), add a new check item:

  > **NEEDS CLARIFICATION markers**: List all unresolved `NEEDS CLARIFICATION` markers with line numbers. If none are found, state "No unresolved markers." Markers in `draft` status are informational; markers in `reviewing`+ status are a blocking finding.

- **`fo-idea-enhance/SKILL.md`** — in step 4 (Classify findings), add a new category after "Out of scope":

  > **NC (Needs Clarification)** — Unresolved `NEEDS CLARIFICATION` markers in the RFC body. Resolution: ask the operator the question, replace the marker line with the operator's answer in the RFC body. If the operator defers, the marker remains and the RFC cannot transition to `reviewing`.

- Sync all three skills from `packages/forge/skills/` to `.agents/skills/` (copy identical content)

**Validation:**

- `rtk pnpm exec site-kernel run forge.skill.validate` — skills pass validation
- `rtk pnpm exec site-kernel run forge.doctor` — no skill drift

**Completion criterion:** All three skills updated in both `packages/forge/skills/` and `.agents/skills/`, `forge.skill.validate` passes, `forge.doctor` reports no drift.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, stamp implemented.

**Agent actions:**

- Verify no `AGENTS.md` or `docs/*.xml` updates are needed (confirmed during planning — this RFC extends validation rules and skill instructions only)
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (V-NC-01 is a new rule on existing command, not a new command — manifest may not need regeneration; verify with `git diff`)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion against implemented code. Mark `[x]` with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0709 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0709` — passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off with inline evidence; RFC stamped as `implemented`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0709`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec site-kernel run forge.skill.validate`
- `pnpm exec site-kernel run forge.doctor`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0709.generated.yaml` — verification evidence (if acceptance probes declared)
- Commit messages referencing `RFC-0709` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Marker proliferation — agents overuse markers | Step 5: `fo-idea-create-rfc` grilling step already challenges excessive markers |
| Stale markers in long-lived drafts | Step 5: `fo-idea-audit` reports all markers, prompting resolution |
| Validation bypass — agents remove markers without resolving | Step 5: `fo-idea-enhance` requires operator confirmation for marker resolution |
| False positives from quoted text | Step 2: exact prefix matching `> NEEDS CLARIFICATION:` + code block exclusion |

## 6. Escalation triggers

- If implementation reveals that V-NC-01 conflicts with an existing DNA invariant, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0709 --reason "..." --invariant "DNA-N"` instead of working around it.
