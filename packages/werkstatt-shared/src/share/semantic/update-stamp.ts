/*
<MODULE_CONTRACT>
<purpose>
RFC-0317: source-backed update-stamp resolver. Provides a deterministic,
non-fabricated lastmod date for sitemap, feed, and Markdown twin provenance.
Never uses build date, current time, or filesystem mtime.
</purpose>
<non-goals>
  <item>Do not use new Date(), build time, or file mtime as a stamp source.</item>
  <item>Do not fabricate stamps when no source is available — return undefined.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0317: initial implementation — authored frontmatter + sitemap.lastmod + CKL ledger sources.</item>
</CHANGE_SUMMARY>
*/

export type UpdateStampSource =
  | "authored-page-frontmatter"
  | "authored-system-output"
  | "ckl-claim-ledger"
  | "git-content-history";

export interface PageUpdateStamp {
  date: string; // YYYY-MM-DD
  source: UpdateStampSource;
  inputs: string[]; // content files or records that contributed
}

export type UpdateStampMissingReason =
  "not-authored" | "git-unavailable" | "insufficient-history" | "no-content-source";

export interface PageUpdateStampResult {
  pageId: string;
  lang: string;
  stamp?: PageUpdateStamp;
  missingReason?: UpdateStampMissingReason;
}

/** RFC-0317: validate a date string is YYYY-MM-DD. */
export function isValidStampDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * RFC-0317 priority 1: explicit authored content date.
 * Checks `output.sitemap.lastmod` and `article.updatedAt` / `article.publishedAt`
 * from the system.md page entry.
 */
export function resolveAuthoredStamp(
  pageEntry: Record<string, unknown>,
): PageUpdateStamp | undefined {
  const output = pageEntry.output as
    | { sitemap?: { lastmod?: string }; article?: { updatedAt?: string; publishedAt?: string } }
    | undefined;

  const lastmod = output?.sitemap?.lastmod;
  if (isValidStampDate(lastmod)) {
    return {
      date: lastmod,
      source: "authored-system-output",
      inputs: ["system.md:output.sitemap.lastmod"],
    };
  }

  const article =
    (pageEntry.article as { updatedAt?: string; publishedAt?: string } | undefined) ??
    output?.article;
  if (article) {
    if (isValidStampDate(article.updatedAt)) {
      return {
        date: article.updatedAt,
        source: "authored-page-frontmatter",
        inputs: ["system.md:article.updatedAt"],
      };
    }
    if (isValidStampDate(article.publishedAt)) {
      return {
        date: article.publishedAt,
        source: "authored-page-frontmatter",
        inputs: ["system.md:article.publishedAt"],
      };
    }
  }

  return undefined;
}

/**
 * RFC-0317 priority 2: CKL claim ledger dates.
 * Given a list of ledger asOf dates that match the page's business domain,
 * return the latest one as a stamp.
 */
export function resolveCklStamp(
  ledgerDates: string[],
  inputs: string[],
): PageUpdateStamp | undefined {
  const valid = ledgerDates.filter(isValidStampDate);
  if (valid.length === 0) return undefined;
  const latest = [...valid].sort().at(-1)!;
  return {
    date: latest,
    source: "ckl-claim-ledger",
    inputs,
  };
}

/**
 * RFC-0317: resolve a single page's update stamp.
 * Tries authored sources first, then CKL ledger if provided.
 * Returns `stamp: undefined` when no allowed source is available.
 */
export function resolvePageUpdateStamp(params: {
  pageId: string;
  lang: string;
  pageEntry: Record<string, unknown>;
  cklLedgerDates?: string[];
  cklInputs?: string[];
}): PageUpdateStampResult {
  const { pageId, lang, pageEntry, cklLedgerDates, cklInputs } = params;

  const authored = resolveAuthoredStamp(pageEntry);
  if (authored) {
    return { pageId, lang, stamp: authored };
  }

  if (cklLedgerDates && cklLedgerDates.length > 0) {
    const ckl = resolveCklStamp(cklLedgerDates, cklInputs ?? []);
    if (ckl) {
      return { pageId, lang, stamp: ckl };
    }
  }

  return { pageId, lang, missingReason: "no-content-source" };
}
