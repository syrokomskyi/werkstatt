---
rfcId: RFC-0874
planId: PLAN-RFC-0874-01
status: draft
owner: architecture
createdAt: 2026-08-18
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/werkstatt"
  services: []
  docs:
    - packages/werkstatt/AGENTS.md
    - docs/verification-plan.xml
---

# Implementation Plan: RFC-0874

## 1. Objectives

- [ ] O1 — Pin Lighthouse dependency in `packages/werkstatt/package.json` — maps to acceptance criterion "Exact Lighthouse dependency is pinned"
- [ ] O2 — Create `nachweis.measure.lighthouse` command handler with five-run sequential Lighthouse execution, LHR parsing, and category projection — maps to criteria "Command runs five sequential canonical runs", "Raw LHR JSON preserved", "Any canonical run failure prevents ingest"
- [ ] O3 — Implement numeric category aggregation (median, min, max, samples) and non-numeric category preservation (numerator/denominator/status) — maps to criteria "Median/min/max/samples are correct", "Agentic Browsing is not converted into a fake score"
- [ ] O4 — Build `AssessmentBundleV1` from Lighthouse results and delegate to `nachweis.assessment.ingest` core function — maps to criteria "Adapter emits valid AssessmentBundleV1", "Generic ingest handles hashes/R2/PBP/Bordbuch"
- [ ] O5 — Register command in `nachweis.module.ts` with correct flags, scopes, and entitlement gating — maps to criterion "Command is entitlement-gated"
- [ ] O6 — Write unit tests with synthetic LHR fixtures covering all aggregation, failure, and edge cases — maps to criteria "Median/min/max/samples are correct against a deterministic test fixture", "Chrome/Chromium not installed fails", "User screenshot values are not hard-coded"
- [ ] O7 — Document `--json` output shape and `--methodology` parsing — maps to criteria "--methodology flag parsing splits correctly", "--json output shape matches the documented structure"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/package.json` — add pinned `lighthouse` dependency
- `packages/werkstatt/src/nachweis/nachweis-lighthouse-measure.ts` — new command handler
- `packages/werkstatt/src/nachweis/nachweis.module.ts` — register `nachweis.measure.lighthouse` command
- `packages/werkstatt/src/nachweis/index.ts` — export `runNachweisLighthouseMeasure` and types
- `packages/werkstatt/src/tests-handoff/nachweis-lighthouse-measure.test.ts` — unit tests with LHR fixtures

### 2.2 Configuration and data

- `packages/werkstatt/package.json` — `lighthouse` pinned exact version
- No YAML/JSON config files — Lighthouse uses standard default config per RFC

### 2.3 Documentation and specs

- `packages/werkstatt/AGENTS.md` — note about Lighthouse measurement command and Chrome requirement
- `docs/verification-plan.xml` — add `nachweis.measure.lighthouse` to command surface if verification-relevant
- RFC file is read-only reference (`docs/rfcs/rfc-0874-*.md`)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/werkstatt run test` — vitest unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0874` — RFC validation
- No pipeline integration — command is operator-invoked, not in `build.check` or `build.prepare`

## 3. Step sequence

### Step 1. Pin Lighthouse dependency

**Goal:** Add the `lighthouse` package as a pinned exact dependency in `packages/werkstatt/package.json`.

**Agent actions:**

- Search npm registry for the latest stable Lighthouse version: `pnpm info lighthouse versions --json | tail`
- Add `lighthouse` to `packages/werkstatt/package.json` `dependencies` with an exact pinned version (no `^` or `~` prefix)
- Run `pnpm install --no-frozen-lockfile` to update `pnpm-lock.yaml`
- Verify the dependency is installed: `pnpm list lighthouse --filter @warpgogol/werkstatt`

**Validation:**

- `pnpm list lighthouse --filter @warpgogol/werkstatt` shows the exact pinned version
- `packages/werkstatt/package.json` contains `"lighthouse": "<exact-version>"` (no caret/tilde)

**Completion criterion:** `lighthouse` is pinned in `packages/werkstatt/package.json` with an exact version string and `pnpm install` succeeds.

**Human review:** no

---

### Step 2. Create LHR parser and category projection

**Goal:** Implement the LHR parsing logic that extracts categories from Lighthouse Result JSON and projects them into `AssessmentBundleV1` dimension entries.

**Agent actions:**

- Create `packages/werkstatt/src/nachweis/nachweis-lighthouse-measure.ts`
- Implement `parseLighthouseCategory(lhr, categoryId)` — extracts a single category from LHR JSON and projects it to `LighthouseCategoryProjection`
- Implement `projectNumericCategory(samples)` — takes an array of numeric scores, sorts them, computes median (index 2 for 5 samples), min, max, and retains all samples
- Implement `projectPassCountCategory(lhr, categoryId)` — extracts numerator/denominator/status for non-numeric categories like Agentic Browsing
- Implement `parseLhrMetadata(lhr)` — extracts `lighthouseVersion`, `fetchTime`, `userAgent`, `requestedUrl`, `finalUrl`, `configSettings`
- Implement `validateCanonicalRun(lhr)` — checks LHR has no fatal/runtime error, requested/final URL exists
- Export types: `LighthouseRunResult`, `LighthouseCategoryProjection`, `LighthouseMeasureOptions`, `LighthouseMeasureResult`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compiles
- Manual review of parser logic against LHR fixture structure

**Completion criterion:** Parser functions compile and handle numeric, non-numeric, and unknown category shapes per the RFC's Aggregation section.

**Human review:** no

---

### Step 3. Implement Lighthouse runner and batch execution

**Goal:** Implement the function that runs Lighthouse five times sequentially, captures LHR JSON, and validates the canonical batch.

**Agent actions:**

- Implement `runLighthouseBatch(options)` — runs Lighthouse `options.runs` times sequentially against `options.url`
- Each run: spawn Lighthouse CLI process with `--output=json --output-path=<temp>/lhr-run-NN.json --quiet`
- After each run: read LHR JSON, validate canonical run validity
- If any run fails: return `LIGHTHOUSE_CANONICAL_BATCH_INCOMPLETE` with partial LHR paths for diagnosis
- If all runs succeed: return array of `LighthouseRunResult`
- Implement `checkChromeAvailable()` — verifies Chrome/Chromium is installed before any runs; fails with `LIGHTHOUSE_CHROME_NOT_FOUND` if absent
- Implement `writeMethodologyArtifact(options, lhrMetadata)` — writes `methodology.json` with methodology ID/version, Lighthouse version, command options, target URL, run count, aggregation rule, environment facts

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compiles

**Completion criterion:** Runner function compiles, enforces sequential execution, validates canonical runs, and handles Chrome-not-found and batch-incomplete failures.

**Human review:** no

---

### Step 4. Build AssessmentBundleV1 and delegate to ingest

**Goal:** Construct a valid `AssessmentBundleV1` from Lighthouse results and delegate to the `nachweis.assessment.ingest` core function.

**Agent actions:**

- Implement `buildAssessmentBundle(options, runResults, lhrMetadata)` — constructs `AssessmentBundleV1` with:
  - `schemaVersion: "nachweis-assessment-bundle@1"`
  - `provider: { id: "google-chrome-lighthouse", name: "Google Lighthouse" }`
  - `tool: { id: "lighthouse", name: "Lighthouse", version: <lighthouseVersion> }`
  - `execution: { mode: "operator-run", authorizationBasis: <from options> }`
  - `methodology: { id: <methodologyId>, version: <methodologyVersion>, runCount: 5, aggregation: "median" }`
  - `observedAt: <first canonical run fetchTime>` (deterministic, not `new Date()`)
  - `result.dimensions: <projected categories from all runs>`
  - `freshness: { maxAgeDays: <from options> }`
  - `artifacts: [{ key: "lhr-run-01.json", role: "raw-result", ... }, ..., { key: "methodology.json", role: "methodology", ... }]`
- Write bundle JSON and artifacts to a temp directory
- Call `runNachweisAssessmentIngest` with `--bundle <path>` (or call the core function directly with the bundle object)
- Wrap the `AssessmentIngestResult` into `LighthouseMeasureResult`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compiles
- Bundle structure matches `assessmentBundleV1Schema` (Zod validation in ingest)

**Completion criterion:** Bundle builder produces a valid `AssessmentBundleV1` that passes `assessmentBundleV1Schema` validation in the ingest handler.

**Human review:** no

---

### Step 5. Implement command handler and CLI flags

**Goal:** Implement the `runNachweisLighthouseMeasure` command handler with all CLI flags, `--methodology` parsing, `--json` output, and entitlement gating.

**Agent actions:**

- Implement `runNachweisLighthouseMeasure(input, context)` — the command handler
- Parse flags: `--system`, `--url`, `--series-id`, `--authorization-basis`, `--runs` (default 5), `--methodology` (parse `<id>@<version>`), `--freshness-days` (default 30), `--dry-run`, `--json`
- Validate `--url` is HTTPS — fail with `LIGHTHOUSE_URL_INVALID` if not
- Validate `--methodology` has `@` separator — fail with `LIGHTHOUSE_METHODOLOGY_INVALID` if not
- Check entitlement: `isNachweisEntitled(cachePath)` — return `makeSkipResult` if not entitled
- Check Lighthouse dependency is pinned in workspace — fail with `LIGHTHOUSE_DEPENDENCY_UNPINNED` if not found
- In `--dry-run` mode: skip Lighthouse execution and ingest, return a dry-run result
- In normal mode: run the full pipeline (check Chrome → run batch → parse LHRs → build bundle → call ingest)
- Format `--json` output per the RFC's documented shape
- Format human-readable output for non-JSON mode

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compiles

**Completion criterion:** Command handler compiles, parses all flags, validates inputs, gates on entitlement, and produces the documented `--json` output shape.

**Human review:** no

---

### Step 6. Register command in module

**Goal:** Register `nachweis.measure.lighthouse` in `nachweis.module.ts` and export from barrel.

**Agent actions:**

- In `nachweis.module.ts`:
  - Add dynamic import: `const { runNachweisLighthouseMeasure } = await import("./nachweis-lighthouse-measure.ts");`
  - Add `registry.registerCommand({ name: "nachweis.measure.lighthouse", ... })` with flags matching the RFC's CLI section
  - Set `scope: "workspace"`, `supportsAllSites: false`, `mutatesState: true`, `cacheable: false`
  - Add `reads: []`, `writes: []`
- In `nachweis/index.ts`:
  - Add `export { runNachweisLighthouseMeasure } from "./nachweis-lighthouse-measure.ts";`
  - Add type exports for `LighthouseMeasureResult`, `LighthouseCategoryProjection`, etc.
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` comments in both files

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compiles
- `pnpm exec werkstatt run nachweis.measure.lighthouse --help` (if available) shows the command

