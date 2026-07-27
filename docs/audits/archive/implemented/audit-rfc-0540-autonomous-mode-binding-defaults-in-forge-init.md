---
rfcId: RFC-0540
auditId: AUDIT-RFC-0540-01
date: 2026-07-26
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: approved
---

# Audit: RFC-0540

## Verdict: Approved

The RFC is structurally complete, aligns with DNA-54, and solves a real first-run-experience problem: forge-CLI-backed bindings are written as `null` by `defaultForgeConfig` even though the commands ship in the same package. Two minor findings (Axis A and Axis G) do not block — they are refinements the enhance step can address.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0540 --json` returns 0 violations.

## Axis A — Structural completeness

- **CLI surface**: the default binding matrix table (lines 108–116) shows exact command templates with `<pm> exec` prefix and `{id}`/`{commit}`/`{spec}` placeholders. The `forge.doctor` output format (lines 151–161) shows the JSON shape. Both are concrete and checkable.
- **TypeScript contracts** (lines 122–132): `ForgeCliBindingDefault` interface and `FORGE_CLI_BINDING_DEFAULTS` constant are minimal type signatures, not implementations. Good.
- **File system responsibilities** (lines 143–147): names `packages/forge/src/config/forge-config.ts`, consumer `forge.yaml`, and this monorepo's `forge.yaml`. Concrete and correct.
- **Failure modes** (lines 163–167): covers unknown package manager, operator override, and command rename. Missing: what happens when `forge.init` is run in a project where `forge.yaml` already exists but has null forge-CLI bindings — the RFC says "Existing `forge.yaml` untouched" (line 138, 192), but the failure-modes section doesn't explicitly state this as a known limitation. Minor.
- **Rollout** (lines 169–173): three-step rollout, no flag day, existing configs never rewritten. Clear.
- **Alternatives considered** (lines 175–179): three real alternatives with rejection reasons. Good.
- **Risks** (lines 181–185): template drift, package-manager detection, agent misinterpretation. Each has a mitigation. Good.
- **Acceptance criteria** (lines 189–195): 7 items, all checkable. One gap: there is no criterion verifying that `forge.doctor` does NOT emit `defaultable-binding-null` for non-null bindings (i.e., the notice fires only on null). This is implied by the design but not explicitly tested. Minor.
- **Implementation notes** (lines 197–203): four explicit MUST NOT rules — clear behavioral constraints.

## Axis B — DNA alignment

- `satisfies: [DNA-54]` — DNA-54 says "Canonical forge skill bodies must not contain hardcoded project-specific literals." The RFC strengthens this by defaulting forge-CLI-backed bindings (which are not project-specific) while keeping stack-dependent ones null. The RFC body (lines 98–99) explains this distinction explicitly. **Passes.**
- `related: [RFC-0391, RFC-0393, RFC-0539, DNA-54]` — all relevant. RFC-0391 introduced `defaultForgeConfig`, RFC-0393 introduced the bindings contract, RFC-0539 defines the skill-pack experience this RFC complements. **Passes.**
- No new DNA invariant is established. No conflict with existing DNA invariants.

## Axis C — Ecosystem fit

- **Package boundaries**: changes are confined to `packages/forge/src/config/forge-config.ts` and `packages/forge/src/onboarding/doctor.ts`. No cross-package import changes. **Passes.**
- **AGENTS.md updates**: the RFC identifies `packages/forge/AGENTS.md` bindings section needs updating (criterion line 194). The current AGENTS.md says "forge.init writes default bindings (all commands `null`)" — this will need to change. **Passes.**
- **Command lifecycle**: `commands.changed: [forge.init, forge.doctor]` — both are existing registered commands. No new commands proposed. No commands removed. Internally consistent. **Passes.**
- **Compass sync**: no `docs/*.xml` changes needed — this RFC changes forge's own config defaults, not repository-wide requirements or app-package relationships. **Passes.**

## Axis D — Forward-only compliance

- No compatibility shim or dual-path. The RFC changes `defaultForgeConfig` directly — old null-default behavior is replaced, not maintained alongside.
- Existing `forge.yaml` files are never rewritten (lines 138, 192, 202). This is not a backward-compat layer — it's a skip-with-warning semantic that RFC-0391 already established. The doctor notice nudges adoption; no migration tool is proposed. **Passes.**
- No legacy code path maintained behind a flag. **Passes.**

## Axis E — Agent-facing policy

- **Status gate**: the RFC is `status: draft`. Implementation notes (line 199) correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language. **Passes.**
- **Implementation notes** reference RFC-0334 (supersede escalation on invariant conflict) — correct governance rule. **Passes.**
- **Anti-fabrication**: no content authoring in acceptance criteria. All criteria are code/config changes an agent can make. **Passes.**
- **Storage policy**: no persistence changes. **Passes.**

## Axis F — Pragmatism

- **Minimal command surface**: no new commands. Only `forge.init` and `forge.doctor` behavior changes. **Passes.**
- **Lean contracts**: `ForgeCliBindingDefault` is a 2-field interface. `FORGE_CLI_BINDING_DEFAULTS` is a constant array. No speculative generality. **Passes.**
- **Existing patterns**: extends `defaultForgeConfig` (existing function) and `validateBindings` (existing doctor function). No new pattern introduced. **Passes.**
- **Scope discipline**: `packagesImpacted: [forge]` — correct, only forge is impacted. `nonGoals` explicitly excludes stack-dependent bindings and this monorepo's forge.yaml. **Passes.**

## Axis G — Blind spots

- **Performance**: the doctor notice adds a check for null forge-CLI bindings — this is an in-memory comparison against `FORGE_CLI_BINDING_DEFAULTS`, no file scanning. Negligible cost. **Passes.**
- **False positives**: the `defaultable-binding-null` notice fires only when a binding in `FORGE_CLI_BINDING_DEFAULTS` is null. An operator who intentionally nulls a forge-CLI binding (to use a custom command) would get a notice. The RFC says "Operator overrides a defaulted binding → fully respected; doctor stays silent on non-null values" (line 166) — but this only covers non-null overrides. If an operator intentionally sets a binding to `null` (to disable it), the notice would fire as a false positive. The RFC should clarify whether `null` with intent is distinguishable from `null` by default. Minor.
- **Edge cases**: empty state (new project with no forge.yaml) is covered by `forge.init` writing defaults. Concurrent execution not relevant — `forge.init` is a one-shot command. **Passes.**
- **Migration path**: existing consumer projects adopt at their own pace via the doctor notice. No migration window needed since existing configs are never rewritten. **Passes.**

## Questions for the author

1. If an operator intentionally sets a forge-CLI binding to `null` (to disable that command in their project), the `defaultable-binding-null` notice will fire. Should the doctor notice be suppressible (e.g., via a `bindings.commands.validateRfc: null # forge-managed` comment convention), or is the noise acceptable?
2. The `implementStamp` binding template (line 112) uses `--id {id} --implementation-commit {commit}` but the actual forge CLI command is `rfc.implement.stamp` (with dots). The template should read `<pm> exec forge rfc.implement.stamp --id {id} --implementation-commit {commit}` — is this the intended final string, or is there a shorter alias planned?
3. The `packageManager` enum in `forgeConfigSchema` includes `"bun"` (line 84 of forge-config.ts), but the RFC's failure-mode section (line 165) only mentions fallback to `npx` for "unknown" package managers. Should `bun exec` be a supported runner, or does `bun` fall through to `npx`?
