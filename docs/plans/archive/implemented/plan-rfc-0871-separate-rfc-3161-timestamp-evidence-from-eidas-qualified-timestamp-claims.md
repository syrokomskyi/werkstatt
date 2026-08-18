---
rfcId: RFC-0871
planId: PLAN-RFC-0871-01
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
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0871

## 1. Objectives

- [ ] O1 — `TimestampAssurance` type and `qualificationEvidenceRef` field added to N3 types — maps to "Timestamp assurance is machine-readable"
- [ ] O2 — `nachweis.timestamp` accepts `--timestamp-assurance` and `--qualification-evidence-ref` flags, defaults to `rfc3161`, fails `eidas-qualified` without evidence — maps to "Default `nachweis.timestamp` records `rfc3161`" and "`eidas-qualified` without qualification evidence fails deterministically"
- [ ] O3 — `nachweis.validate` emits `n3-timestamp-qualification-evidence-missing` violation for `eidas-qualified` records without evidence ref — maps to "`eidas-qualified` without qualification evidence fails deterministically"
- [ ] O4 — `nachweis.verify-signature` reports `timestampAssurance` in result, legacy entries project as `rfc3161` — maps to "Legacy missing assurance projects as `rfc3161`"
- [ ] O5 — `nachweis.manifest.generate` includes `timestampAssurance` in manifest entries — maps to "Timestamp assurance is machine-readable"
- [ ] O6 — UI components (`nachweis-verify`, `nachweis-detail`) display assurance-aware labels — maps to "Verify/detail pages expose the actual assurance class"
- [ ] O7 — warpgogol-com public copy corrected via mission workpiece (not systems-cache directly) — maps to "Homepage Nachweis copy no longer says `RFC 3161 qualified timestamp` generically"
- [ ] O8 — Unit tests cover both assurance classes and legacy projection — maps to "Unit tests cover both assurance classes and legacy projection"
- [ ] O9 — No existing hash-chain entry is mutated — maps to "No existing hash-chain entry is mutated"

## 2. Affected artifacts

### 2.1 Code and commands

**`packages/werkstatt/src/nachweis/` (kernel — `@warpgogol/werkstatt`):**

- `nachweis-n3-types.ts` — add `TimestampAssurance` type, `qualificationEvidenceRef` to `NachweisTimestampResult`, `timestampAssurance` to `NachweisVerifySignatureResult`
- `nachweis-timestamp.ts` — accept `--timestamp-assurance` and `--qualification-evidence-ref` flags, validate `eidas-qualified` requires evidence ref, write both to Bordbuch metadata, include in result
- `nachweis-verify-signature.ts` — read `timestampAssurance` from Bordbuch metadata (default `rfc3161`), include in result
- `nachweis-validate.ts` — new violation rule `n3-timestamp-qualification-evidence-missing` for published N3 records with `eidas-qualified` assurance but missing `qualificationEvidenceRef`
- `nachweis-manifest.ts` — read `timestampAssurance` from Bordbuch for each record, add to `NachweisManifestEntry`
- `nachweis-io.ts` — add `timestampAssurance` to `NachweisManifestEntry` interface
- `nachweis.module.ts` — add `--timestamp-assurance` and `--qualification-evidence-ref` flags to `nachweis.timestamp` command registration, update description
- `nachweis-n3.test.ts` — new tests for both assurance classes, legacy projection, `eidas-qualified` without evidence failure

**`packages/werkstatt-site/src/domain/ui/components/` (UI — `@warpgogol/werkstatt-site`):**

- `nachweis-verify/nachweis-verify-component.astro` — replace `qualifiedTimestamp?: string` prop with `timestamp?: { tokenPresent, assurance, providerName?, qualificationEvidenceRef? }` shape, conditional label rendering
- `nachweis-detail/nachweis-detail-component.astro` — same replacement in `Sichtpass` interface

### 2.2 Configuration and data

- `systems-cache/warpgogol-com/` — NOT modified directly. Site content changes go through mission workpiece.
- Bordbuch metadata schema extended with optional `timestampAssurance` and `qualificationEvidenceRef` fields on `nachweis-timestamped` entries.

