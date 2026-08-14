---
id: RFC-0854
title: "Standardize the ecosystem on Node 24"
status: draft
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-14
updatedAt: 2026-08-14
enhancedAt: 2026-08-14
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0779
  - RFC-0849
dependsOn: []
satisfies: []
versionBump: major
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/forge"
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
  - "@warpgogol/werkstatt-game"
  - "@warpgogol/werkstatt-video"
successSignals:
  - "The monorepo, published Forge package, deployable Node services, and every generated workshop/site contract accept Node 24 and reject Node 18, 20, 22, 25, and later majors."
  - "All first-party TypeScript environments use Node 24 declarations, so compile-time APIs cannot silently outrun the production runtime."
  - "CI, Docker images, Forge profiles, onboarding templates, skills, and operator documentation name the same Node 24 runtime with no legacy compatibility matrix or fallback."
  - "A newly scaffolded workshop and a newly onboarded site fail installation outside Node 24 before build or deployment work begins."
nonGoals:
  - "This RFC does not support Node 22 during a grace period, add a multi-version CI matrix, auto-download a fallback runtime, or promise compatibility with Node 25/26."
  - "This RFC does not change historical RFCs/audits/plans or test-fixture strings whose purpose is to exercise version-agnostic Docker/workspace discovery."
  - "This RFC does not rewrite third-party package engine metadata in pnpm-lock.yaml; only normal lockfile resolution changes caused by first-party @types/node updates are permitted."
  - "This RFC does not upgrade pnpm, TypeScript, GitHub actions unrelated to the runtime cut, application dependencies, or deployment behavior."
acceptance:
  - probe: file-contains
    path: "package.json"
    pattern: '"node": ">=24 <25"'
  - probe: file-contains
    path: "packages/forge/package.json"
    pattern: '"node": ">=24 <25"'
  - probe: file-contains
    path: "packages/werkstatt/src/workshop/templates.ts"
    pattern: 'node-version: "24"'
  - probe: file-contains
    path: "packages/werkstatt-site/src/onboarding/templates/package.template.json"
    pattern: '"node": ">=24 <25"'
---

# RFC-0854: Standardize the ecosystem on Node 24

## Context

RFC-0849's canonical-identity audit exposed a runtime claim that the repository could not prove: the root manifest still advertises Node `>=22`, while every current GitHub workflow already executes Node 24. Further inspection found the same stale lower bound in all Forge stack profiles and the site onboarding package template, Node 22 in `workshop.scaffold` output and two service images, Node 18 in the Editframe prerequisite, and Node 20 support in the published Forge manifest. At the same time, first-party packages compile against `@types/node` 26, which can admit APIs unavailable in the actual Node 24 runtime.

The operator explicitly chose a clean Node 24 cutover with no legacy consumers. RFC-0849 therefore treats Node 24 as its only runtime for frozen RFC 8785 vectors, but runtime support is a wider ecosystem policy and cannot be hidden inside a fingerprint implementation RFC. This RFC owns that prerequisite cut across the monorepo, published Forge package, generated workshops, onboarding output, services, skills, and documentation.

## Problem

The current declarations describe at least four incompatible realities:

- root installation claims Node 22 and later, including untested future majors;
- the published `@warpgogol/forge` package claims Node 20 and later;
- generated workshops and sites claim Node 22 while their CI runs Node 24;
- TypeScript checks use Node 26 declarations while deployment and CI run Node 24.

This drift lets an agent install or scaffold successfully under a runtime that the project does not test, lets Node 26-only APIs compile against a Node 24 target, and makes permanent byte-vector evidence ambiguous. Documentation-only alignment is insufficient: the package manager and generated projects must fail early outside the one supported major.

## Decision

Node 24 is the sole supported Node.js major for Werkstatt, all first-party packages/services, the published Forge CLI, and every newly generated workshop or Sternsystem package. The canonical engine range is exactly `>=24 <25`; `>=24` is forbidden because it silently promises untested future majors. CI and Docker select major `24`.

