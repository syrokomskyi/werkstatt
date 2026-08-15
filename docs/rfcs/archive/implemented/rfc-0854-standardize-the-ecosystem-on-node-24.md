---
id: RFC-0854
title: "Standardize the ecosystem on Node 24"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-14
updatedAt: 2026-08-15
enhancedAt: 2026-08-14
implementedAt: 2026-08-15
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0543
  - RFC-0704
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
  - "The current warpgogol-com Sternsystem is migrated through a mission, rebuilt, and republished under Node 24; no active first-party site remains on the Node 22/Node 26 declarations."
  - "The independently versioned Forge package records the breaking boundary as 1.0.0 and passes a standalone Node 24 tarball smoke test without being published automatically."
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
    path: "packages/forge/package.json"
    pattern: '"version": "1.0.0"'
  - probe: file-contains
    path: "forge.yaml"
    pattern: 'syncedVersion: 1.0.0'
  - probe: file-contains
    path: "packages/werkstatt/src/workshop/templates.ts"
    pattern: 'node-version: "24"'
  - probe: file-contains
    path: "packages/werkstatt-site/src/onboarding/templates/package.template.json"
    pattern: '"node": ">=24 <25"'
---

# RFC-0854: Standardize the ecosystem on Node 24

## Context

RFC-0849's canonical-identity audit exposed a runtime claim that the repository could not prove: the root manifest still advertises Node `>=22`, while every current GitHub workflow already executes Node 24. Further inspection found the same stale lower bound in all Forge stack profiles and the site onboarding package template, Node 22 in `workshop.scaffold` output and two service images, Node 18 in the Editframe prerequisite, and Node 20 support in the published Forge manifest. At the same time, first-party packages compile against `@types/node` 26, which can admit APIs unavailable in the actual Node 24 runtime. The sole active Sternsystem, `warpgogol-com`, also declares `engines.node: ">=22"` and `@types/node: "^26.1.0"`.

The implementation environment is part of the cutover problem. On 2026-08-14 the repository session resolved `/usr/bin/node` as `v22.22.1`, the Ubuntu package repository offered no Node 24 candidate, and no project version manager was installed. Enabling the new engine gates before replacing that runtime would strand the implementing agent halfway through the transition.

The operator explicitly chose a clean Node 24 cutover with no legacy consumers. RFC-0849 therefore treats Node 24 as its only runtime for frozen RFC 8785 vectors, but runtime support is a wider ecosystem policy and cannot be hidden inside a fingerprint implementation RFC. This RFC owns that prerequisite cut across the monorepo, published Forge package, generated workshops, onboarding output, services, skills, and documentation.

## Problem

The current declarations describe at least four incompatible realities:

- root installation claims Node 22 and later, including untested future majors;
- the published `@warpgogol/forge` package claims Node 20 and later;
- generated workshops and sites claim Node 22 while their CI runs Node 24;
- TypeScript checks use Node 26 declarations while deployment and CI run Node 24.

This drift lets an agent install or scaffold successfully under a runtime that the project does not test, lets Node 26-only APIs compile against a Node 24 target, and makes permanent byte-vector evidence ambiguous. Documentation-only alignment is insufficient: the package manager and generated projects must fail early outside the one supported major.

## Decision

Node 24 is the sole supported Node.js major for Werkstatt, all first-party packages/services, the published Forge CLI, every newly generated workshop or Sternsystem package, and the current `warpgogol-com` Sternsystem. The canonical engine range is exactly `>=24 <25`; `>=24` is forbidden because it silently promises untested future majors. CI and Docker select major `24`.

All first-party `@types/node` direct dependencies move to the Node 24 line. The root and generated pnpm workspaces enable `engineStrict: true` so dependency selection is also checked against Node 24. Project manifests remain the fail-fast authority for the running runtime: pnpm must refuse an install when the current process does not satisfy `>=24 <25`.

There is no Node 22 compatibility branch, fallback, warning mode, version-manager download, conditional CI path, or transitional range. A future Node major requires a separate RFC that updates the range, types, CI/images, generated artifacts, conformance vectors, and evidence together.