### 2.3 Documentation and specs

- `packages/werkstatt/AGENTS.md` — document new `nachweis.timestamp` flags and `nachweis.validate` violation rule
- `packages/werkstatt-site/AGENTS.md` — document new UI component prop shape
- RFC file is read-only reference (already enhanced and accepted)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/werkstatt run test` — vitest unit tests
- `pnpm exec werkstatt run rfc.validate --id=RFC-0871` — RFC validation
- `pnpm exec werkstatt run mission.validate --site=warpgogol-com` — mission validation (in workpiece)

## 3. Step sequence

### Step 1. Materialize mission workpiece for warpgogol-com

**Goal:** Create an open mission workpiece for warpgogol-com so site content changes go through the mission, not systems-cache directly.

**Agent actions:**

- Run `pnpm exec werkstatt run mission.materialize --site=warpgogol-com --reason "RFC-0871: timestamp assurance terminology correction"`
- Verify workpiece exists at `missions/warpgogol-com-m<NNN>/workpiece/`
- Note the mission ID for subsequent steps

**Validation:**

- `ls missions/warpgogol-com-m<NNN>/workpiece/src/content/pages/de/home.md` exists
- Workpiece git status is clean (or commit any generated artifacts from materialization)

**Completion criterion:** Mission workpiece exists and is accessible. Mission remains open — do NOT run `mission.close`.

**Human review:** no

---

### Step 2. Add `TimestampAssurance` type and extend result interfaces

**Goal:** Define the shared type contract that all commands and UI components depend on.

**Agent actions:**

- In `packages/werkstatt/src/nachweis/nachweis-n3-types.ts`:
  - Add `export type TimestampAssurance = "rfc3161" | "eidas-qualified";`
  - Add `timestampAssurance: TimestampAssurance;` and `qualificationEvidenceRef?: string;` to `NachweisTimestampResult`
  - Add `timestampAssurance: TimestampAssurance;` to `NachweisVerifySignatureResult`
- In `packages/werkstatt/src/nachweis/nachweis-io.ts`:
  - Add `timestampAssurance: TimestampAssurance;` to `NachweisManifestEntry` (import `TimestampAssurance` from `nachweis-n3-types.ts`)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — compilation passes with new types

**Completion criterion:** Types compile, all consumers of the interfaces see the new fields.

**Human review:** no

---

### Step 3. Update `nachweis.timestamp` command handler and registration

**Goal:** Accept new flags, validate `eidas-qualified` requires evidence, write assurance metadata to Bordbuch.

**Agent actions:**

- In `packages/werkstatt/src/nachweis/nachweis-timestamp.ts`:
  - Read `--timestamp-assurance` flag (default `rfc3161`), validate value is `rfc3161` or `eidas-qualified`
  - Read `--qualification-evidence-ref` flag
  - If `timestampAssurance === "eidas-qualified"` and `qualificationEvidenceRef` is empty/missing, throw with `TIMESTAMP_QUALIFICATION_EVIDENCE_REQUIRED`
  - Add `timestampAssurance` and `qualificationEvidenceRef` to Bordbuch metadata in `appendAndCommitBordbuch` call
  - Add both fields to `NachweisTimestampResult` in all return paths (success, idempotent, dry-run)
  - Update MODULE_CONTRACT and CHANGE_SUMMARY comments
- In `packages/werkstatt/src/nachweis/nachweis.module.ts`:
  - Add `"timestamp-assurance": { kind: "string", description: "Timestamp assurance level (rfc3161 | eidas-qualified, default: rfc3161)" }` to flags
  - Add `"qualification-evidence-ref": { kind: "string", description: "Evidence reference URL (required when --timestamp-assurance=eidas-qualified)" }` to flags
  - Update command description to mention RFC-0871

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test -- --grep "nachweis.timestamp"` — existing tests still pass

**Completion criterion:** `nachweis.timestamp --dry-run` returns `timestampAssurance: "rfc3161"` by default. `--timestamp-assurance eidas-qualified` without `--qualification-evidence-ref` throws `TIMESTAMP_QUALIFICATION_EVIDENCE_REQUIRED`.