All first-party `@types/node` direct dependencies move to the Node 24 line. The root and generated pnpm workspaces enable `engineStrict: true` so dependency selection is also checked against Node 24. Project manifests remain the fail-fast authority for the running runtime: pnpm must refuse an install when the current process does not satisfy `>=24 <25`.

There is no Node 22 compatibility branch, fallback, warning mode, version-manager download, conditional CI path, or transitional range. A future Node major requires a separate RFC that updates the range, types, CI/images, generated artifacts, conformance vectors, and evidence together.

## Architectural fit

### RFC-0779 — generated workshops inherit the runtime contract

`workshop.scaffold` and every Forge stack profile are product surfaces, not examples. They must generate the same Node range and Node 24 CI used by this repository. Site onboarding must also emit a Node 24-only package because Sternsystem workpieces install independently.

### RFC-0849 — deterministic canonical vectors

RFC-0849 depends on this RFC and proves canonical JSON bytes on Node 24 against independent RFC 8785 vectors. It does not claim cross-major compatibility. A later runtime-major transition must reproduce every frozen byte before acceptance and introduce a new canonical format only if reproduction fails.

### Published Forge boundary

`@warpgogol/forge` is independently versioned and cross-platform, but cross-platform means Windows/Linux portability on the supported Node major, not indefinite support for old Node majors. Dropping Node 20/22 is a breaking package contract and requires the major version bump declared here. Publication remains operator-triggered under the publication policy.

## Design

### CLI surface

No command is added or changed. Existing package-manager, scaffold, validation, and test surfaces verify the cut:

```sh
pnpm install --frozen-lockfile
pnpm --filter @warpgogol/forge test
pnpm --filter @warpgogol/forge build:check
pnpm --filter @warpgogol/werkstatt test
pnpm --filter @warpgogol/werkstatt build:check
pnpm --filter @warpgogol/werkstatt-site test
pnpm --filter @warpgogol/werkstatt-site build:check
pnpm exec werkstatt run forge.profile.validate --json
pnpm exec werkstatt run rfc.acceptance.run --id RFC-0854
```

Implementation verification must parse every declared range with the existing semver dependency and prove that representative Node 18/20/22/25/26 versions do not satisfy it while supported Node 24 versions do. CI runs the positive install on Node 24. The project does not provision an obsolete runtime merely to prove that the closed range excludes it.

### Runtime contract

| Surface | Required value/behavior |
|---|---|
| First-party and generated `package.json#engines.node` | `>=24 <25` |
| First-party direct `@types/node` | Node 24 major |
| GitHub `actions/setup-node` input | `"24"` |
| First-party Node Docker base | `node:24-slim` or a stricter Node 24 digest pin |
| Forge/Editframe prerequisite | name Node 24 and fail if `process.versions.node` major is not 24 |
| `pnpm-workspace.yaml` | `engineStrict: true` |
| Unsupported runtime | fail before install/build; never warn and continue |

The semver range is intentionally major-closed. Patch/minor selection within Node 24 may advance normally, but CI evidence records `process.version`. Canonical byte-vector evidence in RFC-0849 also records the exact Node version that produced it.

### File system responsibilities

