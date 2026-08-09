---
rfcId: RFC-0765
planId: PLAN-RFC-0765-01
status: draft
owner: architecture
createdAt: 2026-08-08
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/ui"
  services: []
  docs:
    - AGENTS.md
    - packages/ui/AGENTS.md
---

# Implementation Plan: RFC-0765

## 1. Objectives

- [ ] Objective 1 — Add "Content syntax reference" section to root `AGENTS.md` before the existing "Content references in mixed strings (RFC-0723)" section — maps to acceptance criterion 1
- [ ] Objective 2 — Merge price marker documentation entry into existing "Dynamic pricing in UI components" section in `packages/ui/AGENTS.md` — maps to acceptance criterion 2
- [ ] Objective 3 — Ensure the section explicitly states `{price:...}` is NOT a content reference and must not be migrated to `=(...)` — maps to acceptance criterion 3
- [ ] Objective 4 — `rfc.validate` passes on RFC-0765 — maps to acceptance criterion 4

## 2. Affected artifacts

### 2.1 Code and commands

No code changes. No commands added, changed, or removed. This is a documentation-only RFC.

### 2.2 Configuration and data

No configuration or data changes.

### 2.3 Documentation and specs

- `AGENTS.md` (root) — new "Content syntax reference" section before line 599 (before existing "Content references in mixed strings (RFC-0723)" section)
- `packages/ui/AGENTS.md` — merge price marker syntax documentation into existing "Dynamic pricing in UI components" section (lines 382-388)

### 2.4 Validation and pipelines

- `rfc.validate --id RFC-0765` — mechanical validation
- No build checks needed (no code changes)
- No acceptance probes (policy RFC, `rfc.verification.emit` will skip per RFC-0663 behavior)

## 3. Step sequence

### Step 1. Add "Content syntax reference" section to root AGENTS.md

**Goal:** Add the new section documenting all three string-embedding mechanisms to root `AGENTS.md`.

**Agent actions:**

- Read root `AGENTS.md` and locate the existing "Content references in mixed strings (RFC-0723)" section (line 599)
- Insert the new "Content syntax reference" section **before** the existing RFC-0723 section
- The section content is the blockquote from RFC-0765 § Design → AGENTS.md section (root)

**Validation:**

- `grep -n "Content syntax reference" AGENTS.md` — confirms the section exists
- `grep -n "Content references in mixed strings" AGENTS.md` — confirms the existing section is still present after the new section

**Completion criterion:** Root `AGENTS.md` contains a "Content syntax reference" section listing all three mechanisms (content references, formula expressions, price markers) with syntax, layer, return type, and examples, placed before the existing RFC-0723 section.

**Human review:** no

---

### Step 2. Merge price marker entry into packages/ui/AGENTS.md

**Goal:** Merge the price marker syntax documentation into the existing "Dynamic pricing in UI components" section.

**Agent actions:**

- Read `packages/ui/AGENTS.md` and locate the "Dynamic pricing in UI components" section (lines 382-388)
- Merge the RFC-0765 entry (blockquote from § Design → packages/ui/AGENTS.md entry) into this section
- Retain all existing rules (parsePriceMarkers, derived-prices.generated.json, lang, inline CSS)
- Add the explicit syntax documentation and the "not a content reference" clarification

**Validation:**

- `grep -n "Price marker syntax" packages/ui/AGENTS.md` — confirms the merged entry exists
- `grep -n "Dynamic pricing in UI components" packages/ui/AGENTS.md` — confirms the section still exists

**Completion criterion:** `packages/ui/AGENTS.md` "Dynamic pricing in UI components" section contains the price marker syntax documentation with the "not a content reference — do not migrate to `=(...)`" statement.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Verify all acceptance criteria, run code review, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0765` — confirms zero violations
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes. Since this is a documentation-only RFC with no code changes, the review scope is the AGENTS.md edits.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`.
- Check off acceptance criteria:
  - [x] Root `AGENTS.md` contains a "Content syntax reference" section listing all three mechanisms (evidence: `AGENTS.md` lines <inserted range>)
  - [x] `packages/ui/AGENTS.md` contains a price marker documentation entry (evidence: `packages/ui/AGENTS.md` lines <inserted range>)
  - [x] The section explicitly states that `{price:...}` is NOT a content reference and must not be migrated to `=(...)` (evidence: `AGENTS.md` line <inserted>)
  - [x] `rfc.validate` passes on this file (evidence: `rfc.validate --id RFC-0765` exit 0)
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0765 --implementation-commit <sha>` (first implementation commit)

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0765` — zero violations
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0765`
- No `build:check` needed (no code changes)
- No acceptance probes (policy RFC)

### 4.2 Evidence artifacts

- No verification evidence file (policy RFC, `rfc.verification.emit` will skip per RFC-0663)
- Commit messages referencing `RFC-0765` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Documentation drift | Step 1-2 reference RFC IDs in the section text so agents can trace back to authoritative sources |
| Agent non-compliance | Step 1 includes explicit "do not migrate" rule in the section |
| No automated enforcement | Acknowledged in RFC nonGoals — no validator added, documentation is the primary defense |

## 6. Escalation triggers

- If implementation reveals that the existing "Content references in mixed strings (RFC-0723)" section contradicts the new "Content syntax reference" section, do not modify the RFC-0723 section — instead, note the contradiction and ask the operator whether to create an amending RFC.
