---
rfcId: RFC-0608
auditId: AUDIT-RFC-0608-01
date: 2026-07-30
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0608

## Verdict: Needs revision

RFC корректно идентифицирует структурные слабости текущего alt-to-main gate и предлагает разумное решение (state machine + build identity file). Однако есть несколько находок: пропуск `leitstand.rollback` в `commands.changed`, отсутствие обновления DNA-49 в rollout, и — самое серьёзное — неразрешённая последовательность генерации open-source page vs записи `build-identity.json`.

## Mechanical validation (rfc.validate)

Pass. Одно warning V-30: `@warpgogol/ontology` в `packagesImpacted` без `breaksC: true`. Non-blocking — RFC расширяет enum, а не меняет external surfaces.

## Axis A — Structural completeness

- **CLI surface code fence inconsistency**: блок CLI surface (строка 157) использует 4-backtick fence (````sh) вместо 3-backtick (```sh), используемого в остальном RFC. Косметика, но непоследовательно.

## Axis B — DNA alignment

- **DNA-49 enforcement command list не обновляется.** `docs/architecture-dna.md:213` перечисляет enforcement commands: `leitstand.propagate`, `leitstand.status`, `leitstand.rollback`, `leitstand.health`. После этого RFC `leitstand.promote` становится новым enforcement command для DNA-49, но rollout (шаг 6) не упоминает обновление `docs/architecture-dna.md`. Поле `amends: []` — RFC расширяет enforcement mechanism для DNA-49, не меняя сам инвариант. Следует либо добавить RFC-0358 в `amends[]`, либо явно включить обновление DNA-49 entry в rollout.

- **`related[]` включает RFC-0587 без объяснения.** Тело RFC нигде не ссылается на RFC-0587. RFC-0587 —关于 leitstand preflight fixes, что связано, но связь не объяснена в Architectural fit или Context.

## Axis C — Ecosystem fit

- **`commands.changed` пропускает `leitstand.rollback`.** Rollout шаг 5 изменяет `leitstand.rollback` (новые state transitions: main rollback → `rolled-back`, alt rollback → `published`). Но `leitstand.rollback` отсутствует в `commands.changed` — там только `leitstand.propagate` и `release.prepare`. Command lifecycle metadata неполна.

- **`leitstand.status` не упомянут.** Risks section говорит "`leitstand.status` already shows channel state", но неясно, нужно ли обновлять `leitstand.status` для отображения новых release states (`alt-deployed`, `promoted`). Если `leitstand.status` показывает только registry channel state, а не release manifest state, то обновление может не потребоваться — но RFC должен это явно澄清.

## Axis D — Forward-only compliance

No issues. Hard break — `--channel` удаляется из `leitstand.propagate` без deprecation window. Legacy path удаляется, не сохраняется за флагом.

## Axis E — Agent-facing policy

No issues. Status gate корректный — draft RFC не даёт разрешения на реализацию. Implementation notes ссылаются на RFC-0224 и RFC-0334.

## Axis F — Pragmatism

- **`buildIdentitySchema` включает поля, которые не верифицируются.** `leitstand.promote` верифицирует только `releaseId`, `distTreeHash`, `behaviorSnapshotHash`, `siteContentHash`. Но schema также включает `platformVersion`, `platformSemanticHash`, `commitSha`, `buildTimestamp`, `semver`, `systemId`, `missionId`, `targetPlatform`. RFC должен clarify: какие поля verифицируются promotion gate, а какие включены только для отображения на open-source page.

## Axis G — Blind spots

- **Последовательность генерации open-source page vs `build-identity.json` не разрешена.** `open-source.generate` выполняется в `SITES_BUILD_PREPARE_PIPELINE` (`build-prepare.ts:76`) — во время сборки. `release.prepare` запускает build pipeline, затем вычисляет hashes, затем пишет `build-identity.json`. На момент выполнения `open-source.generate` файла `build-identity.json` ещё не существует. RFC говорит "populated from the same object during `release.prepare`'s post-build phase" — но не объясняет, как именно: (a) open-source page перемещается из `build.prepare` в post-build phase `release.prepare`? (b) `release.prepare` перегенерирует open-source page после записи `build-identity.json`? (c) другой механизм? Это design gap — без разрешения этой последовательности реализация заблокирована.

- **Alt deployment с чужим `build-identity.json`.** Failure modes table не рассматривает случай, когда alt deployment обслуживает `build-identity.json` от другого релиза. Проверка `releaseId` должна это поймать, но сценарий не описан явно в failure modes.

## Questions for the author

1. Какова точная последовательность: когда пишется `build-identity.json` и когда `open-source.generate` читает из него? Нужно ли переместить `open-source.generate` из `build.prepare` в post-build phase `release.prepare`, или `release.prepare` перегенерирует open-source page после записи `build-identity.json`?
2. Почему `leitstand.rollback` отсутствует в `commands.changed`, если rollout шаг 5 изменяет его state transitions?
3. Должен ли `docs/architecture-dna.md` DNA-49 entry быть обновлён (добавить `leitstand.promote` в enforcement command list), и если да — это `amends: [RFC-0358]` или отдельное действие в rollout?
