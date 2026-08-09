---
rfc: RFC-0777
createdAt: 2026-08-09
personas: [architect, security, qa, pm, dev-advocate]
consensusFindings: 2
uniqueFindings: 5
---

# Design Summit: RFC-0777

**RFC:** Werkstatt game plugin for phaser turborepo stack
**Status:** accepted (transitioned from draft during plan step 0.3)
**Audit:** AUDIT-RFC-0777-01 — verdict: needs-revision (11 findings, all resolved during enhance)

No findings does not mean no issues — it means no issues were found from these five perspectives.

## Architect

### Findings

- **A1 (concern): `checkGate` hook referenced but not defined.** The plugin entry point lists `hooks: { build, checkGate, releaseEvidence, scaffoldProject }` but the module table and file system responsibilities table do not include a `checkGate/` directory. The site plugin (RFC-0774) defines `checkGate` as the hook that runs validators after build. The game plugin needs a `checks/` module that `checkGate` invokes — but the wiring between `hooks.checkGate` and the three game validators is not described. Which validators run in `checkGate`? All three? A subset? This is a structural gap.

- **A2 (concern): `moduleLoaders` content is a comment placeholder.** The plugin entry point has `moduleLoaders: { /* checks, onboarding */ }` — this is a comment, not a real declaration. RFC-0770's `WerkstattPlugin` contract requires `moduleLoaders` to map module names to loader functions. The RFC should specify which modules are loaded and how (e.g. `checks: () => import("./checks"), onboarding: () => import("./onboarding")`).

### No concerns

- The plugin follows the exact contract pattern established by RFC-0770 and mirrors RFC-0774 (site plugin). This is a repeat of a proven pattern, not a new architectural direction.
- DNA-1 and DNA-64 alignment is well-documented after enhancement.
- The `materialize` hook omission is explicitly justified with a clear rationale (no authored-data injection for games).
- Forward-only compliance is clean — no compatibility shims, no dual paths.

## Security Engineer

### Findings

- **S1 (concern): `GAME-04` secret scan invariant has no enforcement mechanism defined.** The invariant says "No hardcoded API keys or secrets in game source — enforced by secret scan" but the RFC does not specify which tool performs the scan, where it runs in the pipeline (build time? checkGate? pre-commit?), or what patterns it checks. Is it a regex-based scan? Does it use an existing tool like `gitleaks`? Without an enforcement mechanism, `GAME-04` is aspirational, not operational.

- **S2 (concern): Deploy adapters for GitHub Pages and Cloudflare Pages may need credentials.** The RFC mentions two deploy adapters but does not discuss what credentials they require (GitHub token, Cloudflare API token) or how they are injected. The site plugin handles this via `systems/registry.yaml` channel config — the RFC says "The adapter accepts configuration from `systems/registry.yaml` channel config" in the Risks section, but this is a risk note, not a design decision. The credential injection path should be explicit.

## QA Engineer

### Findings

- **Q1 (concern): No test strategy defined.** The RFC has acceptance criteria but no test plan. How are the three validators tested? Unit tests with fixture game projects? Integration tests through `werkstatt run`? The site plugin (RFC-0774) doesn't define a test strategy either, but the game validators have more complex logic (scene registry parsing, asset manifest validation, bundle size measurement) that needs test coverage. At minimum, the RFC should state: unit tests for each validator with fixture projects, integration test through `werkstatt run game.*.validate --json`.

- **Q2 (concern): `game.bundle.validate` measures "gzipped" size but doesn't specify how.** Does it run `gzip` on the bundle output? Does it read `dist/` and compress? Does it use Vite's built-in bundle analysis? Different measurement methods produce different sizes. The validator should specify the measurement method to ensure reproducible results across environments.

## Product Manager

### Findings

- **P1 (concern): Rollout depends on RFC-0776 (workshop migration) which is a wave 4 item, but RFC-0777 is wave 5.** The rollout section says "Implemented after the site plugin is live and the workshop migration (RFC-0776) is complete." This is correct sequencing, but the RFC doesn't note what happens if RFC-0776 is delayed or descoped. Is RFC-0777 blocked indefinitely? Can it proceed with a manual workshop setup (without `workshop.scaffold` from RFC-0779)? The dependency chain should be explicit: RFC-0777 requires RFC-0770..0773 (engine + plugin contract + publication) but not necessarily RFC-0776 (migration) or RFC-0779 (scaffolding).

### No concerns

- `nonGoals` are explicit and meaningful: "No game engine changes" and "No game content" clearly bound the scope.
- The problem statement is grounded in a real need: the `phaser-turborepo` profile exists but has no plugin.
- Scope is correctly bounded — this is one plugin for one stack, not a generic game framework.

## Developer Advocate

### Findings

- **D1 (concern): `phaser.config.ts` format is assumed but not specified.** The RFC references `phaser.config.ts` as the scene registry (GAME-01) and bundle budget source (`bundleBudget` field), but doesn't show its shape. A new agent implementing this RFC needs to know: is it a standard Phaser config? A custom extension? What does the `bundleBudget` field look like? A minimal example would help.

- **D2 (concern): Implementation notes still reference `site-kernel run` instead of `werkstatt run`.** The acceptance probe comment was updated by the operator to `werkstatt run`, but the implementation notes section at the bottom still says `site-kernel run rfc.verification.emit` and `site-kernel run rfc.supersede.propose`. These should be `werkstatt run` for consistency with the game plugin context. (Note: this may be a template artifact — the implementation notes are in HTML comments — but an agent reading them will be confused.)

## Consensus findings

- **A1 + Q1 (2 personas): `checkGate` hook and validator test strategy are undefined.** The architect notes that `checkGate` is listed in hooks but its wiring to validators is not described. The QA engineer notes that no test strategy exists. These are related: defining which validators run in `checkGate` is a prerequisite for testing the check gate. Recommendation: add a "Check gate composition" subsection listing which validators run in `checkGate` (likely all three), and add a "Test strategy" subsection specifying unit tests with fixture projects.

- **A2 + D1 (2 personas): Plugin entry point and `phaser.config.ts` need concrete examples.** The architect notes `moduleLoaders` is a placeholder comment. The developer advocate notes `phaser.config.ts` shape is unspecified. Both are "show the code" gaps. Recommendation: expand the plugin entry point example with real `moduleLoaders` values, and add a minimal `phaser.config.ts` example showing scene registration and `bundleBudget`.

## Unique findings

- **S1: `GAME-04` secret scan enforcement mechanism undefined** — specify tool, pipeline placement, and scan patterns.
- **S2: Deploy adapter credential injection path not explicit** — document how GitHub/Cloudflare tokens reach the adapters.
- **Q2: `game.bundle.validate` gzip measurement method unspecified** — define the measurement procedure for reproducibility.
- **P1: Dependency chain on RFC-0776 not explicit** — clarify which RFCs are hard dependencies vs. soft sequencing.
- **D2: Implementation notes reference `site-kernel run` instead of `werkstatt run`** — update for consistency.

## Recommendation

**Revise the RFC** — route through `fo-idea-enhance` as audit-style findings. The 2 consensus findings (checkGate wiring + test strategy, concrete examples for moduleLoaders + phaser.config.ts) and 3 unique findings (GAME-04 enforcement, bundle measurement method, credential injection) are implementation-blocking gaps that should be resolved before planning.

The remaining 2 unique findings (P1 dependency chain clarity, D2 template text consistency) are minor and can be addressed in the same enhancement pass.
