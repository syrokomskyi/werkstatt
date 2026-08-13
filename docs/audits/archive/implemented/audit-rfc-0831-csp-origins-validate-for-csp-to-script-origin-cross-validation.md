---
rfcId: RFC-0831
auditId: AUDIT-RFC-0831-01
date: 2026-08-13
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0831

## Verdict: Needs revision

RFC proposes пост-сборочный валидатор `csp.origins.validate` для кросс-референса CSP source lists с реальными внешними origin'ами в отрендеренном HTML. Концепция здравая и заполняет реальный пробел (HDR-02 проверяет синтаксис CSP, но не семантическую полноту). Однако есть неточности в CLI surface (`--app` флаг не соответствует конвенции), сомнительное `related: [DNA-57]` и пропуски в edge cases (srcset, module scripts, bundled JS для connect-src).

## Mechanical validation (rfc.validate)

Pass. `rfc.validate --id RFC-0831 --json` — 0 violations, 0 markers.

## Axis A — Structural completeness

- **CLI surface**: RFC показывает `pnpm exec werkstatt run csp.origins.validate --app warpgogol-com`. Однако существующие `scope: "app"` команды (`headers.security.validate`, `security.txt.validate` и др.) используют `flags: {}` с `supportsAllSites: true` и резолвят целевой сайт из `context.site`, а не из флага. Флаг `--app` не является kernel-конвенцией. CLI surface должен использовать `--site <id>` (как `content-regression.ts:426`) либо вообще не принимать флаг сайта (как `headers.security.validate`). Флаг `--all` корректен.
- Остальные секции (Decision, TypeScript contracts, File system responsibilities, Output format, Failure modes, Rollout, Alternatives, Risks, Acceptance criteria, Implementation notes) — заполнены корректно, без template-плейсхолдеров.

## Axis B — DNA alignment

- **`related: [DNA-57]`**: DNA-57 (Dev/prod egress parity) касается parity текстовой нормализации (RFC-0235) между dev и prod. RFC утверждает в секции Architectural fit: «This RFC extends the egress parity invariant to include CSP coverage». Это семантическая натяжка — DNA-57 не охватывает CSP. Если RFC действительно расширяет DNA-57, он должен быть в `satisfies: [DNA-57]` с объяснением как. Если нет — `related` ссылка декоративна и должна быть удалена или заменена.
- `satisfies: []` — допустимо для `kind: command`.
- Новых DNA-инвариантов не устанавливается. Корректно.

## Axis C — Ecosystem fit

- **Package boundaries**: `packagesImpacted: [@warpgogol/werkstatt-site]` — корректно. Валидатор размещается в `packages/werkstatt-site/src/checks/`. ✓
- **Pipeline placement**: `SITES_CHECK_POSTBUILD_PIPELINE` после `cloudflare.assets.validate` — корректный выбор (нужен отрендеренный HTML из `dist/client/`). ✓
- **AGENTS.md updates**: Acceptance criterion 11 говорит «AGENTS.md updated with CSP origin completeness contract», но не указывает какой именно AGENTS.md. Следует указать `packages/werkstatt-site/AGENTS.md` (секция "Check commands") — туда добавляется запись о `csp.origins.validate`.
- **Compass sync**: Не требуется — добавление check-команды не меняет репозиторий-wide requirements. ✓
- **Cosmic naming**: N/A. ✓
- **Command lifecycle**: `commands.proposed: [csp.origins.validate]`, `commands.added: []` — корректно для draft. ✓

## Axis D — Forward-only compliance

No issues. No compatibility shim, no dual-path, no legacy code path maintained behind a flag. Депрекация не нужна — `headers.security.validate` (синтаксис) и `csp.origins.validate` (семантика) комплементарны.

## Axis E — Agent-facing policy

- No self-authorizing language. ✓
- Implementation notes ссылаются на RFC-0224 (accepted→implemented), `rfc.verification.emit`, `rfc.supersede.propose` — корректные governance-ссылки. ✓
- Anti-fabrication: контент не авторизуется. ✓
- Storage policy: не затрагивается. ✓
- NEEDS CLARIFICATION markers: не найдены. ✓

## Axis F — Pragmatism

- **Minimal command surface**: Одна новая команда, не флаг на существующей. Альтернативы обоснованно отвергнуты. ✓
- **Lean contracts**: TypeScript-типы минимальны. ✓
- **Existing patterns**: Следует паттерну `headers.security.validate` (`loadPublicContext`, `diagnosticsResult`). ✓
- **Scope discipline**: `appsImpacted: []`, `packagesImpacted: [@warpgogol/werkstatt-site]` — корректно. `nonGoals` Explicit. ✓

## Axis G — Blind spots

- **Performance**: RFC не указывает стоимость сканирования всех HTML-файлов в `dist/client/`. Сайт с 100+ страницами требует парсинга каждого файла для извлечения script/style/img/connect origin'ов. Следует оценить file count и I/O cost.
- **Edge cases — missing origin types**:
  - `<script type="module" src="...">` — не упомянут. Module scripts тоже имеют `src` и требуют CSP coverage.
  - `<link rel="preload" as="script" href="...">` — не упомянут. Preload требует CSP coverage.
  - `<img srcset="...">` и `<source srcset="...">` — не упомянуты. Srcset может содержать внешние origin'ы.
  - `connect-src` (CSP-ORIGIN-04): RFC проверяет `fetch("...")` и `XMLHttpRequest` в inline `<script>` блоках HTML. Но Astro bundlit JS в `dist/client/_astro/*.js`, не в inline-скрипты HTML. Следует уточнить: сканируются ли `.js` файлы тоже, или только inline-скрипты в HTML? Если только HTML — правило практически никогда не сработает для Astro-сайтов.
- **False positives**: RFC упоминает false positives от dynamically injected scripts и data-URI scripts, но не оценивает rate и не описывает механизм suppression (например, suppressions-config.yaml).
- **Empty state**: Новый сайт без контента → нет HTML в `dist/client/` → skip with pass. Не упомянуто явно.
- **Migration path**: «Grace period: None» — существующие сайты могут сразу fail'нуть build. Следует упомянуть, что фикс — добавление origin'ов в `public/_headers` CSP, что может потребовать обновления `_headers.template`.

## Questions for the author

1. Почему `related: [DNA-57]`? DNA-57 касается text normalization parity, не CSP. Если CSP coverage — это расширение DNA-57, то почему не `satisfies: [DNA-57]`? Если нет — удалите или замените ссылку.
2. `connect-src` rule (CSP-ORIGIN-04) ищет `fetch()` в inline-скриптах HTML, но Astro bundlit JS в отдельные `.js` файлы. Сканируются ли `.js` файлы в `dist/client/`? Если нет — правило практически не имеет эффекта для Astro-сайтов.
3. Какой флаг для targeting конкретного сайта: `--app` или `--site`? Существующие `scope: "app"` команды не используют `--app`. Следует выровнять с конвенцией.
