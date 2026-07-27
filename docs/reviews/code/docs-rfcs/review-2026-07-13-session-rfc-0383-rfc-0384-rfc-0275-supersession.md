# Code Review — Session: RFC-0383, RFC-0384, RFC-0275 supersession

**Date:** 2026-07-13 **Reviewer:** Cascade (fo-review skill) **Diff:** `git diff e67ac36c3~1..e67ac36c3` — commit `e67ac36c3` **Files:** 3 RFC markdown files (507 insertions, 4 deletions) **Verdict:** **approved with findings** — 2 errors, 1 warning, 3 notes

---

## Mechanical floor

| Check                          | Result                |
| ------------------------------ | --------------------- |
| `rfc.validate RFC-0383`        | pass (0 violations)   |
| `rfc.validate RFC-0384`        | pass (0 violations)   |
| `rfc.validate RFC-0275`        | pass (0 violations)   |
| TypeScript build               | N/A — no code changes |
| Affected package `build:check` | N/A — no code changes |

All three RFCs pass schema validation, referential integrity (V-12 bidirectional supersession: RFC-0384 `supersedes: [RFC-0275]` ↔ RFC-0275 `supersededBy: RFC-0384`), and date consistency (V-16: `superseded` requires `closedAt` — set to 2026-07-13).

---

## Semantic axes

### Axis A — Structural correctness

**PASS.** Both RFCs follow the full template (10 sections). Frontmatter is complete. TypeScript contracts are minimal and well-shaped. No dead code, no duplicated logic.

### Axis B — DNA alignment

**PASS.**

- **DNA-39** (route registry as merge of route sources): both RFCs correctly cite this in `related`. The commands are read-only consumers of the existing `surface.generated.yaml` artifact — no new route source.
- No DNA invariants are violated. The `satisfies` field is empty, which is correct for `kind: command` RFCs (not required for command kind, only for architecture/contract per RFC-0331).

### Axis C — Ecosystem fit and forward-only discipline

**2 ERRORS, 1 WARNING.**

#### ERROR-1 — Scope mismatch in both RFCs

**RFC-0383** `@/docs/rfcs/rfc-0383-add-surface-graph-validate-for-seo-link-structure-diagnostics.md:6` Frontmatter declares `scope: workspace`, but the design section says "Workspace-scoped: run for a single app." This is contradictory. All existing surface commands (`surface.generate`, `surface.validate`, `surface.evidence.validate`, etc.) are `scope: "app"` in the command table at `@/packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts:52`. The command accepts `--app <name>` and operates on a single app's artifact.

**Fix:** Change `scope: workspace` → `scope: app` in frontmatter. Change "Workspace-scoped: run for a single app" → "App-scoped: run for a single app" in the design section.

**RFC-0384** `@/docs/rfcs/rfc-0384-add-surface-plan-generate-for-pre-build-sizing-visibility-and-supersede-rfc-0275.md:6` Same issue: frontmatter declares `scope: workspace`, but the design says "The command is app-scoped." `surface.generate` (which RFC-0384 modifies) is `scope: "app"`.

**Fix:** Change `scope: workspace` → `scope: app` in frontmatter.

#### ERROR-2 — Pipeline names do not match codebase

**RFC-0383** `@/docs/rfcs/rfc-0383-add-surface-graph-validate-for-seo-link-structure-diagnostics.md:181,203` References `APPS_BUILD_CHECK_PIPELINE`. The actual pipeline constant is `SITES_BUILD_CHECK_PIPELINE` (see `@/packages/os/site-kernel-checks/src/pipelines/build-check.ts:19`).

**RFC-0384** `@/docs/rfcs/rfc-0384-add-surface-plan-generate-for-pre-build-sizing-visibility-and-supersede-rfc-0275.md:232,258` References `APPS_BUILD_PREPARE_PIPELINE`. The actual pipeline constant is `SITES_BUILD_PREPARE_PIPELINE` (see `@/packages/os/site-kernel-checks/src/pipelines/build-prepare.ts:15`).

**Fix:** Replace `APPS_BUILD_CHECK_PIPELINE` → `SITES_BUILD_CHECK_PIPELINE` and `APPS_BUILD_PREPARE_PIPELINE` → `SITES_BUILD_PREPARE_PIPELINE` in both RFCs.

