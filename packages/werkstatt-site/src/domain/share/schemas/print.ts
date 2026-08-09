/*
<MODULE_CONTRACT>
<purpose>
RFC-0257: TypeScript contracts for the print-ready visitor-page system.
Defines page-level print config, site-level print labels, and the PDF generator
result shape. Consumed by @warpgogol/werkstatt-site/ontology schemas, @warpgogol/werkstatt-site/ui layout, and
@warpgogol/site-kernel-checks validators.
</purpose>
<non-goals>
  <item>Do not implement Zod schemas here — @warpgogol/werkstatt-site/ontology owns the Zod validation schemas.</item>
  <item>Do not import from Astro or app-specific modules.</item>
  <item>Do not define runtime print detection logic — that lives in @warpgogol/werkstatt-site/ui.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0257: Initial creation — print content contracts for page frontmatter, site labels, and PDF generator result.</item>
</CHANGE_SUMMARY>
*/

// ---------------------------------------------------------------------------
// Closed enums
// ---------------------------------------------------------------------------

export const PRINT_ORIENTATIONS = ["portrait", "landscape", "auto"] as const;
export type PrintOrientation = (typeof PRINT_ORIENTATIONS)[number];

export const PRINT_PAGE_SIZES = ["a4", "letter", "legal"] as const;
export type PrintPageSize = (typeof PRINT_PAGE_SIZES)[number];

export const PRINT_MARGINS = ["normal", "narrow", "none"] as const;
export type PrintMargins = (typeof PRINT_MARGINS)[number];

export const PRINT_BACKGROUND_MODES = ["preserve", "flatten"] as const;
export type PrintBackgroundMode = (typeof PRINT_BACKGROUND_MODES)[number];

export const PRINT_REGIONS = [
  "navigation",
  "breadcrumbs",
  "cta",
  "footer-links",
  "header-logo",
  "site-background",
  "hero-animation",
] as const;
export type PrintRegion = (typeof PRINT_REGIONS)[number];

// ---------------------------------------------------------------------------
// Page-level print config (frontmatter `print:` block)
// ---------------------------------------------------------------------------

export interface PagePrintConfig {
  /** When false, no PDF is generated and the browser print shows a disabled notice. Default: true. */
  enabled?: boolean;
  /** Print orientation. Default: auto (generator picks best fit). */
  orientation?: PrintOrientation;
  /** Page size passed to Playwright. Default: a4. */
  pageSize?: PrintPageSize;
  /** Margin preset. Default: normal. */
  margins?: PrintMargins;
  /** When true, expand all <details> before PDF capture. Default: true. */
  expandDetails?: boolean;
  /** Screen regions to suppress in print. Default: []. */
  hide?: PrintRegion[];
  /** Background handling: preserve keeps images/colors, flatten replaces with neutral surface. Default: preserve. */
  background?: PrintBackgroundMode;
}

// ---------------------------------------------------------------------------
// Site-level print labels (site/{lang}/labels.md `print:` block)
// ---------------------------------------------------------------------------

export interface SitePrintLabels {
  headerLogo?: string;
  headerBrandLabel?: string;
  headerTagline?: string;
  footerLegalNotice?: string;
  footerShowUrl?: boolean;
  footerShowDate?: boolean;
  footerPageNumberLabel?: string;
  printDisabledNotice?: string;
}

// ---------------------------------------------------------------------------
// PDF generator result (print.pdf.generate command output)
// ---------------------------------------------------------------------------

export interface PrintPdfGenerateResult {
  generated: number;
  skipped: number;
  disabled: number;
  errors: Array<{ route: string; error: string }>;
  outputDir: string;
}