**Human review:** no

---

### Step 4. Update `nachweis.verify-signature` to report assurance

**Goal:** Read `timestampAssurance` from Bordbuch metadata and include in result.

**Agent actions:**

- In `packages/werkstatt/src/nachweis/nachweis-verify-signature.ts`:
  - After finding `timestampedEntry`, read `timestampAssurance` from `timestampedEntry.metadata?.timestampAssurance`, default to `"rfc3161"` if absent
  - Add `timestampAssurance` to all return paths (success, no-signature, incomplete-metadata)
  - Update details string to include assurance class
  - Update MODULE_CONTRACT and CHANGE_SUMMARY comments

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test -- --grep "nachweis.verify"` — existing tests still pass

**Completion criterion:** `NachweisVerifySignatureResult` includes `timestampAssurance` field. Legacy entries without metadata return `"rfc3161"`.

**Human review:** no

---

### Step 5. Update `nachweis.validate` with qualification evidence check

**Goal:** Fail published N3 records that claim `eidas-qualified` without evidence reference.

**Agent actions:**

- In `packages/werkstatt/src/nachweis/nachweis-validate.ts`:
  - After the existing `hasTimestamped` check (line ~282), find the `nachweis-timestamped` entry for the slug
  - If `metadata?.timestampAssurance === "eidas-qualified"` and `metadata?.qualificationEvidenceRef` is empty/missing, push violation with rule `n3-timestamp-qualification-evidence-missing`
  - Update CHANGE_SUMMARY comment

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test -- --grep "nachweis.validate"` — existing tests still pass

**Completion criterion:** A record with `eidas-qualified` assurance and no `qualificationEvidenceRef` produces `n3-timestamp-qualification-evidence-missing` violation. Legacy records (no `timestampAssurance` metadata) do NOT trigger this violation.

**Human review:** no

---

### Step 6. Update `nachweis.manifest.generate` to include assurance

**Goal:** Manifest entries include `timestampAssurance` so UI and external consumers can read it.

**Agent actions:**

- In `packages/werkstatt/src/nachweis/nachweis-manifest.ts`:
  - After building each `NachweisManifestEntry`, read Bordbuch entries for the slug to find the `nachweis-timestamped` entry
  - Extract `timestampAssurance` from metadata, default `"rfc3161"`
  - Add `timestampAssurance` to the manifest entry object
  - Import `readBordbuch` from `../bordbuch/bordbuch-io.ts` (already imported in other nachweis files)
  - Update CHANGE_SUMMARY comment

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** `manifest.json` entries include `timestampAssurance` field. Legacy records show `"rfc3161"`.

**Human review:** no

---

### Step 7. Update UI components

**Goal:** Replace `qualifiedTimestamp` prop with `timestamp` prop shape, render assurance-aware labels.

**Agent actions:**

- In `packages/werkstatt-site/src/domain/ui/components/nachweis-verify/nachweis-verify-component.astro`:
  - Replace `qualifiedTimestamp?: string` with `timestamp?: { tokenPresent: boolean; assurance: "rfc3161" | "eidas-qualified"; providerName?: string; qualificationEvidenceRef?: string }` in `NachweisVerifyContent` interface
  - Update destructuring to extract `timestamp`
  - Replace the `qualifiedTimestamp` rendering block with conditional rendering based on `timestamp?.tokenPresent`:
    - `assurance === "rfc3161"`: label `RFC 3161-Zeitstempel`
    - `assurance === "eidas-qualified"`: label `qualifizierter elektronischer Zeitstempel (eIDAS)`, optionally show `qualificationEvidenceRef` as link
- In `packages/werkstatt-site/src/domain/ui/components/nachweis-detail/nachweis-detail-component.astro`:
  - Same replacement in `Sichtpass` interface and rendering

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` (if available) or `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** Components accept `timestamp` prop with assurance field. Labels render based on assurance class. No `qualifiedTimestamp` prop remains in component interfaces.

**Human review:** no

---

### Step 8. Write unit tests

**Goal:** Cover both assurance classes, legacy projection, and the `eidas-qualified` without evidence failure.

