---
reviewId: REVIEW-CODE-2026-08-09-01
date: 2026-08-09
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: bae66b29~1...HEAD
filesReviewed:
  - packages/werkstatt-site/src/codegen/templates/service/src/middleware/markdown-negotiation.ts.template
  - packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/middleware.template.ts
  - packages/werkstatt-site/src/checks/agent/agent-markdown-negotiation.ts
  - packages/werkstatt-site/src/checks/agent/agent-markdown-negotiation.test.ts
  - packages/werkstatt-site/src/checks/command-tables/29-agent-surface.ts
  - packages/werkstatt-site/src/checks/pipelines/build-prepare.ts
---

# Code Review: RFC-0785 markdown content negotiation middleware

### Verdict: Needs revision

Two findings: duplicated `resolveMarkdownTwinPath` between handler and template, and `context.io.writeFile` used without content comparison (DNA-58 churn risk). The implementation is structurally sound and follows established patterns, but the duplication creates a drift hazard.

### Mechanical floor

Pass — no type errors in the new files. Pre-existing errors in `print-pdf.ts`, `print.ts`, `resolve-route.ts`, `anchors.ts`, `resolve-field-path.ts`, `language-redirect.ts`, `navigation.ts` are unrelated. 17/17 unit tests pass.

### Axis A — Structural correctness

- **A-1 (Duplicated Code)**: `resolveMarkdownTwinPath` is defined twice — once in `agent-markdown-negotiation.ts:55-71` (exported, for testing) and once in `markdown-negotiation.ts.template:30-41` (runtime, in the generated file). The functions are byte-identical except for the `export` keyword. The test suite tests the handler's copy, not the template's copy. If someone modifies one but not the other, tests pass but runtime behavior diverges. Consider removing the export from the handler and testing the template content directly, or extracting the function into a shared module that both the handler and template can import.

### Axis B — DNA alignment

- **B-1 (DNA-58 churn risk)**: `packages/AGENTS.md` states "Always use `writeFileIfChanged` for generated file writes" and "Do NOT use raw `writeFile` for generated files." The handler uses `context.io.writeFile` at `agent-markdown-negotiation.ts:92,108`, which follows the established agent handler pattern (all other agent handlers do the same). However, `context.io.writeFile` does not perform content comparison, so every regeneration cycle writes the file even if content is unchanged, creating git churn. This is a pre-existing pattern issue across all agent handlers, not specific to this RFC — but the new code perpetuates it.

### Axis C — Ecosystem fit

No issues. Command registered in the correct table (`29-agent-surface.ts`), pipeline placement is correct (after `page.markdown.generate` in both prod and dev pipelines), middleware chaining follows the established `sequence()` pattern. `COMMANDS.md` and `command-manifest.generated.yaml` regenerated via the proper generator commands.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no legacy paths. The `agent.enabled: false` case writes a no-op middleware (not a skip-and-remove) because the root `middleware.ts` statically imports it — this is the correct forward-only approach for statically-imported middleware.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding present in both new source files. `@ai-invariant` lines present in both template files. Variable and function names are descriptive.

### Axis F — Pragmatism

No issues. The middleware is ~30 lines of TypeScript. One new command, one template, one handler, one test file — minimal surface. The `NOOP_CONTENT` constant is a pragmatic solution for the `agent.enabled: false` case.

### Axis G — Blind spots

- **G-1 (Performance)**: The middleware runs on every GET request. The `Accept` header check is a fast string `includes()` before any `fetch()`. The `fetch()` only fires when `Accept: text/markdown` is present, which is rare (only agent requests). Performance impact is minimal. Documented in RFC Risks section.

### Spec compliance

| Requirement from RFC-0785 | Status | Evidence |
| --- | --- | --- |
| `agent.markdown-negotiation.generate` registered | Done | `29-agent-surface.ts:189-200` |
| Middleware template created | Done | `templates/service/src/middleware/markdown-negotiation.ts.template` |
| Middleware index amended | Done | `middleware.template.ts:25,37-38` |
| Pipeline integration | Done | `build-prepare.ts:112-113,215-216` |
| `agent.enabled: false` skip pattern | Done | `agent-markdown-negotiation.ts:89-101` (no-op middleware) |
| Unit tests for `resolveMarkdownTwinPath` | Done | `agent-markdown-negotiation.test.ts`, 17 tests |
| curl verification | Pending | Requires deploy |
| Vary: Accept header | Done | Template `:60` |
| isitagentready.com | Pending | Requires deploy |

### Questions for the author

1. The `resolveMarkdownTwinPath` function is duplicated between the handler (for testing) and the template (for runtime). How will you keep them in sync? Consider extracting to a shared module or testing the template content directly.
2. The `context.io.writeFile` calls do not perform content comparison (DNA-58). Is this acceptable because it follows the established agent handler pattern, or should this handler be the first to use `writeFileIfChanged`?
