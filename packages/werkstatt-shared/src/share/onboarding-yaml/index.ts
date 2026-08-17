/*
<MODULE_CONTRACT>
<purpose>
RFC-0082 shared parser for RFC-0076-headed onboarding artifacts.

Owns the rule "first YAML document is the RFC-0076 metadata header; last YAML
document is the artifact payload" so phase validation, audit validators, and
content-discipline parsers all see the same answer.
</purpose>
<non-goals>
  <item>Do not introduce a generic YAML schema framework — scoped to onboarding RFC-0076 metadata only.</item>
  <item>Do not read files from disk.</item>
  <item>Do not own the metadata key set beyond the four declared by RFC-0076.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0082: Introduce shared multi-document YAML helper for onboarding artifacts.</item>
</CHANGE_SUMMARY>
*/

import YAML from "yaml";
import type { ZodType } from "zod";

/**
 * The four top-level keys that belong to the RFC-0076 metadata header.
 * Anything else at the top level is part of the artifact payload.
 */
export const RFC_METADATA_KEYS = [
  "phase",
  "derivedFromInputHash",
  "generatedAt",
  "generator",
] as const;

export type RfcMetadataKey = (typeof RFC_METADATA_KEYS)[number];

/**
 * The RFC-0076 metadata header that every machine-readable file under
 * onboarding/.output/<phase>/ MUST carry.
 *
 * - `phase` — the onboarding phase that produced the artifact (e.g. "04-author").
 * - `derivedFromInputHash` — sha256 of the input manifest the artifact was derived from.
 * - `generatedAt` — ISO 8601 timestamp.
 * - `generator` — author name, typically "agent" or a command name.
 */
export interface RfcMetadataHeader {
  phase: string;
  derivedFromInputHash: string;
  generatedAt: string;
  generator: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function buildHeader(raw: Record<string, unknown>): RfcMetadataHeader | null {
  const phase = asString(raw["phase"]);
  const hash = asString(raw["derivedFromInputHash"]);
  if (phase === null || hash === null) {
    return null;
  }
  return {
    phase,
    derivedFromInputHash: hash,
    generatedAt: asString(raw["generatedAt"]) ?? "",
    generator: asString(raw["generator"]) ?? "",
  };
}

/**
 * Read the RFC-0076 metadata header from an onboarding YAML artifact.
 *
 * Accepts both file shapes:
 * - **Two-doc file**: first doc is the header, second doc is the payload.
 * - **Single-doc file**: header keys and payload keys are merged at top level.
 *
 * Returns `null` when the source does not contain at minimum `phase` and
 * `derivedFromInputHash` — callers can treat that as "no RFC-0076 header
 * present" without inspecting the YAML themselves.
 */
export function parseOnboardingArtifactHeader(source: string): RfcMetadataHeader | null {
  const docs = YAML.parseAllDocuments(source);
  if (docs.length === 0) return null;
  const first = docs[0].toJSON();
  if (!isRecord(first)) return null;
  return buildHeader(first);
}

/**
 * Read the artifact payload from an onboarding YAML artifact and validate
 * it against the caller-supplied Zod schema.
 *
 * Selection rule:
 * - **Two-doc file** → the LAST document is the payload, returned unchanged
 *   (schemas can keep `.strict()` because the header lives in a separate doc).
 * - **Single-doc file** → the document is the payload merged with the header;
 *   the four RFC_METADATA_KEYS are stripped before validation so `.strict()`
 *   schemas can still accept the file.
 *
 * Throws the Zod validation error on schema mismatch and a plain Error when
 * the source contains zero documents or more than two documents (the second
 * case enforces the "exactly header + payload" contract).
 */
export function parseOnboardingArtifactPayload<T>(source: string, schema: ZodType<T>): T {
  const docs = YAML.parseAllDocuments(source);
  if (docs.length === 0) {
    throw new Error("parseOnboardingArtifactPayload: source contains no YAML documents.");
  }
  if (docs.length > 2) {
    throw new Error(
      `parseOnboardingArtifactPayload: expected exactly 1 or 2 YAML documents (RFC-0076 header + payload), found ${docs.length}.`,
    );
  }

  let payload: unknown;
  if (docs.length === 2) {
    payload = docs[1].toJSON();
  } else {
    const merged = docs[0].toJSON();
    if (isRecord(merged)) {
      // Strip RFC-0076 metadata keys from the merged single-doc payload, BUT
      // preserve any key the schema itself declares as a payload field. This
      // matters most for `generatedAt`, which RFC-0076 carries in the header
      // and several content-discipline schemas (e.g. contentAtomsFileSchema)
      // also declare as a strict payload field. Without this carve-out the
      // strip would erase a legitimate payload value and schema parse would
      // fail with a confusing "expected string, received undefined" error.
      const schemaKeys = getSchemaTopLevelKeys(schema);
      const stripped: Record<string, unknown> = { ...merged };
      for (const key of RFC_METADATA_KEYS) {
        if (!schemaKeys.has(key)) {
          delete stripped[key];
        }
      }
      payload = stripped;
    } else {
      payload = merged;
    }
  }

  return schema.parse(payload);
}

/**
 * Best-effort top-level-key extraction from a Zod schema. Used to decide which
 * RFC-0076 metadata keys to preserve when stripping a merged single-doc
 * payload. Returns an empty set when the schema does not expose a `.shape` —
 * permissive schemas like z.unknown() / z.any() then accept the stripped
 * payload as-is.
 */
function getSchemaTopLevelKeys(schema: ZodType<unknown>): Set<string> {
  const candidate = schema as unknown as { shape?: Record<string, unknown> };
  if (candidate.shape && typeof candidate.shape === "object") {
    return new Set(Object.keys(candidate.shape));
  }
  return new Set();
}