**Agent actions:**

- In `packages/werkstatt/src/nachweis/nachweis-n3.test.ts`:
  - Add test: `nachweis.timestamp` with `--timestamp-assurance rfc3161` (default) writes `timestampAssurance: "rfc3161"` to result and Bordbuch metadata
  - Add test: `nachweis.timestamp` with `--timestamp-assurance eidas-qualified` and `--qualification-evidence-ref "https://example.eu/tl/..."` writes both to result and metadata
  - Add test: `nachweis.timestamp` with `--timestamp-assurance eidas-qualified` without `--qualification-evidence-ref` throws `TIMESTAMP_QUALIFICATION_EVIDENCE_REQUIRED`
  - Add test: `nachweis.verify-signature` on legacy entry (no `timestampAssurance` metadata) returns `timestampAssurance: "rfc3161"`
  - Add test: `nachweis.verify-signature` on entry with `timestampAssurance: "eidas-qualified"` returns it correctly
  - Add test: `nachweis.validate` on record with `eidas-qualified` assurance but no `qualificationEvidenceRef` produces `n3-timestamp-qualification-evidence-missing` violation
  - Add test: `nachweis.validate` on legacy record (no `timestampAssurance` metadata) does NOT produce the violation
  - Verify existing tests still pass (no hash-chain mutation, legacy records still verify)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test -- --grep "nachweis"` — all tests pass

**Completion criterion:** All new tests pass. Existing tests pass. No test weakened or deleted.

**Human review:** no

---

### Step 9. Update AGENTS.md files

**Goal:** Document new command flags, violation rule, and UI prop shape for agents.

**Agent actions:**

- In `packages/werkstatt/AGENTS.md`: add entry under the nachweis section documenting:
  - `nachweis.timestamp` new flags: `--timestamp-assurance` (default `rfc3161`), `--qualification-evidence-ref` (required for `eidas-qualified`)
  - `nachweis.validate` new violation: `n3-timestamp-qualification-evidence-missing`
  - Legacy projection rule: entries without `timestampAssurance` default to `rfc3161`
- In `packages/werkstatt-site/AGENTS.md`: add entry documenting:
  - `nachweis-verify` and `nachweis-detail` components use `timestamp` prop shape (not `qualifiedTimestamp`)
  - Label rendering depends on `assurance` field

**Validation:**

- `git diff packages/werkstatt/AGENTS.md packages/werkstatt-site/AGENTS.md` — shows additions only

**Completion criterion:** Both AGENTS.md files updated with RFC-0871 changes.

**Human review:** no

---

### Step 10. Commit kernel and UI package changes

**Goal:** Commit all `packages/` changes via `ecosystem.commit`.

**Agent actions:**

- Run `pnpm exec werkstatt run ecosystem.commit --message "RFC-0871: separate RFC 3161 timestamp evidence from eIDAS qualified timestamp claims

Add TimestampAssurance type to N3 types. Update nachweis.timestamp, nachweis.validate, nachweis.verify-signature, nachweis.manifest.generate to handle assurance metadata. Update UI components to use assurance-aware labels. Legacy records project as rfc3161."`

- This commits changes in `packages/werkstatt/` and `packages/werkstatt-site/`

**Validation:**

- `git log --oneline -1` — shows the ecosystem.commit
- `git status` — clean working tree (except mission workpiece which is committed separately)

**Completion criterion:** Package changes committed to platform repo.

**Human review:** no

---

### Step 11. Update warpgogol-com site content in mission workpiece

**Goal:** Correct public copy and page block props in the mission workpiece (NOT systems-cache directly). This step runs AFTER packages are committed so UI components are already updated.

**Agent actions:**

