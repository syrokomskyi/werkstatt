---
rfcId: RFC-0855
auditId: AUDIT-RFC-0855-01
date: 2026-08-15
auditor:
  skill: fo-idea-audit
  model: gpt-5
verdict: rejected
---

# Аудит: RFC-0855

## Вердикт: Отклонён

Архитектурное направление сильное и механически валидно, но RFC меняет DNA-64, лишь дополняя установивший его RFC-0769. Это нарушает правило замены устанавливающего RFC при изменении инварианта. Контракт слабого агента также пока нельзя выполнить буквально: будущие prerequisite-коммиты неизвестны при подготовке всей программы, а completion report требует хеш коммита, который включает сам отчёт.

## Механическая валидация (`rfc.validate`)

Пройдена. Есть два предупреждения взаимных ссылок: RFC-0770 ещё не содержит `supersededBy: RFC-0855`, а RFC-0769 — `amendedBy: RFC-0855`. Ошибок и unresolved-маркеров нет.

## Ось A — Структурная полнота

1. Критерии требуют заранее подготовить все пакеты с точным `prerequisiteCommit` (`RFC-0855:294-324`, `RFC-0855:470-472`), но коммит-предшественник каждого следующего пакета появится только после исполнения предыдущего. RFC не различает draft packet и sealed execution packet и не определяет момент атомарной привязки к новому prerequisite commit.
2. Completion report объявлен частью завершения пакета и содержит `implementationCommit` (`RFC-0855:326-349`). Если отчёт входит в implementation commit, его хеш самоссылочен; если это отдельный report commit, RFC не определяет двухкоммитный протокол и какой из двух коммитов становится prerequisite следующего пакета.
3. Поле `rollbackVerified: true` обязательно для каждого пакета (`RFC-0855:343`), хотя документационные, forward-only и внешне-эффектные пакеты имеют разные модели восстановления. Нет допустимых состояний `not-applicable`/`recovery-verified` и доказательства, которое делает `true` проверяемым.

## Ось B — Соответствие DNA

1. RFC прямо говорит, что DNA-64 меняется (`RFC-0855:209-213`), но во frontmatter только `amends: [RFC-0769]` и `supersedes: [RFC-0770]` (`RFC-0855:14-18`). `docs/architecture-dna.md` указывает, что DNA-64 установлен RFC-0769; изменяющий его RFC обязан заменить RFC-0769, сохранив нужные положения явно.
2. Формулировка «DNA-59 durable evidence becomes shared authority storage for release and capability dossiers» (`RFC-0855:220`) шире действующего DNA-59, который нормативно описывает Axiom evidence из `mission.check` и R2. Нужно либо показать, что новый dossier-контракт лишь применяет существующий принцип без изменения DNA-59, либо отдельно заменить устанавливающий RFC-0650/ввести новый инвариант.

## Ось C — Встраивание в экосистему

1. RFC делает packet YAML и completion JSON главным машинным интерфейсом, но сознательно откладывает валидатор (`RFC-0855:241-257`). Для программы, рассчитанной на слабого агента, prose-only проверка не обеспечивает schema, sequence, hash, allow-list и diagnostic invariants. Владелец схемы, машиночитаемый schema artifact и blocking validation должны появиться в документальной фазе до packet 000, а не в необязательном будущем RFC.
2. Пакетный контракт запрещает параллельное выполнение, но не связывает пакет с эксклюзивной программной арендой/lock, веткой и head commit. Проверка чистого дерева и prerequisite SHA не мешает двум сессиям одновременно начать один packet от одного base commit.

## Ось D — Forward-only соответствие

Нарушений не найдено. RFC явно запрещает dual registry, dual-read/write, plugin adapter, legacy authority и grace path (`RFC-0855:132-135`) и допускает только ограниченные перечисленные переходные диагностики.

## Ось E — Политика для агентов

1. RFC запрещает implementing agent расширять собственный allow-list, но не определяет отдельную роль packet preparer/sealer, её полномочия и обязательную независимую проверку (`RFC-0855:324`, `RFC-0855:460`, `RFC-0855:486-487`). При hash mismatch или allow-list escape слабому агенту некуда вернуть пакет по формальному протоколу.
2. Unresolved `NEEDS CLARIFICATION` отсутствуют. Вхождения фразы относятся только к запрету и failure-mode, а `RFC-XXXX`/`<sha>` находятся в нормативных шаблонах, не являются незаполненными решениями самого RFC.

## Ось F — Прагматизм

Нарушений не найдено. Charter не вводит лишних CLI-команд, сохраняет минимальные архитектурные типы и честно отклоняет статическую сертификацию, раннее self-extension, Cordis dependency, compatibility adapter и параллельную реализацию.

## Ось G — Слепые зоны

1. Packet 170 требует isolated evaluator capability, тогда как packet 180 впервые реализует real sandbox (`RFC-0855:282-284`). Rollout одновременно называет packets 130-170 первым production component graph и обещает sandbox только в 180 (`RFC-0855:408-409`). Нужно доказуемо отделить trusted first-party evaluator adapter + untrusted data/model output от исполнения untrusted code либо перенести sandbox implementation до первого evaluator workload.
2. RFC учитывает drift и interrupted execution, но не задаёт recovery для сбоя между implementation commit, report commit и sealing следующего packet. Без этого программа может остаться с зелёным кодом, устаревшим индексом и неоднозначным next prerequisite.
3. Для evaluator/provider boundary не закреплены правила egress, секретов и приватности. Даже если входы считаются публичными, child RFC должен запретить передачу credentials/private workspace data, определить redaction и документировать необходимые env-контракты.

## Вопросы автору

1. Заменяет ли RFC-0855 RFC-0769 целиком, явно перенося stack-agnostic engine и profile dependency inversion, вместо изменения DNA-64 через amendment? Рекомендация: да.
2. Должен ли каждый следующий пакет формироваться как draft заранее, а затем отдельный preparer/sealer после завершения предыдущего пакета атомарно фиксировать base commit, source hashes, allow-list и exclusive lease? Рекомендация: да; implementing agent видит только sealed packet.
3. Должен ли реальный sandbox предшествовать CERT-006, или evaluator workload до packet 180 является только trusted first-party adapter с untrusted output-as-data? Рекомендация: перенести sandbox implementation до первого workload, который исполняет хотя бы часть agent-written/third-party code; если CERT-006 исполняет только доверенный adapter, закрепить это как проверяемый запрет.
