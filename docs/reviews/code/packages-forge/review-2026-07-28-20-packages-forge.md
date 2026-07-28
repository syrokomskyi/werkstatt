---
reviewId: REVIEW-CODE-2026-07-28-01
date: 2026-07-28
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 8e3b2cf...HEAD
filesReviewed:
  - packages/forge/os/mission/types.ts
  - packages/forge/os/mission/handlers/archive.ts
  - packages/forge/os/mission/handlers/archive.test.ts
  - packages/forge/os/mission/mission.module.ts
  - packages/forge/os/mission/index.ts
  - packages/forge/src/index.ts
  - packages/forge/package.json
  - packages/forge/os/core/core.module.ts
  - packages/os/site-kernel-handoff/src/mission/mission-io.ts
  - tools/kernel.config.ts
  - packages/forge/AGENTS.md
  - packages/AGENTS.md
  - docs/COMMANDS.md
  - docs/rfcs/rfc-0573-add-mission-archive-command-for-terminal-status-mission-archiving.md
---

# Code Review: 8e3b2cf...HEAD (RFC-0573 mission.archive implementation)

### Verdict: Needs revision

The implementation is architecturally sound, follows established archive command patterns (rfc.archive, plan.archive, audit.archive), and passes all mechanical checks. Two findings require attention: a duplicated code pattern between Phase 1 and Phase 2 of the handler, and a missing `nextSteps` field in the command result (RFC-0542 output contract).

### Mechanical floor

Pass — `pnpm --filter @warpgogol/forge build:check` and `pnpm --filter @warpgogol/site-kernel-handoff build:check` both pass. `rfc.validate RFC-0573` passes. 10/10 unit tests pass.

### Axis A — Structural correctness

- **Duplicated Code (Fowler)** — The move-and-skip logic in Phase 1 (lines 94-145) and Phase 2 (lines 155-207) of `archive.ts` share the same shape: check destination exists → skip, `fs.rename` with ENOENT catch → skip, push to `moved`. This is a borderline finding — the two phases differ in direction and path construction, and the existing `rfc.archive`/`audit.archive` handlers have the same duplication pattern. Extracting a shared `moveMission()` helper would reduce ~30 lines but may harm readability by parameterizing direction. Low severity.
- **`as never` casts** — `MISSION_TERMINAL_STATUSES.includes(state as never)` at lines 63 and 103 and 171. This is the same pattern used by `rfc.archive` (`RFC_TERMINAL_STATUSES.includes(statusFilter as never)`). Consistent with existing code, but `as never` is a type-unsafe escape hatch. Low severity — ecosystem convention.

### Axis B — DNA alignment

No issues. The handler correctly avoids `@warpgogol/*` imports (DNA-42 / forge autonomy guard), uses `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding on all new source files, and follows kebab-case naming (DNA-6). No hardcoded tokens (DNA-10 N/A — no CSS). No mirror quintet (DNA-5 N/A — no `.astro` components).

### Axis C — Ecosystem fit

No issues. `forgeMissionModule` is registered in `tools/kernel.config.ts` with the correct `forge-mission` loader key. `mission.archive` is integrated into `docs.archive` umbrella as the sixth sub-command. `packages/forge/AGENTS.md` OS modules table updated. `packages/AGENTS.md` forge export list updated. `docs/COMMANDS.md` regenerated. Package `exports` map in `package.json` includes both `./os/mission` and `./os/mission-module` entries (source + dist).

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths, no legacy code maintained behind flags. The `mission.list` change (excluding `archive/`) is a direct filter, not a configurable behavior.

### Axis E — Agent-facing clarity

- **Missing `nextSteps` field** — RFC-0542 output contract states: "`ForgeNextStep` type and `nextSteps?` field are on `ForgeCommandResult` directly (cross-cutting), not inside command-specific `data`." The handler's return object at lines 224-235 does not include a `nextSteps` array. However, RFC-0542 also states: "Pass-state validators MAY leave the array empty." `mission.archive` is not a lifecycle command (`forge.create`, `forge.scaffold`, `forge.doctor`, `forge.port.scaffold`), so it is not strictly required to populate `nextSteps`. But the contract says the field is cross-cutting — it should at least be present as an empty array or omitted (which is equivalent). The existing `rfc.archive` handler also omits `nextSteps`, so this is consistent with the ecosystem. Low severity — ecosystem convention.

### Axis F — Pragmatism

No issues. The command earns its existence — mission directories are distinct from document files and require directory-level archiving (not file-level). The handler is minimal (~236 lines), follows the exact pattern of `rfc.archive`/`audit.archive`, and does not introduce speculative generality. Test coverage is comprehensive (10 tests covering all scenarios).

### Axis G — Blind spots

- **Performance** — The handler performs `existsSync` + `readdir` + `readFile` per mission directory. For workspaces with many missions, this is O(n) I/O. The existing archive handlers have the same cost profile. No issue.
- **Concurrent execution** — The TOCTOU risk is documented in the RFC (Risks section, line 284). `fs.rename` is atomic on a single filesystem. The ENOENT catch handles the race where another process moves the directory first. No issue.
- **Edge cases** — Empty `missions/` directory is handled (lines 72-86). Unreadable manifest is handled (skip with reason). Destination exists is handled (skip). All covered by tests.

### Spec compliance

| Requirement from RFC-0573 | Status | Evidence |
| --- | --- | --- |
| `mission.archive` command with `--dry-run` and `--status` flags | Done | mission.module.ts:35-44 |
| Terminal states: closed, aborted | Done | types.ts:19 |
| Bidirectional archiving | Done | archive.ts:147-208 (Phase 2) |
| `missions/archive/<state>/<missionId>/` path structure | Done | archive.ts:115-117 |
| `docs.archive` umbrella integration | Done | core.module.ts:336 |
| `mission.list` excludes `archive/` | Done | mission-io.ts:67-69 |
| `mission.status` resolves archived missions | Done | mission-io.ts:22-31 |
| No `@warpgogol/*` imports in handler | Done | archive.ts imports only node:fs, yaml, types |
| Unit tests cover all scenarios | Done | archive.test.ts: 10/10 pass |
| `forgeMissionModule` exported + registered | Done | src/index.ts:139, kernel.config.ts:84-85 |
| AGENTS.md updated | Done | forge/AGENTS.md:27, packages/AGENTS.md:28 |

### Questions for the author

1. The Phase 1 and Phase 2 move logic in `archive.ts` is structurally duplicated. Would extracting a `moveMissionDir(source, target, direction, dryRun)` helper improve maintainability, or is the current inline form more readable given the different path construction in each phase?
2. Should `mission.archive` populate `nextSteps` in its result (e.g., "Run `mission.list` to verify active missions")? The existing `rfc.archive` handler also omits it, so this may be an ecosystem-wide gap rather than a per-command finding.
