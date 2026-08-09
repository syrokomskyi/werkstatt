---
rfcId: RFC-0535
planId: PLAN-RFC-0535-01
status: draft
owner: architecture
createdAt: 2026-07-26
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel-checks"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0535

## 1. Objectives

- [ ] Objective 1 — Add four pure validation functions for Claim/EvidenceSource coverage — maps to acceptance criteria 1-4
- [ ] Objective 2 — Add `readPbpRepeatables` I/O helper for repeatable directories — maps to acceptance criterion 5
- [ ] Objective 3 — Extend `runWikidataValidate` to run new rules when QID is present — maps to acceptance criterion 6
- [ ] Objective 4 — Update command table entry (description + reads) — maps to acceptance criterion 7
- [ ] Objective 5 — Rename and extend `escalateMissingQidWarnings` to `escalateStrictWarnings` — maps to acceptance criterion 8
- [ ] Objective 6 — Add unit tests for all new pure functions — maps to acceptance criterion 9
- [ ] Objective 7 — Verify existing tests pass unchanged — maps to acceptance criterion 10
- [ ] Objective 8 — Pass build:check and rfc.validate — maps to acceptance criteria 11-12

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/audit/validators/wikidata.ts` — add 4 pure functions, `readPbpRepeatables` helper, rename `escalateMissingQidWarnings`, extend `runWikidataValidate`, add 4 new rule IDs to `WikidataValidationRule` type
- `packages/os/site-kernel-checks/src/tests/wikidata-validate.test.ts` — add unit tests for 4 new pure functions + renamed escalation function
- `packages/os/site-kernel-checks/src/command-tables/05-seo-audit.ts` — update `wikidata.validate` entry: description, reads array

### 2.2 Configuration and data

None — no schema changes, no YAML/JSON config, no ontology catalogs.

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — add module entry for the extended wikidata validator (new rule IDs)
- RFC file is read-only reference (status: accepted)

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck
- `pnpm --filter @gogol/site-kernel-checks run test` — unit tests
- `pnpm exec werkstatt run rfc.validate RFC-0535 --json` — RFC validation
- No pipeline integration changes — command remains standalone

## 3. Step sequence

### Step 1. Add new rule IDs and type definitions

**Goal:** Extend the `WikidataValidationRule` type and add interface types for Claim/EvidenceSource records.

**Agent actions:**

- Add 4 new rule IDs to `WikidataValidationRule` union type: `wikidata.no-notability-evidence`, `wikidata.claim-without-evidence`, `wikidata.evidence-broken-ref`, `wikidata.evidence-missing-url`
- Add `ClaimRecord` interface (minimal: `id`, `claimClass`, `statement`, `evidenceRefs`)
- Add `EvidenceSourceRecord` interface (minimal: `id`, `name`, `kind`, `items`)
- Add `STRICT_ESCALATION_RULES` constant array

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck passes with new types

**Completion criterion:** New rule IDs and interfaces are defined and typecheck passes.

**Human review:** no

---

### Step 2. Implement `validateNotabilityEvidence` pure function

**Goal:** Check that at least one EvidenceSource with `kind: "external-web-sources"` or `"third-party-registry"` exists when Business has a Wikidata QID.

**Agent actions:**

- Implement `validateNotabilityEvidence(hasQid, evidenceSources, contentFile)`:
  - If `hasQid` is false, return `null`
  - Filter evidenceSources for `kind` in `["external-web-sources", "third-party-registry"]`
  - If none found, return warning finding with rule `wikidata.no-notability-evidence`
  - Otherwise return `null`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** Function is exported, typecheck passes, returns warning when QID present but no external evidence sources.

**Human review:** no

---

### Step 3. Implement `validateClaimEvidenceCoverage` pure function

**Goal:** Check that every factual Claim has non-empty `evidenceRefs`.

**Agent actions:**

- Implement `validateClaimEvidenceCoverage(claims, contentDir)`:
  - Filter claims for `claimClass === "factual"`
  - For each factual claim with empty or missing `evidenceRefs`, produce warning finding with rule `wikidata.claim-without-evidence`
  - Return array of findings

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** Function is exported, typecheck passes, returns warnings for factual claims without evidenceRefs, skips non-factual claims.

**Human review:** no

---

### Step 4. Implement `validateEvidenceReferences` pure function

**Goal:** Check that every `Claim.evidenceRefs` entry resolves to an existing EvidenceSource entity.

**Agent actions:**

- Implement `validateEvidenceReferences(claims, evidenceSourceIds, contentDir)`:
  - For each claim with `evidenceRefs`, iterate over the record entries
  - For each entry, check if `ref` value is in `evidenceSourceIds` set
  - If not found, produce error finding with rule `wikidata.evidence-broken-ref`
  - Return array of findings

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** Function is exported, typecheck passes, returns errors for dangling evidence references.

**Human review:** no

---

### Step 5. Implement `validateEvidenceSourceUrls` pure function

**Goal:** Check that every EvidenceSource has items with at least one URL.

**Agent actions:**

- Implement `validateEvidenceSourceUrls(evidenceSources, contentDir)`:
  - For each evidence source, check if `items` exists and has at least one entry with `url`
  - If no items or no URL, produce error finding with rule `wikidata.evidence-missing-url`
  - Return array of findings

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** Function is exported, typecheck passes, returns errors for evidence sources without URLs.

**Human review:** no

---

### Step 6. Implement `readPbpRepeatables` I/O helper

**Goal:** Read all `.md` files from a repeatable directory (e.g. `claims/`, `evidence-sources/`).

**Agent actions:**

- Implement `readPbpRepeatables(dir)`:
  - Use `readdir` to list `.md` files in the directory
  - For each file, use `readFile` + `parseMarkdownFrontmatter` (same pattern as `readPbpEntity`)
  - Return `Record<string, Record<string, unknown>>` keyed by filename (without `.md` extension)
  - If directory does not exist, return empty record (no crash)

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** Function is exported, typecheck passes, reads all .md files from a directory, returns empty record for missing directories.

**Human review:** no

---

### Step 7. Rename and extend `escalateMissingQidWarnings` to `escalateStrictWarnings`

**Goal:** Rename the function and extend it to escalate all rules in `STRICT_ESCALATION_RULES`.

**Agent actions:**

- Rename `escalateMissingQidWarnings` to `escalateStrictWarnings`
- Replace the hard-coded `f.ruleId.startsWith("wikidata.") && f.ruleId.endsWith("-missing-qid")` check with `STRICT_ESCALATION_RULES.includes(f.ruleId)`
- Update the call site in `runWikidataValidate` (line 326)

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- Existing tests for `escalateMissingQidWarnings` must be updated to reference the new name

**Completion criterion:** Function is renamed, uses `STRICT_ESCALATION_RULES` array, typecheck passes, existing tests updated.

**Human review:** no

---

### Step 8. Extend `runWikidataValidate` with new rules

**Goal:** Wire the four new validation rules into the main command handler, gated by QID presence.

**Agent actions:**

- After the existing QID presence checks, add:
  - `const businessHasQid = hasWikidataQid(extractExternalIds(businessData) ?? {})`
  - If `businessHasQid`:
    - Read claims directory: `const claimsData = await readPbpRepeatables(join(bpDir, defaultLang, "claims"))`
    - Read evidence-sources directory: `const evidenceSourcesData = await readPbpRepeatables(join(bpDir, defaultLang, "evidence-sources"))`
    - Convert to `ClaimRecord[]` and `EvidenceSourceRecord[]`
    - Run `validateNotabilityEvidence` → push finding if not null
    - Run `validateClaimEvidenceCoverage` → push findings
    - Build `evidenceSourceIds` set from evidence source records
    - Run `validateEvidenceReferences` → push findings
    - Run `validateEvidenceSourceUrls` → push findings
- Update the `escalateMissingQidWarnings` call to `escalateStrictWarnings`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** New rules are wired in, QID-gated, typecheck passes.

**Human review:** no

---

### Step 9. Update command table entry

**Goal:** Update the `wikidata.validate` entry in `05-seo-audit.ts`.

**Agent actions:**

- Update `description` from `"...(RFC-0531)."` to `"...(RFC-0531, RFC-0535)."`
- Add to `reads` array: `"<app>/src/content/business-profile/{lang}/claims/*.md"` and `"<app>/src/content/business-profile/{lang}/evidence-sources/*.md"`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** Command table entry updated with new description and reads paths.

**Human review:** no

---

### Step 10. Add unit tests for new pure functions

**Goal:** Add comprehensive unit tests for all four new pure functions and the renamed escalation function.

**Agent actions:**

- Add test suites in `wikidata-validate.test.ts`:
  - `validateNotabilityEvidence` — test with QID + external sources (pass), QID + only verified-record (warning), no QID (null)
  - `validateClaimEvidenceCoverage` — test factual claim without evidenceRefs (warning), factual claim with evidenceRefs (pass), non-factual claim without evidenceRefs (skipped)
  - `validateEvidenceReferences` — test valid ref (pass), dangling ref (error), no evidenceRefs (pass)
  - `validateEvidenceSourceUrls` — test with URL (pass), no items (error), items without URL (error)
  - `escalateStrictWarnings` — test that new rules are escalated with `--strict`, and that always-error rules are not double-escalated

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run test -- --run wikidata-validate`

