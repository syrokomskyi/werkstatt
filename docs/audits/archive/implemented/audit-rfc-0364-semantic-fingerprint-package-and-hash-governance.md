---
rfcId: RFC-0364
auditId: AUDIT-RFC-0364-01
date: 2026-07-09
auditor:
  skill: wg-rfc-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0364

## Verdict: Needs revision

The RFC establishes a well-scoped, architecturally sound package (`@gogol/fingerprint`) with a clear API surface and staged migration policy. However, it carries a stale `backs/**` reference after RFC-0365 renamed the directory to `services/**`, does not identify Compass XML or `packages/AGENTS.md` synchronization duties, and does not acknowledge the two existing hash helper modules (`site-kernel-integrity/src/hash.ts`, `check-core/src/hash.ts`) that the migration must absorb. These are fixable in enhancement.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0364 --json` returns zero violations.

## Axis A — Structural completeness

- **CLI surface incomplete**: §5.1 shows `fingerprint.calculate` with exact invocation, but §5.2 (`fingerprint.usage.lint`) and §5.3 (`fingerprint.fixtures.validate`) lack `pnpm exec werkstatt run …` invocations with flags. An agent implementing these cannot infer the exact CLI shape from the RFC alone.
- **Output format**: `FingerprintResult` is documented as a TypeScript interface but the `--json` envelope shape for each command (the `{ commandName, data, exitCode, ok, … }` wrapper used by all kernel commands) is not shown.
- **Failure modes**: The RFC does not specify exit codes or warn-vs-fail behavior for `fingerprint.usage.lint` (warning mode in step 4, blocking in step 6 — but the command-level flag that controls this is not named) or `fingerprint.fixtures.validate`.
- **File system responsibilities**: §1 shows the package directory structure but does not name where fixtures live (`src/tests/fixtures/`?), where the allowlist file lives, or what file the allowlist format is (JSON? YAML? inline comment?).
- **Risks**: Missing agent misinterpretation risk (an agent might use `byteHash` where `fingerprintFile` with `mode: "semantic"` is required) and false-positive rate estimate for `fingerprint.usage.lint`.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-53]` is registered in `docs/architecture-dna.md:221-223` and established by this RFC. The body explains how the package enforces the invariant. `related[]` DNA references (DNA-43, 44, 47, 48, 50) are relevant and not decorative.

## Axis C — Ecosystem fit

- **Stale `backs/**` reference**: §4 (line 171) says "backs/** runtime source when the release depends on backend packages." RFC-0365 (implemented 2026-07-08) renamed `backs/` to `services/` across the repository. The RFC must say `services/**` to match the current topology.
- **Compass sync not identified**: The RFC introduces a new workspace package and three new commands. Per root AGENTS.md Compass document duties, `docs/technology.xml` and `docs/development-plan.xml` likely need synchronization. The RFC does not mention this.
- **AGENTS.md update not identified**: `packages/AGENTS.md` has an ownership table (lines 25-51) that must gain a `@gogol/fingerprint` entry. The RFC does not mention this.
- **Pipeline placement partial**: §6 step 6 says `fingerprint.usage.lint` joins `PACKAGES_CHECK_PIPELINE`. But `fingerprint.fixtures.validate` pipeline placement is not specified — it should likely join `PACKAGES_CHECK_PIPELINE` as well (it is a package-level fixture test). `fingerprint.calculate` is a utility command and may not belong in any pipeline.
- **Existing hash infrastructure not acknowledged**: Two existing hash helper modules will be subsumed:
  - `packages/os/site-kernel-integrity/src/hash.ts` — `sha256StringHex`, `sha256FileHex`, `withSha256Prefix`
  - `packages/check-core/src/hash.ts` — `sha256Hex`, `stableStringify`

  The RFC should acknowledge these and state that they will be migrated to import from `@gogol/fingerprint` (or re-exported through it) as part of the staged migration. The `stableJsonHash` API in the RFC directly overlaps with `stableStringify` + `sha256Hex` in `check-core`.

## Axis D — Forward-only compliance

- **Dual-field acceptance without removal timeline**: §4 says "During migration, schemas MAY accept both fields" (`packagesHash` and `platformSemanticHash`). While writers MUST write the new field, accepting both on the read side is a temporary compatibility shim. The RFC does not specify when `packagesHash` read support will be removed. The migration policy (§6) ends with "promote to blocking" but does not name the step that removes the old field. This should be explicit — the ecosystem is forward-only, and the dual-read window must have a documented endpoint.

## Axis E — Agent-facing policy

- **RFC-0330 reference missing**: The RFC has acceptance criteria with checkable items. Per RFC-0330 (verification evidence), the implementation should emit per-RFC verification evidence artifacts. The RFC does not reference RFC-0330 or mention evidence emission.
- **No other issues**: Status gate is clean (no self-authorizing language). No content authoring, no storage/persistence concerns.

## Axis F — Pragmatism

- **Existing patterns not checked**: The RFC proposes a new package without explicitly checking whether `site-kernel-integrity/src/hash.ts` or `check-core/src/hash.ts` could be extended. The semantic normalization requirement justifies a new package, but the RFC should state why extending those modules is insufficient (they lack parser-backed normalization).
- **Command surface is minimal**: 3 commands, each with a distinct purpose. ✓
- **Lean contracts**: The API is minimal — no speculative generality. ✓
- **Scope discipline**: `appsImpacted: []` is correct. `packagesImpacted` lists 5 packages. ✓

## Axis G — Blind spots

- **Performance not specified**: `fingerprint.calculate` on a tree (e.g., `packages/**`) involves parsing every file with its respective parser (`@typescript-eslint/typescript-estree`, `@astrojs/compiler`, `postcss`, `remark-parse`, etc.). For `packages/**` this is hundreds of files with heavy parser dependencies. The RFC should estimate the cost (file count, parse time) and state whether this is suitable for `build.check` or should be opt-in only.
- **False-positive rate for `fingerprint.usage.lint`**: The lint scans for helper names matching `sha256`, `hashTree`, `packagesHash`, `contentHash`. Many of the 78 existing `createHash` matches across 38 files are legitimate (passport signing, AI cache, behavior snapshots, etc.). The RFC mentions an allowlist but does not estimate how many existing calls will need allowlisting or describe the suppression mechanism format.
- **Edge cases**: The RFC handles unparseable files (fallback to normalized text hash + warning). Does not consider: empty package directory (zero files), concurrent execution (two agents computing fingerprints simultaneously), or interrupted writes (crash mid-tree-scan).
- **Migration scope not quantified**: 78 `createHash` matches across 38 files exist in `packages/`. The RFC should state how many are expected to be allowlisted (byte-hash legitimate) vs migrated to `@gogol/fingerprint`.

## Questions for the author

1. When will `packagesHash` read support be removed? The dual-field acceptance window needs a documented endpoint to comply with the forward-only principle.
2. Should `fingerprint.fixtures.validate` join `PACKAGES_CHECK_PIPELINE`, or is it an opt-in test command outside the standard pipeline?
3. What is the allowlist format for `fingerprint.usage.lint` — a committed JSON/YAML file, inline comments in source, or a dedicated config block? Where does it live?
4. Will `packages/os/site-kernel-integrity/src/hash.ts` and `packages/check-core/src/hash.ts` be migrated to re-export from `@gogol/fingerprint`, or will they be deleted and call sites updated to import directly from the new package?
