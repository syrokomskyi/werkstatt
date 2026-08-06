---
rfcId: RFC-0713
auditId: AUDIT-RFC-0713-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0713

## Verdict: Needs revision

RFC корректно решает проблему изоляции R2-кредов per-bucket, но имеет несколько структурных и экосистемных замечаний: пустые `successSignals`/`nonGoals`, отсутствие `nachweis.ingest` в `commands.changed`, слишком специфичный acceptance criterion с жёсткой ссылкой на mission workpiece, и неотмеченная рассинхронизация имени bucket между RFC-0707 («nachweise») и кодом/RFC-0713 («nachweis»).

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0713` завершился с exit code 0, нарушений не найдено.

## Axis A — Structural completeness

1. **`successSignals: []` пуст** — должен содержать наблюдаемые сигналы реализации (например: «nachweis.ingest reads R2_NACHWEIS_* env vars», «evidence.sync unchanged with R2_* vars»). Отсутствие successSignals не позволяет оператору проверить реализацию по чек-листу.

2. **`nonGoals: []` пуст** — для focused RFC допустимо, но стоит явно указать: «Does not change evidence.sync env var contract», «Does not introduce per-site R2 credentials».

3. **`commands.changed: []` не содержит `nachweis.ingest`** — RFC утверждает «No new commands. Existing commands unchanged in flags/behavior. Only the env var contract changes», но изменение env var contract **является** поведенческим изменением `nachweis.ingest`: команда начинает читать `R2_NACHWEIS_*` вместо `R2_*`. Команда должна быть в `changed`.

4. **Acceptance criterion ссылается на конкретный mission workpiece** — критерий `missions/warpgogol-com-m000033/workpiece/.env.example` жёстко привязан к mission m000033, которая может не существовать на момент реализации. Следует сослаться на `.env.example` template или на общий паттерн `missions/*/workpiece/.env.example`.

5. **`reviewers: []` пуст** — допустимо для `draft`, но должно быть заполнено до `implemented` (V-25).

## Axis B — DNA alignment

No issues. `satisfies: []` не требуется для `kind: command` (RFC-0331). RFC не устанавливает новые DNA-инварианты и не конфликтует с существующими.

## Axis C — Ecosystem fit

1. **Имя bucket рассинхронизировано с RFC-0707** — RFC-0707 (line 76) говорит «bucket `nachweise`» (с «e» на конце), но код `nachweis-io.ts:30` использует `NACHWEIS_BUCKET = "nachweis"` (без «e»). RFC-0713 использует «nachweis» (совпадает с кодом, но не с RFC-0707). Это pre-existing несоответствие, но RFC-0713 должен его явно отметить и решить, какое имя каноническое.

2. **Amending archived RFC** — RFC-0707 находится в `docs/rfcs/archive/implemented/` со статусом `implemented`. Поле `amendedBy` в RFC-0707 пустое. Для обновления `amendedBy` потребуется редактировать архивный файл — следует подтвердить, что это разрешено governance rules.

3. **AGENTS.md update** — корректно отмечен в acceptance criteria и rollout. `packages/os/site-kernel-handoff/AGENTS.md` line 34 уже содержит: «Scope tokens to the `axiom-evidence` bucket only (least-privilege).» — это правило нужно расширить для per-bucket scoping.

4. **Package boundaries** — `packagesImpacted: ["@warpgogol/site-kernel-handoff"]` корректно. Все изменения в `r2-client.ts` и `nachweis-io.ts` находятся в этом пакете.

## Axis D — Forward-only compliance

No issues. RFC расширяет `resolveR2ConfigFromEnv` опциональным параметром с backward-compatible default. Это не dual-path и не compatibility shim — существующий вызов `evidence.sync` продолжает работать без изменений. Nachweis переходит на `R2_NACHWEIS_*` без grace period (функция не в production).

## Axis E — Agent-facing policy

1. **No NEEDS CLARIFICATION markers** — No issues.

2. **Implementation notes** — присутствуют и корректны. Ссылаются на правильные governance rules (RFC-0224, RFC-0330, RFC-0334).

3. **Status gate** — RFC не содержит self-authorizing language. No issues.

## Axis F — Pragmatism

1. **`envPrefix` approach** — минимален и следует существующему паттерну env var resolution. Не вводит новый API surface, расширяет существующую функцию. Good.

2. **Acceptance criterion `.env.example`** — слишком специфичный (см. Axis A finding 4). Should reference template or general pattern.

3. **Alternatives considered** — три реальные альтернативы с обоснованием rejection. Good.

## Axis G — Blind spots

1. **Operator confusion** — два набора R2 env vars вместо одного. RFC отмечает это в Risks и предлагает mitigation через `.env.example` comments. Достаточно.

2. **Migration path** — RFC отмечает, что nachweis не в production, поэтому migration low-risk. Good.

3. **Security** — RFC улучшает security (least-privilege isolation). Positive change.

4. **Edge case: both `R2_*` and `R2_NACHWEIS_*` set** — RFC явно указывает, что nachweis использует только `R2_NACHWEIS_*`. Если `R2_NACHWEIS_*` отсутствуют, `MissingEnvError` выбрасывается независимо от наличия `R2_*`. Поведение корректное.

## Questions for the author

1. Какое каноническое имя bucket: `nachweis` (код) или `nachweise` (RFC-0707 line 76)? RFC-0713 должен явно разрешить это расхождение.
2. Разрешено ли редактировать `amendedBy` в архивном RFC-0707 (`docs/rfcs/archive/implemented/`) для добавления RFC-0713?
3. Почему `nachweis.ingest` не указан в `commands.changed`? Изменение env var contract — это поведенческое изменение команды.
