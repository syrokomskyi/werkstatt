# Executive Summary RFC-0358

**Требует доработок.** RFC-0358 предлагает разумную абстракцию для деплоя, но критически недооценивает эксплуатационную сложность: отсутствует обработка застрявших состояний, нет стратегии безопасности для API ключей, health checks поверхностны, а rollback не учитывает сценарии удаления артефактов. Без доработки система будет нестабильной в production.

---

## Критические архитектурные уязвимости

1. **Оphaned "in-progress" states without timeout/cleanup** — Если процесс `leitstand.propagate` крашится после установки `lastPropagationState: in-progress` но до завершения деплоя, система навсегда застревает в этом состоянии. Нет механизма timeout-а, автоматического cleanup-а или ручного восстановления. Оператору придется вручную править YAML registry — это-кошмар.

2. **Race condition при конкурентных пропагациях** — Проверка "no in-progress propagation" — это read-modify-write операция над YAML файлом без atomic lock-а. Два параллельных процесса могут одновременно прочитать `succeeded`, оба начать деплой, и оба записать `in-progress`. Нужен file-based lock или distributed lock (если несколько операторов).

3. **Отсутствие аутентификации/авторизации для deployment targets** — Адаптер `cloudflare-pages` требует API токен, но RFC не определяет, где хранить секреты (env vars? encrypted config? secrets manager?). Hardcoding токенов в registry.yaml — security breach. Нет разделения прав: любой с доступом к CLI может деплоить любой system.

4. **Health checks не верифицируют контент** — HTTP 200 на `/sitemap.xml` не гарантирует, что sitemap валиден или содержит правильные URL. CDN может вернуть 200 с error page или cached stale content. Нет content hash verification, нет structural validation критических endpoints.

5. **Rollback не гарантирует наличие previous release artifact** — RFC assumes "release artifact must still be in releases/ or re-downloadable", но не определяет механизм re-download. Если кто-то удалил `releases/<id>/` (cleanup policy, human error), rollback невозможен. Нет backup strategy, no immutable storage contract.

---

## Неучтенные Edge Cases

1. **Large dist artifacts exceeding CDN limits** — Cloudflare Pages имеет лимиты на размер деплоя (~25MB для бесплатного tier, выше для платных). RFC не проверяет размер `dist/` перед деплоем. Большой сайт может silently fail или частично деплоиться.

2. **CDN cache invalidation race conditions** — После успешного деплоя CDN может продолжить отдавать старый кэш. Health checks могут пройти (200 OK), но пользователи получат stale content. Нет purge cache strategy, no cache-busting mechanism.

3. **Partial deployment failures** — Если `wrangler pages deploy` загружает 90% файлов и крашится, CDN может оставить сайт в broken state (mix of old/new files). Адаптер не определяет rollback-on-fail semantics. Нет atomic deployment guarantees.

4. **Deployment timeout handling** — Нет таймаутов на propagate операцию. Если CDN завис (network issue, API outage), процесс будет висеть бесконечно. Нет configurable timeout, no early abort.

5. **Concurrent multi-system propagations** — RFC не определяет очередь или rate limiting для деплоя нескольких систем одновременно. Оператор может случайно запустить `leitstand.propagate` для 10 систем параллельно, что может превысить API rate limits CDN.

6. **Health check false negatives during CDN propagation** — CDN может возвращать 503/504 во время propagation (normal behavior). Health checks retry 3x с 5s интервалом, но этого может быть недостаточно для large sites. Нет exponential backoff, no configurable retry policy.

7. **Registry YAML corruption or merge conflicts** — Если registry.yaml поврежден или имеет merge conflict (git collaboration), все Leitstand команды перестанут работать. Нет schema validation при чтении, no graceful degradation, no recovery procedure.

8. **Deployment configuration drift** — Если `deployment.adapter` или `deployment.target` изменены в registry между пропагациями, система может деплоить на неправильный target. Нет configuration versioning, no change detection, no safety gates.

---

## Конкретные улучшения

1. **Add state machine with timeout and recovery** — Заменить простой `lastPropagationState` на полноценный state machine с полями: `state`, `startedAt`, `lastHeartbeatAt`, `timeoutSeconds`. Команда `leitstand.propagate` должна периодически обновлять `lastHeartbeatAt`. Background job или `leitstand.status` должен детектировать stale states (> timeout) и автоматически переводить их в `failed` с actionable error message.

2. **Implement file-based locking for registry mutations** — Использовать `proper-lockfile` или аналогичный механизм для atomic read-modify-write операций над registry.yaml. Или мигрировать registry на SQLite/PostgreSQL для proper transactional semantics.

3. **Define secrets management contract** — Добавить в RFC раздел про секреты: хранить CDN API tokens в environment variables (`LEITSTAND_CLOUDFLARE_API_TOKEN_<SYSTEM_ID>`) или в зашифрованном config файле. Адаптер должен читать токены из secure storage, не из registry.

4. **Enhance health checks with content verification** — Добавить опциональные content-based checks: verify specific text on homepage, validate sitemap XML structure, check critical assets exist. Использовать substring matching или JSON schema validation для structured endpoints.

5. **Add deployment size validation** — Перед propagate проверять размер `dist/` и сравнивать с known CDN limits. Если превышен — fail early с clear error message. Предложить compression или asset splitting.

6. **Implement cache purge strategy** — После успешного propagate вызывать CDN-specific cache purge API (Cloudflare Purge Cache). Добавить в adapter interface метод `purgeCache(target: string)`.

7. **Add atomic deployment guarantees** — Для Cloudflare Pages использовать `wrangler pages deploy --branch` или preview deployments для testing перед production. Или implement blue-green semantics: deploy to preview, run health checks, then promote to production.

8. **Define observability contract** — Добавить structured logging (JSON format) для всех Leitstand операций с полями: `systemId`, `releaseId`, `operation`, `state`, `duration`, `error`. Интегрировать с существующей logging инфраструктурой. Определить metrics для мониторинга: propagation latency, health check pass rate, rollback frequency.

---

## Вопросы автору

1. **Как система восстанавливается из orphaned "in-progress" states без ручного вмешательства?** Если процесс крашнется после установки флага но до завершения деплоя, какой автоматический механизм сбросит состояние и позволит повторную пропагацию?

- TBD

2. **Где хранятся CDN API credentials и как обеспечивается разграничение прав доступа?** Как предотвратить деплой production system junior разработчиком? Как ротировать credentials без прерывания работы Leitstand?

- TBD

3. **Что происходит с health checks если CDN возвращает 200 но с stale/incorrect content?** Как верифицировать, что деплоенный сайт действительно соответствует release artifact, а не cached version или error page?

- TBD
