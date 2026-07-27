---
rfcId: RFC-0378
auditId: AUDIT-RFC-0378-01
date: 2026-07-12
auditor:
  skill: wg-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0378

## Verdict: Needs revision

The RFC is architecturally sound and addresses a real gap — the command surface is structurally coupled to `apps/` and would break when RFC-0381 removes it. However, three findings require revision before implementation: the user-facing pipeline names (`apps-check.run` etc.) are not addressed despite renaming internal constants, Compass XML synchronization duties are not identified, and two `packagesImpacted` entries are not justified by the file system responsibilities table.

## Mechanical validation (rfc.validate)

Pass — `pnpm exec site-kernel run rfc.validate RFC-0378 --json` returns zero violations.

## Axis A — Structural completeness

No issues. All sections contain real content. The Decision is a single present-tense statement ("The kernel gains a site workspace resolver…"). CLI surface shows exact `pnpm exec site-kernel run` invocations with `--site` and `--all` flags. TypeScript contracts are minimal type signatures (`SiteWorkspace`, `resolveSiteWorkspace`, `discoverSiteWorkspaces`). File system responsibilities table names concrete paths. Output format documents the `--json` shape for `fleet.sites.generate`. Failure modes specify exit codes and behavior for unknown id, dual representation, registry unreadable, and drift. Rollout describes a 5-step sequence with default behavior and new-app compliance. Alternatives considered has four real alternatives with rejection reasons. Risks include agent misinterpretation risk (stale `--app` memories). Acceptance criteria are checkable and cover the full scope. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-44, DNA-45]` are both real DNA invariants in `docs/architecture-dna.md`.

- **DNA-44 (Sternsystem bundle contract):** The RFC body explains that "the resolver is the missing runtime half of the bundle contract: a Sternsystem is addressable as a working site only through a materialized mission." This is a genuine extension — the resolver provides the runtime addressing layer that makes DNA-44's end state ("sites are materialized into `missions/`") operationally reachable.
- **DNA-45 (Fleet registry):** The RFC body explains that "`systems/registry.yaml` becomes the authoritative input for site resolution and fleet projection; `fleet.sites.yaml` is demoted from hand-authored source of truth to generated projection." This extends DNA-45 by making the registry the input for a new generation command.

`related[]` DNA references (DNA-46, DNA-47) are relevant — the resolver consumes `currentMission` (DNA-46) and the RFC-0356 workpiece layout (DNA-47) without redefining them. The RFC does not conflict with any existing DNA invariant. The transitional `apps/` source in the resolver is consistent with DNA-44's end-state language ("after the Werkstatt migration completes").

## Axis C — Ecosystem fit

**Finding C-1: Compass XML sync not identified.** The RFC changes workspace topology (`pnpm-workspace.yaml` gains `missions/*/workpiece`), command surface (`--app` → `--site`, `apps list` → `sites list`), and fleet projection (`fleet.sites.yaml` becomes generated). Root `AGENTS.md` Compass document duties require synchronizing `docs/*.xml` files when repository-wide requirements, shared package contracts, or app-package relationships change. The RFC does not identify which `docs/*.xml` files need updates (`docs/technology.xml` for workspace topology, `docs/development-plan.xml` for workflow, `docs/source-markup.xml` for the new resolver source file, `docs/knowledge-graph.xml` for package relationships).

**Finding C-2: AGENTS.md update targets underspecified.** The rollout says "Update root and nested `AGENTS.md` command examples in the same change" but does not name which nested `AGENTS.md` files. Given that `apps/AGENTS.md` contains command examples with `--app` flags and `packages/AGENTS.md` may reference pipeline names, the RFC should name the specific files.

**Finding C-3: User-facing pipeline names not addressed.** The RFC renames `APPS_*_PIPELINE` TypeScript constants to `SITES_*_PIPELINE` but does not address whether the user-facing pipeline names (`apps-check.run`, `apps-check.author`, `apps-check.postbuild`) are also renamed. These names are exposed via `site-kernel pipeline <name>` and appear in `docs/ecosystem.generated.json` and `docs/COMMANDS.md`. If they are renamed, this is a breaking change that must be documented; if not, the internal constant rename creates a naming mismatch between code and user-facing surface.

No other issues. Package boundaries are correct (resolver in `@gogol/site-kernel`, no new package). Cosmic naming is N/A. Command lifecycle buckets are internally consistent — `fleet.sites.generate` is correctly listed under `proposed`, and the four `changed` commands are existing registered commands.

## Axis D — Forward-only compliance

No issues. The RFC is explicitly forward-only: `--app` is removed in the same change with no alias period; `discoverKernelApps` is replaced and the old function deleted; no compatibility shim or dual-path is introduced. The resolver's support for both `apps/<id>` and `missions/<missionId>/workpiece/` is not a compatibility layer — it is a single resolution mechanism with a defined order, and the `apps/` source naturally returns no results after RFC-0381 removes `apps/`. The non-goal "Does not introduce an --app alias or any dual-flag transition period" is explicit.

## Axis E — Agent-facing policy

**Finding E-1: RFC-0230 not referenced.** The RFC touches the agent surface (renaming `--app` to `--site`, `apps list` to `sites list`, pipeline constant names), which is an agent-facing surface change. The implementation notes reference RFC-0224 (accepted→implemented transition), RFC-0330 (verification evidence), and RFC-0334 (supersede escalation), but do not reference RFC-0230 (agent surface changes). The implementation notes should include RFC-0230 guidance.

No other issues. The RFC is `status: draft` and contains no self-authorizing language. No content authoring in acceptance criteria. No cookies or client-side persistence touched.

## Axis F — Pragmatism

**Finding F-1: `@gogol/site-kernel-handoff` in `packagesImpacted` is not justified.** No file in `packages/os/site-kernel-handoff/` is listed in the file system responsibilities table or identified elsewhere in the RFC body. The existing fleet commands (`fleet.plan.generate`, `fleet.status.generate`) live in `packages/os/site-kernel-checks/src/fleet-leitstand.ts`, and `fleet.sites.generate` would likely live there too. The RFC should either remove `@gogol/site-kernel-handoff` from `packagesImpacted` or explain what changes in that package.

**Finding F-2: `@gogol/forge` in `packagesImpacted` may be premature.** RFC-0374 (forge extraction) is `accepted` but not yet `implemented`. If RFC-0378 is implemented before RFC-0374, `@gogol/forge` does not exist as a package. Furthermore, forge commands are workspace-scoped governance commands (`rfc.*`, `naming.*`, `compass.*`, etc.) that do not take `--app` flags, so they may not need any changes. The RFC should note the dependency on RFC-0374's implementation order or explain what specifically changes in forge.

No other issues. `fleet.sites.generate` earns its existence as a separate command (conflating site-list generation with plan/status generation would mix concerns). TypeScript contracts are minimal. `appsImpacted: [apps/webgogol-com]` is correct (only remaining app). `nonGoals` are explicit and meaningful.

## Axis G — Blind spots

**Finding G-1: Dual-representation window duration not estimated.** During RFC-0381's extraction sequence, there is a period where both `apps/<id>` and `missions/<currentMission>/workpiece/` exist simultaneously. The resolver throws a `dual-representation` error in this state, which blocks all app-scoped commands (`build.check`, `page.block.validate`, etc.). The RFC says "The error is the designed behavior" but does not estimate how long this window lasts or which commands are blocked. An agent executing RFC-0381's step sequence needs to know that commands will fail between "extract" and "remove apps/" steps.

**Finding G-2: Multiple concurrent workpieces in pnpm workspace.** DNA-46 allows one open mission per Sternsystem, meaning multiple Sternsystems can have open missions simultaneously. Each materialized workpiece under `missions/*/workpiece/` with a `package.json` would match the `missions/*/workpiece` glob and become a pnpm workspace member. The RFC does not address the impact on `pnpm install` time and lockfile size when multiple workpieces are active. While the pilot has only one Sternsystem, the RFC should acknowledge this scaling behavior.

No other issues. Performance of the resolver is fine (registry YAML parse + filesystem stat). Edge cases for empty states (empty registry → fall back to `apps/`) and concurrent execution (read-only resolver) are handled. Migration path is documented (additive, no behavior change while all sites live in `apps/`). Security/privacy is N/A.

## Questions for the author

1. Are the user-facing pipeline names `apps-check.run`, `apps-check.author`, and `apps-check.postbuild` renamed to `sites-check.run` etc. as part of the `APPS_*` → `SITES_*` constant rename? If yes, document the breaking change and update `docs/ecosystem.generated.json` and `docs/COMMANDS.md` regeneration in the rollout. If no, explain why the internal constants are renamed but the user-facing names are not.
2. Which `docs/*.xml` Compass files need synchronization for the workspace topology change (`missions/*/workpiece` glob) and the command surface change (`--app` → `--site`)? Root `AGENTS.md` Compass document duties require this to be called out explicitly.
3. What changes in `@gogol/site-kernel-handoff` and `@gogol/forge`? No files in those packages are named in the file system responsibilities table. If `@gogol/forge` depends on RFC-0374 being implemented first, note the implementation-order dependency.
