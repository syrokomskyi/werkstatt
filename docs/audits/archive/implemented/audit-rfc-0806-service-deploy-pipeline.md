---
rfcId: RFC-0806
auditId: AUDIT-RFC-0806-01
date: 2026-08-11
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0806

## Verdict: Needs revision

RFC-0806 proposes a well-structured 3-command service deployment pipeline that amends RFC-0751 with dev-deploy, promote, and rollback. However, two findings block approval: (1) `leitstand.service.deploy` is described as "becoming an alias for backward compatibility", which violates forward-only discipline; (2) the `--env-file` flag on `deploy.preflight` reverses RFC-0761's deliberate simplification without acknowledging or justifying the reversal.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0806 --json` exits 0 with zero violations.

## Axis A — Structural completeness

- **Decision** is present tense ("The platform gains…") — good.
- **CLI surface** shows exact invocations with flags — good.
- **TypeScript contracts** are minimal type signatures — good.
- **File system responsibilities** table names concrete paths — good.
- **Output format** documents the `--json` shape — good.
- **Failure modes** specifies exit codes and warn-vs-fail behavior — good.
- **Rollout** describes default behavior, adoption path, and new-service compliance — good.
- **Alternatives considered** has 5 real alternatives with rejection reasons — good.
- **Risks** includes agent misinterpretation risk and cost quantification — good.
- **Acceptance criteria** are checkable and cover the decision's scope — good.
- **Implementation notes** are explicit behavioral rules with file paths — good.

No issues.

## Axis B — DNA alignment

- `satisfies: [DNA-40]` — the RFC amends DNA-40 to allow leitstand-command-based deploy scripts. This is a valid extension of DNA-40 via `amends: [RFC-0751]`. The RFC body explains how it extends DNA-40 in the "DNA-40 amendment" section.
- The RFC does not establish a new DNA invariant — no new `## DNA-N` entry needed.
- `related: [DNA-40, RFC-0628, RFC-0751, RFC-0805]` — all relevant and non-decorative.

No issues.

## Axis C — Ecosystem fit

- **Package boundaries**: `packages/werkstatt` (leitstand commands) and `packages/werkstatt-site` (deploy.preflight) are correctly impacted. Imports flow `services/* → packages/*`.
- **Pipeline placement**: pre-deploy gates are named correctly (`service.naming.validate`, `service.registry.validate`, `services.check.run`, `build:check`, `deploy.preflight`).
- **Command lifecycle**: `commands.proposed` lists 3 new commands; `commands.changed` lists 2 existing commands; `commands.removed` lists 1 command. Internally consistent.
- **AGENTS.md updates**: the RFC identifies `services/AGENTS.md` for update (acceptance criterion line 495). Good.

No issues.

## Axis D — Forward-only compliance

- **Finding D-1**: Line 123 states `leitstand.service.deploy` "becomes an alias of `leitstand.service.promote` for backward compatibility." This is a **backward compatibility shim** — keeping an old command alive as an alias. Forward-only discipline (per `_shared/fo-pipeline-conventions.md` §Forward-only discipline) says: "no backward compatibility layers, no shims, no dual-paths. Legacy code paths are deleted, not maintained behind a flag." The RFC should either:
  - **Remove** `leitstand.service.deploy` entirely (callers switch to `leitstand.service.promote`), OR
  - **Keep it as an enhanced command** with its own behavior (not an alias), documenting that it's the production deploy command (functionally equivalent to promote but not described as an "alias for backward compatibility").

  The "alias for backward compatibility" framing is a forward-only violation. If `leitstand.service.deploy` and `leitstand.service.promote` do the same thing, one should be removed.

## Axis E — Agent-facing policy

- **Status gate**: no self-authorizing language found. The RFC correctly states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."
- **Implementation notes** reference correct governance rules (RFC-0224, RFC-0334).
- **NEEDS CLARIFICATION markers**: none found.
- **Storage policy**: lock file is file-based (`services/<id>/.deploy.lock`), not cookies/localStorage. Good.

No issues.

## Axis F — Pragmatism

- **Finding F-1**: The `--env-file` flag on `deploy.preflight` (line 297) reverses RFC-0761's deliberate simplification. RFC-0761 **removed** the `--env` flag from `deploy.preflight` — the current code at `packages/werkstatt-site/src/checks/env/deploy-preflight.ts:57-67` explicitly rejects `--env` with the message "deploy.preflight: --env flag is no longer supported. Use --secrets-file .env. See RFC-0761." The RFC proposes a new `--env-file` flag (different name, same concept) without acknowledging this history or justifying the reversal. The RFC should either:
  - Acknowledge that RFC-0761 removed `--env` and explain why `--env-file` is different (it selects the target file pair, not just the env var name), OR
  - Use a different mechanism (e.g. a `--dev` boolean flag that switches the target to `.env.dev`/`.env.dev.example`, avoiding a new file-path flag entirely).

- **Three new commands** each earn their existence — `dev-deploy`, `promote`, `rollback` map to distinct operational stages (dev testing, production deploy, undo). No command-that-could-be-a-flag.
- **Lock mechanism**: simple file-based lock with stale detection. No external dependency. Good.

## Axis G — Blind spots

- **Finding G-1**: The RFC does not discuss the performance cost of running 5 pre-deploy gates before every deploy. `services.check.run` orchestrates workspace validation, import rules, and runner validation — its execution time is not mentioned. For a quick iteration cycle (dev-deploy → test → fix → dev-deploy), 5 blocking gates may be slow. The RFC should estimate the cost or mention that gates run in sequence and their combined time is acceptable.

- **Finding G-2**: The `cron: ["* * * * *"]` (every minute) in `wrangler.dev.jsonc` is mentioned in Risks (line 468) but the mitigation ("dev Workers are only deployed when actively testing, not permanently") is weak — there's no mechanism to **undeploy** or pause the dev Worker. A dev Worker left running with a 1-minute cron will consume 1,440 requests/day. The RFC should mention `wrangler delete` as the cleanup step or suggest a longer cron interval (e.g. every 5 minutes).

- **Edge cases**: stale lock (10 min threshold) is addressed. Missing `wrangler.dev.jsonc` is addressed. Missing `.env.dev` is addressed. Good.

## Questions for the author

1. Should `leitstand.service.deploy` be **removed** (forward-only) or kept as a **distinct command** (not an "alias for backward compatibility")? If it does the same thing as `leitstand.service.promote`, one should be removed.
2. RFC-0761 deliberately removed the `--env` flag from `deploy.preflight`. Why is `--env-file` different enough to justify reversing that simplification? Would a `--dev` boolean flag be simpler?
3. What is the estimated combined execution time of the 5 pre-deploy gates? Is this acceptable for iterative dev-deploy cycles?
