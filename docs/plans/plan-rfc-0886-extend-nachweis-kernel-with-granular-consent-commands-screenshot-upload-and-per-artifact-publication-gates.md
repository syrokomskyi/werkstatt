---
rfcId: RFC-0886
planId: PLAN-RFC-0886-01
status: draft
owner: architecture
createdAt: 2026-08-20
updatedAt:
scope:
  apps: []
  packages:
    - werkstatt
    - werkstatt-site
  services: []
  docs:
    - docs/verification-plan.xml
    - packages/werkstatt/AGENTS.md
---

# Implementation Plan: RFC-0886

## 1. Objectives

- [ ] O1 — `nachweis.consent.update` accepts `--scope` and updates `consentScope[scope]` instead of `consentStatus` (maps to acceptance criterion 1)
- [ ] O2 — `nachweis.screenshot.upload` command registered, uploads to R2, computes SHA-256, updates `EvidenceSource.websiteScreenshot` (maps to acceptance criteria 2, 3)
- [ ] O3 — `display-consent-consistent` gate condition added to `REQUIRED_CONDITIONS["attestation-v1"]` only; `evaluateGateV2` uses per-aspect consent logic (maps to acceptance criteria 4, 5)
- [ ] O4 — `nachweis.validate` reports `NACHWEIS-DISPLAY-CONSENT-01` violations for display↔consent mismatches (maps to acceptance criterion 6)
- [ ] O5 — `nachweis.manifest.generate` includes `display` and `websiteUrl` fields in manifest entries for Nachweis evidence kinds (maps to acceptance criterion 7)
- [ ] O6 — `--json` output format documented and stable for all changed commands (maps to acceptance criterion 8)
- [ ] O7 — `rfc.validate` passes on RFC-0886 (maps to acceptance criterion 9)

## 2. Affected artifacts

### 2.1 Code and commands

| File | Change |
| --- | --- |
| `packages/werkstatt/src/nachweis/nachweis-io.ts` | Add `"display-consent-consistent"` to `GATE_CONDITION_IDS`; add `display` and `websiteUrl` to `NachweisManifestEntry`; extend `NachweisConsentUpdateResult` with `scope` field; add `resolveNachweisScreenshotR2Path` helper; update `evaluateGateV2` to replace `consentData.consentStatus === "granted"` with per-aspect logic; add `display-consent-consistent` to `REQUIRED_CONDITIONS["attestation-v1"]` only |
| `packages/werkstatt/src/nachweis/nachweis-consent.ts` | Rewrite `runNachweisConsentUpdate`: add `--scope` flag, update `consentScope[scope].status/grantedAt/method` instead of `consentStatus/method/grantedAt`; update Bordbuch metadata to include `scope` |
| `packages/werkstatt/src/nachweis/nachweis-screenshot-upload.ts` | New file: `runNachweisScreenshotUpload` handler — reads file, computes SHA-256, infers mediaType, uploads to R2, updates `EvidenceSource.websiteScreenshot`, appends Bordbuch entry |
| `packages/werkstatt/src/nachweis/nachweis-validate.ts` | Add `NACHWEIS-DISPLAY-CONSENT-01` violation rule: for each `NACHWEIS_EVIDENCE_KINDS` entity, check `display[aspect] === "visible"` implies `consentScope[aspect].status === "granted"` |
| `packages/werkstatt/src/nachweis/nachweis-manifest.ts` | Add `display` and `websiteUrl` fields to manifest entries for Nachweis evidence kinds (when present on entity) |
| `packages/werkstatt/src/nachweis/nachweis.module.ts` | Register `nachweis.screenshot.upload` command; update `nachweis.consent.update` flags: add `--scope` (required), keep `--status` (required), keep `--method` (optional, default `"none"`) |

### 2.2 Configuration and data

No YAML/JSON/NDJSON configuration changes. R2 storage paths follow existing pattern: `{systemId}/screenshots/{slug}/website-screenshot.{ext}`.

### 2.3 Documentation and specs

| File | Change |
| --- | --- |
| `docs/verification-plan.xml` | Add `display-consent-consistent` gate condition and `NACHWEIS-DISPLAY-CONSENT-01` violation rule to Nachweis verification surface |
| `packages/werkstatt/AGENTS.md` | Add rule: `nachweis.consent.update` requires `--scope` flag; display↔consent coupling is enforced by the gate for `attestation-v1` only |

