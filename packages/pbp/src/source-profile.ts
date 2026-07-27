/**
 * PBP source profile and adapter type definitions.
 *
 * @see pbp-specification-package/compiler §3.2 (Source adapters)
 * @see RFC-0402
 */

export type PbpSourceAdapterType =
  | "manifest-directory"
  | "jsonl-dataset"
  | "sql-adapter"
  | "external-api-adapter"
  | "runtime-overlay-adapter";

export const PBP_SOURCE_ADAPTER_TYPES: readonly PbpSourceAdapterType[] = [
  "manifest-directory",
  "jsonl-dataset",
  "sql-adapter",
  "external-api-adapter",
  "runtime-overlay-adapter",
] as const;

export function isPbpSourceAdapterType(value: string): value is PbpSourceAdapterType {
  return PBP_SOURCE_ADAPTER_TYPES.includes(value as PbpSourceAdapterType);
}

export interface PbpSourceProfile {
  type: PbpSourceAdapterType;
  path?: string;
  sourceRef?: string;
}
