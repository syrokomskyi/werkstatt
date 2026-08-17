/*
<MODULE_CONTRACT>
<purpose>Shared types and reusable JSON Schema building blocks for section prop fragments: standard list items, cards, stats, enums, and effect stack items.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from shared-section-props/index.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

export type JsonSchemaFragment = {
  properties: Record<string, unknown>;
  required?: string[];
};

export const STANDARD_LIST_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text"],
  properties: {
    text: { type: "string", minLength: 1 },
    icon: {
      type: "object",
      additionalProperties: false,
      required: ["vendor", "collection", "name"],
      properties: {
        vendor: { type: "string" },
        collection: { type: "string" },
        name: { type: "string" },
        size: { type: "number" },
      },
    },
  },
};

export const STANDARD_CARD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title"],
  properties: {
    title: { type: "string", minLength: 1 },
    description: { type: "string" },
    image: { type: "string" },
    imageAlt: { type: "string" },
    icon: {
      type: "object",
      additionalProperties: false,
      required: ["vendor", "collection", "name"],
      properties: {
        vendor: { type: "string" },
        collection: { type: "string" },
        name: { type: "string" },
        size: { type: "number" },
      },
    },
    href: { type: "string" },
    badge: { type: "string" },
    number: { type: "string" },
  },
};

export const STAT_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["value", "label"],
  properties: {
    value: { type: "string", minLength: 1 },
    label: { type: "string", minLength: 1 },
    numericValue: { type: "number" },
    prefix: { type: "string" },
    suffix: { type: "string" },
    decimals: { type: "number", minimum: 0 },
    duration: { type: "number", minimum: 0.1 },
  },
};

export const ALIGN_ENUM = { type: "string", enum: ["left", "center", "right"] };
export const ICON_COLOR_ENUM = {
  type: "string",
  enum: ["primary", "accent", "success", "warning", "error", "muted"],
};

export const EFFECT_COLOR_SCHEMA = { type: "string", minLength: 1 };

/**
 * RFC-0134 + RFC-0151 — one effect stack item is a discriminated union over
 * every supported effect kind. Target × kind admissibility (e.g. glass only on
 * surfaces, text kinds only on `heading`) is enforced by effects.contract.validate,
 * not by this shape schema. Mirrors packages/share/src/schemas/effects.ts.
 */
export const EFFECT_STACK_ITEM_SCHEMA = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "enabled"],
      properties: {
        kind: { const: "glass" },
        enabled: { type: "boolean" },
        blur: { type: "number", minimum: 0, maximum: 64 },
        saturate: { type: "number", minimum: 0, maximum: 400 },
        tint: { type: "string", minLength: 1 },
        tintOpacity: { type: "number", minimum: 0, maximum: 1 },
        border: { enum: ["hairline", "none"] },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "enabled"],
      properties: {
        kind: { const: "shadow" },
        enabled: { type: "boolean" },
        offsetX: { type: "number", minimum: -64, maximum: 64 },
        offsetY: { type: "number", minimum: -64, maximum: 64 },
        blur: { type: "number", minimum: 0, maximum: 64 },
        color: EFFECT_COLOR_SCHEMA,
        opacity: { type: "number", minimum: 0, maximum: 1 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "enabled"],
      properties: {
        kind: { const: "glow" },
        enabled: { type: "boolean" },
        blur: { type: "number", minimum: 0, maximum: 96 },
        color: EFFECT_COLOR_SCHEMA,
        opacity: { type: "number", minimum: 0, maximum: 1 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "enabled"],
      properties: {
        kind: { const: "bulge" },
        enabled: { type: "boolean" },
        depth: { type: "number", minimum: 0, maximum: 16 },
        highlight: { type: "number", minimum: 0, maximum: 1 },
        shade: { type: "number", minimum: 0, maximum: 1 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "enabled"],
      properties: {
        kind: { const: "tilt" },
        enabled: { type: "boolean" },
        rotate: { type: "number", minimum: -15, maximum: 15 },
        skewX: { type: "number", minimum: -15, maximum: 15 },
      },
    },
  ],
};

/** Shared effects array schema used by multiple body fragments. */
export const EFFECTS_ARRAY_SCHEMA = {
  type: "array",
  minItems: 1,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["target", "stack"],
    properties: {
      target: { type: "string", minLength: 1 },
      stack: {
        type: "array",
        minItems: 1,
        items: EFFECT_STACK_ITEM_SCHEMA,
      },
    },
  },
};
