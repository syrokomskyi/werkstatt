/*
<MODULE_CONTRACT>
<purpose>
RFC-0213: the authored-content freshness model. Given a claim's temporal window
(asOf / validUntil / reviewEvery) and "today", derive a freshness state and the
ledger entry shape. Framework-free, deterministic, date-only — the surface
Freshness Ledger (RFC-0196) shares this state taxonomy + ledger shape so one
health view can read both, but computes state from page substance, not dates.
</purpose>
<non-goals>
  <item>Do not read the filesystem, parse sidecars, or emit Diagnostics — the kernel command does that.</item>
  <item>Do not compute page-substance decay (surface RFC-0196 owns that input).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0213: initial freshness state model + ledger shapes.</item>
</CHANGE_SUMMARY>
*/

export type FreshnessState = "fresh" | "review-due" | "expiring-soon" | "expired" | "unsourced";

export type FreshnessCriticality = "advisory" | "important" | "blocking";

const MS_PER_DAY = 86_400_000;

/** Parse an ISO date (YYYY-MM-DD) to a UTC epoch-ms at midnight, or null. */
function parseIsoDate(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DURATION_RE =
  /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/**
 * Add an ISO 8601 duration to an ISO date. Calendar-correct for Y/M; W/D add
 * fixed days; the time component is truncated to whole days (cadences are coarse).
 * Returns null on malformed input.
 */
export function addDuration(dateIso: string, duration: string): string | null {
  const base = parseIsoDate(dateIso);
  if (base === null) return null;
  const m = DURATION_RE.exec(duration);
  if (!m || duration === "P" || duration === "PT") return null;
  const [, y, mo, w, d] = m;
  const dt = new Date(base);
  if (y) dt.setUTCFullYear(dt.getUTCFullYear() + Number(y));
  if (mo) dt.setUTCMonth(dt.getUTCMonth() + Number(mo));
  const extraDays = (w ? Number(w) * 7 : 0) + (d ? Number(d) : 0);
  if (extraDays) dt.setUTCDate(dt.getUTCDate() + extraDays);
  return toIso(dt.getTime());
}

export interface FreshnessWindow {
  asOf: string;
  validUntil?: string;
  reviewEvery?: string;
}

export interface FreshnessEvaluation {
  state: FreshnessState;
  reviewDueAt?: string;
  /** Days until validUntil; negative if past. Computed, not stored. */
  daysToExpiry?: number;
}

/**
 * Derive freshness state from a window relative to `today` (ISO date).
 * `unsourced` is decided by the caller (a NEED_THIS value) and short-circuits here.
 * Precedence: expired > expiring-soon > review-due > fresh.
 */
export function evaluateFreshness(
  window: FreshnessWindow,
  today: string,
  soonWindowDays = 30,
): FreshnessEvaluation {
  const todayMs = parseIsoDate(today);
  const reviewDueAt = window.reviewEvery
    ? (addDuration(window.asOf, window.reviewEvery) ?? undefined)
    : undefined;

  let daysToExpiry: number | undefined;
  if (window.validUntil) {
    const vu = parseIsoDate(window.validUntil);
    if (vu !== null && todayMs !== null) {
      daysToExpiry = Math.round((vu - todayMs) / MS_PER_DAY);
    }
  }

  let state: FreshnessState = "fresh";
  if (daysToExpiry !== undefined && daysToExpiry < 0) {
    state = "expired";
  } else if (daysToExpiry !== undefined && daysToExpiry <= soonWindowDays) {
    state = "expiring-soon";
  } else if (reviewDueAt && todayMs !== null) {
    const due = parseIsoDate(reviewDueAt);
    if (due !== null && due <= todayMs) state = "review-due";
  }

  return { state, reviewDueAt, daysToExpiry };
}

/** One claim's freshness in the ledger. `subject` is the canonical address string. */
export interface FreshnessLedgerEntry {
  subject: string;
  state: FreshnessState;
  asOf?: string;
  validUntil?: string;
  reviewDueAt?: string;
  criticality: FreshnessCriticality;
}

/** The deterministic per-app authored Freshness Ledger (mirrors the surface ledger shape). */
export interface AuthoredFreshnessLedger {
  generatedAt: string;
  site: string;
  entries: FreshnessLedgerEntry[];
  summary: Record<FreshnessState, number>;
}

export function emptyFreshnessSummary(): Record<FreshnessState, number> {
  return { fresh: 0, "review-due": 0, "expiring-soon": 0, expired: 0, unsourced: 0 };
}
