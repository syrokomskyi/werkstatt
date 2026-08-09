---
rfcId: RFC-0755
planId: PLAN-RFC-0755-01
status: draft
owner: architecture
createdAt: 2026-08-08
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/forge"
  services: []
  docs:
    - packages/forge/AGENTS.md
---

# Implementation Plan: RFC-0755

## 1. Objectives

- [ ] Objective 1 — `readAndParseRfc` returns parse error details instead of silently returning `undefined` on YAML parse failure (maps to acceptance criterion 4)
- [ ] Objective 2 — All 16 call sites across 13 files updated to handle the new return type (maps to acceptance criterion 5)
- [ ] Objective 3 — `V-RFC-33` validation rule in `rfc.validate` detects malformed YAML frontmatter (maps to acceptance criteria 1, 2)
- [ ] Objective 4 — `rfc.implement.stamp` `RFC-IMP-01` violation includes parse error details (maps to acceptance criterion 3)
- [ ] Objective 5 — Unit test verifies malformed-YAML RFC triggers `V-RFC-33` (maps to acceptance criterion 7)
- [ ] Objective 6 — All existing RFCs pass `V-RFC-33` (maps to acceptance criterion 6)

## 2. Affected artifacts

### 2.1 Code and commands

**Primary changes (3 files):**

- `packages/forge/os/rfc/frontmatter-io.ts` — `readAndParseRfc` signature change: `Promise<{ fileName, parsed } | undefined>` → `Promise<{ fileName, parsed } | { fileName, error } | undefined>`. `parseRfcFile` wrapped in try/catch to capture YAML errors.
- `packages/forge/os/rfc/handlers/validate-rules.ts` — New `V-RFC-33` rule in `validateSingleRfc`: checks if `readAndParseRfc` returned an error variant and adds a violation with file, line, column, and parser message.
- `packages/forge/os/rfc/handlers/implement-stamp.ts` — `RFC-IMP-01` message augmented with parse error details when `readAndParseRfc` returns an error result.

**Call-site updates (13 files, 16 call sites):**

- `os/rfc/handlers/validate.ts` (2 calls) — Check `'parsed' in result` before accessing; add V-RFC-33 violation on `'error' in result`
- `os/rfc/handlers/pipeline-status.ts` (1 call) — Skip on error variant
- `os/rfc/handlers/index-graph.ts` (2 calls) — Skip on error variant
- `os/rfc/handlers/list-create.ts` (1 call) — Skip on error variant
- `os/rfc/handlers/check.ts` (1 call) — Skip on error variant
- `os/rfc/handlers/lifecycle.ts` (1 call) — Skip on error variant
- `os/rfc/frontmatter-io.ts` (2 calls: `getRfcStatusById`, `loadRfcStatusMap`) — Skip on error variant
- `os/session/handlers/validate.ts` (1 call) — Skip on error variant
- `os/core/core.module.ts` (1 call) — Skip on error variant
- `os/spec/live-spec-merge.ts` (1 call) — Skip on error variant
- `os/spec/live-spec-validate.ts` (1 call) — Skip on error variant
- `os/rfc/decision-log.ts` (1 call) — Skip on error variant

**Test files:**

- `packages/forge/os/rfc/frontmatter-io.test.ts` — New test: `readAndParseRfc` returns error variant on malformed YAML
- `packages/forge/os/rfc/handlers/validate-rules.test.ts` — New test: `V-RFC-33` fires on malformed-YAML RFC file

### 2.2 Configuration and data

None. No YAML/JSON config, manifests, or ontology catalogs affected.

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — no change needed. The V-RFC rule set is not enumerated in AGENTS.md; rules live in `validate-rules.ts` only.
- No `docs/*.xml` Compass files need synchronization — this RFC does not change repository-wide requirements, technology, or verification plans.
- No `docs/architecture-dna.md` change — no new DNA invariant.

### 2.4 Validation and pipelines

