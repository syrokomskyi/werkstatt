---
id: RFC-0815
title: "Add template.peer-deps.validate for onboarding package template integrity"
status: draft
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-12
updatedAt: 2026-08-12
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0800
  - RFC-0078
# satisfies: []
versionBump: patch
commands:
  proposed:
    - template.peer-deps.validate
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "template.peer-deps.validate exits 0 when all peer dependencies in package.template.json are satisfied"
  - "template.peer-deps.validate exits 1 with PEER-01 when a peer dependency constraint is violated"
  - "Command integrated into SITES_BUILD_CHECK_PIPELINE"
nonGoals:
  - "Validating peer dependencies of workpiece package.json (only the template is checked)"
  - "Auto-fixing version mismatches (report-only)"
  - "Checking peer dependencies for non-onboarding templates"
---

# RFC-0815: Add template.peer-deps.validate for onboarding package template integrity

## Context

The onboarding template `packages/werkstatt-site/src/onboarding/templates/package.template.json` is the canonical source of dependency versions for every new mission workpiece. When a mission is materialized, the workpiece `package.json` is generated from this template.

On 2026-08-12, the template specified `"wrangler": "^4.120.0"` while `@cloudflare/vite-plugin` (a transitive dependency of `@astrojs/cloudflare`) required `^4.120.1`. This caused every new mission to fail on `astro dev` with:

```
The installed version of Wrangler (4.120.0) does not satisfy the peer dependency
required by @cloudflare/vite-plugin (^4.120.1).
```

The existing `template.deps.drift` validator (RFC-0800) compares workpiece `package.json` against the template, but does not check peer dependency compatibility within the template itself. There is no automated guard that catches peer dependency conflicts in the template before they propagate to mission workpieces.

## Problem

**Unprotected invariant:** The onboarding package template must declare dependency versions that are mutually compatible — including transitive peer dependency constraints.

**Current enforcement:** None. Peer dependency compatibility is verified only at `pnpm install` time inside a materialized workpiece, which is too late: the conflict surfaces as a runtime error during `astro dev` or `astro build`, not during template editing.

**Failure mode:** A version bump in any dependency (e.g. `@astrojs/cloudflare`) can introduce a new transitive peer requirement on another dependency (e.g. `wrangler`). Without an automated check, the template maintainer must manually verify all peer constraints after every dependency update — a manual discipline that is unreliable.

## Decision

The kernel gains a `template.peer-deps.validate` command that resolves the dependency tree declared in `package.template.json` and checks all peer dependency constraints are satisfied by the declared versions.

## Architectural fit

- **RFC-0800 (template.deps.drift):** Complementary. `template.deps.drift` checks workpiece-vs-template version sync. `template.peer-deps.validate` checks internal template consistency. Both run in `SITES_BUILD_CHECK_PIPELINE`.
- **RFC-0078 (generation-first apps):** The template is the single source of truth for workpiece dependency versions. Validating it at the template level prevents propagation of broken versions to every materialized mission.
- **DNA-36 (scaffold-generated):** Scaffold quality is only as good as the template it generates from. Peer dependency integrity is a scaffold quality gate.

## Design

### CLI surface

```sh
# Validate the default template
pnpm exec werkstatt run template.peer-deps.validate

# Validate with JSON output
pnpm exec werkstatt run template.peer-deps.validate --json

# Validate a specific template file
pnpm exec werkstatt run template.peer-deps.validate --template packages/werkstatt-site/src/onboarding/templates/package.template.json
```

Scope: `workspace`. No `--site` flag required — the command validates the template, not a specific site.

### TypeScript contracts

```ts
interface PeerDepsValidateInput {
  flags: {
    template?: string;       // Path to package.template.json (default: canonical onboarding template)
    json?: boolean;
  };
}

interface PeerViolation {
  ruleId: string;            // "PEER-01"
  package: string;           // "wrangler"
  declaredVersion: string;   // "^4.120.0"
  requiredBy: string;        // "@cloudflare/vite-plugin"
  requiredRange: string;     // "^4.120.1"
  message: string;
}

interface PeerDepsValidateResult {
  violations: PeerViolation[];
  checked: number;           // Total peer constraints checked
  passed: number;            // Satisfied constraints
}
```