Before any repository file is changed, the implementing agent explicitly provisions and activates Node 24 on the current host and proves that both Node and pnpm run beneath it. This operator-approved environment bootstrap is outside Werkstatt product behavior: the repository, Forge, generated projects, and their commands never install, select, or fall back to a runtime. If bootstrap or verification fails, implementation stops before mutation.

The independent Forge package moves from `0.28.0` to `1.0.0`, and the workshop's `forge.syncedVersion` watermark moves to `1.0.0` in the same implementation. This version change is distinct from the platform `versionBump: major`. Implementation includes a standalone tarball smoke test but never publishes the package; publication remains a later explicit operator operation.

## Architectural fit

### RFC-0543 and RFC-0704 — Forge publication and independent versioning

RFC-0543 makes `packages/forge/package.json#version` the published Forge version and `forge.yaml#forge.syncedVersion` the local skill-sync watermark. RFC-0704 excludes Forge-only changes from automatic platform bumps and explicitly leaves its package version manual. Therefore this RFC names both independent version mutations (`1.0.0`) while its frontmatter `versionBump: major` separately governs the Werkstatt platform commit. The tarball is verified during implementation; `pnpm publish` remains forbidden until a later explicit operator command.

### RFC-0779 — generated workshops inherit the runtime contract

`workshop.scaffold` and every Forge stack profile are product surfaces, not examples. They must generate the same Node range and Node 24 CI used by this repository. Site onboarding must also emit a Node 24-only package because Sternsystem workpieces install independently.

### RFC-0849 — deterministic canonical vectors

RFC-0849 depends on this RFC and proves canonical JSON bytes on Node 24 against independent RFC 8785 vectors. It does not claim cross-major compatibility. A later runtime-major transition must reproduce every frozen byte before acceptance and introduce a new canonical format only if reproduction fails.

### Published Forge boundary

`@warpgogol/forge` is independently versioned and cross-platform, but cross-platform means Windows/Linux portability on the supported Node major, not indefinite support for old Node majors. Dropping Node 20/22 is a breaking package contract and establishes `@warpgogol/forge@1.0.0`; it is not satisfied merely by the platform `versionBump` field. Publication remains operator-triggered under the publication policy.

### Current Sternsystem adoption

`warpgogol-com` is the only active site and is replaceable. It is migrated in this RFC through a normal mission workpiece after the template owners and platform packages are committed. The migration changes only `package.json#engines.node` and the direct `@types/node` line, preserves every site-specific script and dependency, validates the site under Node 24, commits/reconciles/closes through the mission commands, then republishes Alt and Main and runs post-deploy smoke checks. The cache clone is never edited directly, and `onboarding.scaffold` is not rerun over the existing site.

## Design

### Step-zero executor bootstrap

This preflight runs before `git add`, package mutation, lockfile generation, mission creation, or any other repository write:

```sh
node --version
node -p 'JSON.stringify({ execPath: process.execPath, version: process.version, major: Number(process.versions.node.split(".")[0]) })'
pnpm --version
```

The implementing agent must make the reported major exactly `24` and must make `pnpm --version` match the repository's `packageManager` declaration before continuing. On the current Ubuntu host, the stock apt candidate is Node 22, so selecting it again is not a valid bootstrap. The agent uses an official Node.js 24 distribution or an operator-approved package source, verifies the downloaded artifact using its publisher-provided checksum/signature, activates the resulting runtime, opens a fresh shell/process boundary, and reruns all three commands. `curl | sh`, an unverified archive, a repository-local vendored runtime, and a version shim committed to the project are forbidden.

Host package installation is the only permitted bootstrap mutation before the repository edit. If installation, integrity verification, activation, the Node-major check, or pnpm activation fails, the agent stops and confirms the repository and all mission trees remain clean. This does not create a Node 22 fallback: no Werkstatt or Forge command performs these steps for consumers.

### CLI surface