| Path | Responsibility |
|---|---|
| `package.json` | Root `>=24 <25` runtime and Node 24 type dependency |
| `pnpm-workspace.yaml` | Enable dependency engine enforcement |
| `packages/forge/package.json` | Published Node 24-only engine and Node 24 types |
| `packages/werkstatt/package.json`, `packages/werkstatt-game/package.json`, `packages/werkstatt-video/package.json` | Align direct Node type declarations |
| `packages/forge/profiles/*.yaml` | Generate Node 24-only manifests/workspaces; Editframe enforces the prerequisite |
| `packages/forge/README.md`, `packages/forge/README.uk.md` | Node 24 installation and troubleshooting instructions |
| `packages/forge/skills/fo/ef-onboard/SKILL.md` | Require and verify Node 24, not Node 18+ |
| `packages/werkstatt/src/workshop/templates.ts` | Generate Node 24 CI, manifest, workspace enforcement, and README prerequisites |
| `packages/werkstatt/src/workshop/workshop-scaffold.test.ts` | Exact generated runtime assertions and negative old-runtime text assertions |
| `packages/werkstatt-site/src/onboarding/templates/package.template.json` | Emit `>=24 <25` plus Node 24 types |
| `packages/werkstatt-site/src/onboarding/templates/runtime/github-deploy.template.yaml` | Retain exact Node 24 CI and add/retain regression coverage |
| `services/cf-analytics-poller/Dockerfile`, `services/fleet-probe-runner/Dockerfile` | Run Node 24 images |
| `packages/forge/src/tests/{stack-profile,editframe-profile,scaffold-project}.test.ts` | Prove every profile emits and enforces Node 24 |
| `packages/werkstatt-site/src/checks/tests/template-deps-drift.test.ts` | Prove onboarding runtime/type alignment |
| `AGENTS.md`, `packages/forge/AGENTS.md`, `docs/policies/linux-tooling.md` | Record the single-major agent/tooling policy |
| `pnpm-lock.yaml` | Normal resolver output for Node 24 type packages only; never hand-edit dependency engine metadata |

Historical documents and deliberate discovery fixtures containing older Node strings remain untouched. Verification classifies every retained match by purpose rather than performing a blind repository-wide replacement.

### Failure contract

| Condition | Required result |
|---|---|
| Running Node major is below 24 or above 24 | install/scaffold verification fails with expected `>=24 <25` and observed version |
| A profile/template emits another range | owning package test fails |
| A first-party package compiles against non-24 Node types | dependency-drift assertion fails |
| A deployable service uses a non-24 Node image | source-boundary assertion fails |
| A dependency does not support Node 24 | `engineStrict` install fails; dependency is replaced or separately decided, never bypassed |
| A future Node major is proposed | new RFC and full runtime/vector validation are required |

Failures do not edit a version manager, download Node, relax the range, set ignore flags, or continue with a warning. Error text never prints registry credentials or environment contents.

## Rollout

1. Change the root and published package runtime/type declarations, enable workspace engine enforcement, regenerate the lockfile under Node 24, and prove root install/build/test health.
2. Update all Forge profiles, Editframe prerequisite, Forge docs/skill, and profile/scaffold tests; generated projects must contain `>=24 <25`, Node 24 CI, and workspace enforcement.
3. Update `workshop.scaffold` templates/tests and the site onboarding manifest/tests. Do not hand-edit generated downstream artifacts; regenerate only disposable test fixtures through their owning commands.
4. Move both deployable Node service images to Node 24 and run their scoped build/tests or image smoke checks.
5. Run the classified old-version search, closed-range conformance tests, complete affected-package validation, Compass/doc audit, and RFC verification.

The cut is atomic and forward-only. The repository may remain unavailable during the implementation session, as approved for the certification transition, but no landed final state may advertise or execute Node 18/20/22 support.

## Alternatives considered

### Keep `>=22` and test Node 22/24

Rejected by the operator: there are no legacy consumers worth a compatibility matrix, and maintaining two majors weakens deterministic runtime evidence.

### Use `>=24`

Rejected: it silently treats Node 25/26 as supported without CI, type, image, or canonical-vector evidence.

### Change CI only

Rejected: CI is already Node 24. Stale manifests, types, Docker images, generated projects, and documentation would continue to authorize incompatible runtimes.

### Rely only on `engines` warnings

Rejected: the transition must fail before work starts. Project engine mismatch and pnpm workspace engine enforcement provide a deterministic blocking boundary.

### Rewrite every old Node string

Rejected: archived documents are immutable history, dependency metadata is third-party evidence, and discovery tests intentionally parse arbitrary versions. Only current first-party support declarations change.

## Risks

