---
id: RFC-0599
title: "Fix open-source.generate output completeness verification"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-30
updatedAt: 2026-07-30
enhancedAt: 2026-07-30
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0489
  - RFC-0345
  - RFC-0375
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - open-source.generate
  removed: []
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-codegen"
successSignals:
  - "After deleting public/open-source/THIRD_PARTY_LICENSES.txt and re-running open-source.generate, the file is regenerated even when the fingerprint cache matches."
  - "generated.files.validate passes after open-source.generate with no missing-output errors for open-source artifacts."
  - "The fingerprint cache short-circuit checks all declared output paths, not just the content page."
nonGoals:
  - "Do not change the fingerprint computation algorithm itself — only the completeness check that gates the short-circuit."
  - "Do not add a --force flag — the fix must work without any operator flag."
  - "Do not refactor the pnpm-licenses invocation or SBOM generation logic."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0599: Fix open-source.generate output completeness verification

## Context

A public folder regeneration experiment on warpgogol-com (2026-07-30) revealed that `open-source.generate` silently fails to regenerate its public download artifacts when they are missing from disk. After deleting all generated files from `public/` and running `build.prepare`, the three open-source public artifacts (`THIRD_PARTY_LICENSES.txt`, `THIRD_PARTY_NOTICES.txt`, `sbom.cdx.json`) were not recreated. The `generated.files.validate` step (RFC-0375) reported them as missing.

Running `open-source.generate` manually (with or without `--force`) returned `[open-source] up to date` and produced zero output files. The `public/open-source/` directory remained empty.

The root cause is in `packages/os/site-kernel-codegen/src/open-source-page.ts:800-820`: the fingerprint cache short-circuit checks only whether the content page (`src/content/pages/{lang}/open-source.md`) exists on disk, but does not verify that the public download artifacts exist. When the fingerprint matches (because `pnpm-lock.yaml` and `system.md` are unchanged), the generator returns early without writing any public files — even if they were deleted.

## Problem

The fingerprint cache short-circuit at `open-source-page.ts:800-820` checks only `firstPagePath` (the content page) via `fs.access`, but the generator produces **five** categories of output:

1. Content pages: `src/content/pages/{lang}/open-source.md`
2. Prose pages: `src/content/prose/{lang}/open-source.md`
3. Registry JSON: `src/content/data/{lang}/open-source-registry.json`
4. Public download artifacts: `public/open-source/THIRD_PARTY_NOTICES.txt`, `public/open-source/THIRD_PARTY_LICENSES.txt`, `public/open-source/sbom.cdx.json`
5. Fingerprint cache: `.cache/open-source.fingerprint`

If any of outputs 1–4 are missing but the fingerprint matches, the generator silently skips regeneration. The fingerprint cache itself (item 5) is not part of the completeness check — if it is missing, the generator already falls through to full regeneration via the existing catch block at line 818. This violates the RFC-0087 idempotency contract (re-running a generator must produce identical output) and the RFC-0375 `generated.files.validate` expectation that all registry-declared files exist after their owning command runs.

The `--force` flag does not help because the short-circuit logic does not check `--force` — it only checks fingerprint match + content page existence.

## Decision

The `open-source.generate` fingerprint cache short-circuit checks **all declared output paths** for existence before returning "up to date". If any declared output file is missing, the generator proceeds with full regeneration regardless of fingerprint match.

## Architectural fit

- **RFC-0087 (content-driven generation contract)**: The idempotency invariant (re-running a generator must produce identical output) is violated when the fingerprint cache short-circuit skips regeneration of missing outputs. This RFC does not establish or enforce a DNA invariant — it fixes a bug in the generator's implementation of the RFC-0087 contract.
- **RFC-0489 (open-source SBOM registry)**: This RFC fixes a bug in the generator introduced by RFC-0489. The fingerprint cache was added for performance but the completeness check was incomplete.
- **RFC-0345 (idempotent file writes)**: Aligns with the idempotency contract — `writeFileIfChanged` ensures no redundant writes, but the generator must still produce all outputs when they are missing.
- **RFC-0375 (generated.files.validate)**: The validator already checks for missing registry-declared files. This RFC ensures the generator itself does not cause those failures.

## Design

### CLI surface

No new commands. No new flags. The fix is internal to `open-source.generate`:

```sh
pnpm exec site-kernel run open-source.generate --site warpgogol-com
```

### TypeScript contracts

The fix adds a `declaredOutputPaths` array to the fingerprint cache check block in `runGenerateOpenSourcePage`. No new types are needed — the change is a pure logic fix inside the existing function.

```ts
// After fingerprint match is confirmed, check ALL declared output paths:
// Note: paths use contentDirectory + "prose"/"data" (not contentProseDirectory/
// contentDataDirectory, which do not exist on AstroSitePaths).
const declaredOutputPaths = [
  // Content pages (per language)
  ...supportedLangs.map((lang) =>
    path.join(paths.contentPagesDirectory, lang, "open-source.md")
  ),
  // Prose pages (per language)
  ...supportedLangs.map((lang) =>
    path.join(paths.contentDirectory, "prose", lang, "open-source.md")
  ),
  // Registry JSON (per language)
  ...supportedLangs.map((lang) =>
    path.join(paths.contentDirectory, "data", lang, "open-source-registry.json")
  ),
  // Public download artifacts
  path.join(paths.publicDirectory, "open-source", "THIRD_PARTY_NOTICES.txt"),
  path.join(paths.publicDirectory, "open-source", "THIRD_PARTY_LICENSES.txt"),
  path.join(paths.publicDirectory, "open-source", "sbom.cdx.json"),
];

// If ANY declared output is missing, proceed with full regeneration
const allOutputsExist = await Promise.all(
  declaredOutputPaths.map((p) => fs.access(p).then(() => true).catch(() => false))
);
if (allOutputsExist.every(Boolean)) {
  return { data: { dependencyCount: 0 }, summary: "[open-source] up to date" };
}
// Fall through to full regeneration
context.logger.info("[open-source] fingerprint matches, but output file(s) missing; regenerating");
```

