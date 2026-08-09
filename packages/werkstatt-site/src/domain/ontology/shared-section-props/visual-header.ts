/*
<MODULE_CONTRACT>
<purpose>Section visual and header JSON Schema fragments for RFC-0101/RFC-0102: visual sub-schemas and header sub-schemas applied at section root.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from shared-section-props/index.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { EFFECT_STACK_ITEM_SCHEMA, ALIGN_ENUM, type JsonSchemaFragment } from "./common.ts";

/** RFC-0101 — section visual contract (background / effects / density / tone / containerVariant / motion). */
export const SECTION_VISUAL_FRAGMENT: JsonSchemaFragment = {
  properties: {
    background: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["kind"],
          properties: {
            kind: { const: "color" },
            color: { type: "string", minLength: 1 },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "imageName"],
          properties: {
            kind: { const: "image" },
            imageName: { type: "string", minLength: 1 },
            fit: { enum: ["cover", "tile", "stretch-width", "stretch-height"] },
            quality: { enum: ["low", "mid", "high", "max"] },
            tintOpacity: { type: "number", minimum: 0, maximum: 1 },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "texture"],
          properties: {
            kind: { const: "texture" },
            texture: { type: "string", minLength: 1 },
          },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind"],
          properties: { kind: { const: "transparent" } },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "direction"],
          properties: {
            kind: { const: "fade" },
            direction: { enum: ["vertical", "horizontal"] },
            from: { type: "string", minLength: 1 },
            to: { type: "string", minLength: 1 },
            startOpacity: { type: "number", minimum: 0, maximum: 1 },
            endOpacity: { type: "number", minimum: 0, maximum: 1 },
            inset: { type: "number", minimum: 0, maximum: 0.5 },
            noStartFade: { type: "boolean" },
            noEndFade: { type: "boolean" },
          },
        },
      ],
    },
    effects: {
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
    },
    density: { enum: ["compact", "normal", "spacious"] },
    tone: { enum: ["default", "warning", "success", "muted"] },
    containerVariant: { enum: ["default", "narrow", "full"] },
    motion: {
      type: "object",
      additionalProperties: false,
      properties: {
        reveal: {
          type: "object",
          additionalProperties: false,
          properties: {
            variant: { enum: ["fade", "fade-up", "fade-up-stagger"] },
            once: { type: "boolean" },
            threshold: { type: "number", minimum: 0, maximum: 1 },
          },
        },
        parallax: {
          type: "object",
          additionalProperties: false,
          properties: {
            variant: { enum: ["subtle", "balanced", "dramatic"] },
            speed: { type: "number", minimum: 0, maximum: 2 },
          },
        },
        stagger: {
          type: "object",
          additionalProperties: false,
          properties: {
            delay: { type: "number", minimum: 0, maximum: 2 },
            childSelector: { type: "string" },
          },
        },
        off: { type: "boolean" },
      },
    },
  },
};

/** RFC-0102 — section header (tone-segmented heading + optional subheading + alignment + level). */
export const SECTION_HEADER_FRAGMENT: JsonSchemaFragment = {
  properties: {
    header: {
      type: "object",
      additionalProperties: false,
      required: ["heading"],
      properties: {
        heading: {
          oneOf: [
            { type: "string", minLength: 1 },
            {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["text"],
                properties: {
                  text: { type: "string", minLength: 1 },
                  tone: { enum: ["default", "primary", "accent", "muted", "inverse"] },
                },
              },
            },
          ],
        },
        eyebrow: { type: "string", minLength: 1 },
        subheading: { type: "string", minLength: 1 },
        align: ALIGN_ENUM,
        level: { enum: [1, 2] },
        hideSectionNumber: { type: "boolean" },
      },
    },
  },
};
