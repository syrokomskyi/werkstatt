/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/analytics/matomo/export.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not fetch live Matomo reports or write export archives during validation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0305: Add export package scaffold for fixture validation.</item>
</CHANGE_SUMMARY>
*/

export interface AnalyticsExportPackage {
  schemaVersion: 1;
  clientSemanticId: string;
  generatedAt: string;
  messkanonVersion: string;
  matomoBindingVersion: string;
  aggregateReports: unknown[];
  rawVisitsWithinRetention: unknown[];
  siteConfiguration: Record<string, unknown>;
  goals: Record<string, unknown>;
  dimensions: Record<string, unknown>;
  readme: string;
  manifestHashes: Record<string, string>;
}

export const requiredAnalyticsExportParts = [
  "aggregateReports",
  "rawVisitsWithinRetention",
  "siteConfiguration",
  "goals",
  "dimensions",
  "messkanonVersion",
  "matomoBindingVersion",
  "readme",
  "manifestHashes",
] as const;
