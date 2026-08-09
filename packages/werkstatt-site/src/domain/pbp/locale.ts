/**
 * PBP Locale resolution contracts.
 *
 * @see pbp-specification-package/compiler §7 (Locale Resolution)
 * @see RFC-0406
 */

export type PbpLocaleFieldPolicy =
  "localizable" | "invariant" | "locale-variant-allowed" | "not-localized";

export type PbpLocaleResolutionStatus = "full-locale" | "full-file-fallback" | "partial-fallback";

export interface PbpFallbackEntry {
  entityId: string;
  path: string;
  sourceLocale: string;
  targetLocale: string;
  severity: "warning" | "info";
}

export interface PbpFallbackReport {
  locale: string;
  fallbacks: PbpFallbackEntry[];
}
