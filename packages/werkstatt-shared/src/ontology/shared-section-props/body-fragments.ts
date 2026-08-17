/*
<MODULE_CONTRACT>
<purpose>Body kind JSON Schema fragments for RFC-0103: one fragment per body kind (list, split-list, stats, cards, paragraphs, comparison, rich) that adds the entire body object at section root.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from shared-section-props/index.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import {
  STANDARD_LIST_ITEM_SCHEMA,
  STANDARD_CARD_SCHEMA,
  STAT_ITEM_SCHEMA,
  ALIGN_ENUM,
  ICON_COLOR_ENUM,
  EFFECTS_ARRAY_SCHEMA,
  type JsonSchemaFragment,
} from "./common.ts";

/** RFC-0103 — body.kind: "list". */
export const BODY_LIST_FRAGMENT: JsonSchemaFragment = {
  properties: {
    body: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "items"],
      properties: {
        kind: { const: "list" },
        items: { type: "array", minItems: 1, items: STANDARD_LIST_ITEM_SCHEMA },
        note: { type: "string" },
        iconColor: ICON_COLOR_ENUM,
        align: ALIGN_ENUM,
        effects: EFFECTS_ARRAY_SCHEMA,
      },
    },
  },
};

/** RFC-0103 — body.kind: "split-list". */
export const BODY_SPLIT_LIST_FRAGMENT: JsonSchemaFragment = {
  properties: {
    body: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "primaryItems"],
      properties: {
        kind: { const: "split-list" },
        primaryItems: { type: "array", minItems: 1, items: STANDARD_LIST_ITEM_SCHEMA },
        secondaryItems: { type: "array", items: STANDARD_LIST_ITEM_SCHEMA },
        labels: {
          type: "object",
          additionalProperties: false,
          required: ["primary", "secondary"],
          properties: {
            primary: { type: "string", minLength: 1 },
            secondary: { type: "string", minLength: 1 },
          },
        },
        iconColors: {
          type: "object",
          additionalProperties: false,
          properties: {
            primary: ICON_COLOR_ENUM,
            secondary: ICON_COLOR_ENUM,
          },
        },
        align: ALIGN_ENUM,
        effects: EFFECTS_ARRAY_SCHEMA,
      },
    },
  },
};

/** RFC-0103 — body.kind: "stats". */
export const BODY_STATS_FRAGMENT: JsonSchemaFragment = {
  properties: {
    body: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "stats"],
      properties: {
        kind: { const: "stats" },
        stats: { type: "array", minItems: 1, items: STAT_ITEM_SCHEMA },
        animated: { type: "boolean" },
        align: ALIGN_ENUM,
      },
    },
  },
};

/** RFC-0103 — body.kind: "cards". */
export const BODY_CARDS_FRAGMENT: JsonSchemaFragment = {
  properties: {
    body: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "cards"],
      properties: {
        kind: { const: "cards" },
        cards: { type: "array", minItems: 1, items: STANDARD_CARD_SCHEMA },
        layout: { enum: ["grid", "list"] },
        columns: { enum: [2, 3, 4] },
        align: ALIGN_ENUM,
        effects: EFFECTS_ARRAY_SCHEMA,
      },
    },
  },
};

/** RFC-0103 — body.kind: "paragraphs". */
export const BODY_PARAGRAPHS_FRAGMENT: JsonSchemaFragment = {
  properties: {
    body: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "paragraphs"],
      properties: {
        kind: { const: "paragraphs" },
        paragraphs: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
        align: ALIGN_ENUM,
      },
    },
  },
};

/** RFC-0103 — body.kind: "comparison". */
export const BODY_COMPARISON_FRAGMENT: JsonSchemaFragment = {
  properties: {
    body: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "rows"],
      properties: {
        kind: { const: "comparison" },
        rows: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["left", "right"],
            properties: {
              left: { type: "string", minLength: 1 },
              right: { type: "string", minLength: 1 },
            },
          },
        },
        labels: {
          type: "object",
          additionalProperties: false,
          required: ["left", "right"],
          properties: {
            left: { type: "string", minLength: 1 },
            right: { type: "string", minLength: 1 },
          },
        },
        align: ALIGN_ENUM,
        effects: EFFECTS_ARRAY_SCHEMA,
      },
    },
  },
};

/** RFC-0103 — body.kind: "rich". */
export const BODY_RICH_FRAGMENT: JsonSchemaFragment = {
  properties: {
    body: {
      type: "object",
      additionalProperties: false,
      required: ["kind", "contentRef"],
      properties: {
        kind: { const: "rich" },
        contentRef: { type: "string", minLength: 1 },
        animateNumbers: { type: "boolean" },
        align: ALIGN_ENUM,
      },
    },
  },
};
