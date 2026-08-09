/*
<MODULE_CONTRACT>
<purpose>
RFC-0288: the closed capability catalog record schema — one YAML file per
AI-agent-invocable action (packages/werkstatt-site/src/domain/ontology/capabilities/*.yaml). The
input/output shape is a deliberately closed JSON-Schema subset chosen for
lossless projection to both OpenAPI (RFC-0289) and MCP tool schemas (RFC-0290).
</purpose>
<non-goals>
  <item>Do not resolve entitlements or active-capability logic here — that is
        @warpgogol/werkstatt-site/share/agent/capability.ts (resolveActiveCapabilities).</item>
  <item>Do not widen the JSON-Schema subset beyond what OpenAPI + MCP both
        accept verbatim — widening requires an RFC amending RFC-0288.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0288: initial capability record schema.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

/** Localized string map: language code → string. At least one entry required. */
const localizedStringSchema = z
  .record(z.string().min(1), z.string().min(1))
  .refine((v) => Object.keys(v).length > 0, { message: "must declare at least one language" });

const capabilityPropertySchema = z
  .object({
    type: z.enum(["string", "boolean", "integer"]),
    format: z.enum(["email", "uuid", "uri", "date"]).optional(),
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().positive().optional(),
  })
  .strict();

/**
 * RFC-0288: the closed JSON-Schema subset. Deliberately small — every field
 * here must be losslessly projectable to an OpenAPI 3.1 schema object AND an
 * MCP tool inputSchema verbatim, with no transformation.
 */
export const capabilityInputOutputSchema = z
  .object({
    type: z.literal("object"),
    required: z.array(z.string().min(1)).optional(),
    additionalProperties: z.literal(false),
    properties: z.record(z.string().min(1), capabilityPropertySchema),
  })
  .strict()
  .refine((schema) => (schema.required ?? []).every((key) => key in schema.properties), {
    message: "required[] entries must all exist in properties",
  });

export type CapabilityInputOutputSchema = z.infer<typeof capabilityInputOutputSchema>;

const capabilityIntegrationSchema = z
  .object({
    eventKind: z.enum(["lead", "message", "appointment"]),
    source: z.literal("agent"),
  })
  .strict();

const capabilityRequiresSchema = z
  .object({
    entitlements: z.array(z.string().min(1)).default([]),
    sections: z.array(z.string().min(1)).default([]),
  })
  .strict();

const capabilityHumanEquivalentSchema = z
  .object({
    sectionType: z.string().min(1),
  })
  .strict();

const capabilityLimitsSchema = z
  .object({
    perMinutePerIp: z.number().int().positive(),
    maxPayloadBytes: z.number().int().positive(),
  })
  .strict();

/** RFC-0288: one capability catalog record (packages/werkstatt-site/src/domain/ontology/capabilities/<id>.yaml). */
export const capabilityRecordSchema = z
  .object({
    /** Dot-separated, lowercase; the file stem MUST equal this id. */
    id: z
      .string()
      .regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/, "id must be dot-separated lowercase"),
    /** Integer; bump on breaking input/output change (by RFC). */
    version: z.number().int().positive(),
    kind: z.literal("action"),
    title: localizedStringSchema,
    description: localizedStringSchema,
    input: capabilityInputOutputSchema,
    output: capabilityInputOutputSchema,
    integration: capabilityIntegrationSchema,
    requires: capabilityRequiresSchema,
    humanEquivalent: capabilityHumanEquivalentSchema,
    limits: capabilityLimitsSchema,
  })
  .strict();

export type CapabilityRecord = z.infer<typeof capabilityRecordSchema>;
