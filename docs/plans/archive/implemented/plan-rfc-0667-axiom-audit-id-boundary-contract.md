---
rfcId: RFC-0667
planId: PLAN-RFC-0667-01
status: draft
owner: architecture
createdAt: 2026-08-04
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0667

## 1. Objectives

- [ ] Document the `missionId` ↔ `auditId` boundary adapter pattern in `packages/os/site-kernel-checks/AGENTS.md` — maps to acceptance criterion 1 (axiom-adapter.ts mapping)
- [ ] Document the `auditId` read pattern in `packages/os/site-kernel-handoff/AGENTS.md` — maps to acceptance criteria 3, 4 (leitstand.propagate, evidence interfaces)
- [ ] Verify all acceptance criteria are still met by existing code — maps to all acceptance criteria
- [ ] Stamp RFC-0667 as `implemented` — maps to acceptance criterion 9 (rfc.validate passes)

## 2. Affected artifacts

### 2.1 Code and commands

No code changes — this is a post-hoc RFC. All code is already implemented:

- `packages/os/site-kernel-checks/src/axiom-adapter.ts` — boundary adapter (lines 345-365)
- `packages/os/site-kernel-checks/src/{cloudflare-assets,consent,fonts,independent-qa,lighthouse,sitemap-images}.ts` — check modules using `auditId` in `toDeterministicContext`
- `packages/os/site-kernel-handoff/src/evidence/evidence-fetch.ts` — `EvidenceMetadata` interface with optional `auditId`
- `packages/os/site-kernel-handoff/src/evidence/evidence-sync.ts` — `EvidenceMetadata` interface with optional `auditId`
- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — `leitstand.propagate` reads `auditId` (lines 1093-1125)

### 2.2 Configuration and data

No configuration changes.

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — add boundary pattern rule to the `axiom-adapter.ts` module entry
- `packages/os/site-kernel-handoff/AGENTS.md` — add boundary pattern rule to the Leitstand section

### 2.4 Validation and pipelines

- `rfc.validate --id RFC-0667` — mechanical validation
- `fo-review` — code review on session changes (AGENTS.md edits only)

## 3. Step sequence

### Step 1. Document boundary pattern in site-kernel-checks AGENTS.md

**Goal:** Add the `missionId` ↔ `auditId` boundary adapter rule to the `axiom-adapter.ts` module entry so agents discover it without reading the RFC.

**Agent actions:**

- Add a boundary pattern note to the `src/axiom-adapter.ts` row in the module table in `packages/os/site-kernel-checks/AGENTS.md`, referencing RFC-0667
- State the rule: `missionId` is internal, `auditId` is external, mapping happens in `axiom-adapter.ts` via `raw.auditId ?? raw.missionId ?? missionId` fallback

**Validation:**

- `git diff packages/os/site-kernel-checks/AGENTS.md` shows the addition

**Completion criterion:** `axiom-adapter.ts` module entry in AGENTS.md mentions RFC-0667 and the boundary adapter pattern

**Human review:** no

---

### Step 2. Document boundary pattern in site-kernel-handoff AGENTS.md

**Goal:** Add the `auditId` read pattern rule to the Leitstand section so agents know `leitstand.propagate` reads `auditId` from `evidence-metadata.json`.

**Agent actions:**

- Add a bullet to the Leitstand section in `packages/os/site-kernel-handoff/AGENTS.md` referencing RFC-0667
- State the rule: `leitstand.propagate` reads `auditId` from `evidence-metadata.json`, compares to release `missionId` only when present; the RFC-0665 methodologies gate provides primary validation
- State the rule: `evidence-fetch.ts` and `evidence-sync.ts` define local `EvidenceMetadata` interfaces with optional `auditId` (not `missionId`)

**Validation:**

- `git diff packages/os/site-kernel-handoff/AGENTS.md` shows the addition

**Completion criterion:** Leitstand section in AGENTS.md mentions RFC-0667 and the `auditId` read pattern

**Human review:** no

---

### Step 3. Validate, review, fix, and stamp

**Goal:** Run mechanical validation, code review, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0667` — verify 0 errors
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Verify each acceptance criterion in the RFC against the implemented code. All criteria are already marked `[x]` with evidence — confirm evidence references are still valid.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0667 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0667` — 0 errors
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria verified; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0667`
- `fo-review` on session changes (AGENTS.md edits only)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0667` in the subject line (RFC-0265 commit hygiene)
- `rfc.implement.stamp` output confirming the transition

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Agent confusion: agents reading check modules might wonder why `auditId` is used instead of `missionId` | Step 1 + Step 2 document the boundary pattern in AGENTS.md files |
| Test fixture drift: agents write new tests with `missionId` instead of `auditId` | Step 1 documents the rule in AGENTS.md; RFC implementation notes already cover this |
| Silent fallback on external `auditId` rename | Step 1 documents the fallback chain in AGENTS.md; RFC failure mode #4 covers this |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-48 or DNA-59, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0667 --reason "..." --invariant "DNA-N"` instead of working around it.
