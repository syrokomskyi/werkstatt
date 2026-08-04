---
reviewId: REVIEW-CODE-2026-08-04-01
date: 2026-08-04
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 15396b14...HEAD
filesReviewed:
  - packages/forge/src/profiles/profile-schema.ts
  - packages/forge/src/profiles/stack-profile.ts
  - packages/forge/os/core/core.module.ts
  - packages/forge/os/core/handlers/dev.ts
  - packages/forge/os/core/handlers/build.ts
  - packages/forge/os/core/handlers/validate.ts
  - packages/forge/os/core/handlers/profile-resolve.ts
  - packages/forge/os/core/handlers/lifecycle-handlers.test.ts
  - packages/forge/profiles/editframe-html.yaml
  - packages/forge/AGENTS.md
  - docs/rfcs/rfc-0674-profile-driven-lifecycle-commands-for-forge.md
  - docs/command-manifest.generated.yaml
---

# Code Review: 15396b14...HEAD (RFC-0674 profile-driven lifecycle commands)

### Verdict: Needs revision

The implementation is solid and well-structured, but three findings need attention: a SIGINT handler leak in `dev.ts`, a `--json` flag declared but not wired in all three handlers, and duplicated dry-run resolution logic across handlers.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/forge run build:check` passes, `rfc.validate --id RFC-0674` passes with 0 violations, 572 tests pass.

### Axis A — Structural correctness

**Finding A-1: `--json` flag declared but not wired in handlers.** All three command registrations declare a `json` flag (`"json": { kind: "boolean", ... }`), but none of the handlers read `input.flags["json"]` or use it to alter output. The `ForgeRuntimeContext` already has `outputFormat: "pretty" | "json"` which the kernel sets, so the flag is likely redundant — but per the AGENTS.md rule "CLI flags must be wired to behavior", a declared flag that is never read is dead code. Either remove the `json` flag from registrations (the kernel handles `--json` via `outputFormat`) or wire it explicitly in the handlers.

**Finding A-2: SIGINT handler leak in `dev.ts`.** At line 122, `process.on("SIGINT", ...)` registers a listener that is never removed. If `runDev` is called multiple times in the same process (e.g. in tests or programmatic usage), each call adds a new SIGINT listener that persists after the child process exits. Use `process.once("SIGINT", ...)` or remove the listener in the `close` and `error` handlers.

**Finding A-3: Duplicated dry-run and profile-override resolution.** The pattern `const dryRun = context.dryRun || input.flags["dry-run"] === true; const profileIdOverride = typeof input.flags["profile"] === "string" ? ...` is duplicated verbatim in `dev.ts`, `build.ts`, and `validate.ts`. Consider extracting to a shared `resolveLifecycleFlags(input, context)` helper in `profile-resolve.ts`.

### Axis B — DNA alignment

No issues. `satisfies: [DNA-54]` is correct — the RFC extends the profile-driven bindings principle. No hardcoded domain-specific literals in Forge source. The `devServer` field is domain-neutral and lives in profile YAML, not in code.

### Axis C — Ecosystem fit

No issues. Commands are registered in the correct module (`forgeCoreModule`). `AGENTS.md` is updated with the new commands. Command manifest is regenerated. Package boundaries are respected — handlers import only from `../../../src/` (portable) and `./profile-resolve.ts` (shared).

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths. The `devServer` field is a new optional field — existing profiles without it still validate and load correctly.

### Axis E — Agent-facing clarity

No issues. All new source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. Variable names are clear. Error messages include the profile id and actionable next steps.

### Axis F — Pragmatism

No issues. Three commands each earn their existence — dev is long-running, build produces output, validate checks output. The shared `profile-resolve.ts` avoids duplicating resolution logic. The `--dry-run` flag provides a test path without mocking.

### Axis G — Blind spots

**Finding G-1: `forge dev` SIGINT handler may conflict with parent process.** If `forge dev` is invoked from within another process that also handles SIGINT (e.g. a pipeline runner), the `process.on("SIGINT")` listener in `dev.ts` will fire alongside the parent's handler. This is a known limitation of long-running commands — consider documenting it or using `child.kill("SIGINT")` only without registering a process-level handler.

### Spec compliance

| Requirement from RFC-0674 | Status | Evidence |
| --- | --- | --- |
| `profileDevServerSchema` with command, port, readinessTimeout | Done | profile-schema.ts:132-136 |
| `devServer` in `stackProfileDomainFieldsSchema` | Done | profile-schema.ts:155 |
| `forge.dev` with --dry-run, --json, --profile | Done | core.module.ts:319-344 |
| `forge.build` with --dry-run, --json, --profile | Done | core.module.ts:346-370 |
| `forge.validate` with --dry-run, --json, --profile | Done | core.module.ts:372-396 |
| `forge dev --dry-run` prints resolved command | Done | Verified via CLI |
| `forge build --dry-run` prints resolved commands | Done | Verified via CLI |
| `forge validate --dry-run` prints resolved commands | Done | Verified via CLI |
| editframe-html.yaml devServer section | Done | editframe-html.yaml:17-19 |
| forge.profile.validate passes | Done | Verified via CLI |
| Unit tests for profile resolution | Done | lifecycle-handlers.test.ts |
| Unit tests for --dry-run | Done | lifecycle-handlers.test.ts |
| Unit tests for build execution | Done | lifecycle-handlers.test.ts |
| AGENTS.md updated | Done | packages/forge/AGENTS.md:16 |
| command.manifest.generate run | Done | docs/command-manifest.generated.yaml |
| rfc.validate passes | Done | 0 violations |

### Questions for the author

1. Should the `json` flag be removed from command registrations since the kernel handles `--json` via `outputFormat`, or should the handlers explicitly read it?
2. Is the SIGINT handler leak acceptable for a CLI command that typically runs once per process, or should `process.once` be used?
3. Would extracting the duplicated flag resolution into a shared helper be worth the indirection, or is the current explicit pattern preferable for readability?
