---
reviewId: REVIEW-CODE-2026-07-23-01
date: 2026-07-23
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: 9fbb87b55...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/yaml-parse-validate.ts
  - packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts
  - packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts
  - packages/os/site-kernel-checks/src/pipelines/build-prepare.ts
  - packages/os/site-kernel-checks/src/pipelines/packages-check.ts
  - packages/os/site-kernel-checks/src/tests/yaml-parse-validate.test.ts
  - eslint.config.js
  - package.json
---

# Code Review: 9fbb87b55...HEAD (RFC-0493 implementation)

### Verdict: Approved

The implementation is structurally sound, well-typed, and follows existing patterns in the codebase. The `yaml.parse.validate` command correctly uses `parseAllDocuments` with `uniqueKeys: false` to preserve duplicate keys for AST-based detection. All 13 acceptance criteria are met with evidence. Two minor findings on Axis F do not block approval.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-checks exec tsc --noEmit` exits 0. All 370 tests pass including 4 new tests.

### Axis A — Structural correctness

No issues. Strict typing throughout — no `any`, no implicit casts. The `Record<string, unknown>` casts in `extractLinePos` and `findDuplicateKeys` are pragmatic for accessing properties on YAML library error/node objects that don't expose them in their public types. Error handling is correct — unreadable files are silently skipped (`catch { continue }`), which matches the pattern in `yaml-contract-lint.ts`. No dead code, no unreachable branches.

### Axis B — DNA alignment

No issues. DNA-42 (Compass markup): `MODULE_CONTRACT` and `CHANGE_SUMMARY` present in `yaml-parse-validate.ts`. DNA-6 (kebab-case): filename `yaml-parse-validate.ts` is kebab-case. No DNA violations.

### Axis C — Ecosystem fit

No issues. Pipeline placement is correct: `yaml.parse.validate` runs in `SITES_BUILD_PREPARE_PIPELINE` after `yaml.contract.lint` (build-prepare.ts:19-20) and in `PACKAGES_CHECK_PIPELINE` (packages-check.ts:177-178). Command registered in `infra-contracts.ts` with `scope: "workspace"` and `reads: ["**/*.yaml"]`. AGENTS.md (root) updated with YAML quoting policy reference. Ecosystem manifest regenerated.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths, no legacy code maintained behind flags. The command is introduced as `error` severity from the first deployment — no warning-mode transition period.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` includes `<purpose>`, `<non-goals>`, and `CHANGE_SUMMARY`. Variable names are self-documenting (`findDuplicateKeys`, `offsetToLine`, `extractLinePos`). No ungrounded assertions in comments — all references to the `yaml` library API are accurate.

### Axis F — Pragmatism

**Minor finding 1**: The `EXCLUDE_DIRS` set in `yaml-parse-validate.ts` (23 entries) partially duplicates the one in `yaml-contract-lint.ts` (31 entries). The values are intentionally different — `yaml.parse.validate` does NOT exclude `packages`, `docs`, `services`, `integrations`, `fleet`, `missions`, `systems` because those contain authored `.yaml` files needing validation. A shared base set plus per-command additions would reduce maintenance burden if the exclude list changes. Not blocking — the current approach is explicit and correct.

**Minor finding 2**: `offsetToLine` iterates character-by-character (O(n) per duplicate key). For large YAML files with many duplicates, this could be slow. In practice, duplicate keys are rare and YAML files in this repo are small (<100KB), so this is acceptable. A pre-computed line-offset array would be an optimization if performance becomes an issue.

### Axis G — Blind spots

No issues. Performance: 713ms for ~600 YAML files — documented in RFC. Edge cases: empty files produce empty docs (no errors, no duplicates), parse errors skip duplicate-key check (tree may be incomplete). Migration path documented in RFC rollout section. No security/privacy concerns — read-only validation.

### Spec compliance

| Requirement from RFC-0493 | Status | Evidence |
| --- | --- | --- |
| Register YAML-PARSE-01 and YAML-PARSE-02 | Done | core-infra.ts:492-502 |
| Implement yaml.parse.validate command | Done | yaml-parse-validate.ts, infra-contracts.ts:296-304 |
| Red/green test fixtures | Done | yaml-parse-validate.test.ts:75-98, 4 tests pass |
| Wire into SITES_BUILD_PREPARE_PIPELINE | Done | build-prepare.ts:19-20 |
| Wire into PACKAGES_CHECK_PIPELINE | Done | packages-check.ts:177-178 |
| Documentation in generated-file-governance.md | Done | generated-file-governance.md:91-148 |
| Root AGENTS.md reference | Done | AGENTS.md:209 |
| eslint-plugin-yml integration | Done | eslint.config.js:50-57, package.json:42 |
| Auto-fix in separate commit | Done | commit 3e0b14cf6 |
| RFC-0376 amendedBy backreference | Done | rfc-0376...md:30-31 |
| Ecosystem manifest regeneration | Done | commit ddf1471d8 |
| Acceptance criteria with evidence | Done | rfc-0493...md:322-334, all 13 checked |

### Questions for the author

1. The `EXCLUDE_DIRS` set is largely duplicated from `yaml-contract-lint.ts`. If the exclude policy changes (e.g., a new build artifact directory is added), both files need updating. Should a shared `BASE_EXCLUDE_DIRS` be extracted to `@warpgogol/share/fs` or a local constants module?
2. The `offsetToLine` function is O(n) per duplicate key. If a large YAML file (e.g., a generated registry) has many duplicates, this could be slow. Should a pre-computed line-offset array be used instead?
