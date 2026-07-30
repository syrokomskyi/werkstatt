---
rfcId: RFC-0609
auditId: AUDIT-RFC-0609-01
date: 2026-07-30
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0609

## Verdict: Needs revision

The RFC identifies a real inconsistency and proposes a clean forward-only solution, but three significant blind spots must be resolved before implementation: (1) `ForgeCommandInput` — the type used by all 6 positional-only commands — is not mentioned at all; (2) `KernelPipelineStep.args` and `parseKernelArgv` are not addressed, yet both are directly affected by removing `args` from `KernelCommandInput`; (3) the dual-path handler count (9) and the positional-only command count (6) are both undercounted relative to the actual codebase.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0609 --json` returns zero violations.

## Axis A — Structural completeness

- **Output format** section says "No new command is introduced by this RFC" but does not document the `--json` shape for the new `KERNEL-ARG-01` diagnostic. The diagnostic shape is shown in the TypeScript contracts section, but the output format section should reference it or show the `CheckResult` shape.
- All other sections contain real content with concrete paths and examples. No template placeholders.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-54]` is correct — DNA-54 is the Forge bindings contract, and the RFC body explains how it extends the contract by standardizing `--<flag> {id}` format in binding templates. The `related` entries (RFC-0260, RFC-0393, DNA-54) are all relevant and non-decorative.

## Axis C — Ecosystem fit

- **C-01 (fail): `ForgeCommandInput` is not mentioned.** All 6 positional-only commands listed in the migration table (`rfc.validate`, `rfc.command-lifecycle.validate`, `rfc.graph`, `rfc.pipeline.status`, `adr.validate`, `session.validate`) and `forge.create` are registered in `packages/forge/os/` and use `ForgeCommandInput` (defined at `packages/forge/src/types.ts:23-26`), not `KernelCommandInput`. `ForgeCommandInput` also has `args: string[]`. The RFC's TypeScript contracts section only shows `KernelCommandInput` losing `args`. The file system responsibilities table does not list `packages/forge/src/types.ts`. Without removing `args` from `ForgeCommandInput`, the forge commands can still receive positional args.

- **C-02 (fail): `packages/os/site-kernel/src/runtime/execute-command.ts` is not in the file system responsibilities table.** This file (line 139) constructs `KernelCommandInput` with `args: resolved.args` for schema-carrying commands and calls `parseKernelArgv(argv)` for schema-less commands. Both code paths must be updated when `args` is removed from `KernelCommandInput`.

- **C-03 (fail): `KernelPipelineStep.args` is not addressed.** `KernelPipelineStep` at `packages/os/site-kernel/src/types.ts:270-277` has `args?: string[]`. Pipeline definitions use this to pass extra arguments to commands (see `execute-pipeline.ts:346,519`). If `args` is removed from `KernelCommandInput`, these pipeline step args can no longer be forwarded as positional args. The RFC must either address this or list it as a non-goal.

- **C-04 (fail): `parseKernelArgv` and the schema-less command path are not addressed.** RFC-0260 rollout step 4 says the heuristic parser (`parseKernelArgv`) and `KERNEL_BOOLEAN_FLAGS` are deleted when the baseline reaches zero. As of now, ~357 schema-less commands still use `parseKernelArgv`, which returns `{ argv, args, flags }`. If `args` is removed from `KernelCommandInput`, `parseKernelArgv` cannot return it. The RFC must coordinate with RFC-0260's rollout: either (a) this RFC is gated on RFC-0260 step 4 completion (baseline at zero), or (b) this RFC addresses what happens to schema-less commands that still rely on positional args via `parseKernelArgv`.

- **AGENTS.md updates:** The RFC mentions updating `.agents/skills/fo/*/SKILL.md` files but does not mention updating `AGENTS.md` or `packages/AGENTS.md` for the new `KERNEL-ARG-01` diagnostic and the flag-only convention. Root `AGENTS.md` should get a rule about flag-only argument pattern.

## Axis D — Forward-only compliance

No issues. Hard break with no deprecation window — consistent with forward-only principles. No compatibility shim or dual-path proposed. Legacy `args` field is deleted, not maintained behind a flag.

## Axis E — Agent-facing policy

No issues. Status gate is correct — RFC is `draft`, implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." References to RFC-0224 and RFC-0334 are correct.

## Axis F — Pragmatism

