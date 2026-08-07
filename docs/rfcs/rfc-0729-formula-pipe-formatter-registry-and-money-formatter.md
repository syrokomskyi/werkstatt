---
id: RFC-0729
title: "Formula pipe syntax, formatter registry, and money formatter"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-07
updatedAt: 2026-08-07
enhancedAt: 2026-08-07
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0570
amendedBy: []
related:
  - RFC-0527
  - RFC-0529
  - RFC-0728
  - RFC-0730
satisfies:
  - DNA-4
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/share"
nonGoals:
  - "Does not implement currency conversion exchange rate feeds — only the formatter API accepts optional targetCurrency + rate"
  - "Does not add formatters other than money — date, percent, unit formatters are follow-up"
  - "Does not change scanFormulas or the =(…) expression boundary syntax"
  - "Does not change extractNumeric or the arithmetic evaluation path"
---

# RFC-0729: Formula pipe syntax, formatter registry, and money formatter

## Context

The content reference system (RFC-0527, RFC-0529, RFC-0570) resolves `=(…)` formula expressions inside Markdown strings. `resolveFormula` in `packages/share/src/formula-eval.ts` resolves content references, extracts numeric values via `extractNumeric` (which strips currency symbols), evaluates arithmetic via `expr-eval`, and returns a numeric string.

This works for arithmetic (`=(12 * ref)` → `840`), but there is no mechanism to format the result for display. A canonical PBP charge value `"70.00"` (ADR-012 decimal string) resolves to `70` — bare, without currency symbol, without locale-aware formatting. Content authors must manually append `€` outside the formula, producing `70 €` with no locale awareness and no foundation for currency conversion.

RFC-0728 enforces `pbpChargeSchema` on offering pricing charges, making canonical decimal strings the single source of truth for monetary values. RFC-0730 (companion RFC) eliminates `presentation.price` duplication and routes all price display through canonical references. This RFC provides the formatting engine that RFC-0730 depends on.

## Problem

1. **No display formatting in formula engine.** `resolveFormula` returns `String(number)` — always a bare numeric string. There is no way to produce `70 €` or `70,00 €` (German format) from a single formula expression.

2. **Manual € appended outside formula.** Content authors write `=(…amount.value) €` — the `€` is a literal string after the formula. This produces `70 €` but with no locale awareness, no thousands separators, no decimal formatting, and no currency conversion path.

3. **No formatter registry.** There is no extensibility point for adding display formatters. Any formatting logic must be hardcoded into `resolveFormula`, coupling the formula engine to every display concern.

4. **Currency conversion foundation absent.** The site currently displays EUR only. Future multi-currency display (UAH, USD) requires a formatting API that accepts `targetCurrency` and `exchangeRate` — none exists.

## Decision

The formula engine gains a **pipe syntax** for post-evaluation formatting, a **plugin-registration formatter registry**, and a **`money` formatter** built on `Intl.NumberFormat`.

### Pipe syntax

Inside `=(…)` expressions, a `|` pipe operator separates the arithmetic expression (left) from the formatter specification (right):

```
=(ref | money currency=EUR locale=de)
=(12 * ref | money currency=EUR locale=de)
=(ref | money currency=EUR locale=de targetCurrency=UAH rate=45)
```

The left side is evaluated exactly as today (references resolved, `extractNumeric` applied, `expr-eval` arithmetic). The result is passed to the formatter named on the right side. The formatter returns a display string.

If no pipe is present, behavior is unchanged — `resolveFormula` returns `String(number)` as today (RFC-0570, RFC-0723).

### Formatter registry

A plugin-registration API in `@warpgogol/share/formula-eval`:

```ts
export type PipeFormatter = (
  value: number,
  params: Record<string, string>,
  context: PipeFormatterContext,
) => string;

export interface PipeFormatterContext {
  lang: string;
  defaultLang: string;
}

export function registerPipeFormatter(name: string, formatter: PipeFormatter): void;
export function getPipeFormatter(name: string): PipeFormatter | undefined;
```

Formatters are registered at module initialization time. The `money` formatter is registered by default within `@warpgogol/share/formula-eval` — no external registration needed.

### Money formatter

