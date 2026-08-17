/*
<MODULE_CONTRACT>
<purpose>
Canonical CSS value normalizer shared by biome.css.generate (codegen) and
biome.tokens.validate (drift detection). Whitespace collapsing, quote
normalisation, hex lowercasing, and trailing-zero stripping are applied in a
single deterministic order so that generated CSS and drift comparisons never
disagree on equality.
</purpose>
<non-goals>
  <item>Do not format CSS for emission — line-breaking is the caller's job.</item>
  <item>Do not parse CSS structure — this is a string-level transform only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial: unified normalizeCssValue from site-kernel-codegen and site-kernel-checks.</item>
</CHANGE_SUMMARY>
*/

/**
 * Normalize a CSS value string for stable comparison and emission.
 *
 * Applies (in order):
 * 1. Whitespace collapse + trim (multi-line gradients become single-line)
 * 2. Parenthesis spacing removal
 * 3. Single → double quote conversion
 * 4. Hex color lowercasing
 * 5. Trailing decimal zero stripping
 */
export function normalizeCssValue(value: string): string {
  return (
    value
      // Collapse all whitespace runs (handles multi-line gradient formatting)
      .replace(/\s+/g, " ")
      .trim()
      // Remove spaces immediately after ( and before ) so gradient args align
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")")
      // CSS strings: double quotes
      .replace(/'([^']*)'/g, '"$1"')
      // Hex colors: lowercase
      .replace(/#([0-9A-Fa-f]+)/g, (_m, hex) => `#${hex.toLowerCase()}`)
      // Strip trailing decimal zeros (e.g. 20.40px → 20.4px, 1.10 → 1.1)
      .replace(/(\d+\.\d*[1-9])0+/g, "$1")
      // Strip redundant .0 suffix (e.g. 1.0 → 1, 0.0 → 0)
      .replace(/(\d+)\.0+(?!\d)/g, "$1")
  );
}
