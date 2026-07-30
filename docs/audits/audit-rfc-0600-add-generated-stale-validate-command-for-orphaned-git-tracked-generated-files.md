---
rfcId: RFC-0600
auditId: AUDIT-RFC-0600-01
date: 2026-07-30
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0600

## Verdict: Needs revision

The RFC addresses a real gap (inverse check of `generated.files.validate`), but the algorithm has two critical blind spots that would produce massive false positives: (1) `preview.images.generate` writes per-page PNGs to `public/preview/{lang}/{slug}.png` but the ownership map only registers `public/og-image.png`, so ALL per-page preview images would be flagged as stale; (2) scanning `src/` without exempting authored content files (`src/content/pages/`, `src/content/prose/`, `src/content/business-profile/`, etc.) would flag every authored `.md` file as stale since they are not in `GENERATOR_OWNERSHIP_MAP`. Additionally, the `--no-stale-validate` bypass flag has no existing pattern in the codebase, and the `ok()`/`fail()` API referenced in implementation notes does not exist in `result-helpers.ts`.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0600 --json` exited 0 with zero violations.

## Axis A — Structural completeness

- **`StaleFileDiagnostic` interface uses `fix` but existing `Diagnostic` type uses `fixHint`.** The codebase `Diagnostic` type (from `@warpgogol/site-kernel`) uses `fixHint` for fix suggestions. The RFC's `StaleFileDiagnostic` introduces a parallel `fix` field. The RFC should use the existing `Diagnostic` type directly with `fixHint` — no custom interface is needed.
- **Implementation notes reference non-existent API.** The RFC says "returned via `ok(cmd)` / `fail(cmd, violations)` from `./shared.ts`" but `result-helpers.ts` exports `passResult()`, `failResult()`, `diagnosticsResult()`, and `resultFromViolations()` — there is no `ok()` or `fail()` function. The correct helpers are `diagnosticsResult()` (for rich `Diagnostic[]`) or `resultFromViolations()` (for string violations).
- **Output format example uses `violations[]` but `CheckResult` uses `diagnostics[]`.** The JSON output example shows a `violations` array, but the canonical `CheckResult` shape (RFC-0203) uses `diagnostics[]` with `{ ruleId, severity, file, message, fixHint }` fields. The RFC should show the actual `CheckResult` shape.

## Axis B — DNA alignment

- **DNA-18 connection is tenuous.** DNA-18 states "Uni registry is the single UI index" — it refers to `uni.registry.yaml` generated from `manifest.yaml` files. `GENERATOR_OWNERSHIP_MAP` is a separate static ownership map in `generator-ownership.ts`, not the Uni registry. The RFC's claim that it "extends the registry's authority" is a stretch — the ownership map and the Uni registry are different artifacts. Consider whether DNA-18 is the right invariant to cite, or whether the RFC should reference RFC-0087 (content-driven generation contract) as the primary alignment instead.

## Axis C — Ecosystem fit

- **`--no-stale-validate` bypass flag has no existing pattern.** No per-command bypass flags exist in the codebase. The pipeline runner (`executeKernelCommand`) does not support `--no-<command-name>` flags. The RFC proposes this flag in the Rollout section but does not describe how it would be implemented — is it a pipeline-level flag, a command-level flag, or a global kernel flag? This needs a design decision.
- **`SITES_BUILD_PREPARE_DEV_PIPELINE` not mentioned.** RFC-0597 introduced a dev-mode subset pipeline. The file system responsibilities table mentions `build-prepare.ts` but only references `SITES_BUILD_PREPARE_PIPELINE`. If the command should also run in dev mode, it needs to be added to `SITES_BUILD_PREPARE_DEV_PIPELINE` as well. If not, the RFC should state why.
- **`build.check` mentioned but not specified.** The Rollout says "The command runs as a step in `build.prepare` (after `generated.files.validate`) and in `build.check`." But the file system responsibilities table only lists `build-prepare.ts`. The `SITES_BUILD_CHECK_PIPELINE` (in `build-check.ts`) is not listed. If the command should also run in `build.check`, that file needs to be listed.
- **Pipeline placement is correct for `build.prepare`.** Adding after `generated.files.validate` (line 121 of `build-prepare.ts`) is the right position — it's the last step in the pipeline, after all generators have run.

## Axis D — Forward-only compliance

No issues. The RFC is a new command with no backward compatibility concerns. No shims, no dual-paths, no legacy maintenance behind a flag.

## Axis E — Agent-facing policy

- **Status gate is correct.** The RFC says "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." This follows the standard governance protocol.
- **RFC-0224 reference is correct.** The accepted→implemented transition is properly referenced.
- **Anti-fabrication is not applicable** — the RFC is a code-only command, no content authoring involved.

## Axis F — Pragmatism

- **`StaleFileDiagnostic` interface is unnecessary.** The existing `Diagnostic` type already has `ruleId`, `severity`, `file`, `message`, and `fixHint` fields. The RFC should use `Diagnostic[]` with `diagnosticsResult()` directly — no custom interface needed.
- **Command earns its existence.** The inverse check (stale files) is genuinely different from the forward check (`generated.files.validate`). Extending `generated.files.validate` with a `--check-stale` flag would mix two different algorithms. A separate command is the right choice.
- **`public.managed.clean` rejection is well-justified.** The alternatives section correctly explains why extending `public.managed.clean` (which is specifically for markdown twins, RFC-0166) would bloat its scope.

## Axis G — Blind spots

- **CRITICAL: Per-page preview images are not in the ownership map.** `preview.images.generate` writes to `public/preview/{lang}/{fileSlug}.png` (see `preview-images.ts:91` and `:339`), but `GENERATOR_OWNERSHIP_MAP` only registers `public/og-image.png` (line 378 of `generator-ownership.ts`). The RFC's success signal says "detects preview PNG files for deleted pages as stale" — but the algorithm would flag ALL per-page preview images as stale, including those for existing pages. The RFC must either: (a) add `public/preview/{lang}/{route}.png` to `GENERATOR_OWNERSHIP_MAP` as a separate change, or (b) the algorithm must resolve per-page preview images by checking if the owning content page still exists, not by checking the ownership map.
- **CRITICAL: Scanning `src/` without authored-content exemption.** The algorithm scans all git-tracked files in `src/` and flags any file not in the ownership map as stale. But `src/` contains authored content files (`src/content/pages/{lang}/*.md`, `src/content/prose/{lang}/*.md`, `src/content/business-profile/{lang}/*.md`, `src/content/sections/**`, `src/content/components/**`, `src/content/features/**`, `src/content/people/{lang}/*.md`, `src/content/faq/{lang}/*.md`, etc.) that are NOT in the ownership map — they are authored, not generated. The algorithm would flag every authored content file as stale. The RFC must either: (a) limit the scan to `public/` only, or (b) add an authored-content exemption directory list (e.g., `src/content/` minus generated overlays).
- **`git ls-files` is a new pattern.** No existing validator in the codebase uses `git ls-files`. All existing validators use `collectFiles` from `@warpgogol/share/fs` for filesystem traversal. Using `git ls-files` introduces a git dependency in the validator — it would fail in non-git environments (e.g., extracted Notausgang exports). The RFC should justify why `git ls-files` is needed instead of filesystem traversal, or use `collectFiles` like existing validators.
- **Static asset allowlist is undefined.** The algorithm says "known static directories like `public/textures/` are exempted" but does not define the allowlist mechanism. Is it hardcoded? Is it configurable via `.assetsignore`? The `.assetsignore` file is a generated file owned by `public.infrastructure.generate` — it's a deployment configuration file, not a static-asset allowlist. The RFC needs to define the allowlist mechanism precisely.
- **`bordbuch.generate` and `passport.key.rotate` outputs.** The RFC's Context section mentions `public/.well-known/bordbuch.json`, `public/.well-known/bordbuch/index.html`, and `public/.well-known/cosmic-passport-key.json` as "separate-command outputs" that are "not in `build.prepare`". But these ARE in `GENERATOR_OWNERSHIP_MAP` (lines 386-396 and 370-374 of `generator-ownership.ts`). The RFC classifies them as a "pipeline completeness issue (RFC-0604)" but they are actually in the ownership map — the algorithm would NOT flag them as stale. The RFC's context section is misleading.
- **Performance claim is reasonable** — `git ls-files` on a site with hundreds of tracked files is fast, but the ownership map expansion with glob patterns could be slow if not cached. The RFC should note that the expansion reuses the same `expandGlob` logic from `generated-files-validate.ts`.

## Questions for the author

1. How will the algorithm distinguish per-page preview images (`public/preview/{lang}/{slug}.png`) for deleted pages from those for existing pages, given that the ownership map only registers `public/og-image.png` and not per-page preview images?
2. What is the authored-content exemption strategy for `src/`? Will the scan be limited to `public/` only, or will there be an explicit exemption list for `src/content/` authored files?
3. How will the `--no-stale-validate` bypass flag be implemented given that no per-command bypass flag pattern exists in the pipeline runner? Is it a kernel-level flag, a pipeline-level flag, or something else?