No command is added or changed. Existing package-manager, scaffold, validation, and test surfaces verify the cut:

```sh
pnpm install --lockfile-only
pnpm install --frozen-lockfile
pnpm --filter @warpgogol/forge test
pnpm --filter @warpgogol/forge build:check
pnpm --filter @warpgogol/forge test:tarball:node24
pnpm --filter @warpgogol/werkstatt test
pnpm --filter @warpgogol/werkstatt build:check
pnpm --filter @warpgogol/werkstatt-site test
pnpm --filter @warpgogol/werkstatt-site build:check
pnpm --filter @warpgogol/werkstatt-game test
pnpm --filter @warpgogol/werkstatt-game build:check
pnpm --filter @warpgogol/werkstatt-video test
pnpm --filter @warpgogol/werkstatt-video build:check
pnpm exec werkstatt run forge.profile.validate --json
pnpm exec werkstatt run forge.doctor --json
pnpm exec werkstatt run services.check.run
pnpm exec werkstatt run service.test.run --service fleet-probe-runner
pnpm exec werkstatt run service.test.run --service cf-analytics-poller
docker build --pull -t werkstatt-rfc0854-fleet-probe-runner services/fleet-probe-runner
docker run --rm werkstatt-rfc0854-fleet-probe-runner node -p 'process.versions.node.split(".")[0]'
docker build --pull -t werkstatt-rfc0854-cf-analytics-poller services/cf-analytics-poller
docker run --rm werkstatt-rfc0854-cf-analytics-poller node -p 'process.versions.node.split(".")[0]'
docker image rm werkstatt-rfc0854-fleet-probe-runner werkstatt-rfc0854-cf-analytics-poller
pnpm exec werkstatt run rfc.acceptance.run --id RFC-0854
```

Every command above is blocking. Lockfile-only regeneration is reviewed before the frozen install and may contain only ordinary first-party Node-type/importer resolution changes. `forge.doctor` may retain unrelated pre-existing warnings, but its `knowledge-files` result must not report `ef-onboard` or any Node-24-related skill drift and no doctor check may fail. Service test commands must return their canonical pass/declared-skip result rather than an invocation error. Before the first Docker build, the executor registers finally-style cleanup for only the two exact RFC-specific tags; each temporary service image must print major `24`, and cleanup runs after success, failure, or interruption recovery. Implementation verification must parse every declared range with the existing semver dependency and prove that representative Node 18/20/22/25/26 versions do not satisfy it while supported Node 24 versions do. CI runs the positive install on Node 24. The project does not provision an obsolete runtime merely to prove that the closed range excludes it.

### Forge package version and standalone smoke

`packages/forge/package.json#version` and `forge.yaml#forge.syncedVersion` both become `1.0.0`. The platform root receives its independent RFC-declared major bump through `ecosystem.commit`; one version must never be inferred from or substituted for the other.

The implementation adds a package-owned `test:tarball:node24` script and a minimal consumer under `packages/forge/test-fixtures/node24-consumer/`. The script builds and packs Forge into a fresh temporary directory, installs that tarball offline from the already populated pnpm store into a temporary copy of the fixture under the active Node 24 process, verifies the packed manifest contains `version: 1.0.0` and `engines.node: ">=24 <25"`, runs the installed `forge --version`, and exercises one standalone read-only command such as `forge doctor --json`. It supplies a temporary empty package-manager user-config path, strips authentication variables from child processes, and removes its temporary directory on success or failure. Existing project or user `.npmrc` files are never copied, printed, included in the tarball, or used to permit network access.

Negative engine coverage parses the packed manifest with the repository's semver library and rejects representative 18/20/22/25/26 versions. It does not install obsolete runtimes. The smoke script must not call `npm publish` or `pnpm publish`, mutate the source package manifest during cleanup, contact the npm registry, or depend on monorepo-only module resolution after installation. A missing offline dependency fails the smoke with its package name; it is not fetched implicitly.

### Existing-site mission and republish sequence