```ts
registerPipeFormatter("money", (value, params, context) => {
  const currency = params.currency ?? "EUR";
  const locale = params.locale ?? context.lang;
  const targetCurrency = params.targetCurrency;
  const rate = params.rate ? Number(params.rate) : undefined;

  let amount = value;
  let code = currency;
  if (targetCurrency && rate) {
    amount = value * rate;
    code = targetCurrency;
  }

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
});
```

- `currency`: ISO 4217 code (default `EUR`)
- `locale`: BCP 47 tag (default: `context.lang`)
- `targetCurrency`: optional ISO 4217 code for conversion
- `rate`: optional exchange rate (multiply)

`minimumFractionDigits: 0` is intentional — the current warpgogol-com price catalog uses round numbers (70, 200, 1040), and displaying `70,00 €` for a round price adds visual noise without informational value. Future offerings with fractional prices can override via a `minimumFractionDigits` param if needed.

## Architectural fit

- **RFC-0570 (Formula evaluation).** This RFC amends RFC-0570: `resolveFormula` gains a post-evaluation pipe step. `scanFormulas` and the `=(…)` boundary syntax are unchanged. The arithmetic evaluation path (`expr-eval`) is unchanged. `extractNumeric` is unchanged.
- **RFC-0527 / RFC-0529 (Content references).** No changes — pipe syntax lives inside `=(…)` expressions, which are already scanned by `scanFormulas`.
- **RFC-0728 (Charge schema enforcement).** Canonical decimal strings (`"70.00"`) are the input. `extractNumeric` already parses them to `70`. The `money` formatter formats `70` + `EUR` → `70 €` (de) or `70 €` (uk).
- **RFC-0730 (Presentation elimination).** Companion RFC. Depends on this RFC's pipe syntax and `money` formatter to display canonical pricing data without `presentation.price` duplication.
- **DNA-4 (Canonical content in `src/content/`).** Pipe formatting preserves canonical content as the single source of truth — display strings are produced at render time, not stored in content files.

## Design

### CLI surface

No new CLI commands. The change is a library-level feature in `@warpgogol/share/formula-eval`.

### TypeScript contracts

```ts
// packages/share/src/formula-eval.ts

export type PipeFormatter = (
  value: number,
  params: Record<string, string>,
  context: PipeFormatterContext,
) => string;

export interface PipeFormatterContext {
  lang: string;
  defaultLang: string;
}

export function registerPipeFormatter(name: string, formatter: PipeFormatter): void;
export function getPipeFormatter(name: string): PipeFormatter | undefined;
```

`resolveFormula` is extended: after arithmetic evaluation, if the expression contains `|`, the left side is evaluated as arithmetic, the right side is parsed as `formatterName key=value key=value`, and the formatter is invoked. The `PipeFormatterContext` is constructed from `resolveFormula`'s existing `lang` and `defaultLang` arguments — `context.lang = lang`, `context.defaultLang = defaultLang`.

### Pipe parsing

The `|` character splits the expression into two parts: arithmetic (left) and formatter (right). The split is on the first `|` at the top level (not inside quotes — but content references do not contain quotes, so a simple split is sufficient).

Formatter spec parsing:

