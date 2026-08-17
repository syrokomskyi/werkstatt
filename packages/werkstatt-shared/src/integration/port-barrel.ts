/*
<MODULE_CONTRACT>
<purpose>
  RFC-0168: Integration Port barrel — types and pure contracts only. Re-exports from
  port.ts, crm-buffer.ts, funnel.ts, lifecycle.ts, sharding.ts, dispatch.ts, and qstash.ts.
  Type-only consumers import from here to avoid transitively pulling in adapter
  implementations (orchestration.ts → adapters.ts).
</purpose>
<non-goals>
  <item>Do not re-export orchestration.ts, delivery-handler.ts, or adapters.ts — those are runtime.</item>
  <item>Do not define logic here — pure re-export barrel.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review: split from index.ts so type-only consumers don't transitively import adapter implementations.</item>
</CHANGE_SUMMARY>
*/

export type { IntegrationSecrets } from "./port.ts";
export type { LeadMessage, Lead, IntegrationChannelAdapter, CrmAdapter } from "./port.ts";
export type { IntegrationEvent, DestinationAdapter } from "./port.ts";
export { DESTINATION_KINDS, EXECUTION_MODES, eventToLeadMessage, eventToLead } from "./port.ts";
export type { DestinationKind, ExecutionMode } from "./port.ts";

export type {
  BufferContact,
  BufferOrganization,
  BufferDeal,
  BufferStageTransition,
  BufferFunnelEvent,
  BufferConsentEvent,
  BufferSubscription,
  BufferInvoice,
  BufferUpsertResult,
  OutboxWriteResult,
  CrmBufferWriter,
  CrmBufferReader,
  CrmBufferClient,
  DealPipedriveIdPatch,
  SyncOutboxRow,
} from "./crm-buffer.ts";
export {
  BUFFER_DEAL_STAGES,
  FUNNEL_STAGE_TO_BUFFER_STAGE,
  bridgeFunnelStage,
  isFunnelStage,
  SYNC_OUTBOX_STATUSES,
  SYNC_OUTBOX_OPS,
} from "./crm-buffer.ts";
export type { BufferDealStage, SyncOutboxStatus, SyncOutboxOp } from "./crm-buffer.ts";

export type {
  VisitorFunnelEventPayload,
  FunnelSystemTrigger,
  FunnelTransitionTrigger,
} from "./funnel.ts";
export {
  FUNNEL_VERSION,
  VISITOR_FUNNEL_STAGES,
  FUNNEL_ENTRY_STAGE,
  FUNNEL_TERMINAL_STAGES,
  VISITOR_FUNNEL_EVENT_KINDS,
  VISITOR_FUNNEL_INTENTS,
  VISITOR_FUNNEL_SOURCES,
  VISITOR_BUYER_TYPES,
  FUNNEL_TRANSITIONS,
  isValidFunnelStage,
  canTransition,
  nextStages,
  reachableStages,
  FUNNEL_SYSTEM_TRIGGERS,
  FUNNEL_TRANSITION_TRIGGERS,
  LEGACY_FUNNEL_STAGES,
  scanForMakeComReferences,
} from "./funnel.ts";
export type {
  VisitorFunnelStage,
  VisitorFunnelEventKind,
  VisitorFunnelIntent,
  VisitorFunnelSource,
  VisitorBuyerType,
} from "./funnel.ts";

export type { LifecycleEventPayload } from "./lifecycle.ts";
export {
  LIFECYCLE_EVENT_KINDS,
  SUBSCRIPTION_STATUSES,
  INVOICE_KINDS,
  INVOICE_STATUSES,
  SUBSCRIPTION_PLANS,
  LifecycleEventPayloadSchema,
  isLifecycleEventKind,
  SUBSCRIPTION_TRANSITIONS,
  SUBSCRIPTION_TRANSITION_TRIGGERS,
} from "./lifecycle.ts";
export type {
  LifecycleEventKind,
  SubscriptionStatus,
  InvoiceKind,
  InvoiceStatus,
  SubscriptionPlan,
} from "./lifecycle.ts";

export type { ShardAssignment, ResolveShardOptions } from "./sharding.ts";
export { DELIVERY_REGIONS, DELIVERY_TIERS, fnv1a, resolveShard } from "./sharding.ts";
export type { DeliveryRegion, DeliveryTier } from "./sharding.ts";

export type {
  DispatchExecuteRequest,
  DispatchExecuteResult,
  DispatchNamespaceBinding,
  DispatchOutcome,
} from "./dispatch.ts";
export { DISPATCH_ROUTE, executeDispatch, dispatchToTenant } from "./dispatch.ts";

export type { QstashPublishConfig, IdempotencyLedger, RestRedisConfig } from "./qstash.ts";
export {
  QSTASH_EU_BASE,
  UPSTASH_QSTASH_SECRETS,
  UPSTASH_REDIS_SECRETS,
  UPSTASH_DELIVERY_SECRETS,
  buildQstashPublish,
  restRedisLedger,
} from "./qstash.ts";
