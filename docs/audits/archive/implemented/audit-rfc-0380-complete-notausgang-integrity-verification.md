---
rfcId: RFC-0380
auditId: AUDIT-RFC-0380-01
date: 2026-07-12
auditor:
  skill: wg-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0380

## Verdict: Needs revision

The RFC correctly identifies real gaps in the current `notausgang.validate` implementation (verified against `packages/os/site-kernel-handoff/src/notausgang/notausgang-commands.ts`) and the proposed deep verification design is sound. However, the JSON fallback reader with "no hard removal date" (line 330) and the hash-format dual-path (line 314) are backward compatibility layers that directly violate RFC-0376's explicit nonGoal: "Do not introduce a feature flag or dual-format transition period — migration is big-bang, forward-only."

## Mechanical validation (rfc.validate)

Pass — `pnpm exec werkstatt run rfc.validate RFC-0380 --json` exits 0 with zero violations.

## Axis A — Structural completeness

- **Zod schema regression.** The manifest schema at lines 179–205 uses plain `z.string()` for `systemId` and `releaseId`, dropping the regex validation from RFC-0359's original schema (`z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)` and `z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*-r\d{6}$/)`). The amended schema should be at least as strict as the original.
- **`system.pin.json` YAML migration is ambiguous.** The YAML migration section (lines 239–243) lists only `notausgang-manifest.json` and `artifact-manifest.json`, but the pin validation section (line 225) says "File is valid JSON (or YAML per RFC-0376 migration)." The RFC must either include `system.pin.json` → `system.pin.yaml` in the migration or explicitly exempt it with a reason.
- **Risks section omits agent misinterpretation risk.** The risks list (lines 327–330) covers performance, hash format, false negatives, and YAML backward compatibility, but does not call out the risk of agents implementing the JSON fallback as a permanent dual-path instead of a (still-problematic) transitional one.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-50, DNA-53]` are real invariants in `docs/architecture-dna.md` (lines 209, 221). The RFC body explains how: DNA-50 (completing the integrity verification half of the Notausgang contract) and DNA-53 (all hashing moves to `@gogol/fingerprint`). `related: [DNA-52]` is appropriate — DNA-52 is established by RFC-0363 and this RFC leverages it without claiming to establish it.

## Axis C — Ecosystem fit

- **`commands.changed` is incomplete.** The frontmatter lists only `notausgang.validate` under `commands.changed`, but the implementation notes (line 354) state "Agents MUST update `notausgang.export` to write YAML manifests and `@gogol/fingerprint` hashes in the same implementation pass." `notausgang.export` is also a changed command and must be listed.
- **`packagesImpacted` overstates impact.** `@gogol/fingerprint` is listed but the RFC proposes no changes to that package — it only imports from it. Remove it from `packagesImpacted`.
- **Compass sync not identified.** The RFC changes the Notausgang artifact format and validation contract but does not identify which `docs/*.xml` files need synchronization (likely `docs/technology.xml` for the Notausgang manifest format change).
- **AGENTS.md updates not identified.** `packages/os/site-kernel-handoff/AGENTS.md` may need updates to document the deepened validation contract and the YAML manifest format.

## Axis D — Forward-only compliance

- **FAIL: JSON fallback reader is a backward compatibility layer.** Line 244: "reads YAML first, falls back to JSON with a deprecation warning for backward compatibility during the transition period." Line 330: "no hard removal date in this RFC." This is a dual-path with an indefinite grace period. RFC-0376's nonGoals explicitly state: "Do not introduce a feature flag or dual-format transition period — migration is big-bang, forward-only." RFC-0380 claims to enforce RFC-0376 (line 94: "JSON artifacts (RFC-0376): should be YAML per the YAML-only artifact policy") but violates its core migration principle. Forward-only approach: old JSON exports are invalid — re-generate them.
- **FAIL: Hash format dual-path.** Line 314: "Validate detects old `sha256:` prefixed hashes and re-computes using `@gogol/fingerprint` for comparison, emitting a warning that the export should be re-generated." This keeps legacy hash values alive alongside new ones. Forward-only: old exports with ad-hoc hashes fail validation and must be re-generated.
- **`--strict` flag creates dual-mode behavior.** Line 126: "When set, any warning becomes a failure. Default: warnings do not affect exit code." Forward-only would make all violations errors by default. The `--strict` flag is a compatibility affordance for the JSON/hash fallback paths — remove both the fallbacks and the flag.

## Axis E — Agent-facing policy

No issues. The status gate is correct (line 349: "Agents MAY implement code changes ONLY when this RFC has status: accepted"). Implementation notes reference RFC-0224, RFC-0334, and RFC-0330 correctly. No anti-fabrication concerns (all changes are code, not content). Storage policy is not touched.

## Axis F — Pragmatism

- **`@gogol/fingerprint` in `packagesImpacted`** — see Axis C. The package is used, not modified.
- **`NotausgangValidateData` grows to 16 boolean fields** (lines 131–150). The split between `manifestValid` / `manifestSchemaValid` and `bordbuchValid` / `bordbuchLinesValid` and `pinValid` / `pinContentValid` creates paired existence+depth fields. Consider consolidating each pair into a single enum field (`"present" | "valid" | "invalid" | "missing"`) to reduce the surface and make the state space explicit.
- **`--strict` flag** — see Axis D. This flag only exists to support the fallback paths; removing the fallbacks removes the need for the flag.

## Axis G — Blind spots

- **Hash migration section is internally inconsistent.** The Risks section (line 328) says "@gogol/fingerprint uses the same `sha256:` prefix convention" (implying format compatibility), but the Rollout section (line 314) says "Validate detects old `sha256:` prefixed hashes" (implying the prefix distinguishes old from new). Since both old and new use `sha256:`, the detection mechanism for "old" vs "new" hashes is unspecified. The RFC must clarify how validate distinguishes an ad-hoc byte hash from a `@gogol/fingerprint` semantic hash when both share the `sha256:` prefix.
- **Both manifest formats present.** The RFC does not specify what happens when both `notausgang-manifest.yaml` and `notausgang-manifest.json` exist in the same export package. Which takes precedence? Is this an error?
- **Empty export package edge case.** The RFC does not consider validating an export from a new system with no dist/content (empty trees). `fingerprint.tree` on an empty directory should produce a deterministic hash, but the RFC should confirm this matches the manifest's hash for a valid empty export.

## Questions for the author

1. RFC-0376 explicitly forbids dual-format transition periods ("migration is big-bang, forward-only"). Why does this RFC propose a JSON fallback reader with no hard removal date instead of requiring all existing exports to be re-generated?
2. The implementation notes require updating `notausgang.export` to write YAML and use `@gogol/fingerprint`, but `commands.changed` only lists `notausgang.validate`. Should `notausgang.export` be in `commands.changed`?
3. Since both ad-hoc `crypto.createHash("sha256")` and `@gogol/fingerprint` produce `sha256:<hex>` strings, how does `notausgang.validate` distinguish an old hash from a new one? The hash values will differ (byte vs semantic), but the format is identical — the RFC's "detects old `sha256:` prefixed hashes" mechanism needs a concrete detection strategy.