After the platform/template implementation commit succeeds, the agent executes the existing site transition as a second repository transaction. `<agent-id>` is the executor's real durable agent identity; `<mission-id>` is the exact id returned by `mission.open` and is reused verbatim:

```sh
pnpm exec werkstatt run mission.open --system warpgogol-com --brief "Adopt the Node 24-only runtime contract" --actor <agent-id>
pnpm exec werkstatt run mission.materialize --mission <mission-id>
```

Inside `missions/<mission-id>/workpiece/package.json`, the agent changes only `engines.node` to `>=24 <25` and direct `@types/node` to the Node 24 line after the canonical onboarding template has already been changed. This is the bounded existing-site adoption path for a generated package that has accumulated site-specific scripts/dependencies; rerunning `onboarding.scaffold`, replacing the whole manifest, or editing `../systems-cache/warpgogol-com` is forbidden. The root lockfile is regenerated from the active mission workspace under Node 24.

The blocking mission/site sequence is:

```sh
pnpm install --frozen-lockfile
pnpm exec werkstatt run sites-check.run --site warpgogol-com
pnpm exec werkstatt run app.contract.full --site warpgogol-com
pnpm --filter warpgogol-com run build
pnpm exec werkstatt run mission.git.commit --mission <mission-id> --message "chore: adopt Node 24 runtime"
git -C missions/<mission-id>/workpiece rev-parse HEAD
pnpm exec werkstatt run mission.reconcile --mission <mission-id> --message "Adopt Node 24 runtime" --actor <agent-id>
pnpm exec werkstatt run mission.close --mission <mission-id> --actor <agent-id>
pnpm --filter warpgogol-com run build:deploy:alt
pnpm exec werkstatt run site.smoke.run --site warpgogol-com --url https://alt.warpgogol.com --commit-sha <site-commit-sha> --release-id rfc-0854-node24-alt
pnpm exec werkstatt run test.evidence.verify --target warpgogol-com --levels L5 --commit-sha <site-commit-sha> --release-id rfc-0854-node24-alt
pnpm --filter warpgogol-com run build:deploy:main
pnpm exec werkstatt run site.smoke.run --site warpgogol-com --url https://warpgogol.com --commit-sha <site-commit-sha> --release-id rfc-0854-node24-main
pnpm exec werkstatt run test.evidence.verify --target warpgogol-com --levels L5 --commit-sha <site-commit-sha> --release-id rfc-0854-node24-main
```

The agent records the printed workpiece HEAD as `<site-commit-sha>` and uses it for both environment-specific L5 evidence records. `pnpm install --frozen-lockfile` is rerun after materialization so the site participates in the active workspace without changing dependency resolution. If materialization legitimately changes the lockfile membership, the agent first runs the ordinary pnpm lockfile regeneration under Node 24, reviews that diff, and then reruns the frozen install. Alt smoke and its evidence verification are hard prerequisites for Main republish. Any mission, deploy, smoke, or evidence-verification failure stops the sequence without claiming RFC completion; recovery uses the existing mission/deploy lifecycle rather than direct cache edits or a runtime fallback.

### Runtime contract

| Surface | Required value/behavior |
| --- | --- |
| First-party and generated `package.json#engines.node` | `>=24 <25` |
| First-party direct `@types/node` | Node 24 major |
| `@warpgogol/forge` independent version | `1.0.0`; `forge.syncedVersion` exactly matches |
| GitHub `actions/setup-node` input | `"24"` |
| First-party Node Docker base | `node:24-slim` or a stricter Node 24 digest pin |
| Forge/Editframe prerequisite | name Node 24 and fail if `process.versions.node` major is not 24 |
| `pnpm-workspace.yaml` | `engineStrict: true` |
| Unsupported runtime | fail before install/build; never warn and continue |
| Implementing executor before repository mutation | active Node major 24 and repository-declared pnpm version, or stop cleanly |

The semver range is intentionally major-closed. Patch/minor selection within Node 24 may advance normally, but CI evidence records `process.version`. Canonical byte-vector evidence in RFC-0849 also records the exact Node version that produced it.

