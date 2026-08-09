---
rfcId: RFC-0591
planId: PLAN-RFC-0591-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps:
    - warpgogol-com
    - nicaragua-projekt
  packages:
    - "@warpgogol/share"
    - "@warpgogol/site-kernel-checks"
  services: []
  docs:
    - packages/share/src/schemas/media.ts
    - packages/os/site-kernel-checks/src/video/video-variants.ts
---

# Implementation Plan: RFC-0591

## 1. Objectives

- [ ] Objective 1 — Add `maxSizeMb` optional field to `mediaSchema` (acceptance criterion 1)
- [ ] Objective 2 — Rewrite `encodeMp4` for two-pass bitrate-capped encoding with CRF fallback (acceptance criteria 2, 3)
- [ ] Objective 3 — Add `calculateTargetBitrate` pure function with correct bitrate formula (acceptance criterion 4)
- [ ] Objective 4 — Log warning when calculated video bitrate < 200 kbps (acceptance criterion 5)
- [ ] Objective 5 — Bump `ENCODER_SETTINGS_VERSION` to `"5"` (acceptance criterion 6)
- [ ] Objective 6 — Include `maxSizeMb` in `hashFileForProfile` hash input (acceptance criterion 7)
- [ ] Objective 7 — Update `MediaRef` and `RawMediaConfig` to carry `maxSizeMb` with default 24 (acceptance criterion 8)
- [ ] Objective 8 — Resolve `maxSizeMb` from frontmatter in `runVideoVariantsGenerate` and pass to `encodeMp4` (acceptance criterion 9)
- [ ] Objective 9 — Skip `ffmpeg2pass.log*` in cache→public copy loop (acceptance criterion 10)
- [ ] Objective 10 — Add PBT tests for `calculateTargetBitrate` (acceptance criterion 11, DNA-41)
- [ ] Objective 11 — `rfc.validate` passes on RFC-0591 (acceptance criterion 12)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/share/src/schemas/media.ts` — add `maxSizeMb` field to `mediaSchema`; update MODULE_CONTRACT CHANGE_SUMMARY
- `packages/os/site-kernel-checks/src/video/video-variants.ts` — rewrite `encodeMp4`; add `calculateTargetBitrate`; update `hashFileForProfile`; update `MediaRef`, `RawMediaConfig`; update `runVideoVariantsGenerate`; update copy loop; bump `ENCODER_SETTINGS_VERSION`; update MODULE_CONTRACT CHANGE_SUMMARY
- `packages/os/site-kernel-checks/src/video/video-variants.pbt.test.ts` — new PBT test file for `calculateTargetBitrate`

### 2.2 Configuration and data

- No YAML/JSON/manifest changes. The `maxSizeMb` field is a frontmatter schema addition consumed by the existing `video.variants.generate` command.

### 2.3 Documentation and specs

- RFC file (read-only reference): `docs/rfcs/rfc-0591-add-two-pass-bitrate-capped-mp4-encoding-to-video-variants-generate.md`
- No AGENTS.md updates needed (video-variants.ts is not listed in `packages/os/site-kernel-checks/AGENTS.md` module table)
- No `docs/*.xml` Compass synchronization needed (no repository-wide semantics change)
- No `docs/architecture-dna.md` update needed (no new DNA invariant)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/share run build:check` — typecheck share package
- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck checks package
- `pnpm --filter @warpgogol/site-kernel-checks run test` — run PBT tests
- `pnpm exec site-kernel run rfc.validate RFC-0591` — RFC validation

## 3. Step sequence

### Step 1. Add `maxSizeMb` to `mediaSchema`

**Goal:** Add the optional `maxSizeMb` field to the Zod media schema in `@warpgogol/share`.

**Agent actions:**

- Edit `packages/share/src/schemas/media.ts`: add `maxSizeMb: z.number().nonnegative().optional()` to `mediaSchema` after the `av1` field
- Add a CHANGE_SUMMARY entry: `RFC-0591: added maxSizeMb field to mediaSchema for two-pass bitrate-capped MP4 encoding.`

**Validation:**

- `pnpm --filter @warpgogol/share run build:check` passes

**Completion criterion:** `mediaSchema` has `maxSizeMb: z.number().nonnegative().optional()` field; share package typechecks.

**Human review:** no

---

### Step 2. Add `calculateTargetBitrate` and rewrite `encodeMp4`

**Goal:** Implement the two-pass bitrate-capped MP4 encoding logic with CRF fallback.

**Agent actions:**

- Add constants: `AUDIO_BITRATE_BPS = 128_000`, `DEFAULT_MAX_SIZE_MB = 24`, `MIN_VIDEO_BITRATE_BPS = 200_000`
- Add `calculateTargetBitrate(durationSec: number, maxSizeMb: number): { videoBitrate: number; audioBitrate: number } | null` — returns null when `maxSizeMb <= 0` or `durationSec <= 0`
- Export `calculateTargetBitrate` so it can be imported by PBT tests
- Rewrite `encodeMp4` signature to `(source: string, outDir: string, hasAudio: boolean, durationSec: number | undefined, maxSizeMb: number)`
- Implement CRF fallback path (when `calculateTargetBitrate` returns null): use existing CRF 17 `medium` preset
- Implement two-pass path: pass 1 (null output, passlogfile), pass 2 (final output with audio)
- Log warning when `videoBitrate < MIN_VIDEO_BITRATE_BPS`
- Bump `ENCODER_SETTINGS_VERSION` from `"4"` to `"5"`
- Add CHANGE_SUMMARY entry: `RFC-0591: two-pass bitrate-capped MP4 encoding with maxSizeMb; ENCODER_SETTINGS_VERSION bumped to 5.`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes

**Completion criterion:** `encodeMp4` accepts `durationSec` and `maxSizeMb`; two-pass path runs when `maxSizeMb > 0` and `durationSec` is known; CRF fallback runs otherwise; `ENCODER_SETTINGS_VERSION` is `"5"`.

**Human review:** no

---

### Step 3. Update `MediaRef`, `RawMediaConfig`, `hashFileForProfile`, and `runVideoVariantsGenerate`

**Goal:** Wire `maxSizeMb` through the frontmatter scanning, cache hashing, and encoding call chain.

**Agent actions:**

- Add `maxSizeMb: number` to `MediaRef` interface (resolved default: 24)
- Add `maxSizeMb?: number` to `RawMediaConfig` interface
- Update `hashFileForProfile` signature to accept `maxSizeMb: number`; include `|max=${maxSizeMb}` in the hash input string
- In `runVideoVariantsGenerate`: resolve `ref.maxSizeMb` as `cfg.maxSizeMb ?? DEFAULT_MAX_SIZE_MB` when building `MediaRef`
- Pass `probe.durationSec` and `ref.maxSizeMb` to `encodeMp4` call
- Pass `ref.maxSizeMb` to `hashFileForProfile` call

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes

**Completion criterion:** `maxSizeMb` flows from frontmatter → `RawMediaConfig` → `MediaRef` → `hashFileForProfile` + `encodeMp4`; hash input includes `maxSizeMb`.

**Human review:** no

---

### Step 4. Update cache→public copy loop to skip pass-log files

**Goal:** Prevent `ffmpeg2pass.log*` files from being deployed to `public/_video/`.

**Agent actions:**

- In the copy loop at line ~550 of `video-variants.ts`, extend the skip condition:
  ```ts
  if (entry.name === ".done") continue;
  if (entry.name.startsWith("ffmpeg2pass.log")) continue;
  ```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes

**Completion criterion:** Copy loop skips both `.done` and `ffmpeg2pass.log*` files.

**Human review:** no

---

### Step 5. Add PBT tests for `calculateTargetBitrate`

**Goal:** Property-based test coverage for the new pure function (DNA-41).

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/video/video-variants.pbt.test.ts`
- Import `calculateTargetBitrate` from `./video-variants.ts`
- Import `fc` from `fast-check`, `test`/`expect` from `vitest`
- Properties to test:
  1. **Formula correctness:** `videoBitrate = floor(maxSizeMb * 1024 * 1024 * 8 / durationSec) - 128000`
  2. **Monotonicity in maxSizeMb:** increasing `maxSizeMb` never decreases `videoBitrate` (fixed `durationSec`)
  3. **Inverse proportionality to durationSec:** increasing `durationSec` never increases `videoBitrate` (fixed `maxSizeMb`)
  4. **Null on zero/negative maxSizeMb:** returns null when `maxSizeMb <= 0`
  5. **Null on zero/negative durationSec:** returns null when `durationSec <= 0`
  6. **Audio bitrate is constant:** `audioBitrate === 128000` for all non-null results
- Use `fc.record({ maxSizeMb: fc.float({ min: 0.1, max: 100 }), durationSec: fc.float({ min: 0.1, max: 600 }) })` for positive cases
- Add MODULE_CONTRACT header per convention

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test` passes

**Completion criterion:** All PBT properties pass; test file exists at `packages/os/site-kernel-checks/src/video/video-variants.pbt.test.ts`.

**Human review:** no

---

### Step 6. Validate, review, fix, and stamp

**Goal:** Run all validation, code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm --filter @warpgogol/share run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-checks run test`
- Run `pnpm exec site-kernel run rfc.validate RFC-0591`
- Commit implementation changes with `RFC-0591` in commit subject
- Run `fo-review` on all session code changes
- Run `fo-fix` if review has findings (max 3 iterations)
- Check off all acceptance criteria with inline `(evidence: ...)` annotations
- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0591 --implementation-commit <sha> --dry-run` then without `--dry-run`
- Commit the stamped RFC separately
- Run `fo-doc-audit` to sync documentation surfaces

**Validation:**

- `git status` clean (no uncommitted changes from this session)
- `pnpm exec site-kernel run rfc.validate RFC-0591` passes with zero violations
- Review report exists in `docs/reviews/code/` for this session
- All acceptance criteria marked `[x]` with evidence

**Completion criterion:** All packages typecheck; PBT tests pass; RFC validated; review passed (findings fixed if any); RFC stamped as `implemented` via `rfc.implement.stamp`; implementation and stamp are separate commits; `git status` clean.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0591`
- `pnpm --filter @warpgogol/share run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0591` in the subject line (RFC-0265 commit hygiene)
- PBT test file at `packages/os/site-kernel-checks/src/video/video-variants.pbt.test.ts`
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Quality reduction for long content | Step 2 — two-pass with calculated bitrate; AV1/WebM stay CRF-based for quality |
| Two-pass encoding is slower | Step 2 — encoding is cached; only runs once per source change |
| Very long videos produce very low quality MP4 | Step 2 — warning logged at < 200 kbps; operator can adjust `maxSizeMb` |
| `ffprobe` duration missing | Step 2 — CRF 17 fallback when `durationSec` is undefined |
| Duration rounding precision | Step 2 — 1 MiB safety margin (24 vs 25 MiB) absorbs ~0.7% rounding error |
| Stale pass-log on interrupted encode | Step 4 — self-healing: next run overwrites stale log |
| Two-pass encoding accuracy | Step 2 — 1 MiB safety margin absorbs 1–2% bitrate variance |
| Cache invalidation | Step 2 — `ENCODER_SETTINGS_VERSION` bump to `"5"` forces clean re-encode |
| Agent misinterpretation | Steps 1–4 — `maxSizeMb` applies only to progressive MP4; default is 24, not 0 |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0591 --reason "..." --invariant "DNA-N"` instead of working around it.
