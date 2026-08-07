---
rfcId: RFC-0728
planId: PLAN-RFC-0728-01
status: draft
owner: architecture
createdAt: 2026-08-07
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/pbp"
  services: []
  docs: []
---

# Implementation Plan: RFC-0728

## 1. Objectives

- [ ] Objective 1 — Change `offeringSchema` charges field from `z.unknown()` to `pbpChargeSchema` (maps to acceptance criterion 1)
- [ ] Objective 2 — Update all 12 offering files (6 UK + 6 DE) with quoted decimal strings (maps to acceptance criterion 2)
- [ ] Objective 3 — Add `model` discriminator to every charge amount in all 12 files (maps to acceptance criterion 3)
- [ ] Objective 4 — Add `purpose` field to every charge in all 12 files (maps to acceptance criterion 4)
- [ ] Objective 5 — Pass typecheck and tests for `@warpgogol/pbp` (maps to acceptance criteria 5–6)
- [ ] Objective 6 — Pass `rfc.validate` (maps to acceptance criterion 7)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/pbp/src/schemas/offering.ts` — schema change: `charges` field type from `z.record(z.string(), z.unknown())` to `z.record(z.string(), pbpChargeSchema)`
- `packages/pbp/src/schemas/pricing.ts` — source of `pbpChargeSchema` (no changes, import only)

### 2.2 Configuration and data

- `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/uk/offerings/digital-foundation.md`
- `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/uk/offerings/automation.md`
- `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/uk/offerings/booking.md`
- `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/uk/offerings/visibility.md`
- `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/uk/offerings/reputation.md`
- `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/uk/offerings/multilingual.md`
- `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/de/offerings/digital-foundation.md`
- `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/de/offerings/automation.md`
- `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/de/offerings/booking.md`
- `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/de/offerings/visibility.md`
- `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/de/offerings/reputation.md`
- `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/de/offerings/multilingual.md`

### 2.3 Documentation and specs

- RFC file: `docs/rfcs/rfc-0728-enforce-pbpchargeschema-on-offering-pricing-charges.md` (read-only reference)
- No AGENTS.md updates needed — no new commands, no new package boundaries
- No Compass XML updates needed — no repository-wide semantic changes
- No DNA invariant changes needed

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/pbp run build:check` — TypeScript typecheck
- `pnpm --filter @warpgogol/pbp run test` — Vitest unit tests
- `pnpm exec site-kernel run rfc.validate --id RFC-0728` — RFC mechanical validation

## 3. Step sequence

### Step 1. Schema change — wire `pbpChargeSchema` into `offeringSchema`

**Goal:** Change the `charges` field in `pbpPricingSchema` from `z.record(z.string(), z.unknown())` to `z.record(z.string(), pbpChargeSchema)`.

**Agent actions:**

- In `packages/pbp/src/schemas/offering.ts`, add import of `pbpChargeSchema` from `./pricing.js`
- Change line 42: `charges: z.record(z.string(), z.unknown()).optional()` → `charges: z.record(z.string(), pbpChargeSchema).optional()`
- Do NOT change `plans` or `adjustments` — they remain `z.unknown()` (non-goals)

**Validation:**

- `pnpm --filter @warpgogol/pbp run build:check` passes (typecheck confirms the import and type compatibility)

**Completion criterion:** `offering.ts` imports `pbpChargeSchema` and uses it for `charges` field; `build:check` passes.

**Human review:** no

---

### Step 2. Update UK offering files — add `model`, `purpose`, quote decimals

**Goal:** Update all 6 UK offering files to comply with `pbpChargeSchema`.

**Agent actions:**

For each UK offering file, apply these transformations to every charge entry:

- **`digital-foundation.md`** (4 charges):
  - `monthlySubscription`: add `model: fixed`, quote `value: "70.00"`, add `purpose: subscription`
  - `yearlySubscription`: add `model: fixed`, quote `value: "700.00"`, add `purpose: subscription`
  - `activation`: add `model: fixed`, quote `value: "200.00"`, add `purpose: activation`
  - `additionalSmallChange`: add `model: unit-rate`, quote `unitValue: "15.00"`, add `purpose: additional-service`

- **`automation.md`** (1 charge):
  - `monthlySubscription`: already has `model: range` and quoted decimals; add `purpose: subscription`

- **`booking.md`** (1 charge):
  - `monthlySubscription`: add `model: fixed`, add `purpose: subscription` (value already quoted)

- **`visibility.md`** (1 charge):
  - `monthlySubscription`: add `model: fixed`, add `purpose: subscription` (value already quoted)

- **`reputation.md`** (1 charge):
  - `monthlySubscription`: add `model: fixed`, add `purpose: subscription` (value already quoted)

- **`multilingual.md`** (2 charges):
  - `pageLanguageSetup`: add `model: unit-rate` (has `unitValue`), add `purpose: setup` (value already quoted)
  - `languageSubscription`: add `model: fixed`, add `purpose: subscription` (value already quoted)

**Validation:**

