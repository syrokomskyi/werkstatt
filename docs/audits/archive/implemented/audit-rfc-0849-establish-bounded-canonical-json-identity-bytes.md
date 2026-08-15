---
rfcId: RFC-0849
auditId: AUDIT-RFC-0849-02
date: 2026-08-14
auditor:
  skill: fo-idea-audit
  model: gpt-5.6-sol
verdict: needs-revision
---

# Аудит: RFC-0849

## Вердикт: Требует доработки

Повторная декомпозиция успешно устранила прежний scope-кризис, закрыла Proxy/Unicode/limit/DNA/Compass замечания и оставила один реалистичный implementation boundary. До реализации остаются четыре исполнимые проблемы: предложенный runtime brand не работает для разрешённых scalar roots, возвращаемый digest type не существует, постоянный number/limit protocol недостаточно нормативно зафиксирован, а заявленный lint enforcement не соответствует фактическому владельцу и поведению команды.

## Механическая валидация (`rfc.validate`)

Пройдена: `rfc.validate --id RFC-0849 --json` вернул `status: pass`, 0 нарушений и 0 маркеров.

## Ось A — Структурная полнота

1. Контракт разрешает `null`, boolean, number и string как корневые значения (`RFC-0849:144-150`), но требует identity-based brand через private `WeakSet`/`WeakMap` (`RFC-0849:132-140`). JavaScript weak collections принимают только objects, поэтому scalar snapshot невозможно зарегистрировать или затем проверить. Нужен непрозрачный object handle (`CanonicalJsonSnapshotV1`) вокруг любого root либо формальный запрет scalar roots; текущая сигнатура не реализуема как написано.

2. `canonicalJsonHashV1` возвращает `Sha256Digest` (`RFC-0849:135`), но такого типа нет в `packages/werkstatt/src/fingerprint/**` или другом текущем engine source; он упоминается только в будущем RFC-0853. При `dependsOn: []` RFC-0849 должен сам определить fingerprint-owned digest type/validator либо честно вернуть существующий `string`, чтобы более ранний RFC не зависел от ещё не реализованного certification contract.

3. Строка `pinned ECMAScript JSON finite-number representation` (`RFC-0849:160`) не называет редакцию стандарта, abstract operation или внешний совместимый алгоритм, а fixtures не определяют поведение для всего IEEE-754 domain. Аналогично не определено, считается ли root глубиной 0 или 1 и входят ли object keys в `nodes` (`RFC-0849:167-179`). Для permanent `@1` слабому агенту нужен нормативный алгоритм и точные правила каждого счётчика, а не выбор по тестовым примерам.

## Ось B — Соответствие Architecture DNA

Нарушений нет. RFC использует фактический `@warpgogol/werkstatt/fingerprint`, ссылается на RFC-0776 и требует точной коррекции устаревшего пути в DNA-53 без введения второго hash owner (`RFC-0849:78-86`, `251`).

## Ось C — Соответствие экосистеме

1. RFC обещает, что `fingerprint.usage.lint` запретит `stableJsonHash` в certification source (`RFC-0849:80`, `98`, `207`, `250`, `253`), но команда принадлежит `@warpgogol/werkstatt-site` в `packages/werkstatt-site/src/checks/fingerprint-commands.ts`. Текущий scanner не ищет `stableJsonHash`, по умолчанию работает в warning mode и всё ещё читает старый `packages/fingerprint/allowlist.json`; при этом `packagesImpacted` содержит только engine, `commands.changed` пуст, file map не называет plugin source, а проверки не включают plugin test/build. RFC должен либо формально изменить существующую команду (`commands.changed`, второй package, exact source/tests и `--mode=fail`), либо заменить это обещание engine-local boundary test, не притворяясь, что текущая команда уже обеспечивает gate.

## Ось D — Forward-only соответствие

Нарушений нет. Новый `@1` не меняет legacy stable-hash bytes, но certification source получает единственный новый путь без alias, fallback, dual-write, permissive mode или grace period (`RFC-0849:72-80`, `225-231`, `258-263`).

## Ось E — Политика для агентов

Нарушений нет. Draft не самоавторизуется; RFC-0230/0330/0334/0476 и точные pre-stamp команды указаны (`RFC-0849:258-268`). Неразрешённых `NEEDS CLARIFICATION` маркеров нет.

## Ось F — Практичность

Нарушений нет. После разбиения RFC содержит один package-level protocol, не добавляет CLI и оставляет Diagnostic/contracts/identity/persistence дочерним RFC; rollout и acceptance укладываются в одну изолированную реализационную сессию (`RFC-0849:43-51`, `201-209`, `242-268`).

## Ось G — Слепые зоны

1. Для plain object разрешены own enumerable string keys, но RFC не говорит, отклоняются или игнорируются own non-enumerable string properties (`RFC-0849:144-150`). Молчаливое игнорирование позволит двум различным object graphs получить одни bytes; permanent domain должен явно отвергать любой own non-enumerable/symbol/accessor property либо формально объявить его вне semantic value и доказать это fixtures.

2. Failure contract запрещает утечку secrets, но `path` состоит из исходных string keys, а правило для сокращения/редактирования чувствительного или слишком длинного key segment отсутствует (`RFC-0849:112-120`, `197`). Нужен детерминированный safe-path projection: какие segments показываются, чем заменяются secret-bearing/unprintable keys и как обозначается omitted tail без включения исходного значения.

3. File map обещает `cross-runtime` vectors, тогда как rollout требует только `cross-process` reproduction (`RFC-0849:187-189`, `203-206`). Для постоянного формата нужно назвать поддерживаемую runtime/version matrix или сделать fixtures независимо проверяемыми отдельной reference implementation; иначе Node upgrade или Worker runtime может изменить number/string serialization незаметно.

## Вопросы автору

1. Заменяем ли raw branded `CanonicalJsonValueV1` на непрозрачный object handle, который хранит detached root/bytes и поэтому одинаково поддерживает scalar, array и object roots?
2. Где живёт `Sha256Digest`, и какой точный нормативный number serialization/depth/node-count contract замораживается для `canonical-json@1`?
3. Кто обеспечивает запрет `stableJsonHash`: изменяем plugin-owned `fingerprint.usage.lint` как blocking command или оставляем RFC engine-only и вводим focused source-boundary test внутри `@warpgogol/werkstatt`?
