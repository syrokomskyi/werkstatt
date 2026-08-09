---
rfc: RFC-0774
createdAt: 2026-08-09
personas: [architect, security, qa, pm, dev-advocate]
consensusFindings: 1
uniqueFindings: 2
---

# Design Summit: RFC-0774

## Architect

### Findings

- **A1 (concern):** The `site-kernel-checks` command tables (`src/command-tables/`, 31 items) are the most complex part of the move. The RFC's Risks section mentions that `site-kernel-checks` is the largest os package and that command ids are contract, but doesn't provide specific migration guidance for the command tables. The plan should include a dedicated step for migrating command tables and verifying that all command ids remain registered and resolvable after the move.

- **A2 (observation):** DNA-64 dependency on RFC-0769 acceptance creates a temporal dependency. If RFC-0769 is rejected, this RFC's `satisfies[]` and Architectural fit section need revision. The RFC acknowledges this ("DNA-64 is not yet in `satisfies[]` because RFC-0769 is still `draft`"), which is the correct approach — but the program sequencing risk is real: all wave 3+ RFCs depend on RFC-0769's acceptance.

### No concerns

- The plugin contract dependency (`WerkstattPlugin` type import from engine) is the correct direction — plugins import engine contracts, not the reverse. DNA-64 is preserved.
- The `site-kernel-check-warpgogol` → `checks/check-warpgogol/` placement with intra-plugin dependency on `domain/check-core/` and `domain/check-runner/` (RFC-0775) is architecturally clean.
- The re-export scaffold bridge (RFC-0772 phases 1–5) until RFC-0776's atomic switch is a sound construction strategy, not a compatibility layer.

## Security Engineer

### Findings

No concerns. The RFC is a package consolidation — it moves existing code into a new physical home without changing the trust model, data flows, or attack surface. No new trust boundaries are created. The plugin is loaded by the engine via `tools/kernel.config.ts`, which is the same composition point used today. No persistence changes, no new external service interactions, no user data handling changes.

## QA Engineer

### Findings

- **Q1 (concern):** Acceptance criterion 4 ("Cloudflare Workers deploy adapter works through `deployAdapters` (leitstand dev-deploy → promote cycle green on warpgogol-com)") is a heavy runtime check requiring a full deployment cycle. This is expensive and may not be feasible in a single implementation session. Consider whether a lighter-weight check (e.g., `werkstatt.plugin.validate` + typecheck + unit tests for the adapter factory) is sufficient for initial implementation, with the full deploy cycle as a post-implementation verification step.

- **Q2 (observation):** The RFC says "test suites move with their modules and pass from the new location." The `site-kernel-checks` package has 140 test files in `src/tests/`. Moving these tests and updating all import paths is a significant mechanical effort. The plan should budget explicit time for test fixture path repair, as RFC-0772's Risks section already notes: "Many tests build temp workspaces referencing old package names."

### No concerns

- Empty state handling: a workshop with no registered plugin is covered by RFC-0770's PLUGIN-01 failure mode.
- Hook error reporting (`[werkstatt-site:checkGate] ...`) is a well-defined failure surface.

## Product Manager

### Findings

No concerns. The RFC solves a real problem (site-stack modules need a home after engine consolidation), the scope is correctly bounded (engine modules only, domain in RFC-0775, migration in RFC-0776), and `nonGoals` are explicit and meaningful. No direct user impact — the consolidation is internal architecture. The rollout via re-export scaffold ensures zero downtime for the workshop.

## Developer Advocate

### Findings

- **D1 (concern):** The RFC doesn't provide guidance on how to handle the `site-kernel-checks` command tables during migration. With 31 command table files and 140 test files, this is the single most complex migration unit. An agent implementing this RFC needs to know: (a) should command tables move as-is or be restructured? (b) how to verify all command ids remain registered? (c) what to do about test fixtures that reference old package names? The plan should address these explicitly.

- **D2 (observation):** The RFC's plugin entry point code block shows `moduleLoaders: { /* checks, codegen, content, onboarding, audit, changelog */ }` as a comment. An agent implementing this needs to know the exact module loader keys and their import paths. The plan should include a step that maps each module loader key to its source module and new import path.

### No concerns

- The RFC is well-structured with a clear module table mapping source to plugin contract slot.
- Terms from RFC-0769's terminology (plugin, engine, workshop) are defined in the charter.
- Implementation notes are standard template with explicit behavioral rules.

## Consensus findings

- **A1 + D1 (2 personas — Architect + Developer Advocate):** The `site-kernel-checks` command tables (31 items in `src/command-tables/`) and test suite (140 files in `src/tests/`) are the single most complex migration unit. The RFC mentions the size risk but doesn't provide migration guidance. The plan must include a dedicated step for: (a) moving command tables as-is (no restructuring), (b) verifying all command ids remain registered via `command.manifest.generate` + comparison, (c) budgeting time for test fixture path repair.

## Unique findings

- **Q1 (QA):** The "leitstand dev-deploy → promote cycle green on warpgogol-com" acceptance criterion is a heavy runtime check. Consider a lighter-weight alternative for initial implementation (adapter factory unit test + `werkstatt.plugin.validate`), with the full deploy cycle as post-implementation verification.
- **A2 (Architect):** Temporal dependency on RFC-0769 acceptance for DNA-64. If RFC-0769 is rejected, this RFC's `satisfies[]` needs revision. Low probability but high impact.

## Recommendation

**Proceed to planning.** The consensus finding (command table migration guidance) should be addressed in the plan, not in the RFC itself — it's an implementation detail, not a design decision. The unique QA finding (heavy runtime check) should be addressed in the plan by splitting the acceptance criterion into a lightweight check (implementation step) and a full deploy verification (post-implementation step).

No findings require RFC revision. The RFC is ready for planning.

> No findings does not mean no issues — it means no issues were found from these five perspectives.
