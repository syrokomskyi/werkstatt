# Visibility Expressions

> **Established by:** RFC-0026 · DNA-26

Block-level `visibility:` fields and feature-graph visibility conditions both use the same closed **`VisibilityExpr`** grammar, defined in `@warpgogol/share/visibility`. One grammar, two consumers.

---

## Grammar reference

```ts
type VisibilityExpr =
  | { feature: string }          // is this feature-graph key enabled?
  | { locale: string | string[] } // is the active locale in this list?
  | { segment: string | string[] } // reserved — always false at MVP (RFC-0027)
  | { flag: string }              // reserved — always false at MVP (RFC-0027)
  | { all: VisibilityExpr[] }     // all sub-expressions must be true (AND)
  | { any: VisibilityExpr[] }     // at least one sub-expression must be true (OR)
  | { not: VisibilityExpr };      // negate a sub-expression
```

All expressions evaluate at **build time** against `EMPTY_RUNTIME_CONTEXT(lang)`. There is no runtime re-evaluation in the static CDN build.

---

## Operators

### `feature`

```yaml
visibility:
  feature: hero-enabled
```

Checks whether `hero-enabled` is enabled in the content-declared feature graph (`src/content/features/`). If the feature is absent from the graph it defaults to **enabled** (per RFC-0018 defaults).

### `locale`

```yaml
visibility:
  locale: de                 # single locale
```

```yaml
visibility:
  locale: [de, en]           # multiple locales — true if active lang is in the list
```

Evaluated against `ctx.locale`. Pages rendered for `lang=de` have `ctx.locale = "de"`.

### `all` (AND)

```yaml
visibility:
  all:
    - feature: women-section-enabled
    - locale: de
```

True only when **every** sub-expression is true.

### `any` (OR)

```yaml
visibility:
  any:
    - locale: de
    - locale: en
```

True when **at least one** sub-expression is true.

### `not`

```yaml
visibility:
  not:
    locale: en
```

Negates the inner expression.

---

## Reserved operators (MVP no-ops)

### `segment`

```yaml
visibility:
  segment: returning-donor
```

`ctx.segment` is always `null` at MVP. **`segment` expressions always evaluate `false`** until RFC-0027 activates persona detection. You may author `segment` conditions in content today — they will start returning `true` when RFC-0027 ships without any content migration.

### `flag`

```yaml
visibility:
  flag: new-cta-variant
```

`ctx.flags` is always `{}` at MVP. **`flag` expressions always evaluate `false`** until RFC-0027. Same forward-compat story as `segment`.

---

## Evaluation rules

1. `null` / absent → **true** (block is shown by default)
2. `feature` → delegates to the feature graph; missing feature → **true**
3. `locale` → compares against `ctx.locale`
4. `segment` → `ctx.segment === null` → **always false at MVP**
5. `flag` → `ctx.flags[key]` → **always false at MVP**
6. `all` → short-circuit AND
7. `any` → short-circuit OR
8. `not` → logical negation

---

## Validation

`visibility.expr.validate` (part of `build.check`) scans all page content and feature-graph files for `visibility:` fields and parses each one against `VisibilityExprSchema`. Unknown operators or malformed shapes fail the check.

---

## Examples

**Only show in German:**

```yaml
visibility:
  locale: de
```

**Show if feature enabled AND locale is DE or EN:**

```yaml
visibility:
  all:
    - feature: transparency-section
    - locale: [de, en]
```

**Hide in EN (show everywhere else):**

```yaml
visibility:
  not:
    locale: en
```

**Future: show only to returning donors (no-op at MVP):**

```yaml
visibility:
  segment: returning-donor
```

---

## Extending the grammar

`VisibilityExpr` is a closed discriminated union (DNA-26). Adding a new case (e.g., `{ abTest: string }`) requires a superseding RFC. Do not add new cases without a corresponding RFC.
