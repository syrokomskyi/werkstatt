/**
 * PBP Catalog and CatalogEntry entities.
 *
 * @see pbp-specification-package/entity-model §13 (Catalog), §14 (CatalogEntry)
 * @see pbp-specification-package/system-spec §10 (Catalog and CatalogEntry)
 * @see RFC-0427
 */

import type { PbpEntity } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import { pbpSchemaId } from "../schema-id.js";

export const CATALOG_SCHEMA_ID = pbpSchemaId("catalog");
export const CATALOG_ENTRY_SCHEMA_ID = pbpSchemaId("catalog-entry");

export type PbpCatalogEntrySourceMode = "manifest-directory" | "dataset";

export const PBP_CATALOG_ENTRY_SOURCE_MODES: readonly PbpCatalogEntrySourceMode[] = [
  "manifest-directory",
  "dataset",
] as const;

export function isPbpCatalogEntrySourceMode(value: string): value is PbpCatalogEntrySourceMode {
  return PBP_CATALOG_ENTRY_SOURCE_MODES.includes(value as PbpCatalogEntrySourceMode);
}

export type PbpCatalogEntrySource =
  { mode: "manifest-directory"; logicalPath: string } | { mode: "dataset"; adapterRef: string };

export interface PbpCatalog extends PbpEntity {
  type: "catalog";
  name: string;
  businessRef: PbpEntityRef;
  entrySource: PbpCatalogEntrySource;
}

export interface PbpCatalogEntry extends PbpEntity {
  type: "catalog-entry";
  name: string;
  summary?: string;
  catalogRef: PbpEntityRef;
  itemRef: PbpEntityRef;
  localIdentifiers?: Record<string, string>;
  merchandising?: { featured?: boolean; displayOrder?: number };
  offeringRefs?: Record<string, PbpEntityRef>;
}
