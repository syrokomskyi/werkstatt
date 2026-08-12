---
rfcId: RFC-0813
auditId: AUDIT-RFC-0813-01
date: 2026-08-12
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0813

## Verdict: Needs revision

The RFC solves a real pain point (2–4 min wasted on missing Chromium before detection), but has a design error in the TypeScript contract (`isChromiumInstalled` must be async, not sync), an incomplete `packagesImpacted` list, and imprecise language about `mission.validate` being a "pipeline" when it is a command handler. Three blind spots need addressing: the "0ms" performance claim is inaccurate, launch failures are conflated with "not installed", and the distribution-reuse path is not considered.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0813 --json` returns 0 violations.

## Axis A — Structural completeness

- **A1 — `packagesImpacted` incomplete.** The RFC lists only `@warpgogol/werkstatt-site`, but `mission.validate` is implemented in `@warpgogol/werkstatt` (`packages/werkstatt/src/mission/mission-materialization-commands.ts`). The `changed` field lists `mission.validate` — the package that owns that command must appear in `packagesImpacted`.
- **A2 — File system table vague on mission.validate location.** The table row "Mission validate pipeline definition | Add as first step" does not name the actual file. It should read `packages/werkstatt/src/mission/mission-materialization-commands.ts | Insert preflight call at the top of runMissionValidate, before the distribution-reuse check`.
- **A3 — Acceptance criterion "Runs as first step of mission.validate" is imprecise.** `mission.validate` is a command handler, not a pipeline. The criterion should say "Runs as the first operation inside `runMissionValidate`, before the distribution-reuse check and before `build.prepare`."

## Axis B — DNA alignment

No issues. `kind: command`, `satisfies: []` — no DNA invariants claimed or conflicted.

## Axis C — Ecosystem fit

- **C1 — "Pipeline" language is incorrect.** The RFC repeatedly says "first step of `mission.validate`" and "Mission validate pipeline definition". `mission.validate` is a command handler (`runMissionValidate`) that calls `executeKernelPipeline` for `build.prepare`, `build.check`, and `build.post`. The preflight check is a direct function or `executeKernelCommand` call inside the handler — not a pipeline step. This distinction matters for implementation: pipeline steps are declared in pipeline definition files (`build-post.ts`, etc.), while inline calls are in the handler.
- **C2 — Package boundary.** `@warpgogol/werkstatt` is missing from `packagesImpacted` (see A1). The `ensureChromium` pure function is exported from `@warpgogol/werkstatt-site/src/checks/index.ts` — the RFC correctly identifies that package. But the consumer (`runMissionValidate`) is in `@warpgogol/werkstatt`, which must be listed.
- **C3 — Command registration location.** The RFC says `packages/werkstatt-site/src/checks/command-tables/*.ts` for registration. The existing `playwright.chromium.ensure` is registered in `infra-contracts.ts` — the RFC should name that specific file, not a glob.

## Axis D — Forward-only compliance

No issues. No backward compatibility layers, no shims, no dual-paths.

## Axis E — Agent-facing policy

No issues. Status gate is correct ("Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)"). No self-authorizing language. No NEEDS CLARIFICATION markers. No storage/persistence concerns.

## Axis F — Pragmatism

- **F1 — `isChromiumInstalled` signature is wrong.** The RFC declares `function isChromiumInstalled(workspaceRoot: string): boolean` (sync). But the existing detection logic in `ensureChromium` uses `await chromium.launch()` — an async operation. The signature must be `async function isChromiumInstalled(workspaceRoot: string): Promise<boolean>`. The kernel handler that calls it must also be async (which it already is in the RFC's contract).
- **F2 — Alternative not considered: `--check-only` flag on existing command.** The existing `playwright.chromium.ensure` already does a launch check first (lines 43–49 of `playwright-chromium-ensure.ts`). If the launch succeeds, it returns immediately with `{ installed: true, skipped: true }`. A `--check-only` flag that skips the auto-install fallback would achieve the same result without a new command. The RFC's Alternatives section does not consider this option. The RFC should justify why a new command is preferred over a flag.
- **F3 — `isChromiumInstalled` extraction may be premature.** The existing `ensureChromium` already has the launch-check as its first phase. Extracting it into a separate pure function adds a new export surface. An alternative is to call `ensureChromium` with a `checkOnly: true` option that throws instead of auto-installing. This avoids splitting the function while achieving the same fail-fast behavior.

## Axis G — Blind spots

- **G1 — "0ms" performance claim is inaccurate.** The RFC says "If installed: passes silently (0ms)" and "it adds ~0ms". The existing detection logic launches Chromium (`chromium.launch({ headless: true })`) and closes it (`browser.close()`). This takes 100–500ms, not 0ms. The RFC should state the actual cost or say "sub-second".
- **G2 — Launch failure ≠ "not installed".** The RFC says "Detection error: Treat as not installed — fail safe." But `chromium.launch()` can fail for reasons other than missing installation: sandbox dependency issues, missing shared libraries, display/GPU problems, corrupt downloads. Treating all launch failures as "not installed" produces a misleading error message ("Run: pnpm exec playwright install chromium") when the real fix might be `apt install libnss3` or similar. The RFC should distinguish "browser binary not found" from "browser launch failed" in the error message.
- **G3 — Distribution reuse path not considered.** `runMissionValidate` has a distribution-reuse fast path (lines 330–425) that skips the entire build cycle when `build-input-hash` matches. The preflight check should run **before** this reuse check, because the reuse path returns early without running `build.post`. But since the reused distribution already has `build.post` artifacts (PDFs, etc.), Chromium is not needed on the reuse path. The RFC should explicitly state that the preflight check is only needed on the full-build path, not the reuse path — or explain why it should run on both.

## Questions for the author

1. Should the preflight check use a new command (`playwright.preflight.check`) or a `--check-only` flag on the existing `playwright.chromium.ensure`? The existing command already does a launch check as its first phase — a flag would avoid adding a new command to the registry.
2. Should the preflight check run before or after the distribution-reuse check in `runMissionValidate`? If before, it adds a Chromium launch to every `mission.validate` call even when the distribution is reused. If after, it only runs when a full build is needed.
3. How should the error message distinguish "Chromium binary not found" (fix: `playwright install chromium`) from "Chromium launch failed" (fix: install OS dependencies like `libnss3`)? The current proposal conflates both into one message.
