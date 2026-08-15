---
rfcId: RFC-0857
auditId: AUDIT-RFC-0857-01
date: 2026-08-15
auditor:
  skill: fo-idea-audit
  model: gpt-5
verdict: needs-revision
---

# Аудит: RFC-0857

## Вердикт: Требует доработки

RFC устраняет исходное противоречие корректным способом: сохраняет dependency-front семантику `spec.materialize`, не принимает AMD-007 раньше времени и не разрешает ручные RFC-id или `materializedAs`. Но предложенный JIT-протокол пока несовместим с sealing-инвариантом RFC-0856: обязательные Steward-коммиты появляются после predecessor completion, тогда как `seal` требует `HEAD === baseCommit`. Также generic Forge-контракт ошибочно выражен через CERT-специфичный и фактически незакрытый строковый тип.

## Механическая валидация (`rfc.validate`)

Пройдена. Есть два ожидаемых предупреждения V-19: RFC-0855 и RFC-0856 ещё не содержат взаимные `amendedBy: RFC-0857`. Ошибок и unresolved-маркеров нет.

## Ось A — Структурная полнота

1. JIT-протокол требует после completion предыдущего пакета материализовать RFC и провести audit → enhance → plan → acceptance, каждый этап которого создаёт канонические коммиты (`RFC-0857:143-151`). RFC-0856 одновременно определяет `baseCommit` как predecessor completion commit и требует для `seal` `HEAD === baseCommit` (`RFC-0856`, разделы “Steward, lease, and commit boundaries” и “State and authority transitions”). После первого JIT-коммита это равенство уже невозможно. RFC-0857 должен определить ограниченный Steward preparation range между base и seal, его допустимые файлы, ancestry и способ фиксации в manifest/evidence.
2. RFC требует проверить direct `dependsOn`, но не задаёт, какие именно зависимости должен записать агент в материализованный CERT RFC (`RFC-0857:149`, `RFC-0857:259`). `spec.materialize` проверяет spec-front, но текущий handler не переносит эффективные spec-зависимости в RFC `dependsOn`. Для слабого агента нужен детерминированный алгоритм: resolved RFCs всех прямых effective-spec dependencies плюс governing RFC непосредственного предыдущего program packet, без дублей.
3. Взаимные amendment-связи оставлены только как предупреждения, а таблица ответственности прямо запрещает менять RFC-0855/RFC-0856 (`RFC-0857:175-176`, `RFC-0857:266`). Нормативные тела действительно нельзя переписывать, но metadata-only добавление `amendedBy: RFC-0857` должно быть явным критерием реализации; иначе граф решений навсегда остаётся односторонним.

## Ось B — Соответствие DNA

Нарушений не найдено. RFC конкретно защищает DNA-55 через единственный writer `spec.materialize` и DNA-65 через обязательную проверку materialized RFC dependencies (`RFC-0857:76-78`). Новый инвариант не объявляется, действующие DNA не ослабляются.

## Ось C — Встраивание в экосистему

1. Объявленный “closed” тип использует `${string}` и принимает произвольные значения, а форма `${string}/CERT-${string}` привязывает generic `forge/program@1` к одному roadmap namespace (`RFC-0857:112-121`). В существующих спецификациях уже есть другие node-id формы, например PBP `RFC-PBP-*`. Контракт должен разбирать qualified `<spec-id>/<node-id>` через реальный `forge-spec.yaml` и проверять node-id по конкретной спецификации, а не хардкодить CERT.
2. Workspace-level изменение packet governance не указывает Compass-синхронизацию. RFC-0855 уже требует обновить requirements, technology, development-plan, knowledge-graph, verification-plan и source-markup, а styling — зафиксировать как reviewed no-change; RFC-0857 должен явно потребовать, чтобы эти проекции отражали JIT preparation range и qualified spec-node resolution либо ссылаться на соответствующий шаг плана RFC-0855.

## Ось D — Forward-only соответствие

Нарушений не найдено. RFC не вводит planning mode, ручной projection writer, второй resolver или compatibility path; существующие `spec.status`, `spec.materialize`, `program.packet.validate` и `program.packet.seal` расширяются напрямую.

## Ось E — Политика для агентов

1. Разделение Steward/Executor задано правильно, однако до sealing нет машинной эксклюзивности для Steward preparation (`RFC-0857:143-151`, `RFC-0857:270-271`). Два preparer-сеанса могут одновременно материализовать или обновлять один пакет до появления Executor lease. Preparation range должен иметь единственного владельца, branch/head precondition, idempotency и явный stale-recovery путь.
2. Self-authorization отсутствует. RFC остаётся draft, прямо запрещает трактовать qualified spec-node reference как authority (`RFC-0857:266-273`), unresolved `NEEDS CLARIFICATION` нет.

## Ось F — Прагматизм

Нарушений не найдено. RFC расширяет существующее поле и существующие команды, не создаёт отдельный resolver, не ослабляет lazy materialization и отвергает ручной/bypass варианты с конкретными причинами.

## Ось G — Слепые зоны

1. Не определено восстановление при сбое внутри много-коммитного preparation range: например, RFC материализован, audit закоммичен, но plan/acceptance или packet refresh ещё не завершены. Нужны tracked preparation state/evidence, допустимое продолжение от последнего канонического Steward-коммита и запрет Executor lease до завершения range.
2. `spec.materialize` изменяет одновременно RFC corpus и `forge-spec.yaml`, но preparation протокол не требует проверить, что созданный RFC и projection появились в одном каноническом коммите и что нет orphan RFC после прерывания. Эта проверка должна входить в preparation completion до packet sealing.
3. Privacy, user data и внешние сервисы не затрагиваются; отдельного security/env контракта для RFC-0857 не требуется.

## Вопросы автору

1. Должны ли JIT governance-коммиты образовать отдельный Steward preparation range между predecessor completion (`baseCommit`) и seal commit, где `HEAD` обязан быть потомком base, а не равен ему? Рекомендация: да; range имеет узкий allow-list, единственного Steward owner, committed preparation report и stale-recovery.
2. Должен ли generic `governingDecision` принимать любой qualified spec-node id, разрешаемый через конкретный `forge-spec.yaml`, вместо хардкода `CERT-*`/`AMD-*`? Рекомендация: да; RFC-0855 пакеты по-прежнему используют только точные `werkstatt-release-certification/CERT-NNN` ссылки.
3. Должен ли `dependsOn` JIT-RFC вычисляться как объединение materialized RFCs всех прямых effective-spec dependencies и governing RFC непосредственного предыдущего packet? Рекомендация: да, с удалением дублей и fail-hard при любой не-RFC зависимости, которую нельзя выразить в RFC frontmatter.
