/*
<MODULE_CONTRACT>
<purpose>Closed telemetry vocabularies and OTLP resource-attribute builder for the WGogol observability port (RFC-0337).</purpose>
<non-goals>
  <item>Do not import node: modules — must be Workers-compatible.</item>
  <item>Do not define metric specs — those live in metric-registry.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0337: initial implementation.</item>
</CHANGE_SUMMARY>
*/

export type WgogolLayer = "site" | "back" | "factory" | "probe" | "delivery";
export type WgogolEnvironment = "production" | "preview" | "development" | "ci";

export const WGOGOL_LAYERS: readonly WgogolLayer[] = [
  "site",
  "back",
  "factory",
  "probe",
  "delivery",
];

export const WGOGOL_ENVIRONMENTS: readonly WgogolEnvironment[] = [
  "production",
  "preview",
  "development",
  "ci",
];

export interface WgogolResourceInput {
  serviceName: string;
  layer: WgogolLayer;
  environment?: WgogolEnvironment;
  siteId?: string;
  serviceVersion?: string;
}

export const OTLP_ENDPOINT_ENV = "WGOGOL_OTLP_ENDPOINT";
export const OTLP_TOKEN_ENV = "WGOGOL_OTLP_TOKEN";

export interface OtlpKeyValue {
  key: string;
  value: { stringValue: string };
}

const LAYERS_REQUIRING_SITE_ID: ReadonlySet<WgogolLayer> = new Set(["site", "probe", "delivery"]);

export function buildResourceAttributes(input: WgogolResourceInput): OtlpKeyValue[] {
  if (!input.serviceName) {
    throw new Error("[observability] serviceName is required");
  }
  if (!WGOGOL_LAYERS.includes(input.layer)) {
    throw new Error(
      `[observability] layer "${input.layer}" is not in the closed vocabulary ${WGOGOL_LAYERS.join(" | ")}`,
    );
  }
  const env = input.environment;
  if (env !== undefined && !WGOGOL_ENVIRONMENTS.includes(env)) {
    throw new Error(
      `[observability] environment "${env}" is not in the closed vocabulary ${WGOGOL_ENVIRONMENTS.join(" | ")}`,
    );
  }
  if (input.siteId === undefined && LAYERS_REQUIRING_SITE_ID.has(input.layer)) {
    throw new Error(`[observability] siteId is required for layer "${input.layer}"`);
  }

  const attrs: OtlpKeyValue[] = [
    { key: "service.name", value: { stringValue: input.serviceName } },
    {
      key: "deployment.environment",
      value: { stringValue: input.environment ?? "development" },
    },
    { key: "wgogol.layer", value: { stringValue: input.layer } },
  ];

  if (input.siteId !== undefined) {
    attrs.push({ key: "wgogol.site_id", value: { stringValue: input.siteId } });
  }
  if (input.serviceVersion !== undefined) {
    attrs.push({
      key: "service.version",
      value: { stringValue: input.serviceVersion },
    });
  }

  return attrs;
}
