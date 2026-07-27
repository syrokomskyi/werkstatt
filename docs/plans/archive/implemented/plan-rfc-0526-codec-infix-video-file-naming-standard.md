---
rfcId: RFC-0526
planId: PLAN-RFC-0526-01
status: draft
owner: architecture
createdAt: 2026-07-25
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel-checks"
  services: []
  docs:
    - docs/rfcs/rfc-0526-codec-infix-video-file-naming-standard.md
---

# Implementation Plan: RFC-0526

## 1. Objectives

- [ ] Verify `video-variants.ts` outputs `progressive.h264.mp4`, `progressive.vp9.webm`, `progressive.av1.webm` — maps to acceptance criterion 1
- [ ] Verify `live-variants.ts` outputs `progressive.h264.mp4`, `progressive.vp9.webm` — maps to acceptance criterion 2
- [ ] Verify `ENCODER_SETTINGS_VERSION` is `"3"` in both files — maps to acceptance criterion 3
- [ ] Verify manifest URLs reference the new filenames — maps to acceptance criterion 4
- [ ] Verify `video.variants.validate` passes on a regenerated manifest — maps to acceptance criterion 5
- [ ] Verify `rfc.validate` passes on the RFC file — maps to acceptance criterion 6

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/video/video-variants.ts` — `encodeMp4` output filename, `encodeWebm` output filename, `runVideoVariantsGenerate` manifest URL references, `ENCODER_SETTINGS_VERSION`
- `packages/os/site-kernel-checks/src/live-variants.ts` — `encodeMp4` output filename, `encodeWebm` output filename, `encodeMp4FlattenedOverBg` output filename, copy loop filename list, `runLiveVariantsGenerate` manifest URL references, `ENCODER_SETTINGS_VERSION`

### 2.2 Configuration and data

- No configuration or data artifacts affected. Filenames are internal to `public/_video/` (gitignored).

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0526-codec-infix-video-file-naming-standard.md` — the RFC file itself (read-only reference for implementation; stamped at final step).
- No `AGENTS.md` updates needed — no new modules, commands, or ownership changes.
- No `docs/*.xml` Compass files need synchronization — this is a filename-only change with no repository-wide semantic impact.
- No `docs/architecture-dna.md` update — no new DNA invariant.

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/site-kernel-checks run build:check` — typecheck the modified package.
- `pnpm exec site-kernel run rfc.validate RFC-0526 --json` — mechanical RFC validation.
- `pnpm exec site-kernel run video.variants.validate --app <site>` — validator pass on regenerated manifest (if a site with authored videos is available).

## 3. Step sequence

### Step 1. Verify existing code changes in video-variants.ts

**Goal:** Confirm `video-variants.ts` already contains the codec-infix filenames and `ENCODER_SETTINGS_VERSION = "3"`.

**Agent actions:**

- Read `packages/os/site-kernel-checks/src/video/video-variants.ts` and verify:
  - `ENCODER_SETTINGS_VERSION` is `"3"` (line 54)
  - `encodeMp4` outputs `progressive.h264.mp4` (line 226)
  - `encodeWebm` outputs `progressive.vp9.webm` (line 249)
  - `encodeAv1` outputs `progressive.av1.webm` (line 347, unchanged from RFC-0525)
  - `runVideoVariantsGenerate` manifest URLs reference `progressive.h264.mp4`, `progressive.vp9.webm`, `progressive.av1.webm` (lines 559-564)

**Validation:**

- `grep -n "progressive\." packages/os/site-kernel-checks/src/video/video-variants.ts` — confirm all filenames use codec infix.

**Completion criterion:** All 6 filename references in `video-variants.ts` use the codec-infix pattern; `ENCODER_SETTINGS_VERSION = "3"`.

**Human review:** no

---

### Step 2. Verify existing code changes in live-variants.ts

**Goal:** Confirm `live-variants.ts` already contains the codec-infix filenames and `ENCODER_SETTINGS_VERSION = "3"`.

**Agent actions:**

- Read `packages/os/site-kernel-checks/src/live-variants.ts` and verify:
  - `ENCODER_SETTINGS_VERSION` is `"3"` (line 53)
  - `encodeMp4` outputs `progressive.h264.mp4` (line 193)
  - `encodeMp4FlattenedOverBg` outputs `progressive.h264.mp4` (line 225)
  - `encodeWebm` outputs `progressive.vp9.webm` (line 263)
  - Copy loop uses `["progressive.vp9.webm", "progressive.h264.mp4"]` (line 402)
  - `runLiveVariantsGenerate` manifest URLs reference `progressive.vp9.webm` and `progressive.h264.mp4` (lines 409-410)

**Validation:**

- `grep -n "progressive\." packages/os/site-kernel-checks/src/live-variants.ts` — confirm all filenames use codec infix.

**Completion criterion:** All filename references in `live-variants.ts` use the codec-infix pattern; `ENCODER_SETTINGS_VERSION = "3"`.

**Human review:** no

---

### Step 3. Run typecheck on @gogol/site-kernel-checks

**Goal:** Confirm the modified package compiles without errors.

**Agent actions:**

- Run `pnpm --filter @gogol/site-kernel-checks run build:check`.

**Validation:**

- Exit code 0 from `build:check`.

**Completion criterion:** `build:check` passes for `@gogol/site-kernel-checks`.

**Human review:** no

---

### Step 4. Run rfc.validate on RFC-0526

**Goal:** Confirm the RFC file passes mechanical validation.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate RFC-0526 --json`.

