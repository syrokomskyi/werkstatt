/*
<MODULE_CONTRACT>
<purpose>
RFC-0211: the Content Knowledge Lifecycle (CKL) claim model. A claim is the
atomic unit of durable site truth — the binding of a value to a subject field,
qualified by provenance and time. Framework-free types + the canonical subject
address parser/formatter shared by every CKL command and validator (RFC-0212..0218).
</purpose>
<non-goals>
  <item>Do not read the filesystem, evaluate freshness, hash derivations, or emit Diagnostics — those live in the kernel checks and later CKL modules.</item>
  <item>Do not define the source descriptor (RFC-0214) or the ledger event (RFC-0217) — only the in-content claim shape.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0211: initial claim model + subject address codec.</item>
</CHANGE_SUMMARY>
*/

/** RFC-0211: how a value is known. */
export type ClaimProvenanceKind = "external" | "derived" | "asserted" | "generated";

export const CLAIM_PROVENANCE_KINDS: readonly ClaimProvenanceKind[] = [
  "external",
  "derived",
  "asserted",
  "generated",
] as const;

/** Confidence an author/agent attaches to an asserted value. */
export type ClaimConfidence = "high" | "medium" | "low";

/**
 * A content address — the subject a claim is about. Reuses RFC-0045 coordinates:
 * a `collection`, a locale-independent `file` stem (RFC-0044), and a dotted
 * `fieldPath` into the record. `lang` is present for language-scoped collections
 * (e.g. `business/{lang}/…`).
 */
export interface ClaimSubject {
  collection: string;
  file: string;
  fieldPath: string[];
  lang?: string;
}

/** The temporal validity window of a claim (RFC-0212/0213). */
export interface ClaimValidity {
  /** ISO date the value was last verified / asserted. */
  asOf: string;
  /** ISO date after which the claim is stale. */
  validUntil?: string;
  /** ISO 8601 duration, e.g. "P3M" — recurring review cadence. */
  reviewEvery?: string;
}

/**
 * A claim: the binding of a value to a subject field, qualified by provenance and
 * time. Stored per-field in a `<record>.claims.yaml` sidecar (RFC-0212); the value
 * itself stays in the record body — a claim annotates, it never wraps the value.
 */
export interface Claim {
  subject: ClaimSubject;
  provenance: ClaimProvenanceKind;
  validity?: ClaimValidity;
  /** → source descriptor id (RFC-0214) when provenance = external. */
  sourceRef?: string;
  /** Source subject (RFC-0215) when provenance = derived. */
  derivedFrom?: ClaimSubject;
  /** Normalized hash of the source value at derivation time (RFC-0215). */
  sourceHash?: string;
  /** Responsible agent/human handle — routing (RFC-0216). */
  owner?: string;
  confidence?: ClaimConfidence;
}

// ─── Canonical subject address codec ────────────────────────────────────────
// String form: `<collection>/[<lang>/]<file>#<dotted.field.path>`
//   business/de/location#residents
//   business/uk/offer#price.monthly
//   surface#someField                (no lang, no nested path)
// `lang` is recognized as a 2-letter segment immediately after the collection.

const TWO_LETTER_LANG = /^[a-z]{2}$/;

export class ClaimSubjectParseError extends Error {}

/** Parse the canonical subject string into a ClaimSubject. Throws on malformed input. */
export function parseClaimSubject(input: string): ClaimSubject {
  const hashIndex = input.indexOf("#");
  if (hashIndex < 0) {
    throw new ClaimSubjectParseError(
      `Subject "${input}" is missing the "#fieldPath" part (expected <collection>/[<lang>/]<file>#<field>)`,
    );
  }
  const pathPart = input.slice(0, hashIndex);
  const fieldPart = input.slice(hashIndex + 1);
  const segments = pathPart.split("/").filter((s) => s.length > 0);
  if (segments.length < 2) {
    throw new ClaimSubjectParseError(
      `Subject "${input}" must have at least <collection>/<file> before "#"`,
    );
  }
  if (fieldPart.length === 0) {
    throw new ClaimSubjectParseError(`Subject "${input}" has an empty fieldPath after "#"`);
  }
  const collection = segments[0]!;
  let lang: string | undefined;
  let fileSegments = segments.slice(1);
  if (fileSegments.length >= 2 && TWO_LETTER_LANG.test(fileSegments[0]!)) {
    lang = fileSegments[0]!;
    fileSegments = fileSegments.slice(1);
  }
  return {
    collection,
    lang,
    file: fileSegments.join("/"),
    fieldPath: fieldPart.split("."),
  };
}

/** Render a ClaimSubject back to its canonical string. Inverse of parseClaimSubject. */
export function formatClaimSubject(subject: ClaimSubject): string {
  const langPart = subject.lang ? `${subject.lang}/` : "";
  return `${subject.collection}/${langPart}${subject.file}#${subject.fieldPath.join(".")}`;
}

/** Structural equality on subjects (ignores undefined-vs-absent lang differences). */
export function claimSubjectsEqual(a: ClaimSubject, b: ClaimSubject): boolean {
  return formatClaimSubject(a) === formatClaimSubject(b);
}
