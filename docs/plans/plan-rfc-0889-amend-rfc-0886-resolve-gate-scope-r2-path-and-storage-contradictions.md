---
rfcId: RFC-0889
planId: PLAN-RFC-0889-01
status: draft
owner: architecture
createdAt: 2026-08-20
updatedAt:
scope:
  apps: []
  packages:
    - werkstatt
  services: []
  docs:
    - docs/rfcs/rfc-0886-extend-nachweis-kernel-with-granular-consent-commands-screenshot-upload-and-per-artifact-publication-gates.md
    - docs/rfcs/rfc-0889-amend-rfc-0886-resolve-gate-scope-r2-path-and-storage-contradictions.md
---

# Implementation Plan: RFC-0889

## 1. Objectives

- [ ] Objective 1 — Correct the JSON output example in RFC-0886 (line 298) to use `{systemId}/screenshots/{slug}/` R2 key value — maps to acceptance criterion 1
- [ ] Objective 2 — Verify `resolveNachweisScreenshotR2Path` in `packages/werkstatt/src/nachweis/nachweis-io.ts` is unchanged — maps to acceptance criterion 2
- [ ] Objective 3 — Pass `rfc.validate` on RFC-0889 — maps to acceptance criterion 3

## 2. Affected artifacts

### 2.1 Code and commands

No code changes. The existing `resolveNachweisScreenshotR2Path` function in `packages/werkstatt/src/nachweis/nachweis-io.ts:436-442` already uses the correct R2 path pattern `{systemId}/screenshots/{slug}/website-screenshot{ext}`.

### 2.2 Configuration and data

No configuration or data changes.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0886-extend-nachweis-kernel-with-granular-consent-commands-screenshot-upload-and-per-artifact-publication-gates.md` — correct the JSON output example `r2Key` value (line 298: change `nachweis/warpgogol-com/client-xyz/website-screenshot.webp` to `warpgogol-com/screenshots/client-xyz/website-screenshot.webp`). Also add `RFC-0889` to `amendedBy` frontmatter field.
- `docs/rfcs/rfc-0889-amend-rfc-0886-resolve-gate-scope-r2-path-and-storage-contradictions.md` — mark acceptance criteria as checked, stamp as implemented.

### 2.4 Validation and pipelines

- `rfc.validate --id RFC-0889` — must pass
- `rfc.validate --id RFC-0886` — must pass after `amendedBy` update

## 3. Step sequence

### Step 1. Correct RFC-0886 JSON output example and amendedBy

**Goal:** Apply the amendment to RFC-0886 — correct the JSON example and establish the bidirectional amend link.

**Agent actions:**

- Edit `docs/rfcs/rfc-0886-...md` line 298: change `"r2Key": "nachweis/warpgogol-com/client-xyz/website-screenshot.webp"` to `"r2Key": "warpgogol-com/screenshots/client-xyz/website-screenshot.webp"`.
- Add `RFC-0889` to RFC-0886's `amendedBy` frontmatter field (currently `amendedBy: []` → `amendedBy: [RFC-0889]`).
- Commit via `ecosystem.commit` with message referencing RFC-0889.

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0886 --json` — V-19 warning must be resolved.
- `pnpm exec werkstatt run rfc.validate --id RFC-0889 --json` — must pass.

**Completion criterion:** RFC-0886 JSON example uses `warpgogol-com/screenshots/client-xyz/website-screenshot.webp` and `amendedBy` includes `RFC-0889`. Both RFCs pass `rfc.validate` without V-19 warnings.

**Human review:** no

---

### Step 2. Verify resolveNachweisScreenshotR2Path is unchanged

**Goal:** Confirm the existing code already uses the correct R2 path and no changes are needed.

**Agent actions:**

- Read `packages/werkstatt/src/nachweis/nachweis-io.ts:436-442` and verify `resolveNachweisScreenshotR2Path` returns `${systemId}/screenshots/${slug}/website-screenshot${ext}`.
- Run `git diff` on `packages/werkstatt/src/nachweis/nachweis-io.ts` — must show no changes from this session.

**Validation:**

- `git diff -- packages/werkstatt/src/nachweis/nachweis-io.ts` — empty output (no changes).

**Completion criterion:** `resolveNachweisScreenshotR2Path` is unchanged and uses the correct path pattern.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Verify acceptance criteria, run code review, and stamp RFC-0889 as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files — no updates needed (no new commands, no gate changes, no policy changes).
- Update affected `docs/*.xml` Compass files — no updates needed (RFC-0889 explicitly states no Compass sync required).
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` — not needed (no command surface changes).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Since this is a document-only amendment, the review should find no code issues.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Maximum 3 iterations.
- **Check off acceptance criteria:**
  - [x] RFC-0886 JSON output example uses `{systemId}/screenshots/{slug}/website-screenshot.{ext}` R2 key value — evidence: `docs/rfcs/rfc-0886-...md` line 298
  - [x] `resolveNachweisScreenshotR2Path` unchanged — evidence: `git diff` empty on `packages/werkstatt/src/nachweis/nachweis-io.ts`
  - [x] `rfc.validate` passes — evidence: `rfc.validate --id RFC-0889` exitCode 0
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0889 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0889` — passes.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All acceptance criteria checked off with inline evidence; RFC-0889 stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — document-only amendment, automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0889`
- `pnpm exec werkstatt run rfc.validate --id RFC-0886`
- No `build:check` needed (no code changes in `packages/werkstatt`)
- No acceptance probes declared (RFC-0889 has no `acceptance:` frontmatter)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0889` in the subject line (RFC-0265 commit hygiene)
- `git diff` showing no changes to `packages/werkstatt/src/nachweis/nachweis-io.ts`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ------------------------ |
| None — document-only correction | Step 2 verifies no code changes; Step 1 corrects only the RFC document |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0889 --reason "..." --invariant "DNA-N"` instead of working around it.
