---
rfc: RFC-0877
createdAt: 2026-08-18
personas: [architect, security, qa, pm, dev-advocate]
consensusFindings: 2
uniqueFindings: 4
---

# Design Summit: RFC-0877

## Architect

### Findings

- **A1 (concern):** The RFC removes `workshop.scaffold` from the engine but does not address whether `forge create --in-place` fully replaces its functionality. `workshop.scaffold` (RFC-0779) generates a consumer workshop monorepo with `tools/kernel.config.ts`, `forge.yaml`, `.npmrc`, CI, and stack-specific customization. `forge create` composes `forge.scaffold` + `forge.init` + `forge.agents.generate` — does it also generate `tools/kernel.config.ts` and CI workflows? If not, consumers lose these artifacts. The RFC should explicitly state whether `forge create --in-place` produces the same artifact set as `workshop.scaffold`, or document which artifacts are intentionally dropped.

- **A2 (question):** The RFC makes `--in-place` the only mode and removes the subdirectory-creation path entirely. But `forge create` currently resolves `forgeRoot` from the parent context (line 167-176 of `create.ts`) — when scaffolding in-place, `forgeRoot` is already installed in the cwd (the agent ran `pnpm add -D @warpgogol/forge` first). Does the `forgeRoot` resolution logic need to change for in-place mode? The current code tries `resolveForgeRoot(context.workspaceRoot)` which may behave differently when `workspaceRoot === targetDir` vs `workspaceRoot !== targetDir`.

### No concerns

- DNA-64 alignment is sound — removing `workshop.scaffold` from the engine strengthens the engine/profile boundary.
- The allowlist-based conflict check is architecturally cleaner than the denylist approach.
- Forward-only compliance is correctly enforced — no backward-compat shim.

## Security Engineer

### Findings

- **S1 (concern):** The RFC does not address supply-chain security. The agent-driven flow requires the operator to trust the agent to install packages from npm. If the agent misidentifies the project type and installs the wrong plugin package, the operator may end up with unexpected dependencies. The RFC should mention that the agent verifies package names against the README profiles table before installation, and that the operator can review the installed packages before proceeding to `forge-bootstrap`.

### No concerns

- No new trust boundaries — the flow uses existing npm infrastructure.
- No persistence changes — no cookies, no localStorage, no new storage patterns.
- No sensitive data exposure — error messages list file names and profile IDs, not secrets.

## QA Engineer

### Findings

- **Q1 (concern):** The test plan is incomplete. The RFC lists test cases in acceptance criteria but does not specify the test setup for in-place mode. Current tests in `create.test.ts` create a temp dir and pass it as `workspaceRoot` with `--name` pointing to a subdirectory. For in-place mode, the test needs to: (1) create a temp dir, (2) optionally add `package.json`/`node_modules/`/`.git/` to simulate prior setup, (3) set `workspaceRoot` to the temp dir itself, (4) pass `--in-place --profile <id>`. The RFC should specify this test setup or leave it to the plan.

- **Q2 (concern):** The conflict check has an edge case: what if `package.json` exists but contains conflicting scripts or dependencies? The RFC says "forge create merges/overwrites with forge project package.json" — but merge semantics are unspecified. Does forge create overwrite the entire `package.json` or merge fields? If merge, what happens to conflicting `scripts` or `dependencies` entries? This should be documented in the failure modes or design section.

## Product Manager

### Findings

- **P1 (concern):** The RFC removes global install (`pnpm add -g`) and `pnpm dlx` paths from the README, but does not address operators who already have forge installed globally. An operator with `@warpgogol/forge` installed globally will have a stale version that conflicts with the local devDependency. The RFC should mention that operators who previously installed forge globally should uninstall it (`pnpm remove -g @warpgogol/forge`) as part of migration, or note that the global install is harmless but unused.

### No concerns

- The problem statement is grounded in a real user need — the operator's vision of "create empty folder, open for agent, agent installs everything" is clear.
- `nonGoals` are explicit and meaningful — 6 items covering auto-install, interactive prompts, forge-shell, forge-bootstrap internals, forge.scaffold/init contracts, and backward-compat.
- Scope is correctly bounded — one command change, one command removal, two doc updates.

## Developer Advocate

### Findings

- **D1 (question):** The RFC's AGENTS.md agent instructions section (lines 272-289) includes a hardcoded profile-to-package mapping (`astro-typescript-turborepo → @warpgogol/werkstatt + @warpgogol/werkstatt-site`, etc.). This mapping will become stale if new profiles are added or package names change. Should this mapping be derived from `listStackProfiles()` at runtime instead of hardcoded in AGENTS.md? If hardcoded, the AGENTS.md must be updated whenever a new profile is added — this is a maintenance burden.

- **D2 (concern):** The RFC says "the agent should be able to derive this information (supported project types) from the npm package's README file." But the README is on npmjs.com — the agent needs to fetch it via `read_url_content` or similar. If the agent is offline or npmjs.com is unavailable, the agent cannot determine supported profiles. The RFC should mention `listStackProfiles()` as the programmatic fallback, or specify that the README contains a machine-readable profiles table that the agent can parse.

## Consensus findings

- **A1 + Q1 (2 personas):** The RFC does not fully specify whether `forge create --in-place` produces the same artifact set as `workshop.scaffold`. The Architect is concerned about lost artifacts (`tools/kernel.config.ts`, CI); the QA Engineer is concerned about test setup. Recommendation: the RFC should explicitly list the artifacts that `forge create --in-place` produces and confirm they match `workshop.scaffold`'s output, or document intentional differences.

- **D1 + A1 (2 personas):** Hardcoded profile-to-package mapping in AGENTS.md is a maintenance burden and may diverge from the actual profile list. The Architect notes that `workshop.scaffold` generated stack-specific customization; the Developer Advocate notes that the hardcoded mapping will become stale. Recommendation: reference the README profiles table as the single source of truth, or derive the mapping from `listStackProfiles()` at runtime.

## Unique findings

- **A2:** `forgeRoot` resolution logic may need adjustment for in-place mode (workspaceRoot === targetDir).
- **S1:** Supply-chain security — agent verifies package names before installation.
- **Q2:** `package.json` merge semantics are unspecified.
- **P1:** Operators with existing global forge install need migration guidance.
- **D2:** Offline/unavailable npmjs.com scenario — `listStackProfiles()` as fallback.

## Recommendation

**Revise the RFC** — 2 consensus findings and 4 unique findings warrant enhancement before planning. Route through `fo-idea-enhance` to address:

1. A1+Q1: Document the artifact set produced by `forge create --in-place` vs `workshop.scaffold`.
2. D1+A1: Replace hardcoded profile-to-package mapping with reference to README or `listStackProfiles()`.
3. A2: Clarify `forgeRoot` resolution in in-place mode.
4. Q2: Specify `package.json` merge semantics.
5. P1: Add migration note for operators with existing global install.
6. D2: Add `listStackProfiles()` as programmatic fallback for supported types.
7. S1: Add agent verification step for package names.

Disclaimer: No findings does not mean no issues — it means no issues were found from these five perspectives.