- **Published Forge break:** intentional major change; mitigate with exact engine metadata, Node 24 CI, tarball smoke tests, and operator-triggered publication only.
- **Type/runtime mismatch:** mitigated by aligning every direct `@types/node` dependency to major 24 and compiling all affected packages.
- **Hidden generated drift:** mitigated by testing each owning profile/template instead of editing generated output alone.
- **Over-broad search-and-replace:** mitigated by the explicit file map, removal discipline, and classified retained-match report.
- **Dependency incompatibility under engineStrict:** fail closed and replace/decide the dependency; do not disable enforcement.
- **Agent interpretation:** Node 24 means `>=24 <25`, not `>=24`, `24+`, an old-major fallback, or a version-manager auto-download.

## Acceptance criteria

- [ ] Root, published Forge, all generated manifests, and current operator docs/skills name only Node 24; the canonical manifest range is exactly `>=24 <25`.
- [ ] Root and generated pnpm workspaces enforce dependency engines; exact-range tests reject representative Node 18/20/22/25/26 versions and accept Node 24 without provisioning another runtime.
- [ ] Every first-party direct `@types/node` dependency uses major 24 and all affected TypeScript packages compile under Node 24.
- [ ] Every current GitHub workflow/template uses `actions/setup-node@v5` with Node 24; touched workshop output contains no checkout/setup-node v4 runtime action.
- [ ] Both deployable Node service Dockerfiles use Node 24 and their scoped validation passes.
- [ ] All four Forge profiles and `workshop.scaffold` emit Node 24-only manifests; Editframe's executable prerequisite rejects other majors.
- [ ] Site onboarding emits a Node 24-only package and retains Node 24 deployment CI; template dependency tests pass.
- [ ] A classified search finds no active first-party Node 18/20/22 support declaration outside historical docs, deliberate discovery fixtures, or explanatory text that rejects those runtimes.
- [ ] Forge, Werkstatt, and Werkstatt-site tests/build checks plus profile validation pass under Node 24.
- [ ] `AGENTS.md`, `packages/forge/AGENTS.md`, `docs/policies/linux-tooling.md`, and relevant Compass files describe the one-major policy; generated ecosystem docs are regenerated only through their owner if affected.
- [ ] `rfc.acceptance.run --id RFC-0854`, `rfc.verification.emit --id RFC-0854`, and `rfc.validate --id RFC-0854 --json` pass before implementation stamping.

## Implementation notes for agents

- Implement only after `status: accepted`; this draft grants no code authority.
- Treat this as one atomic runtime cut. Do not leave root, Forge, profiles, onboarding, services, types, or docs on different supported majors at the end of the session.
- Use `>=24 <25` exactly. Do not substitute `>=24`, `^24`, `24+`, a warning-only check, a Node 22 fallback, or runtime auto-download.
- Update template/profile owners first and prove their rendered output. Do not patch generated consumer files as a substitute for changing the owner.
- Align first-party `@types/node` to major 24 and regenerate `pnpm-lock.yaml` with pnpm. Never hand-edit third-party `engines` entries in the lockfile.
- Do not edit archived RFCs/plans/audits or change Node-version strings in discovery tests unless the test semantically asserts current support.
- Do not trigger npm publication. Follow `docs/authoring/publication-runbook.md` only after an explicit operator publication command.
- Read current pnpm 11 engine documentation before implementation; project settings belong in `pnpm-workspace.yaml`, while `.npmrc` remains authentication-only and must not be printed or copied.
- Update root/package docs and Compass surfaces through their owners; run `ecosystem.manifest.generate` only if its generated projection actually consumes a changed registry/source.
- Follow RFC-0230 for agent-facing surfaces, RFC-0330 for verification evidence, RFC-0334 for invariant escalation, and RFC-0476 for stamping.
- Before stamping, attach line-accurate evidence, run `rfc.verification.emit --id RFC-0854`, then `rfc.implement.stamp --id RFC-0854 --dry-run` and commit through the canonical flow.
