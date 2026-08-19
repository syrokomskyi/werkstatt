---
rfcId: RFC-0875
planId: PLAN-RFC-0875-01
status: draft
owner: architecture
createdAt: 2026-08-18
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt"
  services: []
  docs:
    - docs/COMMANDS.md
    - .env.example
    - packages/werkstatt/AGENTS.md
---

# Implementation Plan: RFC-0875

## 1. Objectives

- [ ] Objective 1 — Implement `nachweis.measure.cloudflare-agent-readiness` command handler that submits an Unlisted scan to the Cloudflare URL Scanner API, polls for completion, and parses Agent Readiness dimensions — maps to acceptance criteria: Uses official URL Scanner API, Unlisted default, `agentReadiness` requested, 15s bounded polling, Raw submission/result retained.
- [ ] Objective 2 — Build `AssessmentBundleV1` from parsed results and delegate to `nachweis.assessment.ingest` — maps to acceptance criteria: Adapter emits valid `AssessmentBundleV1`, Generic ingest performs R2/PBP/Bordbuch, Adapter never signs/approves/publishes.
- [ ] Objective 3 — Fixture-backed parser with explicit field paths, safe schema-drift handling — maps to acceptance criteria: Parser has real/official fixture coverage, Schema drift fails safely, Dimensions not hard-coded, Not-checked is not zero, User screenshot values not hard-coded.
- [ ] Objective 4 — Register command in kernel module, export from barrel, add env vars to `.env.example` — maps to acceptance criteria: Dedicated least-privilege env vars.
- [ ] Objective 5 — Unit tests with mocked HTTP covering all test cases from RFC — maps to acceptance criteria: all test-related criteria.

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/nachweis/nachweis-cloudflare-agent-readiness-measure.ts` — new handler
- `packages/werkstatt/src/nachweis/nachweis.module.ts` — register `nachweis.measure.cloudflare-agent-readiness` command
- `packages/werkstatt/src/nachweis/index.ts` — export handler and result type
- `packages/werkstatt/src/tests-handoff/nachweis-cloudflare-agent-readiness-measure.test.ts` — unit tests
- `packages/werkstatt/src/tests-handoff/fixtures/cloudflare-agent-readiness/` — sanitized fixture files

### 2.2 Configuration and data

- `.env.example` (root) — add `CLOUDFLARE_URL_SCANNER_ACCOUNT_ID` and `CLOUDFLARE_URL_SCANNER_API_TOKEN` with `# How to obtain:` instructions

### 2.3 Documentation and specs

- `docs/COMMANDS.md` — regenerated via `command.manifest.generate`
- `packages/werkstatt/AGENTS.md` — update nachweis module documentation to list new command

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/werkstatt run test` — vitest unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0875` — RFC validation
- `pnpm exec werkstatt run werkstatt.autonomy.validate` — DNA-64 enforcement (no stack plugin imports)
- `pnpm exec werkstatt run werkstatt.shared.validate` — RFC-0868 shared/site boundary

## 3. Step sequence

### Step 1. Implement the command handler

**Goal:** Create `nachweis-cloudflare-agent-readiness-measure.ts` with the full submit → poll → parse → build bundle → delegate to ingest flow.

**Agent actions:**

