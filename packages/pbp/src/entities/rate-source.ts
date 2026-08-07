/*
<MODULE_CONTRACT>
<purpose>PBP RateSource entity — rate source configuration for external rate fetching (RFC-0744).</purpose>
<non-goals>
  <item>Does not define RatePolicy or RateSnapshot — those are RFC-0737/RFC-0738.</item>
  <item>Does not implement the adapter — that lives in @warpgogol/pbp-rate-adapters.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0744 — RateSource entity for declaring rate source configurations.</item>
</CHANGE_SUMMARY>
*/

import type { PbpEntity } from "../envelope.js";
import { pbpSchemaId } from "../schema-id.js";

export interface PbpRateSource extends PbpEntity {
  type: "rate-source";
  name: string;
  adapter: string;
  config: Record<string, unknown>;
}

export const RATE_SOURCE_SCHEMA_ID = pbpSchemaId("rate-source");
