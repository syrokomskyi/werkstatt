---
rfcId: RFC-0754
auditId: AUDIT-RFC-0754-01
date: 2026-08-08
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0754

## Verdict: Needs revision

The RFC addresses a real friction point but contains a factual error in the file system responsibilities table (wrong package path), proposes a breaking change to the `EcosystemCommitResult` interface without acknowledging the existing shape, and completely ignores the existing RFC-0704 `skipPlatformBump` path (independent packages, documentation-only files) which overlaps with the proposed non-platform fallback. These must be resolved before implementation.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **A-1 (FAIL): File system responsibilities table has wrong path.** The RFC states the handler lives at `packages/os/site-kernel-handoff/src/ecosystem-commit.ts` (line 113). The actual implementation is at `packages/os/site-kernel-checks/src/ecosystem-commit.ts` (`@/packages/os/site-kernel-checks/src/ecosystem-commit.ts:236`). The `packagesImpacted` list also lists `@warpgogol/site-kernel-handoff` instead of `@warpgogol/site-kernel-checks`.

- **A-2 (FAIL): TypeScript contracts drop existing flags without explanation.** The existing `EcosystemCommitInput` has `rfc?`, `bump?`, `amend?`, `json?` fields (`@/packages/os/site-kernel-checks/src/ecosystem-commit.ts:43-50`). The RFC's proposed interface (lines 91-94) keeps only `message` and `dryRun?`. Dropping `--rfc`, `--bump`, and `--amend` is a breaking change that the RFC does not acknowledge or justify.

- **A-3 (FAIL): TypeScript contracts replace the result shape entirely.** The existing `EcosystemCommitResult` (lines 52-73) is a single-commit result with `previousVersion`, `newVersion`, `bumpType`, `rfcId`, `platformSemanticHash`, `commitSha`, `trailers`, `pcForecast`, `violations`, `skipPlatformBump`, `warnings`. The RFC proposes `commits[]` + `totalFiles` (lines 96-106). This is a completely different shape. The RFC must explain whether this replaces or extends the existing result, and how existing consumers (tests, CLI output, `--json` callers) are handled.

- **A-4 (FAIL): Output format example doesn't match existing output.** The RFC's output example (lines 118-137) shows `commits[]` with per-commit `scope`, `sha`, `versionBumped`, `files`. The existing output has `previousVersion`, `newVersion`, `bumpType`, `platformSemanticHash`, `trailers`. The RFC doesn't acknowledge this is a breaking change to `--json` consumers.

## Axis B — DNA alignment

- No issues. The RFC is `kind: command`, `satisfies: []` is acceptable. The body references DNA-2, RFC-0224, RFC-0362 in the architectural fit section, which is adequate for a command-kind RFC.

## Axis C — Ecosystem fit

- **C-1 (FAIL): `packagesImpacted` lists wrong package.** `@warpgogol/site-kernel-handoff` is listed but the handler lives in `@warpgogol/site-kernel-checks`. The correct package is `@warpgogol/site-kernel-checks`.

- **C-2 (FAIL): `@warpgogol/site-kernel` is impacted but not listed.** The RFC extends scope detection logic. `isPlatformScope` and `PLATFORM_SCOPE_PREFIXES` live in `@warpgogol/site-kernel/src/platform-scope.ts` (`@/packages/os/site-kernel/src/platform-scope.ts:13-17`). If the split-commit logic needs new scope classification helpers, this package may need changes.

- **C-3 (WARN): `@warpgogol/forge` is listed but not justified.** The forge package defines the `independentVersionPackages` config schema (`@/packages/forge/src/config/forge-config.ts:208`) which `ecosystem.commit` reads. The RFC doesn't mention RFC-0704 or `independentVersionPackages` at all, so the connection is unclear. Either justify the forge dependency or remove it from `packagesImpacted`.

- **C-4 (WARN): Compass sync not addressed.** The RFC changes a workspace-scope command's behavior. If `docs/command-manifest.generated.yaml` or `docs/COMMANDS.md` need regeneration, the RFC should mention it.