**Completion criterion:** Command is registered, exported, and appears in the module's command list.

**Human review:** no

---

### Step 7. Write unit tests with LHR fixtures

**Goal:** Create comprehensive unit tests with synthetic LHR fixtures covering all aggregation, failure, and edge cases.

**Agent actions:**

- Create `packages/werkstatt/src/tests-handoff/nachweis-lighthouse-measure.test.ts`
- Create synthetic LHR fixtures (NOT real Lighthouse output, NOT screenshot values):
  - `fixture-lhr-numeric.json` — LHR with numeric categories (performance, accessibility, best-practices, seo)
  - `fixture-lhr-agentic-browsing.json` — LHR with Agentic Browsing pass-count category
  - `fixture-lhr-redirect.json` — LHR where final URL differs from requested URL
  - `fixture-lhr-runtime-error.json` — LHR with fatal runtime error
  - `fixture-lhr-unknown-category.json` — LHR with unknown category shape
  - `fixture-lhr-malformed.json` — invalid JSON
- Test cases:
  1. Numeric category aggregation: 5 samples [90, 91, 91, 92, 93] → median 91, min 90, max 93, samples preserved
  2. Agentic Browsing: preserved as numerator/denominator/status, not converted to 0-100
  3. Canonical batch failure: one run fails → `LIGHTHOUSE_CANONICAL_BATCH_INCOMPLETE`, no ingest
  4. No cherry-picking: partial valid LHRs not aggregated
  5. Unknown category: `LIGHTHOUSE_SCHEMA_UNSUPPORTED` when shape cannot be normalized
  6. `--methodology` parsing: `WG-LH-01@1.0` → id `WG-LH-01`, version `1.0`
  7. `--methodology` invalid: missing `@` → `LIGHTHOUSE_METHODOLOGY_INVALID`
  8. `--url` validation: non-HTTPS → `LIGHTHOUSE_URL_INVALID`
  9. Chrome not found: `LIGHTHOUSE_CHROME_NOT_FOUND`
  10. Entitlement skip: `makeSkipResult` when nachweis entitlement not resolved
  11. `--dry-run`: no Lighthouse execution, no ingest
  12. `--json` output shape: matches documented structure
  13. `observedAt` deterministic from first run `fetchTime`
  14. Screenshot values not hard-coded in fixtures
  15. Bundle passes `assessmentBundleV1Schema` validation
