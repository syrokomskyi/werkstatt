---
rfcId: RFC-0881
auditId: AUDIT-RFC-0881-01
date: 2026-08-19
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0881

## Verdict: Needs revision

RFC формализует уже реализованный ad-hoc код из миссии m000077. Основные находки: acceptance criterion о `IMG-DELIVERY-CONFIG-01` для non-string `pagePattern` не соответствует текущему коду (silent ignore вместо warning), frontmatter `amends: []` пустой хотя тело RFC пишет "RFC-0830 (amended)", и `srcPattern` остаётся обязательным полем без объяснения для page-level-only override.

## Mechanical validation (rfc.validate)

Pass — 0 violations, 0 markers.

## Axis A — Structural completeness

1. **CLI surface отсутствует** — в секции Design нет примера вызова команды с флагами. Для изменённой команды (`commands.changed: [image.delivery.validate]`) стоит показать инвокацию: `pnpm exec werkstatt run image.delivery.validate --site <siteId> --json`.

2. **Acceptance criterion о `IMG-DELIVERY-CONFIG-01` для non-string `pagePattern` не соответствует коду** — критерий на строке 172 гласит: "`loadDeliveryConfig` parses `pagePattern` from YAML and emits `IMG-DELIVERY-CONFIG-01` for non-string values". Однако текущий код (`image-delivery.ts:153`) silently устанавливает `pagePattern: typeof override.pagePattern === "string" ? override.pagePattern : undefined` — non-string значения игнорируются без warning. Either критерий нужно изменить на "silently ignores non-string pagePattern values", either код нужно дополнить warning-эмиттером.

3. **`srcPattern` остаётся обязательным, но не объяснён для page-level-only override** — пример конфига на строках 83-88 показывает `srcPattern: "**"` вместе с `pagePattern: "**/nachweise/**"`. `srcPattern` валидируется как обязательное поле (`image-delivery.ts:144`). RFC не объясняет, что `srcPattern: "**"` — это dummy-значение для override, где нужен только `pagePattern`. Оператор может не понять, зачем нужен `srcPattern` для page-level exemption.

## Axis B — DNA alignment

1. **Frontmatter `amends: []` пустой, но тело RFC пишет "RFC-0830 (amended)"** — Architectural fit на строке 67 гласит: "RFC-0830 (amended): Extends the config override schema with a new optional field." Это противоречит frontmatter, где `amends: []` пустой, а RFC-0830 указан только в `related[]`. Если RFC расширяет схему конфига, определённую RFC-0830, он должен быть в `amends[]`, а не в `related[]`.

2. `satisfies: []` — пустой, новых DNA инвариантов не устанавливается. Корректно для patch-level change.

## Axis C — Ecosystem fit

1. **AGENTS.md update не идентифицирован** — `packages/werkstatt-site/AGENTS.md` документирует `image.delivery.validate` с правилами и config escape hatch, но не упоминает `pagePattern`. RFC не указывает, что AGENTS.md нуждается в обновлении. Проверка: `grep pagePattern packages/werkstatt-site/AGENTS.md` → 0 результатов.

2. **Compass sync не идентифицирован** — RFC не указывает, нужны ли обновления `docs/*.xml` файлов. Для добавления optional поля в config schema это вероятно не нужно, но RFC должен явно сказать "no Compass sync needed" или перечислить затронутые файлы.

3. Package boundaries, pipeline placement, cosmic naming, command lifecycle — без замечаний.

## Axis D — Forward-only compliance

No issues. RFC не предлагает compatibility shim, dual-path, или legacy code path. Расширение схемы конфига — прямое изменение контракта RFC-0830.

## Axis E — Agent-facing policy

1. **Implementation notes не ссылаются на конкретные RFC governance rules** — строки 179-183 содержат общие правила ("Agents MAY implement code changes ONLY when this RFC has status: accepted"), но не ссылаются на RFC-0224 (accepted→implemented transition) или RFC-0476 (stamp command). Для consistency с другими RFC в этом репозитории (например RFC-0880 строки 176-179), стоит добавить ссылки.

2. Status gate, anti-fabrication, storage policy, NEEDS CLARIFICATION markers — без замечаний.

## Axis F — Pragmatism

1. **`srcPattern` должен быть optional когда присутствует `pagePattern`** — сейчас `srcPattern` обязательный (`image-delivery.ts:144`), что заставляет операторов указывать dummy `srcPattern: "**"` для page-level-only override. RFC упускает возможность сделать `srcPattern` optional при наличии `pagePattern`. Это не блокирующий finding, но usability concern.

2. В остальном — minimal change: одно optional поле, одна функция, интеграция в существующую проверку. Non-goals конкретны и осмысленны.

## Axis G — Blind spots

1. **Edge case: override с обоими `srcPattern` и `pagePattern`** — RFC не уточняет, что происходит, когда override содержит оба поля. Текущий код работает корректно (`isRuleSkipped` проверяет `srcPattern` для per-image rules, `isPageSkipped` проверяет `pagePattern` для page-level rules — они независимы), но RFC не документирует это поведение.

2. Performance, false positives, migration path, security — без замечаний. Performance assessment корректен (<10 overrides, picomatch cached).

## Questions for the author

1. Должен ли `loadDeliveryConfig` эмитить `IMG-DELIVERY-CONFIG-01` для non-string `pagePattern` (как утверждает acceptance criterion), или silently ignore (как делает текущий код)? Нужно привести критерий в соответствие с кодом или код с критерием.

2. Почему RFC-0830 в `related[]`, а не в `amends[]`? Тело RFC говорит "RFC-0830 (amended)" — frontmatter должен совпадать.

3. Должен ли `srcPattern` стать optional когда присутствует `pagePattern`? Это устранило бы необходимость dummy `srcPattern: "**"` для page-level-only override.
