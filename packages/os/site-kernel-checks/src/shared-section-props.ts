/*
<MODULE_CONTRACT>
<purpose>
[RFC-0110 + RFC-0119] Catalog-level validators for the shared section props
fragment catalog. Two commands:

  - shared.section-props.contract.validate — every catalog entry has at least
    `latest`; when `prior` is present, its schemaVersion is exactly one less
    than `latest`; no more than two adjacent versions per id.
  - shared.section-props.changelog.report — emit the current `latest`
    schemaVersion and changelog one-liner per fragment.
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
</CHANGE_SUMMARY>
*/

import { SHARED_SECTION_PROPS, sharedSectionPropsChangelog } from "@gogol/ontology";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";

interface CatalogViolation {
  fragment: string;
  rule: string;
  message: string;
  fix?: string;
}

export async function runSharedSectionPropsContractValidate(
  _input: KernelCommandInput,
  _context: KernelRuntimeContext,
): Promise<
  KernelCommandResult<{ command: string; status: "ok" | "fail"; violations: CatalogViolation[] }>
> {
  const command = "shared.section-props.contract.validate";
  const violations: CatalogViolation[] = [];
  for (const [id, entry] of Object.entries(SHARED_SECTION_PROPS)) {
    if (!entry.latest) {
      violations.push({
        fragment: id,
        rule: "CATALOG-01",
        message: "Catalog entry is missing the `latest` slot.",
        fix: "Populate `latest` with a fragment object including schemaVersion >= 1.",
      });
      continue;
    }
    if (
      typeof entry.latest.schemaVersion !== "number" ||
      !Number.isInteger(entry.latest.schemaVersion) ||
      entry.latest.schemaVersion < 1
    ) {
      violations.push({
        fragment: id,
        rule: "CATALOG-02",
        message: `latest.schemaVersion must be a positive integer; got ${String(entry.latest.schemaVersion)}.`,
        fix: "Set latest.schemaVersion to a positive integer starting from 1.",
      });
    }
    if (entry.prior) {
      if (
        typeof entry.prior.schemaVersion !== "number" ||
        !Number.isInteger(entry.prior.schemaVersion) ||
        entry.prior.schemaVersion < 1
      ) {
        violations.push({
          fragment: id,
          rule: "CATALOG-02",
          message: `prior.schemaVersion must be a positive integer; got ${String(entry.prior.schemaVersion)}.`,
          fix: "Set prior.schemaVersion to a positive integer.",
        });
      }
      if (
        typeof entry.prior.schemaVersion === "number" &&
        typeof entry.latest.schemaVersion === "number" &&
        entry.prior.schemaVersion !== entry.latest.schemaVersion - 1
      ) {
        violations.push({
          fragment: id,
          rule: "CATALOG-03",
          message: `prior.schemaVersion (${entry.prior.schemaVersion}) must be exactly latest.schemaVersion - 1 (${entry.latest.schemaVersion - 1}).`,
          fix: "Realign prior version or drop the prior slot when migration completes.",
        });
      }
    }
  }
  if (violations.length > 0) {
    return {
      exitCode: 1,
      data: { command, status: "fail", violations },
      summary: `FAIL - ${command} (${violations.length} violation${violations.length === 1 ? "" : "s"})`,
    };
  }
  return {
    exitCode: 0,
    data: { command, status: "ok", violations: [] },
    summary: `OK - ${command}`,
  };
}

export async function runSharedSectionPropsChangelogReport(
  _input: KernelCommandInput,
  _context: KernelRuntimeContext,
): Promise<
  KernelCommandResult<{
    command: string;
    status: "ok";
    entries: ReturnType<typeof sharedSectionPropsChangelog>;
  }>
> {
  const command = "shared.section-props.changelog.report";
  const entries = sharedSectionPropsChangelog();
  return {
    exitCode: 0,
    data: { command, status: "ok", entries },
    summary: `OK - ${command} (${entries.length} fragment${entries.length === 1 ? "" : "s"})`,
  };
}
