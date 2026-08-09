/*
<MODULE_CONTRACT>
<purpose>Validate structured offer capacity policy and frozen public availability safety.</purpose>
<non-goals>
  <item>Do not read private CRM data or compute admissions from external services.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0322: add offer.capacity.validate.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import { parseDocument } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import {
  calculateOfferCapacityState,
  type OfferCapacityPolicy,
} from "@warpgogol/werkstatt-site/share/offer-capacity";
import { diagnosticsResult } from "./result-helpers.ts";

const COMMAND = "offer.capacity.validate";

function frontmatter(raw: string): Record<string, unknown> {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const parsed = parseDocument(match[1] ?? "").toJSON();
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

function diagnostic(severity: Diagnostic["severity"], message: string, file?: string): Diagnostic {
  return { ruleId: COMMAND, severity, message, ...(file ? { file } : {}) };
}

function parseDurationDays(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(/^P(\d+)D$/);
  return match ? Number(match[1]) : undefined;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function pageContentContainsCapacityRef(appDir: string): Promise<boolean> {
  const root = join(appDir, "src", "content", "pages");
  const files = await collectFiles(root, { extensions: [".md"] });
  for (const file of files) {
    const text = await readText(file);
    if (text?.includes("business.offer.capacity")) {
      return true;
    }
  }
  return false;
}

export async function runOfferCapacityValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) {
    return diagnosticsResult(COMMAND, [
      diagnostic("error", `${COMMAND} must run inside an app context.`),
    ]);
  }

  const diagnostics: Diagnostic[] = [];
  const offerPath = join(app.directory, "src", "content", "business", "de", "offer.md");
  const raw = await readText(offerPath);
  if (!raw) return diagnosticsResult(COMMAND, diagnostics);
  const offer = frontmatter(raw);
  const capacity = offer.capacity as Record<string, unknown> | undefined;
  if (!capacity || capacity.enabled !== true) return diagnosticsResult(COMMAND, diagnostics);

  const slotRange = capacity.slotRange as Record<string, unknown> | undefined;
  const policy: OfferCapacityPolicy | null =
    typeof capacity.timezone === "string" &&
    typeof capacity.startsAt === "string" &&
    (capacity.cadence === "monthly" || capacity.cadence === "fixed-days") &&
    typeof slotRange?.min === "number" &&
    typeof slotRange.max === "number" &&
    typeof capacity.maxSlotsPerWave === "number"
      ? {
          timezone: capacity.timezone,
          startsAt: capacity.startsAt,
          cadence: capacity.cadence,
          ...(typeof capacity.cadenceDays === "number"
            ? { cadenceDays: capacity.cadenceDays }
            : {}),
          slotRange: { min: slotRange.min, max: slotRange.max },
          maxSlotsPerWave: capacity.maxSlotsPerWave,
        }
      : null;

  if (!policy) {
    diagnostics.push(
      diagnostic(
        "error",
        "capacity block is incomplete or has invalid primitive types.",
        "src/content/business-profile/de/offerings/",
      ),
    );
    return diagnosticsResult(COMMAND, diagnostics);
  }
  if (!isValidTimezone(policy.timezone))
    diagnostics.push(
      diagnostic(
        "error",
        `invalid timezone: ${policy.timezone}`,
        "src/content/business-profile/de/offerings/",
      ),
    );
  if (policy.slotRange.min > policy.slotRange.max)
    diagnostics.push(
      diagnostic(
        "error",
        "slotRange.min must be <= slotRange.max.",
        "src/content/business-profile/de/offerings/",
      ),
    );
  if (policy.maxSlotsPerWave < policy.slotRange.max)
    diagnostics.push(
      diagnostic(
        "error",
        "maxSlotsPerWave must be >= slotRange.max.",
        "src/content/business-profile/de/offerings/",
      ),
    );
  if (policy.cadence === "fixed-days" && !policy.cadenceDays)
    diagnostics.push(
      diagnostic(
        "error",
        "fixed-days cadence requires cadenceDays.",
        "src/content/business-profile/de/offerings/",
      ),
    );

  let activeWaveId = "";
  try {
    activeWaveId = calculateOfferCapacityState(policy).waveId;
  } catch (error) {
    diagnostics.push(
      diagnostic(
        "error",
        error instanceof Error ? error.message : String(error),
        "src/content/business-profile/de/offerings/",
      ),
    );
  }

  const reservations = capacity.reservations as Record<string, unknown> | undefined;
  const manual = reservations?.manual;
  if (Array.isArray(manual)) {
    for (const [index, item] of manual.entries()) {
      const reservation = item as Record<string, unknown>;
      if (reservation.waveId !== activeWaveId)
        diagnostics.push(
          diagnostic(
            "error",
            `manual reservation #${index + 1} is not for active wave ${activeWaveId}.`,
            "src/content/business-profile/de/offerings/",
          ),
        );
      if (
        typeof reservation.slots !== "number" ||
        reservation.slots < 0 ||
        reservation.slots > policy.maxSlotsPerWave
      )
        diagnostics.push(
          diagnostic(
            "error",
            `manual reservation #${index + 1} has slots outside 0..maxSlotsPerWave.`,
            "src/content/business-profile/de/offerings/",
          ),
        );
      const reviewDays = parseDurationDays(reservation.reviewEvery);
      if (typeof reservation.asOf !== "string" || Number.isNaN(Date.parse(reservation.asOf)))
        diagnostics.push(
          diagnostic(
            "error",
            `manual reservation #${index + 1} has invalid asOf.`,
            "src/content/business-profile/de/offerings/",
          ),
        );
      if (
        reviewDays !== undefined &&
        typeof reservation.asOf === "string" &&
        addDays(new Date(reservation.asOf), reviewDays) < new Date()
      )
        diagnostics.push(
          diagnostic(
            "error",
            `manual reservation #${index + 1} reviewEvery has expired.`,
            "src/content/business-profile/de/offerings/",
          ),
        );
    }
  } else if (reservations?.source === "bordbuch") {
    diagnostics.push(
      diagnostic(
        "warning",
        "capacity uses bordbuch reservations; no current reservation evidence is projected, so precise open slots stay withheld.",
        "src/content/business-profile/de/offerings/",
      ),
    );
  }

  if (!(await pageContentContainsCapacityRef(app.directory))) {
    diagnostics.push(
      diagnostic(
        "warning",
        "capacity is enabled but no page content references business.offer.capacity.",
        "src/content/pages",
      ),
    );
  }

  const agentOffer = await readText(
    join(app.directory, "public", "api", "agent", "v1", "offer.json"),
  );
  if (agentOffer?.includes('"openSlots"')) {
    diagnostics.push(
      diagnostic(
        "error",
        "generated agent offer knowledge exposes openSlots without current evidence.",
        "public/api/agent/v1/offer.json",
      ),
    );
  }

  return diagnosticsResult(COMMAND, diagnostics);
}
