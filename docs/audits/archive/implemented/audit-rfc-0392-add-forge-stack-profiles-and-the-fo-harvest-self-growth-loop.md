---
rfcId: RFC-0392
auditId: AUDIT-RFC-0392-01
date: 2026-07-19
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: approved
---

# Audit: RFC-0392

### Verdict: Approved

The RFC is well-structured, architecturally sound, and aligns with DNA-1 and DNA-2. The stack profile concept fills a real gap in forge's autonomy story. Two minor findings on acceptance criteria specificity and the `forge.init --from` flag contract, neither blocking.

### Mechanical validation (rfc.validate)

Pass — no violations targeting RFC-0392.

### Axis A — Structural completeness

- **Decision** is present tense and specific. ✅
- **CLI surface** shows exact invocations with flags. ✅
- **TypeScript contracts** are minimal type signatures. ✅
- **File system responsibilities** table names concrete paths. ✅
- **Output format** documents the `--json` shape. ✅
- **Failure modes** specifies exit codes and warn-vs-fail. ✅
- **Rollout** describes steps and explicitly says "nothing joins build.check". ✅
- **Alternatives** has 4 real alternatives with rejection reasons. ✅
- **Risks** includes agent misinterpretation and false positives. ✅
- **Acceptance criteria** — 7 items, all checkable. Minor: the integration test criterion ("scaffolds a temp monorepo that passes `pnpm install`") is ambitious — `pnpm install` in a temp dir requires network access and may be flaky in CI. Consider accepting `pnpm install --lockfile-only` or a dry-run check as sufficient evidence.
- **Implementation notes** are explicit behavioral rules. ✅

### Axis B — DNA alignment

- `satisfies: [DNA-1, DNA-2]` — both are real invariants in `docs/architecture-dna.md`. The RFC body explains how stack profiles encode the pnpm + Turborepo monorepo shape (DNA-2) and the apps/packages/services boundary (DNA-1). ✅
- No new DNA invariant is established. ✅
- No conflict with existing DNA. ✅
- `related[]` references (RFC-0374, RFC-0391, RFC-0393, DNA-1, DNA-2) are all relevant. ✅

### Axis C — Ecosystem fit

- **Package boundaries**: all new files are in `packages/forge/`. ✅
- **Pipeline placement**: explicitly says "nothing joins build.check — all surfaces are operator-invoked". ✅
- **Compass sync**: no `docs/*.xml` changes needed — this is a forge-internal feature. ✅
- **AGENTS.md updates**: acceptance criterion requires root `AGENTS.md` to mention `fo-harvest`. ✅
- **Cosmic naming**: not applicable — no manifests or UI components. ✅
- **Command lifecycle**: `commands.proposed: [forge.scaffold]`, `commands.changed: [forge.init]` — internally consistent. ✅

### Axis D — Forward-only compliance

- No compatibility shims or dual-paths. ✅
- `forge.init --from` is a new capability, not a parallel path. ✅
- No legacy code paths maintained behind flags. ✅

### Axis E — Agent-facing policy

- **Status gate**: no self-authorizing language. Implementation notes correctly reference RFC-0224. ✅
- **Implementation notes** reference RFC-0224, RFC-0334. ✅
- **Anti-fabrication**: no content authoring claims. ✅
- **Storage policy**: no persistence or cookies. ✅

### Axis F — Pragmatism

- **Minimal command surface**: `forge.scaffold` is distinct from `forge.port.scaffold` (project vs skill skeleton). The alternatives section justifies this. ✅
- **Lean contracts**: `StackProfile` and `ProfileFile` are minimal. The `firstWorkspace` optional field is justified for bootstrapping the first site/package. ✅
- **Existing patterns**: `fo-harvest` reuses `port-to-forge` and `forge.port.scaffold` — no second porting mechanism. ✅
- **Scope discipline**: `packagesImpacted` lists only `@wgogol/forge`. `nonGoals` are explicit (no non-JS package managers, no auto-harvest, no bindings). ✅

### Axis G — Blind spots

- **Performance**: all commands are operator-invoked, not build-time. `detectStack` uses glob matching on the project root — cost is trivial. ✅
- **False positives**: `detect.anyOf` globs may match hybrid projects. The RFC says "Detection only _proposes_ a profile; the operator confirms". ✅
- **Edge cases**: empty directory refusal is documented. Install failure leaves partial state visible. ✅
- **Migration path**: existing projects are unaffected until they call the new commands. ✅
- **Security/privacy**: no user data, PII, or external services. ✅

### Questions for the author

1. The integration test acceptance criterion requires `pnpm install` to pass in a temp directory — should this be relaxed to `pnpm install --lockfile-only` to avoid network dependency in CI?
2. The `forge.init --from=<path>` flag is listed in `commands.changed` but the `forge.init` flag spec in `core.module.ts` doesn't currently define a `--from` flag — should the RFC explicitly list the new flag in the TypeScript contracts section?
3. Should `forge.scaffold` be registered in `forgeCoreModule` or a new `forgeScaffoldModule`? The RFC doesn't specify the module registration location.
