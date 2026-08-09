/*
<MODULE_CONTRACT>
<purpose>Defines type structures for LordIcon components, ensuring consistent configuration and usage across the UI.</purpose>
<non-goals>
  <item>Do not implement rendering or animation logic for icons.</item>
  <item>Do not manage external data fetching for icon assets.</item>
  <item>Do not define global styles or themes related to icons.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Refine type definitions and interfaces for LordIcon components to improve clarity and maintainability.</item>
</CHANGE_SUMMARY>
*/

/**
 * Type definitions for LordIcon components
 *
 * @module
 */

/**
 * Predefined color palette for icons.
 * Aligned with the RFC-0103 IconColor enum so SectionList / SectionSplitList /
 * SectionCardGrid / SectionCta can pass `iconColor` straight through without
 * a mapping layer.
 */
export type LordIconColor =
  | "current"
  | "primary"
  | "secondary"
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "muted"
  | "white"
  | "gray";

/** Trigger types for icon animation */
export type LordIconTrigger =
  "in" | "click" | "hover" | "loop" | "loop-on-hover" | "morph" | "boomerang" | "sequence";

/** Stroke weight options */
export type LordIconStroke = "light" | "regular" | "bold";

/** Color configuration - either string or object with primary/secondary */
export type LordIconColors = string | { primary?: string; secondary?: string };

/**
 * Props for LordIcon components
 *
 * @example
 * ```astro
 * <LordIconBase
 *   src="/icons/animation.json"
 *   size={24}
 *   color="primary"
 *   trigger="hover"
 *   stroke="bold"
 *   aria-label={iconLabel}
 * />
 * ```
 */
export interface LordIconProps {
  /** URL or path to the LordIcon JSON animation file */
  src?: string;
  /** Size in pixels (default: 20) */
  size?: number;
  /** Predefined color from palette (default: "current") */
  color?: LordIconColor;
  /** Custom color configuration - overrides `color` if set */
  colors?: LordIconColors;
  /** Additional CSS classes */
  class?: string;
  /** Animation speed multiplier */
  speed?: number;
  /** Animation trigger (default: "hover") */
  trigger?: LordIconTrigger;
  /** Stroke weight (default: "bold") */
  stroke?: LordIconStroke;
  /** Loading strategy (default: browser default / eager) */
  loading?: "lazy" | "interaction" | "delay" | "eager";
  /** Accessibility label for the icon */
  "aria-label"?: string;
}