- Create `packages/werkstatt/src/nachweis/nachweis-cloudflare-agent-readiness-measure.ts`
- Implement `CloudflareAgentReadinessMeasureResult` type as specified in RFC TypeScript contracts section
- Implement `runNachweisCloudflareAgentReadinessMeasure(input, context)` handler:
  - Check `isNachweisEntitled` — skip silently if not entitled (same as Lighthouse handler)
  - Parse `--url` (required, must be HTTPS), `--system` (required), `--series-id` (default: `cloudflare-agent-readiness-pilot`), `--authorization-basis` (default: `site-owner`), `--methodology` (default: `CF-AR-01@1.0`), `--freshness-days` (default: 30), `--dry-run`, `--json`
  - Read `CLOUDFLARE_URL_SCANNER_ACCOUNT_ID` and `CLOUDFLARE_URL_SCANNER_API_TOKEN` from `process.env` — fail with `CLOUDFLARE_CREDENTIALS_MISSING` if absent
  - Create temp working directory with `mkdtemp`
  - Submit scan: `POST /client/v4/accounts/{account_id}/urlscanner/v2/scan` with `{ url, visibility: "Unlisted", agentReadiness: true }` using `fetch()` (Node 18+ built-in)
  - Extract `uuid` (scan ID) from submission response
  - Poll: `GET /client/v4/accounts/{account_id}/urlscanner/v2/result/{scan_id}` at 15-second intervals, max 5 minutes
  - Handle polling states: HTTP 404 → continue, HTTP 200 + `task.success === true` → parse, HTTP 200 + `task.success === false` → `CLOUDFLARE_SCAN_FAILED`, timeout → `CLOUDFLARE_SCAN_TIMEOUT`
  - Save `cloudflare-submission.json` and `cloudflare-result.json` to temp dir
  - Parse Agent Readiness dimensions from `result.agentReadiness` using explicit field paths (NOT heuristic field-name matching)
  - Map dimensions to `AssessmentBundleV1` format: `score` for 0-100, `numerator/denominator` for pass-count, `level` for levels, `status: not-checked` for unchecked
  - Set `observedAt` from provider result scan timestamp (NOT `new Date().toISOString()`)
  - Build `AssessmentBundleV1` with `provider.id = cloudflare`, `tool.id = cloudflare-url-scanner-agent-readiness`, `execution.mode = provider-run`, `methodology.id = CF-AR-01`, `methodology.aggregation = provider`
  - Validate bundle with `assessmentBundleV1Schema`
  - Write bundle JSON to temp dir
  - Delegate to `runNachweisAssessmentIngest` with `--bundle` pointing to the bundle JSON
  - Clean up temp dir in `finally` block
  - Return `CloudflareAgentReadinessMeasureResult` with ingest result
- Use `fetch()` for HTTP calls — no `axios` or `node-fetch` dependencies
- Use `writeFileIfChanged` for file writes
- Clean up `setTimeout` timers after `Promise.race` if used for polling timeout

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes
- File exists and exports `runNachweisCloudflareAgentReadinessMeasure` and `CloudflareAgentReadinessMeasureResult`

**Completion criterion:** Handler file exists, compiles, and implements the full submit → poll → parse → bundle → delegate flow.

**Human review:** no

---

### Step 2. Register command in kernel module and export from barrel

**Goal:** Wire the new command into the kernel registry and export it from the nachweis barrel.

**Agent actions:**

- Edit `packages/werkstatt/src/nachweis/nachweis.module.ts` — add `registry.registerCommand()` for `nachweis.measure.cloudflare-agent-readiness` after the `nachweis.measure.lighthouse` registration, using the same flag pattern:
  - `scope: "workspace"`, `supportsAllSites: false`, `mutatesState: true`, `cacheable: false`
  - Flags: `system`, `url` (required), `series-id`, `authorization-basis`, `methodology`, `freshness-days`, `dry-run`, `json`
  - `execute: runNachweisCloudflareAgentReadinessMeasure`
- Import `runNachweisCloudflareAgentReadinessMeasure` at the top of `nachweis.module.ts`
- Edit `packages/werkstatt/src/nachweis/index.ts` — add export for `runNachweisCloudflareAgentReadinessMeasure` and `CloudflareAgentReadinessMeasureResult` type
- Update the `CHANGE_SUMMARY` block in `index.ts` with `RFC-0875: add nachweis.measure.cloudflare-agent-readiness handler and type exports.`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes
- `pnpm exec werkstatt run command.manifest.generate` produces updated `docs/COMMANDS.md` with the new command listed

**Completion criterion:** Command is registered, exported, and appears in `docs/COMMANDS.md`.

**Human review:** no

---

### Step 3. Add env vars to `.env.example`

**Goal:** Document the new environment variables with `# How to obtain:` instructions (DNA-40).

**Agent actions:**

- Edit `.env.example` (root) — add a new section after the existing Cloudflare R2 sections:
  ```
  # ── Cloudflare URL Scanner (RFC-0875 Agent Readiness assessment adapter)
  # How to obtain: Cloudflare Dashboard → Overview → Account ID (right sidebar). Same value as CLOUDFLARE_ACCOUNT_ID.
  CLOUDFLARE_URL_SCANNER_ACCOUNT_ID=

  # How to obtain: Cloudflare Dashboard → My Profile → API Tokens → Create Custom Token with URL Scanner: Edit permission. Scope to the target account.
  CLOUDFLARE_URL_SCANNER_API_TOKEN=
  ```

