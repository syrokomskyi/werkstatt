---
rfcId: RFC-0873
planId: PLAN-RFC-0873-01
status: draft
owner: architecture
createdAt: 2026-08-18
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/werkstatt"
    - "@warpgogol/werkstatt-site"
  services: []
  docs:
    - packages/werkstatt/AGENTS.md
    - docs/verification-plan.xml
---

# Implementation Plan: RFC-0873

## 1. Objectives

- [ ] Objective 1 — Create `nachweis.assessment.ingest` command handler that validates an `AssessmentBundleV1`, hashes artifacts, uploads to R2, writes PBP evidence-source, and appends Bordbuch entry — maps to acceptance criteria 1, 2, 9, 10
- [ ] Objective 2 — Implement idempotency and conflict detection based on `(systemId, seriesId, observationId)` identity — maps to acceptance criteria 3, 4, 5
- [ ] Objective 3 — Implement path traversal and symlink escape validation for artifact paths — maps to acceptance criterion 6
- [ ] Objective 4 — Enforce at least one canonical `raw-result` artifact — maps to acceptance criterion 7
- [ ] Objective 5 — Ensure no credentials leak in JSON result, PBP, or Bordbuch — maps to acceptance criterion 8
- [ ] Objective 6 — Verify `nachweis.validate` passes the captured draft record but `nachweis.publish` still fails until N3/approval gates — maps to acceptance criterion 11

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/nachweis/nachweis-assessment-ingest.ts` — **NEW** command handler
- `packages/werkstatt/src/nachweis/nachweis-io.ts` — add `resolveAssessmentR2Path` helper, `AssessmentBundleV1` and `AssessmentIngestResult` types
- `packages/werkstatt/src/nachweis/nachweis.module.ts` — register `nachweis.assessment.ingest` command, add CHANGE_SUMMARY entry
- `packages/werkstatt/src/nachweis/index.ts` — barrel exports for new handler and types
- `packages/werkstatt/src/tests-handoff/nachweis-assessment-ingest.test.ts` — **NEW** unit tests

### 2.2 Configuration and data

- R2 bucket `nachweis` — path pattern `{systemId}/private/assessments/{seriesId}/{observationId}/{artifactKey}.{ext}`
- PBP evidence-source entity at `<cache>/src/content/business-profile/{lang}/trust/evidence/{slug}.md`

### 2.3 Documentation and specs

- `packages/werkstatt/AGENTS.md` — add note about assessment ingest command
- `docs/verification-plan.xml` — add verification entry if command surface changed
- RFC file (read-only reference): `docs/rfcs/rfc-0873-*.md`

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck
- `pnpm --filter @warpgogol/werkstatt run test` — unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0873` — RFC validation
- No pipeline integration — command is operator-invoked, not added to `build.prepare` or `build.check`

## 3. Step sequence

### Step 1. Add types and R2 path helper to nachweis-io.ts

**Goal:** Add `AssessmentBundleV1`, `AssessmentIngestResult` types and `resolveAssessmentR2Path` helper to the I/O layer.

**Agent actions:**

- Add `AssessmentBundleV1` interface to `nachweis-io.ts` (matching RFC-0873 § AssessmentBundleV1)
- Add `assessmentBundleV1Schema` Zod schema to `nachweis-io.ts` — runtime validation of the full bundle (nested objects, arrays, enums). Reuse `ISO_8601_WITH_TZ` regex and assessment dimension validators from RFC-0872 schemas where applicable
- Add `AssessmentIngestResult` interface to `nachweis-io.ts`
- Add `resolveAssessmentR2Path(systemId, seriesId, observationId, artifactKey, ext)` helper returning `{systemId}/private/assessments/{seriesId}/{observationId}/{artifactKey}.{ext}`
- Add `mediaTypeToExt(mediaType)` helper mapping common media types to file extensions
- Update MODULE_CONTRACT and CHANGE_SUMMARY comments
- Export new types and functions from `index.ts`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — 0 errors

