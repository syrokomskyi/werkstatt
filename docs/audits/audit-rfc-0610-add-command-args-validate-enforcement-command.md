---
rfcId: RFC-0610
auditId: AUDIT-RFC-0610-01
date: 2026-07-30
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0610

## Verdict: Needs revision

The RFC is structurally well-formed and addresses a real enforcement gap, but has three substantive issues: (1) pipeline placement is ambiguous and the file system responsibilities table points to the wrong pipeline file, (2) the scan scope for command registrations misses the data-driven command-tables directory where most commands are registered, and (3) two of three detection rules are redundant with TypeScript after RFC-0609, with incorrect reasoning in the alternatives section.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0610 --json` reports zero violations.

## Axis A — Structural completeness

- **Pipeline file mismatch.** The file system responsibilities table lists `packages/os/site-kernel-checks/src/pipelines/build-check.ts` for pipeline integration. That file contains `SITES_BUILD_CHECK_PIPELINE` (app-scoped). But `command.args.validate` is `scope: workspace` and scans `packages/forge/os/**/*.ts` and `packages/os/site-kernel-*/src/**/*.ts` — workspace-level source files, not app content. A workspace-scoped command belongs in `PACKAGES_CHECK_PIPELINE` (in `packages/os/site-kernel-checks/src/pipelines/packages-check.ts`), not in the app-scoped build.check. The RFC should either clarify that the command runs in both pipelines, or specify `packages-check.ts` as the target.

## Axis B — DNA alignment

- **DNA-54 connection is indirect.** `satisfies: [DNA-54]` claims the RFC enforces the Forge bindings contract. DNA-54's text: "Canonical forge skill bodies must not contain hardcoded project-specific literals in instruction lines." The RFC's actual connection is that flag-only commands make binding templates more uniform — but that is a consequence of RFC-0609, not of this enforcement RFC. This RFC enforces RFC-0609's standard, not DNA-54 directly. Consider whether `satisfies` should be empty or reference a different invariant.

## Axis C — Ecosystem fit

- **Command registration table.** The RFC says to register in `01-codegen.ts`, but `command.args.validate` is a governance/meta-command, not a codegen command. The existing `01-codegen.ts` contains generators and generated-file validators. The command belongs in `governance-checks.ts` or `build-infra.ts` — both exist in `src/command-tables/`.

- **Scan scope for command registrations is incomplete.** The file system responsibilities table lists `packages/forge/os/**/*.module.ts` as "Scanned for command registrations (flags schema)." But most standard check commands are registered in `packages/os/site-kernel-checks/src/command-tables/*.ts` (data-driven `CheckCommandEntry[]` arrays), not in forge module files. ARG-COMPLIANCE-02 requires reading the `flags` schema from registrations — the validator must also scan the command-tables directory.

## Axis D — Forward-only compliance

No issues. The command runs in fail mode from the start with no deprecation window. No shims or dual-paths.

## Axis E — Agent-facing policy

No issues. Status gate is correct ("Agents MAY implement code changes ONLY when this RFC has status: accepted"). The RFC correctly notes RFC-0609 MUST be implemented first. Implementation notes reference RFC-0224 and RFC-0334.

## Axis F — Pragmatism

- **ARG-COMPLIANCE-01 and ARG-COMPLIANCE-03 are redundant with TypeScript after RFC-0609.** RFC-0609 removes `args` from `KernelCommandInput`. After that, any reference to `input.args` (including `?? input.args[0]` and `|| input.args[0]`) is a TypeScript type error. The alternatives section incorrectly claims ARG-COMPLIANCE-03 is not caught by TypeScript: "this catches ARG-COMPLIANCE-01 but not ARG-COMPLIANCE-03 (dual-path fallback using `?? input.args[0]` before the type is removed)." The phrase "before the type is removed" is misleading — RFC-0609 removes the type entirely with no transition period (hard break, no deprecation window per RFC-0609 rollout). After RFC-0609, `?? input.args[0]` is a type error, same as `input.args[0]`. Only ARG-COMPLIANCE-02 (flags: {} with handler reading a named flag) provides value beyond TypeScript. The RFC should either drop ARG-COMPLIANCE-01/03 or reframe their value (e.g., "clearer error messages with fix hints" rather than "TypeScript cannot catch this").

- **`packagesImpacted` lists `@warpgogol/site-kernel` but no site-kernel source files are modified.** The file system responsibilities table lists no `packages/os/site-kernel/src/**` paths. The package is likely listed because the validator reads the kernel registry, but that is a read dependency, not an impact. Remove `@warpgogol/site-kernel` from `packagesImpacted` or add the files that are modified.

## Axis G — Blind spots

- **`as any` escape hatch.** The RFC doesn't consider `(input as any).args` patterns that bypass both TypeScript's type check and the regex scanner (which looks for `input.args` as a literal pattern). While the existing `no-as-any` ESLint rule catches `as any` separately, the RFC should acknowledge this escape hatch and explain that `no-as-any` is the first line of defense for this pattern.

## Questions for the author

1. Which pipeline should `command.args.validate` run in — `SITES_BUILD_CHECK_PIPELINE` (app-scoped `build.check`) or `PACKAGES_CHECK_PIPELINE` (workspace-scoped `packages-check.run`)? The command is `scope: workspace` and scans package source files, not app content.
2. If ARG-COMPLIANCE-01 and ARG-COMPLIANCE-03 are both caught by TypeScript after RFC-0609 removes `args` from `KernelCommandInput` (hard break, no transition period), what additional value does the validator provide for these two rules beyond TypeScript's type errors? Should they be dropped, or retained with corrected justification?
3. Should the validator scan `packages/os/site-kernel-checks/src/command-tables/*.ts` for command registrations, or only `packages/forge/os/**/*.module.ts`? Most standard check commands are registered in the command-tables directory, not in forge module files.