The `declaredOutputPaths` array must match the output paths declared in `GENERATOR_OWNERSHIP_MAP` (`packages/os/site-kernel-checks/src/generator-ownership.ts:159-180`). The ownership map uses glob patterns (`{lang}`), while the runtime check uses concrete paths with actual language codes — the two must stay in sync. If a new output is added to the generator, it must be added to both the `declaredOutputPaths` array and the ownership map.

The existence check runs regardless of `context.dryRun` — it inspects disk state from previous real runs, not the current run. In dry-run mode, missing outputs still trigger full regeneration (which then skips writes via the existing `if (!context.dryRun)` guards at lines 911 and 947). This is the correct behavior: dry-run should report whether regeneration would occur, not skip the check.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-codegen/src/open-source-page.ts` | Fix target — fingerprint cache short-circuit logic (lines 800-820) |
| `packages/os/site-kernel-checks/src/generator-ownership.ts` | Reference — declared output paths for open-source.generate |
| `public/open-source/THIRD_PARTY_NOTICES.txt` | Output — must be regenerated when missing |
| `public/open-source/THIRD_PARTY_LICENSES.txt` | Output — must be regenerated when missing |
| `public/open-source/sbom.cdx.json` | Output — must be regenerated when missing |

### Output format

No change to `--json` output shape. The command continues to return `KernelCommandResult<{ dependencyCount: number }>`.

### Failure modes

- If `pnpm licenses list --prod --json` fails (e.g., no `pnpm-lock.yaml`), the generator already handles this with a try/catch block. No change.
- If the fingerprint cache file itself is missing, the generator already falls through to full regeneration. No change.
- If some output files exist and others are missing, the fix ensures full regeneration (not partial). This is the correct behavior because the generator produces all outputs from a single pnpm-licenses invocation.

## Rollout

- **Default behavior**: The fix is active immediately upon implementation. No flags, no opt-in.
- **Existing apps**: No migration needed — the fix only changes the short-circuit condition, not the generation logic. Apps with all outputs present see no difference.
- **New apps**: Automatically benefit from the fix.
- **Pipeline integration**: No change — `open-source.generate` remains in `build.prepare` at its current position.
- **Verification**: After implementation, run the public folder regeneration experiment (delete `public/open-source/*`, run `build.prepare`) and confirm all three artifacts are regenerated.

## Alternatives considered

- **Remove the fingerprint cache entirely**: Rejected — the cache provides a significant performance benefit by avoiding `pnpm licenses list --prod --json` (which takes 5-10 seconds) when nothing changed. The fix preserves the cache but fixes the completeness check.
- **Add a `--force` flag that bypasses the cache**: Rejected — the `--force` flag already exists but does not bypass the fingerprint short-circuit. Adding bypass logic to `--force` would work but is the wrong fix: the generator should never silently skip missing outputs regardless of `--force`.
- **Make `generated.files.validate` auto-fix missing files by calling the owning generator**: Rejected — validators must be read-only. The fix belongs in the generator, not the validator.

## Risks

- **Performance**: The fix adds N `fs.access` calls (where N = 3 + 3×languages) before the short-circuit. This is negligible — `fs.access` is sub-millisecond and N is typically 9-15.
- **False positives**: If a site legitimately does not have `public/open-source/` (e.g., `openSource` page is disabled in `system.md`), the generator already returns early before the fingerprint check. No false positive.
- **Maintenance burden**: Low — the `declaredOutputPaths` array must be kept in sync with the generator's actual outputs. If a new output is added, it must be added to the array. This is a local concern, not a cross-workspace one.

## Acceptance criteria

- [ ] Fingerprint cache short-circuit in `open-source-page.ts` checks all declared output paths, not just the content page
- [ ] After deleting `public/open-source/THIRD_PARTY_LICENSES.txt` and re-running `open-source.generate`, the file is regenerated
- [ ] After deleting `public/open-source/THIRD_PARTY_NOTICES.txt` and re-running `open-source.generate`, the file is regenerated
- [ ] After deleting `public/open-source/sbom.cdx.json` and re-running `open-source.generate`, the file is regenerated
- [ ] `generated.files.validate` passes after `open-source.generate` with no missing-output errors for open-source artifacts
- [ ] Unit test in `packages/os/site-kernel-codegen` covers the missing-output regeneration scenario
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The fix is in `packages/os/site-kernel-codegen/src/open-source-page.ts` lines 800-820. Replace the single `fs.access(firstPagePath)` check with a loop over all declared output paths.
- The `declaredOutputPaths` array must match the actual outputs written by the generator later in the function. Read the full function body to identify all `writeFile`/`writeManagedFile` calls.
- Agents MUST NOT add a `--force` bypass — the fix must work without any operator flag.
- Agents MUST NOT remove the fingerprint cache — it provides a legitimate performance benefit.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
