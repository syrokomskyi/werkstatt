---
rfcId: RFC-0465
planDate: 2026-07-20
status: completed
---

# Plan: RFC-0465 — Triage and resolve pre-existing validation violations

## Objectives

1. Add `RFC_METADATA_CUTOFF` cutoff to RFC-CMD-02 and RFC-CMD-03 rules in `lifecycle.ts` to exempt pre-2026-07-07 RFCs.
2. Add `specRef` to `RfcFrontmatter` interface and `RFC_KNOWN_KEYS` array in `types.ts`.
3. Fix V-17: change status to `superseded` in RFC-0346 and RFC-0366.
4. Fix V-11: remove invalid `supersededBy: RFC-0388` from RFC-0346.
5. Fix V-19: add `RFC-0375` to `amendedBy` in RFC-0081.
6. Fix V-23: run `rfc.verification.emit --id RFC-0376` to create evidence file.
7. Add unit tests for cutoff date behavior.
8. Validate: `rfc.validate --json` reports 0 violations.

## Affected artifacts

| Path | Change |
| --- | --- |
| `packages/forge/os/rfc/handlers/lifecycle.ts` | Import `RFC_METADATA_CUTOFF`, add cutoff check to RFC-CMD-02/03 |
| `packages/forge/os/rfc/types.ts` | Add `specRef?: string` to `RfcFrontmatter`, add `"specRef"` to `RFC_KNOWN_KEYS` |
| `packages/forge/os/rfc/handlers/validate-rules.test.ts` | Add tests for cutoff date behavior |
| `docs/rfcs/archive/implemented/rfc-0346-*.md` | status → superseded, remove supersededBy |
| `docs/rfcs/archive/implemented/rfc-0366-*.md` | status → superseded |
| `docs/rfcs/archive/implemented/rfc-0081-*.md` | Add RFC-0375 to amendedBy |
| `docs/rfcs/verification/rfc-0376.generated.yaml` | Created by `rfc.verification.emit` |

## Step sequence

### Step 1: Add `specRef` to RFC schema

**Actions:**

- In `packages/forge/os/rfc/types.ts`:
  - Add `specRef?: string;` to `RfcFrontmatter` interface (after `satisfies?: string[];`)
  - Add `"specRef"` to `RFC_KNOWN_KEYS` array (after `"satisfies"`)

**Completion criterion:** `RFC_KNOWN_KEYS` includes `"specRef"` and `RfcFrontmatter` has `specRef?: string`.

### Step 2: Add cutoff to RFC-CMD-02/03 in lifecycle.ts

**Actions:**

- In `packages/forge/os/rfc/handlers/lifecycle.ts`:
  - Import `RFC_METADATA_CUTOFF` from `../types.ts`
  - In the RFC-CMD-02 loop (line 97-111): add `createdAt >= RFC_METADATA_CUTOFF` to the condition
  - In the RFC-CMD-03 loop (line 124-138): add `createdAt >= RFC_METADATA_CUTOFF` to the condition

**Completion criterion:** Pre-cutoff RFCs no longer trigger RFC-CMD-02/03 violations.

### Step 3: Fix V-17 — status to superseded

**Actions:**

- In `docs/rfcs/archive/implemented/rfc-0346-mandate-env-example-and-deploy-script-contracts-for-apps-and-backs.md`:
  - Change `status: implemented` to `status: superseded`
  - Set `closedAt: 2026-07-20`
- In `docs/rfcs/archive/implemented/rfc-0366-introduce-architectural-decision-records-and-retire-mini-rfc-template.md`:
  - Change `status: implemented` to `status: superseded`
  - Set `closedAt: 2026-07-20`

**Completion criterion:** Both RFCs have `status: superseded` and V-17 no longer fires.

### Step 4: Fix V-11 — remove invalid supersededBy

**Actions:**

- In `docs/rfcs/archive/implemented/rfc-0346-mandate-env-example-and-deploy-script-contracts-for-apps-and-backs.md`:
  - Remove `supersededBy: RFC-0388` (set to empty/null)

**Completion criterion:** RFC-0346 no longer has `supersededBy: RFC-0388` and V-11 no longer fires.

### Step 5: Fix V-19 — amendedBy mismatch

**Actions:**

- In `docs/rfcs/archive/implemented/rfc-0081-generated-file-governance-protocol.md`:
  - Add `RFC-0375` to `amendedBy` list (currently has RFC-0180, RFC-0185, RFC-0336, RFC-0376)

**Completion criterion:** RFC-0081 `amendedBy` includes `RFC-0375` and V-19 no longer fires.

### Step 6: Fix V-23 — create evidence file for RFC-0376

**Actions:**

- Run: `pnpm exec werkstatt run rfc.verification.emit --id RFC-0376`
- Verify the generated file at `docs/rfcs/verification/rfc-0376.generated.yaml` has `overall: "pass"`
- If `overall: "fail"`, inspect probe results and fix failing probes before proceeding

**Completion criterion:** Evidence file exists with `overall: "pass"` and V-23 no longer fires.

### Step 7: Add unit tests for cutoff behavior

**Actions:**

- In `packages/forge/os/rfc/handlers/validate-rules.test.ts` (or a new `lifecycle.test.ts`):
  - Add test: RFC with `createdAt < RFC_METADATA_CUTOFF` and non-registered command in `commands.added` → no RFC-CMD-02 violation
  - Add test: RFC with `createdAt >= RFC_METADATA_CUTOFF` and non-registered command in `commands.added` → RFC-CMD-02 violation
  - Add test: RFC with `createdAt < RFC_METADATA_CUTOFF` and non-registered command in `commands.changed` → no RFC-CMD-03 violation
  - Add test: RFC with `createdAt >= RFC_METADATA_CUTOFF` and non-registered command in `commands.changed` → RFC-CMD-03 violation

**Completion criterion:** Tests pass and cover both pre-cutoff and post-cutoff scenarios for both rules.

### Step 8: Validate

**Actions:**

- Run: `pnpm exec werkstatt run rfc.validate --json`
- Verify: 0 violations across all rules
- Run: `pnpm exec werkstatt run rfc.validate RFC-0465 --json`
- Verify: 0 violations

**Completion criterion:** `rfc.validate --json` reports 0 violations total.

### Step 9: Check acceptance criteria and stamp implemented

**Actions:**

- Check all 9 acceptance criteria in RFC-0465
- Mark each `[x]` with evidence
- Set `status: implemented`, `implementedAt: 2026-07-20`
- Run: `pnpm exec werkstatt run rfc.validate RFC-0465 --json` — must pass

**Completion criterion:** RFC-0465 status is `implemented` with all criteria checked.

## Validation suite

| Check | Command | Expected |
| --- | --- | --- |
| RFC validation | `pnpm exec werkstatt run rfc.validate --json` | 0 violations |
| RFC-0465 validation | `pnpm exec werkstatt run rfc.validate RFC-0465 --json` | pass |
| Unit tests | `pnpm --filter @wgogol/forge test` | all pass |
| V-23 evidence | `docs/rfcs/verification/rfc-0376.generated.yaml` exists with `overall: "pass"` | true |

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| RFC-0376 probes fail (overall != "pass") | Inspect probe results, fix failing probes or implementation before proceeding |
| Cutoff date breaks existing tests | Tests in step 7 cover both pre/post cutoff; fix any broken tests |
| `specRef` addition causes unexpected V-20 changes | V-20 only warns on keys NOT in `RFC_KNOWN_KEYS`; adding `specRef` resolves violations, doesn't create new ones |