**Completion criterion:** Types and helper are exported from `@warpgogol/werkstatt/nachweis` and typecheck passes.

**Human review:** no

---

### Step 2. Implement nachweis-assessment-ingest.ts command handler

**Goal:** Create the full command handler with validation, hashing, idempotency, R2 upload, PBP write, and Bordbuch append.

**Agent actions:**

- Create `packages/werkstatt/src/nachweis/nachweis-assessment-ingest.ts`
- Implement `runNachweisAssessmentIngest(input, context)`:
  1. Parse `--system`, `--bundle`, `--dry-run`, `--json` flags
  2. Check `isNachweisEntitled` — return `makeSkipResult` if not resolved
  3. Read and parse bundle JSON file
  4. Validate bundle via `assessmentBundleV1Schema.safeParse(bundle)` — fail with `ASSESSMENT_BUNDLE_INVALID` on parse error
  5. Validate `bundle.systemId === --system` (fail with `ASSESSMENT_SYSTEM_MISMATCH`)
  6. Validate path safety: `slug`, `seriesId`, `observationId`, artifact `key` are path-safe (no `..`, no `/`, no symlinks)
  7. Validate at least one canonical `raw-result` artifact (fail with `ASSESSMENT_CANONICAL_RAW_REQUIRED`)
  8. Validate all artifact files exist and are inside bundle directory (fail with `ASSESSMENT_ARTIFACT_MISSING` or `ASSESSMENT_ARTIFACT_PATH_ESCAPE`)
  9. Validate `observedAt` is ISO 8601 with timezone (reuse `ISO_8601_WITH_TZ` regex from `nachweis-io.ts`)
  10. Validate bundle contains no credentials (scan for known secret patterns)
  11. Hash all artifacts via `computeSourceSha256` (reuse existing helper)
  12. Check idempotency: read existing PBP evidence-source for `slug`:
      - If exists with same `(seriesId, observationId)` and same artifact hashes → return `alreadyIngested: true` no-op
      - If exists with same `(seriesId, observationId)` but different hashes → fail with `ASSESSMENT_OBSERVATION_CONFLICT`
      - If new `observationId` in existing series → create new immutable observation (preserve old)
  13. If `--dry-run`: return result with `dryRun: true`, no remote mutations
  14. Upload missing artifacts to R2 via `uploadToR2` (reuse existing helper, handle `MissingEnvError`)
  15. Write/update PBP evidence-source entity using `parseMarkdownFrontmatter`/`stringifyMarkdownFrontmatter`:
      - Set `kind = technical-assessment`
      - Set `assessment.profile = technical-assessment`, `assessment.seriesId`, `assessment.observationId`, `assessment.observedAt`, `assessment.methodology`, `assessment.freshness`, `assessment.dimensions`, `assessment.authorizationBasis`
      - Set `items[artifact.key] = { sha256, storage: private, mediaType, qualityStatus: verified, role, canonical }`
  16. Acquire `system:{id}` and `bordbuch:{id}` locks
  17. Append Bordbuch `nachweis-record` entry via `appendAndCommitBordbuch` with metadata: `action: assessment-ingested`, `seriesId`, `observationId`, `providerId`, `toolId`, `observedAt`, `artifactHashes`, `verificationLevel: N1`
  18. Release locks
  19. Return `AssessmentIngestResult`
- Add MODULE_CONTRACT and CHANGE_SUMMARY comments

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — 0 errors

**Completion criterion:** Handler compiles, exports `runNachweisAssessmentIngest`, and follows the transaction order: validate → hash → idempotency → upload → PBP → Bordbuch.

**Human review:** no

---

### Step 3. Register command in nachweis.module.ts

**Goal:** Register `nachweis.assessment.ingest` in the module with correct flags, scope, and description.

**Agent actions:**

