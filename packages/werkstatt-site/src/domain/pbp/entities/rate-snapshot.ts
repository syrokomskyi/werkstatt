/*
<MODULE_CONTRACT>
<purpose>PBP RateSnapshot entity — immutable rate observation record (RFC-0738).</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0738 — RateSnapshot entity with digest and source metadata.</item>
</CHANGE_SUMMARY>
*/

import type { PbpEntity } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import type { PbpRateMode, PbpRateDirection } from "./rate-policy.js";
import { pbpSchemaId } from "../schema-id.js";

export interface PbpRateSnapshotDigest {
  algorithm: string;
  value: string;
}

export interface PbpRateSnapshotSource {
  kind: PbpRateMode;
  sourceContractRef?: PbpEntityRef;
  rateScheduleRef?: PbpEntityRef;
  rateScheduleEntryKey?: string;
}

export interface PbpRateSnapshot extends PbpEntity {
  type: "rate-snapshot";
  pair: {
    sourceCurrency: string;
    targetCurrency: string;
  };
  quotation: {
    direction: PbpRateDirection;
  };
  value: string;
  source: PbpRateSnapshotSource;
  observedAt: string;
  freshUntil: string;
  digest: PbpRateSnapshotDigest;
}

export const RATE_SNAPSHOT_SCHEMA_ID = pbpSchemaId("rate-snapshot");