### 2.4 Validation and pipelines

- `nachweis.validate` is already in `SITES_BUILD_CHECK_PIPELINE` — no new pipeline wiring needed.
- `nachweis.screenshot.upload` is operator-invoked, not pipeline-embedded.
- No CI workflow changes.

## 3. Step sequence

### Step 1. Extend types and gate infrastructure in nachweis-io.ts

**Goal:** Add the `"display-consent-consistent"` gate condition ID, extend `NachweisConsentUpdateResult` with `scope`, add `display`/`websiteUrl` to `NachweisManifestEntry`, add `resolveNachweisScreenshotR2Path` helper, and update `REQUIRED_CONDITIONS["attestation-v1"]`.

**Agent actions:**

- Add `"display-consent-consistent"` to `GATE_CONDITION_IDS` array (after `"execution-authorization-basis-present"`).
- Add `display-consent-consistent` to `REQUIRED_CONDITIONS["attestation-v1"]` Set only. Do NOT add to `operational-measurement-v1` or `technical-assessment-v1`.
- Extend `NachweisConsentUpdateResult` interface: add `scope: string` field.
- Extend `NachweisManifestEntry` interface: add `display?: { document: string; screenshot: string; websiteLink: string }` and `websiteUrl?: string`.
- Add `resolveNachweisScreenshotR2Path(systemId: string, slug: string, ext: string): string` returning `${systemId}/screenshots/${slug}/website-screenshot${ext}`.
- Update `evaluateGateV2`: replace `const consentGranted = input.consentData?.consentStatus === "granted"` with per-aspect logic:
  - Read `display` from `input.evidenceData.display` (cast to `Record<string, string>`).
  - Read `consentScope` from `input.consentData?.consentScope` (cast to `Record<string, { status?: string }>`).
  - For each aspect in `["document", "screenshot", "websiteLink"]`: if `display[aspect] === "visible"`, require `consentScope[aspect]?.status === "granted"`.
  - `consentGranted` = all visible aspects have granted consent.
  - `displayConsentConsistent` = same as `consentGranted` (redundant but separate condition for clarity).
- Add `displayConsentConsistent` to `conditionResults` record.
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` comments.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` (TypeScript compilation)

**Completion criterion:** `GATE_CONDITION_IDS` includes `"display-consent-consistent"`; `REQUIRED_CONDITIONS["attestation-v1"]` includes it; `operational-measurement-v1` and `technical-assessment-v1` do NOT; `NachweisConsentUpdateResult` has `scope` field; `NachweisManifestEntry` has `display` and `websiteUrl` optional fields; `resolveNachweisScreenshotR2Path` exists; `evaluateGateV2` uses per-aspect consent logic; TypeScript compiles.

**Human review:** no

---

### Step 2. Rewrite nachweis-consent.ts for granular consent

**Goal:** Update `runNachweisConsentUpdate` to accept `--scope` flag and write `consentScope[scope]` instead of flat `consentStatus`.

**Agent actions:**