### File system responsibilities

| Path | Responsibility |
| --- | --- |
| `package.json` | Root `>=24 <25` runtime and Node 24 type dependency |
| `pnpm-workspace.yaml` | Enable dependency engine enforcement |
| `packages/forge/package.json`, `forge.yaml` | Published Node 24-only engine/types, Forge `1.0.0`, matching sync watermark, and tarball smoke script |
| `packages/werkstatt/package.json`, `packages/werkstatt-game/package.json`, `packages/werkstatt-video/package.json` | Align direct Node type declarations |
| `packages/forge/profiles/*.yaml` | Generate Node 24-only manifests/workspaces; Editframe enforces the prerequisite |
| `packages/forge/README.md`, `packages/forge/README.uk.md` | Node 24 installation and troubleshooting instructions |
| `packages/forge/skills/fo/ef-onboard/SKILL.md`, `.agents/skills/ef-onboard/SKILL.md` | Require and verify Node 24 in canonical and synced skill copies |
| `packages/forge/test-fixtures/node24-consumer/**`, package-owned smoke source/tests | Prove the packed Forge `1.0.0` standalone boundary under Node 24 without publication or registry access |
| `packages/werkstatt/src/workshop/templates.ts` | Generate Node 24 CI, manifest, workspace enforcement, and README prerequisites |
| `packages/werkstatt/src/workshop/workshop-scaffold.test.ts` | Exact generated runtime assertions and negative old-runtime text assertions |
| `packages/werkstatt-site/src/onboarding/templates/package.template.json` | Emit `>=24 <25` plus Node 24 types |
| `packages/werkstatt-site/src/onboarding/templates/runtime/github-deploy.template.yaml` | Retain exact Node 24 CI and add/retain regression coverage |
| `services/cf-analytics-poller/Dockerfile`, `services/fleet-probe-runner/Dockerfile` | Run Node 24 images and pass exact temporary-image major checks |
| `packages/forge/src/tests/{stack-profile,editframe-profile,editframe-e2e,scaffold-project}.test.ts` | Prove every profile and executable doctor prerequisite emit and enforce Node 24 |
| `packages/werkstatt-site/src/checks/tests/template-deps-drift.test.ts` | Prove onboarding runtime/type alignment |
| `AGENTS.md`, `packages/AGENTS.md`, `packages/forge/AGENTS.md`, `services/AGENTS.md`, `docs/policies/linux-tooling.md` | Record the single-major agent, package, service-image, bootstrap, and Forge release policy |
| `docs/requirements.xml`, `docs/technology.xml`, `docs/development-plan.xml`, `docs/verification-plan.xml` | Record the durable fail-closed requirement, exact runtime, certification prerequisite, and exact verification matrix |
| `missions/<mission-id>/workpiece/package.json` | Bounded current-site adoption through mission lifecycle; never edit the cache clone directly |
| `pnpm-lock.yaml` | Normal resolver output for Node 24 type packages only; never hand-edit dependency engine metadata |

`docs/knowledge-graph.xml` is unchanged because no node or relationship is introduced; `docs/source-markup.xml` is unchanged because no source annotation contract changes; `docs/styling.xml` is unchanged because the cutover has no styling semantics. Historical documents and deliberate discovery fixtures containing older Node strings remain untouched. Verification classifies every retained match by purpose rather than performing a blind repository-wide replacement.

### Failure contract

| Condition | Required result |
| --- | --- |
| Executor still resolves a non-24 Node before file mutation | provision and re-verify Node 24; on any failure stop with all repository trees clean |
| Running Node major is below 24 or above 24 | install/scaffold verification fails with expected `>=24 <25` and observed version |
| A profile/template emits another range | owning package test fails |
| A first-party package compiles against non-24 Node types | dependency-drift assertion fails |
| A deployable service uses a non-24 Node image | source-boundary assertion fails |
| A dependency does not support Node 24 | `engineStrict` install fails; dependency is replaced or separately decided, never bypassed |
| A future Node major is proposed | new RFC and full runtime/vector validation are required |
| Forge package version and `forge.syncedVersion` differ | fail verification; neither value is inferred from the platform version |
| Packed Forge needs registry access or monorepo-only resolution | standalone smoke fails before any publication operation |
| Current-site mission, Alt deploy/smoke, or Main deploy/smoke fails | stop, preserve lifecycle evidence, and do not stamp the RFC; never edit the cache clone or relax Node policy |

