---
rfcId: RFC-0591
auditId: AUDIT-RFC-0591-01
date: 2026-07-30
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0591

## Verdict: Needs revision

The RFC is well-structured and addresses a real production problem (MP4 files exceeding Cloudflare's 25 MiB limit). Three findings require attention before implementation: a missing acceptance criterion for pass-log file exclusion in the copy loop, V-19 backlinks on the amended RFCs, and a DNA-41 property-based testing requirement for the new `calculateTargetBitrate` pure function.

## Mechanical validation (rfc.validate)

Pass with 2 V-19 warnings:
- `RFC-0591.amends includes RFC-0210, but RFC-0210.amendedBy does not include RFC-0591`
- `RFC-0591.amends includes RFC-0525, but RFC-0525.amendedBy does not include RFC-0591`

These are backlink gaps on the amended RFCs that must be fixed during enhance.

## Axis A — Structural completeness

1. **Missing acceptance criterion for pass-log file exclusion.** The implementation notes (line 379) state: "the copy loop skips `.done` but should also skip `ffmpeg2pass.log*`". However, no acceptance criterion covers this. The current copy loop at `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel-checks/src/video/video-variants.ts:551` only skips `.done`:
   ```ts
   if (entry.name === ".done") continue;
   ```
   An agent could implement the RFC, forget to update the copy loop, and all 10 acceptance criteria would still pass — but `ffmpeg2pass.log*` files would be copied to `public/_video/` and deployed. Add an acceptance criterion like: "The cache→public copy loop skips `ffmpeg2pass.log*` files alongside `.done`".

## Axis B — DNA alignment

1. **V-19 backlinks missing on amended RFCs.** Both RFC-0210 (`amendedBy` at `docs/rfcs/archive/implemented/rfc-0210-...md:18-23`) and RFC-0525 (`amendedBy` at `docs/rfcs/archive/implemented/rfc-0525-...md:27-28`) need `RFC-0591` added to their `amendedBy` arrays. This is a mechanical fix for the enhance step.

No DNA invariant conflicts. `satisfies: []` is acceptable for a command-kind RFC. The RFC correctly amends (not supersedes) RFC-0210 and RFC-0525 since it changes their MP4 encoding contracts without invalidating the overall architecture.

## Axis C — Ecosystem fit

No issues. Package boundaries are correct: schema in `@warpgogol/share`, encoding logic in `@warpgogol/site-kernel-checks`. `commands.changed: [video.variants.generate]` is accurate — no new commands, no removed commands. No AGENTS.md updates needed (the `video-variants.ts` module is not listed in `packages/os/site-kernel-checks/AGENTS.md`'s module table). No `docs/*.xml` synchronization required.

## Axis D — Forward-only compliance

No issues. The `maxSizeMb: 0` opt-out is a legitimate operator feature (explicit quality-over-size choice), not a backward compatibility shim. The default behavior changes for everyone: two-pass with 24 MiB cap replaces CRF 17 as the default. The `ENCODER_SETTINGS_VERSION` bump from `"4"` to `"5"` invalidates all existing caches, forcing a clean re-encode. No dual-path or legacy flag is maintained.

## Axis E — Agent-facing policy

No issues. The status gate is correct: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" (line 373). Implementation notes reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation on invariant conflict). No self-authorizing language. No content authoring involved. No storage/persistence changes.

## Axis F — Pragmatism

No issues. The change is minimal: one optional schema field, one function rewrite, one hash input extension, one version bump. No new commands, no new packages. `appsImpacted` and `packagesImpacted` lists are accurate. The alternatives section honestly evaluates 5 real alternatives with specific rejection reasons.

## Axis G — Blind spots

1. **DNA-41 property-based testing requirement not addressed.** `calculateTargetBitrate` is a pure function with verifiable algebraic properties (linear in `maxSizeMb`, inversely proportional to `durationSec`, `videoBitrate = (maxSizeMb * 1024 * 1024 * 8 / durationSec) - 128000`). DNA-41 (RFC-0347) requires pure functions with verifiable properties to be covered by property-based tests using `fast-check` in `*.pbt.test.ts` files. The RFC does not mention adding tests. No tests currently exist for `video-variants.ts` (confirmed: no test file found). The RFC should add an acceptance criterion or implementation note for PBT coverage of `calculateTargetBitrate`.

2. **Duration rounding precision.** The existing `ffprobe` implementation at `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/os/site-kernel-checks/src/video/video-variants.ts:188` rounds duration to the nearest integer: `Math.round(Number(json.format.duration))`. The RFC's bitrate calculation uses this rounded `durationSec`, introducing up to ~0.7% error in the target bitrate. For a 72.5-second video, `durationSec` becomes 73, slightly lowering the bitrate. This is inherited from existing code and is minor, but the RFC should acknowledge the rounding since bitrate precision is the core concern.

3. **Stale pass-log on interrupted encode.** If pass 1 succeeds but pass 2 crashes (or the build is interrupted), `ffmpeg2pass.log` remains in the cache dir without a `.done` marker. The next run re-encodes from scratch (pass 1 overwrites the stale log). This is self-healing but undocumented. Minor — the RFC's failure modes section should mention this.

## Questions for the author

1. Should `calculateTargetBitrate` be extracted as an exported pure function (e.g., from `@warpgogol/share`) so it can be property-tested independently, or should it remain a local function in `video-variants.ts` with co-located tests?
2. The `ffprobe` duration is rounded to the nearest integer (`Math.round`). Should the RFC use the raw float duration for the bitrate calculation to improve precision, or is integer-second precision acceptable given the 1 MiB safety margin?
3. The RFC defaults `maxSizeMb` to 24 (1 MiB under the 25 MiB limit). Is 1 MiB a sufficient safety margin considering that two-pass encoding is approximate (the actual file size may deviate by a few percent from the target), or should the default be lower (e.g., 23 MiB)?