- Add `scope` flag parsing: `const scope = flagString(input, "scope")`.
- Add validation: `--scope` is required, must be one of `document|screenshot|websiteLink`.
- Read `consentScope` from entity frontmatter (instead of `consentStatus`).
- Read `previousStatus` from `consentScope[scope]?.status ?? "not_requested"`.
- Update `consentScope[scope]` with `{ status: newStatus, grantedAt: newStatus === "granted" ? ISO timestamp : null, method }`.
- Remove old `data.consentStatus = newStatus`, `data.method = method`, `data.grantedAt = ...` lines.
- Update Bordbuch metadata to include `scope`: `{ consentId, scope, previousStatus, newStatus, method }`.
- Update Bordbuch summary: `Consent '${consentId}' ${scope}: ${previousStatus} → ${newStatus}`.
- Update return `data` to include `scope`.
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` comments.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** `runNachweisConsentUpdate` accepts `--scope`, validates it against `document|screenshot|websiteLink`, updates `consentScope[scope]` in frontmatter, includes `scope` in Bordbuch metadata and result; old `consentStatus`/`method`/`grantedAt` top-level writes are removed; TypeScript compiles.

**Human review:** no

---

### Step 3. Create nachweis-screenshot-upload.ts

**Goal:** New command handler for screenshot upload to R2.

**Agent actions:**

- Create `packages/werkstatt/src/nachweis/nachweis-screenshot-upload.ts`.
- Implement `runNachweisScreenshotUpload(input, context)`:
  1. Parse `--system`, `--slug`, `--file` flags.
  2. Validate entitlement (`isNachweisEntitled`).
  3. Resolve cache path, default lang, evidence-source entity dir.
  4. Read evidence-source entity file (`{slug}.md`), parse frontmatter.
  5. Read screenshot file bytes, compute SHA-256 via `byteHashFile`.
  6. Infer `mediaType` from extension (`.webp` → `image/webp`, `.png` → `image/png`, `.jpg`/`.jpeg` → `image/jpeg`). Fail on unsupported extension.
  7. Resolve R2 path via `resolveNachweisScreenshotR2Path(systemId, slug, ext)`.
  8. Upload to R2 via `uploadToR2` with `contentType` parameter.
  9. Update `data.websiteScreenshot = { sha256, mediaType, storage: "public", url: <r2 public url> }`.
  10. Write updated entity file via `writeFileIfChanged`.
  11. Acquire locks, append Bordbuch entry (`nachweis-record` kind, metadata `{ slug, screenshotSha256, mediaType }`), release locks.
  12. Return `NachweisScreenshotUploadResult`.
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` comments.
- Export `NachweisScreenshotUploadResult` interface from `nachweis-io.ts`.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** `nachweis-screenshot-upload.ts` exists, exports `runNachweisScreenshotUpload`, follows the existing handler pattern (entitlement check, cache path, lock, Bordbuch, write), TypeScript compiles.

**Human review:** no

---

### Step 4. Add NACHWEIS-DISPLAY-CONSENT-01 to nachweis-validate.ts

**Goal:** Add display↔consent consistency check to `nachweis.validate`.

**Agent actions:**

- After the existing consent check loop (lines 195-207), add a new loop for `NACHWEIS-DISPLAY-CONSENT-01`:
  - For each `evidenceSources` entry where kind is in `NACHWEIS_EVIDENCE_KINDS`:
    - Read `display` from `es.data.display` (cast to `Record<string, string>`).
    - If `display` is absent, skip (grandfathered pre-migration record).
    - Find matching consent entity by slug.
    - Read `consentScope` from consent entity data.
    - For each aspect in `["document", "screenshot", "websiteLink"]`:
      - If `display[aspect] === "visible"` and `consentScope[aspect]?.status !== "granted"`: emit violation `{ rule: "NACHWEIS-DISPLAY-CONSENT-01", message: "display.{aspect} is 'visible' but consentScope.{aspect}.status is '{status}' (must be 'granted')", recordId: es.id }`.
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` comments.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** `nachweis-validate.ts` includes `NACHWEIS-DISPLAY-CONSENT-01` check for `NACHWEIS_EVIDENCE_KINDS` entities; violations are added to `violations[]` array (exitCode 1); non-Nachweis kinds are skipped; entities without `display` field are skipped; TypeScript compiles.

**Human review:** no

---

### Step 5. Update nachweis-manifest.ts for display and websiteUrl fields

**Goal:** Add `display` and `websiteUrl` to manifest entries for Nachweis evidence kinds.

**Agent actions:**

- In the manifest entry construction loop (after line 156), add:
  - `display: (data.display as { document: string; screenshot: string; websiteLink: string } | undefined)` — include only when present.
  - `websiteUrl: (data.websiteUrl as string | undefined)` — include only when present.
- These fields are added for all `NACHWEIS_EVIDENCE_KINDS` entries (the existing `kind` check already filters).
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` comments.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** `nachweis-manifest.ts` includes `display` and `websiteUrl` in manifest entries when present on the entity; TypeScript compiles.

**Human review:** no

---

### Step 6. Register nachweis.screenshot.upload and update consent.update flags in nachweis.module.ts

**Goal:** Wire the new command and update the changed command registration.

**Agent actions:**

