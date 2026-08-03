---
rfcId: RFC-0656
auditId: AUDIT-RFC-0656-01
date: 2026-08-02
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0656

## Verdict: Needs revision

The RFC addresses a real production problem (non-deterministic `distTreeHash` blocking `leitstand.propagate`) and the core approach (normalizing known non-deterministic file types before hashing) is sound. However, the TypeScript contract contains a factual error (drops existing `"semantic"` mode), DNA-58 is claimed as `satisfies` but the connection is tenuous, and the `"stable"` vs `"semantic"` mode distinction is insufficiently justified.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **TypeScript contract drops existing `"semantic"` mode.** The RFC shows `interface FingerprintOptions { mode: "byte" | "stable" }` (line 142), but the actual type at `packages/fingerprint/src/types.ts:15` is `mode: "byte" | "semantic"`. The post-RFC type must be `mode: "byte" | "semantic" | "stable"`. The contract also drops the existing `root?: string` field. Both omissions will mislead the implementing agent.
- **`DeterminismCheck.stable` field is redundant.** The `nonDeterministicFiles[]` array only contains files where `stable: false` (per the output example, lines 186–197). A boolean field that is always `false` in the output adds no information. Either remove it or document a use case where `stable: true` entries appear in the array.

## Axis B — DNA alignment

- **DNA-58 in `satisfies[]` is not directly satisfied.** DNA-58 ("Generated-file content determinism") requires committed generated files to be byte-identical to their generator's output. The RFC's `mode: "stable"` does the opposite — it normalizes (mutates) non-deterministic fields before hashing, accepting that build output is NOT byte-identical across runs. DNA-58 is about content drift detection; this RFC is about hash stability despite non-determinism. DNA-58 should remain in `related[]` only, not `satisfies[]`. The RFC body (line 118) claims "The stable mode enforces deterministic output by normalizing non-deterministic fields before hashing" — but normalizing before hashing does not enforce deterministic output; it makes the hash deterministic despite non-deterministic output. This is a semantic mismatch with DNA-58.
- **DNA-53, DNA-48, DNA-49 alignment is correct.** The RFC extends `@warpgogol/fingerprint` (DNA-53), enables reliable build-identity verification (DNA-48), and makes `leitstand.propagate` hash comparison trustworthy (DNA-49).

## Axis C — Ecosystem fit

- **Command module not specified.** The RFC says `dist.determinism.validate` is "a workspace-scope command in the release module" (line 121) but does not name the command-table file where it will be registered. The file system responsibilities table (lines 170–177) lists `release-commands.ts` and `leitstand-commands.ts` as changed, but neither is identified as the registration target for the new command. The implementing agent needs to know whether to add it to an existing command table (e.g. `packages/os/site-kernel-handoff/src/release/release.module.ts`) or create a new one.
- **`--mission` dist path ambiguity.** The file system responsibilities table shows both `releases/{release}/dist/` and `missions/{mission}/workpiece/dist/` as read paths (lines 174–175). But for `--mission`, there are two possible dist directories: `missions/{mission}/workpiece/dist/` (from a build) and `missions/{mission}/distribution/dist/` (from `mission.build`). The RFC does not specify which is used.

## Axis D — Forward-only compliance

- **`mode: "byte"` remains default "for backward compatibility" (line 214).** The forward-only discipline prohibits maintaining legacy behavior alongside new behavior. If all dist-hashing callers (`release.prepare`, `leitstand.dev-deploy`) switch to `mode: "stable"`, then `mode: "byte"` as default is a legacy stance. The RFC should either: (a) change the default to `"stable"` and justify why byte mode is still available as an explicit opt-in (not as the default), or (b) explain that `mode: "byte"` is not legacy but a legitimately distinct mode for raw binary hashing used by other callers (e.g., `computeBuildInputHash` uses `mode: "semantic"` for content, and byte mode may be used elsewhere for raw artifact hashing). The current framing as "backward compatibility" triggers forward-only concern.

## Axis E — Agent-facing policy

- **No issues.** Status gate is correct (`draft` → no implementation). Implementation notes reference specific RFCs (RFC-0224, RFC-0334). No self-authorizing language. No content authoring in acceptance criteria.

## Axis F — Pragmatism

- **`"stable"` vs extending `"semantic"` — justification is weak.** The alternatives section (line 224) says `mode: "semantic"` "does not handle PDF metadata or source map paths" — but `semantic` mode could be extended to handle these file types by adding PDF and source map normalizers to the existing registry. The RFC does not explain why a new mode is better than extending `semantic`. The key difference seems to be: `semantic` mode replaces the hash entirely with a normalized hash (losing byte-level change detection), while `stable` mode normalizes only known non-deterministic fields and retains byte hashing for everything else. This distinction should be explicit in the design section, not buried in alternatives.
- **`pdf-lib` dependency weight.** The implementation notes recommend `pdf-lib` for PDF metadata manipulation (line 250). `pdf-lib` is a full PDF creation/editing library (~2MB). For stripping `/CreationDate`, `/ModDate`, `/ID` from PDF metadata, a lighter approach may suffice. The RFC should consider whether `pdf-lib` is proportionate or whether a targeted metadata-stripping approach (regex on PDF trailer dictionaries) is more appropriate. If `pdf-lib` is chosen, it must be added to `packages/fingerprint/package.json` dependencies — the RFC does not note this.

## Axis G — Blind spots

- **Cross-mode hash mismatch during transition.** The risks section (line 231) acknowledges that `leitstand.propagate` comparisons between old (byte) and new (stable) releases will mismatch, but the mitigation ("the transition happens per-release") does not explain what happens when a new stable-mode release is promoted against an existing byte-mode dev deployment. Will `leitstand.propagate` fail? Is there a migration window where both channels need to be re-deployed? The RFC needs a concrete transition sequence: e.g., "deploy stable-mode release to dev first, then promote to alt, then promote to main — all within the same release cycle."
- **Empty dist directory edge case.** The RFC does not specify behavior when `dist/` is empty or missing. `fingerprintTree` on an empty directory should produce a deterministic hash (hash of empty input), but `dist.determinism.validate` should report this as an error, not as "zero non-deterministic files."
- **Source map normalizer scope.** The RFC says source maps should "normalize `sources` paths to relative, strip `sourceRoot`" (line 149). But source maps in `dist/` may contain paths relative to the build machine's filesystem (e.g., `/home/runner/work/...`). The normalizer needs to handle both absolute and relative paths, and the RFC should specify the normalization target (relative to what? the dist root? the source map file location?).

## Questions for the author

1. Why a new `mode: "stable"` instead of extending `mode: "semantic"` with PDF and source map normalizers? What specific behavior does `stable` provide that `semantic` cannot? (e.g., byte hashing for unhandled file types vs. text normalization fallback?)
2. What is the concrete transition sequence for moving from byte-mode to stable-mode hashes across dev/alt/main channels without `leitstand.propagate` failures?
3. Which dist path does `dist.determinism.validate --mission <id>` read — `workpiece/dist/` or `distribution/dist/`? And in which command-table file is the command registered?
