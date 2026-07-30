---
rfcId: RFC-0594
auditId: AUDIT-RFC-0594-01
date: 2026-07-30
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0594

## Verdict: Needs revision

The RFC is architecturally sound and well-structured, but has two factual errors in the file system responsibilities table (wrong filenames), a missing explanation of how workspace-scoped `mission.git.commit` resolves app context for app-scoped validators, and a misleading description of "staged changes" that contradicts the actual `git add -A` auto-staging behavior.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **"Staged changes" language is misleading.** The RFC repeatedly says "staged changes" (lines 88, 187, 221) and instructs the operator to "re-stage them with `git add`" (line 187). But the actual `mission.git.commit` implementation auto-stages everything with `git add -A` (`@/packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts:242`). There is no manual staging step — the command stages all workpiece changes automatically. The failure mode description and acceptance criterion #4 ("staged changes remain staged") should be reworded to reflect that the command auto-stages all changes and the operator simply fixes files and re-runs the command.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-46]` is justified: the RFC extends the mission lifecycle enforcement chain by adding a content validation gate at commit time. `related` entries (DNA-46, DNA-47, RFC-0593, RFC-0480) are all relevant and correctly scoped as relationships rather than satisfactions.

## Axis C — Ecosystem fit

- **Wrong file paths in file system responsibilities table.** The RFC lists `packages/os/site-kernel-checks/src/pbp-content.ts` (line 156) but the actual file is `content-pbp.ts` (renamed per RFC-0471, confirmed in `@/packages/os/site-kernel-checks/src/content-pbp.ts:12`). Similarly, the RFC lists `packages/os/site-kernel-checks/src/semantic-drift.ts` (line 157) but the actual file is at `checks/semantic-drift.ts` (confirmed at `@/packages/os/site-kernel-checks/src/checks/semantic-drift.ts`). Only `faq.ts` (line 158) is correct.

- **App-scoped validators from workspace-scoped command.** All three validators are `scope: "app"` — they require app paths resolved from the kernel context (e.g., `requireAstroSitePaths(context)` in `semantic-drift.ts:28`, `getContentDisciplinePaths(context)` in `content-pbp.ts:45`). But `mission.git.commit` is registered as `scope: "workspace"` (`@/packages/os/site-kernel-handoff/src/mission/mission.module.ts:285`). The RFC does not explain how the workspace-scoped command resolves the app context (workpiece directory) needed by app-scoped validators. The existing `runMissionValidate` uses `executeKernelPipeline` with `siteName: manifest.systemId` (`@/packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:178-180`) — the RFC should specify the same or a similar mechanism.

- **Validator invocation mechanism is unspecified.** The RFC says "The call must use dynamic import or the kernel's command runner to avoid a static dependency cycle" (line 214) but does not commit to one approach. The existing pattern in `runMissionValidate` uses `executeKernelPipeline` for pipeline-based invocation. The RFC should specify whether pre-commit validators are invoked via `executeKernelPipeline`, direct dynamic import, or another mechanism, and justify the choice.

## Axis D — Forward-only compliance

No issues. No backward compatibility layers, no dual-paths, no deprecation.

## Axis E — Agent-facing policy

No issues. The RFC is `status: draft` and does not self-authorize. Implementation notes correctly reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation). No `--skip-validation` bypass is provided.

## Axis F — Pragmatism

- **Speculative `scope` field in `ValidatorMapping`.** The `scope: "app"` field (line 130) is `"app"` for all three mappings and serves no purpose in the current design. If all validators are app-scoped, the field is unnecessary. If future validators might have different scopes, the RFC should justify the field's existence; otherwise, remove it.

## Axis G — Blind spots

- **Validators scan entire directories, not just changed files.** The RFC implies targeted validation ("only validators whose corresponding content directories have changed files are run", line 99), but the validators themselves scan all files in the matched directory. `pbp.content.validate` calls `collectMarkdownFilesSafe` over the entire `businessDirectory` (`content-pbp.ts:26`); `semantic.drift.validate` calls `collectMarkdownFiles` over all page files (`checks/semantic-drift.ts:29`). The performance estimate ("targeted validators run in seconds", line 210) should reflect that the cost is proportional to the total number of files in the matched directory, not the number of changed files.

- **Missing validator handling.** The RFC does not specify what happens if a mapped validator is not registered in the kernel (e.g., `faq.validate` when the faq package is not installed). Should the commit proceed (skip with warning) or be refused? The `faq.validate` command is a no-op pass when no FAQ directory exists (`faq.ts:76`), but a missing command registration is different from an empty directory.

- **`build.prepare` dependency not addressed.** `runMissionValidate` runs `build.prepare` before validators because some validators depend on generated artifacts like `surface.generated.yaml` (`mission-materialization-commands.ts:170-174`). The RFC says "no full build" (line 202) but does not confirm that the three targeted validators (`pbp.content.validate`, `semantic.drift.validate`, `faq.validate`) do not depend on `build.prepare` artifacts. From code inspection, all three read markdown frontmatter directly and do not depend on generated artifacts — but the RFC should state this explicitly.

## Questions for the author

1. How does `mission.git.commit` (workspace-scoped) resolve the app context needed by app-scoped validators? Will it use `executeKernelPipeline` with `siteName: manifest.systemId` (like `runMissionValidate`), or will it construct a synthetic `KernelRuntimeContext` pointing to the workpiece directory?
2. What happens when a mapped validator command is not registered in the kernel (e.g., `faq.validate` in a system without the faq package)? Is the commit blocked, or is the missing validator silently skipped?
3. Should the `scope` field in `ValidatorMapping` be removed if all validators are app-scoped, or is there a concrete future use case for non-app-scoped pre-commit validators?