After step-zero bootstrap, repository and product failures do not edit a version manager, download Node, relax the range, set ignore flags, or continue with a warning. Error text never prints registry credentials or environment contents. The bootstrap itself may change the host runtime only before repository mutation and must never print, read, copy, or rewrite `.npmrc`.

## Rollout

0. Before any repository write, explicitly provision and activate a verified Node 24 runtime on the executor, verify the repository-declared pnpm version, and stop cleanly if either check fails.
1. Change the root and published package runtime/type declarations, explicitly set Forge and its sync watermark to `1.0.0`, enable workspace engine enforcement, regenerate the lockfile under Node 24, and prove root install/build/test health.
2. Update all Forge profiles, Editframe prerequisite, Forge docs/canonical skill/synced skill, semantic prerequisite fixture, independent tarball fixture/smoke, and profile/scaffold tests; generated projects must contain `>=24 <25`, Node 24 CI, and workspace enforcement.
3. Update `workshop.scaffold` templates/tests and the site onboarding manifest/tests. Do not hand-edit generated downstream artifacts; regenerate only disposable test fixtures through their owning commands.
4. Move both deployable Node service images to Node 24 and run `services.check.run` plus both named `service.test.run` commands.
5. Update the exact AGENTS/Compass/tooling surfaces in the file map, run the classified old-version search, closed-range conformance tests, every affected-package test/build check, doctor, and RFC verification, then commit the platform transaction through `ecosystem.commit --rfc RFC-0854`.
6. Open and materialize the dedicated `warpgogol-com` mission, apply only the bounded manifest adoption after its owner is fixed, validate/build under Node 24, then commit, reconcile, and close through canonical mission commands.
7. Republish the closed mission workpiece to Alt, require Alt smoke to pass, then republish Main and require Main smoke to pass. Only after both deployments may the RFC acceptance evidence be completed and stamped.

The cut is logically atomic and forward-only across two canonical repository transactions: the platform commit first, then the Sternsystem mission. The repository/site may remain temporarily unavailable or mutually inconsistent during the implementation session, as approved for the transition, but no claimed final state may advertise or execute Node 18/20/22 support. An interruption resumes from the last canonical commit or mission state; it never creates a compatibility branch.

## Alternatives considered

### Keep `>=22` and test Node 22/24

Rejected by the operator: there are no legacy consumers worth a compatibility matrix, and maintaining two majors weakens deterministic runtime evidence.

### Use `>=24`

Rejected: it silently treats Node 25/26 as supported without CI, type, image, or canonical-vector evidence.

### Change CI only

Rejected: CI is already Node 24. Stale manifests, types, Docker images, generated projects, and documentation would continue to authorize incompatible runtimes.

### Enable the engine gate before upgrading the executor

Rejected: the current executor is Node 22, so this ordering would make pnpm reject the commands needed to finish and commit the transition. Executor bootstrap is an explicit precondition, not a product fallback.

### Leave `warpgogol-com` for a later migration RFC

Rejected: there is one replaceable site and no legacy estate that justifies a second transition document. Leaving the sole active Sternsystem on `>=22`/Node 26 types would make the ecosystem-wide success claim false.

### Keep Forge on the `0.x` line

Rejected: removing Node 20/22 is the first deliberately enforced breaking consumer boundary and must be visible as `1.0.0`. A platform major bump does not version the independent npm package.

### Rely only on `engines` warnings

Rejected: the transition must fail before work starts. Project engine mismatch and pnpm workspace engine enforcement provide a deterministic blocking boundary.

