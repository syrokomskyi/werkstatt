---
rfcId: RFC-0391
auditId: AUDIT-RFC-0391-01
date: 2026-07-19
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: approved
---

# Audit: RFC-0391

## Verdict: Approved

The RFC is architecturally sound, forward-only, and well-aligned with DNA-1/DNA-2. Two factual inaccuracies in the file system responsibilities table need correction during enhance: a reference to a non-existent `workspace-write-boundary.ts` file, and an underestimation of the blast radius of deleting `packages/os/site-kernel/src/rfc/` (live imports exist from ADR handlers, cache, and tests within site-kernel). Neither undermines the RFC's coherence — the architectural direction is correct and the implementation notes already say "fix all imports in the same commit."

## Mechanical validation (rfc.validate)

Pass — no violations targeting RFC-0391.

## Axis A — Structural completeness

- **Factual error in file system responsibilities table.** Line 163 references `packages/os/site-kernel/src/workspace/workspace-write-boundary.ts` as a file whose module paths need updating to `packages/forge/os/rfc/`. This file does not exist in the codebase. A grep for `workspace-write-boundary` across `packages/os/site-kernel/src/**/*.ts` finds only a comment mention in `tests/fs-atomic.test.ts:14` referencing a test file in `site-kernel-checks`, not a source file in `packages/os/site-kernel/src/workspace/`.
- **"Dead duplicate code" claim is partially inaccurate.** The RFC Problem section (line 86) calls `packages/os/site-kernel/src/rfc/` "dead duplicate code." However, grep reveals live imports from within site-kernel: `adr/handlers/validate.ts` (2 imports), `cache/rfc-cache.ts` (1 import), and three test files (`tests/rfc-acceptance.test.ts`, `tests/rfc-create.test.ts`, `tests/rfc-validate.test.ts`). The tree is duplicated but not dead — deletion requires redirecting these 6 import sites to `@wgogol/forge/os/rfc/` or inlining the needed functionality. The RFC's implementation notes (line 232) do say "fix all imports in the same commit" but do not identify these specific importers.
- All other structural items pass: Decision is present tense, CLI surface shows both kernel-registered and autonomous invocations, TypeScript contracts are minimal signatures, output format documents `--json` shape, failure modes specify exit codes, rollout describes adoption path, alternatives are honest (4 with rejection reasons), risks include agent misinterpretation and false-positive rate, acceptance criteria are checkable, implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

- `satisfies: [DNA-1, DNA-2]` — both are real DNA invariants in `docs/architecture-dna.md`.
  - **DNA-1 (Monorepo boundary):** The RFC explains (line 95) that deleting the duplicated `site-kernel/src/rfc/` tree keeps exactly one owner per capability; site-kernel consumes forge, never the reverse. The `kernel.config.ts` confirms RFC commands are registered from `@wgogol/forge/os/rfc-module` (line 59). Alignment is genuine.
  - **DNA-2 (pnpm workspace + Turborepo):** The RFC explains (line 96) that `forge.yaml` records the package-manager reality of the host project instead of assuming pnpm. The `ForgeConfig.project.packageManager` field supports `"pnpm" | "npm" | "yarn" | "bun" | "none"`. Alignment is genuine.
- `related: [RFC-0374, RFC-0376, RFC-0392, RFC-0393, DNA-1, DNA-2]` — all relevant and not decorative.
- No new DNA invariant established by this RFC. No conflicts with existing DNA.

## Axis C — Ecosystem fit

- **Package boundaries:** `@wgogol/forge` is in `packages/*`. No cross-boundary imports proposed. ✓
- **Pipeline placement:** All three commands (`forge.init`, `forge.agents.generate`, `forge.doctor`) are on-demand, not in `build.check`. Justified. ✓
- **Compass sync gap.** The RFC adds `forge.yaml` as a new workspace-level project configuration file — a workspace topology change. Root AGENTS.md Compass duties say "Keep the root Compass files synchronized with the current codebase, workspace topology." The RFC mentions updating root `AGENTS.md` (acceptance criteria line 222) but does not identify whether `docs/technology.xml` or other Compass XML files need synchronization. Minor gap — the implementer should check whether `docs/technology.xml` needs a `forge.yaml` entry.
- **AGENTS.md updates:** Identifies root `AGENTS.md` (line 222). ✓
- **Cosmic naming:** N/A — does not touch manifests or component/section/page contracts.
- **Command lifecycle:** `commands.proposed: [forge.agents.generate]`, `commands.changed: [forge.init, forge.doctor]` — internally consistent. `forge.agents.generate` will land in `added` upon implementation. ✓