- In `missions/warpgogol-com-m<NNN>/workpiece/src/content/pages/`:
  - `de/home.md`: replace "Qualifizierter Zeitstempel (RFC 3161)" with "RFC 3161-Zeitstempel"
  - `uk/home.md`: replace "Кваліфікована мітка часу (RFC 3161)" with "мітка часу RFC 3161"
  - `de/services.md`: replace "qualifizierten Zeitstempel" with "RFC 3161-Zeitstempel"
  - `de/nachweise.md`: replace "qualifizierter Zeitstempel" with "RFC 3161-Zeitstempel" in subheading and list items
  - `uk/nachweise.md`: replace "кваліфікована мітка часу" with "мітка часу RFC 3161" in subheading and list items
  - `de/nachweis-verify.md`: replace "qualifizierter Zeitstempel" with "RFC 3161-Zeitstempel" in description; replace `qualifiedTimestamp` prop with `timestamp` shape
  - `uk/nachweis-verify.md`: replace "кваліфікована мітка часу" with "мітка часу RFC 3161" in description; replace `qualifiedTimestamp` prop with `timestamp` shape
  - `de/nachweis-detail.md`: replace `qualifiedTimestamp` prop with `timestamp` shape
  - `uk/nachweis-detail.md`: replace `qualifiedTimestamp` prop with `timestamp` shape
- Commit workpiece changes: `pnpm exec werkstatt run mission.git.commit --mission warpgogol-com-m<NNN> --message "RFC-0871: correct timestamp terminology in public copy and page props"`

**Validation:**

- `grep -ri "qualifizierter Zeitstempel\|кваліфікована мітка часу" missions/warpgogol-com-m<NNN>/workpiece/src/content/pages/` — no matches
- `grep -ri "qualifiedTimestamp" missions/warpgogol-com-m<NNN>/workpiece/src/content/pages/` — no matches

**Completion criterion:** No occurrences of "qualifizierter Zeitstempel", "кваліфікована мітка часу", or `qualifiedTimestamp` in workpiece page content. Changes committed via `mission.git.commit`.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review, verify acceptance criteria, stamp RFC as implemented. Mission remains open.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check `packages/werkstatt/AGENTS.md` and `packages/werkstatt-site/AGENTS.md` against `git diff`.
- Run `pnpm exec werkstatt run rfc.validate --id=RFC-0871` — must pass with 0 violations.
- Run `pnpm --filter @warpgogol/werkstatt run build:check` — must pass.
- Run `pnpm --filter @warpgogol/werkstatt run test` — all tests pass.
- Run `pnpm exec werkstatt run mission.validate --site=warpgogol-com` — mission workpiece validates.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against implemented code. Mark `[x]` with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0871 --implementation-commit <sha>`.
- **Do NOT run `mission.close`** — the mission stays open for future work on other documents.

**Validation:**

- `git status` — no uncommitted changes from current session (except mission workpiece which is intentionally left open).
- `pnpm exec werkstatt run rfc.validate --id=RFC-0871` — 0 violations.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All acceptance criteria checked off with evidence annotations. RFC stamped as `implemented`. Mission remains open.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id=RFC-0871`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm exec werkstatt run mission.validate --site=warpgogol-com` (in workpiece)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0871` in the subject line
- Test file with new test cases as evidence for acceptance criteria
- No `rfc.verification.emit` needed (RFC-0871 has no acceptance probes in frontmatter)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Agent misinterpretation: setting `eidas-qualified` from TSA name | Step 3: fail-closed validation requires `qualificationEvidenceRef`. Step 8: test verifies the failure. |
| False-positive for `n3-timestamp-qualification-evidence-missing` on legacy records | Step 5: only checks entries where `timestampAssurance === "eidas-qualified"` explicitly. Step 8: test verifies legacy records don't trigger. |
| Content migration: missed pages with `qualifiedTimestamp` | Step 11: grep verification after all page edits. |
| Stale qualification evidence | RFC records assurance at timestamp time, not validation time. No mitigation needed in plan — this is by design (K-0001). |
| Hash-chain mutation | Step 3: only new entries get `timestampAssurance` metadata. Step 8: test verifies existing entries unchanged. Idempotency check in `nachweis.timestamp` returns existing entry without modification. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-53 or DNA-59, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0871 --reason "..." --invariant "DNA-NN"` instead of working around it.
- If the UI component prop change breaks page rendering in unexpected ways, investigate whether the `timestamp` prop shape conflicts with existing page block schemas before adjusting.