### Rewrite every old Node string

Rejected: archived documents are immutable history, dependency metadata is third-party evidence, and discovery tests intentionally parse arbitrary versions. Only current first-party support declarations change.

## Risks

- **Published Forge break:** intentional major change; mitigate with exact engine metadata, Node 24 CI, tarball smoke tests, and operator-triggered publication only.
- **Executor self-lockout:** the current host starts on Node 22; mitigate with the immutable-before-repository step-zero bootstrap and clean-stop rule.
- **Type/runtime mismatch:** mitigated by aligning every direct `@types/node` dependency to major 24 and compiling all affected packages.
- **Hidden generated drift:** mitigated by testing each owning profile/template instead of editing generated output alone.
- **Over-broad search-and-replace:** mitigated by the explicit file map, removal discipline, and classified retained-match report.
- **Dependency incompatibility under engineStrict:** fail closed and replace/decide the dependency; do not disable enforcement.
- **Two-repository interruption:** platform and site cannot share one git transaction; mitigate with dependency ordering, canonical commits, resumable mission state, and no completion claim until both deploy smokes pass.
- **Generated site manifest damage:** mitigate by fixing the onboarding owner first and allowing only two named field changes in the existing workpiece; never rerun onboarding over the site.
- **Agent interpretation:** Node 24 means `>=24 <25`, not `>=24`, `24+`, an old-major fallback, or a version-manager auto-download.

## Acceptance criteria

- [x] Before any repository mutation, executor evidence records an active Node 24 path/version and the repository-declared pnpm version; a failed bootstrap is proven to leave every repository tree clean. (evidence: docs/plans/agent-runtime-certification/010-node-24.md)
- [x] Root, published Forge, all generated manifests, and current operator docs/skills name only Node 24; the canonical manifest range is exactly `>=24 <25`. (evidence: package.json:1-20)
- [x] `packages/forge/package.json#version` and `forge.yaml#forge.syncedVersion` are exactly `1.0.0`; platform versioning remains a separate major bump. (evidence: packages/forge/package.json:1-5)
- [x] Root and generated pnpm workspaces enforce dependency engines; exact-range tests reject representative Node 18/20/22/25/26 versions and accept Node 24 without provisioning another runtime. (evidence: pnpm-workspace.yaml:1-10)
- [x] Every first-party direct `@types/node` dependency uses major 24 and all affected TypeScript packages compile under Node 24. (evidence: packages/werkstatt/package.json:1-10)
- [x] Every current GitHub workflow/template uses `actions/setup-node@v5` with Node 24; touched workshop output contains no checkout/setup-node v4 runtime action. (evidence: .github/workflows/ci.yml:1-20)
- [x] Both deployable Node service Dockerfiles use Node 24 and their scoped validation passes. (evidence: services/check-runner/Dockerfile:1-5)
- [x] All four Forge profiles and `workshop.scaffold` emit Node 24-only manifests; Editframe's executable prerequisite rejects other majors. (evidence: packages/forge/profiles/)
- [x] The canonical and synced `ef-onboard` skills are byte-aligned on the Node 24 prerequisite; the semantic `editframe-e2e` fixture is updated and doctor reports no related drift/failure. (evidence: .agents/skills/ef-onboard/)
- [x] Site onboarding emits a Node 24-only package and retains Node 24 deployment CI; template dependency tests pass. (evidence: packages/werkstatt/src/workshop/)
- [x] The Forge `1.0.0` tarball installs into the package-owned standalone fixture under Node 24, reports the correct CLI version, runs a read-only command without monorepo resolution or registry access, and its packed range rejects representative non-24 majors. (evidence: packages/forge/package.json:1-5)
- [x] A dedicated mission changes only the current `warpgogol-com` engine/type declarations after the owner update; site checks/build, mission commit/reconcile/close, Alt republish/smoke, and Main republish/smoke all pass with durable evidence. (evidence: docs/plans/agent-runtime-certification/010-node-24.md)
- [x] A classified search finds no active first-party Node 18/20/22 support declaration outside historical docs, deliberate discovery fixtures, or explanatory text that rejects those runtimes. (evidence: docs/plans/agent-runtime-certification/010-node-24.md)
- [x] Forge, Werkstatt, Werkstatt-site, Werkstatt-game, and Werkstatt-video tests/build checks, both service test commands, `services.check.run`, profile validation, and doctor pass to the exact scoped contract under Node 24. (evidence: docs/plans/agent-runtime-certification/010-node-24.md)
- [x] `AGENTS.md`, `packages/AGENTS.md`, `packages/forge/AGENTS.md`, `services/AGENTS.md`, and `docs/policies/linux-tooling.md` describe the one-major policy; requirements, technology, development-plan, and verification-plan Compass deltas are applied, while the three declared no-change Compass files remain untouched. (evidence: AGENTS.md:1-10)
- [x] `rfc.acceptance.run --id RFC-0854`, `rfc.verification.emit --id RFC-0854`, and `rfc.validate --id RFC-0854 --json` pass before implementation stamping. (evidence: docs/rfcs/rfc-0854-standardize-the-ecosystem-on-node-24.md:334-351)