**Validation:**

- `.env.example` contains both variables with `# How to obtain:` lines
- `pnpm exec werkstatt run env.example.validate` passes (if command exists)

**Completion criterion:** Both env vars are documented in `.env.example` with obtain instructions.

**Human review:** no

---

### Step 4. Write unit tests with fixtures and mocked HTTP

**Goal:** Create deterministic unit tests covering all test cases from the RFC Tests section.

**Agent actions:**

- Create `packages/werkstatt/src/tests-handoff/fixtures/cloudflare-agent-readiness/` directory
- Create a sanitized fixture file `sample-result.json` based on the Cloudflare API documentation response structure (use the field paths from the API docs: `result.agentReadiness.checks`, `result.agentReadiness.level`, `result.agentReadiness.levelName`, etc.)
- Create `packages/werkstatt/src/tests-handoff/nachweis-cloudflare-agent-readiness-measure.test.ts`
- Mock `fetch` globally using `vi.stubGlobal("fetch", vi.fn())` to control HTTP responses
- Mock `r2-client.ts`, `registry-io.ts`, and `bordbuch-commit-helper.ts` same as the Lighthouse test file
- Test cases (one `it()` per RFC test case):
  1. Submission request includes `agentReadiness: true` — verify `fetch` call body
  2. Visibility defaults to `Unlisted` — verify `fetch` call body
  3. Provider job in progress (HTTP 404) — verify polling continues
  4. Successful completion (HTTP 200, `task.success: true`) — verify bundle built and ingest called
  5. Provider terminal failure (`task.success: false`) — verify `CLOUDFLARE_SCAN_FAILED` error
  6. Timeout after bounded polling — verify `CLOUDFLARE_SCAN_TIMEOUT` error
  7. Schema drift (missing `agentReadiness` in response) — verify `ASSESSMENT_SCHEMA_UNSUPPORTED` error
  8. Additional unknown dimension preserved — verify dimension appears in bundle
  9. Commerce/not-checked not mapped to zero — verify `status: "not-checked"`, no `score: 0`
  10. Entitlement skip — verify silent skip when not entitled
  11. Dry-run — verify no `fetch` call, returns dry-run result
  12. Missing credentials — verify `CLOUDFLARE_CREDENTIALS_MISSING` error
  13. URL validation — verify `CLOUDFLARE_URL_INVALID` for non-HTTPS URLs
- Use `beforeEach`/`afterEach` to reset mocks and temp dirs
- Clean up `setTimeout` timers in tests to avoid process hanging

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test -- --run nachweis-cloudflare-agent-readiness` passes
- All 13 test cases pass

**Completion criterion:** All test cases pass with mocked HTTP; no real API calls in tests.

**Human review:** no

---

### Step 5. Update documentation

**Goal:** Synchronize `docs/COMMANDS.md` and `packages/werkstatt/AGENTS.md`.

**Agent actions:**

- Run `pnpm exec werkstatt run command.manifest.generate` to regenerate `docs/COMMANDS.md`
- Edit `packages/werkstatt/AGENTS.md` — add `nachweis.measure.cloudflare-agent-readiness` to the nachweis commands list if one exists, or note the new command in the appropriate section

**Validation:**

- `docs/COMMANDS.md` contains `nachweis.measure.cloudflare-agent-readiness`
- `packages/werkstatt/AGENTS.md` mentions the new command

**Completion criterion:** Both documentation files are updated.

**Human review:** no

---

### Step 6. Run validation suite

**Goal:** Verify all checks pass before stamping implemented.

**Agent actions:**

- Run `pnpm --filter @warpgogol/werkstatt run build:check`
- Run `pnpm --filter @warpgogol/werkstatt run test`
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0875`
- Run `pnpm exec werkstatt run werkstatt.autonomy.validate`
- Run `pnpm exec werkstatt run werkstatt.shared.validate`
- Fix any failures

**Validation:**

- All commands return exit code 0

