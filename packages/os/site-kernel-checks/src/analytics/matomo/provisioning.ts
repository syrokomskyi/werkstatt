/*
<MODULE_CONTRACT>
<purpose>Offline Matomo provisioning contracts for RFC-0305 fleet registry and idempotent setup plans.</purpose>
<non-goals>
  <item>Do not perform live Matomo API calls or read tokenAuth secrets.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0305: Add package-owned provisioning scaffold outside apps/* and services/*.</item>
</CHANGE_SUMMARY>
*/

export interface MatomoFleetSite {
  schemaVersion: 1;
  clientSemanticId: string;
  appId: string;
  domain: string;
  productionHost: string;
  matomoSiteId: string;
  messkanonVersion: string;
  matomoBindingVersion: string;
  status: "planned" | "provisioned" | "active" | "paused" | "offboarded";
  provisionedAt?: string;
  firstSignalAt?: string;
  lastSignalAt?: string;
  proxyBaseUrl: string;
  dimensions: {
    visit: Record<string, number>;
    action: Record<string, number>;
  };
  goals: Record<string, number>;
}

export interface MatomoProvisioningStep {
  kind: "site" | "goal" | "dimension" | "registry";
  apiMethod?:
    "SitesManager.addSite" | "Goals.addGoal" | "CustomDimensions.configureNewCustomDimension";
  idempotencyKey: string;
  payload: Record<string, unknown>;
}

const REQUIRED_GOALS = [
  "anfrage_telefon",
  "anfrage_formular",
  "anfrage_whatsapp",
  "anfrage_email",
] as const;

const REQUIRED_VISIT_DIMENSIONS = ["client_id", "messkanon_version", "consent_level"] as const;
const REQUIRED_ACTION_DIMENSIONS = ["site_type", "page_type"] as const;

export function buildMatomoProvisioningPlan(site: MatomoFleetSite): MatomoProvisioningStep[] {
  const steps: MatomoProvisioningStep[] = [
    {
      kind: "site",
      apiMethod: "SitesManager.addSite",
      idempotencyKey: site.clientSemanticId,
      payload: {
        siteName: site.clientSemanticId,
        urls: [site.domain],
        timezone: "Europe/Berlin",
        currency: "EUR",
        excludeUnknownUrls: true,
      },
    },
  ];

  for (const goal of REQUIRED_GOALS) {
    steps.push({
      kind: "goal",
      apiMethod: "Goals.addGoal",
      idempotencyKey: `${site.clientSemanticId}:${goal}`,
      payload: { goal, matomoSiteId: site.matomoSiteId },
    });
  }

  for (const dimension of REQUIRED_VISIT_DIMENSIONS) {
    steps.push({
      kind: "dimension",
      apiMethod: "CustomDimensions.configureNewCustomDimension",
      idempotencyKey: `${site.clientSemanticId}:visit:${dimension}`,
      payload: { scope: "visit", name: dimension, matomoSiteId: site.matomoSiteId },
    });
  }

  for (const dimension of REQUIRED_ACTION_DIMENSIONS) {
    steps.push({
      kind: "dimension",
      apiMethod: "CustomDimensions.configureNewCustomDimension",
      idempotencyKey: `${site.clientSemanticId}:action:${dimension}`,
      payload: { scope: "action", name: dimension, matomoSiteId: site.matomoSiteId },
    });
  }

  steps.push({
    kind: "registry",
    idempotencyKey: site.clientSemanticId,
    payload: { status: site.status, proxyBaseUrl: site.proxyBaseUrl },
  });

  return steps;
}