- **C-5 (WARN): AGENTS.md update is vague.** The RFC says "update `AGENTS.md`" (line 151) but doesn't specify which sections. The root `AGENTS.md` and `packages/os/site-kernel-checks/AGENTS.md` likely need updates.

## Axis D — Forward-only compliance

- No issues. The RFC extends `ecosystem.commit` to handle all scopes. No backward compatibility layer, no dual-path. The existing EC-01 block is replaced, not maintained alongside.

## Axis E — Agent-facing policy

- **E-1 (WARN): Implementation notes don't reference RFC-0476.** The RFC says "Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions" (line 180) but doesn't mention RFC-0476 (stamp command requirement — direct edits to `status`/`implementedAt` are prohibited). The PREFERENCES.md and RFC-0476 require using `rfc.implement.stamp`.

- No NEEDS CLARIFICATION markers found.

## Axis F — Pragmatism

- **F-1 (FAIL): RFC-0704 `skipPlatformBump` path is completely ignored.** The existing code already has a `skipPlatformBump` path (`@/packages/os/site-kernel-checks/src/ecosystem-commit.ts:279-285`) that skips the version bump when all staged platform files belong to `independentVersionPackages` (RFC-0704) or are documentation-only (`.md`). The RFC's "non-platform-scope only" fallback (case 2) is a new third path, but the RFC doesn't explain how it interacts with the existing skip-bump paths. For example: what happens when all staged files are platform-scope but documentation-only? The existing code skips the bump. The RFC's new logic would classify this as "platform-scope only" (case 1) and apply a bump — contradicting the existing behavior. The RFC must address this overlap.

- **F-2 (WARN): `commits[]` array may be over-engineered.** The existing result shape is a single-commit result. For the split-commit case, the result could be extended with an optional second commit field, rather than replacing the entire shape with an array. This would be less disruptive to existing consumers.

## Axis G — Blind spots

- **G-1 (FAIL): `--rfc` flag in mixed-scope commits not addressed.** If an operator passes `--rfc RFC-XXXX` with mixed-scope files, should the `X-RFC` trailer be on the platform commit only? Both commits? The RFC doesn't say. The existing code puts the trailer on the single commit.

- **G-2 (FAIL): `--amend` and `--bump` in new paths not addressed.** The existing code supports `--amend` (amend the last commit) and `--bump` (override bump type). The RFC's proposed interface drops these flags, but if they're retained (per A-2), the RFC must specify their behavior in the non-platform and mixed-scope paths.

- **G-3 (WARN): `ECOSYSTEM_COMMIT=1` env var bypass not addressed.** The pre-commit guard (`@/hooks/pre-commit:10`) bypasses the platform-scope check when `ECOSYSTEM_COMMIT=1` is set. The non-platform commit in the split path will also use this env var (since `ecosystem.commit` calls `git commit`). The RFC should confirm this is intentional — the guard won't fire for non-platform files anyway, but the env var is still set.

- **G-4 (WARN): Split-commit mechanics not specified.** The RFC says "split into two sequential commits" but doesn't describe the mechanism. Options: (a) `git reset` + `git add` only platform files + commit + `git add` rest + commit, or (b) `git stash` + partial stage. The RFC should specify the approach to avoid implementation ambiguity.

- **G-5 (WARN): Failure on second commit — recovery instructions not specified.** The RFC says "the command reports the failure and advises the operator to commit the remaining files manually" (line 144). The RFC should specify the exact error message and which files are already committed (the platform commit SHA) vs. which are pending.

## Questions for the author

1. How does the new auto-detect logic interact with the existing RFC-0704 `skipPlatformBump` path? When all staged platform files are documentation-only (`.md`), the existing code skips the bump — should the new logic preserve this behavior, or should `.md` files in `packages/` be treated as platform-scope requiring a bump?
2. The proposed `EcosystemCommitResult` with `commits[]` replaces the existing shape entirely. Should the result be extended instead (add optional `nonPlatformCommit` field) to minimize breakage of existing `--json` consumers and tests?
3. What happens to `--rfc`, `--bump`, and `--amend` flags? The existing command supports all three. The RFC's proposed interface drops them — is this intentional, or should they be retained?