**Completion criterion:** All validation checks pass.

**Human review:** no

---

### Step 7. Code review and fix

**Goal:** Run `fo-review` on all session code changes and fix any findings.

**Agent actions:**

- Invoke `fo-review` via the `skill` tool on all session code changes
- Wait for the review report in `docs/reviews/code/`
- If findings exist, invoke `fo-fix` via the `skill` tool
- Re-run `fo-review` to confirm all findings are resolved (max 3 iterations)

**Validation:**

- Review report exists in `docs/reviews/code/` for this session
- All findings are resolved

**Completion criterion:** Code review passed with no unresolved findings.

**Human review:** no

---

### Final Step. Acceptance criteria verification and stamp implemented

**Goal:** Verify every acceptance criterion and stamp the RFC as implemented.

**Agent actions:**

- Verify each acceptance criterion in the RFC against the implemented code:
  - [x] Uses official URL Scanner API, not UI scraping — (evidence: handler uses `POST /client/v4/accounts/.../urlscanner/v2/scan`)
  - [x] Dedicated least-privilege env vars — (evidence: `CLOUDFLARE_URL_SCANNER_ACCOUNT_ID`, `CLOUDFLARE_URL_SCANNER_API_TOKEN` in `.env.example`)
  - [x] Unlisted default — (evidence: `visibility: "Unlisted"` in submission body, test case 2)
  - [x] `agentReadiness` requested — (evidence: `agentReadiness: true` in submission body, test case 1)
  - [x] 15s bounded polling, 5min max — (evidence: constants in handler, test case 6)
  - [x] Raw submission/result retained — (evidence: `cloudflare-submission.json`, `cloudflare-result.json` artifacts in bundle)
  - [x] Parser has real/official fixture coverage — (evidence: fixture file in `tests-handoff/fixtures/cloudflare-agent-readiness/`)
  - [x] Schema drift fails safely — (evidence: test case 7, `ASSESSMENT_SCHEMA_UNSUPPORTED`)
  - [x] Dimensions not hard-coded — (evidence: parser iterates `result.agentReadiness.checks` keys)
  - [x] Not-checked is not zero — (evidence: test case 9, `status: "not-checked"`)
  - [x] Adapter emits valid `AssessmentBundleV1` — (evidence: `assessmentBundleV1Schema` validation in handler)
  - [x] Generic ingest performs R2/PBP/Bordbuch — (evidence: delegates to `runNachweisAssessmentIngest`)
  - [x] Adapter never signs/approves/publishes — (evidence: handler stops after ingest, no publish/approve calls)
  - [x] User screenshot values not hard-coded — (evidence: parser reads from API response, no literal scores in handler)
- Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0875 --implementation-commit <sha>` to transition `accepted → implemented`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0875` passes
- All acceptance criteria checked off

**Completion criterion:** RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0875`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm exec werkstatt run werkstatt.autonomy.validate`
- `pnpm exec werkstatt run werkstatt.shared.validate`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0875` in the subject line (RFC-0265 commit hygiene)
- Fixture file at `packages/werkstatt/src/tests-handoff/fixtures/cloudflare-agent-readiness/sample-result.json`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Provider schema drift | Step 1: parser uses explicit field paths; Step 4: test case 7 verifies `ASSESSMENT_SCHEMA_UNSUPPORTED` |
| Agent misinterpretation (hard-coded screenshot values) | Step 1: parser reads from API response; Step 4: test case verifies no hard-coded values; Final Step: acceptance criterion check |
| False-positive dimension mapping (not-checked → 0) | Step 1: `status: "not-checked"` mapping; Step 4: test case 9 verifies no zero mapping |
| Credential leakage | Step 1: env vars only, no tokens in logs/bundle; Step 3: `.env.example` documents vars; Step 4: credential scan in ingest rejects bundles with credential patterns |
| Rate limiting | Step 1: no retry on rate-limit; `CLOUDFLARE_SUBMISSION_FAILED` on non-2xx |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-64 (stack-agnostic engine), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0875 --reason "..." --invariant "DNA-64"` instead of working around it.
- If the Cloudflare API response schema has changed significantly from what the RFC documents, update the fixture and parser field paths to match the current official contract — do not force the illustrative body from the RFC.
