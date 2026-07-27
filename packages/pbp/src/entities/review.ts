/**
 * PBP Review and AggregateRating entities.
 *
 * @see pbp-specification-package/entity-model §29 (Review and AggregateRating)
 * @see RFC-0419
 */

import type { PbpEntity } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import { pbpSchemaId } from "../schema-id.js";

export const REVIEW_SCHEMA_ID = pbpSchemaId("review");
export const AGGREGATE_RATING_SCHEMA_ID = pbpSchemaId("aggregate-rating");

export type PbpReviewContentMode = "linked-only" | "excerpt" | "full";

export const PBP_REVIEW_CONTENT_MODES: readonly PbpReviewContentMode[] = [
  "linked-only",
  "excerpt",
  "full",
] as const;

export function isPbpReviewContentMode(value: string): value is PbpReviewContentMode {
  return PBP_REVIEW_CONTENT_MODES.includes(value as PbpReviewContentMode);
}

export interface PbpReview extends PbpEntity {
  type: "review";
  subjectRef: PbpEntityRef;
  sourceRef: PbpEntityRef;
  rating: { value: string; best: string; worst: string };
  author: { displayName: string };
  publishedAt: string;
  retrievedAt: string;
  content: { mode: PbpReviewContentMode; sourceUrl?: string };
}

export interface PbpAggregateRating extends PbpEntity {
  type: "aggregate-rating";
  subjectRef: PbpEntityRef;
  sourceRef: PbpEntityRef;
  ratingValue: string;
  ratingCount: number;
  bestRating: string;
  worstRating: string;
  observedAt: string;
  freshness: string;
}