- **F-01 (fail): Dual-path handler count is undercounted.** The RFC says "9 dual-path handlers in `site-kernel-checks` and `site-kernel-handoff`" and the file system responsibilities table says "9 files" / "3 files". A grep for `input.args[0]` across `packages/os/` found 15 files in `site-kernel-checks` and `site-kernel-handoff` that read `input.args[0]`:
  - `site-kernel-checks`: `i18n-detect-implement.ts`, `geo.ts`, `maintenance/maintenance-debt-queue.ts` (2 reads), `person-create.ts`, `content-derived.ts`, `i18n-config-validate.ts`, `pbp-profile.ts`, `biome-tokens/validate.ts` (2 reads), `archetype/cosmic-name.ts`, `source-monitor.ts`, `share-utility.ts` — 12 files
  - `site-kernel-handoff`: `handoff-validate.ts`, `handoff-pack.ts`, `handoff-absorb.ts` — 3 files
  - Total: 15, not 12 (9+3). The RFC should list the exact files or at minimum correct the count.

- **F-02 (fail): Additional positional-only commands are not in the migration table.** `geo.slug.preview` (`geo.ts:70`), `i18n.config.validate` (`i18n-config-validate.ts:45`), `share.utility.lint` (`share-utility.ts:79`), `i18n.detect.implement` (`i18n-detect-implement.ts:31`), `pbp.profile.validate` (`pbp-profile.ts:43`) read `input.args[0]` without a flag fallback — they are pure positional, not dual-path. These are not in the migration table. The RFC's scope says "All Site OS commands accept entity identifiers via declared flags only" — these commands must be included.

- **F-03 (fail): `packagesImpacted` is missing `@warpgogol/site-kernel-codegen`.** `packages/os/site-kernel-codegen/src/section-scaffold.ts:98-99` reads `input.args[0]` and `input.args[1]` — both are positional args for slug and archetype id. This package is not listed in `packagesImpacted` and is not in the file system responsibilities table.

- **F-04 (minor): `section-scaffold.ts` reads `input.args[1]`** — the RFC's migration pattern ("add `id` flag, change `input.args[0]` to `input.flags["id"]`") only covers single-positional-arg commands. Commands with multiple positional args (`section.scaffold` takes slug + archetype) need a multi-flag migration pattern. The implementation notes should mention this.

## Axis G — Blind spots

- **G-01 (fail): `KernelPipelineStep.args` interaction.** Pipeline definitions in `tools/kernel.config.ts` and module `registerPipeline` calls use `step.args` to pass extra arguments to commands. For example, `execute-pipeline.ts:346` spreads `step.args` into the argv passed to `executeRegisteredCommand`. If `args` is removed from `KernelCommandInput`, these pipeline step args become untyped tokens that `resolveCommandFlags` will reject with `KERNEL-ARG-01`. The RFC must address: are pipeline step args also migrated to flags? Or is `KernelPipelineStep.args` kept as raw argv tokens that are flag-parsed? This is a design gap.

- **G-02 (fail): Schema-less commands and `parseKernelArgv` return type.** `parseKernelArgv` returns `KernelCommandInput` which includes `args`. If `args` is removed from `KernelCommandInput`, `parseKernelArgv` must also stop returning `args`. But ~357 schema-less commands still use the heuristic path. The RFC doesn't address whether this RFC is gated on RFC-0260 step 4 (baseline at zero) or whether it handles the transition for schema-less commands.

- **G-03 (minor): False positives during migration.** The RFC says `KERNEL-ARG-01` fires for any token not starting with `--`. But some commands accept values that look like flags (e.g., `--title "Foo -- Bar"`). The RFC should clarify whether quoted values containing `--` are handled correctly by the existing parser (they are, because the shell strips quotes, but the RFC should state this).

- **G-04 (minor): Tests are not mentioned in acceptance criteria.** The RFC has 12 acceptance criteria but none mention unit tests for `KERNEL-ARG-01` or for the migrated commands. RFC-0260's acceptance criteria explicitly required tests written before implementation. This RFC should include a criterion for testing the new diagnostic and the migrated commands.

## Questions for the author

1. How does this RFC interact with `KernelPipelineStep.args`? Pipeline definitions pass extra args to commands via `step.args` — if `args` is removed from `KernelCommandInput`, do pipeline step args become flag-only too, or are they kept as raw argv tokens that are flag-parsed by `resolveCommandFlags`?

2. Is this RFC gated on RFC-0260 rollout step 4 (baseline at zero, `parseKernelArgv` deleted)? If not, what happens to the ~357 schema-less commands that still use `parseKernelArgv` and rely on `args` in their `KernelCommandInput`?

3. Why does the RFC only mention `KernelCommandInput` when all 6 positional-only commands in the migration table are forge commands that use `ForgeCommandInput`? Should `ForgeCommandInput` also lose `args`, or is it kept as a separate type?

4. The grep found 15 files in `site-kernel-checks` and `site-kernel-handoff` that read `input.args[0]`, not 12 (9+3). Additionally, 5 positional-only commands in `site-kernel-checks` are not in the migration table. Should the migration table be expanded to cover all commands that read `input.args[0]`, not just the 6 listed?
