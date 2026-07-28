# RFC-0357 Review: Release Discipline and Behavior Snapshot Diff Gating

## 1. Executive Summary

**Требует доработок.** RFC решает важную проблему (отсутствие дисциплины релизов и контроля структурной целостности), но содержит критические архитектурные пробелы: отсутствие атомарности операций, неопределенность границ между "readable" и "production" билдами, отсутствие операционных контролов (мониторинг, очистка, безопасность) и хрупкая модель состояний без обработки конкурентных сценариев. Требуется пересечение с RFC-0358 (fleet propagation) для определения стратегии хранения и доставки артефактов.

## 2. Критические архитектурные уязвимости

### 2.1 Отсутствие атомарности и изоляции релизов

- **Проблема:** `release.prepare` создает директорию `releases/<id>/`, запускает production build, копирует файлы. Если процесс прерывается на любом этапе (Ctrl+C, OOM, network timeout), остается мусор в файловой системе в неопределенном состоянии. Нет механизма cleanup или recovery.
- **Последствие:** Оператору придется вручную разбираться в полу-созданных релизах. В автоматизированном CI/CD это приведет к накоплению orphan directories.

### 2.2 Неопределенность границы "readable vs production"

- **Проблема:** RFC утверждает, что readable и production билды "могут отличаться в оптимизации, минификации и генерируемом output", но не определяет, какие именно оптимизации допустимы. Если production build использует tree-shaking, который удаляет unused code, это может изменить routes или llms projections — diff gate упадет, но это не ошибка, а фича.
- **Последствие:** False positives в diff gate, операторы будут игнорировать вердикт или добавлять `--force` (который RFC явно запрещает), что подрывает всю дисциплину.

### 2.3 Отсутствие обработки конкурентных операций

- **Проблема:** RFC не определяет, что происходит, если два оператора одновременно запускают `release.prepare` для одного system. Оба могут прочитать один и тот же sequence number из Bordbuch и создать `r001` и `r001` (collision) или один перезапишет другой.
- **Последствие:** Data race в sequence number allocation, потенциальная потеря релизов или corruption.

### 2.4 Монолитный артефакт без стратегии доставки

- **Проблема:** Release artifact включает полный `dist/` (сотни MB/GB с изображениями). RFC говорит "gitignored" и "optionally pushed to CDN by RFC-0358", но не определяет:
  - Как проверять целостность артефакта при передаче?
  - Что делать, если CDN push fails после того как release уже marked as `published`?
  - Как хранить исторические релизы (disk space exhaustion)?
- **Последствие:** Разрыв между `release.publish` (который меняет state) и фактической доставкой артефакта. Оператор может думать, что релиз опубликован, но он не дошел до CDN.

### 2.5 Passport scores как структурный факт

- **Проблема:** `passportScores` включены в behavior snapshot как "structural fact", но они являются вычисляемой метрикой качества, которая может меняться между билдами из-за minor changes в content или scoring logic. Это не "structural invariant" в том же смысле, что routes.
- **Последствие:** Diff gate будет падать на легитимные изменения качества, не связанные с оптимизацией.

## 3. Неучтенные Edge Cases

### 3.1 Partial build failures

- Если production build частично успешен (например, sitemap.xml сгенерирован, но routes manifest нет), `behavior.snapshot.capture` упадет или захватит неполный snapshot. Нет механизма валидации полноты captured data.

### 3.2 Rollback без artifact retention

- RFC определяет состояние `rolled-back`, но не specifies, что происходит с артефактом. Если rollback происходит, должен ли артефакт сохраняться для audit? Удаляться? Как rollback взаимодействует с fleet propagation (RFC-0358)?

### 3.3 Cross-system dependencies

- Если два Sternsystem зависят от одной shared package и релиз одного требует обновление package, а другой еще не обновился, version-compare gate может блокировать релиз валидный для одного system но ломающий другой. Нет механизма declare dependencies между systems.

### 3.4 Migrator gaps в production build

- RFC требует migrator verdict pass, но migrators валидируются против readable build. Если production build использует другую версию platform binary, migrator chain может быть валидной для readable но сломанной для production.

### 3.5 Bordbuch append failure mid-publish

- Если Bordbuch append succeeds но registry update fails (или наоборот), система остается в inconsistent state. Нет transaction semantics для этих двух writes.

### 3.6 Sequence number exhaustion

- RFC использует zero-padded three-digit sequence number (`r001`...`r999`). Что происходит после `r999`? RFC не определяет rollover strategy.

### 3.7 Large binary files in dist/

