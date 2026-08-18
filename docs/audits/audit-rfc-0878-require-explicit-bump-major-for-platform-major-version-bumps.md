---
rfcId: RFC-0878
auditId: AUDIT-RFC-0878-01
date: 2026-08-18
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0878

## Verdict: Needs revision

Три находки: избыточная секция Proposal, слабая привязка к DNA-51, и неполная таблица поведения. Все находки минорные, но требуют исправления перед реализацией.

## Mechanical validation (rfc.validate)

Pass — 0 errors, 0 warnings.

## Axis A — Structural completeness

- **Секция Proposal избыточна** — RFC содержит секцию `## Decision` (строка 43) и `## Proposal` (строка 73), которые описывают одно и то же решение. Decision говорит «will treat versionBump: major as advisory only», Proposal повторяет то же самое. Секцию Proposal следует объединить с Decision или удалить, оставив только таблицу поведения и rationale под Decision.

## Axis B — DNA alignment

- **`satisfies: DNA-51` слабая** — DNA-51 описывает примитивы консистентности (lock, idempotency, atomic staging) для команд, мутирующих registry/mission/release/deployment/bordbuch state. RFC-0878 меняет логику определения типа bump-а в `ecosystem.commit` — это не напрямую связано с примитивами консистентности. RFC не объясняет, как именно он enforces/protects/extends DNA-51. Если связь через `ecosystem.commit` использует атомарный staging для записи `package.json` и version log — это стоит указать явно. Иначе `satisfies` следует убрать или заменить на более релевантный invariant.

## Axis C — Ecosystem fit

No issues. `commands.changed: [ecosystem.commit]` корректно. Изменение в `packages/werkstatt-site/src/checks/ecosystem-commit.ts` — правильный пакет. AGENTS.md update запланирован в rollout и acceptance criteria.

## Axis D — Forward-only compliance

No issues. Изменение прямое — старое поведение заменяется новым, без совместимости или dual-path.

## Axis E — Agent-facing policy

No issues. Статус `accepted` — реализация разрешена. Implementation notes содержат явные поведенческие правила. Нет self-authorizing language. Нет NEEDS CLARIFICATION markers.

## Axis F — Pragmatism

No issues. Минимальное изменение — одна ветка логики. Нет новых команд, нет новых флагов. Существующий механизм `--bump` переиспользуется. Scope tight.

## Axis G — Blind spots

- **Неполная таблица поведения** — таблица (строка 79) не показывает случай `--bump minor` с `versionBump: major`. По текущему коду `--bump minor` имеет приоритет и применится minor bump. По новому поведению это тоже так (override имеет приоритет). Но в таблице этого нет — стоит добавить строку для полноты.

## Questions for the author

1. Зачем нужна секция Proposal, если Decision уже описывает решение? Можно ли объединить?
2. Как именно RFC-0878 связан с DNA-51? Какой примитив консистентности он затрагивает?
3. Что произойдёт при `--bump minor` с `versionBump: major`? Следует ли это задокументировать в таблице?
