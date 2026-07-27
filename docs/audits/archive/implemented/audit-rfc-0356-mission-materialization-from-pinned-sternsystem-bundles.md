# Ревью RFC-0356: Mission materialization from pinned Sternsystem bundles

## 1. Executive Summary

**Требует доработок.** Концепция переиспользования machinery из RFC-0221 логична, но отсутствие контроля конкурентности, неопределенная стратегия разрешения git-конфликтов и игнорирование kernel.wire chicken-egg проблемы делают схему непригодной для production без дополнительных гарантий.

## 2. Критические архитектурные уязвимости

- **Отсутствие контроля конкурентности:** Кэш-клон `systems/<id>/` — это shared mutable state без механизма блокировки. Два разработчика могут одновременно открыть миссии для одного Sternsystem, что приведет к race conditions при `mission.commit`.

- **Git-конфликты не определены:** `mission.commit` пушит в remote репозиторий Sternsystem. Если за время работы миссии другой разработчик закоммитил изменения, возникнет конфликт. RFC не определяет стратегию: auto-merge, force-push, abort? Это критический gap для distributed workflow.

- **Неидемпотентность materialize:** Если `mission.materialize` прерывается на шаге 6 (regeneration), рабочая копия остается в неконсистентном состоянии. Повторный запуск может усугубить проблему. Нет lock-файла или checksum-валидации для защиты от частичного выполнения.

- **kernel.wire chicken-egg блокирует пилот:** RFC признает проблему как "deferred item", но пилот зависит от `mission.validate` → `astro build`. Если этот шаг падает из-за kernel.wire, весь flow блокируется без workaround.

## 3. Неучтенные Edge Cases

- **Восстановление после частичного сбоя:** Если materialize падает на середине, разработчик должен вручную удалить `missions/<id>/working/` и retry. Нет автоматического rollback или cleanup.

- **Дивергенция кэш-клона:** Человек может вручную закоммитить в remote Sternsystem. `mission.materialize` не делает `git fetch` перед version comparison, поэтому может работать с устаревшим состоянием.

- **Cleanup-политика для миссий:** После `mission.close` директория `missions/<id>/` остается навсегда. Нет TTL или garbage collection — со временем это засорит репозиторий.

- **Extract validation timing:** `sternsystem.extract` валидирует source `apps/<app>/` до extraction. Но если extracted Sternsystem не проходит `sternsystem.validate` из-за mismatch версии платформы, rollback undefined.

## 4. Конкретные улучшения

- **Добавить file-level locking:** Перед `mission.materialize` создавать `.materializing.lock` в `missions/<id>/`. Удалять при success/failure. Abort если lock существует.

- **Fetch перед materialize:** Добавить `git fetch` в step 2 materialize для синхронизации кэш-клона с remote перед version comparison.

- **Conflict detection в commit:** Перед `mission.commit` делать `git fetch` на кэш-клоне и проверять наличие новых коммитов в remote. Если есть — abort с требованием re-materialization.

- **Checksum validation:** После materialize вычислять checksum authored set рабочей копии и хранить в `materialization-report.json`. Перед `mission.commit` верифицировать, что checksum не изменился (защита от manual edits).

- **Определить cleanup policy:** Добавить команду `mission.cleanup` или TTL-поле в `mission.yaml` для автоматического удаления старых закрытых миссий.

- **Изолировать build dependencies:** Вместо reliance на workspace `node_modules/`, рабочая копия должна иметь собственный минимальный `package.json` с точно pinned версиями платформенных зависимостей, или использовать containerized build environment.

## 5. Вопросы автору

1. Как вы обрабатываете конкурентные миссии, нацеленные на один Sternsystem? Кэш-клон `systems/<id>/` — это shared mutable state без механизма блокировки.

- Сейчас - да. Блокировку в виде лок-файла следует ввести.

2. Какова стратегия разрешения конфликтов, когда `mission.commit` обнаруживает, что remote Sternsystem repo имеет новые коммиты от другой миссии? Auto-merge, force-push, или abort?

- Abort с сообщением о необходимости re-materialization.

3. Пилотная extraction зависит от шага `astro build` в `mission.validate`, но RFC признает, что kernel.wire chicken-egg может блокировать этот шаг. Какой конкретный workaround вы предлагаете, если пилот не может собрать из-за этой проблемы?

- TBD
