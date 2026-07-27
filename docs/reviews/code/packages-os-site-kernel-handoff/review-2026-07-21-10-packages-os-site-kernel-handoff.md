---
reviewId: REVIEW-CODE-2026-07-21-01
date: 2026-07-21
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: f58b77634...HEAD
filesReviewed:
  - packages/forge/os/rfc/types.ts
  - packages/forge/os/rfc/handlers/validate-rules.ts
  - packages/forge/os/rfc/rfc-0000-template.md
  - packages/os/site-kernel-handoff/src/platform-consistency.ts
  - packages/os/site-kernel-handoff/src/platform-module.ts
  - packages/os/site-kernel-handoff/src/index.ts
  - packages/os/site-kernel-handoff/package.json
  - tools/kernel.config.ts
  - packages/os/site-kernel-checks/src/ci-local.ts
  - packages/os/site-kernel-checks/src/pipelines/packages-check.ts
  - AGENTS.md
  - docs/verification-plan.xml
---

# Code Review: RFC-0478 implementation (f58b77634...HEAD)

### Verdict: Needs revision

The implementation is structurally sound and all mechanical checks pass, but has a duplicated write path on first run, a `violations` field absent from the typed interface, a missing `reads` declaration for the log file, and duplicated RFC-scanning logic between PC-02 and PC-03.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/forge build:check`, `pnpm --filter @warpgogol/site-kernel-handoff build:check`, `pnpm --filter @warpgogol/site-kernel-checks build:check`, `rfc.validate`, `platform.consistency.validate --check` all exit 0.

### Axis A — Structural correctness

- **Duplicated Code** — PC-02 and PC-03 both iterate `docs/rfcs/` with identical file-reading and frontmatter-parsing logic (`platform-consistency.ts:106-128` and `138-172`). Extract a shared `findRfcsWithVersionBump(workspaceRoot, predicate)` helper.
- **Duplicated `compareSemver`** — `platform-consistency.ts:52-58` duplicates `compareSemver` from `sternsystem-pin.ts` and `version-compare.ts`. Import from the existing location instead.
- **Double write on first run** — When `lastLog === null` and `!hasErrors && !checkOnly`, both the "Write log on success" block (line 179) and the "First run" block (line 191) execute, writing the same file twice. Merge into a single write path.

### Axis B — DNA alignment

- **DNA-42 (Compass markup)** — `platform-consistency.ts` and `platform-module.ts` both carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`. Pass.
- **DNA-53 (fingerprint)** — Uses `resolvePlatformSemanticHash` from `bundle-io.ts` which delegates to `@warpgogol/fingerprint`. Pass.

### Axis C — Ecosystem fit

- **Missing `reads` declaration** — `platform-module.ts` declares `reads: ["package.json", "packages/**", "docs/rfcs/**/*.md"]` but the handler also reads `docs/platform-version-log.generated.yaml`. Add it to `reads` or `CRC-01` may flag it.
- **RFC-0086 compliance** — The return includes `violations` in the data via spread (`platform-consistency.ts:212`), but `PlatformConsistencyData` doesn't declare `violations`. Consumers reading the typed interface won't see violations. Add `violations?: PlatformConsistencyViolation[]` to `PlatformConsistencyData`.
- **Pipeline placement** — `platform.consistency.validate --check` is correctly placed in both `CI_LOCAL_CHECKED_COMMANDS` and `PACKAGES_CHECK_PIPELINE`. Pass.
- **AGENTS.md** — Root AGENTS.md updated with RFC-0478 section. Pass.

### Axis D — Forward-only compliance

No compatibility shims, no dual-paths, no legacy code retained. Pass.

### Axis E — Agent-facing clarity

- **Compass scaffolding** — Both new files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`. Pass.
- **No ungrounded assertions** — All references point to real functions and files. Pass.
- **Readable** — Variable names are clear. Pass.

### Axis F — Pragmatism

- **Minimal command surface** — `platform.consistency.validate` earns its existence as a CI gate. Pass.
- **`--check` flag** — Correctly avoids dirtying the working tree in CI. Pass.

### Axis G — Blind spots

- **No unit tests** — No test file for `platform-consistency.ts`. The handler has non-trivial branching (PC-01/02/03, first-run, --check mode). Add at least smoke tests for each rule.
- **Performance** — `resolvePlatformSemanticHash` scans `packages/` (3–8s for 25+ packages). This is documented in the RFC risk table. Acceptable.
- **False positives** — PC-02 uses `updatedAt >= lastLog.validatedAt` to find bump RFCs. If an RFC was updated but not merged in this cycle, it may match. This is a warning, not an error, so acceptable.

### Spec compliance

| Requirement | Status | Evidence |
| --- | --- | --- |
| versionBump field in RFC_KNOWN_KEYS + RfcFrontmatter | Done | types.ts:223, types.ts:520 |
| V-28 RFC-id monotonicity | Done | validate-rules.ts:657-683 |
| V-29 versionBump required for post-cutoff implemented | Done | validate-rules.ts:685-713 |
| platform.consistency.validate command | Done | platform-consistency.ts, platform-module.ts |
| PC-01 hash drift without version bump | Done | platform-consistency.ts:97-104 |
| PC-02 version bump without RFC | Done | platform-consistency.ts:106-136 |
| PC-03 minor RFC without minor bump | Done | platform-consistency.ts:138-173 |
| platform-version-log.generated.yaml seeded | Done | docs/platform-version-log.generated.yaml |
| CI wiring (ci.local.validate + packages.check) | Done | ci-local.ts:39, packages-check.ts:171-172 |
| Template default versionBump: patch | Done | rfc-0000-template.md:42 |
| AGENTS.md documentation | Done | AGENTS.md:247-252 |
| COMMANDS.md regenerated | Done | docs/COMMANDS.md |
| Build checks pass | Done | exit 0 for all 3 packages |

### Questions for the author

1. Should `PlatformConsistencyData` include `violations` in its interface so consumers can access them without a cast?
2. Why does the first-run path write the log file twice (lines 179 and 191)?
3. Can the PC-02/PC-03 RFC scanning loops be extracted into a shared helper to reduce duplication?
