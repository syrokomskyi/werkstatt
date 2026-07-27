---
rfcId: RFC-0546
auditId: AUDIT-RFC-0546-01
date: 2026-07-26
auditor:
  skill: fo-idea-audit
  model: cascade
verdict: needs-revision
---

# Audit: RFC-0546

## Verdict: Needs revision

The core design is sound — adapter-driven migration with a registry, forge-protected file enforcement, and clean removal of `forge.init` CLI are well-scoped. However, the `commands.changed` frontmatter field incorrectly lists a skill name (`forge-bootstrap`) instead of a CLI command, the documentation update scope is incomplete (missing root `AGENTS.md`, `forge-config.ts` error messages, and multiple `forge.init` references in `packages/forge/AGENTS.md` beyond the OS modules table), and the `versionBump: minor` classification triggers a migrator requirement per RFC-0478 that the RFC does not address.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate` ran with zero errors across all RFCs. No RFC-0546-specific diagnostics.

## Axis A — Structural completeness

No issues. All required sections contain real content. Decision is a single present-tense statement. TypeScript contracts are minimal type signatures. File system responsibilities table names concrete paths. Failure modes are detailed with specific behaviors. Rollout has 10 ordered steps. Alternatives considered has 4 real alternatives with rejection reasons. Risks includes agent misinterpretation and adapter false positives. Acceptance criteria are checkable and cover the decision's scope. Implementation notes are explicit behavioral rules with RFC references (RFC-0334).

## Axis B — DNA alignment

- **DNA-54 (Forge bindings contract)** — `satisfies: [DNA-54]` is correct. The RFC body (§Architectural fit, line 109) explains how the adapter's `analyze` phase fills the same stack-dependent bindings (`typecheck`, `test`, `scopedBuild`) that `forge-bootstrap` greenfield fills interactively. The adapter derives them from source manifests instead of asking the operator, but the contract is the same: bindings declared in `forge.yaml`, referenced by skills via `ref()`, never hardcoded. This is a real extension of DNA-54, not decorative.

- **versionBump vs. migrator** — the RFC declares `versionBump: minor` (line 46) and Rollout step 10 says "minor because forge.init CLI removal is a breaking change for npm consumers (Breaks-B)." Per RFC-0478, `minor` = Breaks-B, which requires a migrator per RFC-0479. The RFC does not register a migrator. The `forge.init` CLI removal is a CLI surface break (layer A), not a data contract break (layer B). The `forge.yaml` schema change (adding optional `migrationAdapters`) is additive and safe. This either needs (a) `versionBump: patch` with justification that the CLI removal is not a data contract break, or (b) an explanation of why no migrator is needed despite `minor`.

## Axis C — Ecosystem fit

- **`commands.changed` field is incorrect** — the frontmatter lists `commands.changed: [forge-bootstrap]` (line 51). `forge-bootstrap` is a skill name, not a registered CLI command. The `commands` frontmatter field tracks CLI commands only. No CLI commands are changed by this RFC — `forge.create` is unchanged, `forge.doctor` gets a new check but its registration is not modified. This should be `commands.changed: []`.

- **Incomplete AGENTS.md update scope** — the acceptance criteria (line 281) say "packages/forge/AGENTS.md OS modules table does not list forge.init." But `packages/forge/AGENTS.md` has 8+ additional `forge.init` references beyond the OS modules table: line 34 ("synced to `.agents/skills/` by `forge.init`"), line 50 ("`forge.init` syncs pack skills"), line 64 ("`forge.init` creates it"), line 72 ("`forge.init --from=<path>` detects the stack"), line 84 ("`forge.init` writes forge-CLI-backed defaults"), line 94 ("`forge.init` prints an IDE recommendation"), line 98 ("Lifecycle commands (`forge.init`, ...)"). All need updating to reference `forge.create` or `runInit()`.

- **Root AGENTS.md not mentioned** — the root `AGENTS.md` §Forge project configuration says "`forge.init` creates it; `forge.doctor` checks for it." This needs updating to `forge.create`. The RFC's file system responsibilities table (line 206) and acceptance criteria do not mention the root `AGENTS.md`.

- **`forge-config.ts` error messages not mentioned** — `loadForgeConfig` at `packages/forge/src/config/forge-config.ts:262` says "Run 'forge init' to create project configuration" and at `:280` says "run 'forge init' to regenerate defaults." These error messages need updating to `forge create`. Not listed in the RFC's rollout or file system responsibilities.

- **`upgrade.ts` comment not mentioned** — `packages/forge/src/onboarding/upgrade.ts:8` says "Do not create forge.yaml — that is forge.init's responsibility." This comment needs updating. Not listed in the RFC.

- **`doctor.ts` messages** — the acceptance criteria (line 282) correctly require "forge.doctor does not suggest forge init in any check messages." The `doctor.ts` handler has 9+ "run 'forge init'" suggestions (lines 258, 332, 350, 360, 370, 380, 390, 400, 452). Good that this is covered, but the rollout step 8 only says "remove the forge.init suggestion from check messages; add a check for migration-adapter registry health" — it should be more specific about replacing with `forge create`.

## Axis D — Forward-only compliance

No issues. `forge.init` CLI registration is removed in the same RFC wave — no grace period, no compatibility shim. `runInit()` stays as an internal primitive called by `forge.create`, not as a parallel path. The RFC amends RFC-0545's transplant mode directly by replacing steps 4-7. No legacy code paths maintained behind a flag.

## Axis E — Agent-facing policy

No issues. The RFC is in `draft` status and does not contain self-authorizing language. Implementation notes (line 289) correctly gate implementation on `accepted` status. RFC-0334 supersede escalation is referenced for invariant conflicts (line 297). No content authoring claims that require human authoring. No persistence or storage changes.

## Axis F — Pragmatism

- **Minimal command surface** — no new CLI commands. Migration logic lives in the skill, which calls adapter functions directly. Good.
- **Lean contracts** — the `MigrationAdapter`, `AdapterAnalysis`, `MigrationResult`, and `Conflict` interfaces are minimal and well-scoped. No speculative generality.
- **Existing patterns** — the RFC extends the existing `forge-bootstrap` skill rather than creating a new skill. The adapter registry is extensible via `forge.yaml` `migrationAdapters`, avoiding monolithic migrator modification.
- **Scope discipline** — `appsImpacted: []`, `packagesImpacted: [forge]`. Correct.

## Axis G — Blind spots

- **Interrupted migration** — the RFC does not address what happens if the migration is interrupted mid-copy (e.g., process crash after copying 50 of 142 files). The `migrate()` phase copies files sequentially; a crash leaves a partial state in `apps/<appName>/`. The RFC should specify whether re-running is safe (idempotent copy — skip existing files?) or whether the operator must clean up `apps/<appName>/` first.
- **Performance** — the RFC mentions exclude patterns and "shows progress during migration" (line 264), but does not estimate the cost for large projects (e.g., 10k+ files). The exclude patterns filter build artifacts, but source-heavy projects may still be slow. Minor.
- **Concurrent execution** — not addressed. Two agents running `forge-bootstrap` transplant simultaneously on the same forge project could conflict on `apps/<appName>/` writes. Low probability but unaddressed.

## Questions for the author

1. Is `versionBump: minor` correct? Per RFC-0478, `minor` = Breaks-B (requires migrator). The `forge.init` CLI removal is a CLI surface break, not a data contract break. Should this be `versionBump: patch` (the `forge.yaml` schema change is additive/optional), or does the RFC need to register a migrator?
2. Should `commands.changed` be `[]` instead of `[forge-bootstrap]`? `forge-bootstrap` is a skill, not a CLI command. No CLI commands are changed by this RFC.
3. What happens if migration is interrupted mid-copy? Is `migrate()` idempotent (skip existing files), or must the operator manually clean `apps/<appName>/` before re-running?
4. The RFC's documentation update scope misses several `forge.init` references: root `AGENTS.md` §Forge project configuration, `packages/forge/AGENTS.md` (8+ references beyond OS modules table), `forge-config.ts` error messages (lines 262, 280), and `upgrade.ts` comments (line 8). Should these be added to the acceptance criteria or rollout?
