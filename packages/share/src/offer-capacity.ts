/*
<MODULE_CONTRACT>
<purpose>Pure Offer Capacity Wave calculations for structured offer availability policy.</purpose>
<non-goals>
  <item>Do not fetch CRM, browser, or private operational data.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0322: add structured offer capacity wave helper.</item>
</CHANGE_SUMMARY>
*/

export interface OfferCapacityPolicy {
  timezone: string;
  startsAt: string;
  cadence: "monthly" | "fixed-days";
  cadenceDays?: number;
  slotRange: { min: number; max: number };
  maxSlotsPerWave: number;
}

export interface OfferCapacityReservation {
  waveId: string;
  slots: number;
  source: "bordbuch" | "manual";
  asOf: string;
}

export interface OfferCapacityState {
  waveId: string;
  waveIndex: number;
  startsAt: string;
  endsAt: string;
  daysRemaining: number;
  progress: number;
  slotRange: { min: number; max: number };
  maxSlots: number;
  reservedSlots?: number;
  openSlots?: number;
  availabilityStatus: "known" | "unknown" | "full";
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateOnly(value: string): Date {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid date-only value: ${value}`);
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function dateOnly(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addMonthsClamped(start: Date, months: number): Date {
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth() + months;
  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const day = Math.min(start.getUTCDate(), daysInMonth(targetYear, targetMonth));
  return new Date(Date.UTC(targetYear, targetMonth, day));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function monthDistance(from: Date, to: Date): number {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  );
}

export function calculateOfferCapacityState(
  policy: OfferCapacityPolicy,
  reservations: readonly OfferCapacityReservation[] = [],
  now: Date = new Date(),
): OfferCapacityState {
  const start = parseDateOnly(policy.startsAt);
  const today = parseDateOnly(dateOnly(now, policy.timezone));
  let waveIndex = 0;
  let waveStart = start;
  let waveEnd: Date;

  if (policy.cadence === "monthly") {
    waveIndex = Math.max(0, monthDistance(start, today));
    waveStart = addMonthsClamped(start, waveIndex);
    if (waveStart > today && waveIndex > 0) {
      waveIndex -= 1;
      waveStart = addMonthsClamped(start, waveIndex);
    }
    waveEnd = addMonthsClamped(start, waveIndex + 1);
  } else {
    const cadenceDays = policy.cadenceDays ?? 0;
    if (cadenceDays <= 0) throw new Error("fixed-days cadence requires cadenceDays > 0");
    waveIndex = Math.max(
      0,
      Math.floor((today.getTime() - start.getTime()) / (cadenceDays * DAY_MS)),
    );
    waveStart = addDays(start, waveIndex * cadenceDays);
    waveEnd = addDays(waveStart, cadenceDays);
  }

  const waveId =
    policy.cadence === "monthly"
      ? `${waveStart.getUTCFullYear()}-${String(waveStart.getUTCMonth() + 1).padStart(2, "0")}`
      : `${policy.startsAt}+${waveIndex}`;
  const duration = Math.max(1, waveEnd.getTime() - waveStart.getTime());
  const elapsed = clamp(today.getTime() - waveStart.getTime(), 0, duration);
  const activeReservations = reservations.filter((reservation) => reservation.waveId === waveId);
  const reservedSlots =
    activeReservations.length > 0
      ? activeReservations.reduce((sum, reservation) => sum + reservation.slots, 0)
      : undefined;
  const openSlots =
    reservedSlots === undefined
      ? undefined
      : clamp(policy.maxSlotsPerWave - reservedSlots, 0, policy.maxSlotsPerWave);

  return {
    waveId,
    waveIndex,
    startsAt: dateOnly(waveStart, "UTC"),
    endsAt: dateOnly(waveEnd, "UTC"),
    daysRemaining: Math.max(0, Math.ceil((waveEnd.getTime() - today.getTime()) / DAY_MS)),
    progress: Math.round((elapsed / duration) * 100),
    slotRange: policy.slotRange,
    maxSlots: policy.maxSlotsPerWave,
    ...(reservedSlots === undefined ? {} : { reservedSlots }),
    ...(openSlots === undefined ? {} : { openSlots }),
    availabilityStatus: openSlots === undefined ? "unknown" : openSlots <= 0 ? "full" : "known",
  };
}