- Add `const { runNachweisAssessmentIngest } = await import("./nachweis-assessment-ingest.ts")` to `createNachweisModule`
- Register command with:
  - `name: "nachweis.assessment.ingest"`
  - `scope: "workspace"`, `mutatesState: true`, `cacheable: false`
  - Flags: `system`, `bundle` (required), `dry-run`, `json`
  - `execute: runNachweisAssessmentIngest`
- Add CHANGE_SUMMARY entry for RFC-0873

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — 0 errors
- `pnpm exec werkstatt run command.manifest.generate` — command appears in manifest

**Completion criterion:** Command is registered and appears in the command manifest.

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Create comprehensive unit tests covering all acceptance criteria.

**Agent actions:**

- Create `packages/werkstatt/src/tests-handoff/nachweis-assessment-ingest.test.ts`
- Test cases:
  1. Valid bundle dry-run performs no remote/file state mutation
  2. Valid bundle ingest produces verified hashes, R2 objects, PBP source, Bordbuch event
  3. Same ingest is idempotent (alreadyIngested: true)
  4. Same observation ID with changed content fails (ASSESSMENT_OBSERVATION_CONFLICT)
  5. New observation in same series preserves old artifacts and records
  6. Path traversal and symlink escape fail (ASSESSMENT_ARTIFACT_PATH_ESCAPE)
  7. Missing canonical raw artifact fails (ASSESSMENT_CANONICAL_RAW_REQUIRED)
  8. No credentials appear in JSON result, PBP, or Bordbuch
  9. Command supports `--json`
  10. Command is entitlement-gated (returns skip result when not entitled)
  11. System mismatch fails (ASSESSMENT_SYSTEM_MISMATCH)
  12. Missing env vars fail (ASSESSMENT_R2_MISSING_ENV / MISSING_ENV)
- Use the example bundles from `docs/nachweis-technical-evidence-extend-v1/examples/` as fixtures
- Mock R2 upload, Bordbuch append, and cache path resolution (follow existing test patterns from `nachweis-commands.test.ts`)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test` — all tests pass

**Completion criterion:** All 12+ test cases pass and cover every acceptance criterion.

**Human review:** no

---

### Step 5. Documentation sync

**Goal:** Update AGENTS.md and Compass XML to reflect the new command.

**Agent actions:**

- Update `packages/werkstatt/AGENTS.md` if needed — add note about `nachweis.assessment.ingest` under the nachweis section
- Update `docs/verification-plan.xml` if the verification surface changed (add verification entry for the new command)
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surface changed

**Validation:**

- `git diff` shows only expected documentation changes
- `pnpm exec werkstatt run rfc.validate --id RFC-0873` — passes

**Completion criterion:** Documentation artifacts are updated and consistent with code.

**Human review:** no

---

### Final Step. Review, fix, verify acceptance criteria, and stamp implemented

**Goal:** Run code review, fix findings, verify all acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm. Maximum 3 iterations
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0873 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0873` — passes
- `pnpm --filter @warpgogol/werkstatt run build:check` — 0 errors
- `pnpm --filter @warpgogol/werkstatt run test` — all tests pass
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0873`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0873` (RFC-0330, for probe-bearing RFCs created on or after 2026-07-07 — skip if no acceptance probes declared)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0873` in the subject line (RFC-0265 commit hygiene)
- `docs/rfcs/verification/rfc-0873.generated.json` — verification evidence (if acceptance probes exist)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| R2 orphan objects | Step 2: report orphan paths in structured error output; do not auto-delete |
| Bordbuch growth | Step 2: one Bordbuch entry per observation (not per artifact) |
| Agent misinterpretation risk | Step 3: distinct command name `nachweis.assessment.ingest` vs `nachweis.ingest` |
| Bundle path traversal | Step 2: validate paths reject `..`, symlinks, absolute paths; Step 4: test cases for traversal |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0873 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `technical-assessment` PBP evidence kind or `NachweisTechnicalAssessmentV1` interface is missing from `@warpgogol/werkstatt-site`, stop — RFC-0872 must be implemented first.