## Axis D — Forward-only compliance

- No compatibility shim, bridge, or dual-path. ✓
- `packages/os/site-kernel/src/rfc/` deletion is forward-only — removed in the same RFC wave, no grace period (line 197). ✓
- No legacy code paths maintained behind a flag. ✓
- The `bindings?: Record<string, unknown>` passthrough in `ForgeConfig` is not a compatibility layer — it is a reserved slot for RFC-0393, accepted and ignored by @1 loaders. ✓

## Axis E — Agent-facing policy

- **Status gate:** No self-authorizing language. The RFC correctly states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." ✓
- **Implementation notes** reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation). ✓
- **Anti-fabrication:** N/A — acceptance criteria are code/config changes, not content authoring.
- **Storage policy:** N/A — does not touch persistence.
- **MUST NOT rules** are explicit: no `forge.agents.generate` against the monorepo's hand-written `AGENTS.md`, no re-adding `@gogol/*` imports, no hand-editing generated `AGENTS.md`, no transitional re-exports when deleting `src/rfc/`. ✓

## Axis F — Pragmatism

- **Minimal command surface:** `forge.agents.generate` earns its existence — regenerating `AGENTS.md` from config is a distinct responsibility from init (which is idempotent and creates, not regenerates). ✓
- **Lean contracts:** `ForgeConfig` is minimal with sensible defaults. The `bindings?` passthrough is a single optional field, not speculative generality. ✓
- **Existing patterns:** Extends existing `forge.init`/`forge.doctor` rather than creating new commands where possible. `resolveForgeRoot` is the single place for monorepo-vs-npm resolution. ✓
- **Scope discipline:** `packagesImpacted: ["@wgogol/forge", "@gogol/site-kernel"]` — both are actually impacted (forge gets new config module + reworked handlers; site-kernel gets `src/rfc/` deleted). `nonGoals` are explicit and meaningful (4 items, each pointing to the RFC that handles the excluded scope). ✓

## Axis G — Blind spots

- **Performance:** All commands are on-demand. Config load is one small YAML read. The `@gogol/*` import guard scans `packages/forge` source — a bounded file set, not `apps/**`. ✓
- **False positives:** The `@gogol/*` guard explicitly addresses comment mentions (line 210): "The check parses import/require specifiers only, not raw text." Verified: all `@gogol/` mentions in current `packages/forge/src/` are in MODULE_CONTRACT comments, not actual imports. ✓
- **Edge cases:** Considers existing hand-written `AGENTS.md` (won't overwrite — edit guard), idempotent init (existing `forge.yaml` → exit 0, report skipped), and invalid `forge.yaml` (zod issue list). ✓
- **Migration path:** Existing projects comply by running `forge.init`. The WGogol monorepo's hand-written `AGENTS.md` is explicitly protected (line 193). ✓
- **Security/privacy:** N/A — no user data, PII, or external services.
- **Deletion blast radius:** The RFC does not enumerate the 6 live import sites within site-kernel that reference `packages/os/site-kernel/src/rfc/` (see Axis A). The implementer will discover them but the RFC should have listed them to enable accurate planning.

## Questions for the author

1. The file system responsibilities table references `packages/os/site-kernel/src/workspace/workspace-write-boundary.ts` — this file does not exist. What file did you intend? Should the table instead list the 6 actual importers of `packages/os/site-kernel/src/rfc/` (`adr/handlers/validate.ts`, `cache/rfc-cache.ts`, `tests/rfc-acceptance.test.ts`, `tests/rfc-create.test.ts`, `tests/rfc-validate.test.ts`)?
2. Does `docs/technology.xml` need a `forge.yaml` entry under the Compass sync duties, or is `forge.yaml` intentionally outside the Compass semantic layer?
3. The `forge.doctor` handler already checks for `forge.yaml` (as a `warn`), but the Problem section says "No `forge.yaml`" — should the problem statement be refined to "init does not create `forge.yaml`" rather than implying the entire ecosystem lacks awareness of it?
