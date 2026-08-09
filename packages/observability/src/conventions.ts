/*
<MODULE_CONTRACT>
<purpose>Closed telemetry vocabularies and OTLP resource-attribute builder for the Warpgogol observability port (RFC-0337).</purpose>
<non-goals>
  <item>Do not import node: modules — must be Workers-compatible.</item>
  <item>Do not define metric specs — those live in metric-registry.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0337: initial implementation.</item>
</CHANGE_SUMMARY>
*/

export type WarpgogolLayer = "site" | "back" | "factory" | "probe" | "delivery";
export type WarpgogolEnvironment = "production" | "preview" | "development" | "ci";

export const WARPGOGOL_LAYERS: readonly WarpgogolLayer[] = [
  "site",
  "back",
  "factory",
  "probe",
  "delivery",
];

export const WARPGOGOL_ENVIRONMENTS: readonly WarpgogolEnvironment[] = [
  "production",
  "preview",
  "development",
  "ci",
];

export interface WarpgogolResourceInput {
  serviceName: string;
  layer: WarpgogolLayer;
  environment?: WarpgogolEnvironment;
  siteId?: string;
  serviceVersion?: string;
}

export const OTLP_ENDPOINT_ENV = "WARPGOGOL_OTLP_ENDPOINT";
export const OTLP_TOKEN_ENV = "WARPGOGOL_OTLP_TOKEN";

export interface OtlpKeyValue {
  key: string;
  value: { stringValue: string };
}

const LAYERS_REQUIRING_SITE_ID: ReadonlySet<WarpgogolLayer> = new Set([
  "site",
  "probe",
  "delivery",
]);

export function buildResourceAttributes(input: WarpgogolResourceInput): OtlpKeyValue[] {
  if (!input.serviceName) {
    throw new Error("[observability] serviceName is required");
  }
  if (!WARPGOGOL_LAYERS.includes(input.layer)) {
    throw new Error(
      `[observability] layer "${input.layer}" is not in the closed vocabulary ${WARPGOGOL_LAYERS.join(" | ")}`,
    );
  }
  const env = input.environment;
  if (env !== undefined && !WARPGOGOL_ENVIRONMENTS.includes(env)) {
    throw new Error(
      `[observability] environment "${env}" is not in the closed vocabulary ${WARPGOGOL_ENVIRONMENTS.join(" | ")}`,
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
    { key: "warpgogol.layer", value: { stringValue: input.layer } },
  ];

  if (input.siteId !== undefined) {
    attrs.push({ key: "warpgogol.site_id", value: { stringValue: input.siteId } });
  }
  if (input.serviceVersion !== undefined) {
    attrs.push({
      key: "service.version",
      value: { stringValue: input.serviceVersion },
    });
  }

  return attrs;
}
