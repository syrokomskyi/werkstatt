/*
<MODULE_CONTRACT>
<purpose>
TypeScript companion to @warpgogol/tokens — exports TOKEN_NAMES (a readonly const
tuple of every --ds-* custom property defined in tokens.css) and a DesignToken
type alias for safe usage in validators, style tooling, and tests.
DEFAULT values are those of the Warpgogol studio site (apps-todo/main).
</purpose>
<non-goals>
  <item>Do not import or bundle the CSS file — this module is TS-only.</item>
  <item>Do not export token VALUES — values live exclusively in tokens.css.</item>
  <item>Do not include app-specific override tokens (e.g. --ds-z-*).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 6 (RFC-0023): Initial creation alongside tokens.css extraction.</item>
</CHANGE_SUMMARY>
*/

// ---------------------------------------------------------------------------
// Token names — generated from src/tokens.css by codegen:token-names
// ---------------------------------------------------------------------------

import { TOKEN_NAMES } from "./token-names.generated.ts";
export { TOKEN_NAMES };

/** Union type of every design token name defined in tokens.css. */
export type DesignToken = (typeof TOKEN_NAMES)[number];

/** Set of all token names — useful for O(1) membership checks in validators. */
export const TOKEN_NAME_SET: ReadonlySet<string> = new Set(TOKEN_NAMES);

// ---------------------------------------------------------------------------
// Token categories — map each category prefix to the tokens within it
// ---------------------------------------------------------------------------

export const TOKEN_CATEGORIES = {
  rgb: TOKEN_NAMES.filter((t) => t.startsWith("--ds-rgb-")),
  space: TOKEN_NAMES.filter((t) => t.startsWith("--ds-space-")),
  font: TOKEN_NAMES.filter((t) => t.startsWith("--ds-font-")),
  text: TOKEN_NAMES.filter((t) => t.startsWith("--ds-text-")),
  lineHeight: TOKEN_NAMES.filter((t) => t.startsWith("--ds-line-height-")),
  tracking: TOKEN_NAMES.filter((t) => t.startsWith("--ds-tracking-")),
  radius: TOKEN_NAMES.filter((t) => t.startsWith("--ds-radius-")),
  border: TOKEN_NAMES.filter((t) => t.startsWith("--ds-border-")),
  duration: TOKEN_NAMES.filter((t) => t.startsWith("--ds-duration-")),
  ease: TOKEN_NAMES.filter((t) => t.startsWith("--ds-ease-")),
  angle: TOKEN_NAMES.filter((t) => t.startsWith("--ds-angle-")),
  blur: TOKEN_NAMES.filter((t) => t.startsWith("--ds-blur-")),
  filter: TOKEN_NAMES.filter((t) => t.startsWith("--ds-filter-")),
  color: TOKEN_NAMES.filter((t) => t.startsWith("--ds-color-")),
  image: TOKEN_NAMES.filter((t) => t.startsWith("--ds-image-")),
  gradient: TOKEN_NAMES.filter((t) => t.startsWith("--ds-gradient-")),
  shadow: TOKEN_NAMES.filter((t) => t.startsWith("--ds-shadow-")),
  size: TOKEN_NAMES.filter((t) => t.startsWith("--ds-size-")),
  opacity: TOKEN_NAMES.filter((t) => t.startsWith("--ds-opacity-")),
  z: TOKEN_NAMES.filter((t) => t.startsWith("--ds-z-")),
} as const satisfies Record<string, readonly string[]>;
