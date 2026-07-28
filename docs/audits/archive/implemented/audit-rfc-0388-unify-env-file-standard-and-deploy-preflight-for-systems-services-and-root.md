---
rfcId: RFC-0388
auditId: AUDIT-RFC-0388-01
date: 2026-07-15
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0388

## Verdict: Needs revision

The RFC is structurally sound and addresses a real gap, but has three failures: (1) it does not update DNA-40 which still references `.env.production` and `apps/*` — the RFC supersedes RFC-0346 but leaves the DNA invariant stale; (2) it omits three existing commands (`lagebild.worker.dev.vars.generate`, `lagebild.worker.dev.vars.validate`, `lagebild.worker.deploy`) from the `commands.changed` / `commands.removed` buckets; (3) it does not address the `lagebild.worker.dev.vars.validate` pipeline entry in `sites-check-author.ts`.

## Mechanical validation (rfc.validate)

Pass — 0 violations, 0 warnings.

## Axis A — Structural completeness

No issues. All required sections are present with real content. Decision is in present tense. CLI surface shows exact invocations. TypeScript contracts are minimal. File system responsibilities table names concrete paths. Output format documents the `--json` shape. Failure modes specifies exit behavior. Rollout describes default behavior and adoption path. Alternatives section has five real alternatives with rejection reasons. Risks includes agent misinterpretation and false-positive discussion. Acceptance criteria are checkable. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

**FAIL — DNA-40 not updated.** The RFC `satisfies: [DNA-40]` and `supersedes: [RFC-0346]`, but DNA-40 (`docs/architecture-dna.md:175-177`) still reads:

> Every `apps/*` and `services/*` project … `apps/*` projects with `.env.example` MUST also have `.env` (local/alt) and `.env.production` (main/deploy) on disk. `apps/*/package.json` MUST contain the six canonical deploy scripts …

This directly contradicts RFC-0388's Rule 1 (`.env.alt` / `.env.main` for `systems/*`, no `.env.production`) and Rule 7 (renamed commands). The RFC must either:

- Update DNA-40 in the same implementation to reflect the new file names and `systems/*` scope, or
- Explicitly state in the RFC body that DNA-40 is amended by this supersede and must be rewritten during implementation.

The `related[]` entries (DNA-1, DNA-2) are relevant and not decorative.

## Axis C — Ecosystem fit

**FAIL — three existing commands not accounted for in `commands` buckets.** The RFC eliminates `.dev.vars` / `.dev.vars.example` (Rule 8) but does not list the following commands in `commands.changed` or `commands.removed`:

1. `lagebild.worker.dev.vars.generate` — generates `.dev.vars.example`. If `.dev.vars` is eliminated, this command must be changed (to generate `.env.example`) or removed.
2. `lagebild.worker.dev.vars.validate` — validates `.dev.vars.example` for leaked values. If `.dev.vars` is eliminated, this command must be removed (its function is subsumed by `env.contract.validate` / `env.example.validate`).
3. `lagebild.worker.deploy` — currently runs `npx wrangler deploy` without `--secrets-file`. RFC-0388 Rule 6 says services deploy with `--secrets-file .env`, but this command is not listed in `commands.changed`.

Additionally, `lagebild.worker.dev.vars.validate` is registered in the `sites-check-author.ts` pipeline (`@/c:/projects/warpgogol/warpgogol-4/packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts:211`). The RFC's Rollout section does not mention removing or replacing this pipeline entry.

**Minor — `env.example.validate` not listed in `commands.changed`.** The existing `env.example.validate` command (in `env-example.ts:305-339`) checks for non-empty values in `.env.example`. The RFC adds a `# How to obtain:` enforcement rule (Rule 3, `ENV-CONTRACT-05`), but `env.example.validate` is not listed in `commands.changed`. It's unclear whether the new rule lives in `env.contract.validate` or `env.example.validate`. The RFC body says `env.contract.validate` enforces it (Rule 3), but the `commands.changed` list only includes `env.contract.validate` — so this is consistent. However, the generator (`env.example.generate`) is listed in `commands.changed`, which is correct.

**Minor — Compass sync not mentioned.** The RFC changes repository-wide requirements (env-file naming, deploy scripts). Per root AGENTS.md Compass document duties, `docs/requirements.xml` and `docs/technology.xml` may need synchronization. The RFC's Rollout section does not mention Compass XML updates.

## Axis D — Forward-only compliance

No issues. The RFC explicitly states "clean break" — no backward compatibility with `.env.production` or `.dev.vars`. Legacy code paths are removed, not maintained behind a flag. The `nonGoals` section explicitly states "Does not support backward compatibility."

## Axis E — Agent-facing policy

No issues. The RFC does not contain self-authorizing language. Implementation notes reference RFC-0224, RFC-0330, RFC-0334 correctly. The status gate is respected — the RFC is `draft` and implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."

## Axis F — Pragmatism

**Minor — `deploy.preflight` interface for root is ambiguous.** The RFC shows `deploy.preflight --root` in Question 14 of the grilling session but not in the RFC body's CLI surface section. The CLI surface only shows `--site` and `--service` examples. If root preflight is needed, it should be documented; if not, it should be explicitly excluded.

**Minor — `env.alt.check` and `env.main.check` as separate commands.** These could be flags on a single `env.deploy.check --env alt|main` command. However, the existing pattern (`env.local.check`, `env.production.check`) uses separate commands, so maintaining the same pattern is reasonable.

## Axis G — Blind spots

**Minor — `lagebild.worker.deploy` currently spawns `npx wrangler deploy` without `--secrets-file`.** The RFC's Rule 6 says services deploy with `--secrets-file .env`, but the existing `lagebild.worker.deploy` handler (`@/c:/projects/warpgogol/warpgogol-4/packages/os/site-kernel/src/lagebild/handlers.ts:438`) uses `spawn("npx", ["wrangler", "deploy"])`. The RFC should explicitly state that this handler must be updated to include `--secrets-file .env` and the preflight call.

**Minor — performance of `deploy.preflight`.** The RFC states parsing a small `.env` file is "sub-millisecond" — this is accurate. No performance concern.

**Minor — migration path for operator.** The Risks section correctly notes that env files are gitignored and the migration is manual. The Rollout mentions `env.alt.check` / `env.main.check` creating missing files from `.env.example`. This is sufficient.

## Questions for the author

1. DNA-40 still references `.env.production` and `apps/*` — should the implementation update DNA-40 in `docs/architecture-dna.md` to reflect the new `.env.main` / `.env.alt` / `systems/*` standard, or should the RFC body explicitly state that DNA-40 is rewritten by this supersede?
2. What happens to `lagebild.worker.dev.vars.generate` and `lagebild.worker.dev.vars.validate`? Should they be removed entirely (their function is subsumed by `env.example.generate` / `env.contract.validate`), or should `lagebild.worker.dev.vars.generate` be renamed to generate `.env.example` instead?
3. Should `lagebild.worker.deploy` be listed in `commands.changed` and updated to pass `--secrets-file .env` and call `deploy.preflight`? Or should the service's `package.json` `deploy` script be the canonical deploy path, making `lagebild.worker.deploy` redundant?
