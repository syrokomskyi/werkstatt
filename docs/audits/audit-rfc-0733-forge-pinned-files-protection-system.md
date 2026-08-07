---
rfcId: RFC-0733
auditId: AUDIT-RFC-0733-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0733

## Verdict: Needs revision

RFC-0733 structurally complete и семантически корректен — DNA-62 установлена, команда lifecycle консистентен, архитектурный fit с forge пакетом правильный. Однако 4 находки требуют исправления: `versionBump` противоречит заявлению о non-breaking, AGENTS.md updates не указаны, `.gitignore` для audit log не автоматизирован, и concurrent execution edge case не описан.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0733 --json` завершается с `ok: true`, нулевыми errors и warnings.

## Axis A — Structural completeness

**Находка A-1: `versionBump: minor` противоречит non-breaking заявлению.**

RFC declares `versionBump: minor` (frontmatter line 42), но в секции Rollout пишет "No migration, no breaking changes" и "Backward compatibility: Repositories without `.forge/pinned.yaml` are unaffected — forge commands behave exactly as before." Per RFC template, `minor` означает "Breaks-B, requires migrator." Поскольку feature opt-in и non-breaking для существующих репозиториев, `versionBump` should be `patch` (safe). Если новые команды (`pinned.validate`, `pinned.init`) считаются new functionality в SemVer minor sense, это нужно явно обосновать в RFC body — но текущий template определяет `minor` как "Breaks-B", что не соответствует содержанию.

**Остальные пункты — No issues.** Decision в present tense, CLI surface с exact invocations, TypeScript contracts минимальны, file system responsibilities с concrete paths, output format documents `--json` shape, failure modes с exit codes, alternatives с 5 реальными опциями, risks включает agent misinterpretation risk, acceptance criteria checkable, implementation notes с explicit behavioral rules.

## Axis B — DNA alignment

**No issues.** `satisfies: [DNA-62]` — DNA-62 добавлена в `docs/architecture-dna.md:263-265` в этой сессии. RFC body объясняет как enforcement работает (manifest, pre-check, pre-commit hook, CI). `related: [DNA-1, DNA-42, DNA-54]` — все существуют и релевантны. DNA-1 (Monorepo boundary) — pinned files защищают structural integrity репозитория. DNA-42 (Compass markup contract) — Compass source files являются structural necessities. DNA-54 (Forge bindings contract) — `forge.yaml` как foundational config. Конфликтов с существующими DNA нет.

## Axis C — Ecosystem fit

**Находка C-1: AGENTS.md updates не указаны.**

RFC пишет "AGENTS.md should state that overrides require explicit operator instruction" (Risks section), но не указывает какой AGENTS.md файл нужно обновить. `packages/forge/AGENTS.md` должен получить секцию о pinned-files system (новые команды `pinned.validate`, `pinned.init`, override policy, `.forge/` directory convention). Root `AGENTS.md` может получить упоминание `.forge/` directory convention в секции о repository structure. RFC должен явно перечислить AGENTS.md files needing updates в Rollout или Implementation notes.

**Находка C-2: `.gitignore` для audit log не автоматизирован.**

RFC пишет что `.forge/pinned-audit.log` "should be added to `.gitignore` or rotated periodically" (Override and audit log section), но не указывает кто это делает — `pinned.init` автоматически или operator вручную. Если `pinned.init` должна добавлять entry в `.gitignore`, это должно быть в acceptance criteria. Если operator — это должно быть в implementation notes как explicit step.

**Остальные пункты — No issues.** Package boundaries корректны (imports из `packages/forge` only). Pipeline placement правильный (pre-commit hook + CI, не build pipeline). Command lifecycle консистентен — `proposed` команды станут `added` при реализации, `changed` команды все зарегистрированы в registry (`docs.archive`, `rfc.archive`, `adr.archive`, `plan.archive`, `audit.archive`, `session.archive`, `mission.archive` — все verified в respective module files). Cosmic naming N/A — RFC не трогает manifests.

## Axis D — Forward-only compliance

**No issues.** RFC не предлагает compatibility shim, bridge, или dual-path. Opt-in protection (repos without manifest unaffected) — это не backward compatibility layer, а additive feature. No deprecation. No amendment to another RFC. No legacy code paths behind a flag.

## Axis E — Agent-facing policy

**No issues.** Status gate корректный — "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Implementation notes ссылаются на correct RFCs: RFC-0224 (accepted→implemented transition), RFC-0330 (verification evidence), RFC-0334 (supersede escalation) — все существуют в `docs/rfcs/archive/implemented/`. Anti-fabrication N/A — acceptance criteria только code changes. Storage policy корректна — YAML manifest + JSONL audit log, no cookies. No NEEDS CLARIFICATION markers.

## Axis F — Pragmatism

**No issues.** `pinned.validate` и `pinned.init` — каждый зарабатывает своё существование (enforcement и setup). TypeScript contracts минимальны. Alternatives section обсуждает 5 реальных альтернатив с rejection reasons. `packagesImpacted` содержит только `@warpgogol/forge`. `nonGoals` explicit и meaningful (force-push, encryption, files outside repo, code review replacement).

## Axis G — Blind spots

**Находка G-1: Concurrent audit log appends не описаны.**

RFC упоминает "two agents" в edge cases, но не описывает что происходит когда два агента одновременно пишут в `.forge/pinned-audit.log`. Append-only writes на некоторых filesystems могут interleave или терять entries. Нужно указать: используется ли `fs.appendFile` с atomic flag, или file locking, или accepted best-effort (entries могут тераться, но это acceptable для audit log).

**Остальные пункты — No issues.** Performance указан (O(n), n < 50). False positives описаны (directory moves, mitigation через `--allow-pinned-override`). Edge cases рассмотрены (empty states — repos without manifest, interrupted operations — manifest tampering). Migration path документирован (`forge pinned.init`). Security/privacy N/A — no user data, PII, or external services.

## Questions for the author

1. Должна ли `pinned.init` автоматически добавлять `.forge/pinned-audit.log` в `.gitignore`, или operator делает это вручную? Если автоматически — добавь в acceptance criteria.
2. Что происходит если агент удаляет `.forge/pinned.yaml` и коммитит с `--no-verify` — CI ловит, но какова процедура восстановления? Опиши recovery steps в Failure modes или Implementation notes.
3. Должна ли `pinned.init` быть idempotent (merging defaults with existing entries), и что происходит если operator удаляет default entry, которую forge ожидает найти? Опиши merge semantics в CLI surface.
