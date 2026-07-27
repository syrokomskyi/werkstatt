---
rfcId: RFC-0519
auditId: AUDIT-RFC-0519-01
date: 2026-07-24
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
rfcPath: docs/rfcs/rfc-0519-gate-catalog-generator-and-validator.md
---

# Audit: RFC-0519

## Verdict: Needs revision

The RFC is architecturally sound and follows the established generate/validate/drift pattern, but has a DNA-alignment gap (missing `satisfies: [DNA-53]`), an incorrect `packagesImpacted` entry, a pipeline double-counting issue (`SITES_BUILD_CHECK_PIPELINE` includes `SITES_CHECK_AUTHOR_PIPELINE`), and an incomplete `reads` declaration that misses command registration sites in `site-kernel-handoff`.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0519 --json` returns 0 violations.

## Axis A — Structural completeness

1. **Missing `Failure modes` section.** The RFC does not include an explicit failure-modes table with exit codes and warn-vs-fail behavior for the two new commands. The diagnostics table for `gate.catalog.validate` partially covers this, but `gate.catalog.generate` has no failure-mode documentation (e.g. what happens when source files are missing, when the runtime command registry is empty, when `writeFileAtomic` fails).

2. **`Output format` section does not document `--json` shape.** The section describes the YAML catalog format but does not document the `--json` output shape for either `gate.catalog.generate --json` or `gate.catalog.validate --json`. Both commands declare `--json` as a flag. Axis A requires the output format section to document the `--json` shape.

3. **`Rollout` section does not mention `AGENTS.md` update.** The `packages/os/site-kernel-checks/AGENTS.md` module table lists every `src/*.ts` module with its exports. Adding `src/gate-catalog.ts` requires a new entry in that table. The RFC's file system responsibilities table does not list it, and the rollout section does not mention it.

## Axis B — DNA alignment

1. **`satisfies[]` is empty but the RFC enforces DNA-53.** The architectural fit section states: "The catalog's content hash uses `@gogol/fingerprint` for deterministic output, same as the ecosystem manifest." The implementation notes say: "Agents MUST use `@gogol/fingerprint` for all hashes in the catalog (DNA-53)." DNA-53 (semantic fingerprint governance) is directly satisfied by this RFC — it mandates `@gogol/fingerprint` for content and source hashes. `satisfies: [DNA-53]` should be declared in the frontmatter.

## Axis C — Ecosystem fit

1. **`packagesImpacted` includes `@gogol/site-kernel` incorrectly.** The file system responsibilities table lists only files in `packages/os/site-kernel-checks/`. No file in `packages/os/site-kernel/` is modified. The RFC reads types from `@gogol/site-kernel` (the `GateMetadata` type from RFC-0518) but does not modify the package. `@gogol/site-kernel` should be removed from `packagesImpacted`.

2. **Pipeline placement text vs. example inconsistency.** The decision section says: "Wire `gate.catalog.validate` into `PACKAGES_CHECK_PIPELINE` after `ecosystem.manifest.validate`." But the code example shows it after `workspace.surface.validate` (which is two steps after `ecosystem.manifest.validate` in the actual pipeline at `packages/os/site-kernel-checks/src/pipelines/packages-check.ts:80-82`). The text should say "after `workspace.surface.validate`" or the example should match the text.

3. **`SITES_BUILD_CHECK_PIPELINE` includes `SITES_CHECK_AUTHOR_PIPELINE` — double-counting.** The gate discovery logic lists four pipelines to scan: `SITES_CHECK_AUTHOR_PIPELINE`, `SITES_BUILD_CHECK_PIPELINE`, `SITES_CHECK_POSTBUILD_PIPELINE`, `PACKAGES_CHECK_PIPELINE`. But `SITES_BUILD_CHECK_PIPELINE` is defined as `[...SITES_CHECK_AUTHOR_PIPELINE, ...extra steps]` (`packages/os/site-kernel-checks/src/pipelines/build-check.ts:19-20`). Scanning both causes every author-pipeline command to appear twice. The RFC needs either: (a) deduplication logic (scan the union of all pipelines, deduplicate by command name), or (b) scan only `SITES_CHECK_AUTHOR_PIPELINE` + the unique extra steps of `SITES_BUILD_CHECK_PIPELINE`, or (c) clarify that the `pipelines` field in `GateCatalogEntry` lists all pipelines a command appears in (which handles the double-counting in the output but not in the discovery logic).

4. **`SITES_BUILD_POST_PIPELINE` exclusion not justified.** `SITES_BUILD_POST_PIPELINE` includes `SITES_CHECK_POSTBUILD_PIPELINE` plus generation steps (`packages/os/site-kernel-checks/src/pipelines/build-post.ts:18-44`). The RFC does not scan it. The RFC should justify why `SITES_BUILD_POST_PIPELINE` and `SITES_BUILD_PREPARE_PIPELINE` are excluded from gate discovery, or include them.

5. **Compass XML sync not mentioned.** Adding a new validation command to `PACKAGES_CHECK_PIPELINE` may require updating `docs/verification-plan.xml` to reflect the new gate catalog validation step. The RFC does not mention which Compass XML files need synchronization.

## Axis D — Forward-only compliance

No issues. The RFC is purely additive — two new commands, one new generated artifact. No backward compatibility layers, no shims, no dual-paths. The `ecosystem.manifest.generate` change is an additive extension (new source hash entry), not a compatibility wrapper.

## Axis E — Agent-facing policy

1. **`reads` field for `gate.catalog.generate` is incomplete.** The `reads` list includes `packages/os/site-kernel-checks/src/command-tables/**` and `packages/os/site-kernel-checks/src/pipelines/**` but does not include `packages/os/site-kernel-handoff/src/**/*.ts`. RFC-0518's file system responsibilities table shows that key commands with `gate` metadata are registered in `site-kernel-handoff` module files: `platform-module.ts` (`platform.consistency.validate`), `sternsystem/sternsystem.module.ts` (`sternsystem.validate`, `surface.contract.validate`), `mission/mission.module.ts` (`mission.validate`), and `release/release-commands.ts`. The generator must either read these files or use the runtime command registry (`listRegisteredKernelCommands()`). If it uses the runtime registry, the `reads` field should note that runtime state is also consumed (as `ecosystem.manifest.generate` does — it reads files but also calls `listRegisteredKernelCommands()`).

2. **Implementation notes are explicit and correct.** The status gate is properly enforced ("Agents MAY implement code changes ONLY when this RFC has status: accepted"). The GATE-CAT-03 warning-mode policy is correctly stated. Good.

## Axis F — Pragmatism

1. **Two commands follow the established pattern.** The `generate` + `validate` pair follows the same pattern as `ecosystem.manifest.generate`/`validate` (RFC-0245) and `maintenance.debt.baseline.write`/`validate` (RFC-0251). Justified.

2. **Dedicated catalog vs. embedding in ecosystem manifest.** The alternatives section honestly rejects the embedding alternative with a valid reason (the manifest is already dense). The catalog is a focused, derived view. Justified.

3. **`GateCatalogEntry` interface is minimal.** No speculative fields, no unused optional fields. The `metadata: "present" | "absent"` discriminator is a clean way to handle the incremental backfill. Good.

## Axis G — Blind spots

1. **Phase priority order is incomplete.** The RFC defines phase priority as "postbuild > author > workspace" but does not include `mission` and `release` phases (which are valid `GatePhase` values per RFC-0518). If a command runs in both a mission pipeline and an author pipeline, what phase does it get? The full priority order should be defined (e.g. `release > mission > postbuild > author > workspace`).

2. **Edge case: empty catalog.** The RFC does not address what happens when no commands have `gate` metadata and no validation pipelines have commands (unlikely but possible during initial platform setup). The generator should produce a valid empty catalog with `total: 0` in the summary, and the validator should accept it.

3. **Performance estimate lacks file count.** The RFC says the generator's performance is "comparable to `ecosystem.manifest.generate`" but does not estimate the number of files scanned. The `collectSourceHashes` function in `ecosystem/manifest.ts` already scans `packages/*/package.json`, `docs/rfcs/**/*.md`, and other paths. The gate catalog generator would additionally scan `packages/os/site-kernel-checks/src/command-tables/**` and `pipelines/**` — a small incremental cost, but the RFC should state the approximate file count.

## Questions for the author

1. Should `SITES_BUILD_CHECK_PIPELINE` be scanned directly, or should the generator scan only the base pipelines (`SITES_CHECK_AUTHOR_PIPELINE`, `SITES_CHECK_POSTBUILD_PIPELINE`, `PACKAGES_CHECK_PIPELINE`) and deduplicate? How does the generator avoid double-counting commands that appear in both `SITES_CHECK_AUTHOR_PIPELINE` and `SITES_BUILD_CHECK_PIPELINE`?

2. Why is `@gogol/site-kernel` in `packagesImpacted`? No file in `packages/os/site-kernel/` is modified by this RFC. Should it be removed?

3. What is the full phase priority order when a command appears in pipelines spanning `mission`, `release`, `postbuild`, `author`, and `workspace` phases? The current "postbuild > author > workspace" ordering is incomplete.
