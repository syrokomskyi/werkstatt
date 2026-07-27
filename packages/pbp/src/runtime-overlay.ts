/**
 * PBP Runtime State Overlay.
 *
 * @see pbp-specification-package/system-spec §4.4 (Runtime State Layer)
 * @see pbp-specification-package/compiler §10 (Runtime Overlay Resolution)
 * @see RFC-0421
 */

export type PbpOverlayStaleBehavior =
  "omit" | "show-unknown" | "show-stale-warning" | "block-transaction";

export const PBP_OVERLAY_STALE_BEHAVIORS: readonly PbpOverlayStaleBehavior[] = [
  "omit",
  "show-unknown",
  "show-stale-warning",
  "block-transaction",
] as const;

export function isPbpOverlayStaleBehavior(value: string): value is PbpOverlayStaleBehavior {
  return PBP_OVERLAY_STALE_BEHAVIORS.includes(value as PbpOverlayStaleBehavior);
}

export interface PbpRuntimeOverlay {
  schema: string;
  subjectRef: string;
  observedAt: string;
  expiresAt?: string;
  sourceRef: string;
  values: Record<string, unknown>;
}