#### WARNING-1 — RFC-0383 `packagesImpacted` may be overstated

**RFC-0383** `@/docs/rfcs/rfc-0383-add-surface-graph-validate-for-seo-link-structure-diagnostics.md:34` Lists `"@gogol/surface"` in `packagesImpacted`. The command only reads the artifact and creates a new handler in `@gogol/site-kernel-checks`. No `@gogol/surface` source files are modified unless the TypeScript types (`GraphDiagnostic`, `SurfaceGraphReport`) are placed there. The RFC doesn't specify where the types live. If they live in `@gogol/site-kernel-checks`, then `@gogol/surface` is not impacted.

**Recommendation:** Clarify in the design section where the TypeScript types are defined. If in `@gogol/site-kernel-checks`, remove `"@gogol/surface"` from `packagesImpacted`. If in `@gogol/surface` (for reuse by other consumers), add a note explaining why.

### Axis D — Agent clarity

**PASS with 1 NOTE.**

#### NOTE-1 — `@/` path prefix in RFC-0383

**RFC-0383** `@/docs/rfcs/rfc-0383-add-surface-graph-validate-for-seo-link-structure-diagnostics.md:65` Uses `@/packages/os/site-kernel-checks/src/surface/validate.ts` — the `@/` prefix is not standard in this repo's RFCs. Existing RFCs use bare relative paths like `packages/os/site-kernel-checks/src/surface/validate.ts`. Minor style inconsistency, not a violation.

### Axis E — Pragmatism

**PASS.** The supersession rationale is thorough and well-grounded. Each dropped criterion cites concrete evidence (file paths, line numbers, existing RFCs). The extraction of AC-8 and AC-1/AC-2 into separate focused RFCs is the correct architectural decision — it avoids implementing premature optimizations while preserving actionable ideas.

### Axis F — Anti-patterns

**PASS.** No anti-patterns triggered.

### Axis G — Documentation and Compass sync

**PASS with 2 NOTES.**

#### NOTE-2 — RFC-0275 `related` list not updated

**RFC-0275** `@/docs/rfcs/rfc-0275-scale-programmatic-surface-generation-with-record-driven-sharded-artifacts.md:18-25` The `related` list does not include `RFC-0383` or `RFC-0384`. RFC-0383 and RFC-0384 both list RFC-0275 in their `related`. This is not a validation violation (V-18 checks that `related[]` entries resolve, not bidirectionality), and superseded RFCs are generally frozen. The supersession notice block in the body provides the cross-reference. Acceptable as-is.

#### NOTE-3 — RFC-0275 `commands.proposed` still lists `surface.plan.generate` and `surface.graph.validate`

**RFC-0275** `@/docs/rfcs/rfc-0275-scale-programmatic-surface-generation-with-record-driven-sharded-artifacts.md:28-29` The `commands.proposed` field still lists `surface.plan.generate` and `surface.graph.validate`. These are now proposed by RFC-0383 and RFC-0384 respectively. This is not a validation violation (the command lifecycle check tracks `proposed`/`added`/`changed`/`removed` per RFC, and RFC-0275 never reached `added`). The superseded status makes this moot. Acceptable as-is.

---

## Summary

| Severity | Count | Items                                                                   |
| -------- | ----- | ----------------------------------------------------------------------- |
| Error    | 2     | ERROR-1 (scope mismatch), ERROR-2 (pipeline names)                      |
| Warning  | 1     | WARNING-1 (packagesImpacted overstatement)                              |
| Note     | 3     | NOTE-1 (`@/` prefix), NOTE-2 (related list), NOTE-3 (commands.proposed) |

**Recommendation:** Fix ERROR-1 and ERROR-2 before moving these RFCs from `draft` to `accepted`. WARNING-1 should be resolved during implementation planning. Notes are informational.

The supersession of RFC-0275 is clean: bidirectional `supersedes`/`supersededBy` is correct, `closedAt` is set, the body has a detailed supersession notice, and RFC-0384 contains a thorough criterion-by-criterion resolution table. The extraction strategy (two focused command RFCs instead of one monolithic architecture RFC) is architecturally sound.
