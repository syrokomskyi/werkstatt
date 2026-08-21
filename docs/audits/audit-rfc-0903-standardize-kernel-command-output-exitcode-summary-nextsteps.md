---
rfcId: RFC-0903
auditId: AUDIT-RFC-0903-01
date: 2026-08-21
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0903

## Verdict: Needs revision

RFC-0903 is architecturally sound and addresses a real gap — no automated enforcement of kernel command output consistency exists. However, the RFC contains several factual inaccuracies about the current codebase state, a missing helper in its exemption list, and insufficient detail on the static analysis approach. These must be fixed before implementation.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0903 --json` reports zero violations.

## Axis A — Structural completeness

- **Decision** is present tense and single ("Every kernel command handler MUST return…"). Pass.
- **CLI surface** shows exact invocations with flags. Pass.
- **TypeScript contracts** reference existing types and introduce a new `CommandOutputViolation` interface. However, this interface is not a `KernelCommandResult` payload — it is an internal diagnostic shape. The RFC should clarify whether this is a standalone type or reuses the canonical `Diagnostic` type from `@warpgogol/werkstatt/schemas` (RFC-0852). The RFC says "The validator produces diagnostics using the existing `Diagnostic` type" but then defines `CommandOutputViolation` with different fields (`file`, `commandName`, `line`) that are not in `Diagnostic`. This is contradictory — `Diagnostic` has `ruleId`, `severity`, `message`, `fixHint?`, `data?` but no `file`, `commandName`, or `line` fields. The RFC must either (a) use `Diagnostic` with `data: { file, commandName, line }` or (b) explicitly state that `CommandOutputViolation` is an internal intermediate type converted to `Diagnostic` for output.
- **File system responsibilities** table names concrete paths. Pass.
- **Output format** documents the `--json` shape. Pass.
- **Failure modes** specifies exit codes and warn-vs-fail behavior. Pass.
- **Rollout** describes gated adoption. Pass.
- **Alternatives considered** has 5 real alternatives with rejection reasons. Pass.
- **Risks** includes agent misinterpretation risk and false-positive rate. Pass.
- **Acceptance criteria** are checkable but one is stale (see Axis B).
- **Implementation notes** are explicit behavioral rules. Pass.

## Axis B — DNA alignment

- **DNA-82 already exists** in `docs/architecture-dna.md:343-345` — the RFC body says "DNA-82 does not exist yet" (line 106) and "DNA-82 (new)" (line 114), which is factually incorrect. The DNA entry was already added (likely during RFC preparation). The RFC text must be updated to reflect that DNA-82 is already documented, not pending.
- **Acceptance criterion** at line 265 says `DNA-82 is documented in docs/architecture-dna.md (evidence: docs/architecture-dna.md:343-345)` — this is correct and already satisfied, but the RFC body contradicts it by saying "DNA-82 does not exist yet" (line 106).
- `satisfies: [DNA-82]` correctly references an existing invariant. Pass.
- `related: [DNA-35]` is relevant — DNA-35 (`app.contract.full`) is the canonical readiness signal that `werkstatt.commands.validate` can eventually contribute to. Pass.

## Axis C — Ecosystem fit

- **Package boundaries**: The RFC lists `@warpgogol/werkstatt-shared` in `packagesImpacted` but does not explain why. `result-helpers.ts` lives in `packages/werkstatt-shared/src/checks/` and the RFC proposes modifying `passResult`/`failResult` to produce `[command.name]`-prefixed `summary`. This is correct — the helpers are in `werkstatt-shared`. However, the RFC body only mentions `packages/werkstatt/src/` and `packages/werkstatt-site/src/` as scan targets (line 110, 180-181) and does not mention `packages/werkstatt-shared/src/` as a scan target. If `result-helpers.ts` is scanned for compliance, `werkstatt-shared` should be listed as a scan target too.
- **Pipeline placement**: The RFC explicitly defers pipeline integration ("Does not add werkstatt.commands.validate to PACKAGES_CHECK_PIPELINE"). Pass — gated adoption is justified.
- **Compass sync**: The RFC does not identify which `docs/*.xml` files need synchronization. If `werkstatt.commands.validate` becomes a registered workspace command, `docs/verification-plan.xml` may need updating to include the new validator. The RFC should address this.
- **AGENTS.md updates**: The RFC does not identify which `AGENTS.md` files need rule updates. The root `AGENTS.md` or `packages/werkstatt/AGENTS.md` should mention the new output standard for command handlers. This is a gap.
- **Command lifecycle**: `commands.proposed: [werkstatt.commands.validate]` is correct for a draft RFC. Upon implementation it will move to `added`. Pass.
- **Registration location**: The RFC says the command is "registered in the engine kernel" (line 119) but does not specify which module registers it. The RFC should name the module (e.g., a new module in `packages/werkstatt/src/` or an existing one like `werkstatt-plugin` or `werkstatt-shared-validate`). This is an implementation detail that should be specified for agent clarity.

## Axis D — Forward-only compliance

- No compatibility shims, bridges, or dual-paths proposed. Pass.
- The gated adoption approach (register without pipeline integration) is not a dual-path — it is a phased rollout with a clear forward trajectory. Pass.
- No legacy code paths maintained behind a flag. Pass.

## Axis E — Agent-facing policy

- **Status gate**: The RFC says "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" (line 278). This is correct — no self-authorizing language. Pass.
- **Implementation notes** reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation). Pass.
- **Anti-fabrication**: No content authoring involved. N/A.
- **Storage policy**: No persistence changes. N/A.
- **NEEDS CLARIFICATION markers**: None found. Pass.

## Axis F — Pragmatism

- **Minimal command surface**: `werkstatt.commands.validate` earns its existence — no existing command covers this scope. `werkstatt.operation.validate` checks lock/idempotency/atomic-write patterns, not output format. Pass.
- **Lean contracts**: `CommandOutputViolation` is minimal but redundant with `Diagnostic` (see Axis A). The RFC should reuse `Diagnostic` directly.
- **Existing patterns**: The RFC correctly identifies `result-helpers.ts` as the existing pattern and proposes to verify it rather than replace it. Pass.
- **Scope discipline**: `packagesImpacted` lists `@warpgogol/werkstatt`, `@warpgogol/werkstatt-site`, `@warpgogol/werkstatt-shared` — all three are genuinely impacted (scan targets + helper modifications). Pass.
- **Helper exemption list is incomplete**: The RFC exempts `passResult`, `failResult`, `diagnosticsResult`, and `buildAuditResult` (line 223, 268). However, `resultFromViolations` (also in `result-helpers.ts`) is not listed. This helper delegates to `passResult`/`failResult`, so it is transitively covered, but the RFC should list it explicitly for completeness. Additionally, `buildAuditResult` lives in `packages/werkstatt-site/src/checks/audit/helpers.ts`, not `result-helpers.ts` — the RFC should clarify that helper-exempt returns span two files in two packages.

## Axis G — Blind spots

- **Performance**: The RFC does not specify the scan cost. With 791 registered commands and ~637 files containing return statements, a regex/AST scan on every invocation could be slow. The RFC should estimate: how many files are scanned, what regex patterns are used, and whether caching is needed. A 200-file regex scan is sub-second, but the RFC should state this.
- **False positives**: The RFC acknowledges false positives for non-`KernelCommandResult` returns in handler files and mitigates by only scanning files with `registry.registerCommand` or `ALL_COMMANDS` patterns. However, many handler files use indirect registration (e.g., `createStandardCheckModule` registers commands from `ALL_COMMANDS` arrays in `command-tables/*.ts` — the actual handler functions are in separate files). The RFC's file detection strategy (`registry.registerCommand` or `ALL_COMMANDS`) may miss the actual handler implementation files. This is a significant blind spot — the validator needs a way to map registered command names to their handler function files.
- **Edge cases**: The RFC does not consider commands registered via factory functions (e.g., `createStandardCheckModule`, `createOnboardingModule`, `createTestingModule`) where the `execute` function is defined in the factory closure, not in a standalone handler file. These are common patterns in `packages/werkstatt-site/src/`. The static analysis approach must handle these.
- **Migration path**: The RFC says "Fixes are manual edits to handler files" and "No migration tool is provided." This is acceptable for gated adoption. Pass.
- **Security/privacy**: No user data, PII, or external services involved. N/A.

## Questions for the author

1. The RFC says "DNA-82 does not exist yet" (line 106) but DNA-82 is already documented at `docs/architecture-dna.md:343-345`. Should the RFC body be updated to reflect that DNA-82 is already established, or was the DNA entry added prematurely before RFC acceptance?
2. How will the static analysis map registered command names to handler implementation files when commands are registered via factory functions (e.g., `createStandardCheckModule`) where the `execute` function is in the factory closure, not a standalone file?
3. Should `packages/werkstatt-shared/src/` be listed as a scan target alongside `packages/werkstatt/src/` and `packages/werkstatt-site/src/`, given that `result-helpers.ts` (which the RFC proposes to verify) lives there?
4. Which `docs/*.xml` Compass documents and `AGENTS.md` files need synchronization when this RFC is implemented?
5. Is `CommandOutputViolation` (line 160-167) intended to be a standalone type or should the validator use the canonical `Diagnostic` type from `@warpgogol/werkstatt/schemas` with `data: { file, commandName, line }`?
