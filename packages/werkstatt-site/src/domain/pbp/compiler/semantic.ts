/*
<MODULE_CONTRACT>
<purpose>Phase 10: Semantic validation — enforces ADR-037, ADR-038, ADR-025, ADR-012, ADR-036.</purpose>
<non-goals>
  <item>Does not assemble Buyer View — that is Phase 11 (buyer-view.ts).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0467 — Phase 10: semantic-validation.</item>
</CHANGE_SUMMARY>
*/

import type { PbpEntity } from "../envelope.js";
import type { PbpValidationError } from "../validation-errors.js";
import type { PbpResolvedGraph } from "./types.js";

const HTML_TAG_RE = /<[a-z][\s\S]*?>/i;
const EMPTY_STRING_RE = /^$/;
const LOCALE_IN_ID_RE = /\.(de|uk|en|fr|es|it|nl|pl|pt|ru|tr)$/i;
const PRESENTATION_MONEY_RE = /\d+\s*€|€\s*\d+|\d+\s*EUR|EUR\s*\d+/i;
const LEGACY_KEYS = new Set([
  "hourlyRate",
  "capacity",
  "growthModules",
  "price",
  "includedChangesPerCycle",
  "billingDay",
  "changePrice",
]);

const SENSITIVE_KEY_RE = /(iban|bic|swift|bankAccount|taxId|vatId|ssn|password|secret|apiKey)/i;

export async function validateSemantic(graph: PbpResolvedGraph): Promise<PbpValidationError[]> {
  const errors: PbpValidationError[] = [];

  for (const entity of iterGraphEntities(graph)) {
    validateEntityStrings(entity, errors);
    validateEntityId(entity, errors);
    validateLegacyKeys(entity, errors);
    validateSensitiveData(entity, errors);
  }

  errors.sort(
    (a, b) =>
      (a.entityId ?? "").localeCompare(b.entityId ?? "") ||
      (a.path ?? "").localeCompare(b.path ?? ""),
  );

  return errors;
}

function* iterGraphEntities(graph: PbpResolvedGraph): Generator<PbpEntity> {
  yield graph.business;
  if (graph.legalIdentity) yield graph.legalIdentity;
  if (graph.brand) yield graph.brand;
  for (const e of Object.values(graph.places)) yield e;
  for (const e of Object.values(graph.contactPoints)) yield e;
  for (const e of Object.values(graph.webPresences)) yield e;
  for (const e of Object.values(graph.products)) yield e;
  for (const e of Object.values(graph.categories)) yield e;
  if (graph.catalog) yield graph.catalog;
  for (const e of Object.values(graph.catalogEntries)) yield e;
  for (const e of Object.values(graph.offerings)) yield e;
  for (const e of Object.values(graph.policies)) yield e;
  for (const e of Object.values(graph.claims)) yield e;
  for (const e of Object.values(graph.evidenceSources)) yield e;
  for (const e of Object.values(graph.disclosures)) yield e;
  for (const e of Object.values(graph.publicDocuments)) yield e;
}

function validateEntityStrings(entity: PbpEntity, errors: PbpValidationError[]): void {
  walkStrings(entity, (value, path) => {
    if (HTML_TAG_RE.test(value)) {
      errors.push({
        code: "PBP-HTML",
        severity: "error",
        entityId: entity.id,
        message: `HTML tags are not allowed in canonical fields (ADR-037): "${value.substring(0, 50)}"`,
        path,
      });
    }
    if (EMPTY_STRING_RE.test(value)) {
      errors.push({
        code: "PBP-EMPTY",
        severity: "error",
        entityId: entity.id,
        message: `Empty strings are not allowed in canonical fields (ADR-038) at ${path}`,
        path,
      });
    }
    if (PRESENTATION_MONEY_RE.test(value)) {
      errors.push({
        code: "PBP-MONEY",
        severity: "error",
        entityId: entity.id,
        message: `Presentation-ready money string detected (ADR-012): "${value}"`,
        path,
      });
    }
  });
}

function validateEntityId(entity: PbpEntity, errors: PbpValidationError[]): void {
  if (LOCALE_IN_ID_RE.test(entity.id)) {
    errors.push({
      code: "PBP-LOCALE-ID",
      severity: "error",
      entityId: entity.id,
      message: `Entity ID contains locale marker (ADR-025): "${entity.id}"`,
      path: "id",
    });
  }
}

function validateLegacyKeys(entity: PbpEntity, errors: PbpValidationError[]): void {
  walkKeys(entity, (key, path) => {
    if (LEGACY_KEYS.has(key)) {
      errors.push({
        code: "PBP-LEGACY-KEY",
        severity: "error",
        entityId: entity.id,
        message: `Legacy key "${key}" is not allowed in PBP content at ${path}`,
        path,
      });
    }
  });
}

function validateSensitiveData(entity: PbpEntity, errors: PbpValidationError[]): void {
  walkKeys(entity, (key, path) => {
    if (SENSITIVE_KEY_RE.test(key)) {
      errors.push({
        code: "PBP-SENSITIVE",
        severity: "error",
        entityId: entity.id,
        message: `Sensitive data key "${key}" detected in public field (ADR-036) at ${path}`,
        path,
      });
    }
  });
}

function walkStrings(
  obj: unknown,
  callback: (value: string, path: string) => void,
  prefix = "",
): void {
  if (typeof obj === "string") {
    callback(obj, prefix);
    return;
  }
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => walkStrings(item, callback, `${prefix}[${i}]`));
    return;
  }
  for (const key of Object.keys(obj).sort()) {
    walkStrings((obj as Record<string, unknown>)[key], callback, prefix ? `${prefix}.${key}` : key);
  }
}

function walkKeys(obj: unknown, callback: (key: string, path: string) => void, prefix = ""): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => walkKeys(item, callback, `${prefix}[${i}]`));
    return;
  }
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    const path = prefix ? `${prefix}.${key}` : key;
    callback(key, path);
    walkKeys((obj as Record<string, unknown>)[key], callback, path);
  }
}
