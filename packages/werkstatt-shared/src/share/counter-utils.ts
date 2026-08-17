/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/counter-utils.ts as an authored share authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not depend on GSAP or DOM.</item>
  <item>Do not handle animation logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Created shared counter utilities to eliminate duplication between hero and impact sections.</item>
  <item>getStartValue now generates "1" in highest digit (e.g., "1,000" instead of "0,000") for better visual feedback during count-up.</item>
</CHANGE_SUMMARY>
*/

export interface CounterStat {
  value?: string;
  label: string;
  numericValue?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
}

export interface ResolvedCounterStat extends CounterStat {
  isAnimated: boolean;
  startValue: string;
  finalFormatted: string;
}

export function formatNumber(value: number, locale: string, decimals = 0): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function parseNumeric(val: string | undefined): number | undefined {
  if (!val) return undefined;
  const cleaned = val.replace(/[^\d.,]/g, "").replace(/,/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

// Create start value with same width as final, starting from "1" in highest digit
export function getStartValue(formattedFinal: string): string {
  // Replace digits: first digit becomes "1", rest become "0"
  // "1,250" → "1,000", "14" → "10"
  let firstDigit = true;
  return formattedFinal.replace(/\d/g, () => {
    if (firstDigit) {
      firstDigit = false;
      return "1";
    }
    return "0";
  });
}

export function resolveCounterStats(
  stats: CounterStat[],
  animated: boolean | undefined,
  locale: string,
): ResolvedCounterStat[] {
  return stats.map((stat) => {
    const numericValue = stat.numericValue ?? parseNumeric(stat.value);
    const isAnimated: boolean = (animated ?? false) && numericValue !== undefined;
    const decimals = stat.decimals ?? 0;
    const finalFormatted =
      numericValue !== undefined
        ? formatNumber(numericValue, locale, decimals)
        : (stat.value ?? "");
    const startValue = isAnimated ? getStartValue(finalFormatted) : finalFormatted;
    return { ...stat, numericValue, isAnimated, startValue, finalFormatted };
  });
}