- Visual inspection: every charge has `model`, `purpose`, and quoted decimal strings
- No YAML parse errors (quoted strings are valid YAML)

**Completion criterion:** All 6 UK offering files have `model`, `purpose`, and quoted decimal strings on every charge.

**Human review:** no

---

### Step 3. Update DE offering files — add `model`, `purpose`, quote decimals

**Goal:** Update all 6 DE offering files to comply with `pbpChargeSchema`.

**Agent actions:**

Apply the same transformations as Step 2 to the DE versions:

- **`digital-foundation.md`** (4 charges): same as UK — add `model`, `purpose`, quote decimals
- **`automation.md`** (1 charge): add `purpose: subscription` (already has `model: range` and quoted decimals)
- **`booking.md`** (1 charge): add `model: fixed`, add `purpose: subscription`
- **`visibility.md`** (1 charge): add `model: fixed`, add `purpose: subscription`
- **`reputation.md`** (1 charge): add `model: fixed`, add `purpose: subscription`
- **`multilingual.md`** (2 charges): add `model`, `purpose` for both charges

**Validation:**

- Visual inspection: every charge has `model`, `purpose`, and quoted decimal strings
- DE content matches UK semantically (same charge structure, same `model`/`purpose` values)

**Completion criterion:** All 6 DE offering files have `model`, `purpose`, and quoted decimal strings on every charge.

**Human review:** no

---

### Step 4. Commit code and content changes

**Goal:** Commit all changes from steps 1–3 using `mission.git.commit`.

**Agent actions:**

- Run `pnpm exec site-kernel run mission.git.commit --mission warpgogol-com-m000035 --message "RFC-0728: enforce pbpChargeSchema on offering charges — schema + content updates"`
- This commits the schema change in `packages/pbp` and the 12 offering files in the workpiece

**Validation:**

- `git status` shows no uncommitted changes from this session

**Completion criterion:** All changes committed; `git status` clean.

**Human review:** no

---

### Step 5. Validation suite

**Goal:** Run all validation checks from the RFC acceptance criteria.

**Agent actions:**

- Run `pnpm --filter @warpgogol/pbp run build:check` — typecheck
- Run `pnpm --filter @warpgogol/pbp run test` — unit tests
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0728` — RFC validation

**Validation:**

- All three commands pass with exit code 0

**Completion criterion:** `build:check`, `test`, and `rfc.validate` all pass.

**Human review:** no

---

### Step 6. Code review and fix

**Goal:** Run `fo-review` on all session code changes and fix any findings.

**Agent actions:**

- Invoke `fo-review` via the `skill` tool on all session code changes
- If findings are reported, invoke `fo-fix` via the `skill` tool
- Re-run `fo-review` to confirm all findings are resolved (max 3 iterations)
- Commit any fixes via `mission.git.commit`

**Validation:**

- Review report exists in `docs/reviews/code/` for this session
- All findings resolved (or documented as not-applicable)

**Completion criterion:** Code review passed; all findings fixed.

**Human review:** no

---

### Final Step. Acceptance criteria verification and stamp

**Goal:** Verify all acceptance criteria and stamp the RFC as implemented.

**Agent actions:**

- Check off each acceptance criterion in the RFC:
  - [x] `offeringSchema` uses `z.record(z.string(), pbpChargeSchema)` for `charges`
  - [x] All 12 offering files have quoted decimal strings
  - [x] All 12 offering files have `model` discriminator on every charge amount
  - [x] All 12 offering files have `purpose` field on every charge
  - [x] `pnpm --filter @warpgogol/pbp build:check` passes
  - [x] `pnpm --filter @warpgogol/pbp test` passes
  - [x] `rfc.validate` passes
- Get the implementation commit SHA (last commit containing the code changes)
- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0728 --implementation-commit <sha>`
- No `rfc.verification.emit` needed — acceptance probes are commented out

**Validation:**

- `git status` — no uncommitted changes
- `pnpm exec site-kernel run rfc.validate --id RFC-0728` passes
- RFC status is `implemented`

**Completion criterion:** All acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0728`
- `pnpm --filter @warpgogol/pbp run build:check`
- `pnpm --filter @warpgogol/pbp run test`

### 4.2 Evidence artifacts

- No `rfc.verification.emit` needed — acceptance probes are commented out (RFC-0330 not triggered)
- Commit messages referencing `RFC-0728` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Build breakage on non-compliant content | Steps 2–3 update all 12 files before Step 5 validation runs |
| Agent authoring friction | Schema error messages are self-documenting; `pbpChargeSchema` structure visible in `pricing.ts` |
| `plans`/`adjustments` enforcement gap remains | Non-goals explicitly document the deferral; no action needed in this RFC |
| No `purpose` controlled vocabulary | RFC uses convention values (`subscription`, `activation`, `additional-service`, `setup`); future RFC can add enum without breaking changes |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-55, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0728 --reason "..." --invariant "DNA-55"` instead of working around it.
- If `pbpChargeSchema` is found to be incompatible with existing content in ways the RFC did not anticipate, stop and create an amending RFC rather than weakening the schema.
