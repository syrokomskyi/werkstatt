/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/analytics/matomo/silence.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not fetch live reports during package validation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0305: Add silence-detection scaffold.</item>
</CHANGE_SUMMARY>
*/

export const defaultSilenceDays = 3;

export const MATOMO_SILENCE_RULES = {
  "MATOMO-SILENCE-01": "site available, Matomo zero hits",
  "MATOMO-SILENCE-02": "proxy route failing",
  "MATOMO-SILENCE-03": "Matomo API/reporting unavailable",
  "MATOMO-SILENCE-04": "registry active but app config missing/disabled",
} as const;

export interface MatomoSilenceProbe {
  reportMethod: "VisitsSummary.get";
  days: number;
  compareAvailabilitySignal: boolean;
}

export function buildMatomoSilenceProbe(days = defaultSilenceDays): MatomoSilenceProbe {
  return {
    reportMethod: "VisitsSummary.get",
    days,
    compareAvailabilitySignal: true,
  };
}