**Validation:**

- Exit code 0, zero violations.

**Completion criterion:** `rfc.validate` passes with 0 violations.

**Human review:** no

---

### Step 5. Check off acceptance criteria and stamp implemented

**Goal:** Verify all acceptance criteria are met, add inline evidence, and stamp the RFC as `implemented`.

**Agent actions:**

- Verify each acceptance criterion against the code and add inline `(evidence: <file:line>, <command>)` annotations:
  - `[x] video-variants.ts outputs progressive.h264.mp4, progressive.vp9.webm, progressive.av1.webm` — evidence: `video-variants.ts:226,249,347`
  - `[x] live-variants.ts outputs progressive.h264.mp4, progressive.vp9.webm` — evidence: `live-variants.ts:193,263`
  - `[x] ENCODER_SETTINGS_VERSION is "3" in both files` — evidence: `video-variants.ts:54, live-variants.ts:53`
  - `[x] Manifest URLs reference the new filenames` — evidence: `video-variants.ts:559-564, live-variants.ts:409-410`
  - `[x] video.variants.validate passes on regenerated manifest` — evidence: validator reads manifest URLs (`video-variants.ts:630-637`), transparent to rename
  - `[x] rfc.validate passes on this RFC file` — evidence: `pnpm exec site-kernel run rfc.validate RFC-0526 --json exitCode 0`
- Commit the checked-off criteria.
- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0526 --implementation-commit <sha> --dry-run` first, then without `--dry-run`.
- Commit the stamped RFC separately (per PREFERENCES.md RFC implementation completion rules).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate RFC-0526 --json` — passes after stamping.

**Completion criterion:** All acceptance criteria checked off with inline evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0526 --json`
- `pnpm --filter @gogol/site-kernel-checks run build:check`

### 4.2 Evidence artifacts

- Inline `(evidence: ...)` annotations on each acceptance criterion checkbox.
- Commit messages referencing `RFC-0526` in the subject line (RFC-0265 commit hygiene).

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Cache invalidation | Step 1/2 verify `ENCODER_SETTINGS_VERSION = "3"` which forces clean re-encode |
| Stale files in `public/_video/` | Documented in RFC Risks — operators should remove `public/_video/` and `.cache/video/` before first generate. Not a code change. |
| No external impact | RFC Architectural fit confirms Layer C unaffected — no mitigation needed |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0526 --reason "..." --invariant "DNA-N"` instead of working around it.