### File system responsibilities

| Path | Role |
|---|---|
| `packages/werkstatt-site/src/onboarding/templates/package.template.json` | Read — the template being validated |
| `packages/werkstatt-site/src/checks/template-peer-deps-validate.ts` | New validator implementation |
| `packages/werkstatt-site/src/checks/module.ts` | Command registration |

### Implementation approach

The validator:

1. Reads `package.template.json` and extracts `dependencies` + `devDependencies`.
2. Runs `pnpm install --dry-run --json` in a temp directory seeded with the template's dependency set to resolve the full dependency tree.
3. Extracts all `peerDependencies` from the resolved tree.
4. For each peer dependency, checks whether the version declared in the template satisfies the peer constraint.
5. Reports violations as `PEER-01` findings.

Alternative approach (simpler, no temp install): use `pnpm list --depth Infinity --json` on the workspace and filter for the template's declared packages. This avoids a temp directory but requires the workspace to already have the dependencies installed.

### Output format

```json
{
  "command": "template.peer-deps.validate",
  "status": "fail",
  "violations": [
    {
      "ruleId": "PEER-01",
      "package": "wrangler",
      "declaredVersion": "^4.120.0",
      "requiredBy": "@cloudflare/vite-plugin",
      "requiredRange": "^4.120.1",
      "message": "wrangler ^4.120.0 does not satisfy peer dependency ^4.120.1 required by @cloudflare/vite-plugin"
    }
  ],
  "checked": 47,
  "passed": 46
}
```

### Failure modes

- **PEER-01:** A declared dependency version does not satisfy a peer dependency constraint from a transitive dependency. Severity: error, exit code 1.
- **PEER-02:** Template file not found or unreadable. Severity: error, exit code 1.
- **PEER-03:** Dependency resolution failed (e.g. registry unreachable). Severity: warning, exit code 0 with `checked: 0`.

## Rollout

- **Default behavior:** Fail-hard. `PEER-01` violations exit non-zero.
- **Pipeline integration:** Added to `SITES_BUILD_CHECK_PIPELINE` after `template.deps.drift`.
- **Existing apps:** No impact — the command validates the template, not workpiece package.json. Existing workpiece `package.json` files are unaffected.
- **New apps:** Automatically benefit from the check — any template change that introduces a peer conflict is caught before the next mission materialization.

## Alternatives considered

- **CI-only check via `pnpm peers check`:** Rejected because it checks the workspace `package.json`, not the template. The template is a non-installable JSON file — `pnpm peers check` cannot target it directly.
- **Pre-commit hook on `package.template.json`:** Rejected because it requires the committer to have the full dependency tree installed locally. A pipeline validator runs in CI with deterministic resolution.
- **Manual discipline ("check peer deps when bumping @astrojs/cloudflare"):** Rejected — this is the current approach and it failed on 2026-08-12.

## Risks

- **False positives from optional peer dependencies:** Some packages declare optional peer dependencies that are only relevant when the peer is installed. The validator should skip optional peers that are not in the template's dependency set.
- **Registry availability:** `pnpm install --dry-run` requires registry access. In offline CI, the validator falls back to `PEER-03` (warning, not error).
- **Performance:** Resolving a full dependency tree takes 5-10 seconds. Acceptable for a build-check pipeline step that runs once per build.

## Acceptance criteria

- [ ] `template.peer-deps.validate` command registered in `packages/werkstatt-site/src/checks/module.ts`
- [ ] `PEER-01` violation emitted when a peer constraint is violated
- [ ] `--json` output format documented and stable
- [ ] Integrated into `SITES_BUILD_CHECK_PIPELINE`
- [ ] Existing template passes without violations (after the wrangler ^4.120.1 fix)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0815 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
