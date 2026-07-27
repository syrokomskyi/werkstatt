/*
<MODULE_CONTRACT>
<purpose>
RFC-0289: pure, dependency-free formatter that projects a site's Agent Surface
Manifest (+ the capability schemas for its active actions) into a static
OpenAPI 3.1 document. No transformation of capability schemas — they are
copied verbatim (AGO-04 enforces this).
</purpose>
<non-goals>
  <item>Do not read files or resolve capabilities — the kernel command does that
        and passes the manifest + capability schemas here.</item>
  <item>Do not adopt an OpenAPI library/types package — this is a small, closed
        structural subset (AS-5: protocols are disposable).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0289: initial OpenAPI projection.</item>
</CHANGE_SUMMARY>
*/

import type { AgentSurfaceManifest } from "./manifest.ts";
import type { CapabilityInputOutputSchema } from "@gogol/ontology";

export interface OpenApiSchemaObject {
  type: string;
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, unknown>;
  description?: string;
}

export interface OpenApiOperation {
  operationId: string;
  summary?: string;
  tags: string[];
  requestBody?: {
    required: true;
    content: { "application/json": { schema: OpenApiSchemaObject } };
  };
  responses: Record<
    string,
    { description: string; content?: { "application/json": { schema: unknown } } }
  >;
}

export interface OpenApiDocument {
  openapi: "3.1.0";
  info: { title: string; version: string; "x-gogol-content-hash": string };
  servers: Array<{ url: string }>;
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: { schemas: Record<string, unknown> };
  externalDocs?: { url: string; description: string };
  "x-gogol-mcp"?: { url: string; protocolVersion: string };
  "x-gogol-proof"?: unknown;
}

/** One active capability's schemas — the exact shapes referenced by its AgentActionRef. */
export interface CapabilitySchemaInput {
  id: string;
  input: CapabilityInputOutputSchema;
  output: CapabilityInputOutputSchema;
}

/** Generic envelope schema — every knowledge domain shares this wrapper shape (RFC-0287); only `data`'s inner shape varies by domain and is intentionally left untyped here. */
function knowledgeEnvelopeSchema(): OpenApiSchemaObject {
  return {
    type: "object",
    required: ["schema", "site", "baseUrl", "languages", "contentHash", "data"],
    properties: {
      schema: { type: "string" },
      site: { type: "string" },
      baseUrl: { type: "string" },
      languages: { type: "object" },
      contentHash: { type: "string" },
      freshness: { type: "object" },
      data: { type: "object", description: "Per-language payload; shape varies by domain." },
    },
  };
}

/**
 * Pure: project the manifest (+ active capabilities' schemas) into an OpenAPI
 * 3.1 document. Exhaustive per the RFC-0289 projection table — adds nothing beyond it.
 */
export function formatAgentOpenApi(
  manifest: AgentSurfaceManifest,
  capabilitySchemas: CapabilitySchemaInput[],
): OpenApiDocument {
  const schemasById = new Map(capabilitySchemas.map((c) => [c.id, c]));
  const paths: OpenApiDocument["paths"] = {};
  const componentSchemas: Record<string, unknown> = {};

  for (const ref of manifest.knowledge) {
    componentSchemas[`knowledge-${ref.domain}`] = knowledgeEnvelopeSchema();
    paths[ref.url] = {
      get: {
        operationId: `knowledge.${ref.domain}.get`,
        tags: ["knowledge"],
        responses: {
          "200": {
            description: `${ref.domain} knowledge envelope`,
            content: {
              "application/json": {
                schema: { $ref: `#/components/schemas/knowledge-${ref.domain}` },
              },
            },
          },
        },
      },
    };
  }

  for (const ref of manifest.actions) {
    const schemas = schemasById.get(ref.id);
    if (!schemas) continue; // defensive — AGO-04-checked at validate time
    componentSchemas[`${ref.id}-input`] = schemas.input;
    componentSchemas[`${ref.id}-output`] = schemas.output;
    paths[ref.url] = {
      post: {
        operationId: `action.${ref.id}`,
        summary: ref.title[manifest.languages.default] ?? ref.id,
        tags: ["actions"],
        requestBody: {
          required: true,
          content: { "application/json": { schema: schemas.input } },
        },
        responses: {
          "200": {
            description: `${ref.id} accepted`,
            content: { "application/json": { schema: schemas.output } },
          },
          "400": { description: "Schema violation" },
          "429": { description: "Rate limit exceeded" },
        },
      },
    };
  }

  const doc: OpenApiDocument = {
    openapi: "3.1.0",
    info: {
      title: `${manifest.site} agent surface`,
      version: manifest.surfaceVersion,
      "x-gogol-content-hash": manifest.contentHash,
    },
    servers: [{ url: manifest.baseUrl }],
    paths,
    components: { schemas: componentSchemas },
    externalDocs: {
      url: `${manifest.baseUrl}${manifest.interfaces.llms}`,
      description: "LLM-oriented text surface",
    },
  };
  if (manifest.interfaces.mcp) doc["x-gogol-mcp"] = manifest.interfaces.mcp;
  if (manifest.proof) doc["x-gogol-proof"] = manifest.proof;
  return doc;
}
