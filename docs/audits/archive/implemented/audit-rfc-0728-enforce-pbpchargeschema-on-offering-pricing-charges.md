---
rfcId: RFC-0728
auditId: AUDIT-RFC-0728-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0728

## Verdict: Needs revision

RFC правильно определяет проблему (несоответствие схемы `charges` спецификации PBP) и предлагает минимальное, forward-only решение. Однако RFC полностью игнорирует DE-версии offering-файлов — те же 6 файлов существуют на немецком языке с идентичными нарушениями. Схема применяется к обеим языковым версиям одновременно, поэтому DE-файлы также сломают `astro build`.

## Mechanical validation (rfc.validate)

Pass — 0 нарушений.

## Axis A — Structural completeness

No issues. Все разделы содержат конкретный контент:

- Decision — одна чёткая решение в настоящем времени.
- TypeScript contracts — минимальный before/after diff.
- File system responsibilities — конкретные пути.
- Failure modes — описаны exit-коды и warn-vs-fail поведение.
- Alternatives — 4 реальные альтернативы с причинами отказа.
- Acceptance criteria — 7 проверяемых пунктов.

## Axis B — DNA alignment

Finding B1: `satisfies: [DNA-55]` — слабая связь. DNA-55 описывает контракт вторинга спецификаций (immutable snapshots, integrity manifests, amendment mechanism). RFC уважает DNA-55 (ссылается на `pbp-specification-package/ADR-012` без копирования контента), но не объясняет, как он _enforces, protects, or extends_ сам контракт уторинга. Связь косвенная: RFC применяет решение спецификации (ADR-012) к runtime-схеме, делая спецификацию binding. Но DNA-55 — про механизм уторинга, не про применение контента спецификации. RFC следует либо объяснить связь явно ("применяя решение ADR-012 к runtime-схеме, RFC делает vendored spec единственным source of truth для charge-данных, усиливая DNA-55"), либо убрать DNA-55 из `satisfies[]`.

## Axis C — Ecosystem fit

No issues. Изменение внутри `@warpgogol/pbp`, без cross-package импортов. Pipeline placement корректный (Astro content collection validation). `commands.*` пусты — правильно, новых команд нет. Compass sync не нужен — `docs/*.xml` не затрагиваются.

## Axis D — Forward-only compliance

No issues. Нет compatibility shim, нет dual-path. Схема и контент ships в одном коммите. Legacy `z.unknown()` удаляется, не сохраняется за флагом.

## Axis E — Agent-facing policy

No issues. RFC в `draft` статусе, нет self-authorizing языка. Implementation notes корректно ссылаются на RFC-0224, RFC-0330, RFC-0334. Anti-fabrication: критерии различают code changes (схема) и content changes (offering files) — оба типа агент может выполнить. NEEDS CLARIFICATION markers не найдены.

## Axis F — Pragmatism

No issues. Изменение — одна строка (`z.unknown()` → `pbpChargeSchema`). Переиспользует существующую схему (RFC-0466). `packagesImpacted` содержит только `@warpgogol/pbp`. `nonGoals` явно документируют deferral `plans` и `adjustments`.

## Axis G — Blind spots

Finding G1 (major): **DE offering files игнорируются.** В mission workpiece существуют 6 DE offering файлов (`missions/warpgogol-com-m000035/workpiece/src/content/business-profile/de/offerings/*.md`) с идентичными нарушениями: `digital-foundation.md` (DE) имеет unquoted decimals (`value: 70.00`, `700.00`, `200.00`, `unitValue: 15.00`), нет `model`, нет `purpose`; `booking.md`, `visibility.md`, `reputation.md`, `multilingual.md` (DE) имеют quoted decimals, но нет `model` и `purpose`; `automation.md` (DE) имеет `model: range`, но нет `purpose`. Схема `z.record(z.string(), pbpChargeSchema)` применяется к обеим языковым версиям — DE-файлы также сломают `astro build`. RFC должен:

- Либо включить DE-файлы в scope (acceptance criteria + file system responsibilities)
- Либо явно задокументировать в `nonGoals`, что DE-файлы отложены (но тогда `astro build` сломается для DE-коллекции)

Finding G2 (minor): File system responsibilities table указывает только UK path (`.../uk/offerings/*.md`). Если DE-файлы включены в scope, таблица должна включать `.../de/offerings/*.md` тоже.

## Questions for the author

1. DE offering files имеют те же нарушения (6 файлов). Включаются ли они в scope этого RFC, или откладываются? Если откладываются — как `astro build` пройдёт для DE-коллекции, когда схема станет strict?
2. `satisfies: [DNA-55]` — какую именно часть DNA-55 этот RFC enforces/protects/extends? Контракт уторинга (immutable snapshots, integrity manifests) не изменяется. Связь косвенная через применение ADR-012 — стоит ли это объяснить в body или убрать из `satisfies[]`?
3. `purpose` field: RFC указывает конвенцию (`subscription`, `activation`, `additional-service`, `setup`), но `pbpChargeSchema` типизирует его как `nonEmptyString`, не enum. Принимается ли риск inconsistent values, или нужно добавить controlled vocabulary в этом RFC?
