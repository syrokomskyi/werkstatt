---
rfcId: RFC-0531
planId: PLAN-RFC-0531-01
status: draft
owner: architecture
createdAt: 2026-07-25
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel-checks"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0531

## 1. Objectives

- [ ] Objective 1 — Implement `runWikidataValidate` validator function — maps to acceptance criterion "runWikidataValidate function implemented"
- [ ] Objective 2 — Register `wikidata.validate` command in `SEO_AUDIT_COMMANDS` — maps to acceptance criterion "wikidata.validate command registered"
- [ ] Objective 3 — Validate Business/Brand/LegalIdentity `externalIdentifiers` for Wikidata QID presence — maps to acceptance criterion "Command validates Business externalIdentifiers"
- [ ] Objective 4 — Validate `schemeRef + value` URL construction — maps to acceptance criterion "Command validates schemeRef + value URL construction"
- [ ] Objective 5 — Cross-check rendered JSON-LD `sameAs` against PBP `externalIdentifiers` — maps to acceptance criterion "Command cross-checks rendered JSON-LD"
- [ ] Objective 6 — Validate LegalIdentity `legalName` presence — maps to acceptance criterion "Command validates LegalIdentity has legalName"
- [ ] Objective 7 — Implement `--strict` flag escalation — maps to acceptance criterion "--strict flag escalates missing QID warnings to errors"
- [ ] Objective 8 — Verify `--json` output follows `AuditFinding` shape — maps to acceptance criterion "--json output follows AuditFinding shape"
- [ ] Objective 9 — Verify exit codes (0 for clean, 1 for errors) — maps to acceptance criterion "Command exits 0 when no findings, exits 1 when any error finding"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/audit/validators/wikidata.ts` — **new file**: `runWikidataValidate` implementation
- `packages/os/site-kernel-checks/src/audit-validators.ts` — add re-export of `runWikidataValidate`
- `packages/os/site-kernel-checks/src/command-tables/05-seo-audit.ts` — add `wikidata.validate` entry to `SEO_AUDIT_COMMANDS` array
- `packages/os/site-kernel-checks/src/tests/wikidata-validate.test.ts` — **new file**: unit tests for the validator

### 2.2 Configuration and data

No configuration or data files change. The command reads existing PBP content and rendered HTML.

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — add `src/audit/validators/wikidata.ts` module entry to the "What lives here" table
- RFC file is read-only reference (already accepted)

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck
- `pnpm --filter @gogol/site-kernel-checks run test` — unit tests
- `pnpm exec site-kernel run rfc.validate RFC-0531 --json` — RFC validation
- No pipeline integration — `wikidata.validate` is standalone (not in `build.check` or `sites-check`)

## 3. Step sequence

### Step 1. Create `wikidata.ts` validator with QID presence and URL validation

**Goal:** Implement the core validator function that checks PBP content for Wikidata QID presence and URL validity.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/audit/validators/wikidata.ts`
- Import helpers: `loadAuditAppContext`, `buildAuditResult`, `finding` from existing modules
- Import `collectRenderedHtml`, `extractJsonLdGraph`, `jsonLdNodeHasType` from `./helpers.ts`
- Import `parseMarkdownFrontmatter` from `@gogol/site-kernel-content`
- Import `defaultLanguageFromManifest` from `../../lib/i18n.ts`
- Implement `runWikidataValidate(input, context)`:
  - Call `loadAuditAppContext(context)` to get app context
  - Read PBP content files from `src/content/business-profile/{lang}/`:
    - `business.md` — check for `externalIdentifiers` with `wikidata.org` schemeRef
    - `brand.md` — same check
    - `organization/legal-identity.md` — same check + `legalName` presence
  - For each `externalIdentifier`, validate `schemeRef + value` produces a valid HTTPS URL (starts with `https://` and parseable by `new URL()`)
  - Collect findings with rule IDs: `wikidata.business-missing-qid`, `wikidata.brand-missing-qid`, `wikidata.legalidentity-missing-qid`, `wikidata.malformed-url`, `wikidata.legalidentity-missing-legalname`
  - Apply `--strict` flag: if `input.flags.strict` is true, escalate `*-missing-qid` finding severity from `"warning"` to `"error"` before calling `buildAuditResult`
  - Return `buildAuditResult({ command: "wikidata.validate", app, findings, runtimeMs })`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes with the new file

**Completion criterion:** File `packages/os/site-kernel-checks/src/audit/validators/wikidata.ts` exists, exports `runWikidataValidate`, and `build:check` passes.

**Human review:** no

---

### Step 2. Add JSON-LD projection parity check

**Goal:** Extend the validator to cross-check rendered JSON-LD `sameAs` against PBP `externalIdentifiers`.

**Agent actions:**

- In `wikidata.ts`, after content-level checks:
  - Call `collectRenderedHtml(audit.distDirectory)` to get rendered HTML files
  - If no HTML files found, skip parity check (mirror `jsonld.parity` behavior)
  - For each HTML page, call `extractJsonLdGraph(page.html)` and find Organization node via `jsonLdNodeHasType(node, "Organization")`
  - Collect all `sameAs` URLs from Organization nodes across all pages
  - For each PBP `externalIdentifier` with a Wikidata schemeRef, check that the constructed URL appears in the rendered `sameAs` array
  - If PBP `externalIdentifiers` exist but rendered `sameAs` does not contain them, add `wikidata.projection-parity` finding (severity: `"error"`)

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes

**Completion criterion:** Validator includes projection parity check; `build:check` passes.

**Human review:** no

---

### Step 3. Register command in `05-seo-audit.ts` and re-export

