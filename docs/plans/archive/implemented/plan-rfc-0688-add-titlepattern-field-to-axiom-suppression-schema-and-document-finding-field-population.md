---
rfcId: RFC-0688
planId: PLAN-RFC-0688-01
status: draft
owner: architecture
createdAt: 2026-08-05
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
  services: []
  docs:
    - "packages/os/site-kernel-checks/AGENTS.md"
---

# Implementation Plan: RFC-0688

## 1. Objectives

- [ ] O1 — Add `titlePattern` field to `suppressionRuleSchema` in `suppressions-config.ts` (acceptance: `titlePattern` field added to schema)
- [ ] O2 — Add `titlePattern` matching to `matchesCondition` in `suppressions-config.ts`, positioned before `messagePattern` (acceptance: `applySuppressions` checks `titlePattern` at position 5)
- [ ] O3 — Add SUPPRESS-VAL-06 warning to `suppressions-validate.ts` for rules using `messagePattern`/`descriptionPattern` without `titlePattern` (acceptance: SUPPRESS-VAL-06 emitted)
- [ ] O4 — Add `titlePattern` to `ruleSignature` in `suppressions-validate.ts` for conflict detection (acceptance: `ruleSignature` includes `titlePattern`)
- [ ] O5 — Extend `isBroadPattern` check in `suppressions-validate.ts` to `titlePattern` (acceptance: SUPPRESS-VAL-04 covers `titlePattern`)
- [ ] O6 — Document Finding field population in `packages/os/site-kernel-checks/AGENTS.md` (acceptance: AGENTS.md documents which fields exist vs do not exist)
- [ ] O7 — Add unit tests for `titlePattern` matching and SUPPRESS-VAL-06 warning (acceptance: tests pass)
- [ ] O8 — Verify `suppressions.validate` passes on `systems/axiom-suppressions.yaml` with zero warnings (acceptance: zero warnings on default rules)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/suppressions-config.ts` — MODIFIED: add `titlePattern` to `suppressionRuleSchema`, add `titlePattern` matching in `matchesCondition` (position 5, before `messagePattern`)
- `packages/os/site-kernel-checks/src/suppressions-validate.ts` — MODIFIED: add SUPPRESS-VAL-06 warning, add `titlePattern` to `ruleSignature`, extend `isBroadPattern` check to `titlePattern`

### 2.2 Configuration and data

- `systems/axiom-suppressions.yaml` — NO CHANGES NEEDED (default rules already fixed: Categories C and D use `channelNot`/`urlPattern`, not `messagePattern`/`descriptionPattern`)

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — MODIFIED: document Finding field population contract (which fields exist vs do not exist), recommend `titlePattern` over `messagePattern`/`descriptionPattern`

### 2.4 Validation and pipelines

- Unit tests in `packages/os/site-kernel-checks/src/tests/` — MODIFIED: `suppressions-config.test.ts` (add `titlePattern` matching test), `suppressions-validate.test.ts` (add SUPPRESS-VAL-06 warning test)
- No command manifest changes — no new commands, no command registration changes

## 3. Step sequence

### Step 1. Add `titlePattern` to suppression schema and matching logic (contracts)

**Goal:** Add the `titlePattern` field to the Zod schema and implement matching against `finding.title`.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/suppressions-config.ts`:
  - Add `titlePattern: z.string().optional()` to `suppressionRuleSchema` (between `urlPattern` and `messagePattern`)
  - In `matchesCondition` function, add `titlePattern` check after `urlPattern` and before `messagePattern`:
    ```ts
    if (rule.titlePattern !== undefined) {
      if (!finding.title.includes(rule.titlePattern)) return false;
    }
    ```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` compiles without errors

**Completion criterion:** `titlePattern` field in schema, `matchesCondition` checks `finding.title.includes(rule.titlePattern)` at position 5. Build passes.

**Human review:** no

---

### Step 2. Add SUPPRESS-VAL-06, update `ruleSignature`, extend `isBroadPattern` (validation)

**Goal:** Add the warning diagnostic for rules using `messagePattern`/`descriptionPattern` without `titlePattern`, update conflict detection, and extend broad-pattern check.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/suppressions-validate.ts`:
  - Add `titlePattern` to the `ruleSignature` function's JSON.stringify object (so two rules differing only in `titlePattern` are detected as distinct for SUPPRESS-VAL-03)
  - Extend the broad-pattern warning loop (SUPPRESS-VAL-04) to also check `rule.titlePattern`:
    ```ts
    if (rule.titlePattern && isBroadPattern(rule.titlePattern)) {
      diagnostics.push({
        ruleId: "SUPPRESS-VAL-04",
        severity: "warning",
        file: WORKSHOP_SUPPRESSIONS_PATH,
        message: `Rule at index ${i} (ruleId: ${rule.ruleId}) has a broad titlePattern: "${rule.titlePattern}". Broad patterns may suppress real findings. Use a more specific pattern.`,
      });
    }
    ```
  - Add a new check after the broad-pattern loop for SUPPRESS-VAL-06:
    ```ts
    for (let i = 0; i < config.suppressions.length; i++) {
      const rule = config.suppressions[i];
      if ((rule.messagePattern || rule.descriptionPattern) && !rule.titlePattern) {
        diagnostics.push({
          ruleId: "SUPPRESS-VAL-06",
          severity: "warning",
          file: WORKSHOP_SUPPRESSIONS_PATH,
          message: `Rule at index ${i} (ruleId: ${rule.ruleId}) uses ${rule.messagePattern ? "messagePattern" : "descriptionPattern"} without titlePattern — messagePattern/descriptionPattern match against non-existent Finding fields and will never fire. Use titlePattern to match against finding.title.`,
          fixHint: "Replace messagePattern/descriptionPattern with titlePattern, or add titlePattern as a fallback.",
        });
      }
    }
    ```

