/*
<MODULE_CONTRACT>
<purpose>
  Architecture review 2026-07-10: grouped barrel for governance and operational schema bags
  (RFC-0271..0285). These modules are pure Zod schemas + inferred types — no functions, no I/O.
  Grouping them under one sub-barrel keeps the surface engine's interface (the main index.ts)
  focused on route generation, eligibility, and page baking.
</purpose>
<non-goals>
  <item>Do not add logic — these are schema contracts only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review 2026-07-10: initial governance sub-barrel grouping.</item>
</CHANGE_SUMMARY>
*/

export {
  findDuplicateBlueprintClaims,
  findModuleForBlueprint,
  moduleReviewPolicySchema,
  moduleSiteModeSchema,
  normalizeSurfaceModules,
  pseoStageSchema,
  surfaceModuleContextSchema,
  surfaceModulesSchema,
  urlPolicySchema,
  type BlueprintModuleClaim,
  type PseoStage,
  type SurfaceModuleContext,
  type SurfaceModules,
  type UrlPolicy,
} from "../module-context.ts";

export {
  demandAxesSchema,
  demandIntentSchema,
  demandSignalSchema,
  demandSignalSourceSchema,
  werkRecordSchema,
  type DemandAxes,
  type DemandIntent,
  type DemandSignal,
  type DemandSignalSource,
  type WerkRecord,
} from "../evidence-records.ts";

export {
  approvalRecordSchema,
  approverSchema,
  autonomyLevelSchema,
  autonomyScopeSchema,
  autonomyStateSchema,
  escalationBudgetSchema,
  escalationReasonSchema,
  escalationSchema,
  fieldClassSchema,
  reviewInputSchema,
  reviewVerdictSchema,
  type ApprovalRecord,
  type Approver,
  type AutonomyLevel,
  type AutonomyScope,
  type AutonomyState,
  type Escalation,
  type EscalationBudget,
  type EscalationReason,
  type FieldClass,
  type ReviewInput,
  type ReviewVerdict,
} from "../governance.ts";

export {
  clusterActionSchema,
  clusterOutcomeSchema,
  visibilitySnapshotSchema,
  visibilitySourceSchema,
  type ClusterAction,
  type ClusterOutcome,
  type VisibilitySnapshot,
  type VisibilitySource,
} from "../visibility.ts";

export {
  breakerVerdictSchema,
  surfaceStateSchema,
  surfaceStateStatusSchema,
  tripwireActionSchema,
  tripwireSchema,
  type BreakerVerdict,
  type SurfaceState,
  type SurfaceStateStatus,
  type Tripwire,
  type TripwireAction,
} from "../breaker.ts";

export {
  fleetBreakerStateSchema,
  fleetJobKindSchema,
  fleetJobSchema,
  fleetPlanSchema,
  fleetSiteStatusSchema,
  type FleetBreakerState,
  type FleetJob,
  type FleetJobKind,
  type FleetPlan,
  type FleetSiteStatus,
} from "../fleet.ts";