- `rfc.validate` is already part of the RFC lifecycle. No new pipeline step needed.
- No CI workflow changes — `rfc.validate` runs in existing CI.
- `command.manifest.generate` should be re-run if command metadata changed (it didn't — only rule logic and message text changed).

## 3. Step sequence

### Step 1. Update `parseRfcFile` and `readAndParseRfc` in `frontmatter-io.ts`

**Goal:** Capture YAML parse errors instead of silently swallowing them.

**Agent actions:**

- Update `parseRfcFile` to catch YAML parse errors and return a result type that includes error information. Change return type from `ParsedRfc` to `ParsedRfc | { parseError: string }` (or throw, depending on design choice — see Step 1 note below).
- Update `readAndParseRfc` return type from `Promise<{ fileName: string; parsed: ParsedRfc } | undefined>` to `Promise<{ fileName: string; parsed: ParsedRfc } | { fileName: string; error: string } | undefined>`. The `error` field contains the YAML parser error message with line/column information.
- In `readAndParseRfc`, catch YAML parse errors from `parseRfcFile` and return `{ fileName, error: <formatted message> }` instead of `undefined`. File-not-found still returns `undefined`.
- Extract YAML error details from the `yaml` package's `YAMLParseError`: the error message, line number, and column are available on the error object. Format as: `YAML parse error at line {line}, column {col}: {message}`.
- Update `getRfcStatusById` and `loadRfcStatusMap` (2 internal call sites in same file) to check `'parsed' in result` before accessing `result.parsed`. Skip on error variant.

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — TypeScript compiles with new return type.

**Completion criterion:** `readAndParseRfc` returns `{ fileName, error }` on YAML parse failure; `undefined` only on file-not-found. TypeScript compiles.

**Human review:** no

---

### Step 2. Update all 14 external call sites

**Goal:** All callers of `readAndParseRfc` handle the new return type correctly.

**Agent actions:**

- For each of the 12 external files listed in §2.1 (14 external call sites total), update the caller to check `'parsed' in result` before accessing `result.parsed`. On `'error' in result`, skip the file (continue to next iteration) — these callers don't need to report parse errors, they just need to not crash.
- Pattern for skip-on-error callers:
  ```ts
  const result = await readAndParseRfc(rfcDirPath, fileName);
  if (!result || 'error' in result) continue;
  // use result.parsed
  ```
- For `validate.ts` (2 calls): the first call is in the parsing loop (lines 60-66). Update to check `'parsed' in result` and add V-RFC-33 violation on `'error' in result`. The second call is `allParsedByFile.get(fileName)` (line 90) — this is a Map lookup, not a `readAndParseRfc` call, so no change needed there. Actually the Map stores the result from the first call, so the Map value type must also be updated.

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — all call sites compile.

**Completion criterion:** `grep -rn "readAndParseRfc" packages/forge/os/` shows all call sites handle the error variant. TypeScript compiles with zero errors.

**Human review:** no

---

### Step 3. Add `V-RFC-33` helper to `validate-rules.ts` and wire into `validate.ts`

**Goal:** `rfc.validate` detects and reports YAML parse errors. Rule logic lives in `validate-rules.ts` (alongside all other V-RFC rules), called from `validate.ts` at the parsing loop level.

**Agent actions:**

- In `validate-rules.ts`, add exported helper function `checkFrontmatterYamlParse`:
  ```ts
  export function checkFrontmatterYamlParse(
    fileName: string,
    result: { fileName: string; error: string } | undefined,
    addViolation: AddViolationFn,
  ): void {
    if (result && 'error' in result) {
      const relFile = path.join(RFC_DIR, fileName);
      addViolation("UNKNOWN", relFile, "V-RFC-33",
        `RFC frontmatter YAML parse error in ${fileName}: ${result.error}`);
    }
  }
  ```
- In `validate.ts`, during the parsing loop (lines 60-66), call `checkFrontmatterYamlParse` when `readAndParseRfc` returns an error variant. Do NOT add error-variant files to `allParsed` or `allParsedByFile` — they can't participate in referential integrity checks.
- Update the `MODULE_CONTRACT` comment in `validate-rules.ts` to mention V-01..V-33 in the purpose line.
- `validateSingleRfc` signature is unchanged — it still receives `ParsedRfc` (parsing succeeded). V-RFC-33 is a parse-level check, not a semantic check.

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`
- Manual: create a temp RFC file with malformed YAML, run `rfc.validate --id <temp-id>`, verify V-RFC-33 violation appears.

**Completion criterion:** `rfc.validate` on a malformed-YAML RFC file produces a V-RFC-33 violation with file name and parser error details. Rule logic is in `validate-rules.ts`.

**Human review:** no

---

### Step 4. Update `rfc.implement.stamp` `RFC-IMP-01` message

**Goal:** Stamp command includes parse error details in its failure message.

**Agent actions:**

- In `implement-stamp.ts` (lines 223-229), update the `!targetParsed` check to distinguish between `undefined` (file not found — keep existing message) and `{ error }` (parse error — augment message):
  ```ts
  const targetParsed = await readAndParseRfc(rfcDirPath, targetFile);
  if (!targetParsed) {
    violations.push({
      rule: "RFC-IMP-01",
      message: `Could not parse target RFC ${targetId}.`,
    });
    return stampFailResult(violations, isDryRun, outputFormat, logger);
  }
  if ('error' in targetParsed) {
    violations.push({
      rule: "RFC-IMP-01",
      message: `Could not parse target RFC ${targetId}: ${targetParsed.error}`,
    });
    return stampFailResult(violations, isDryRun, outputFormat, logger);
  }
  ```

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`

**Completion criterion:** `rfc.implement.stamp` on a malformed-YAML RFC produces `RFC-IMP-01` with parse error details in the message.

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Verify V-RFC-33 fires on malformed YAML and `readAndParseRfc` returns error variant.

**Agent actions:**

- In `frontmatter-io.test.ts`, add test: `readAndParseRfc` returns `{ fileName, error }` when frontmatter YAML is malformed (e.g. unquoted backtick in a value). Verify the error string contains line/column info.
- In `validate-rules.test.ts` or a new `validate.test.ts`, add test: a temp RFC file with malformed YAML triggers V-RFC-33 when `runRfcValidate` is called. Verify the violation message includes the file name and parser error text.
- Test fixture: a minimal RFC file with `---\nid: RFC-9999\nsuccessSignals:\n  - "test ` broken value"\n---\n` (unquoted backtick causes YAML parse error).

**Validation:**

- `pnpm --filter @warpgogol/forge run test`

**Completion criterion:** Tests pass. Malformed-YAML fixture triggers V-RFC-33. `readAndParseRfc` error variant is verified.

**Human review:** no

---

### Step 6. Validate all existing RFCs pass V-RFC-33

**Goal:** No existing RFC has latent YAML parse errors.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --json` (all RFCs, not just RFC-0755).
- If any V-RFC-33 violations appear on existing RFCs, fix the YAML in those RFC files (quote the offending values).
- Re-run until clean.

**Validation:**

- `pnpm exec werkstatt run rfc.validate --json` — 0 violations.

**Completion criterion:** All existing RFCs pass validation with V-RFC-33 active.

**Human review:** no

---

### Step 7. Run `rfc.validate` on RFC-0755 itself

**Goal:** RFC-0755 passes its own new validation rule.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0755 --json`.
- Fix any violations.

**Validation:**

- `rfc.validate --id RFC-0755` exits 0.

**Completion criterion:** RFC-0755 passes `rfc.validate`.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/forge/AGENTS.md` does not need updates (V-RFC rules are not enumerated there — confirm by grepping for "V-RFC" or "V-01").
- Run `pnpm exec werkstatt run command.manifest.generate` if command surfaces changed (they didn't — only rule logic and message text changed — skip this step).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in RFC-0755 against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0755 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0755`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- Review report exists for this session.

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0755`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec werkstatt run rfc.validate --json` (all RFCs — verify no latent YAML errors)

### 4.2 Evidence artifacts

- No acceptance probes declared in RFC-0755 frontmatter — `rfc.verification.emit` is not required.
- Commit messages referencing `RFC-0755` in the subject line (RFC-0265 commit hygiene).

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives from YAML parser quirks | Step 6 — run `rfc.validate` on all existing RFCs; if zero V-RFC-33 violations, false-positive rate is confirmed zero. |
| Existing RFCs with latent YAML issues | Step 6 — fix any existing RFCs that fail V-RFC-33 before stamping. |
| Blast radius of signature change (16 call sites) | Steps 1-2 — all call sites updated in the same commit. TypeScript compiler enforces completeness — any missed call site will fail `build:check`. |

## 6. Escalation triggers

- If implementation reveals that the `yaml` package's error object does not expose line/column information in a structured way, adjust the error message format to include whatever details are available. Do NOT change the YAML parser package.
- If a call site cannot be updated to the new pattern without breaking its semantics (e.g. a caller that depends on `undefined` return for error handling), escalate to the operator before making ad-hoc changes.
