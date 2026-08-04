---
rfcId: RFC-0683
auditId: AUDIT-RFC-0683-01
date: 2026-08-04
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0683

## Verdict: Needs revision

The RFC is well-structured and addresses a real gap — the RTK usage rule is declared in `.windsurfrules` but no command example in any agent instruction file uses the `rtk` prefix. Two findings need resolution before implementation: (1) the RFC does not exempt RTK's own install/bootstrap commands from the `rtk` prefix rule, creating a paradox where `curl | sh` to install RTK would be prefixed with `rtk`, and (2) the Forge skill note contains a self-referential `rtk --version` command that could confuse agents.

## Mechanical validation (rfc.validate)

Pass — zero violations on RFC-0683.

## Axis A — Structural completeness

- **Decision** is a single decision in present tense. ✓
- **Design** replaces template sections (CLI surface, TypeScript contracts, etc.) with policy-appropriate subsections. ✓
- **Rollout** describes implementation order, synced copies, and no migration. ✓
- **Alternatives considered** has 5 real alternatives with rejection reasons. ✓
- **Risks** includes agent misinterpretation risk and CI environment edge case. ✓
- **Acceptance criteria** — 11 items, all checkable. ✓
- **Implementation notes** are explicit behavioral rules. ✓

**Finding A-1:** The Design section's "Command block updates" table says "Add `rtk` prefix to all command blocks" for Forge skills. This is overbroad — the `forge-bootstrap` SKILL.md §6.10.2 contains RTK install commands (`curl -fsSL ... | sh`, `cargo install --git ...`, `Invoke-WebRequest ...`) that must NOT be prefixed with `rtk` (you cannot use `rtk` to install `rtk`). Similarly, §6.10.3 contains `rtk init -g --agent windsurf` which is already an `rtk` command. The RFC should explicitly exempt RTK's own install, init, and diagnostic commands from the prefix rule.

## Axis B — DNA alignment

- `satisfies: []` is correct for a `policy` kind RFC (RFC-0331 requires `satisfies` only for `architecture`/`contract` kinds).
- `related` lists RFC-0681, RFC-0374, RFC-0393 — all relevant and correctly referenced.
- DNA-54 (Forge bindings contract) is referenced in Architectural fit as alignment, not as an invariant being established or extended. Correct usage.

No issues.

## Axis C — Ecosystem fit

- **Package boundaries:** N/A — no new packages, no imports.
- **Pipeline placement:** N/A — no new pipeline steps.
- **Compass sync:** The RFC does not change requirements, technology, development-plan, or verification-plan content. No `docs/*.xml` synchronization needed. The RFC does not explicitly state this, but it is implied by the "Documentation-only change" rollout note.
- **AGENTS.md updates:** Explicitly listed in Design § "AGENTS.md rule addition" and the command block updates table.
- **Command lifecycle:** `commands.proposed/added/changed/removed` all empty — correct, no commands changed.

No issues.

## Axis D — Forward-only compliance

- No compatibility shim or dual-path. The graceful degradation rule is a fallback for an optional tool, not a legacy compatibility layer.
- No legacy code paths maintained behind a flag.
- No backward compatibility layer.

No issues.

## Axis E — Agent-facing policy

- **Status gate:** ✓ No self-authorizing language. Implementation notes say "Agents MAY implement changes ONLY when this RFC has status: accepted (or implemented)."
- **Implementation notes** reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation). Correct governance rules.
- **Anti-fabrication:** N/A — no content authoring.
- **Storage policy:** N/A — no persistence.

No issues.

## Axis F — Pragmatism

- **Minimal command surface:** ✓ No new commands.
- **Lean contracts:** N/A — no TypeScript types (policy RFC).
- **Existing patterns:** ✓ Extends existing `.windsurfrules` RTK section rather than creating a new mechanism.
- **Scope discipline:** `packagesImpacted: [packages/forge]` — correct. Only forge package's skill files are part of the npm package. Other files (AGENTS.md, .windsurfrules, docs/) are not npm package contents. `nonGoals` are explicit and meaningful.

No issues.

## Axis G — Blind spots

- **Performance:** N/A — no build-time commands.
- **False positives:** N/A — no validators proposed.
- **Edge cases:** ✓ Covers "RTK not installed", "RTK installed but hook not active", "RTK command fails for non-not-found reasons", "RTK not installed in CI".
- **Migration path:** ✓ "No migration. Existing Forge consumers are unaffected."
- **Security/privacy:** N/A.

**Finding G-1:** The Forge skill note proposed in Design § "Forge skill note" says: "Commands below assume RTK is installed. If `rtk --version` fails, run commands without the `rtk` prefix." The command `rtk --version` in this note is itself an `rtk` command — it works only if RTK is installed. This is logically correct (you run `rtk --version` to check), but an agent reading this note might interpret it as "all commands in this file require `rtk` prefix, including the check command itself." The note should clarify that `rtk --version` is the detection command, not a prefixed command.

## Questions for the author

1. Should the RFC explicitly exempt RTK's own install commands (`curl | sh`, `cargo install`, `Invoke-WebRequest`, `rtk init`, `rtk gain`) from the `rtk` prefix rule, or is this implicitly obvious to agents?
2. Should the Forge skill note rephrase `rtk --version` to "run `rtk --version` (this is the detection command — if it fails, RTK is not installed)" to avoid the self-referential confusion?
3. The RFC lists `docs/policies/*.md` and `docs/COMMANDS.md` in the command block updates table — should `docs/agents/*.md` also be listed explicitly?
