/*
<MODULE_CONTRACT>
<purpose>Typed Matomo binding projection for RFC-0305 Messkanon. Defines the
tracker, event, and custom-dimension mapping consumed by the Matomo adapter.</purpose>
<non-goals>
  <item>Do not send analytics events; delivery belongs to adapter.ts and transport.ts.</item>
  <item>Do not read app configuration; callers provide runtime vendor options.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Split the Matomo binding catalog out of the root barrel so subpath consumers can import the stable mapping surface directly.</item>
</CHANGE_SUMMARY>
*/

// ---------------------------------------------------------------------------
// MatomoBinding - TS projection of matomo-binding.yaml (RFC-0305)
// ---------------------------------------------------------------------------

export interface MatomoBindingEvent {
  semanticId: string;
  matomo: {
    category: string;
    action: string;
    nameFrom: string;
  };
}

export interface MatomoBindingDimension {
  name: string;
  required: boolean;
  idSource?: string;
}

export interface MatomoBinding {
  tracker: {
    proxyPath: string;
    scriptPath: string;
    endpointPath: string;
    requestMethod?: string;
    requiredQueueCalls: string[];
  };
  events: MatomoBindingEvent[];
  dimensions: {
    visit: MatomoBindingDimension[];
    action: MatomoBindingDimension[];
  };
}

export const DEFAULT_MATOMO_BINDING: MatomoBinding = {
  tracker: {
    proxyPath: "/_wg/analytics/",
    scriptPath: "matomo.js",
    endpointPath: "matomo.php",
    requestMethod: "POST",
    requiredQueueCalls: [
      "disableCookies",
      "disableBrowserFeatureDetection",
      "setDoNotTrack",
      "setTrackerUrl",
      "setSiteId",
      "enableLinkTracking",
    ],
  },
  events: [
    {
      semanticId: "contact.phone_click",
      matomo: { category: "contact", action: "phone_click", nameFrom: "payload.placement" },
    },
    {
      semanticId: "contact.form_submit",
      matomo: { category: "contact", action: "form_submit", nameFrom: "payload.placement" },
    },
    {
      semanticId: "contact.whatsapp_click",
      matomo: { category: "contact", action: "whatsapp_click", nameFrom: "payload.placement" },
    },
    {
      semanticId: "contact.email_click",
      matomo: { category: "contact", action: "email_click", nameFrom: "payload.placement" },
    },
    {
      semanticId: "contact.route_click",
      matomo: { category: "contact", action: "route_click", nameFrom: "payload.placement" },
    },
  ],
  dimensions: {
    visit: [
      { name: "client_id", required: true, idSource: "fleet.registry" },
      { name: "messkanon_version", required: true, idSource: "fleet.registry" },
      { name: "consent_level", required: true, idSource: "fleet.registry" },
    ],
    action: [
      { name: "site_type", required: true, idSource: "fleet.registry" },
      { name: "page_type", required: true, idSource: "fleet.registry" },
      { name: "pseo_industry", required: false, idSource: "fleet.registry" },
      { name: "pseo_city", required: false, idSource: "fleet.registry" },
      { name: "pseo_demand", required: false, idSource: "fleet.registry" },
      { name: "pseo_locale", required: false, idSource: "fleet.registry" },
      { name: "pseo_arm", required: false, idSource: "fleet.registry" },
      { name: "pseo_experiment", required: false, idSource: "fleet.registry" },
      { name: "pseo_substance_band", required: false, idSource: "fleet.registry" },
      { name: "pseo_link_model", required: false, idSource: "fleet.registry" },
    ],
  },
};