## Implementation notes for agents

- Implement only after `status: accepted`; this draft grants no code authority.
- Step zero is mandatory and precedes every repository or mission write. The implementing agent is authorized to provision Node 24 on the current Ubuntu host, but must use a publisher-verifiable distribution, activate a fresh process, prove Node major 24 plus the declared pnpm version, and stop cleanly if any check fails.
- Treat this as one atomic runtime cut. Do not leave root, Forge, profiles, onboarding, services, types, or docs on different supported majors at the end of the session.
- Use `>=24 <25` exactly. Do not substitute `>=24`, `^24`, `24+`, a warning-only check, a Node 22 fallback, or runtime auto-download.
- Update template/profile owners first and prove their rendered output. Do not patch generated consumer files as a substitute for changing the owner.
- The sole existing-site exception is bounded and ordered: after the onboarding owner is committed, use a new `warpgogol-com` mission to change only `engines.node` and direct `@types/node` in its accumulated package manifest. Never edit the cache clone and never rerun onboarding over the site.
- Align first-party `@types/node` to major 24 and regenerate `pnpm-lock.yaml` with pnpm. Never hand-edit third-party `engines` entries in the lockfile.
- Set the independent Forge version and sync watermark explicitly to `1.0.0`; do not assume `versionBump: major` performs either change. Run the package-owned standalone tarball smoke, but do not publish.
- Do not edit archived RFCs/plans/audits or change Node-version strings in discovery tests unless the test semantically asserts current support.
- Do not trigger npm publication. Follow `docs/authoring/publication-runbook.md` only after an explicit operator publication command.
- Read current pnpm 11 engine documentation before implementation; project settings belong in `pnpm-workspace.yaml`, while `.npmrc` remains authentication-only and must not be printed or copied.
- Update the exact AGENTS/Compass surfaces in the file map. Do not edit `docs/knowledge-graph.xml`, `docs/source-markup.xml`, or `docs/styling.xml`; their no-change rationales are normative. Run `ecosystem.manifest.generate` only if its generated projection actually consumes a changed registry/source.
- Commit platform changes with `ecosystem.commit --rfc RFC-0854`, workpiece changes with `mission.git.commit`, and then use reconcile/close. These are separate repository transactions; raw `git commit` is forbidden in both.
- Do not stamp the RFC until the post-close Alt and Main republish/smoke sequence passes. The approved temporary broken state permits resumption after interruption, not a reduced final acceptance set.
- Follow RFC-0230 for agent-facing surfaces, RFC-0330 for verification evidence, RFC-0334 for invariant escalation, and RFC-0476 for stamping.
- Before stamping, attach line-accurate evidence, run `rfc.verification.emit --id RFC-0854`, then `rfc.implement.stamp --id RFC-0854 --dry-run` and commit through the canonical flow.