- Если `dist/` содержит large assets (videos, high-res images), behavior snapshot capture может занять значительное время на hashing. Нет timeout или progress reporting.

### 3.8 Concurrent release.prepare and release.publish

- Если оператор запускает `release.prepare` для `r002` пока `r001` еще в процессе `release.publish`, sequence number allocation может race. Нет locking mechanism.

## 4. Конкретные улучшения

### 4.1 Определить явную границу между readable и production

- Добавить в RFC explicit list of "allowed optimization differences" (например: CSS minification, JS minification, image compression — OK; route pruning, content filtering — NOT OK).
- Ввести config flag `ASTRO_PRODUCTION_BUILD_MODE` который контролирует, какие optimization passes включены. Diff gate должен быть aware of этого config и игнорировать allowed differences.

### 4.2 Ввести атомарные операции с staging directory

- `release.prepare` должен создавать staging directory `releases/<id>.tmp/` и только после успешного завершения всех шагов переименовывать в `releases/<id>/` (atomic rename on POSIX).
- Добавить `release.cleanup --release <id>` для manual cleanup orphan artifacts.
- Добавить automatic cleanup policy (например, delete prepared releases older than 7 days).

### 4.3 Добавить locking для sequence number allocation

- Использовать file lock (`releases/.lock`) или database-backed sequence generator для предотвращения race conditions при allocation release IDs.
- Альтернатива: использовать timestamp-based IDs (например, `warpgogol-com-r20260709-143022`) вместо sequence numbers.

### 4.4 Разделить structural facts от quality metrics

- Убрать `passportScores` из behavior snapshot. Переместить в отдельный "quality report" который advisory, не gating.
- Добавить explicit categorization: "structural invariants" (routes, sitemap) vs "quality metrics" (scores, bundle sizes).

### 4.5 Определить стратегию хранения и доставки артефактов

- Вместо включения full `dist/` в release artifact, хранить только:
  - Release manifest
  - Behavior snapshot
  - Reference to build artifact (например, SHA256 hash of dist tarball stored separately)
- RFC-0358 должен определять, где и как хранятся build artifacts (CDN, S3, local cache).
- Добавить в `release.yaml` поле `artifactLocation` с URI к stored build artifact.

### 4.6 Добавить transaction semantics для Bordbuch + registry update

- `release.publish` должен:
  1. Валидировать все gates
  2. Append к Bordbuch
  3. Update registry
  4. Если шаг 3 fails — rollback Bordbuch append (remove last entry)
- Или использовать двухфазный commit: сначала подготовить temp Bordbuch, затем atomic replace.

### 4.7 Добавить операционные контрols

- **Metrics:** counters для `release.prepare` success/fail, `release.publish` duration, snapshot diff duration.
- **Logging:** structured logs для всех операций с release ID, timestamp, operator identity.
- **Alerting:** alert если `release.publish` fails после успешного `release.prepare` (indicates gate failure).
- **Retention policy:** автоматическое удаление old release artifacts (например, retain last 10 per system).

### 4.8 Улучшить error messages и recovery guidance

- При snapshot diff fail, выводить не только differences но и suggested investigation steps (например, "check if route was pruned by tree-shaking").
- При migrator gate fail, выводить конкретные missing migrators и их versions.

### 4.9 Определить rollback semantics

- Явно specify, что `release.rollback`:
  1. Помечает release как `rolled-back` в Bordbuch
  2. Триггерит fleet rollback (RFC-0358)
  3. НЕ удаляет артефакт (retained for audit)
- Добавить `release.purge --release <id>` для manual deletion old artifacts.

### 4.10 Расширить schema для large-scale deployments

- Добавить поле `deploymentTargets` в `release.yaml` для multi-environment deployments (staging, production, DR).
- Добавить `canary: boolean` для canary releases (future extension).

## 5. Вопросы автору

1. **Граница оптимизации:** Как вы планируете отличать "legitimate optimization differences" (например, CSS minification) от "structural drift" (например, dropped route) в diff gate? Есть ли explicit allowlist или denylist для optimization passes?

- TBD

2. **Стратегия хранения артефактов:** Release artifacts включают full `dist/` который может быть сотни MB. Как вы планируете управлять disk space в `releases/`? Какова retention policy? Кто отвечает за cleanup failed/partial artifacts?

- TBD

3. **Конкурентные операции:** Что произойдет, если два оператора одновременно запустят `release.prepare` для одного Sternsystem? Как вы предотвращаете race condition в sequence number allocation? Есть ли locking mechanism или вы полагаетесь на "human coordination"?

- TBD