- In `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts`:
  - Update the `suppressions.validate` command description to include SUPPRESS-VAL-06: append "SUPPRESS-VAL-06 (messagePattern/descriptionPattern without titlePattern, warning)" to the diagnostics list

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` compiles
- `pnpm exec site-kernel run suppressions.validate --json` passes on `systems/axiom-suppressions.yaml` with zero warnings (no default rule uses `messagePattern`/`descriptionPattern`)

**Completion criterion:** SUPPRESS-VAL-06 emitted for rules using `messagePattern`/`descriptionPattern` without `titlePattern`. `ruleSignature` includes `titlePattern`. `isBroadPattern` checks `titlePattern`. Command table description includes SUPPRESS-VAL-06. `suppressions.validate` passes with zero warnings on default rules.

**Human review:** no

---

### Step 3. Document Finding field population in AGENTS.md

**Goal:** Document which Finding fields exist and are populated vs which do not exist, so rule authors know which fields to match against.

**Agent actions:**

- In `packages/os/site-kernel-checks/AGENTS.md`:
  - In the `src/suppressions-config.ts` module entry, add a note about Finding field population:
    - `Finding` type (from `@syrokomskyi/axiom-study`) has: `findingId`, `semanticFingerprint`, `methodologyId`, `ruleId`, `affectedSubjectId`, `title`, `severity`, `evidence`, `uncertainty`, `extension`
    - `title` is always populated (`z.string().min(1)`) — use `titlePattern` for text-based matching
    - `message` and `description` do not exist as Finding fields — `messagePattern` and `descriptionPattern` read from `finding.extension.message` / `finding.extension.description` which are always `undefined`; these patterns will never fire
    - `extension` is populated with `{ observationId, predicate }` by Axiom — does not contain `message` or `description` keys
  - In the `src/suppressions-validate.ts` module entry, add SUPPRESS-VAL-06 to the diagnostics list

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` compiles (AGENTS.md is not compiled, but verify no broken references)

**Completion criterion:** AGENTS.md documents Finding field population contract and SUPPRESS-VAL-06 diagnostic.

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Test `titlePattern` matching and SUPPRESS-VAL-06 warning.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/tests/suppressions-config.test.ts`:
  - Add test: `titlePattern` condition — suppress when `finding.title` contains the pattern
  - Add test: `titlePattern` condition — does not suppress when title does not contain pattern
  - Add test: `titlePattern` checked before `messagePattern` (position 5)
- In `packages/os/site-kernel-checks/src/tests/suppressions-validate.test.ts`:
  - Add test: SUPPRESS-VAL-06 warning emitted when rule uses `messagePattern` without `titlePattern`
  - Add test: SUPPRESS-VAL-06 warning emitted when rule uses `descriptionPattern` without `titlePattern`
  - Add test: no SUPPRESS-VAL-06 when rule uses `messagePattern` with `titlePattern`
  - Add test: no SUPPRESS-VAL-06 when rule uses neither `messagePattern` nor `descriptionPattern`
  - Add test: SUPPRESS-VAL-04 broad pattern warning for `titlePattern` (single word < 10 chars)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test` — all tests pass

**Completion criterion:** All unit tests pass. `titlePattern` matching and SUPPRESS-VAL-06 warning verified.

**Human review:** no

---

### Step 5. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-checks/AGENTS.md` is updated (Step 3)
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0688`
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-checks run test`
- Run `pnpm exec site-kernel run suppressions.validate --json` — verify zero warnings on default rules
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0688` (RFC-0330 — acceptance probes are commented out, so this will produce no evidence file, which is expected)
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: invoke `fo-fix` if review has findings
- Check off acceptance criteria: verify each criterion against implemented code
- Stamp: `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0688 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0688`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts updated; code review passed; all acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0688`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm exec site-kernel run suppressions.validate --json` (verify zero warnings)
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0688` (no evidence file expected — probes commented out)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0688.generated.json` — verification evidence (may not be produced if probes are commented out)
- Commit messages referencing `RFC-0688` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Title format drift (Axiom changes title format) | Step 2: `suppressions.validate` already warns on unknown ruleIds (SUPPRESS-VAL-05). Rule authors should match on the descriptive part of the title, not the ruleId prefix. |
| Over-suppression via broad titlePattern | Step 2: `isBroadPattern` check extended to `titlePattern` (SUPPRESS-VAL-04). Step 4: test broad pattern detection for `titlePattern`. |
| Agent confusion (titlePattern vs messagePattern) | Step 2: SUPPRESS-VAL-06 warning message explains the issue and suggests the fix. Step 3: AGENTS.md documents Finding field population contract. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0688 --reason "..." --invariant "DNA-N"` instead of working around it.