- Mock Lighthouse process execution (do not run real Lighthouse in unit tests)
- Mock `nachweis.assessment.ingest` core function (verify it's called with correct bundle, do not test R2/PBP/Bordbuch)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test -- --run nachweis-lighthouse-measure` — all tests pass
- No tests depend on live `warpgogol.com` or real Lighthouse execution

**Completion criterion:** All test cases pass with synthetic fixtures; no network/browser dependencies in unit tests.

**Human review:** no

---

### Step 8. Documentation sync

**Goal:** Update `AGENTS.md` and Compass XML files to reflect the new command.

**Agent actions:**

- Update `packages/werkstatt/AGENTS.md`:
  - Add note about `nachweis.measure.lighthouse` command in the nachweis module section
  - Note the Chrome/Chromium requirement
  - Note the pinned Lighthouse dependency requirement
- Update `docs/verification-plan.xml` if the command surface section needs the new command
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed

**Validation:**

- `git diff packages/werkstatt/AGENTS.md` shows the new command note
- `pnpm exec werkstatt run rfc.validate --id RFC-0874` passes

**Completion criterion:** Documentation artifacts in scope are updated or documented as not-applicable.

**Human review:** no

---

### Final Step. Review, fix, verify acceptance criteria, and stamp implemented

**Goal:** Run code review and fix, verify all acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compilation
- Run `pnpm --filter @warpgogol/werkstatt run test` — all tests pass
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0874` — RFC validation
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Max 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0874 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0874` passes
- `pnpm --filter @warpgogol/werkstatt run build:check` passes
- `pnpm --filter @warpgogol/werkstatt run test` passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0874`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0874 --implementation-commit <sha>`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0874` in the subject line (RFC-0265 commit hygiene)
- Test fixtures in `packages/werkstatt/src/tests-handoff/` with synthetic LHR data

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Lighthouse version drift | Step 1 pins exact version in `package.json` |
| Chrome/Chromium availability | Step 3 implements `checkChromeAvailable()` before any runs; Step 5 fails with `LIGHTHOUSE_CHROME_NOT_FOUND` |
| Lighthouse performance category variance | Step 2 implements 5-run median with all samples preserved |
| Agentic Browsing category availability | Step 2 preserves provider-native pass-count/status; Step 7 tests this explicitly |
| Agent misinterpretation | Step 7 uses synthetic fixtures, not screenshot values; Implementation notes in RFC forbid hard-coding |
| Long-running command timeout | Step 5 is operator-invoked, not in automated pipelines; RFC documents expected duration |
| Security/privacy — LHR content | Adapter does not redact LHR; operators responsible for target URL safety |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-59, DNA-53, or DNA-67, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0874 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the Lighthouse LHR schema has changed significantly from the pinned version, update the parser and fixtures together — do not add compatibility shims for multiple Lighthouse versions.
- If `nachweis.assessment.ingest` core function signature has changed, update the delegation call — do not duplicate ingest logic in the adapter.
