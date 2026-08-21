---
rfcId: RFC-0897
auditId: AUDIT-RFC-0897-01
date: 2026-08-21
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0897

## Вердикт: Needs revision

RFC описывает минимальное, хорошо Scoped изменение одной строки в общем компоненте. Однако есть три находки: код уже применён в репозитории (RFC написан ретроспективно), `satisfies: DNA-8` выглядит декоративно, и критерии приёмки не упоминают component-level валидатор `a11y.label-in-name.component.validate` (RFC-0836), который также сканирует этот компонент.

## Механическая валидация (rfc.validate)

Pass — `rfc.validate --id RFC-0897` вернул 0 violations.

## Axis A — Structural completeness

**Находка A-1:** Критерии приёмки (строка 101) упоминают только `a11y.label-in-name.validate` (RFC-0832, post-build), но не `a11y.label-in-name.component.validate` (RFC-0836, pre-build). Оба валидатора сканируют `packages/werkstatt-site/src/domain/ui/` — компонент `lang-switcher-component.astro` попадает в область действия обоих. Критерий должен включать оба валидатора или формулироваться как «все a11y label-in-name валидаторы проходят».

Остальные секции (Decision, Rollout, Alternatives, Risks, Acceptance criteria, Implementation notes) заполнены корректно. CLI surface, TypeScript contracts, File system responsibilities, Output format, Failure modes — N/A (нет новых команд, типов, или контрактов).

## Axis B — DNA alignment

**Находка B-1:** `satisfies: [DNA-8]` (строка 22) выглядит декоративно. DNA-8 описывает иерархию page → section → component → content — структурную композицию страниц. Этот RFC меняет отображаемый текст внутри существующего компонента; он не укрепляет, не защищает и не расширяет иерархию. RFC объясняет связь (строки 59-60), но объяснение сводится к «контракт компонента не меняется» — это аргумент для отсутствия DNA-ссылки, а не для её наличия. Если `satisfies` не может быть пустым для architecture RFC, следует выбрать более релевантный инвариант или обосновать связь сильнее.

## Axis C — Ecosystem fit

**Находка C-1:** Та же находка, что A-1 — RFC не упоминает `a11y.label-in-name.component.validate` (RFC-0836) в контексте ecosystem fit. Пайплайн `PACKAGES_CHECK_PIPELINE` запускает этот валидатор на всех `.astro` файлах в `src/domain/ui/`, включая `lang-switcher-component.astro`. RFC должен подтвердить, что компонент проходит оба валидатора.

Package boundaries, Compass sync, AGENTS.md updates, cosmic naming — N/A (нет новых контрактов, манифестов, или структурных изменений).

## Axis D — Forward-only compliance

No issues. Прямое изменение, no compatibility shim, no dual-path.

## Axis E — Agent-facing policy

No issues. Status gate корректен — RFC явно требует `accepted` перед реализацией (строка 106). No self-authorizing language. Implementation notes ссылаются на RFC-0224 (accepted→implemented transition) корректно.

## Axis F — Pragmatism

No issues. Изменение — одна строка. `nextLang` уже вычисляется в области видимости компонента (строка 66 `lang-switcher-component.astro`). No new props, no new imports, no new types. Максимально минимально.

## Axis G — Blind spots

**Находка G-1 (критическая):** Изменение кода **уже применено** в репозитории. `lang-switcher-component.astro:88` уже содержит `{nextLang.toUpperCase()}`, а `CHANGE_SUMMARY` (строка 13) уже включает запись `RFC-0897: show target lang instead of current lang for intuitive UX.` RFC описывает diff, который уже находится в коде. Это означает:
- Шаг implementation найдет код уже в целевом состоянии — нужно только верифицировать и stamp.
- RFC написан ретроспективно как decision record, а не как forward-looking specification.
- RFC должен явно это acknowledge (например, в секции Rollout: «change is already applied to the shared component»).

**Находка G-2 (minor):** RFC не рассматривает edge case `supportedLangs` с одним языком. Если `langs = ["de"]`, то `nextLang = "de"` и кнопка показывает "DE" со ссылкой на ту же страницу. Это pre-existing behavior (не введено этим RFC), но стоит отметить как known limitation.

## Questions for the author

1. Изменение кода уже применено (`lang-switcher-component.astro:88` показывает `nextLang.toUpperCase()`, CHANGE_SUMMARY уже упоминает RFC-0897). RFC написан ретроспективно? Если да, стоит ли явно отметить это в Rollout и сформулировать implementation step как «verify current state»?
2. Почему `satisfies` включает DNA-8? DNA-8 — про иерархию page→section→component→content, а не про отображаемый текст. Если связь слабая, может стоит убрать `satisfies` или выбрать более релевантный инвариант?
3. Критерии приёмки упоминают `a11y.label-in-name.validate` (post-build), но не `a11y.label-in-name.component.validate` (RFC-0836, pre-build). Оба валидатора сканируют этот компонент. Стоит ли добавить отдельный критерий для component-level валидатора?
