---
rfcId: RFC-0544
auditId: AUDIT-RFC-0544-01
date: 2026-07-26
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0544

## Verdict: Needs revision

The RFC is structurally well-formed and pragmatically sound, but has a critical ecosystem-fit gap: the default profile `forge-shell` does not exist in `packages/forge/profiles/`, making the command non-functional as specified. The handler path is inconsistent with existing conventions, and the `changed` commands bucket is internally contradictory.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

No issues. All required sections are present with real content. Decision is present tense ("`forge create <name>` is the single entry point"). CLI surface, TypeScript contracts, file system responsibilities, output format, failure modes, rollout, alternatives, risks, and acceptance criteria are all concrete and checkable. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

**Weak fit for DNA-54.** DNA-54 states: "Canonical forge skill bodies (`packages/forge/skills/**/*.md`) must not contain hardcoded project-specific literals in instruction lines." `forge.create` does not touch skill bodies — it composes `forge.init` (which syncs skills) and `forge.scaffold` (which generates stack files). The RFC's claim that it "makes the bindings contract observable from the first command" (line 105) is about the bindings *config* (RFC-0393), not about DNA-54's *skill-body* invariant. The connection is indirect: `forge.create` delegates to `forge.init`, which writes binding defaults (RFC-0540). Consider whether `satisfies: [DNA-54]` is decorative here or whether the RFC should explain the chain more precisely.

## Axis C — Ecosystem fit

**Critical: `forge-shell` profile does not exist.** The RFC defaults `--profile` to `forge-shell` (line 121) and describes its output as "a minimal project (forge.yaml, .agents/, docs/rfcs/, docs/adrs/)" (line 108). However, `packages/forge/profiles/` ships only `astro-typescript-turborepo.yaml` and `phaser-turborepo.yaml` — there is no `forge-shell.yaml`. The command will fail at step 3 (scaffold delegation) with "Unknown profile" for every consumer who omits `--profile`. The rollout (line 194) says "Add `--profile` default (`forge-shell`) to the scaffold delegation" but does not mention creating the profile itself.

**Handler path inconsistent with conventions.** The file system responsibilities table (line 159) places the handler at `packages/forge/os/core/create.ts`. Existing handlers follow a different pattern: `runInit` lives in `packages/forge/src/onboarding/init.ts`, `runScaffoldProject` in `packages/forge/src/onboarding/scaffold-project.ts`. The `os/core/core.module.ts` file only *registers* commands and delegates to `src/` handlers. The handler should be at `packages/forge/src/onboarding/create.ts` with registration in `os/core/core.module.ts`.

**`changed` bucket is contradictory.** `commands.changed` lists `forge.init` and `forge.scaffold` (lines 52–53), but the RFC explicitly states: "Agents MUST NOT change `forge.init` or `forge.scaffold` contracts — `forge.create` delegates to them" (line 230) and "`forge.init` and `forge.scaffold` remain available as primitives" (line 199). If their contracts are unchanged, they should not be in `changed`. Remove them or clarify what changes.

**Missing AGENTS.md update identification.** The RFC does not identify whether `packages/forge/AGENTS.md` needs a new entry for `forge.create` in the OS modules table. The table currently lists `forgeCoreModule` commands; `forge.create` would join that list.

## Axis D — Forward-only compliance

No issues. No backward compatibility layers, no shims, no dual-paths. `forge.init` and `forge.scaffold` remain as primitives — this is composition, not a compatibility layer.

## Axis E — Agent-facing policy

No issues. Status gate is correct: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" (line 227). Supersede escalation references RFC-0334 (line 232). No content authoring claims. No persistence or storage policy concerns.

## Axis F — Pragmatism

No issues. `forge.create` earns its existence as a composition command that eliminates two-step friction. TypeScript contracts are minimal. `nonGoals` are meaningful (interactive prompts, transplant mode, git init). `packagesImpacted: [forge]` is correct and minimal. The `--json` flag is in the CLI surface but not in `CreateCommandInput` — this is fine; `--json` is a CLI-level concern handled by `bin/cli.ts`, not the handler.

## Axis G — Blind spots

**Missing profile creation step.** The `forge-shell` profile is the default but does not exist. The rollout must include creating `packages/forge/profiles/forge-shell.yaml` with the minimal file set described in the RFC (forge.yaml, .agents/, docs/rfcs/, docs/adrs/). Without this, the command is non-functional.

**Execution cost unaddressed.** `forge.create` delegates to `forge.scaffold`, which may run `execSync` install commands from the profile (line 113 of `scaffold-project.ts`). The RFC does not mention timeout or cost considerations for this composition. Low severity — inherited from `forge.scaffold` — but worth noting in risks.

**No AGENTS.md sync for `forgeCoreModule` command list.** The `packages/forge/AGENTS.md` OS modules table will need `forge.create` added to the `forgeCoreModule` row. Not mentioned in rollout.

## Questions for the author

1. The `forge-shell` profile does not exist in `packages/forge/profiles/`. Is creating it part of this RFC's rollout, or is it expected from a separate RFC? Without it, `forge create <name>` fails for every consumer who omits `--profile`.
2. The handler path is listed as `packages/forge/os/core/create.ts`, but existing handlers (`runInit`, `runScaffoldProject`) live in `packages/forge/src/onboarding/`. Should the handler be in `src/onboarding/create.ts` with registration in `os/core/core.module.ts`?
3. Why are `forge.init` and `forge.scaffold` in `commands.changed` if the RFC explicitly states their contracts are unchanged and `forge.create` merely delegates to them?