- First token = formatter name
- Remaining tokens = `key=value` pairs
- Values are bare strings (no quotes needed — currency codes, locale tags, numbers)

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/formula-eval.ts` | `resolveFormula` extended with pipe post-eval; `registerPipeFormatter`, `getPipeFormatter`, `PipeFormatter`, `PipeFormatterContext` exports; `money` formatter registered by default |
| `packages/share/src/formula-eval.test.ts` | Unit tests for pipe parsing, formatter registry, money formatter |
| `packages/share/AGENTS.md` | `formula-eval` entry-point table row updated to list new exports (`registerPipeFormatter`, `getPipeFormatter`, `PipeFormatter`, `PipeFormatterContext`) |

### Output format

N/A — library-level change. Formula expressions in content resolve to formatted strings at render time.

### Failure modes

- **Unknown formatter name.** `resolveFormula` returns an unresolved result with error `REF-10: Unknown pipe formatter: <name>`. The formula expression is left as-is in the output string. This includes the empty-formatter-name case `=(ref |)` where the formatter spec is empty after the pipe.
- **Missing required params.** The `money` formatter has no required params (defaults: `EUR`, `context.lang`). Other future formatters may define required params — they return an error string in the formatted output.
- **Invalid `rate` param.** If `rate` is not a finite number, the formatter ignores `targetCurrency` and `rate`, formatting in the original currency.
- **No pipe, no change.** Expressions without `|` behave exactly as before — `String(number)` for arithmetic, string value for single-ref (RFC-0723).

## Rollout

- **Immediate, no grace period.** The pipe syntax is additive — existing expressions without `|` are unchanged. No content migration needed for this RFC alone.
- **Default `money` formatter.** The `money` formatter is registered at module initialization in `formula-eval.ts`. No external registration call needed by sites.
- **New sites automatically comply.** New sites use `=(ref | money currency=EUR locale=de)` from day one.
- **RFC-0730 depends on this RFC.** RFC-0730 (presentation elimination) uses pipe syntax in content references. RFC-0730 implementation must follow this RFC's implementation.

## Alternatives considered

- **Manual € outside formula (`=(ref) €`).** Rejected: produces `70 €` but with no locale awareness, no thousands separators, no decimal formatting, no currency conversion path. Content authors must know the currency symbol for each locale.

- **Pipe as separate pass in `resolveReferencesInString`.** Rejected: pipe must apply to the formula's numeric result, not to a string. A separate pass would require re-parsing the formula output, coupling the two passes.

- **Hardcoded formatters in `resolveFormula`.** Rejected: couples the formula engine to every display concern. No extensibility. Future formatters (date, percent, unit) would require editing `resolveFormula` each time.

- **Pipe registry in a new subpath `@warpgogol/share/formatters`.** Rejected: adds a new module and a cross-module dependency. The registry is small enough to live in `formula-eval.ts` with a plugin-registration API. The `money` formatter uses `Intl.NumberFormat` (built-in) — no external dependencies.

## Risks

- **`|` character in content.** If a content reference value contains `|`, it could be misinterpreted as a pipe separator. Mitigation: `|` is only interpreted as a pipe inside `=(…)` expressions, and content reference values are entity field values (decimal strings, URIs, enums) — none contain `|`. If a value ever contains `|`, the formula would fail to parse and return an error, not produce incorrect output.

- **`Intl.NumberFormat` locale data.** Node.js and Cloudflare Workers both support `Intl.NumberFormat` with full locale data. No polyfill needed.

- **Formatter registry is global state.** `registerPipeFormatter` mutates a module-level map. Mitigation: registration happens at module initialization (top-level side effect), not at runtime. The `money` formatter is registered by default. External registrations are opt-in and rare.

- **Pipe syntax confusion with bitwise OR.** JavaScript `|` is bitwise OR. Content authors might expect `=(a | b)` to be bitwise OR. Mitigation: `expr-eval` does not support bitwise OR in expressions — `|` is unambiguously a pipe separator inside `=(…)`.

## Acceptance criteria

- [ ] `registerPipeFormatter`, `getPipeFormatter`, `PipeFormatter`, `PipeFormatterContext` exported from `@warpgogol/share/formula-eval`
- [ ] `money` formatter registered by default in `formula-eval.ts`
- [ ] `resolveFormula` handles pipe syntax: splits on `|`, evaluates left as arithmetic, invokes formatter on right
- [ ] Expressions without `|` behave unchanged (RFC-0570, RFC-0723 compatibility)
- [ ] `=(ref | money currency=EUR locale=de)` produces `70 €` from canonical `"70.00"`
- [ ] `=(ref | money currency=EUR locale=de targetCurrency=UAH rate=45)` produces `3.150 ₴` from canonical `"70.00"` (German locale uses `.` as thousands separator)
- [ ] Unknown formatter name produces `REF-10` error, formula left unresolved
- [ ] `pnpm --filter @warpgogol/share build:check` passes
- [ ] `pnpm --filter @warpgogol/share test` passes
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The `money` formatter MUST be registered at module initialization time (top-level side effect in `formula-eval.ts`), not via a runtime call from sites.
- The pipe `|` is only interpreted inside `=(…)` expressions. Outside formulas, `|` is a literal character.
- Agents MUST NOT add formatters other than `money` in this RFC — date, percent, unit formatters are follow-up RFCs.