**Goal:** Wire the command into the command table and re-export shim.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/command-tables/05-seo-audit.ts`:
  - Import `runWikidataValidate` from `../audit-validators.ts` (or direct path)
  - Add entry to `SEO_AUDIT_COMMANDS` array:
    ```ts
    {
      name: "wikidata.validate",
      description: "Validate PBP content and rendered JSON-LD for Wikidata integration readiness (RFC-0531).",
      scope: "app",
      flags: { strict: { kind: "boolean", description: "Treat missing Wikidata QIDs as errors instead of warnings." } },
      supportsAllSites: true,
      reads: ["<app>/src/content/business-profile/**/*.md", "<app>/src/content/system.md", "<app>/dist/client/**/*.html"],
      execute: runWikidataValidate,
    }
    ```
- In `packages/os/site-kernel-checks/src/audit-validators.ts`:
  - Add `export { runWikidataValidate } from "./audit/validators/wikidata.ts";`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes
- Command appears in `pnpm exec site-kernel run --list` output

**Completion criterion:** `wikidata.validate` registered in `SEO_AUDIT_COMMANDS`; `build:check` passes; command is discoverable.

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Create comprehensive unit tests covering all acceptance criteria.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/wikidata-validate.test.ts`
- Follow the pattern from `behavior-snapshot.test.ts`: use `mkdtemp` to create temp dirs, write fixture files, construct mock `KernelRuntimeContext`, call `runWikidataValidate`
- Test cases:
  1. **Missing QID (non-strict):** Business with no `externalIdentifiers` → warning finding `wikidata.business-missing-qid`, exit 0
  2. **Missing QID (strict):** Same input with `--strict` → error finding, exit 1
  3. **Malformed URL:** `schemeRef: "wikidata"` + `value: "Q123456"` → error finding `wikidata.malformed-url`
  4. **Valid URL:** `schemeRef: "https://www.wikidata.org/wiki/"` + `value: "Q123456"` → no finding
  5. **Projection parity:** PBP has `externalIdentifiers` but rendered HTML `sameAs` does not contain them → error finding `wikidata.projection-parity`
  6. **Projection parity pass:** PBP `externalIdentifiers` match rendered `sameAs` → no finding
  7. **LegalIdentity missing legalName:** `legal-identity.md` without `legalName` → error finding `wikidata.legalidentity-missing-legalname`
  8. **No PBP content:** Empty content dir → exits 0, status `"ok"`, zero findings
  9. **No dist/ HTML:** No dist directory → skips parity check, reports only content findings
  10. **`--json` output shape:** Output follows `AuditFinding` shape with `ruleId`, `severity`, `file`, `message`, `evidence`
  11. **Exit codes:** Exit 0 when no findings, exit 1 when any error finding

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run test -- wikidata` passes

**Completion criterion:** All test cases pass; test file covers every acceptance criterion.

**Human review:** no

---

### Step 5. Update AGENTS.md

**Goal:** Document the new module in the package's AGENTS.md.

**Agent actions:**

- In `packages/os/site-kernel-checks/AGENTS.md`, "What lives here" table:
  - Add row: `| src/audit/validators/wikidata.ts | RFC-0531 runWikidataValidate — validates PBP content and rendered JSON-LD for Wikidata integration readiness: QID presence, URL construction from schemeRef+value, projection parity, LegalIdentity legalName. Diagnostics: wikidata.business-missing-qid, wikidata.brand-missing-qid, wikidata.legalidentity-missing-qid, wikidata.malformed-url, wikidata.projection-parity, wikidata.legalidentity-missing-legalname |`

**Validation:**

- Visual inspection: row added correctly

**Completion criterion:** AGENTS.md "What lives here" table includes the new `wikidata.ts` module entry.

**Human review:** no

---

### Final Step. Documentation sync and acceptance criteria verification

**Goal:** Verify all acceptance criteria, run full validation suite, and stamp the RFC as implemented.

**Agent actions:**

- Verify every acceptance criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Run `pnpm exec site-kernel run rfc.validate RFC-0531 --json` — must pass with zero violations
- Run `pnpm --filter @gogol/site-kernel-checks run build:check` — must pass
- Run `pnpm --filter @gogol/site-kernel-checks run test` — all tests pass
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (new command added to `SEO_AUDIT_COMMANDS`)
- Stamp the RFC as implemented: `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0531 --implementation-commit <sha>`
- Verify `git status` is clean

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate RFC-0531 --json` — pass
- `pnpm --filter @gogol/site-kernel-checks run build:check` — pass
- `pnpm --filter @gogol/site-kernel-checks run test` — pass

**Completion criterion:** All acceptance criteria checked off with inline `(evidence: ...)` annotations; RFC stamped as `implemented` via `rfc.implement.stamp`; `git status` clean.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0531 --json`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-checks run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0531` in the subject line (RFC-0265 commit hygiene)
- Test file `src/tests/wikidata-validate.test.ts` as evidence of acceptance criteria coverage

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives on URL validation | Step 1: URL check validates `schemeRef + value` starts with `https://` and is parseable by `new URL()` — non-URL identifiers are out of scope for `sameAs` projection |
| Dependency on RFC-0530 | Step 1: validator reads `externalIdentifiers` field from PBP content — if RFC-0530 is not yet implemented, the field will be absent and the validator will report missing QIDs (warnings) |
| Stale dist/ HTML | Step 2: parity check only runs when dist/ HTML exists; if no dist/, skip parity check and report only content findings (mirrors `jsonld.parity` behavior) |
| Maintenance burden | Step 5: AGENTS.md entry documents the new module for future agents |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-16, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0531 --reason "..." --invariant "DNA-16"` instead of working around it.
- If the `externalIdentifiers` schema shape differs from what RFC-0530 specifies (e.g. field names, nesting), do not adapt the validator to a different shape — escalate to the operator to resolve the RFC-0530/RFC-0531 contract mismatch first.
