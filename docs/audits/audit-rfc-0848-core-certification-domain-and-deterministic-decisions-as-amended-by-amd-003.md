---
rfcId: RFC-0848
auditId: AUDIT-RFC-0848-01
date: 2026-08-14
auditor:
  skill: fo-idea-audit
  model: gpt-5.6-sol
verdict: rejected
---

# Аудит: RFC-0848

## Вердикт: Отклонён

Выбранный чистый forward-only переход последователен, а механическая валидация проходит. Однако RFC прямо заменяет действующие модели DNA-48, DNA-49 и DNA-73, оставляя `supersedes: []`; до формального устранения двух одновременно нормативных моделей этот документ нельзя принимать или отдавать агенту на реализацию.

## Механическая валидация (`rfc.validate`)

Пройдена: `rfc.validate --id RFC-0848 --json` вернул `status: pass`, 0 нарушений и 0 неразрешённых маркеров. Связанная спецификация также прошла `spec.validate --spec=werkstatt-release-certification --json` без нарушений.

## Ось A — Структурная полнота

1. Раздел CLI перечисляет изменяемое поведение, но не даёт точных вызовов, обязательных флагов и scope для десяти затрагиваемых команд (`RFC-0848:160-189`). Слабый агент не сможет однозначно восстановить, например, формы `release.validate`, `release.rollback` и каждой команды Leitstand только из этого RFC.

2. Критерий приёмки на строках 548-549 использует неопределённые множества (`applicable Compass XML`, `package/root agent documentation`, `generated-drift checks`). Такие формулировки нельзя проверить бинарно: RFC должен назвать каждый файл и каждую точную команду.

## Ось B — Соответствие Architecture DNA

1. Блокирующее противоречие: строки 142-145 объявляют, что RFC «formally amends» исполняемые модели DNA-48/DNA-49/DNA-73, тогда как frontmatter содержит `supersedes: []` (`RFC-0848:14`) и помещает эти DNA только в `related[]`. Действующие DNA по-прежнему требуют старые цепочки состояний (`docs/architecture-dna.md`, DNA-48, DNA-49, DNA-73), а этот RFC удаляет соответствующие значения на строках 332-342. По правилам аудита изменение инварианта требует supersede устанавливающего RFC: как минимум RFC-0357 для DNA-48, RFC-0358 для DNA-49 и RFC-0842 для DNA-73; обновляющие RFC-0608/RFC-0628/RFC-0724 также должны быть явно согласованы с новым нормативным контрактом.

2. RFC-0358, который устанавливает DNA-49 и исходный контракт Leitstand, отсутствует даже в `related[]` (`RFC-0848:18-29`). Это оставляет неописанной судьбу его командных, rollback- и health-контрактов.

## Ось C — Соответствие экосистеме

1. Жизненный цикл команд неполон. RFC требует изменить представление `release.list` для legacy-манифестов (`RFC-0848:344-349`), но `release.list` отсутствует в `commands.changed` (`RFC-0848:36-50`), хотя команда зарегистрирована в `docs/command-manifest.generated.yaml`. RFC также должен явно решить, меняется ли исходный код `release.prepare` и `release.ready` из-за нового строгого manifest writer/state contract; если меняется — добавить их, если нет — объяснить, как они остаются типосовместимыми.

2. Compass-синхронизация не определена по файлам: строка 371 говорит только `root Compass XML`. Для изменения общеплатформенного release/deployment-контракта RFC должен перечислить применимые файлы из `docs/requirements.xml`, `docs/technology.xml`, `docs/development-plan.xml`, `docs/knowledge-graph.xml`, `docs/verification-plan.xml` и дать явное обоснование для неприменимых Compass-документов.

3. Agent surface также задан неоперационально: `package/root agent documentation` на строке 548 не называет `AGENTS.md`, `packages/AGENTS.md`, `packages/werkstatt/AGENTS.md` и `packages/werkstatt-site/AGENTS.md`. Изменение поведения зарегистрированных команд требует точной карты обновлений, а не выбора файлов исполнителем.

## Ось D — Forward-only соответствие

Нарушений нет. RFC явно запрещает readers, translators, aliases, dual write, grace window и bypass (`RFC-0848:154-156`, `451-464`, `561-566`), а старые команды блокирует до появления новой authority-backed реализации.

## Ось E — Политика для агентов

1. RFC содержит два acceptance probe (`RFC-0848:67-71`), но перед stamping требует `rfc.acceptance.run` вместо обязательного артефакта `rfc.verification.emit --id RFC-0848` по RFC-0330 (`RFC-0848:549`). Implementation notes должны явно сослаться на RFC-0476/текущий `rfc.implement.stamp`, RFC-0330 и RFC-0334 с точной командой `rfc.supersede.propose` при обнаружении нового конфликта инвариантов.

2. Изменяется агент-facing command surface, однако RFC не фиксирует дисциплину RFC-0230: инструкции агентов, command manifest и генерируемая документация команд должны обновляться атомарно. Одной общей строки о regeneration на строке 568 недостаточно для проверки полного surface sync.

Неразрешённых `NEEDS CLARIFICATION` маркеров нет.

## Ось F — Практичность

1. CERT-001 в одном implementation unit одновременно переносит Diagnostic ownership, вводит новый canonical hash contract, материализует полный набор certification schemas, реализует selection/aggregation/action-pack/dossier/state pure modules, переписывает release manifest и блокирует десять команд (`RFC-0848:191-218`, `430-445`). Для реализации отдельным менее сильным агентом отсутствует безопасная атомарная граница: RFC должен либо декомпозировать CERT-001 через amendment спецификации, либо определить обязательные независимо проверяемые подэтапы/коммиты и условия остановки между ними.

## Ось G — Слепые зоны

1. RFC требует сортировки evidence, requirements, diagnostics и action tasks (`RFC-0848:294-330`), но не задаёт предельный объём входов, ожидаемую сложность, memory budget или stress fixture. Необходимо зафиксировать стоимость canonicalization/selection/aggregation/action-pack и тестовый верхний размер dossier, чтобы будущий orchestration не получил скрытую квадратичную деградацию.

2. Политика ложных срабатываний не определена. Для строгих schema/identity/legacy validators RFC должен явно заявить ожидаемую норму false positive (предпочтительно нулевую), отсутствие suppression/bypass и процедуру исправления дефекта контракта через amendment/RFC, а не ослабление проверки.

3. Пустые наборы требований, перестановки, stale/late evidence, отсутствие данных, запрещённые переходы, отсутствие side effects и секреты рассмотрены достаточно (`RFC-0848:311-325`, `410-428`, `436-447`). Нового persistence I/O, требующего отдельной модели concurrent/interrupted writes, CERT-001 не вводит; существующий manifest writer остаётся атомарным.

## Вопросы автору

1. Какие именно старые RFC становятся `superseded`, а какие их отдельные обязательства сохраняются после уничтожения общей release/deployment state machine?
2. Следует ли разделить CERT-001 на несколько спецификационных узлов/RFC для независимой реализации, или какой жёсткий поэтапный контракт сделает один RFC безопасным для отдельного слабого агента?
3. Каковы точные масштабные пределы и политика zero-suppression для canonical JSON, evidence selection, aggregation и action-pack validation?
