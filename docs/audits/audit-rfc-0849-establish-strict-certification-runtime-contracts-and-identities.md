---
rfcId: RFC-0849
auditId: AUDIT-RFC-0849-01
date: 2026-08-14
auditor:
  skill: fo-idea-audit
  model: gpt-5.6-sol
verdict: needs-revision
---

# Аудит: RFC-0849

## Вердикт: Требует доработки

RFC задаёт правильное forward-only направление, соответствует границе engine/plugin и проходит механическую валидацию. До реализации нужно уменьшить execution scope и сделать canonicalization/Diagnostic trust boundary исполнимым: сейчас корректный по заявленным схемам объект всё ещё может быть неканонизуемым, а некоторые JavaScript-значения способны получить неоднозначные байты.

## Механическая валидация (`rfc.validate`)

Пройдена: `rfc.validate --id RFC-0849 --json` вернул `status: pass`, 0 нарушений и 0 маркеров.

## Ось A — Структурная полнота

1. Публичные сигнатуры `canonicalJsonBytesV1(value: unknown): Uint8Array` и `canonicalJsonHashV1(value: unknown): Sha256Digest` не имеют error channel (`RFC-0849:119-124`), тогда как ниже обещаны `CERT-CANONICAL-*` diagnostics, discriminated failures и иногда Zod exceptions (`RFC-0849:168-180`). RFC должен определить точный error/result тип, стабильные поля и единое правило throw-vs-return для canonicalization, identity mismatch и path failure.

## Ось B — Соответствие Architecture DNA

1. RFC справедливо использует фактический `@warpgogol/werkstatt/fingerprint` (`RFC-0849:78-80`), но DNA-53 всё ещё называет удалённый `@warpgogol/fingerprint`, тогда как RFC-0776 перенёс его в engine subpath. Для честного `satisfies: [DNA-53]` RFC должен добавить RFC-0776 в контекст и потребовать точное обновление DNA-53 без изменения семантики единственного hash owner.

## Ось C — Соответствие экосистеме

1. Shared-package/public-subpath изменение не имеет точной Compass-карты. Строка 239 говорит только `required Compass source markup`, а критерий 228 называет лишь два nested AGENTS.md; нужно явно включить как минимум `packages/AGENTS.md`, `packages/werkstatt/AGENTS.md`, `packages/werkstatt-site/AGENTS.md`, `docs/technology.xml`, `docs/knowledge-graph.xml` и `docs/source-markup.xml`, с проверяемым no-change rationale для остальных переданных RFC-0848 Compass-поверхностей.

## Ось D — Forward-only соответствие

Нарушений нет. Алиасы Diagnostic, legacy readers, parallel interfaces и permissive certification hashing удаляются в одном переходе; grace/dual-read/fallback отсутствуют (`RFC-0849:74`, `113-115`, `182-190`, `231-242`).

## Ось E — Политика для агентов

Нарушений нет. Status gate, RFC-0230, RFC-0330, RFC-0334 и RFC-0476 названы с точными командами (`RFC-0849:231-242`). Неразрешённых `NEEDS CLARIFICATION` маркеров нет.

## Ось F — Практичность

1. После декомпозиции родителя RFC-0849 всё ещё объединяет три независимые blast-radius операции: перенос Diagnostic ownership, новый permanent canonical byte format и перевод полного набора certification schemas/identity builders (15 путей на `RFC-0849:132-150`). Это противоречит собственной гарантии «one session boundary» (`RFC-0849:235`) для менее сильного агента; работу следует разделить ещё раз либо доказать жёстким количественным budget, почему весь schema inventory реалистично закрывается одной сессией.

## Ось G — Слепые зоны

1. `value: unknown` и требование отвергать traversal mutation (`RFC-0849:122-130`) не образуют исполнимого JavaScript-контракта: Proxy может выглядеть как plain object и менять ответы traps, а надёжно определить Proxy нельзя. Нужен проверяемый trust boundary — например, canonicalizer принимает только branded immutable snapshot, созданный контролируемым parser/snapshot step, и отдельно описывает поведение для hostile Proxy.

2. Unicode-контракт не рассматривает lone UTF-16 surrogates. Обычный UTF-8 encoder заменяет их на U+FFFD, что может дать одинаковые bytes для разных JavaScript strings; RFC должен либо запрещать непарные surrogates, либо зафиксировать escape-based кодирование, плюс добавить коллизионные fixtures.

3. Каноничность Diagnostic не замкнута. Текущий `Diagnostic.data?: Record<string, unknown>` (`packages/werkstatt/src/kernel/types.ts`) и `z.record(z.string(), z.unknown())` (`packages/werkstatt-site/src/checks/audit/types.ts`) допускают bigint, functions, class instances и другие значения, которые RFC canonical JSON обязан отклонить. RFC должен определить `CanonicalJsonValue` для `data`, либо явно исключить `data` из identity payload; аналогично нужно формально удалить legacy `id/blockId/suggestion` поля, а не только schema aliases.

4. Заявленная память `O(B + D)` (`RFC-0849:130`) не учитывает key lists/sort и должна включать `K`; также отсутствуют отдельные ограничения на количество object keys/array items и длину строк. Ограничение 8 MiB результата не полностью описывает peak traversal/sort memory.

5. Redaction ограничена только messages (`RFC-0849:180`), но Diagnostic способен нести URL, snippet, evidence и arbitrary data. Для persisted/transmitted certification objects нужны границы строк/коллекций, запрет credentials/absolute paths, PII/redaction metadata и negative fixtures; иначе строгая схема всё равно сможет легализовать утечку в identity/dossier.

## Вопросы автору

1. Делим ли RFC-0849 на три последовательных документа: canonical JSON, Diagnostic ownership и certification schemas/identities?
2. Какой точный тип принимает canonicalizer: произвольный `unknown`, проверенный immutable snapshot или branded `CanonicalJsonValue`, и что происходит с Proxy/lone-surrogate input?
3. Входит ли `Diagnostic.data/evidence/snippet` в evidence identity; если да, какой canonical/redaction contract делает любой валидный Diagnostic одновременно безопасным и хешируемым?
