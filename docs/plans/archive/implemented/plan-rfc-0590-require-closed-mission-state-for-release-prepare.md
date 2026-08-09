---
rfcId: RFC-0590
planId: PLAN-RFC-0590-01
status: draft
owner: architecture
createdAt: 2026-07-29
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
    - docs/rfcs/archive/implemented/rfc-0357-release-discipline-and-behavior-snapshot-diff-gating.md
    - docs/rfcs/archive/implemented/rfc-0522-reconcile-dirty-cache-clone-guard-3way-fallback-and-release-id-tracking.md
---

# Implementation Plan: RFC-0590

## 1. Objectives

- [ ] Objective 1 — `release.prepare` refuses `state: "open"` missions with error directing to `mission.close` (maps to criteria 1, 2)
- [ ] Objective 2 — `release.prepare` accepts `state: "closed"` missions and completes build pipeline (maps to criterion 3)
- [ ] Objective 3 — `mission.close` `missing-release-id` warning says "after close" instead of "before close" (maps to criterion 4)
- [ ] Objective 4 — `packages/os/site-kernel-handoff/AGENTS.md` documents closed-mission requirement (maps to criterion 5)
- [ ] Objective 5 — RFC-0357 and RFC-0522 `amendedBy` frontmatter includes RFC-0590 (maps to criteria 7, 8)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/release/release-commands.ts` — state check at line ~145
- `packages/os/site-kernel-handoff/src/mission/mission-close.ts` — warning message at line ~258
- `packages/os/site-kernel-handoff/src/tests/mission-close-release-id-warning.test.ts` — test assertions with old warning text (lines 41, 55)

### 2.2 Configuration and data

None. No YAML/JSON/NDJSON changes. No ontology catalogs.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — add closed-mission requirement for `release.prepare`
- `docs/rfcs/archive/implemented/rfc-0357-*.md` — add `RFC-0590` to `amendedBy` frontmatter
- `docs/rfcs/archive/implemented/rfc-0522-*.md` — add `RFC-0590` to `amendedBy` frontmatter

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel-handoff test` — unit tests
- `pnpm exec site-kernel run rfc.validate` — mechanical validation

## 3. Step sequence

### Step 1. Update release.prepare state check

**Goal:** Tighten the state check in `release-commands.ts` to refuse open missions.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/release/release-commands.ts` line ~145: change `if (manifest.state !== "open" && manifest.state !== "closed")` to `if (manifest.state !== "closed")`
- Update error message to: `[release.prepare] mission '${missionId}' is not closed (state: ${manifest.state}). Run \`mission.close --mission ${missionId}\` first.`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** `release.prepare` throws for `state: "open"` with the new error message; `state: "closed"` passes the check.

**Human review:** no

---

### Step 2. Update mission.close warning message

**Goal:** Reword the `missing-release-id` warning to reflect the reversed workflow.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/mission/mission-close.ts` line ~258: change "Run release.prepare before close to associate a release." to "Run release.prepare after close to associate a release."
- Edit `packages/os/site-kernel-handoff/src/tests/mission-close-release-id-warning.test.ts` lines 41 and 55: update the warning message string in both test assertions to match the new text.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- `pnpm --filter @warpgogol/site-kernel-handoff test` passes

**Completion criterion:** Warning message says "after close"; all tests pass.

**Human review:** no

---

### Step 3. Update AGENTS.md

**Goal:** Document the closed-mission requirement for `release.prepare` in the handoff AGENTS.md.

**Agent actions:**

- Add a bullet to `packages/os/site-kernel-handoff/AGENTS.md` in the release/mission section documenting that `release.prepare` requires `state: closed` (per RFC-0590). Place it near the existing `mission.close` guard documentation.

**Validation:**

- File exists and contains the new documentation.

**Completion criterion:** `packages/os/site-kernel-handoff/AGENTS.md` mentions `release.prepare` requires `state: closed`.

**Human review:** no

---

### Step 4. Update amended RFCs frontmatter

**Goal:** Add `RFC-0590` to the `amendedBy` field of RFC-0357 and RFC-0522.

**Agent actions:**

- Edit `docs/rfcs/archive/implemented/rfc-0357-release-discipline-and-behavior-snapshot-diff-gating.md`: add `RFC-0590` to `amendedBy: []` → `amendedBy: [RFC-0590]`
- Edit `docs/rfcs/archive/implemented/rfc-0522-reconcile-dirty-cache-clone-guard-3way-fallback-and-release-id-tracking.md`: add `RFC-0590` to `amendedBy: []` → `amendedBy: [RFC-0590]`

**Validation:**

- `pnpm exec site-kernel run rfc.validate` — V-19 warnings for RFC-0590 are resolved.

**Completion criterion:** `rfc.validate` no longer reports V-19 warnings for RFC-0590.

**Human review:** no

---

### Step 5. Commit implementation

**Goal:** Commit all code changes as a single implementation commit.

**Agent actions:**

- Stage: `release-commands.ts`, `mission-close.ts`, `mission-close-release-id-warning.test.ts`, `packages/os/site-kernel-handoff/AGENTS.md`, `rfc-0357-*.md`, `rfc-0522-*.md`
- Commit message: `impl: RFC-0590 require closed mission state for release.prepare`

**Validation:**

- `git status` clean after commit.

**Completion criterion:** All changes committed; working tree clean.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate` — verify zero errors for RFC-0590.
- Run `pnpm --filter @warpgogol/site-kernel-handoff build:check` — typecheck passes.
- Run `pnpm --filter @warpgogol/site-kernel-handoff test` — all tests pass.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Max 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` with inline `(evidence: <file:line>, <test-or-command>)`.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0590 --implementation-commit <sha> --dry-run` first, then without `--dry-run`.
- **Commit the stamped RFC separately** — implementation commit and stamp commit must be separate.
- Run `fo-doc-audit` to sync documentation surfaces.

**Validation:**

- `git status` — no uncommitted changes.
- `pnpm exec site-kernel run rfc.validate` — zero errors for RFC-0590.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`; `git status` clean.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate` — zero errors for RFC-0590
- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel-handoff test` — unit tests

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0590` in the subject line
- Review report in `docs/reviews/code/`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Operator workflow change | Step 3 (AGENTS.md) documents the new workflow; error message in Step 1 directs to `mission.close` |
| Agent misinterpretation | Error message in Step 1 explicitly directs to `mission.close` |
| False positive rate | Zero — simple state comparison, no heuristic (Step 1) |
| Maintenance burden | Minimal — two-line code change (Steps 1-2) |

## 6. Escalation triggers

- If `rfc.implement.stamp` fails with RFC-IMP-04 (dirty working tree), report the uncommitted changes to the operator and stop. Do NOT `git stash` or force the stamp.
- If implementation reveals an invariant conflict with DNA-46 or DNA-48, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0590 --reason "..." --invariant "DNA-N"` instead of working around it.
