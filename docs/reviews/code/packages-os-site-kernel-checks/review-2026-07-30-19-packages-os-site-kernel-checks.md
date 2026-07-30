---
reviewId: REVIEW-CODE-2026-07-30-01
date: 2026-07-30
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 58e2288...HEAD
filesReviewed:
  - packages/passport/src/index.ts
  - packages/passport/AGENTS.md
  - packages/os/site-kernel-checks/src/passport.ts
  - packages/os/site-kernel-checks/src/command-tables/06-growth-passport.ts
  - packages/os/site-kernel-checks/src/generator-ownership.ts
  - packages/os/site-kernel-checks/src/generated-files-validate.ts
  - packages/os/site-kernel-checks/src/pipelines/build-prepare.ts
  - packages/os/site-kernel-checks/src/tests/passport-key-ensure.test.ts
  - packages/os/site-kernel-checks/src/tests/generated-files-validate.test.ts
  - packages/os/site-kernel-checks/src/tests/build-prepare-pipeline.test.ts
---

# Code Review: 58e2288...HEAD (RFC-0604, RFC-0605, RFC-0606)

### Verdict: Needs revision

Реализация трёх RFC в целом корректна — механический этаж проходит, тесты зелёные, acceptance criteria заполнены. Однако есть несколько находок: `writeFile` вместо `writeFileIfChanged` для генерируемого файла (нарушение packages/AGENTS.md), и отсутствует `CHANGE_SUMMARY` в новом тестовом файле.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/passport build:check` и `pnpm --filter @warpgogol/site-kernel-checks build:check` оба проходят с exit code 0.

### Axis A — Structural correctness

- **Finding A-1**: `passport.ts:327` использует `writeFile` из `node:fs/promises` для записи `cosmic-passport-key.json`. Это генерируемый файл (зарегистрирован в `GENERATOR_OWNERSHIP_MAP`). `packages/AGENTS.md` требует `writeFileIfChanged` для всех генерируемых файлов — raw `writeFile` создаёт git churn при каждой регенерации. Хотя `passport.key.ensure` идемпотентна (no-op если файл существует), первый запуск в pipeline всегда вызывает `writeFile`. Нужно использовать `writeFileIfChanged` из `@warpgogol/site-kernel`.

### Axis B — DNA alignment

- **DNA-34** (Verifiable Credential signing + `/.well-known/` discovery): `passport.key.ensure` корректно создаёт `public/.well-known/cosmic-passport-key.json` с Ed25519 ключом. Закрывает пробел в pipeline-безопасном key generation. No issues.
- **DNA-31** (Cosmic Passport as build output): добавление `passport.key.ensure` в `build.prepare` гарантирует наличие ключевого файла до passport emission. No issues.

### Axis C — Ecosystem fit

- **Package boundaries**: импорты `@warpgogol/passport/sign`, `@warpgogol/passport/schema` из `site-kernel-checks` — корректное направление (packages → packages). No issues.
- **Pipeline placement**: `bordbuch.generate` и `passport.key.ensure` размещены после всех генераторов и перед валидаторами — корректно. No issues.
- **Command lifecycle**: `passport.key.ensure` зарегистрирован в `06-growth-passport.ts` с правильными metadata. `GENERATOR_OWNERSHIP_MAP` обновлён. No issues.
- **Compass sync**: `CHANGE_SUMMARY` в `build-prepare.ts` обновлён. No issues.

### Axis D — Forward-only compliance

- `passport.key.rotate` остаётся без изменений — оператор-only команда для ручной ротации. No issues.
- `GENERATOR_OWNERSHIP_MAP` ownership transfer от `passport.key.rotate` к `passport.key.ensure` — forward-only, без обратной совместимости. No issues.

### Axis E — Agent-facing clarity

- **Finding E-1**: `passport-key-ensure.test.ts` не содержит `MODULE_CONTRACT` и `CHANGE_SUMMARY` Compass scaffolding. Тестовые файлы в этом репозитории обычно содержат Compass headers (см. `ratgeber-provenance-validate.test.ts:1-11`, `generated-files-validate.test.ts:1-20`). Новый файл должен следовать тому же паттерну.

### Axis F — Pragmatism

- **Minimal command surface**: `passport.key.ensure` — отдельная команда, не флаг на `passport.key.rotate`. Обосновано в RFC-0605 (разные семантики: ensure vs rotate). No issues.
- **Lean contracts**: TypeScript типы минимальны. `PassportPublicKeyFile` импортирован как type-only. No issues.

### Axis G — Blind spots

- **Concurrency**: `passport.key.ensure` не использует блокировки. Если два `build.prepare` запускаются одновременно и файл не существует, оба могут сгенерировать ключ — last write wins. RFC-0604 Risks отмечает это как acceptable. No issues.
- **Security**: приватный ключ никогда не пишется в stdout. `--private-key-out` использует `chmod 0o600`. No issues.
- **Edge cases**: PKE-01 (manifest missing), PKE-02 (key generation failure), PKE-03 (invalid/no active key), PKE-04 (private key write failure) — все покрыты тестами. No issues.

### Spec compliance

| Requirement | Status | Evidence |
| --- | --- | --- |
| RFC-0605: export `generateKeypair` | Done | `packages/passport/src/index.ts:51` |
| RFC-0605: implement `runPassportKeyEnsure` | Done | `packages/os/site-kernel-checks/src/passport.ts:233-366` |
| RFC-0605: register in command table | Done | `packages/os/site-kernel-checks/src/command-tables/06-growth-passport.ts:159-176` |
| RFC-0605: update `GENERATOR_OWNERSHIP_MAP` | Done | `packages/os/site-kernel-checks/src/generator-ownership.ts:498-504` |
| RFC-0605: unit tests | Done | `passport-key-ensure.test.ts` — 8 tests |
| RFC-0605: update AGENTS.md | Done | `packages/passport/AGENTS.md:11` |
| RFC-0606: add `"systems/"` to prefixes | Done | `generated-files-validate.ts:39` |
| RFC-0606: `{system}` substitution | Done | `generated-files-validate.ts:176` |
| RFC-0606: unit tests | Done | `generated-files-validate.test.ts` — 3 new tests |
| RFC-0604: add to pipeline | Done | `build-prepare.ts:123-124` |
| RFC-0604: exclude from dev pipeline | Done | `build-prepare-pipeline.test.ts` — 2 exclusion tests |
| RFC-0604: pipeline membership tests | Done | `build-prepare-pipeline.test.ts` — 6 tests |

### Questions for the author

1. Почему `writeFile` используется вместо `writeFileIfChanged` в `runPassportKeyEnsure`? Это нарушает правило `packages/AGENTS.md` о генерируемых файлах.
2. Почему `passport-key-ensure.test.ts` не содержит Compass `MODULE_CONTRACT` scaffolding, как остальные тестовые файлы в этом пакете?