- Add dynamic import: `const { runNachweisScreenshotUpload } = await import("./nachweis-screenshot-upload.ts")`.
- Register `nachweis.screenshot.upload` command:
  - `scope: "workspace"`, `supportsAllSites: false`, `mutatesState: true`, `cacheable: false`.
  - Flags: `system` (string), `slug` (string, required), `file` (string, required), `dry-run` (boolean), `json` (boolean).
  - `reads: []`, `writes: []`, `execute: runNachweisScreenshotUpload`.
- Update `nachweis.consent.update` registration:
  - Add `--scope` flag: `{ kind: "string", required: true, description: "Consent scope (document|screenshot|websiteLink)" }`.
  - Update description to mention `--scope` and `consentScope`.
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` comments.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** `nachweis.screenshot.upload` is registered with correct name, scope, and flags; `nachweis.consent.update` has `--scope` flag in registration; TypeScript compiles.

**Human review:** no

---

### Step 7. Write unit tests

**Goal:** Test the new and changed functionality.

**Agent actions:**

- Create `packages/werkstatt/src/nachweis/nachweis-consent-scope.test.ts`:
  - Test `nachweis.consent.update --scope document --status granted` updates `consentScope.document.status` to `"granted"`, sets `grantedAt`, sets `method`.
  - Test `--scope screenshot --status denied` updates `consentScope.screenshot.status` to `"denied"`, `grantedAt` is null.
  - Test `--scope` validation: invalid scope throws.
  - Test `--method` defaults to `"none"` when not provided.
- Create `packages/werkstatt/src/nachweis/nachweis-screenshot-upload.test.ts`:
  - Test successful upload: SHA-256 computed, R2 path correct, entity updated, Bordbuch appended.
  - Test unsupported extension fails.
  - Test non-existent evidence entity fails.
  - Test dry-run skips R2 upload and entity update.
- Create or extend `packages/werkstatt/src/nachweis/nachweis-gate-display-consent.test.ts`:
  - Test `display-consent-consistent` passes when all visible aspects have granted consent.
  - Test `display-consent-consistent` fails when `display.document = "visible"` but `consentScope.document.status = "not_requested"`.
  - Test `display-consent-consistent` is `not_applicable` for `operational-measurement-v1` and `technical-assessment-v1`.
  - Test `NACHWEIS-DISPLAY-CONSENT-01` violation emitted by `nachweis.validate` for mismatched records.
  - Test non-Nachweis kinds are skipped.
  - Test entities without `display` field are skipped (grandfathered).

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test`

**Completion criterion:** All new tests pass; existing tests still pass.

**Human review:** no

---

### Step 8. Update documentation (AGENTS.md, verification-plan.xml)

**Goal:** Synchronize documentation artifacts.

**Agent actions:**

- Update `packages/werkstatt/AGENTS.md`: add rule under Nachweis section — `nachweis.consent.update` requires `--scope` flag (document|screenshot|websiteLink); display↔consent coupling is enforced by the gate for `attestation-v1` only; `nachweis.screenshot.upload` stores screenshots at `{systemId}/screenshots/{slug}/website-screenshot.{ext}` in R2.
- Update `docs/verification-plan.xml`: add `display-consent-consistent` gate condition and `NACHWEIS-DISPLAY-CONSENT-01` violation rule to the Nachweis verification surface.

**Validation:**

- `git diff` shows only the expected documentation files changed.

**Completion criterion:** `packages/werkstatt/AGENTS.md` includes the new rules; `docs/verification-plan.xml` includes the new gate condition and violation rule.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0886 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0886`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0886`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0886` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Gate false positives — operator sets `display.screenshot: "visible"` without updating consent | Step 4: `nachweis.validate` reports `NACHWEIS-DISPLAY-CONSENT-01` before publish attempt, giving operator early warning |
| R2 storage growth — screenshots 100KB–500KB each | Step 3: screenshots stored at dedicated path prefix, not mixed with evidence PDFs; `storage: "public"` only |
| Agent confusion — agents use old `--status` without `--scope` | Step 2: `--scope` is required, command fails with clear error; Step 8: AGENTS.md documents the new flag |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 or DNA-59, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0886 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `display-consent-consistent` needs to be required for `operational-measurement-v1` (currently not required), this is a policy change requiring a new amending RFC, not an implementation adjustment.