**Completion criterion:** All new tests pass, existing tests pass unchanged.

**Human review:** no

---

### Step 11. Update AGENTS.md and verify acceptance criteria

**Goal:** Synchronize documentation, verify all acceptance criteria, stamp implemented.

**Agent actions:**

- Update `packages/os/site-kernel-checks/AGENTS.md` — add note about new wikidata.validate rules (RFC-0535) to the wikidata validator module description
- Run `pnpm --filter @gogol/site-kernel-checks run build:check` — must pass
- Run `pnpm --filter @gogol/site-kernel-checks run test -- --run wikidata-validate` — all tests must pass
- Run `pnpm exec werkstatt run rfc.validate RFC-0535 --json` — must pass
- Check off every acceptance criterion in the RFC with `[x]` and inline `(evidence: ...)` annotation
- Stamp implemented: `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0535 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate RFC-0535 --json` — passes
- All acceptance criteria checked off with evidence annotations

**Completion criterion:** All documentation updated, all acceptance criteria verified, RFC stamped as implemented.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0535 --json`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-checks run test -- --run wikidata-validate`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0535` in the subject line (RFC-0265 commit hygiene)
- Acceptance criteria annotations with inline evidence (V-27)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives on notability evidence (verified-record excluded) | Step 2 — `validateNotabilityEvidence` only accepts `external-web-sources` and `third-party-registry` |
| False positives on claim evidence coverage (self-evident claims) | Step 3 — `validateClaimEvidenceCoverage` returns warnings, not errors; `--strict` is opt-in |
| Performance (reading repeatable directories) | Step 6 — `readPbpRepeatables` reads only when QID is present; typical 10-30 files |
| Agent misinterpretation (non-factual claims, verified-record) | Step 10 — tests explicitly verify non-factual claims are skipped and verified-record is excluded |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-16, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0535 --reason "..." --invariant "DNA-16"` instead of working around it.
