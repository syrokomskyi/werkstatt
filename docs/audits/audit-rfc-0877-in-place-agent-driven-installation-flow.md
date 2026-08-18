---
rfcId: RFC-0877
auditId: AUDIT-RFC-0877-01
date: 2026-08-18
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0877

## Verdict: Needs revision

RFC содержит серьёзное нарушение forward-only принципа (Axis D) — сохранение недокументированного backward-compat пути `forge create --name X` прямо противоречит ecosystem rules. Дополнительно, DNA-54 указан декоративно (Axis B), а список файлов для удаления и обновления неполон (Axis C). Найдены пробелы в conflict check для IDE-созданных директорий (Axis G).

## Mechanical validation (rfc.validate)

Pass — 3 warning'а V-12 (supersedes chain не reciprocal: RFC-0544, RFC-0779, RFC-0547 не имеют `supersededBy: RFC-0877`). Это ожидаемо для draft RFC — `supersededBy` будет заполнен при acceptance. 0 error'ов.

## Axis A — Structural completeness

No issues. Все секции содержат реальный контент, нет template placeholder'ов. Decision в present tense. CLI surface показывает точные команды с флагами. TypeScript contracts минимальны. File system responsibilities table указывает конкретные пути. Output format документирует `--json` shape. Failure modes table детальная. Rollout описывает adoption path. Alternatives considered содержит 5 реальных альтернатив. Risks включает agent misinterpretation risk. Acceptance criteria checkable. Implementation notes explicit.

## Axis B — DNA alignment

**Finding B-1: DNA-54 указан декоративно.** RFC строка 123 прямо утверждает: "the RFC changes how forge is installed and how `forge.yaml` is bootstrapped, but does not change the bindings contract itself." DNA-54 (Forge bindings contract) требует что canonical forge skill bodies не содержат hardcoded literals — этот RFC не enforce'ит, не protect'ит и не extend'ит этот инвариант. RFC не касается skill body content или bindings. `satisfies: [DNA-54]` должно быть удалено, либо RFC должен объяснить как именно он enforce'ит/protect'ит/extend'ит DNA-54.

DNA-64 (Engine/profile/component-graph boundary) — обосновано. RFC удаляет `workshop.scaffold` из engine, consolidating scaffolding в `forge create`. Это strengthen'ит engine boundary. ✓

## Axis C — Ecosystem fit

**Finding C-1: `packages/werkstatt/src/workshop/index.ts` отсутствует в списке удаления.** Файл re-export'ит `createWorkshopModule`, `runWorkshopScaffold`, `getWorkshopFiles`, `STACK_PLUGIN_MAP` — все эти symbol'ы будут удалены. `index.ts` должен быть в списке удаления (строка 293-298 RFC).

**Finding C-2: `packages/werkstatt/AGENTS.md` entry points не упомянуты.** `packages/werkstatt/AGENTS.md` lists `@warpgogol/werkstatt/workshop` и `@warpgogol/werkstatt/workshop-module` как entry points (строки 27-28 в entry points table). Эти entry points должны быть удалены из AGENTS.md. Также `packages/werkstatt/package.json` `exports` field вероятно содержит `./workshop` и `./workshop-module` — должны быть удалены.

**Finding C-3: Root `AGENTS.md` строка 12 ссылается на `workshop.scaffold`.** Текущий текст: "New workshops (consumer monorepos) must be created via `workshop.scaffold` (RFC-0779), not by copying this repository." RFC говорит что AGENTS.md обновляется, но не указывает конкретно что эта строка должна быть заменена на `forge create --in-place` инструкции.

**Finding C-4: Generated files ссылаются на `workshop.scaffold`.** `docs/COMMANDS.md`, `docs/command-manifest.generated.yaml`, `docs/ecosystem.generated.yaml` содержат ссылки на `workshop.scaffold`. Эти generated files должны быть перегенерированы после удаления команды. RFC не упоминает регенерацию.

**Finding C-5: `docs/authoring/site-composition.md` ссылается на `workshop.scaffold`.** Не упомянут в RFC как файл требующий обновления.

## Axis D — Forward-only compliance

**Finding D-1: Недокументированный backward-compat путь нарушает forward-only принцип.** RFC строка 317: "`forge create --name X` (without `--in-place`) remains functional but undocumented. It is not removed from code, only from the README." Это прямой violation forward-only принципа: ecosystem не поддерживает compatibility shim'ы, dual-path, или legacy behavior. Acceptance criteria строка 357 даже требует что old path остаётся функциональным. Решение: либо удалить `--name X` path полностью из code (и acceptance criteria), либо сделать его documented deprecation с timeline удаления в этом же RFC wave.

## Axis E — Agent-facing policy

No issues. Нет self-authorizing language. Implementation notes ссылаются на RFC-0224 и RFC-0334. Нет NEEDS CLARIFICATION marker'ов. Storage policy N/A.

## Axis F — Pragmatism

No issues. `--in-place` — flag на existing command, не new command. TypeScript contracts минимальны. Existing pattern extended вместо new command. `packagesImpacted` lists only forge и werkstatt. `nonGoals` meaningful.

## Axis G — Blind spots

**Finding G-1: `.git/` directory не address'нут в conflict check.** Если оператор выполнил `git init` в пустой папке, `.git/` существует. RFC не указывает — tolerated или refused? `.git/` должен быть tolerated (operator может want git repo с первого момента).

**Finding G-2: IDE-созданные директории не address'нуты.** `.vscode/`, `.idea/`, `.windsurf/` могут быть созданы IDE при открытии папки. Эти директории должны быть tolerated — они не конфликтуют с scaffold files.

**Finding G-3: OS-созданные файлы не address'нуты.** `.DS_Store` (macOS), `Thumbs.db` (Windows), `desktop.ini` могут существовать в "пустой" папке. Должны быть tolerated.

**Recommendation:** Conflict check должен использовать allowlist подход: tolerate всё кроме explicit conflict list (`forge.yaml`, `.agents/`, `docs/`, `skills/`, `AGENTS.md`, `.forge/`), вместо denylist подхода который пытается enumerate все tolerated files.

## Questions for the author

1. Почему `DNA-54` в `satisfies[]`? RFC явно утверждает что не меняет bindings contract — какой инвариант DNA-54 этот RFC enforce'ит/protect'ит/extend'ит?
2. Как `forge create --name X` (без `--in-place`) может оставаться в code если ecosystem forward-only? Какой scenario оправдывает сохранение undocumented dual-path?
3. Что произойдёт с `packages/werkstatt/src/workshop/index.ts` и `package.json` exports `./workshop` — они остаются как empty re-export или удаляются полностью?
