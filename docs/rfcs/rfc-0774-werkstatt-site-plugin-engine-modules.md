---
id: RFC-0774
title: "Werkstatt site plugin engine modules"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-09
updatedAt: 2026-08-09
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0769
  - RFC-0770
  - RFC-0771
  - RFC-0775
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-3
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted: []
successSignals:
  - "werkstatt-site registers via the plugin contract and werkstatt.plugin.validate passes"
  - "mission.materialize / leitstand.dev-deploy / release.prepare run end-to-end through plugin hooks for warpgogol-com"
nonGoals:
  - "No domain packages (ui, pbp, ontology, ...) — that is RFC-0775"
  - "No workshop migration — RFC-0776"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0774: Werkstatt site plugin engine modules

## Context

With the engine consolidated (RFC-0772), the Astro-stack engine modules need a home implementing the plugin contract (RFC-0770). This RFC composes the **engine half** of `@warpgogol/werkstatt-site` in `packages/werkstatt-site`; the domain half (ui, pbp, ...) is RFC-0775. Together they form one npm package.

## Problem

The site-stack modules (`site-kernel-astro`, `site-kernel-checks`, `site-kernel-codegen`, `site-kernel-content`, `site-kernel-onboarding`, `site-kernel-audit`, Cloudflare deploy adapter, changelog renderers) currently register directly in `tools/kernel.config.ts` and are imported statically by the engine. After RFC-0772 severs those imports, this functionality must re-enter the system exclusively through the plugin contract — otherwise the site workshop loses validation, codegen, onboarding, and deploy.

## Decision

`packages/werkstatt-site` (npm: `@warpgogol/werkstatt-site`) is created with `profileId: "astro-typescript-turborepo"` and absorbs the site-stack engine modules:

| Plugin module | Source today | Plugin contract slot |
| --- | --- | --- |
| `paths/` | `site-kernel-astro` | `paths: StackPathConventions` |
| `checks/` | `site-kernel-checks` | `moduleLoaders` (validators), `hooks.checkGate` (Axiom via mission.check) |
| `codegen/` | `site-kernel-codegen` | `moduleLoaders`, `hooks.materialize` (runGenerate* sequence) |
| `content/` | `site-kernel-content` | `moduleLoaders` (collections, system.md) |
| `onboarding/` | `site-kernel-onboarding` | `hooks.scaffoldProject`, templates |
| `audit/` | `site-kernel-audit` | `moduleLoaders` |
| `deploy/cloudflare-workers/` | `site-kernel-handoff` adapter + `site-kernel-deploy` site parts | `deployAdapters["cloudflare-workers"]` |
| `changelog/` | `site-kernel-changelog` renderers | `moduleLoaders` |
| `build/` | astro build invocation from leitstand/mission | `hooks.build` |
| `release-evidence/` | behavior snapshot generation | `hooks.releaseEvidence` |

Internal structure keeps today's module boundaries as folders; all site validators, pipelines (`build.prepare`, `build.check` site steps), and the surface machinery register through `moduleLoaders`/`pipelines`.

## Architectural fit

- **DNA-3 (Astro as site framework)** — the invariant's implementation home becomes the site plugin.
- **DNA-5, 7..17 (site content/structure contracts)** — their validators travel inside `checks/`; semantics unchanged.
- **DNA-64** — the plugin is the first full implementer of the contract; site logic re-enters exclusively through it.

## Design

### Plugin entry point

```ts
// @warpgogol/werkstatt-site
import type { WerkstattPlugin } from "@warpgogol/werkstatt/plugin";

export const werkstattSitePlugin: WerkstattPlugin = {
  schema: "werkstatt/plugin@1",
  id: "werkstatt-site",
  profileId: "astro-typescript-turborepo",
  paths: astroPathConventions,          // from paths/
  moduleLoaders: { /* checks, codegen, content, onboarding, audit, changelog */ },
  pipelines: { "build.prepare": [...], "build.check": [...] },
  deployAdapters: { "cloudflare-workers": createCloudflareWorkersAdapter },
  hooks: { materialize, build, checkGate, releaseEvidence, scaffoldProject },
};
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/{paths,checks,codegen,content,onboarding,audit,deploy,changelog,build,release-evidence}/` | Consolidated site engine modules |
| `packages/werkstatt-site/extract.config.yaml` | RFC-0773 publication |
| old `packages/os/site-kernel-{astro,checks,codegen,content,onboarding,audit,deploy,changelog}` | Deleted after move |

### Failure modes

Module behavior is unchanged; failure modes stay as defined by each validator/command. The plugin adds one new failure surface: hook errors are reported by the engine with the hook name and plugin id (e.g. `[werkstatt-site:checkGate] ...`).

## Rollout

- Implemented immediately after RFC-0772 phase 6, in the same wave as RFC-0775; the site workshop switches to the plugin in RFC-0776.
- During this RFC's implementation window the workshop's `tools/kernel.config.ts` still references old module paths; the switch is atomic in RFC-0776.

## Alternatives considered

- **Keeping checks/codegen as separate npm packages.** Rejected: operator decision — one plugin package per stack.
- **Splitting the plugin into engine-half and domain-half packages.** Rejected: two RFCs (0774/0775) for review clarity, but one published package — consumers install one thing.

## Risks

- **`site-kernel-checks` is the largest os package** (command tables, surface machinery, Axiom adapter). The move must preserve command ids — mission workpieces and scripts reference them by name (`mission.check`, `surface.generate`, ...). Command ids are contract: they do not change in this program.
- **Cross-imports between checks and codegen** (both directions today) become intra-package imports — simpler, but the consolidation must not create cycles with the engine package.

## Acceptance criteria

- [ ] `packages/werkstatt-site` exists with the module layout above and `profileId: "astro-typescript-turborepo"`
- [ ] All site kernel commands keep their existing ids and behavior (test suites pass unchanged)
- [ ] Plugin registers via `WerkstattPlugin` and passes `werkstatt.plugin.validate`
- [ ] Cloudflare Workers deploy adapter works through `deployAdapters` (leitstand dev-deploy → promote cycle green on warpgogol-com)
- [ ] Old site-kernel stack packages deleted
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run
  `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file
  in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run
  `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"`
  instead of working around it (RFC-0334).
-->
