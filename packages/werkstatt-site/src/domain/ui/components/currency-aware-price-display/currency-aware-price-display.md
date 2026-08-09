# Currency-Aware Price Display Component Content

Content template for the currency-aware price display component (RFC-0743).

## Fields

- `priceVariants`: Array of pre-rendered price variants, each with:
  - `currency`: Currency code (e.g. "EUR", "UAH")
  - `formatted`: Pre-formatted price string (e.g. "99 €", "3 900 ₴")
  - `note`: Optional disclosure note from the projection's `display.note` field

## Example

```yaml
priceVariants:
  - currency: "EUR"
    formatted: "99 €"
    note: null
  - currency: "UAH"
    formatted: "3 900 ₴"
    note: "Ціна розрахована за поточним курсом"
```
