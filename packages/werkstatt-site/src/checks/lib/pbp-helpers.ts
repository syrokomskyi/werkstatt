/*
<MODULE_CONTRACT>
<purpose>Shared helpers for PBP-related command handlers — flag parsing, entity lookup, ref resolution.</purpose>
<non-goals>
  <item>Does not define PBP types — those are in @warpgogol/werkstatt-site/pbp.</item>
  <item>Does not implement command logic — that is in the individual command handlers.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0741 — extracted shared helpers from rate-snapshot-resolve, currency-pricing-compile, and derived-prices-materialize.</item>
</CHANGE_SUMMARY>
*/

import type { KernelCommandInput } from "@warpgogol/werkstatt/kernel";
import type { PbpEntity } from "@warpgogol/werkstatt-site/pbp";
import type { PbpCurrencyPricingPolicy } from "@warpgogol/werkstatt-site/pbp";
import type { PbpRatePolicy, PbpRateSchedule } from "@warpgogol/werkstatt-site/pbp";

export function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

export function resolveRef(ref: unknown): string {
  if (typeof ref === "string") return ref;
  if (ref && typeof ref === "object" && "ref" in ref) {
    return (ref as { ref: string }).ref;
  }
  return "";
}

export function isCurrencyPricingPolicy(entity: PbpEntity): entity is PbpCurrencyPricingPolicy {
  return entity.type === "currency-pricing-policy";
}

export function isRatePolicy(entity: PbpEntity): entity is PbpRatePolicy {
  return entity.type === "rate-policy";
}

export function isRateSchedule(entity: PbpEntity): entity is PbpRateSchedule {
  return entity.type === "rate-schedule";
}

export function findCurrencyPricingPolicy(
  entityIndex: Map<string, PbpEntity>,
): PbpCurrencyPricingPolicy | undefined {
  for (const entity of entityIndex.values()) {
    if (isCurrencyPricingPolicy(entity)) return entity;
  }
  return undefined;
}

export function findRatePolicies(entityIndex: Map<string, PbpEntity>): PbpRatePolicy[] {
  const policies: PbpRatePolicy[] = [];
  for (const entity of entityIndex.values()) {
    if (isRatePolicy(entity)) policies.push(entity);
  }
  return policies;
}

export function findRateSchedules(
  entityIndex: Map<string, PbpEntity>,
): Map<string, PbpRateSchedule> {
  const schedules = new Map<string, PbpRateSchedule>();
  for (const entity of entityIndex.values()) {
    if (isRateSchedule(entity)) {
      schedules.set(entity.id, entity);
    }
  }
  return schedules;
}
